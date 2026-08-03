import * as THREE from 'three';

/**
 * Orientarea telefonului, adusă la cadrul cerului.
 *
 * Cadrul de lucru e cel folosit în tot modul Cer: +X est, +Y sus, −Z nord.
 * Rezultatul e un quaternion pentru o „cameră" care privește prin spatele
 * telefonului — exact ce vezi dacă ridici telefonul spre cer.
 *
 * Trei lucruri fac diferența între o busolă care funcționează și una care minte:
 *
 *  1. `alpha` din `deviceorientation` are, pe multe dispozitive, un zero
 *     arbitrar. Doar `deviceorientationabsolute` (Android) și
 *     `webkitCompassHeading` (iOS) dau nordul adevărat. Le preferăm pe acelea,
 *     iar dacă nu există niciuna, spunem deschis că busola nu e calibrată.
 *  2. Rotația ecranului trebuie scăzută, altfel cerul se răstoarnă când
 *     telefonul trece în peisaj.
 *  3. Senzorii au zgomot de câteva grade. Fără netezire, stelele tremură.
 */

export type OrientationSource = 'absolute' | 'compass' | 'relative' | 'none';
export type PermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported';

const DEG = Math.PI / 180;
const OFFSET_KEY = 'lili-sat-heading-offset';

/** −90° pe X: camera privește prin spatele telefonului, nu prin ecran */
const Q_BACK = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

interface WebkitOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

export class SkyOrientation {
  /** ce citim în fiecare cadru */
  readonly quaternion = new THREE.Quaternion();

  source: OrientationSource = 'none';
  permission: PermissionState = 'unknown';
  /** precizia busolei raportată de iOS, grade; negativ = necalibrată */
  compassAccuracy: number | null = null;
  /** true cât timp folosim senzorii; false = privire manuală, cu degetul */
  sensor = false;

  /** corecție manuală de azimut, dacă busola bate alături */
  headingOffsetDeg = 0;

  onStatus: (() => void) | null = null;

  private target = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private tmpQ = new THREE.Quaternion();
  private manualAzDeg = 0;
  private manualAltDeg = 35;
  private started = false;
  private gotEvent = false;

  constructor() {
    try {
      const saved = Number.parseFloat(localStorage.getItem(OFFSET_KEY) ?? '');
      if (Number.isFinite(saved)) this.headingOffsetDeg = saved;
    } catch {
      /* stocarea poate fi blocată; corecția rămâne 0 */
    }
    this.applyManual();
    this.quaternion.copy(this.target);
  }

  static get supported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /**
   * iOS 13+ cere permisiune explicită, dintr-un gest al utilizatorului.
   * Pe restul platformelor evenimentele curg direct.
   */
  async requestPermission(): Promise<boolean> {
    if (!SkyOrientation.supported) {
      this.permission = 'unsupported';
      this.notify();
      return false;
    }
    const anyDOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof anyDOE.requestPermission === 'function') {
      try {
        const res = await anyDOE.requestPermission();
        this.permission = res === 'granted' ? 'granted' : 'denied';
      } catch {
        this.permission = 'denied';
      }
    } else {
      this.permission = 'granted';
    }
    this.notify();
    if (this.permission !== 'granted') return false;
    this.start();
    return true;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.sensor = true;
    window.addEventListener('deviceorientationabsolute', this.onOrientation as EventListener);
    window.addEventListener('deviceorientation', this.onOrientation as EventListener);
    // dacă în două secunde nu vine niciun eveniment, senzorul nu există aici
    window.setTimeout(() => {
      if (this.started && !this.gotEvent) {
        this.sensor = false;
        this.source = 'none';
        this.notify();
      }
    }, 2000);
    this.notify();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.sensor = false;
    window.removeEventListener('deviceorientationabsolute', this.onOrientation as EventListener);
    window.removeEventListener('deviceorientation', this.onOrientation as EventListener);
    this.notify();
  }

  /** Trecere la privire manuală (mouse / deget), păstrând direcția curentă */
  useManual() {
    const look = this.lookAltAz();
    this.manualAltDeg = look.altitudeDeg;
    this.manualAzDeg = look.azimuthDeg;
    this.sensor = false;
    this.applyManual();
    this.notify();
  }

  /** Rotire cu degetul, în pixeli, cu un factor de grade pe pixel */
  drag(dxPx: number, dyPx: number, degPerPx: number) {
    if (this.sensor) return;
    this.manualAzDeg = (((this.manualAzDeg - dxPx * degPerPx) % 360) + 360) % 360;
    this.manualAltDeg = Math.min(89, Math.max(-89, this.manualAltDeg + dyPx * degPerPx));
    this.applyManual();
  }

  setHeadingOffset(deg: number) {
    this.headingOffsetDeg = (((deg + 180) % 360) + 360) % 360 - 180;
    try {
      localStorage.setItem(OFFSET_KEY, String(this.headingOffsetDeg));
    } catch {
      /* fără persistență, corecția ține doar sesiunea curentă */
    }
    this.notify();
  }

  /**
   * Netezire exponențială spre ultima citire. `alpha` mic = cer liniștit dar
   * cu inerție; mare = reacție instantanee, dar tremur.
   */
  sample(alpha: number) {
    this.quaternion.slerp(this.target, Math.min(1, Math.max(0, alpha)));
  }

  /** Direcția în care e îndreptat telefonul acum */
  lookAltAz(): { altitudeDeg: number; azimuthDeg: number } {
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const alt = Math.asin(Math.min(1, Math.max(-1, v.y))) / DEG;
    const az = (((Math.atan2(v.x, -v.z) / DEG) % 360) + 360) % 360;
    return { altitudeDeg: alt, azimuthDeg: az };
  }

  private applyManual() {
    this.euler.set(this.manualAltDeg * DEG, -this.manualAzDeg * DEG, 0, 'YXZ');
    this.target.setFromEuler(this.euler);
  }

  private notify() {
    this.onStatus?.();
  }

  private onOrientation = (raw: Event) => {
    const ev = raw as WebkitOrientationEvent;
    if (ev.alpha === null && ev.webkitCompassHeading === undefined) return;
    if (!this.started || !this.sensor) return;

    const wasSource = this.source;
    let alpha = ev.alpha ?? 0;

    if (typeof ev.webkitCompassHeading === 'number' && !Number.isNaN(ev.webkitCompassHeading)) {
      // iOS: heading crește în sensul acelor de ceasornic de la nord, alpha invers
      alpha = 360 - ev.webkitCompassHeading;
      this.source = 'compass';
      this.compassAccuracy = ev.webkitCompassAccuracy ?? null;
    } else if (ev.absolute === true || raw.type === 'deviceorientationabsolute') {
      this.source = 'absolute';
    } else if (this.source !== 'absolute' && this.source !== 'compass') {
      // ultima variantă: unghiuri relative, cu nordul necunoscut
      this.source = 'relative';
    } else {
      // avem deja o sursă absolută; ignorăm evenimentul relativ care o dublează
      return;
    }

    this.gotEvent = true;
    const screenAngle =
      (typeof screen !== 'undefined' && screen.orientation?.angle) ||
      ((window as unknown as { orientation?: number }).orientation ?? 0);

    this.euler.set(
      (ev.beta ?? 0) * DEG,
      (alpha + this.headingOffsetDeg) * DEG,
      -(ev.gamma ?? 0) * DEG,
      'YXZ'
    );
    this.target.setFromEuler(this.euler);
    this.target.multiply(Q_BACK);
    this.target.multiply(this.tmpQ.setFromAxisAngle(AXIS_Z, -screenAngle * DEG));

    if (wasSource !== this.source) this.notify();
  };
}

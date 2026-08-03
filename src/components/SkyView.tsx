import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { SatStore } from '../lib/data';
import type { CategoryId } from '../lib/types';
import { EARTH_RADIUS_KM, isSunlit, latLonToVec3, lookAngles, sunDirection, sunElevation } from '../lib/astro';
import { estimateMagnitude } from '../lib/passes';
import { altAzToVector, bvColor, localSiderealDeg, moonRaDec, raDecToAltAz, sunRaDec } from '../lib/sky';
import { CONSTELLATIONS, STARS, STAR_NAMES } from '../lib/skyCatalog';
import { SkyOrientation } from '../lib/orientation';
import { useI18n } from '../lib/i18n';

/**
 * Modul Cer: ridici telefonul și vezi ce e deasupra ta.
 *
 * Ideea e simplă și de asta trebuie să fie exactă — dacă îndrepți telefonul
 * spre un punct de pe cer, punctul de pe ecran trebuie să fie același. Ca să
 * ai un reper că e așa, desenăm și cerul real: stelele până la magnitudinea
 * 5,2 și figurile constelațiilor. Dacă Ursa Mare de pe ecran se suprapune peste
 * Ursa Mare de pe cer, atunci și satelitul de pe ecran e acolo unde arată.
 *
 * Randăm pe canvas 2D, nu în WebGL: proiecția e o împărțire pe cadru și un
 * produs scalar per obiect, iar textul iese curat fără atlas de caractere.
 */

/** câmpul vizual vertical de pornire — apropiat de ce cuprinde ochiul */
const FOV_DEFAULT = 62;
const FOV_MIN = 22;
const FOV_MAX = 110;
/** peste acest unghi față de centru considerăm că „ai prins" obiectul */
const LOCK_DEG = 6;
/**
 * Pragul ochiului liber. Sub cer bun se văd stele până spre 6; în oraș, spre 4.
 * Fără el, orice satelit luminat de Soare ar fi marcat „se vede", ceea ce e fals
 * pentru cele mai multe dintre miile de Starlink-uri.
 */
const NAKED_EYE_MAG = 6;
/** cât de des recalculăm pozițiile pe cer (ms) — sub un grad de mișcare */
const RECOMPUTE_MS = 120;

const DEG = Math.PI / 180;

interface SkyTarget {
  index: number;
  altitudeDeg: number;
  azimuthDeg: number;
}

/** Ce trece din bucla de desen în interfața React, de patru ori pe secundă */
interface SkyHud {
  above: number;
  eye: number;
  sunEl: number;
  target: null | {
    name: string;
    alt: number;
    az: number;
    /** cât trebuie să te rotești și să ridici telefonul, grade */
    dAz: number;
    dAlt: number;
    onScreen: boolean;
  };
}

interface Props {
  store: SatStore | null;
  observer: { lat: number; lon: number } | null;
  simTimeRef: { current: number };
  selected: number | null;
  visibleCats: Set<CategoryId>;
  onSelect: (index: number | null) => void;
  onNeedLocation: () => void;
  onClose: () => void;
}

export function SkyView({
  store,
  observer,
  simTimeRef,
  selected,
  visibleCats,
  onSelect,
  onNeedLocation,
  onClose,
}: Props) {
  const { t, num, compass } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // o singură instanță pe viața componentei: ține abonamentele la senzori
  const [orient] = useState(() => new SkyOrientation());
  const fovRef = useRef(FOV_DEFAULT);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const [status, setStatus] = useState(0); // ticăie la schimbarea sursei de orientare
  const [hud, setHud] = useState<SkyHud>({ above: 0, eye: 0, sunEl: 0, target: null });
  const [showCalib, setShowCalib] = useState(false);
  const [fov, setFov] = useState(FOV_DEFAULT);

  // --- geometrie precalculată, reîmprospătată rar ---
  const cache = useRef({
    lst: -999,
    obsLat: 999,
    obsLon: 999,
    starVec: new Float32Array(0),
    conVec: [] as Float32Array[],
    conLabel: [] as { v: THREE.Vector3; text: string }[],
    starLabel: [] as { i: number; text: string }[],
    moon: { v: new THREE.Vector3(), illum: 0 },
    sun: { v: new THREE.Vector3(), altDeg: -90 },
    satIdx: new Int32Array(0),
    satVec: new Float32Array(0),
    satLit: new Uint8Array(0),
    satMag: new Float32Array(0),
    obsVec: new THREE.Vector3(),
    satCount: 0,
    eyeCount: 0,
    sunElObs: -90,
    lastSat: 0,
  });

  /** Stelele și figurile se rotesc odată cu cerul: le recalculăm doar când contează */
  const refreshSky = useCallback(
    (lstDeg: number, lat: number, when: Date) => {
      const c = cache.current;
      const n = STARS.length / 4;
      if (c.starVec.length !== n * 3) c.starVec = new Float32Array(n * 3);
      const tmp: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const { altitudeDeg, azimuthDeg } = raDecToAltAz(STARS[i * 4], STARS[i * 4 + 1], lat, lstDeg);
        altAzToVector(altitudeDeg, azimuthDeg, tmp);
        c.starVec[i * 3] = tmp[0];
        c.starVec[i * 3 + 1] = tmp[1];
        c.starVec[i * 3 + 2] = tmp[2];
      }

      if (c.conVec.length === 0) c.conVec = CONSTELLATIONS.flatMap((k) => k.segs.map((s) => new Float32Array((s.length / 2) * 3)));
      let seg = 0;
      for (const k of CONSTELLATIONS) {
        for (const s of k.segs) {
          const out = c.conVec[seg++];
          for (let p = 0; p < s.length / 2; p++) {
            const { altitudeDeg, azimuthDeg } = raDecToAltAz(s[p * 2], s[p * 2 + 1], lat, lstDeg);
            altAzToVector(altitudeDeg, azimuthDeg, tmp);
            out[p * 3] = tmp[0];
            out[p * 3 + 1] = tmp[1];
            out[p * 3 + 2] = tmp[2];
          }
        }
      }

      c.conLabel = CONSTELLATIONS.map((k) => {
        const { altitudeDeg, azimuthDeg } = raDecToAltAz(k.ra, k.dec, lat, lstDeg);
        altAzToVector(altitudeDeg, azimuthDeg, tmp);
        return { v: new THREE.Vector3(tmp[0], tmp[1], tmp[2]), text: k.la };
      });
      c.starLabel = STAR_NAMES.map(([i, text]) => ({ i, text }));

      const m = moonRaDec(when);
      const ma = raDecToAltAz(m.raDeg, m.decDeg, lat, lstDeg);
      altAzToVector(ma.altitudeDeg, ma.azimuthDeg, tmp);
      c.moon.v.set(tmp[0], tmp[1], tmp[2]);
      c.moon.illum = m.illuminated;

      const s = sunRaDec(when);
      const sa = raDecToAltAz(s.raDeg, s.decDeg, lat, lstDeg);
      altAzToVector(sa.altitudeDeg, sa.azimuthDeg, tmp);
      c.sun.v.set(tmp[0], tmp[1], tmp[2]);
      c.sun.altDeg = sa.altitudeDeg;
    },
    []
  );

  /** Ce e deasupra orizontului acum, cu marcaj pentru „se vede cu ochiul liber" */
  const refreshSats = useCallback(
    (lat: number, lon: number, when: Date) => {
      const c = cache.current;
      if (!store) {
        c.satCount = 0;
        return;
      }
      const n = store.size;
      if (c.satIdx.length < n) {
        c.satIdx = new Int32Array(n);
        c.satVec = new Float32Array(n * 3);
        c.satLit = new Uint8Array(n);
        c.satMag = new Float32Array(n);
      }
      const sun = sunDirection(when, new THREE.Vector3());
      c.sunElObs = sunElevation(lat, lon, sun);
      const dark = c.sunElObs < -6;
      const p = store.positions;
      const obs = latLonToVec3(lat, lon, 1, c.obsVec);
      const tmp: [number, number, number] = [0, 0, 0];
      let k = 0;
      let eye = 0;
      for (let i = 0; i < n; i++) {
        if (!store.valid[i]) continue;
        if (visibleCats.size > 0 && !visibleCats.has(store.entries[i].category)) continue;
        const la = lookAngles(lat, lon, store.geoLat[i], store.geoLon[i], store.geoAlt[i]);
        if (la.elevationDeg < -1) continue;
        altAzToVector(la.elevationDeg, la.azimuthDeg, tmp);
        c.satIdx[k] = i;
        c.satVec[k * 3] = tmp[0];
        c.satVec[k * 3 + 1] = tmp[1];
        c.satVec[k * 3 + 2] = tmp[2];

        // Cât de tare strălucește: distanța până la el și unghiul de fază
        // Soare–satelit–observator. Aceeași estimare ca la panoul de treceri.
        const dx = obs.x - p[i * 3];
        const dy = obs.y - p[i * 3 + 1];
        const dz = obs.z - p[i * 3 + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const cosPhase = (dx * sun.x + dy * sun.y + dz * sun.z) / d;
        const mag = estimateMagnitude(
          store.entries[i].category,
          d * EARTH_RADIUS_KM,
          Math.acos(Math.min(1, Math.max(-1, cosPhase)))
        );
        c.satMag[k] = mag;

        const lit = isSunlit(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], sun.x, sun.y, sun.z);
        c.satLit[k] = lit && dark && mag <= NAKED_EYE_MAG ? 1 : 0;
        if (c.satLit[k]) eye++;
        k++;
      }
      c.satCount = k;
      c.eyeCount = eye;
    },
    [store, visibleCats]
  );

  /** Poziția pe cer a unui satelit anume, chiar dacă e sub orizont */
  const targetAltAz = useCallback(
    (index: number, lat: number, lon: number): SkyTarget | null => {
      if (!store || !store.valid[index]) return null;
      const la = lookAngles(lat, lon, store.geoLat[index], store.geoLon[index], store.geoAlt[index]);
      return { index, altitudeDeg: la.elevationDeg, azimuthDeg: la.azimuthDeg };
    },
    [store]
  );

  useEffect(() => {
    orient.onStatus = () => setStatus((v) => v + 1);
    // pe telefoanele care nu cer permisiune (Android), pornim direct
    if (SkyOrientation.supported && orient.permission === 'unknown') {
      const anyDOE = DeviceOrientationEvent as unknown as { requestPermission?: unknown };
      if (typeof anyDOE.requestPermission !== 'function') {
        orient.permission = 'granted';
        orient.start();
      }
    }
    return () => {
      orient.onStatus = null;
      orient.stop();
    };
  }, [orient]);

  // --- bucla de desen ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let locked = false;

    // punct de inspecție pentru dezvoltare: ce vede efectiv bucla de desen
    const probe = import.meta.env.DEV
      ? {
          frames: 0,
          lat: 0,
          lon: 0,
          hasStore: false,
          satCount: 0,
          eyeCount: 0,
          cache: cache.current,
          orient,
          store,
          setFov: (v: number) => {
            fovRef.current = v;
          },
          draw: () => {},
        }
      : null;
    if (probe) (window as unknown as Record<string, unknown>).__sky = probe;

    // HUD-ul e React: la 60 Hz ar re-randa panourile de patru ori pe cadru util
    let lastHud = 0;
    let pendingHud: SkyHud | null = null;
    const setHudThrottled = (next: SkyHud) => {
      pendingHud = next;
      if (performance.now() - lastHud < 250) return;
      lastHud = performance.now();
      setHud(pendingHud);
    };

    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const v = new THREE.Vector3();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      return { w, h, dpr };
    };

    /** Un singur cadru desenat. Separat de bucla rAF ca să poată fi chemat și
     *  sincron, de unelte care randează cadru cu cadru (capturile video). */
    const draw = () => {
      const { w, h, dpr } = resize();
      if (w === 0 || h === 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const c = cache.current;
      const now = new Date(simTimeRef.current);
      const lat = observer?.lat ?? 0;
      const lon = observer?.lon ?? 0;
      if (probe) {
        probe.frames++;
        probe.lat = lat;
        probe.lon = lon;
        probe.hasStore = !!store;
        probe.satCount = c.satCount;
        probe.eyeCount = c.eyeCount;
      }

      if (observer) {
        const lst = localSiderealDeg(now, lon);
        // cerul se rotește cu 0,004°/s: o reîmprospătare la 5° e nesesizabilă,
        // dar ne scutește de 2.000 de conversii pe cadru
        if (Math.abs(lst - c.lst) > 0.05 || lat !== c.obsLat || lon !== c.obsLon) {
          refreshSky(lst, lat, now);
          c.lst = lst;
          c.obsLat = lat;
          c.obsLon = lon;
        }
        if (performance.now() - c.lastSat > RECOMPUTE_MS) {
          refreshSats(lat, lon, now);
          c.lastSat = performance.now();
        }
      }

      orient.sample(orient.sensor ? 0.22 : 0.35);
      fwd.set(0, 0, -1).applyQuaternion(orient.quaternion);
      right.set(1, 0, 0).applyQuaternion(orient.quaternion);
      up.set(0, 1, 0).applyQuaternion(orient.quaternion);

      const fovRad = fovRef.current * DEG;
      const f = h / 2 / Math.tan(fovRad / 2);
      const cx = w / 2;
      const cy = h / 2;
      const zoom = FOV_DEFAULT / fovRef.current;

      // --- fundal, după cât de sus e Soarele ---
      const sunEl = c.sunElObs;
      const day = Math.min(1, Math.max(0, (sunEl + 12) / 18));
      ctx.fillStyle = `rgb(${Math.round(3 + 92 * day)},${Math.round(5 + 130 * day)},${Math.round(14 + 190 * day)})`;
      ctx.fillRect(0, 0, w, h);

      // --- solul: planul orizontului se proiectează într-o dreaptă ---
      const A = right.y;
      const B = -up.y;
      const C = fwd.y * f - right.y * cx + up.y * cy;
      const nrm = Math.hypot(A, B);
      if (nrm < 1e-6) {
        // privire exact spre zenit sau spre nadir
        if (C < 0) {
          ctx.fillStyle = 'rgba(2,4,10,0.92)';
          ctx.fillRect(0, 0, w, h);
        }
      } else {
        const L = (w + h) * 2;
        const dx = -B / nrm;
        const dy = A / nrm;
        // punctul de pe dreaptă cel mai apropiat de centrul ecranului
        const dist = (A * cx + B * cy + C) / nrm;
        const px = cx - (A / nrm) * dist;
        const py = cy - (B / nrm) * dist;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(px + dx * L, py + dy * L);
        ctx.lineTo(px - dx * L, py - dy * L);
        ctx.lineTo(px - dx * L - (A / nrm) * L, py - dy * L - (B / nrm) * L);
        ctx.lineTo(px + dx * L - (A / nrm) * L, py + dy * L - (B / nrm) * L);
        ctx.closePath();
        ctx.fillStyle = day > 0.4 ? 'rgba(18,26,34,0.94)' : 'rgba(2,4,9,0.94)';
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = 'rgba(120,190,255,0.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px + dx * L, py + dy * L);
        ctx.lineTo(px - dx * L, py - dy * L);
        ctx.stroke();
      }

      /** proiecție: null dacă e în spatele observatorului */
      const proj = (vec: { x: number; y: number; z: number }): [number, number] | null => {
        const z = vec.x * fwd.x + vec.y * fwd.y + vec.z * fwd.z;
        if (z <= 0.02) return null;
        const xx = vec.x * right.x + vec.y * right.y + vec.z * right.z;
        const yy = vec.x * up.x + vec.y * up.y + vec.z * up.z;
        return [cx + (xx / z) * f, cy - (yy / z) * f];
      };
      const projRaw = (x: number, y: number, z: number): [number, number] | null => {
        v.set(x, y, z);
        return proj(v);
      };

      if (observer) {
        // --- figurile constelațiilor ---
        ctx.strokeStyle = day > 0.35 ? 'rgba(255,255,255,0.10)' : 'rgba(140,190,255,0.24)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const seg of c.conVec) {
          let pen = false;
          for (let p = 0; p < seg.length / 3; p++) {
            const s = projRaw(seg[p * 3], seg[p * 3 + 1], seg[p * 3 + 2]);
            if (!s) {
              pen = false;
              continue;
            }
            if (pen) ctx.lineTo(s[0], s[1]);
            else ctx.moveTo(s[0], s[1]);
            pen = true;
          }
        }
        ctx.stroke();

        // --- numele constelațiilor ---
        ctx.fillStyle = day > 0.35 ? 'rgba(255,255,255,0.22)' : 'rgba(150,200,255,0.4)';
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (const l of c.conLabel) {
          const s = proj(l.v);
          if (s && s[0] > -40 && s[0] < w + 40 && s[1] > -20 && s[1] < h + 20) ctx.fillText(l.text, s[0], s[1]);
        }

        // --- stelele ---
        const starFade = Math.max(0, 1 - day * 1.35);
        if (starFade > 0.02) {
          const n = STARS.length / 4;
          for (let i = 0; i < n; i++) {
            const s = projRaw(c.starVec[i * 3], c.starVec[i * 3 + 1], c.starVec[i * 3 + 2]);
            if (!s || s[0] < -8 || s[0] > w + 8 || s[1] < -8 || s[1] > h + 8) continue;
            const mag = STARS[i * 4 + 2];
            const r = Math.max(0.7, (3.5 - mag * 0.5) * Math.sqrt(zoom));
            ctx.globalAlpha = Math.min(1, Math.max(0.16, 1.15 - mag * 0.13)) * starFade;
            ctx.fillStyle = bvColor(STARS[i * 4 + 3]);
            ctx.beginPath();
            ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = starFade * 0.75;
          ctx.fillStyle = 'rgba(220,235,255,0.9)';
          ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
          for (const l of c.starLabel) {
            const s = projRaw(c.starVec[l.i * 3], c.starVec[l.i * 3 + 1], c.starVec[l.i * 3 + 2]);
            if (s && s[0] > 0 && s[0] < w && s[1] > 0 && s[1] < h) ctx.fillText(l.text, s[0], s[1] - 9);
          }
          ctx.globalAlpha = 1;
        }

        // --- Luna ---
        const ms = proj(c.moon.v);
        if (ms) {
          const rad = Math.max(7, (0.52 / fovRef.current) * h * 1.6);
          ctx.fillStyle = 'rgba(20,24,34,0.9)';
          ctx.beginPath();
          ctx.arc(ms[0], ms[1], rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(245,242,225,${0.35 + 0.65 * c.moon.illum})`;
          ctx.beginPath();
          ctx.arc(ms[0], ms[1], rad * (0.35 + 0.65 * c.moon.illum), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(240,235,215,0.75)';
          ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
          ctx.fillText(t('skyMoon'), ms[0], ms[1] + rad + 12);
        }

        // --- Soarele ---
        const ss = proj(c.sun.v);
        if (ss) {
          const rad = Math.max(8, (0.53 / fovRef.current) * h * 1.6);
          const g = ctx.createRadialGradient(ss[0], ss[1], 0, ss[0], ss[1], rad * 3);
          g.addColorStop(0, 'rgba(255,244,190,0.95)');
          g.addColorStop(1, 'rgba(255,220,120,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ss[0], ss[1], rad * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // --- rețeaua de altitudini și azimuturi ---
      ctx.strokeStyle = 'rgba(130,190,255,0.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const alt of [30, 60]) {
        let pen = false;
        for (let a = 0; a <= 360; a += 4) {
          const t3: [number, number, number] = [0, 0, 0];
          altAzToVector(alt, a, t3);
          const s = projRaw(t3[0], t3[1], t3[2]);
          if (!s) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(s[0], s[1]);
          else ctx.moveTo(s[0], s[1]);
          pen = true;
        }
      }
      for (let a = 0; a < 360; a += 45) {
        let pen = false;
        for (let alt = 0; alt <= 88; alt += 4) {
          const t3: [number, number, number] = [0, 0, 0];
          altAzToVector(alt, a, t3);
          const s = projRaw(t3[0], t3[1], t3[2]);
          if (!s) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(s[0], s[1]);
          else ctx.moveTo(s[0], s[1]);
          pen = true;
        }
      }
      ctx.stroke();

      // --- punctele cardinale, pe orizont ---
      ctx.textAlign = 'center';
      for (let a = 0; a < 360; a += 45) {
        const t3: [number, number, number] = [0, 0, 0];
        altAzToVector(1.5, a, t3);
        const s = projRaw(t3[0], t3[1], t3[2]);
        if (!s) continue;
        const major = a % 90 === 0;
        ctx.fillStyle = major ? 'rgba(190,225,255,0.95)' : 'rgba(150,190,225,0.5)';
        ctx.font = `${major ? '600 15px' : '11px'} ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(compass(a), s[0], s[1]);
      }

      // --- sateliții ---
      const sel = selectedRef.current;
      if (observer && store) {
        for (let k = 0; k < c.satCount; k++) {
          const s = projRaw(c.satVec[k * 3], c.satVec[k * 3 + 1], c.satVec[k * 3 + 2]);
          if (!s || s[0] < -6 || s[0] > w + 6 || s[1] < -6 || s[1] > h + 6) continue;
          const eye = c.satLit[k] === 1;
          ctx.beginPath();
          if (eye) {
            // cât de mare e punctul urmează magnitudinea, ca la stele:
            // un obiect de magnitudinea 1 e vizibil altfel decât unul de 5
            const r = Math.max(1.8, 4.2 - c.satMag[k] * 0.42) * Math.sqrt(zoom);
            ctx.fillStyle = 'rgba(255,246,214,0.98)';
            ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,225,140,0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(s[0], s[1], r * 2, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.fillStyle = 'rgba(110,190,255,0.42)';
            ctx.arc(s[0], s[1], 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // --- obiectul urmărit: reticul, etichetă, săgeată spre el ---
      let hudTarget: SkyHud['target'] = null;
      if (observer && sel !== null && store) {
        const tg = targetAltAz(sel, lat, lon);
        if (tg) {
          const t3: [number, number, number] = [0, 0, 0];
          altAzToVector(tg.altitudeDeg, tg.azimuthDeg, t3);
          v.set(t3[0], t3[1], t3[2]);
          const z = v.dot(fwd);
          const sx = v.dot(right);
          const sy = v.dot(up);
          const s = z > 0.02 ? ([cx + (sx / z) * f, cy - (sy / z) * f] as [number, number]) : null;
          const tgtBehind = z <= 0.02;
          const onScreen = !!s && s[0] > 12 && s[0] < w - 12 && s[1] > 12 && s[1] < h - 12;
          if (s && onScreen) {
            ctx.strokeStyle = 'rgba(120,255,190,0.95)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(s[0], s[1], 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            for (const [x1, y1, x2, y2] of [
              [0, -26, 0, -20],
              [0, 20, 0, 26],
              [-26, 0, -20, 0],
              [20, 0, 26, 0],
            ]) {
              ctx.moveTo(s[0] + x1, s[1] + y1);
              ctx.lineTo(s[0] + x2, s[1] + y2);
            }
            ctx.stroke();
            ctx.fillStyle = 'rgba(150,255,205,0.98)';
            ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(store.entries[sel].name, s[0], s[1] - 26);
          } else {
            // în afara cadrului: o săgeată la marginea ecranului, spre el
            let dirX = sx;
            let dirY = -sy;
            if (tgtBehind) {
              // în spate: direcția pe ecran se inversează
              dirX = -dirX;
              dirY = -dirY;
            }
            const len = Math.hypot(dirX, dirY) || 1;
            dirX /= len;
            dirY /= len;
            const rad = Math.min(w, h) * 0.34;
            const ax = cx + dirX * rad;
            const ay = cy + dirY * rad;
            const ang = Math.atan2(dirY, dirX);
            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(ang);
            ctx.fillStyle = 'rgba(120,255,190,0.92)';
            ctx.beginPath();
            ctx.moveTo(20, 0);
            ctx.lineTo(-12, -13);
            ctx.lineTo(-6, 0);
            ctx.lineTo(-12, 13);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }

          const look = orient.lookAltAz();
          let dAz = tg.azimuthDeg - look.azimuthDeg;
          dAz = ((((dAz + 180) % 360) + 360) % 360) - 180;
          const dAlt = tg.altitudeDeg - look.altitudeDeg;
          hudTarget = {
            name: store.entries[sel].name,
            alt: tg.altitudeDeg,
            az: tg.azimuthDeg,
            dAz,
            dAlt,
            onScreen,
          };

          // scurtă vibrație când obiectul ajunge în centru
          const off = Math.hypot(dAz * Math.cos(tg.altitudeDeg * DEG), dAlt);
          if (off < LOCK_DEG && !locked) {
            locked = true;
            navigator.vibrate?.(35);
          } else if (off > LOCK_DEG * 1.8) {
            locked = false;
          }
        }
      }

      // --- reticulul central, ca reper de „unde e îndreptat telefonul" ---
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.stroke();

      setHudThrottled({ above: c.satCount, eye: c.eyeCount, sunEl: c.sunElObs, target: hudTarget });
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      draw();
    };
    if (probe) probe.draw = draw;
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [observer, store, simTimeRef, orient, refreshSky, refreshSats, targetAltAz, t, compass]);

  // --- interacțiune: trage ca să privești, apasă ca să alegi ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let dragging = false;

    const down = (e: PointerEvent) => {
      dragging = true;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging || orient.sensor) return;
      orient.drag(e.clientX - lastX, e.clientY - lastY, fovRef.current / canvas.clientHeight);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const upEv = (e: PointerEvent) => {
      dragging = false;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      pick(e.clientX, e.clientY);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = Math.min(FOV_MAX, Math.max(FOV_MIN, fovRef.current * Math.exp(e.deltaY * (e.ctrlKey ? 0.008 : 0.0022))));
      fovRef.current = next;
      setFov(Math.round(next));
    };

    /** cel mai apropiat obiect de punctul atins, în raza de 34 px */
    const pick = (clientX: number, clientY: number) => {
      const c = cache.current;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(orient.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orient.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orient.quaternion);
      const f = h / 2 / Math.tan(fovRef.current * DEG / 2);
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      let best = -1;
      let bestD = 34;
      for (let k = 0; k < c.satCount; k++) {
        const x = c.satVec[k * 3];
        const y = c.satVec[k * 3 + 1];
        const z = c.satVec[k * 3 + 2];
        const zz = x * fwd.x + y * fwd.y + z * fwd.z;
        if (zz <= 0.02) continue;
        const sx = w / 2 + ((x * right.x + y * right.y + z * right.z) / zz) * f;
        const sy = h / 2 - ((x * up.x + y * up.y + z * up.z) / zz) * f;
        const d = Math.hypot(sx - mx, sy - my);
        if (d < bestD) {
          bestD = d;
          best = c.satIdx[k];
        }
      }
      onSelect(best >= 0 ? best : null);
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', upEv);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', upEv);
      canvas.removeEventListener('wheel', wheel);
    };
  }, [orient, onSelect]);

  const dark = hud.sunEl < -6;
  const skyState = hud.sunEl > 0 ? t('skyDay') : dark ? t('skyDark') : t('skyTwilight');
  const needsPermission =
    SkyOrientation.supported && !orient.sensor && orient.permission !== 'denied' && orient.source === 'none';

  const guidance = useMemo(() => {
    const tg = hud.target;
    if (!tg) return null;
    if (tg.alt < 0) return t('skyBelowHorizon');
    if (tg.onScreen) return t('skyOnScreen');
    const parts: string[] = [];
    if (Math.abs(tg.dAz) > 4)
      parts.push(t(tg.dAz > 0 ? 'skyTurnRight' : 'skyTurnLeft', { deg: Math.round(Math.abs(tg.dAz)) }));
    if (Math.abs(tg.dAlt) > 4)
      parts.push(t(tg.dAlt > 0 ? 'skyRaise' : 'skyLower', { deg: Math.round(Math.abs(tg.dAlt)) }));
    return parts.join(' · ') || t('skyOnScreen');
  }, [hud.target, t]);

  return (
    <div className="absolute inset-0 z-[15] bg-[#02030a]">
      <canvas ref={canvasRef} className="h-full w-full touch-none select-none" />

      {!observer && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-black/85 p-5 text-center backdrop-blur-xl">
            <div className="text-2xl">🧭</div>
            <div className="mt-2 text-sm font-semibold text-white">{t('skyNeedLocation')}</div>
            <div className="mt-1 text-xs text-slate-400">{t('skyNeedLocationHint')}</div>
            <button
              onClick={onNeedLocation}
              className="mt-4 w-full rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 py-2 text-xs font-medium text-amber-200"
            >
              {t('useMyLocation')}
            </button>
          </div>
        </div>
      )}

      {/* starea cerului, sus */}
      {observer && (
        <div className="pointer-events-none absolute top-16 right-3 left-3 flex flex-wrap items-center justify-center gap-2 sm:top-20">
          <span className="rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] text-slate-300 backdrop-blur-md">
            {skyState} · {t('skySunEl', { deg: hud.sunEl.toFixed(0) })}
          </span>
          <span className="rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] text-slate-300 backdrop-blur-md">
            {t('skyAbove', { n: num(hud.above) })}
          </span>
          <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200 backdrop-blur-md">
            {t('skyEye', { n: num(hud.eye) })}
          </span>
        </div>
      )}

      {/* indicații către obiectul urmărit */}
      {hud.target && (
        <div className="pointer-events-none absolute right-3 bottom-28 left-3 flex justify-center sm:bottom-32">
          <div className="max-w-sm rounded-xl border border-emerald-300/25 bg-black/80 px-4 py-3 text-center backdrop-blur-xl">
            <div className="text-sm font-semibold text-white">{hud.target.name}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {t('elevation')} {hud.target.alt.toFixed(0)}° · {t('azimuth')} {hud.target.az.toFixed(0)}°{' '}
              {compass(hud.target.az)}
            </div>
            <div className="mt-1.5 text-xs font-medium text-emerald-300">{guidance}</div>
          </div>
        </div>
      )}

      {/* comenzi, jos */}
      <div className="absolute right-3 bottom-4 left-3 flex flex-wrap items-center justify-center gap-2">
        {needsPermission && (
          <button
            onClick={() => orient.requestPermission()}
            className="rounded-lg border border-cyan-400/40 bg-cyan-400/15 px-3 py-2 text-xs font-medium text-cyan-200 backdrop-blur-md"
          >
            {t('skyEnableCompass')}
          </button>
        )}
        {orient.sensor && (
          <button
            onClick={() => {
              orient.useManual();
              setStatus((v) => v + 1);
            }}
            className="rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-slate-300 backdrop-blur-md"
          >
            {t('skyManualLook')}
          </button>
        )}
        {!orient.sensor && SkyOrientation.supported && orient.permission !== 'denied' && (
          <button
            onClick={() => orient.requestPermission()}
            className="rounded-lg border border-cyan-400/40 bg-cyan-400/15 px-3 py-2 text-xs font-medium text-cyan-200 backdrop-blur-md"
          >
            {t('skyUseGyro')}
          </button>
        )}
        <button
          onClick={() => setShowCalib((v) => !v)}
          className="rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-slate-300 backdrop-blur-md"
        >
          {t('skyCalibrate')}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-slate-300 backdrop-blur-md"
        >
          {t('skyExit')}
        </button>
      </div>

      {showCalib && (
        <div className="absolute right-3 bottom-20 left-3 mx-auto max-w-sm rounded-xl border border-white/15 bg-black/85 p-4 backdrop-blur-xl">
          <div className="text-xs font-semibold text-white">{t('skyCalibTitle')}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {orient.source === 'relative' ? t('skyCompassRelative') : t('skyCalibHint')}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={orient.headingOffsetDeg}
              onChange={(e) => {
                orient.setHeadingOffset(Number(e.target.value));
                setStatus((v) => v + 1);
              }}
              className="w-full accent-cyan-400"
            />
            <span className="w-12 shrink-0 text-right text-xs text-cyan-300">
              {orient.headingOffsetDeg > 0 ? '+' : ''}
              {orient.headingOffsetDeg}°
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="shrink-0 text-[11px] text-slate-400">{t('skyFov')}</span>
            <input
              type="range"
              min={FOV_MIN}
              max={FOV_MAX}
              step={1}
              value={fov}
              onChange={(e) => {
                fovRef.current = Number(e.target.value);
                setFov(Number(e.target.value));
              }}
              className="w-full accent-cyan-400"
            />
            <span className="w-12 shrink-0 text-right text-xs text-cyan-300">{fov}°</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            {t('skySourceLabel')}: {t(`skySource_${orient.source}` as 'skySource_none')}
          </div>
        </div>
      )}

      {/* cheia de citire, discretă */}
      <div className="pointer-events-none absolute bottom-16 left-3 hidden text-[10px] leading-relaxed text-slate-500 sm:block">
        <div>
          <span className="text-amber-200">●</span> {t('skyLegendEye')}
        </div>
        <div>
          <span className="text-sky-400">●</span> {t('skyLegendDim')}
        </div>
      </div>

      <span className="hidden">{status}</span>
    </div>
  );
}

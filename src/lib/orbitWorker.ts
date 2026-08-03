import type { SatelliteEntry } from './types';
import type { Observer, SatellitePass } from './passes';

export interface SnapshotBuffers {
  positions: Float32Array;
  geoLat: Float32Array;
  geoLon: Float32Array;
  geoAlt: Float32Array;
  valid: Uint8Array;
}

/**
 * Client pentru firul de calcul orbital.
 *
 * Tampoanele circulă: workerul le transferă către firul principal, acesta copiază
 * ce-i trebuie și le trimite înapoi la următoarea cerere. Zero alocări per cadru,
 * zero copii mari.
 */
export class OrbitWorkerClient {
  private worker: Worker;
  private freeBuffers: SnapshotBuffers | null = null;
  private pending = false;
  private seq = 0;
  private lastRequestAt = 0;
  /** latența medie a unei propagări complete, ms */
  latencyMs = 60;
  ready = false;

  onSnapshot: ((timeMs: number, b: SnapshotBuffers) => void) | null = null;
  onReady: ((count: number) => void) | null = null;

  private passResolvers = new Map<number, (p: SatellitePass[]) => void>();
  private passRequestId = 0;

  constructor() {
    this.worker = new Worker(new URL('../workers/orbit.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (msg.type === 'ready') {
        this.ready = true;
        this.onReady?.(msg.count);
        return;
      }
      if (msg.type === 'snapshot') {
        this.pending = false;
        const dt = performance.now() - this.lastRequestAt;
        // medie exponențială — o singură propagare lentă nu trebuie să deregleze predicția
        this.latencyMs = this.latencyMs * 0.8 + dt * 0.2;
        const b: SnapshotBuffers = {
          positions: msg.positions,
          geoLat: msg.geoLat,
          geoLon: msg.geoLon,
          geoAlt: msg.geoAlt,
          valid: msg.valid,
        };
        this.onSnapshot?.(msg.timeMs, b);
        // tamponul se întoarce la workerul de la care a venit
        this.freeBuffers = b;
        return;
      }
      if (msg.type === 'passes') {
        const resolve = this.passResolvers.get(msg.requestId);
        if (resolve) {
          this.passResolvers.delete(msg.requestId);
          resolve(msg.passes as SatellitePass[]);
        }
      }
    };
  }

  init(entries: SatelliteEntry[], meanAlt: Float32Array) {
    this.ready = false;
    this.worker.postMessage({
      type: 'init',
      entries: entries.map((e, i) => ({
        tle1: e.tle1,
        tle2: e.tle2,
        name: e.name,
        noradId: e.noradId,
        category: e.category,
        meanAltKm: meanAlt[i],
      })),
    });
  }

  get busy() {
    return this.pending;
  }

  /** Cere o poziționare completă pentru momentul dat. Ignorată dacă una e deja în lucru. */
  requestSnapshot(timeMs: number) {
    if (!this.ready || this.pending) return;
    this.pending = true;
    this.lastRequestAt = performance.now();
    const b = this.freeBuffers;
    this.freeBuffers = null;
    if (b) {
      this.worker.postMessage({ type: 'snapshot', seq: this.seq++, timeMs, buffers: b }, [
        b.positions.buffer,
        b.geoLat.buffer,
        b.geoLon.buffer,
        b.geoAlt.buffer,
        b.valid.buffer,
      ]);
    } else {
      this.worker.postMessage({ type: 'snapshot', seq: this.seq++, timeMs });
    }
  }

  computePasses(args: {
    obs: Observer;
    startMs: number;
    endMs: number;
    indices: number[];
    minElevationDeg: number;
    onlyVisibleToEye: boolean;
    coarseStepSec: number;
  }): Promise<SatellitePass[]> {
    const requestId = ++this.passRequestId;
    return new Promise((resolve) => {
      this.passResolvers.set(requestId, resolve);
      this.worker.postMessage({ type: 'passes', requestId, ...args });
    });
  }

  dispose() {
    this.worker.terminate();
    this.passResolvers.clear();
  }
}

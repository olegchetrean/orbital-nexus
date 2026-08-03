/// <reference lib="webworker" />
import * as satellite from 'satellite.js';
import { computePasses, canEverBeVisible, type Observer, type SatellitePass } from '../lib/passes';
import type { CategoryId } from '../lib/types';

/**
 * Firul de calcul orbital.
 *
 * Propagarea SGP4 pentru ~12.000 de obiecte costă zeci de milisecunde per cadru.
 * Pe firul principal asta înseamnă interfață blocată: butoanele nu răspund,
 * animațiile sacadează. Aici calculăm în paralel și trimitem înapoi doar
 * tampoanele de poziții, transferate (nu copiate).
 */

interface InitEntry {
  tle1: string;
  tle2: string;
  name: string;
  noradId: number;
  category: CategoryId;
  meanAltKm: number;
}

interface Buffers {
  positions: Float32Array;
  geoLat: Float32Array;
  geoLon: Float32Array;
  geoAlt: Float32Array;
  valid: Uint8Array;
}

type InMessage =
  | { type: 'init'; entries: InitEntry[] }
  | { type: 'snapshot'; seq: number; timeMs: number; buffers?: Buffers }
  | {
      type: 'passes';
      requestId: number;
      obs: Observer;
      startMs: number;
      endMs: number;
      indices: number[];
      minElevationDeg: number;
      onlyVisibleToEye: boolean;
      coarseStepSec: number;
    };

let recs: satellite.SatRec[] = [];
let meta: InitEntry[] = [];

const rad2deg = (r: number) => (r * 180) / Math.PI;

function ensure(buffers: Buffers | undefined, n: number): Buffers {
  const ok =
    buffers &&
    buffers.positions.length === n * 3 &&
    buffers.geoLat.length === n &&
    buffers.valid.length === n;
  if (ok) return buffers as Buffers;
  return {
    positions: new Float32Array(n * 3),
    geoLat: new Float32Array(n),
    geoLon: new Float32Array(n),
    geoAlt: new Float32Array(n),
    valid: new Uint8Array(n),
  };
}

function snapshot(timeMs: number, buffers: Buffers | undefined): Buffers {
  const n = recs.length;
  const b = ensure(buffers, n);
  const date = new Date(timeMs);
  const gst = satellite.gstime(date);

  for (let i = 0; i < n; i++) {
    const pv = satellite.propagate(recs[i], date);
    if (!pv || !pv.position) {
      b.valid[i] = 0;
      continue;
    }
    const geo = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gst);
    const lat = rad2deg(geo.latitude);
    let lon = rad2deg(geo.longitude);
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    const r = 1 + geo.height / 6371;
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = ((lon + 180) * Math.PI) / 180;
    b.positions[i * 3] = -r * Math.sin(phi) * Math.cos(theta);
    b.positions[i * 3 + 1] = r * Math.cos(phi);
    b.positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    b.geoLat[i] = lat;
    b.geoLon[i] = lon;
    b.geoAlt[i] = geo.height;
    b.valid[i] = 1;
  }
  return b;
}

self.onmessage = (ev: MessageEvent<InMessage>) => {
  const msg = ev.data;

  if (msg.type === 'init') {
    meta = msg.entries;
    recs = msg.entries.map((e) => satellite.twoline2satrec(e.tle1, e.tle2));
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'ready', count: recs.length });
    return;
  }

  if (msg.type === 'snapshot') {
    if (recs.length === 0) return;
    const b = snapshot(msg.timeMs, msg.buffers);
    (self as DedicatedWorkerGlobalScope).postMessage(
      { type: 'snapshot', seq: msg.seq, timeMs: msg.timeMs, ...b },
      [b.positions.buffer, b.geoLat.buffer, b.geoLon.buffer, b.geoAlt.buffer, b.valid.buffer]
    );
    return;
  }

  if (msg.type === 'passes') {
    const out: SatellitePass[] = [];
    // pentru un singur obiect vrem toate trecerile zilei; pentru sute, doar primele
    const maxPasses = msg.indices.length === 1 ? 16 : 4;
    for (const i of msg.indices) {
      const rec = recs[i];
      const m = meta[i];
      if (!rec || !m) continue;
      if (!canEverBeVisible(rec, msg.obs.latDeg, m.meanAltKm)) continue;
      const passes = computePasses(
        rec,
        { index: i, name: m.name, noradId: m.noradId, category: m.category },
        msg.obs,
        msg.startMs,
        msg.endMs,
        {
          minElevationDeg: msg.minElevationDeg,
          maxPasses,
          coarseStepSec: msg.coarseStepSec,
        }
      );
      for (const p of passes) {
        if (msg.onlyVisibleToEye && !p.visibleToEye) continue;
        out.push(p);
      }
    }
    out.sort((a, b) => a.max.timeMs - b.max.timeMs);
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'passes',
      requestId: msg.requestId,
      passes: out,
    });
  }
};

export {};

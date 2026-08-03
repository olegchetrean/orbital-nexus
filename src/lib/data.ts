import * as satellite from 'satellite.js';
import { FALLBACK_TLES } from './fallbackData';
import type {
  CategoryId,
  GroupStatus,
  LoadProgress,
  LoadResult,
  SatelliteEntry,
  SatTelemetry,
  StarlinkShell,
} from './types';
import { gstime } from './astro';
import { cacheGet, cacheSet } from './cache';
import { gpUrl, isNotModifiedResponse, supplementalUrl } from './sources';

interface GroupDef {
  /** cheie de cache, unică */
  key: string;
  labelKey: string;
  category: CategoryId;
  url: string;
  /** true = efemeride publicate de operatorul constelației */
  operator: boolean;
  /** grupurile cu prioritate mică cedează sateliții duplicați celor cu prioritate mare */
  priority: number;
}

/** Grupuri din catalogul public US Space Force (via CelesTrak) */
const GP_GROUPS: GroupDef[] = [
  { key: 'gp:stations', labelKey: 'grpStations', category: 'station', url: gpUrl('stations'), operator: false, priority: 100 },
  { key: 'gp:starlink', labelKey: 'grpStarlinkCat', category: 'starlink', url: gpUrl('starlink'), operator: false, priority: 50 },
  { key: 'gp:oneweb', labelKey: 'grpOnewebCat', category: 'oneweb', url: gpUrl('oneweb'), operator: false, priority: 50 },
  { key: 'gp:iridium-NEXT', labelKey: 'grpIridiumNext', category: 'iridium', url: gpUrl('iridium-NEXT'), operator: false, priority: 50 },
  { key: 'gp:gps-ops', labelKey: 'grpGps', category: 'gnss', url: gpUrl('gps-ops'), operator: false, priority: 60 },
  { key: 'gp:glo-ops', labelKey: 'grpGlonass', category: 'gnss', url: gpUrl('glo-ops'), operator: false, priority: 60 },
  { key: 'gp:galileo', labelKey: 'grpGalileo', category: 'gnss', url: gpUrl('galileo'), operator: false, priority: 60 },
  { key: 'gp:beidou', labelKey: 'grpBeidou', category: 'gnss', url: gpUrl('beidou'), operator: false, priority: 60 },
  { key: 'gp:weather', labelKey: 'grpWeather', category: 'weather', url: gpUrl('weather'), operator: false, priority: 60 },
  { key: 'gp:visual', labelKey: 'grpBrightest', category: 'other', url: gpUrl('visual'), operator: false, priority: 10 },
];

/**
 * Efemeride publicate de operatori. Mai precise decât catalogul public pentru că
 * includ manevrele planificate — catalogul oficial le „vede" abia după ce s-au
 * întâmplat, la următoarea observație radar.
 */
const OPERATOR_GROUPS: GroupDef[] = [
  { key: 'sup:starlink', labelKey: 'grpStarlinkOp', category: 'starlink', url: supplementalUrl('starlink'), operator: true, priority: 90 },
  { key: 'sup:oneweb', labelKey: 'grpOnewebOp', category: 'oneweb', url: supplementalUrl('oneweb'), operator: true, priority: 90 },
  { key: 'sup:iridium', labelKey: 'grpIridiumOp', category: 'iridium', url: supplementalUrl('iridium'), operator: true, priority: 90 },
];

/**
 * Când folosim efemeridele operatorului, grupul echivalent din catalogul public
 * devine redundant: aceleași obiecte, date mai vechi. Nu-l mai cerem deloc —
 * economisim ~2 MB de transfer și trei interogări din bugetul CelesTrak.
 */
const SUPERSEDED_BY_OPERATOR = new Set(['gp:starlink', 'gp:oneweb', 'gp:iridium-NEXT']);

/** CelesTrak actualizează la 2 ore; sub acest prag nici nu are rost să întrebăm. */
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

const rad2deg = (r: number) => (r * 180) / Math.PI;

/* ---------------- Parsare TLE ---------------- */

/** Epoca din linia 1 a unui TLE (col. 19–32: YYDDD.DDDDDDDD) → ms epoch */
export function tleEpochMs(tle1: string): number {
  const raw = tle1.substring(18, 32).trim();
  const yy = parseInt(raw.substring(0, 2), 10);
  const doy = parseFloat(raw.substring(2));
  if (isNaN(yy) || isNaN(doy)) return NaN;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
}

export function parseTleText(text: string, def: GroupDef): SatelliteEntry[] {
  const lines = text.split('\n').map((l) => l.trimEnd());
  const out: SatelliteEntry[] = [];
  for (let i = 0; i + 2 < lines.length + 1 && i < lines.length - 1; i += 3) {
    const name = lines[i]?.trim();
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!name || !l1?.startsWith('1 ') || !l2?.startsWith('2 ')) continue;
    const noradId = parseInt(l1.substring(2, 7).trim(), 10);
    if (!Number.isFinite(noradId)) continue;
    out.push({
      name: name.replace(/^0 /, ''),
      noradId,
      intlDes: l1.substring(9, 17).trim(),
      tle1: l1,
      tle2: l2,
      category: def.category,
      group: def.key,
      sourceKey: def.labelKey,
      operatorData: def.operator,
      epochMs: tleEpochMs(l1),
    });
  }
  return out;
}

/* ---------------- Descărcare ---------------- */

interface GroupOutcome {
  def: GroupDef;
  status: GroupStatus;
  entries: SatelliteEntry[];
  fetchedAt: number | null;
}

/**
 * Descarcă un grup, cu cache-ul ca plasă de siguranță.
 *
 * Subtilitatea care strica totul: CelesTrak răspunde `403` cu textul
 * „GP data has not updated since your last successful download…" atunci când
 * clientul are deja versiunea curentă. Este echivalentul unui `304 Not Modified`,
 * nu o eroare. Tratat ca eroare, aplicația arunca date perfect valide și cădea
 * pe setul de rezervă înghețat în cod.
 *
 * A doua subtilitate: o cerere fără termen nu eșuează niciodată. Când CelesTrak
 * limitează un IP, conexiunea nu e refuzată — pur și simplu nu răspunde. Fără
 * `REQUEST_TIMEOUT_MS`, promisiunea rămâne suspendată, `allSettled` nu se
 * încheie, iar ecranul de încărcare rămâne pe loc la nesfârșit. O eroare
 * declarată la timp ne lasă să cădem pe cache sau pe setul de rezervă.
 */
const REQUEST_TIMEOUT_MS = 12_000;

async function fetchGroup(def: GroupDef, force: boolean): Promise<GroupOutcome> {
  const cached = await cacheGet(def.key);
  const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  if (fresh && !force) {
    return { def, status: 'cache', entries: parseTleText(cached.text, def), fetchedAt: cached.fetchedAt };
  }

  try {
    const res = await fetch(def.url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await res.text();

    if (res.ok && body.length > 100) {
      await cacheSet(def.key, body);
      return { def, status: 'live', entries: parseTleText(body, def), fetchedAt: Date.now() };
    }

    if (isNotModifiedResponse(res.status, body) && cached) {
      // Confirmare explicită de la sursă: ce avem în cache ESTE versiunea curentă.
      await cacheSet(def.key, cached.text);
      return { def, status: 'live', entries: parseTleText(cached.text, def), fetchedAt: Date.now() };
    }

    throw new Error(`HTTP ${res.status}`);
  } catch {
    if (cached) {
      return { def, status: 'stale', entries: parseTleText(cached.text, def), fetchedAt: cached.fetchedAt };
    }
    return { def, status: 'failed', entries: [], fetchedAt: null };
  }
}

function fallbackEntries(): SatelliteEntry[] {
  return FALLBACK_TLES.map((t) => {
    const def =
      [...GP_GROUPS, ...OPERATOR_GROUPS].find((g) => g.key.endsWith(`:${t.group}`)) ??
      ({ key: `fallback:${t.group}`, labelKey: 'grpFallback', category: 'other', url: '', operator: false, priority: 0 } as GroupDef);
    return {
      name: t.name,
      noradId: parseInt(t.tle1.substring(2, 7).trim(), 10),
      intlDes: t.tle1.substring(9, 17).trim(),
      tle1: t.tle1,
      tle2: t.tle2,
      category: def.category,
      group: 'fallback',
      sourceKey: 'grpFallback',
      operatorData: false,
      epochMs: tleEpochMs(t.tle1),
    } satisfies SatelliteEntry;
  });
}

export interface LoadOptions {
  /** false = doar catalogul oficial US Space Force, fără efemeride de operator */
  useOperatorData?: boolean;
  /** ignoră cache-ul proaspăt și forțează o interogare */
  force?: boolean;
}

export async function loadSatellites(
  onProgress: (p: LoadProgress) => void,
  opts: LoadOptions = {}
): Promise<LoadResult> {
  const { useOperatorData = true, force = false } = opts;
  const defs = useOperatorData
    ? [...GP_GROUPS.filter((g) => !SUPERSEDED_BY_OPERATOR.has(g.key)), ...OPERATOR_GROUPS]
    : GP_GROUPS;

  const total = defs.length;
  let done = 0;
  onProgress({ done: 0, total, source: null });

  // allSettled, nu all: un singur grup căzut nu mai poate rupe întreg catalogul.
  // Varianta veche folosea Promise.all — un 403 de la CelesTrak arunca toate cele
  // 10 grupuri și aplicația cădea pe cele 238 de TLE-uri înghețate în cod.
  const settled = await Promise.allSettled(
    defs.map(async (def) => {
      const outcome = await fetchGroup(def, force);
      done += 1;
      onProgress({ done, total, source: outcome.status === 'failed' ? null : 'live' });
      return outcome;
    })
  );

  const groups: GroupOutcome[] = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { def: defs[i], status: 'failed' as const, entries: [], fetchedAt: null }
  );
  const ok = groups.filter((g) => g.entries.length > 0);

  if (ok.length === 0) {
    const entries = fallbackEntries();
    onProgress({ done: total, total, source: 'fallback' });
    return {
      entries,
      source: 'fallback',
      groups: groups.map((g) => ({ key: g.def.key, labelKey: g.def.labelKey, status: g.status, count: 0, fetchedAt: null, operator: g.def.operator })),
      fetchedAt: null,
    };
  }

  // Dedupe pe NORAD ID: același satelit apare în mai multe grupuri (ISS e și în
  // „stations" și în „visual"; Starlink e și în catalog, și în efemeridele SpaceX).
  // Câștigă grupul cu prioritatea mai mare — adică datele de la operator.
  const byNorad = new Map<number, SatelliteEntry>();
  const priority = new Map<number, number>();
  for (const g of ok) {
    for (const e of g.entries) {
      const prev = priority.get(e.noradId);
      if (prev === undefined || g.def.priority > prev) {
        byNorad.set(e.noradId, e);
        priority.set(e.noradId, g.def.priority);
      }
    }
  }
  const entries = [...byNorad.values()];

  const anyLive = groups.some((g) => g.status === 'live');
  const anyStale = groups.some((g) => g.status === 'stale');
  const source: LoadResult['source'] = anyLive ? 'live' : anyStale ? 'stale' : 'cache';

  const fetchedAt = groups.reduce<number | null>(
    (acc, g) => (g.fetchedAt && (!acc || g.fetchedAt < acc) ? g.fetchedAt : acc),
    null
  );

  onProgress({ done: total, total, source });
  return {
    entries,
    source,
    fetchedAt,
    groups: groups.map((g) => ({
      key: g.def.key,
      labelKey: g.def.labelKey,
      status: g.status,
      count: g.entries.length,
      fetchedAt: g.fetchedAt,
      operator: g.def.operator,
    })),
  };
}

/* ---------------- Magazinul de sateliți ---------------- */

/** Magazinul de sateliți: satrec-uri satellite.js + propagare batch */
export class SatStore {
  entries: SatelliteEntry[] = [];
  recs: satellite.SatRec[] = [];
  /** poziții curente în coordonate glob (unități = raze Pământ) */
  positions: Float32Array = new Float32Array(0);
  valid: Uint8Array = new Uint8Array(0);
  /** poziții geodezice curente (grade / km), actualizate odată cu propagateRange */
  geoLat: Float32Array = new Float32Array(0);
  geoLon: Float32Array = new Float32Array(0);
  geoAlt: Float32Array = new Float32Array(0);
  /** altitudinea medie din TLE (km) — statică, calculată la inițializare */
  meanAlt: Float32Array = new Float32Array(0);
  /** vârsta epocii TLE în zile la momentul inițializării */
  epochAgeDays: Float32Array = new Float32Array(0);

  init(entries: SatelliteEntry[]) {
    this.entries = entries;
    this.recs = entries.map((e) => satellite.twoline2satrec(e.tle1, e.tle2));
    this.positions = new Float32Array(entries.length * 3);
    this.valid = new Uint8Array(entries.length);
    this.geoLat = new Float32Array(entries.length);
    this.geoLon = new Float32Array(entries.length);
    this.geoAlt = new Float32Array(entries.length);
    this.meanAlt = new Float32Array(entries.length);
    this.epochAgeDays = new Float32Array(entries.length);
    const mu = 398600.4418; // km^3/s^2
    const now = Date.now();
    for (let i = 0; i < entries.length; i++) {
      const n = this.recs[i].no / 60; // rad/s
      const a = Math.cbrt(mu / (n * n));
      this.meanAlt[i] = a - 6371;
      this.epochAgeDays[i] = (now - entries[i].epochMs) / 86400000;
    }
  }

  get size() {
    return this.entries.length;
  }

  /**
   * Eroare de poziție estimată (km) pentru un satelit, în funcție de vechimea
   * elementelor orbitale. SGP4 pornește de la ~1 km la epocă și se degradează
   * cu 1–3 km/zi în orbită joasă, unde frecarea atmosferică e imprevizibilă.
   */
  estimatedErrorKm(index: number): number {
    const days = Math.max(0, this.epochAgeDays[index]);
    const drift = this.meanAlt[index] < 1000 ? 2.5 : 0.8; // km/zi
    return 1 + days * drift;
  }

  /** Propagă un subset [start, end) la data simTime; întoarce nr. actualizate */
  propagateRange(simTime: Date, start: number, end: number, earthRotRad: number): number {
    const gst = gstime(simTime) + earthRotRad;
    let updated = 0;
    for (let i = start; i < end && i < this.size; i++) {
      const pv = satellite.propagate(this.recs[i], simTime);
      if (!pv || !pv.position) {
        this.valid[i] = 0;
        continue;
      }
      const pos = pv.position as satellite.EciVec3<number>;
      const geo = satellite.eciToGeodetic(pos as satellite.EciVec3<number>, gst);
      const lat = rad2deg(geo.latitude);
      let lon = rad2deg(geo.longitude);
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
      const r = 1 + geo.height / 6371;
      // latLonToVec3 inline (evităm alocări)
      const phi = ((90 - lat) * Math.PI) / 180;
      const theta = ((lon + 180) * Math.PI) / 180;
      this.positions[i * 3] = -r * Math.sin(phi) * Math.cos(theta);
      this.positions[i * 3 + 1] = r * Math.cos(phi);
      this.positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      this.geoLat[i] = lat;
      this.geoLon[i] = lon;
      this.geoAlt[i] = geo.height;
      this.valid[i] = 1;
      updated++;
    }
    return updated;
  }

  telemetry(index: number, simTime: Date, earthRotRad: number): SatTelemetry | null {
    const rec = this.recs[index];
    const pv = satellite.propagate(rec, simTime);
    if (!pv || !pv.position || !pv.velocity) return null;
    const gst = gstime(simTime) + earthRotRad;
    const geo = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gst);
    const vel = pv.velocity as satellite.EciVec3<number>;
    const v = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

    const e = rec.ecco;
    const n = rec.no / 60; // rad/s
    const mu = 398600.4418; // km^3/s^2
    const a = Math.cbrt(mu / (n * n)); // axă semi-majoră km
    const periodMin = (2 * Math.PI) / n / 60;

    return {
      lat: rad2deg(geo.latitude),
      lon: ((((rad2deg(geo.longitude) + 180) % 360) + 360) % 360) - 180,
      altKm: geo.height,
      velKmS: v,
      periodMin,
      inclinationDeg: (rec.inclo * 180) / Math.PI,
      eccentricity: e,
      apogeeKm: a * (1 + e) - 6371,
      perigeeKm: a * (1 - e) - 6371,
      raanDeg: (rec.nodeo * 180) / Math.PI,
    };
  }

  /**
   * Urma la sol: punctul de sub satelit, proiectat pe suprafață.
   * Asta e „traseul" din FlightRadar24 — pe unde a trecut și pe unde va trece.
   * Fereastra e dată în fracțiuni de perioadă orbitală: negativ = trecut.
   */
  groundTrack(
    index: number,
    simTime: Date,
    fromPeriods = -0.5,
    toPeriods = 1,
    steps = 240
  ): { positions: Float32Array; nowAt: number } {
    const rec = this.recs[index];
    const n = rec.no / 60;
    const periodMs = ((2 * Math.PI) / n) * 1000;
    const out = new Float32Array(steps * 3);
    const span = toPeriods - fromPeriods;
    const radius = 1.004; // puțin deasupra scoarței, ca să nu intre în textură

    for (let s = 0; s < steps; s++) {
      const frac = fromPeriods + (s / (steps - 1)) * span;
      const t = new Date(simTime.getTime() + frac * periodMs);
      const pv = satellite.propagate(rec, t);
      if (!pv || !pv.position) {
        const prev = Math.max(0, s - 1) * 3;
        out[s * 3] = out[prev];
        out[s * 3 + 1] = out[prev + 1];
        out[s * 3 + 2] = out[prev + 2];
        continue;
      }
      const geo = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gstime(t));
      const lat = rad2deg(geo.latitude);
      let lon = rad2deg(geo.longitude);
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
      const phi = ((90 - lat) * Math.PI) / 180;
      const theta = ((lon + 180) * Math.PI) / 180;
      out[s * 3] = -radius * Math.sin(phi) * Math.cos(theta);
      out[s * 3 + 1] = radius * Math.cos(phi);
      out[s * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    // indicele punctului care corespunde momentului „acum"
    const nowAt = Math.round(((0 - fromPeriods) / span) * (steps - 1));
    return { positions: out, nowAt };
  }

  /** Traiectorie orbitală completă (o perioadă) pentru un satelit — array de poziții 3D */
  orbitPath(index: number, simTime: Date, steps = 180): Float32Array {
    const rec = this.recs[index];
    const n = rec.no / 60;
    const periodMs = ((2 * Math.PI) / n) * 1000;
    const out = new Float32Array(steps * 3);
    for (let s = 0; s < steps; s++) {
      const t = new Date(simTime.getTime() + (s / steps) * periodMs);
      const pv = satellite.propagate(rec, t);
      if (!pv || !pv.position) {
        out[s * 3] = out[Math.max(0, (s - 1) * 3)];
        out[s * 3 + 1] = out[Math.max(0, (s - 1) * 3 + 1)];
        out[s * 3 + 2] = out[Math.max(0, (s - 1) * 3 + 2)];
        continue;
      }
      const gst = gstime(t);
      const geo = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gst);
      const lat = rad2deg(geo.latitude);
      let lon = rad2deg(geo.longitude);
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
      const r = 1 + geo.height / 6371;
      const phi = ((90 - lat) * Math.PI) / 180;
      const theta = ((lon + 180) * Math.PI) / 180;
      out[s * 3] = -r * Math.sin(phi) * Math.cos(theta);
      out[s * 3 + 1] = r * Math.cos(phi);
      out[s * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return out;
  }
}

/* ---------------- Shell-uri Starlink ---------------- */

/** Clasificare shell-uri Starlink din elementele orbitale */
export function computeStarlinkShells(store: SatStore): StarlinkShell[] {
  const shells: StarlinkShell[] = [
    { id: 's1', labelKey: 'shell1', altitude: '~540–550 km', inclination: '53.0°', color: '#38e1ff', count: 0, noradIds: [] },
    { id: 's4', labelKey: 'shell4', altitude: '~540 km', inclination: '53.2°', color: '#4cc9f0', count: 0, noradIds: [] },
    { id: 's2', labelKey: 'shell2', altitude: '~570 km', inclination: '70°', color: '#b18cff', count: 0, noradIds: [] },
    { id: 's3', labelKey: 'shell3', altitude: '~560 km', inclination: '97.6°', color: '#ff9f43', count: 0, noradIds: [] },
    { id: 'low', labelKey: 'shellLow', altitude: '< 500 km', inclination: '43–53°', color: '#7bed9f', count: 0, noradIds: [] },
    { id: 'other-sl', labelKey: 'shellOther', altitude: null, inclination: null, color: '#a4b0be', count: 0, noradIds: [] },
  ];

  for (let i = 0; i < store.size; i++) {
    const e = store.entries[i];
    if (e.category !== 'starlink') continue;
    const rec = store.recs[i];
    const inc = (rec.inclo * 180) / Math.PI;
    const n = rec.no / 60;
    const a = Math.cbrt(398600.4418 / (n * n));
    const alt = a - 6371;

    let shell: StarlinkShell;
    if (alt < 500) shell = shells[4];
    else if (Math.abs(inc - 97.6) < 2) shell = shells[3];
    else if (Math.abs(inc - 70) < 2) shell = shells[2];
    else if (Math.abs(inc - 53.2) < 0.6 && alt >= 520 && alt < 555) shell = shells[1];
    else if (Math.abs(inc - 53.0) < 1.2 && alt >= 520 && alt < 575) shell = shells[0];
    else if (Math.abs(inc - 43) < 2.5) shell = shells[4];
    else shell = shells[5];
    shell.count++;
    shell.noradIds.push(e.noradId);
  }
  return shells.filter((s) => s.count > 0);
}

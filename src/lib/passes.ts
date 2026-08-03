import * as satellite from 'satellite.js';
import type { CategoryId } from './types';

/**
 * Predicția trecerilor vizibile.
 *
 * Un satelit se vede cu ochiul liber doar când se întâmplă trei lucruri simultan:
 *   1. e deasupra orizontului tău,
 *   2. e încă luminat de Soare (sus, la 500 km, Soarele răsare mai devreme),
 *   3. la tine jos s-a întunecat deja.
 * De asta „trenurile" Starlink se văd doar în prima oră după apus și în ultima
 * dinainte de răsărit.
 */

export interface Observer {
  latDeg: number;
  lonDeg: number;
  /** altitudinea observatorului deasupra elipsoidului, km */
  heightKm: number;
}

export interface PassSample {
  timeMs: number;
  elevationDeg: number;
  azimuthDeg: number;
  rangeKm: number;
  sunlit: boolean;
}

export interface SatellitePass {
  index: number;
  name: string;
  noradId: number;
  category: CategoryId;
  start: PassSample;
  max: PassSample;
  end: PassSample;
  /** durata totală deasupra pragului de elevație, secunde */
  durationSec: number;
  /** trecerea are cel puțin un moment în care satelitul e luminat și observatorul în întuneric */
  visibleToEye: boolean;
  /** intervalul efectiv observabil cu ochiul liber (subinterval al trecerii) */
  eyeStartMs: number | null;
  eyeEndMs: number | null;
  /** magnitudine aparentă estimată la maxim (mai mic = mai luminos); null dacă nu e observabilă */
  estimatedMagnitude: number | null;
}

const DEG = Math.PI / 180;
const EARTH_RADIUS_KM = 6378.137;

/** Direcția Soarelui în sistem inerțial (ECI), vector unitar */
export function sunEci(date: Date): { x: number; y: number; z: number } {
  const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  const d = (date.getTime() - j2000) / 86400000;
  const g = (357.529 + 0.98560028 * d) * DEG;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const e = (23.439 - 0.00000036 * d) * DEG;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  return {
    x: Math.cos(dec) * Math.cos(ra),
    y: Math.cos(dec) * Math.sin(ra),
    z: Math.sin(dec),
  };
}

/** Satelitul e în lumina Soarelui? Model de umbră cilindrică (poziție ECI, km) */
export function satelliteSunlit(
  pos: { x: number; y: number; z: number },
  sun: { x: number; y: number; z: number }
): boolean {
  const d = pos.x * sun.x + pos.y * sun.y + pos.z * sun.z;
  if (d >= 0) return true;
  const r2 = pos.x * pos.x + pos.y * pos.y + pos.z * pos.z;
  const perp2 = r2 - d * d;
  return perp2 >= EARTH_RADIUS_KM * EARTH_RADIUS_KM;
}

/** Elevația Soarelui la observator (grade). Sub −6° = crepuscul civil încheiat. */
export function observerSunElevation(obs: Observer, date: Date): number {
  const sun = sunEci(date);
  const g = satellite.gstime(date);
  // rotim vectorul solar din ECI în ECF
  const sx = sun.x * Math.cos(g) + sun.y * Math.sin(g);
  const sy = -sun.x * Math.sin(g) + sun.y * Math.cos(g);
  const sz = sun.z;
  const la = obs.latDeg * DEG;
  const lo = obs.lonDeg * DEG;
  const ux = Math.cos(la) * Math.cos(lo);
  const uy = Math.cos(la) * Math.sin(lo);
  const uz = Math.sin(la);
  return Math.asin(Math.max(-1, Math.min(1, ux * sx + uy * sy + uz * sz))) / DEG;
}

/**
 * Magnitudine aparentă estimată.
 *
 * Formula clasică folosită de observatorii de sateliți: pornim de la o
 * magnitudine standard (la 1000 km, complet iluminat) și corectăm cu distanța
 * și cu faza. E o ESTIMARE — reflectivitatea reală depinde de orientarea
 * panourilor, iar un reflex specular poate schimba rezultatul cu 4–5 magnitudini.
 */
const STANDARD_MAGNITUDE: Record<CategoryId, number> = {
  station: -1.8, // ISS
  starlink: 5.5, // după tratamentele antireflexie; „trenurile" proaspăt lansate sunt mult mai luminoase
  oneweb: 7.0,
  iridium: 6.5,
  gnss: 8.0, // prea sus și prea mic pentru ochiul liber
  weather: 6.0,
  other: 6.0,
};

export function estimateMagnitude(
  category: CategoryId,
  rangeKm: number,
  phaseAngleRad: number
): number {
  const std = STANDARD_MAGNITUDE[category] ?? 6;
  const illuminated = Math.max(0.001, (1 + Math.cos(phaseAngleRad)) / 2);
  return std - 15.75 + 2.5 * Math.log10((rangeKm * rangeKm) / illuminated);
}

interface Geometry {
  elevationDeg: number;
  azimuthDeg: number;
  rangeKm: number;
  sunlit: boolean;
  phaseAngleRad: number;
}

function geometryAt(rec: satellite.SatRec, obsGd: satellite.GeodeticLocation, date: Date): Geometry | null {
  const pv = satellite.propagate(rec, date);
  if (!pv || !pv.position) return null;
  const eci = pv.position as satellite.EciVec3<number>;
  const gmst = satellite.gstime(date);
  const ecf = satellite.eciToEcf(eci, gmst);
  const look = satellite.ecfToLookAngles(obsGd, ecf);
  const sun = sunEci(date);
  const sunlit = satelliteSunlit(eci, sun);

  // unghiul de fază: satelit → observator vs. satelit → Soare
  const obsEcf = satellite.geodeticToEcf(obsGd);
  const gx = obsEcf.x * Math.cos(gmst) - obsEcf.y * Math.sin(gmst);
  const gy = obsEcf.x * Math.sin(gmst) + obsEcf.y * Math.cos(gmst);
  const toObs = { x: gx - eci.x, y: gy - eci.y, z: obsEcf.z - eci.z };
  const lo = Math.hypot(toObs.x, toObs.y, toObs.z) || 1;
  const cosPhase = (toObs.x * sun.x + toObs.y * sun.y + toObs.z * sun.z) / lo;

  return {
    elevationDeg: look.elevation / DEG,
    azimuthDeg: ((look.azimuth / DEG) % 360 + 360) % 360,
    rangeKm: look.rangeSat,
    sunlit,
    phaseAngleRad: Math.acos(Math.max(-1, Math.min(1, cosPhase))),
  };
}

export interface PassOptions {
  /** elevația minimă pentru a considera o trecere, grade */
  minElevationDeg?: number;
  /** pas de căutare grosier, secunde */
  coarseStepSec?: number;
  /** oprește după atâtea treceri per satelit */
  maxPasses?: number;
  /** cât de întuneric trebuie să fie la observator, grade sub orizont */
  darknessDeg?: number;
}

/**
 * Caută trecerile unui satelit într-o fereastră de timp.
 * Strategie: pas grosier pentru a detecta intrarea deasupra orizontului, apoi
 * bisecție pentru momentele de răsărit/apus și pas fin pentru maxim.
 */
export function computePasses(
  rec: satellite.SatRec,
  meta: { index: number; name: string; noradId: number; category: CategoryId },
  obs: Observer,
  startMs: number,
  endMs: number,
  opts: PassOptions = {}
): SatellitePass[] {
  const {
    minElevationDeg = 10,
    coarseStepSec = 30,
    maxPasses = 6,
    darknessDeg = -6,
  } = opts;

  const obsGd: satellite.GeodeticLocation = {
    latitude: obs.latDeg * DEG,
    longitude: obs.lonDeg * DEG,
    height: obs.heightKm,
  };

  const passes: SatellitePass[] = [];
  const stepMs = coarseStepSec * 1000;
  let t = startMs;
  let prevEl = -90;

  const sample = (ms: number): PassSample | null => {
    const g = geometryAt(rec, obsGd, new Date(ms));
    if (!g) return null;
    return {
      timeMs: ms,
      elevationDeg: g.elevationDeg,
      azimuthDeg: g.azimuthDeg,
      rangeKm: g.rangeKm,
      sunlit: g.sunlit,
    };
  };

  while (t < endMs && passes.length < maxPasses) {
    const g = geometryAt(rec, obsGd, new Date(t));
    if (!g) {
      t += stepMs;
      continue;
    }
    const el = g.elevationDeg;

    if (prevEl < minElevationDeg && el >= minElevationDeg) {
      // răsărit: bisecție între t-step și t
      const rise = bisectCrossing(rec, obsGd, t - stepMs, t, minElevationDeg, true);
      // urmărim trecerea cu pas fin până coboară sub prag
      let maxSample: PassSample | null = null;
      let cur = rise;
      let endT = rise;
      const fine = 5000;
      while (cur < endMs) {
        const s = sample(cur);
        if (!s) break;
        if (s.elevationDeg < minElevationDeg) break;
        if (!maxSample || s.elevationDeg > maxSample.elevationDeg) maxSample = s;
        endT = cur;
        cur += fine;
      }
      const set = bisectCrossing(rec, obsGd, endT, Math.min(cur, endMs), minElevationDeg, false);
      const startSample = sample(rise);
      const endSample = sample(set);

      if (startSample && endSample && maxSample) {
        // intervalul observabil cu ochiul liber
        let eyeStart: number | null = null;
        let eyeEnd: number | null = null;
        for (let ms = rise; ms <= set; ms += 10000) {
          const gg = geometryAt(rec, obsGd, new Date(ms));
          if (!gg) continue;
          const dark = observerSunElevation(obs, new Date(ms)) < darknessDeg;
          if (gg.sunlit && dark) {
            if (eyeStart === null) eyeStart = ms;
            eyeEnd = ms;
          }
        }
        const maxGeo = geometryAt(rec, obsGd, new Date(maxSample.timeMs));
        const mag =
          eyeStart !== null && maxGeo
            ? estimateMagnitude(meta.category, maxGeo.rangeKm, maxGeo.phaseAngleRad)
            : null;

        passes.push({
          index: meta.index,
          name: meta.name,
          noradId: meta.noradId,
          category: meta.category,
          start: startSample,
          max: maxSample,
          end: endSample,
          durationSec: Math.round((set - rise) / 1000),
          visibleToEye: eyeStart !== null,
          eyeStartMs: eyeStart,
          eyeEndMs: eyeEnd,
          estimatedMagnitude: mag,
        });
      }
      // sărim peste restul trecerii
      t = set + stepMs;
      prevEl = -90;
      continue;
    }

    prevEl = el;
    t += stepMs;
  }

  return passes;
}

/** Bisecție pentru momentul în care elevația traversează un prag */
function bisectCrossing(
  rec: satellite.SatRec,
  obsGd: satellite.GeodeticLocation,
  loMs: number,
  hiMs: number,
  thresholdDeg: number,
  rising: boolean
): number {
  let lo = loMs;
  let hi = hiMs;
  for (let i = 0; i < 20 && hi - lo > 500; i++) {
    const mid = (lo + hi) / 2;
    const g = geometryAt(rec, obsGd, new Date(mid));
    if (!g) break;
    const above = g.elevationDeg >= thresholdDeg;
    if (above === rising) hi = mid;
    else lo = mid;
  }
  return Math.round((lo + hi) / 2);
}

/**
 * Filtru geometric ieftin: un satelit nu poate ajunge niciodată deasupra
 * orizontului unui observator dacă înclinarea lui e prea mică față de latitudine.
 * Evită mii de propagări inutile.
 */
export function canEverBeVisible(rec: satellite.SatRec, latDeg: number, altKm: number): boolean {
  const incDeg = (rec.inclo * 180) / Math.PI;
  const maxLat = Math.min(90, incDeg > 90 ? 180 - incDeg : incDeg);
  // unghiul central până la orizont, pentru altitudinea dată
  const horizon = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(altKm, 100))) / DEG;
  return Math.abs(latDeg) <= maxLat + horizon;
}

/**
 * Cerul văzut de la sol.
 *
 * Modul Cer are nevoie de un singur lucru de la astronomie: unde, pe bolta de
 * deasupra observatorului, cade un obiect dat. Toate funcțiile de aici duc spre
 * o pereche (altitudine, azimut) — grade deasupra orizontului și grade de la
 * nord spre est.
 *
 * Precizia țintită e cea a ochiului: o zecime de grad. Un satelit se vede ca un
 * punct de lumină care traversează cerul, nu ca o coordonată de telescop, iar
 * eroarea de orientare a busolei telefonului (2–15°) e cu două ordine de mărime
 * mai mare decât orice câștig dintr-un model solar sau lunar mai fin.
 */

import { gstime } from './astro';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface AltAz {
  altitudeDeg: number;
  azimuthDeg: number;
}

/** Timp sideral local, grade — unghiul cu care s-a rotit cerul deasupra observatorului */
export function localSiderealDeg(date: Date, lonDeg: number): number {
  return (((gstime(date) * RAD + lonDeg) % 360) + 360) % 360;
}

/** Ascensie dreaptă / declinație (grade, J2000) → altitudine / azimut la observator */
export function raDecToAltAz(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): AltAz {
  const H = (lstDeg - raDeg) * DEG;
  const d = decDeg * DEG;
  const f = latDeg * DEG;
  const sinAlt = Math.sin(d) * Math.sin(f) + Math.cos(d) * Math.cos(f) * Math.cos(H);
  const alt = Math.asin(Math.min(1, Math.max(-1, sinAlt)));
  const az = Math.atan2(
    -Math.sin(H) * Math.cos(d),
    Math.sin(d) * Math.cos(f) - Math.cos(d) * Math.sin(f) * Math.cos(H)
  );
  return { altitudeDeg: alt * RAD, azimuthDeg: (((az * RAD) % 360) + 360) % 360 };
}

/** Altitudine / azimut → vector unitar în cadrul (est, sus, sud) folosit de vizor */
export function altAzToVector(altDeg: number, azDeg: number, out: [number, number, number]) {
  const a = altDeg * DEG;
  const z = azDeg * DEG;
  const ca = Math.cos(a);
  out[0] = ca * Math.sin(z); // est
  out[1] = Math.sin(a); // sus
  out[2] = -ca * Math.cos(z); // nordul e spre −Z
  return out;
}

const julianCenturies = (date: Date) => (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525;

/** Poziția Soarelui în coordonate ecuatoriale (grade) */
export function sunRaDec(date: Date): { raDeg: number; decDeg: number } {
  const T = julianCenturies(date);
  const L = (280.46646 + 36000.76983 * T) * DEG;
  const M = (357.52911 + 35999.05029 * T) * DEG;
  const C = (1.914602 - 0.004817 * T) * Math.sin(M) + 0.019993 * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const lambda = L + C * DEG;
  const eps = (23.439291 - 0.0130042 * T) * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  return { raDeg: (((ra * RAD) % 360) + 360) % 360, decDeg: dec * RAD };
}

/**
 * Poziția Lunii, varianta scurtă din Meeus (cap. 47) cu primii termeni de
 * perturbație. Eroare sub ~0,15° — sub jumătate din diametrul aparent al Lunii,
 * deci pe ecran cade unde trebuie.
 */
export function moonRaDec(date: Date): { raDeg: number; decDeg: number; illuminated: number } {
  const T = julianCenturies(date);
  const Lp = (218.3164477 + 481267.88123421 * T) * DEG; // longitudine medie
  const D = (297.8501921 + 445267.1114034 * T) * DEG; // elongație medie
  const M = (357.5291092 + 35999.0502909 * T) * DEG; // anomalia medie a Soarelui
  const Mp = (134.9633964 + 477198.8675055 * T) * DEG; // anomalia medie a Lunii
  const F = (93.272095 + 483202.0175233 * T) * DEG; // argumentul latitudinii

  const lon =
    Lp * RAD +
    6.289 * Math.sin(Mp) +
    1.274 * Math.sin(2 * D - Mp) +
    0.658 * Math.sin(2 * D) +
    0.214 * Math.sin(2 * Mp) -
    0.186 * Math.sin(M) -
    0.114 * Math.sin(2 * F);
  const lat =
    5.128 * Math.sin(F) +
    0.281 * Math.sin(Mp + F) -
    0.278 * Math.sin(F - Mp) -
    0.173 * Math.sin(2 * D - F);

  const l = lon * DEG;
  const b = lat * DEG;
  const eps = (23.439291 - 0.0130042 * T) * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l));

  // Faza. Elongația e unghiul Soare–Pământ–Lună; fracțiunea luminată a discului
  // e (1 − cos elongație)/2: 0 la lună nouă, 1 la lună plină.
  const sunL = (280.46646 + 36000.76983 * T) * DEG;
  const sunC =
    (1.914602 - 0.004817 * T) * Math.sin(M) + 0.019993 * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const elong = Math.acos(Math.min(1, Math.max(-1, Math.cos(b) * Math.cos(l - (sunL + sunC * DEG)))));
  const illuminated = (1 - Math.cos(elong)) / 2;

  return {
    raDeg: (((ra * RAD) % 360) + 360) % 360,
    decDeg: dec * RAD,
    illuminated: Math.min(1, Math.max(0, illuminated)),
  };
}

/**
 * Culoarea unei stele din indicele B−V.
 * Aproximare vizuală, nu colorimetrie: negativ = albastru-alb (Rigel),
 * peste 1,4 = portocaliu-roșu (Betelgeuse, Antares).
 */
export function bvColor(bv: number): string {
  const t = Math.min(1, Math.max(0, (bv + 0.35) / 1.95));
  const r = Math.round(175 + 80 * t);
  const g = Math.round(205 - 35 * t);
  const b = Math.round(255 - 105 * t);
  return `rgb(${r},${g},${b})`;
}

/**
 * Refracția atmosferică ridică obiectele de lângă orizont; la 0° aparente sunt
 * de fapt cu ~0,57° sub el. Formula Bennett, folosită doar pentru afișare.
 */
export function refractedAltitude(altDeg: number): number {
  if (altDeg < -2) return altDeg;
  const r = 1.02 / Math.tan((altDeg + 10.3 / (altDeg + 5.11)) * DEG) / 60;
  return altDeg + r;
}

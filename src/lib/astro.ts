import * as THREE from 'three';

export const EARTH_RADIUS_KM = 6371;

/** Conversie lat/lon (grade) + rază → poziție 3D (aceeași convenție ca textura equirectangulară Three.js) */
export function latLonToVec3(latDeg: number, lonDeg: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = ((90 - latDeg) * Math.PI) / 180;
  const theta = ((lonDeg + 180) * Math.PI) / 180;
  out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
  return out;
}

/** Direcția Soarelui (aproximație de precizie vizuală) pentru o dată dată, în sistemul globului */
export function sunDirection(date: Date, out: THREE.Vector3): THREE.Vector3 {
  const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  const d = (date.getTime() - j2000) / 86400000;

  const g = ((357.529 + 0.98560028 * d) * Math.PI) / 180; // anomalie medie
  const q = 280.459 + 0.98564736 * d; // longitudine medie
  const L = q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g); // longitudine ecliptică (deg)
  const e = (23.439 - 0.00000036 * d) * (Math.PI / 180); // oblicitate

  const Lrad = (L * Math.PI) / 180;
  const ra = Math.atan2(Math.cos(e) * Math.sin(Lrad), Math.cos(Lrad)); // ascensie dreaptă (rad)
  const decl = Math.asin(Math.sin(e) * Math.sin(Lrad)); // declinație (rad)

  // GMST (ore)
  const gmstHours = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const gmstDeg = gmstHours * 15;
  let subLon = gmstDeg - (ra * 180) / Math.PI; // longitudinea punctului sub-solar
  subLon = ((((subLon + 180) % 360) + 360) % 360) - 180;

  return latLonToVec3((decl * 180) / Math.PI, subLon, 1, out).normalize();
}

/** GMST în secunde de arc unghiulare (grade) pentru propagare ECI→geodezic */
export function gstime(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const tut1 = (jd - 2451545.0) / 36525;
  let temp =
    -6.2e-6 * tut1 * tut1 * tut1 +
    0.093104 * tut1 * tut1 +
    (876600.0 * 3600 + 8640184.812866) * tut1 +
    67310.54841; // secunde
  temp = (((temp * (Math.PI / 180)) / 240.0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return temp; // radiani
}

const DEG = Math.PI / 180;

/** Unghiuri de vizibilitate (elevație/azimut) de la un observator la un satelit — model sferic */
export function lookAngles(
  obsLatDeg: number,
  obsLonDeg: number,
  satLatDeg: number,
  satLonDeg: number,
  satAltKm: number
): { elevationDeg: number; azimuthDeg: number } {
  const f1 = obsLatDeg * DEG;
  const f2 = satLatDeg * DEG;
  const dl = (satLonDeg - obsLonDeg) * DEG;

  // unghiul central observator → punct sub-satelit
  const cosPsi = Math.sin(f1) * Math.sin(f2) + Math.cos(f1) * Math.cos(f2) * Math.cos(dl);
  const psi = Math.acos(Math.min(1, Math.max(-1, cosPsi)));
  const k = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + satAltKm);
  const el = Math.atan2(Math.cos(psi) - k, Math.sin(psi));

  // azimut = direcția inițială de drum mare către punctul sub-satelit
  const az = Math.atan2(
    Math.sin(dl) * Math.cos(f2),
    Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  );
  return {
    elevationDeg: el / DEG,
    azimuthDeg: (((az / DEG) % 360) + 360) % 360,
  };
}

/** Test „satelit iluminat de Soare" — umbră cilindrică; poziții în raze Pământ, sun = vector unitar */
export function isSunlit(
  px: number, py: number, pz: number,
  sx: number, sy: number, sz: number
): boolean {
  const d = px * sx + py * sy + pz * sz;
  if (d >= 0) return true; // în emisfera diurnă
  const r2 = px * px + py * py + pz * pz;
  const perp2 = r2 - d * d;
  return perp2 >= 1; // în afara cilindrului de umbră (R_terra = 1)
}

/** Elevația Soarelui deasupra orizontului pentru un observator (grade) */
export function sunElevation(obsLatDeg: number, obsLonDeg: number, sunVec: { x: number; y: number; z: number }): number {
  const v = latLonToVec3(obsLatDeg, obsLonDeg, 1, new THREE.Vector3());
  const s = v.x * sunVec.x + v.y * sunVec.y + v.z * sunVec.z;
  return Math.asin(Math.min(1, Math.max(-1, s))) / DEG;
}

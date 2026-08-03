#!/usr/bin/env node
/**
 * Verifică sursele de date și validează propagarea față de o referință independentă.
 *
 * Documentul docs/SURSE-DE-DATE.md conține afirmații despre disponibilitate, CORS și
 * acuratețe. Scriptul acesta le re-testează, ca să nu ajungă niciodată doar folclor.
 *
 *   node scripts/verify-sources.mjs
 *
 * Iese cu cod 1 dacă o sursă critică nu răspunde.
 */
import * as satellite from 'satellite.js';

const ORIGIN = 'https://lilisat.local';

/**
 * `partial: true` cere doar primii kiloocteți, prin antetul Range.
 *
 * Nu e o optimizare de viteză, e politețe obligatorie: SATCAT are 6,7 MB și
 * SOCRATES 16,7 MB. Descărcate integral la fiecare verificare, CelesTrak încetează
 * pur și simplu să mai răspundă de la IP-ul tău — nu cu un cod de eroare, ci cu
 * timeout de conexiune. (Verificat pe pielea noastră, 3 august 2026.)
 */
const ENDPOINTS = [
  { name: 'CelesTrak GP (stations)', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle', critical: true, allow403: true },
  { name: 'CelesTrak Supplemental (starlink)', url: 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle', critical: true, allow403: true, partial: true },
  { name: 'CelesTrak Supplemental (oneweb)', url: 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=oneweb&FORMAT=tle', critical: false, allow403: true, partial: true },
  { name: 'CelesTrak SATCAT', url: 'https://celestrak.org/pub/satcat.csv', critical: false, partial: true },
  { name: 'CelesTrak SOCRATES (conjuncții)', url: 'https://celestrak.org/SOCRATES/sort-minRange.csv', critical: false, partial: true },
  { name: 'NOAA SWPC (Kp)', url: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', critical: false },
  { name: 'Launch Library 2', url: 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=1', critical: false },
  { name: 'wheretheiss.at (referință)', url: 'https://api.wheretheiss.at/v1/satellites/25544', critical: false },
];

const NOT_MODIFIED = 'has not updated since your last successful';

const pad = (s, n) => String(s).padEnd(n);
const fmtBytes = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(2)} MB` : n > 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${n} B`);

async function checkEndpoint(ep) {
  const headers = { Origin: ORIGIN };
  if (ep.partial) headers.Range = 'bytes=0-4095';
  try {
    const res = await fetch(ep.url, { headers, signal: AbortSignal.timeout(25000) });
    const body = await res.text();
    const cors = res.headers.get('access-control-allow-origin');
    const notModified = res.status === 403 && body.includes(NOT_MODIFIED);
    // 206 Partial Content e succes când am cerut doar un fragment
    const ok = res.ok || res.status === 206 || (ep.allow403 && notModified);
    const total = res.headers.get('content-range')?.split('/')?.[1];
    return {
      ...ep,
      status: res.status,
      cors,
      bytes: total ? Number(total) : body.length,
      truncated: !!total,
      ok,
      notModified,
    };
  } catch (err) {
    const cause = err?.cause?.code ?? '';
    return {
      ...ep,
      status: 0,
      cors: null,
      bytes: 0,
      ok: false,
      error: cause.includes('TIMEOUT') ? 'timeout — posibil limitare de la sursă' : String(err.message ?? err),
    };
  }
}

/** Compară poziția ISS propagată local cu un serviciu independent */
async function crossValidate() {
  const [tleRes, refRes] = await Promise.all([
    fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle'),
    fetch('https://api.wheretheiss.at/v1/satellites/25544'),
  ]);
  if (!tleRes.ok) return { skipped: 'CelesTrak nu a servit TLE-uri noi (throttling); rulează din nou peste 2 ore' };
  const lines = (await tleRes.text()).split('\n').map((l) => l.trimEnd());
  const i = lines.findIndex((l) => l.startsWith('ISS (ZARYA)'));
  if (i < 0) return { skipped: 'ISS nu a fost găsit în grupul stations' };

  const rec = satellite.twoline2satrec(lines[i + 1], lines[i + 2]);
  const ref = await refRes.json();
  const when = new Date(ref.timestamp * 1000);

  const pv = satellite.propagate(rec, when);
  const gmst = satellite.gstime(when);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const lat = (geo.latitude * 180) / Math.PI;
  let lon = (geo.longitude * 180) / Math.PI;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const vel = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);

  const kmLat = 111.32;
  const kmLon = 111.32 * Math.cos((ref.latitude * Math.PI) / 180);
  const groundKm = Math.hypot((lat - ref.latitude) * kmLat, (lon - ref.longitude) * kmLon);

  return {
    ours: { lat, lon, altKm: geo.height, velKmS: vel },
    ref: { lat: ref.latitude, lon: ref.longitude, altKm: ref.altitude, velKmS: ref.velocity / 3600 },
    groundKm,
    altDiffKm: geo.height - ref.altitude,
    velDiffKmS: vel - ref.velocity / 3600,
  };
}

console.log('\n  VERIFICARE SURSE DE DATE ORBITALE');
console.log(`  ${new Date().toISOString()}\n`);
console.log(`  ${pad('Sursă', 38)}${pad('Status', 9)}${pad('CORS', 7)}Dimensiune`);
console.log(`  ${'─'.repeat(72)}`);

const results = await Promise.all(ENDPOINTS.map(checkEndpoint));
for (const r of results) {
  const mark = r.ok ? '✓' : r.critical ? '✗' : '!';
  const status = r.notModified ? `403 nemod.` : r.status || 'eroare';
  console.log(`  ${mark} ${pad(r.name, 36)}${pad(status, 9)}${pad(r.cors === '*' ? 'da' : 'NU', 7)}${fmtBytes(r.bytes)}`);
}

console.log('\n  VALIDARE ÎNCRUCIȘATĂ — ISS (NORAD 25544)');
console.log(`  ${'─'.repeat(72)}`);
try {
  const v = await crossValidate();
  if (v.skipped) {
    console.log(`  … omis: ${v.skipped}`);
  } else {
    console.log(`  ${pad('', 22)}${pad('această aplicație', 22)}${pad('referință', 20)}diferență`);
    console.log(`  ${pad('latitudine', 22)}${pad(v.ours.lat.toFixed(4) + '°', 22)}${pad(v.ref.lat.toFixed(4) + '°', 20)}`);
    console.log(`  ${pad('longitudine', 22)}${pad(v.ours.lon.toFixed(4) + '°', 22)}${pad(v.ref.lon.toFixed(4) + '°', 20)}`);
    console.log(`  ${pad('altitudine', 22)}${pad(v.ours.altKm.toFixed(2) + ' km', 22)}${pad(v.ref.altKm.toFixed(2) + ' km', 20)}${v.altDiffKm.toFixed(3)} km`);
    console.log(`  ${pad('viteză', 22)}${pad(v.ours.velKmS.toFixed(3) + ' km/s', 22)}${pad(v.ref.velKmS.toFixed(3) + ' km/s', 20)}${v.velDiffKmS.toFixed(4)} km/s`);
    console.log(`\n  → abatere la sol: ${v.groundKm.toFixed(3)} km`);
    console.log(
      v.groundKm < 1
        ? '  → lanțul de propagare este consistent cu o implementare independentă'
        : '  → ATENȚIE: abatere neașteptată, verifică parsarea TLE și conversia ECI→geodezic'
    );
  }
} catch (err) {
  console.log(`  ✗ validarea a eșuat: ${err.message}`);
}

const failedCritical = results.filter((r) => r.critical && !r.ok);
console.log('');
if (failedCritical.length > 0) {
  console.log(`  ✗ ${failedCritical.length} sursă/surse critice indisponibile\n`);
  process.exit(1);
}
console.log('  ✓ toate sursele critice răspund\n');

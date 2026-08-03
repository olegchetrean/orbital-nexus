#!/usr/bin/env node
/**
 * Generează catalogul de repere cerești folosit de modul Cer.
 *
 * Sursa: d3-celestial (Olaf Frohn, BSD-2-Clause), care la rândul lui derivă
 * pozițiile din catalogul Hipparcos și figurile din setul IAU. Coordonatele
 * sunt J2000, cu ascensia dreaptă exprimată în grade pe intervalul [-180, 180]
 * — le aducem la [0, 360) ca să nu ne mai gândim la semn în timpul rulării.
 *
 * De ce ținem datele în repo și nu le cerem de pe rețea: harta stelară nu se
 * schimbă de la o zi la alta, iar aplicația trebuie să funcționeze pe un câmp,
 * noaptea, fără semnal.
 *
 * Uz: node scripts/build-sky-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(here, 'skydata');
const OUT = path.join(here, '..', 'src', 'lib', 'skyCatalog.ts');

/** limita de magnitudine: sub cer întunecat ochiul liber ajunge pe la 6 */
const MAG_LIMIT = 5.2;

const read = (f) => JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));

const norm = (ra) => (ra < 0 ? ra + 360 : ra);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// --- stele ---
const stars = read('stars6.json');
const names = read('starnames.json');

const kept = [];
for (const f of stars.features) {
  const mag = f.properties?.mag;
  if (typeof mag !== 'number' || mag > MAG_LIMIT) continue;
  const [ra, dec] = f.geometry.coordinates;
  const n = names[String(f.id)];
  kept.push({
    ra: norm(ra),
    dec,
    mag,
    // indicele de culoare B−V dă temperatura: negativ = albastru, mare = roșu
    bv: Number.parseFloat(f.properties?.bv) || 0,
    name: n?.name?.trim() || '',
  });
}
kept.sort((a, b) => a.mag - b.mag);

// pozițiile într-un singur șir plat: 3 numere per stea, fără obiecte intermediare
const flat = [];
for (const s of kept) flat.push(r3(s.ra), r3(s.dec), r2(s.mag), r2(s.bv));

// numele proprii doar pentru stelele care chiar servesc drept reper
const named = kept
  .map((s, i) => ({ i, name: s.name, mag: s.mag }))
  .filter((s) => s.name && s.mag <= 2.6)
  .map((s) => `[${s.i},'${s.name.replace(/'/g, "\\'")}']`);

// --- figurile constelațiilor ---
const lines = read('constellations.lines.json');
const consts = read('constellations.json');

const label = new Map();
for (const f of consts.features) {
  const [ra, dec] = f.geometry.coordinates;
  label.set(f.id, { ra: norm(ra), dec, la: f.properties.la || f.properties.name, en: f.properties.en });
}

const figures = [];
for (const f of lines.features) {
  const segs = f.geometry.coordinates.map((seg) =>
    seg.flatMap(([ra, dec]) => [r2(norm(ra)), r2(dec)])
  );
  const l = label.get(f.id);
  figures.push({ id: f.id, la: l?.la ?? f.id, ra: l ? r2(l.ra) : 0, dec: l ? r2(l.dec) : 0, segs });
}

const body = `/**
 * Repere cerești: stele până la magnitudinea ${MAG_LIMIT} și figurile celor
 * ${figures.length} de constelații. GENERAT AUTOMAT — nu edita manual.
 * Regenerare: node scripts/build-sky-catalog.mjs
 *
 * Proveniență: d3-celestial (Olaf Frohn, BSD-2-Clause), poziții Hipparcos J2000,
 * figuri după convenția IAU. Ascensia dreaptă în grade [0, 360), declinația în grade.
 */

/** patru numere per stea: ascensie dreaptă, declinație, magnitudine, indice B−V */
export const STARS = new Float32Array([
${chunk(flat, 16)}
]);

export const STAR_COUNT = ${kept.length};

/** numele proprii ale stelelor de reper: [index în STARS, nume] */
export const STAR_NAMES: ReadonlyArray<readonly [number, string]> = [
  ${named.join(',\n  ')}
];

export interface Constellation {
  /** abrevierea IAU din trei litere */
  id: string;
  /** numele latin, folosit la fel în română și în engleză pe hărțile stelare */
  la: string;
  /** punctul de ancorare al etichetei */
  ra: number;
  dec: number;
  /** liniile figurii; fiecare segment e o listă plată ra,dec,ra,dec… */
  segs: number[][];
}

export const CONSTELLATIONS: ReadonlyArray<Constellation> = ${JSON.stringify(figures)
  .replace(/\},\{/g, '},\n  {')
  .replace(/^\[/, '[\n  ')
  .replace(/\]$/, ',\n]')};
`;

function chunk(arr, per) {
  const out = [];
  for (let i = 0; i < arr.length; i += per) out.push('  ' + arr.slice(i, i + per).join(','));
  return out.join(',\n');
}

fs.writeFileSync(OUT, body);
console.log(
  `${kept.length} stele (mag ≤ ${MAG_LIMIT}), ${named.length} cu nume propriu, ` +
    `${figures.length} constelații → ${path.relative(process.cwd(), OUT)} ` +
    `(${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`
);

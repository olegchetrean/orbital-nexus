/**
 * Registrul surselor de date orbitale.
 *
 * Fiecare intrare de aici a fost verificată prin cerere HTTP reală (cod de răspuns,
 * antet CORS, dimensiune, cadență). Documentația completă: docs/SURSE-DE-DATE.md
 *
 * Regula casei: nu afișăm niciodată o cifră fără să știm de unde vine și cât e de veche.
 */

import type { Bi } from './i18n';

export type SourceTier = 'primary' | 'operator' | 'metadata' | 'context' | 'server-only';

export interface DataSource {
  id: string;
  /** nume propriu — nu se traduce */
  label: string;
  /** Cine produce efectiv datele (nu cine le găzduiește) */
  origin: Bi;
  tier: SourceTier;
  /** Cât de des se schimbă datele la sursă */
  cadence: Bi;
  /** Acuratețe tipică a poziției rezultate */
  accuracy: Bi;
  license: string;
  homepage: string;
  /** Accesibil direct din browser? (verificat: antet access-control-allow-origin) */
  cors: boolean;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'celestrak-gp',
    label: 'CelesTrak — General Perturbations (GP)',
    origin: {
      ro: 'US Space Force / 18th & 19th SDS, redistribuit de CelesTrak (Dr. T.S. Kelso)',
      en: 'US Space Force / 18th & 19th SDS, redistributed by CelesTrak (Dr T.S. Kelso)',
    },
    tier: 'primary',
    cadence: { ro: 'la fiecare 2 ore', en: 'every 2 hours' },
    accuracy: {
      ro: '~1–3 km la epocă, degradare ~1–3 km/zi',
      en: '~1–3 km at epoch, degrading ~1–3 km/day',
    },
    license: 'CelesTrak Data Use Policy',
    homepage: 'https://celestrak.org/NORAD/elements/',
    cors: true,
  },
  {
    id: 'celestrak-supplemental',
    label: 'CelesTrak — Supplemental GP',
    origin: {
      ro: 'SpaceX / OneWeb / Iridium / Planet — efemeride publicate de operatorii înșiși',
      en: 'SpaceX / OneWeb / Iridium / Planet — ephemeris published by the operators themselves',
    },
    tier: 'operator',
    cadence: { ro: 'de 1–4 ori pe zi, în funcție de operator', en: '1–4 times a day, depending on the operator' },
    accuracy: {
      ro: 'sub 1 km — include manevrele planificate, pe care catalogul public nu le vede',
      en: 'under 1 km — includes planned manoeuvres the public catalogue cannot see',
    },
    license: 'CelesTrak Data Use Policy',
    homepage: 'https://celestrak.org/NORAD/elements/supplemental/',
    cors: true,
  },
  {
    id: 'celestrak-satcat',
    label: 'CelesTrak — SATCAT',
    origin: {
      ro: 'US Space Force, îmbogățit de CelesTrak',
      en: 'US Space Force, enriched by CelesTrak',
    },
    tier: 'metadata',
    cadence: { ro: 'zilnic', en: 'daily' },
    accuracy: { ro: 'metadate, nu poziții', en: 'metadata, not positions' },
    license: 'CelesTrak Data Use Policy',
    homepage: 'https://celestrak.org/satcat/',
    cors: true,
  },
  {
    id: 'swpc',
    label: 'NOAA SWPC',
    origin: {
      ro: 'NOAA Space Weather Prediction Center (agenție guvernamentală SUA)',
      en: 'NOAA Space Weather Prediction Center (US government agency)',
    },
    tier: 'context',
    cadence: { ro: 'la 1–3 minute (Kp la 3 ore)', en: 'every 1–3 minutes (Kp every 3 hours)' },
    accuracy: { ro: 'măsurători instrumentale', en: 'instrument measurements' },
    license: 'public domain (US Government work)',
    homepage: 'https://www.swpc.noaa.gov/',
    cors: true,
  },
  {
    id: 'launchlibrary',
    label: 'Launch Library 2',
    origin: {
      ro: 'The Space Devs (comunitate, cu verificare editorială)',
      en: 'The Space Devs (community, editorially verified)',
    },
    tier: 'context',
    cadence: { ro: 'continuu', en: 'continuous' },
    accuracy: { ro: 'orar de lansare, ferestre', en: 'launch schedules and windows' },
    license: 'CC BY 4.0',
    homepage: 'https://thespacedevs.com/llapi',
    cors: true,
  },
  {
    id: 'spacetrack',
    label: 'Space-Track.org',
    origin: {
      ro: 'US Space Force — sursa primară a catalogului',
      en: 'US Space Force — the catalogue’s primary source',
    },
    tier: 'server-only',
    cadence: { ro: 'de mai multe ori pe zi', en: 'several times a day' },
    accuracy: { ro: 'identică cu GP (aceeași sursă)', en: 'identical to GP (same source)' },
    license: 'USG Data Use Agreement — account required',
    homepage: 'https://www.space-track.org/',
    cors: false,
  },
  {
    id: 'satnogs',
    label: 'SatNOGS DB',
    origin: {
      ro: 'Libre Space Foundation — rețea globală de stații radio amatoare',
      en: 'Libre Space Foundation — global network of amateur radio stations',
    },
    tier: 'server-only',
    cadence: { ro: 'continuu', en: 'continuous' },
    accuracy: { ro: 'confirmare de semnal, nu poziție', en: 'signal confirmation, not position' },
    license: 'AGPL-3.0 / CC BY-SA',
    homepage: 'https://db.satnogs.org/',
    cors: false,
  },
];

/* ---------------- CelesTrak: endpoint-uri ---------------- */

const GP_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const SUP_BASE = 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php';

export const gpUrl = (group: string) =>
  `${GP_BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;

export const supplementalUrl = (file: string) =>
  `${SUP_BASE}?FILE=${encodeURIComponent(file)}&FORMAT=tle`;

/**
 * CelesTrak semnalează „ai deja versiunea curentă" printr-un 403 cu corp text,
 * nu printr-un 304. Fără recunoașterea asta, orice client crede că e o eroare
 * de rețea și cade pe date vechi.
 */
export const NOT_MODIFIED_MARKER = 'has not updated since your last successful';

export function isNotModifiedResponse(status: number, body: string): boolean {
  return status === 403 && body.includes(NOT_MODIFIED_MARKER);
}

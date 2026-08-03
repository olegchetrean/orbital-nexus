import { cacheGet, cacheSet } from './cache';
import type { Bi, Lang } from './i18n';

/**
 * SATCAT — catalogul de obiecte al CelesTrak.
 *
 * TLE-ul îți spune UNDE e obiectul. Nu-ți spune ce e, cine l-a lansat, când, de
 * unde, dacă mai funcționează sau dacă e o bucată ruptă dintr-o rachetă. Astea
 * vin de aici. Fișierul are ~6,7 MB, deci se încarcă leneș, după ce globul e deja
 * pe ecran, și se ține în cache o zi.
 */

const SATCAT_URL = 'https://celestrak.org/pub/satcat.csv';
const CACHE_KEY = 'satcat:csv';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface SatcatEntry {
  name: string;
  objectId: string;
  /** PAY = satelit, R/B = etaj de rachetă, DEB = fragment */
  objectType: string;
  /** cod de stare operațională CelesTrak */
  opsStatus: string;
  owner: string;
  launchDate: string;
  launchSite: string;
  decayDate: string;
  /** secțiune radar echivalentă, m² */
  rcs: number | null;
}

/** Coduri de proprietar CelesTrak → denumiri lizibile (cele întâlnite frecvent) */
const OWNERS: Record<string, Bi> = {
  US: { ro: 'Statele Unite', en: 'United States' },
  CIS: { ro: 'Rusia / CSI', en: 'Russia / CIS' },
  PRC: { ro: 'China', en: 'China' },
  ESA: { ro: 'Agenția Spațială Europeană', en: 'European Space Agency' },
  FR: { ro: 'Franța', en: 'France' },
  JPN: { ro: 'Japonia', en: 'Japan' },
  IND: { ro: 'India', en: 'India' },
  UK: { ro: 'Regatul Unit', en: 'United Kingdom' },
  GER: { ro: 'Germania', en: 'Germany' },
  ITSO: { ro: 'Intelsat', en: 'Intelsat' },
  SES: { ro: 'SES', en: 'SES' },
  ORB: { ro: 'ORBCOMM', en: 'ORBCOMM' },
  GLOB: { ro: 'Globalstar', en: 'Globalstar' },
  IRID: { ro: 'Iridium', en: 'Iridium' },
  CA: { ro: 'Canada', en: 'Canada' },
  IT: { ro: 'Italia', en: 'Italy' },
  SPN: { ro: 'Spania', en: 'Spain' },
  NETH: { ro: 'Țările de Jos', en: 'Netherlands' },
  SWED: { ro: 'Suedia', en: 'Sweden' },
  NOR: { ro: 'Norvegia', en: 'Norway' },
  DEN: { ro: 'Danemarca', en: 'Denmark' },
  FIN: { ro: 'Finlanda', en: 'Finland' },
  POL: { ro: 'Polonia', en: 'Poland' },
  CZCH: { ro: 'Cehia', en: 'Czechia' },
  TURK: { ro: 'Turcia', en: 'Türkiye' },
  ISRA: { ro: 'Israel', en: 'Israel' },
  SKOR: { ro: 'Coreea de Sud', en: 'South Korea' },
  NKOR: { ro: 'Coreea de Nord', en: 'North Korea' },
  BRAZ: { ro: 'Brazilia', en: 'Brazil' },
  ARGN: { ro: 'Argentina', en: 'Argentina' },
  AUS: { ro: 'Australia', en: 'Australia' },
  NZ: { ro: 'Noua Zeelandă', en: 'New Zealand' },
  UAE: { ro: 'Emiratele Arabe Unite', en: 'United Arab Emirates' },
  SAUD: { ro: 'Arabia Saudită', en: 'Saudi Arabia' },
  EGYP: { ro: 'Egipt', en: 'Egypt' },
  LUXE: { ro: 'Luxemburg', en: 'Luxembourg' },
  ROM: { ro: 'România', en: 'Romania' },
  UKR: { ro: 'Ucraina', en: 'Ukraine' },
  BEL: { ro: 'Belgia', en: 'Belgium' },
  SWTZ: { ro: 'Elveția', en: 'Switzerland' },
  AUST: { ro: 'Austria', en: 'Austria' },
  POR: { ro: 'Portugalia', en: 'Portugal' },
  GREC: { ro: 'Grecia', en: 'Greece' },
  HUN: { ro: 'Ungaria', en: 'Hungary' },
  BGR: { ro: 'Bulgaria', en: 'Bulgaria' },
  LTU: { ro: 'Lituania', en: 'Lithuania' },
  EST: { ro: 'Estonia', en: 'Estonia' },
  LVA: { ro: 'Letonia', en: 'Latvia' },
  SVN: { ro: 'Slovenia', en: 'Slovenia' },
  TBD: { ro: 'nedeclarat', en: 'undeclared' },
  ISS: { ro: 'ISS (multinațional)', en: 'ISS (multinational)' },
};

const OBJECT_TYPES: Record<string, Bi> = {
  PAY: { ro: 'satelit', en: 'satellite' },
  'R/B': { ro: 'etaj de rachetă', en: 'rocket body' },
  DEB: { ro: 'fragment / deșeu', en: 'debris' },
  UNK: { ro: 'neclasificat', en: 'unclassified' },
};

/** Coduri de stare operațională din SATCAT */
const OPS_STATUS: Record<string, Bi> = {
  '+': { ro: 'operațional', en: 'operational' },
  '-': { ro: 'nefuncțional', en: 'non-operational' },
  P: { ro: 'parțial operațional', en: 'partially operational' },
  B: { ro: 'rezervă / în așteptare', en: 'backup / standby' },
  S: { ro: 'de rezervă', en: 'spare' },
  X: { ro: 'extins dincolo de misiune', en: 'extended mission' },
  D: { ro: 'a reintrat în atmosferă', en: 'decayed' },
  '?': { ro: 'stare necunoscută', en: 'unknown status' },
};

export const ownerLabel = (code: string, lang: Lang) => OWNERS[code]?.[lang] ?? code;
export const objectTypeLabel = (code: string, lang: Lang) => OBJECT_TYPES[code]?.[lang] ?? code;
export const opsStatusLabel = (code: string, lang: Lang) =>
  OPS_STATUS[code]?.[lang] ?? (code || '—');

/** Împarte o linie CSV respectând ghilimelele (numele conțin virgule) */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parse(csv: string): Map<number, SatcatEntry> {
  const map = new Map<number, SatcatEntry>();
  const lines = csv.split('\n');
  // OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,
  // LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE,PERIOD,INCLINATION,APOGEE,PERIGEE,RCS,…
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 20) continue;
    const f = splitCsvLine(line);
    const norad = parseInt(f[2], 10);
    if (!Number.isFinite(norad)) continue;
    const rcs = parseFloat(f[13]);
    map.set(norad, {
      name: f[0],
      objectId: f[1],
      objectType: f[3],
      opsStatus: f[4],
      owner: f[5],
      launchDate: f[6],
      launchSite: f[7],
      decayDate: f[8],
      rcs: Number.isFinite(rcs) ? rcs : null,
    });
  }
  return map;
}

let inflight: Promise<Map<number, SatcatEntry>> | null = null;

/** Încarcă (o singură dată) catalogul de metadate. Nu blochează pornirea aplicației. */
export function loadSatcat(): Promise<Map<number, SatcatEntry>> {
  if (inflight) return inflight;
  inflight = (async () => {
    const cached = await cacheGet(CACHE_KEY);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return parse(cached.text);
    }
    try {
      // 6,7 MB, deci un termen mai generos decât la elementele orbitale — dar tot
      // un termen: o cerere care nu răspunde niciodată ține referința vie degeaba
      const res = await fetch(SATCAT_URL, { signal: AbortSignal.timeout(45_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length < 1000) throw new Error('răspuns prea scurt');
      await cacheSet(CACHE_KEY, text);
      return parse(text);
    } catch {
      // mai bine metadatele vechi decât deloc
      if (cached) return parse(cached.text);
      return new Map<number, SatcatEntry>();
    }
  })();
  return inflight;
}

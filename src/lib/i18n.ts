import { createContext, useContext } from 'react';

/**
 * Stratul bilingv.
 *
 * Toate textele vizibile trec pe aici. Limba se detectează din browser, se poate
 * forța din URL (`?lang=en`) și se ține minte între vizite. Formatarea numerelor
 * și a datelor urmează limba activă — un „11.894" românesc devine „11,894" în
 * engleză, altfel cifrele mint prin punctuație.
 */

export type Lang = 'ro' | 'en';
export const LANGS: Lang[] = ['ro', 'en'];

/** Pereche de traduceri pentru date structurate din afara dicționarului */
export interface Bi {
  ro: string;
  en: string;
}
export const bi = (v: Bi, lang: Lang) => v[lang];

const DICT = {
  /* --- generale --- */
  appName: { ro: 'ORBITAL NEXUS', en: 'ORBITAL NEXUS' },
  tagline: {
    ro: 'Vizualizare globală a sateliților în timp real',
    en: 'Global real-time satellite tracking',
  },
  subtitle: {
    ro: 'propagare SGP4 în browser · date CelesTrak',
    en: 'SGP4 propagation in your browser · CelesTrak data',
  },
  loadingCatalog: { ro: 'Inițializare catalog orbital…', en: 'Initialising orbital catalogue…' },
  loadingDownload: { ro: 'Descărcare date orbitale CelesTrak… {pct}%', en: 'Downloading CelesTrak orbital data… {pct}%' },
  close: { ro: 'Închide', en: 'Close' },

  /* --- antet --- */
  searchPlaceholder: { ro: 'Caută satelit (nume sau NORAD ID)…', en: 'Search satellite (name or NORAD ID)…' },
  viewGlobe: { ro: 'Glob', en: 'Globe' },
  viewMap: { ro: 'Hartă', en: 'Map' },
  viewGlobeTitle: { ro: 'Glob 3D', en: '3D globe' },
  viewMapTitle: { ro: 'Hartă plată', en: 'Flat map' },

  /* --- filtre --- */
  filtersTitle: { ro: 'Filtre constelații', en: 'Constellation filters' },
  catStation: { ro: 'Stații spațiale', en: 'Space stations' },
  catStarlink: { ro: 'Starlink', en: 'Starlink' },
  catOneweb: { ro: 'OneWeb', en: 'OneWeb' },
  catIridium: { ro: 'Iridium', en: 'Iridium' },
  catGnss: { ro: 'GNSS (GPS/Galileo…)', en: 'GNSS (GPS/Galileo…)' },
  catWeather: { ro: 'Meteo & GEO', en: 'Weather & GEO' },
  catOther: { ro: 'Alți sateliți', en: 'Other satellites' },

  btnStarlink: { ro: '☄ Modul Starlink', en: '☄ Starlink module' },
  btnAltitude: { ro: '▤ Densitate altitudine', en: '▤ Altitude density' },
  btnObserver: { ro: '👁 Mod Observator', en: '👁 Observer mode' },
  btnSources: { ro: 'ⓘ Sursele de date', en: 'ⓘ Data sources' },

  /* --- fișa obiectului --- */
  trackingOn: { ro: '◉ Urmărire activă', en: '◉ Tracking on' },
  trackingOff: { ro: '◎ Urmărește', en: '◎ Track' },
  whenVisible: { ro: '👁 Când îl văd?', en: '👁 When can I see it?' },
  reentered: { ro: 'a reintrat {date}', en: 'reentered {date}' },
  launched: { ro: 'Lansat', en: 'Launched' },
  launchSite: { ro: 'De la', en: 'From' },
  radarCrossSection: { ro: 'Secțiune radar', en: 'Radar cross-section' },
  noradId: { ro: 'NORAD ID', en: 'NORAD ID' },
  intlDesignator: { ro: 'Designator internațional', en: 'Int’l designator' },
  altitude: { ro: 'Altitudine', en: 'Altitude' },
  speed: { ro: 'Viteză', en: 'Speed' },
  latLon: { ro: 'Latitudine / Longitudine', en: 'Latitude / Longitude' },
  orbitalPeriod: { ro: 'Perioadă orbitală', en: 'Orbital period' },
  inclination: { ro: 'Înclinare', en: 'Inclination' },
  eccentricity: { ro: 'Excentricitate', en: 'Eccentricity' },
  apogeePerigee: { ro: 'Apogeu / Perigeu', en: 'Apogee / Perigee' },
  raan: { ro: 'RAAN', en: 'RAAN' },

  provenanceTitle: { ro: 'Proveniența datelor', en: 'Data provenance' },
  operatorEphemeris: { ro: 'efemeride operator', en: 'operator ephemeris' },
  publicCatalog: { ro: 'catalog public', en: 'public catalogue' },
  elementsAge: { ro: 'Elemente orbitale vechi de {age}', en: 'Orbital elements are {age} old' },
  estimatedError: { ro: 'Eroare de poziție estimată: ±{km} km', en: 'Estimated position error: ±{km} km' },
  ageMinutes: { ro: '{n} min', en: '{n} min' },
  ageHours: { ro: '{n} ore', en: '{n} hours' },
  ageDays: { ro: '{n} zile', en: '{n} days' },

  /* --- tooltip --- */
  operatorEphemerisShort: { ro: 'efemeride de la operator', en: 'operator-published ephemeris' },

  /* --- control timp --- */
  live: { ro: 'LIVE', en: 'LIVE' },
  paused: { ro: 'pe pauză', en: 'paused' },
  backToLive: { ro: 'Revino la timpul real', en: 'Back to real time' },
  scrubTime: { ro: 'Derulează timpul', en: 'Scrub through time' },
  play: { ro: 'Redare', en: 'Play' },
  pause: { ro: 'Pauză', en: 'Pause' },

  /* --- bara de stare --- */
  objects: { ro: 'obiecte', en: 'objects' },
  srcLive: { ro: '● date curente', en: '● current data' },
  srcCache: { ro: '● din cache local', en: '● from local cache' },
  srcStale: { ro: '▲ copie veche — sursa nu răspunde', en: '▲ stale copy — source unreachable' },
  srcFallback: { ro: '▲ set de rezervă — NU e timp real', en: '▲ fallback set — NOT real time' },
  srcLoading: { ro: '● se încarcă', en: '● loading' },
  seeSources: { ro: 'Vezi sursele de date', en: 'See the data sources' },
  streaksHint: { ro: 'dârele arată direcția de mers', en: 'trails show direction of travel' },
  canvasHint: {
    ro: 'Click pe un satelit pentru detalii · trage pentru rotire · scroll pentru zoom',
    en: 'Click a satellite for details · drag to rotate · scroll to zoom',
  },

  /* --- Starlink --- */
  starlinkModule: { ro: 'Modul Starlink', en: 'Starlink module' },
  satellitesTracked: { ro: '{n} sateliți urmăriți', en: '{n} satellites tracked' },
  inclShort: { ro: 'încl.', en: 'incl.' },
  starlinkNote: {
    ro: 'Clasificare shell-uri derivată automat din înclinarea și altitudinea medie a fiecărui satelit (date TLE CelesTrak).',
    en: 'Shells are derived automatically from each satellite’s inclination and mean altitude (CelesTrak TLE data).',
  },
  shell1: { ro: 'Shell 1', en: 'Shell 1' },
  shell2: { ro: 'Shell 2', en: 'Shell 2' },
  shell3: { ro: 'Shell 3', en: 'Shell 3' },
  shell4: { ro: 'Shell 4', en: 'Shell 4' },
  shellLow: { ro: 'Orbite joase / ridicare după lansare', en: 'Low orbits / post-launch raising' },
  shellOther: { ro: 'Alte orbite', en: 'Other orbits' },
  shellVariable: { ro: 'variabil', en: 'variable' },

  /* --- altitudine --- */
  orbitalDensity: { ro: 'Densitate orbitală', en: 'Orbital density' },
  objectsAtBand: { ro: '{n} obiecte la {lo}–{hi} km', en: '{n} objects at {lo}–{hi} km' },
  pickAltitude: { ro: 'Selectează o altitudine', en: 'Pick an altitude' },
  altitudeBand: { ro: 'Altitudine (banda ±50 km)', en: 'Altitude (±50 km band)' },
  resetView: { ro: 'Resetează vizualizarea', en: 'Reset view' },
  altitudeNote: {
    ro: 'Histogramă pe scară logaritmică din altitudinile medii TLE. Shell-ul translucid de pe glob marchează altitudinea selectată.',
    en: 'Logarithmic histogram of mean TLE altitudes. The translucent shell on the globe marks the selected altitude.',
  },
  binObjects: { ro: '{label}: {n} obiecte', en: '{label}: {n} objects' },

  /* --- observator --- */
  observerMode: { ro: 'Mod Observator', en: 'Observer mode' },
  pickLocation: { ro: 'Alege o locație', en: 'Pick a location' },
  locating: { ro: '⏳ Se determină locația…', en: '⏳ Locating…' },
  useMyLocation: { ro: '📍 Folosește locația mea (GPS)', en: '📍 Use my location (GPS)' },
  setLocation: { ro: 'Setează', en: 'Set' },
  locationError: {
    ro: 'Locația nu a putut fi determinată. Introdu coordonate manual.',
    en: 'Could not determine your location. Enter coordinates manually.',
  },
  pickLocationFirst: { ro: 'Alege întâi o locație de observare.', en: 'Pick an observing location first.' },
  propagatingCatalog: { ro: 'Se propagă catalogul…', en: 'Propagating the catalogue…' },
  propagatingHint: {
    ro: 'primul rezultat apare în câteva zecimi de secundă',
    en: 'first result appears in a fraction of a second',
  },
  aboveHorizon: { ro: 'deasupra orizontului', en: 'above the horizon' },
  observableNow: { ro: 'observabili acum', en: 'observable now' },
  nightAtObserver: {
    ro: '🌙 Noapte la observator (Soarele la {deg}° sub orizont) — condiții bune de observare',
    en: '🌙 Night where you are (Sun {deg}° below the horizon) — good observing conditions',
  },
  dayAtObserver: {
    ro: '☀️ Zi/crepuscul la observator (Soarele la {deg}°) — sateliții sunt greu de văzut cu ochiul liber',
    en: '☀️ Day/twilight where you are (Sun at {deg}°) — satellites are hard to see unaided',
  },
  noneObservable: { ro: 'Niciun satelit observabil în acest moment.', en: 'No satellite observable right now.' },
  whatsUpTonight: { ro: '🌙 Ce se vede la noapte', en: '🌙 What’s visible tonight' },
  calculating: { ro: '⏳ Se calculează…', en: '⏳ Calculating…' },
  refreshGps: { ro: 'Actualizează locația GPS', en: 'Refresh GPS location' },
  sunlit: { ro: 'Iluminat de Soare', en: 'Sunlit' },
  inShadow: { ro: 'În umbra Pământului', en: 'In Earth’s shadow' },
  observerNote: {
    ro: 'Observabil = elevație > 10°, satelit iluminat de Soare și noapte la observator (Soare sub −6°). Punctele evidențiate pe glob sunt sateliții observabili.',
    en: 'Observable = elevation above 10°, satellite sunlit, and night where you are (Sun below −6°). Highlighted points on the globe are the observable ones.',
  },

  /* --- treceri --- */
  passesTitle: { ro: 'Treceri în următoarele 24 h', en: 'Passes in the next 24 h' },
  onlyNakedEye: { ro: 'Doar ce se vede cu ochiul liber', en: 'Only what’s visible to the naked eye' },
  propagating24h: { ro: 'Se propagă orbitele pe 24 de ore…', en: 'Propagating orbits over 24 hours…' },
  runsInBackground: { ro: 'calculul rulează în fundal', en: 'the computation runs in the background' },
  noPassesMatch: { ro: 'Nicio trecere care să corespundă filtrului.', en: 'No pass matches the filter.' },
  litButFaintHint: {
    ro: '{n} treceri au condițiile de lumină bune, dar sunt prea slabe pentru ochiul liber. Debifează filtrul ca să le vezi.',
    en: '{n} passes have good lighting conditions but are too faint for the naked eye. Untick the filter to see them.',
  },
  noneLitHint: {
    ro: 'Debifează filtrul: obiectele fie trec ziua, fie intră în umbra Pământului deasupra ta.',
    en: 'Untick the filter: the objects either pass in daylight or enter Earth’s shadow overhead.',
  },
  neverRisesHint: {
    ro: 'Din această latitudine, obiectul nu urcă deasupra pragului de 10°.',
    en: 'From this latitude the object never rises above the 10° threshold.',
  },
  badgeNakedEye: { ro: 'ochi liber', en: 'naked eye' },
  badgeLit: { ro: 'iluminat', en: 'sunlit' },
  badgeInvisible: { ro: 'invizibil', en: 'invisible' },
  badgeLitTitle: {
    ro: 'Iluminat de Soare și cer întunecat la tine, dar prea slab ca să-l vezi fără instrument',
    en: 'Sunlit with dark skies where you are, but too faint to see without optics',
  },
  badgeInvisibleTitle: {
    ro: 'Trece, dar fie e ziuă la tine, fie satelitul e în umbra Pământului',
    en: 'It passes, but either it’s daylight where you are or the satellite is in Earth’s shadow',
  },
  passGeometry: {
    ro: 'răsare {rise} → max {maxEl}° {maxAz} → apune {set}',
    en: 'rises {rise} → max {maxEl}° {maxAz} → sets {set}',
  },
  estimatedBrightness: { ro: 'strălucire estimată', en: 'estimated brightness' },
  magVeryBright: { ro: ' — foarte luminos, nu ai cum să-l ratezi', en: ' — very bright, impossible to miss' },
  magEasy: { ro: ' — ușor de văzut', en: ' — easy to spot' },
  magClearSky: { ro: ' — vizibil pe cer curat', en: ' — visible under clear skies' },
  magBorderline: { ro: ' — la limita ochiului, doar departe de oraș', en: ' — borderline, only away from city lights' },
  magTooFaint: { ro: ' — prea slab pentru ochiul liber, doar cu binoclu', en: ' — too faint for the naked eye, binoculars only' },
  passesNote: {
    ro: 'Orele sunt în fusul tău local. Apasă o trecere ca să duci ceasul simulării acolo. „Ochi liber” = satelitul e luminat de Soare, la tine e deja noapte și magnitudinea estimată e sub {mag}. Magnitudinea rămâne o estimare: un reflex de panou solar o poate schimba cu câteva trepte, în ambele sensuri.',
    en: 'Times are in your local time zone. Tap a pass to jump the simulation clock there. “Naked eye” = the satellite is sunlit, it is already night where you are, and the estimated magnitude is below {mag}. Magnitude is an estimate: a solar-panel glint can shift it by several steps either way.',
  },
  scopeObjects: { ro: '{n} obiecte luminoase · {lat}°, {lon}°', en: '{n} bright objects · {lat}°, {lon}°' },
  scopeDropped: { ro: ' ({n} obiecte peste limită, neanalizate)', en: ' ({n} objects over the cap, not analysed)' },

  /* --- surse --- */
  whereDataComesFrom: { ro: 'De unde vin datele', en: 'Where the data comes from' },
  updatedAt: { ro: 'Actualizat {time}', en: 'Updated {time}' },
  noSuccessfulFetch: { ro: 'Fără descărcare reușită', en: 'No successful download' },
  preferOperator: { ro: 'Preferă efemeridele de la operatori', en: 'Prefer operator-published ephemeris' },
  preferOperatorHint: {
    ro: 'SpaceX, OneWeb și Iridium își publică propriile date. Includ manevrele planificate, pe care catalogul public le vede abia după ce s-au produs.',
    en: 'SpaceX, OneWeb and Iridium publish their own data. It includes planned manoeuvres, which the public catalogue only sees after they happen.',
  },
  forceReload: { ro: '↻ Forțează reîncărcarea', en: '↻ Force reload' },
  reloading: { ro: '⏳ Se reinterogează sursele…', en: '⏳ Re-querying the sources…' },
  statusCurrent: { ro: 'actual', en: 'current' },
  statusCache: { ro: 'din cache', en: 'cached' },
  statusStale: { ro: 'copie veche', en: 'stale' },
  statusFailed: { ro: 'indisponibil', en: 'unavailable' },
  sourceCadence: { ro: 'actualizare: {v}', en: 'updates: {v}' },
  sourceAccuracy: { ro: 'precizie: {v}', en: 'accuracy: {v}' },
  attribution: {
    ro: 'Date orbitale: CelesTrak (celestrak.org), pe baza catalogului US Space Force. Efemeride suplimentare: operatorii constelațiilor.',
    en: 'Orbital data: CelesTrak (celestrak.org), based on the US Space Force catalogue. Supplemental ephemeris: the constellation operators.',
  },

  /* --- grupuri de date --- */
  grpStations: { ro: 'Stații spațiale', en: 'Space stations' },
  grpStarlinkCat: { ro: 'Starlink (catalog)', en: 'Starlink (catalogue)' },
  grpOnewebCat: { ro: 'OneWeb (catalog)', en: 'OneWeb (catalogue)' },
  grpIridiumNext: { ro: 'Iridium NEXT', en: 'Iridium NEXT' },
  grpGps: { ro: 'GPS', en: 'GPS' },
  grpGlonass: { ro: 'GLONASS', en: 'GLONASS' },
  grpGalileo: { ro: 'Galileo', en: 'Galileo' },
  grpBeidou: { ro: 'BeiDou', en: 'BeiDou' },
  grpWeather: { ro: 'Meteo', en: 'Weather' },
  grpBrightest: { ro: 'Cei mai strălucitori', en: 'Brightest objects' },
  grpStarlinkOp: { ro: 'Starlink (SpaceX)', en: 'Starlink (SpaceX)' },
  grpOnewebOp: { ro: 'OneWeb (Eutelsat)', en: 'OneWeb (Eutelsat)' },
  grpIridiumOp: { ro: 'Iridium', en: 'Iridium' },
  grpFallback: { ro: 'Set de rezervă inclus în aplicație', en: 'Fallback set bundled with the app' },
} as const;

export type Key = keyof typeof DICT;

/** Puncte cardinale — „SV" în română, „SW" în engleză */
const COMPASS: Record<Lang, string[]> = {
  ro: ['N', 'NE', 'E', 'SE', 'S', 'SV', 'V', 'NV'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
};

export const LOCALE: Record<Lang, string> = { ro: 'ro-RO', en: 'en-GB' };

export interface Translator {
  lang: Lang;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  /** traduce o pereche {ro, en} venită din date structurate */
  b: (v: Bi) => string;
  num: (n: number) => string;
  compass: (azimuthDeg: number) => string;
  dateTime: (ms: number) => string;
  clock: (ms: number) => string;
  setLang: (l: Lang) => void;
}

export function makeTranslator(lang: Lang, setLang: (l: Lang) => void): Translator {
  const locale = LOCALE[lang];
  return {
    lang,
    setLang,
    t: (key, vars) => {
      let s: string = DICT[key][lang];
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      }
      return s;
    },
    b: (v) => v[lang],
    num: (n) => n.toLocaleString(locale),
    compass: (az) => COMPASS[lang][Math.round(az / 45) % 8],
    dateTime: (ms) =>
      new Date(ms).toLocaleString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    clock: (ms) => new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  };
}

/** Limba inițială: parametru URL > alegere memorată > limba browserului > română */
export function detectLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'ro' || q === 'en') return q;
    const saved = localStorage.getItem('lili-sat-lang');
    if (saved === 'ro' || saved === 'en') return saved;
    const nav = navigator.language?.toLowerCase() ?? '';
    if (nav.startsWith('ro')) return 'ro';
    return 'en';
  } catch {
    return 'ro';
  }
}

export const I18nContext = createContext<Translator>(makeTranslator('ro', () => {}));
export const useI18n = () => useContext(I18nContext);

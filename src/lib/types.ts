export type CategoryId =
  | 'station'
  | 'starlink'
  | 'oneweb'
  | 'iridium'
  | 'gnss'
  | 'weather'
  | 'other';

export interface Category {
  id: CategoryId;
  /** cheie de traducere, nu text — eticheta se rezolvă la randare */
  labelKey: 'catStation' | 'catStarlink' | 'catOneweb' | 'catIridium' | 'catGnss' | 'catWeather' | 'catOther';
  color: string; // hex
}

export const CATEGORIES: Category[] = [
  { id: 'station', labelKey: 'catStation', color: '#ffd166' },
  { id: 'starlink', labelKey: 'catStarlink', color: '#38e1ff' },
  { id: 'oneweb', labelKey: 'catOneweb', color: '#b18cff' },
  { id: 'iridium', labelKey: 'catIridium', color: '#ff9f43' },
  { id: 'gnss', labelKey: 'catGnss', color: '#7bed9f' },
  { id: 'weather', labelKey: 'catWeather', color: '#ff6b81' },
  { id: 'other', labelKey: 'catOther', color: '#a4b0be' },
];

export const CATEGORY_COLOR: Record<CategoryId, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.color])
) as Record<CategoryId, string>;

export interface SatelliteEntry {
  name: string;
  noradId: number;
  intlDes: string;
  tle1: string;
  tle2: string;
  category: CategoryId;
  group: string;
  /** Cheie de traducere pentru sursa datelor, afișată în interfață */
  sourceKey: string;
  /** true = efemeride publicate de operatorul constelației, nu doar catalog public */
  operatorData: boolean;
  /** momentul pentru care sunt valabile elementele orbitale (ms epoch) */
  epochMs: number;
}

export interface SatTelemetry {
  lat: number; // grade
  lon: number; // grade
  altKm: number;
  velKmS: number;
  periodMin: number;
  inclinationDeg: number;
  eccentricity: number;
  apogeeKm: number;
  perigeeKm: number;
  raanDeg: number;
}

export interface StarlinkShell {
  id: string;
  labelKey: 'shell1' | 'shell2' | 'shell3' | 'shell4' | 'shellLow' | 'shellOther';
  /** null = altitudine variabilă, se traduce la randare */
  altitude: string | null;
  inclination: string | null;
  color: string;
  count: number;
  noradIds: number[];
}

export type DataSourceState = 'live' | 'cache' | 'stale' | 'fallback';

export interface LoadProgress {
  done: number;
  total: number;
  source: DataSourceState | null;
}

/** Ce s-a întâmplat cu un grup de date la ultima încărcare */
export type GroupStatus =
  /** descărcat acum, sau confirmat de sursă drept versiune curentă */
  | 'live'
  /** servit din cache-ul local, încă în fereastra de valabilitate */
  | 'cache'
  /** sursa nu a răspuns, folosim ultima copie locală (poate fi veche) */
  | 'stale'
  /** nici sursă, nici cache */
  | 'failed';

export interface GroupReport {
  key: string;
  labelKey: string;
  status: GroupStatus;
  count: number;
  fetchedAt: number | null;
  operator: boolean;
}

export interface LoadResult {
  entries: SatelliteEntry[];
  source: DataSourceState;
  /** cea mai veche descărcare dintre grupurile folosite */
  fetchedAt: number | null;
  groups: GroupReport[];
}

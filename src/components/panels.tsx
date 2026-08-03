import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CategoryId,
  GroupReport,
  GroupStatus,
  SatelliteEntry,
  SatTelemetry,
  StarlinkShell,
} from '../lib/types';
import { CATEGORIES, CATEGORY_COLOR } from '../lib/types';
import type { SatellitePass } from '../lib/passes';
import { DATA_SOURCES } from '../lib/sources';
import { objectTypeLabel, opsStatusLabel, ownerLabel, type SatcatEntry } from '../lib/satcat';
import { LANGS, useI18n, type Key, type Lang } from '../lib/i18n';

/* ---------------- Selector de limbă ---------------- */

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/50 backdrop-blur-md">
      {LANGS.map((l: Lang) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2 py-2 text-[11px] font-medium uppercase transition-colors ${
            lang === l ? 'bg-cyan-500/25 text-cyan-200' : 'text-slate-400 hover:bg-white/10'
          }`}
          aria-pressed={lang === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Loading ---------------- */

export function LoadingScreen({ done, total, source }: { done: number; total: number; source: string | null }) {
  const { t } = useI18n();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#02030a]">
      <div className="mb-6 text-center">
        <div className="text-3xl font-bold tracking-widest text-cyan-300">{t('appName')}</div>
        <div className="mt-1 text-sm text-slate-400">{t('tagline')}</div>
      </div>
      <div className="h-1.5 w-72 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-cyan-400 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 text-xs text-slate-500">
        {source === 'live' ? t('loadingDownload', { pct }) : t('loadingCatalog')}
      </div>
    </div>
  );
}

/* ---------------- Search ---------------- */

export function SearchBar({
  entries,
  onSelect,
}: {
  entries: SatelliteEntry[];
  onSelect: (index: number) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const out: { index: number; e: SatelliteEntry }[] = [];
    for (let i = 0; i < entries.length && out.length < 8; i++) {
      const e = entries[i];
      if (e.name.toLowerCase().includes(query) || String(e.noradId).includes(query)) {
        out.push({ index: i, e });
      }
    }
    return out;
  }, [q, entries]);

  useEffect(() => {
    const close = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} className="relative w-80 max-w-[45vw]">
      <input
        value={q}
        onChange={(ev) => {
          setQ(ev.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('searchPlaceholder')}
        className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none backdrop-blur-md focus:border-cyan-400/60"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full overflow-hidden rounded-lg border border-white/10 bg-black/80 backdrop-blur-xl">
          {results.map(({ index, e }) => (
            <button
              key={e.noradId}
              onClick={() => {
                onSelect(index);
                setOpen(false);
                setQ('');
              }}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: CATEGORY_COLOR[e.category] }}
              />
              <span className="truncate text-slate-200">{e.name}</span>
              <span className="ml-auto shrink-0 text-xs text-slate-500">{e.noradId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Filtre ---------------- */

export function FilterBar({
  active,
  counts,
  onToggle,
}: {
  active: Set<CategoryId>;
  counts: Record<CategoryId, number>;
  onToggle: (c: CategoryId) => void;
}) {
  const { t, num } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      {CATEGORIES.map((c) => {
        const on = active.has(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onToggle(c.id)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all backdrop-blur-md ${
              on
                ? 'border-white/20 bg-black/50 text-slate-200'
                : 'border-white/5 bg-black/30 text-slate-600'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: on ? c.color : '#334155' }} />
            <span>{t(c.labelKey)}</span>
            <span className="ml-auto tabular-nums text-slate-500">{num(counts[c.id] ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Panou informații satelit ---------------- */

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-xs text-slate-500">{k}</span>
      <span className="text-right text-xs font-medium tabular-nums text-slate-200">{v}</span>
    </div>
  );
}

export function InfoPanel({
  entry,
  telemetry,
  tracking,
  epochAgeDays,
  estimatedErrorKm,
  satcat,
  footprintKm,
  footprintOn,
  onToggleFootprint,
  onToggleTracking,
  onShowPasses,
  onClose,
}: {
  entry: SatelliteEntry | null;
  telemetry: SatTelemetry | null;
  tracking: boolean;
  epochAgeDays: number | null;
  estimatedErrorKm: number | null;
  satcat: SatcatEntry | null;
  footprintKm: number | null;
  footprintOn: boolean;
  onToggleFootprint: () => void;
  onToggleTracking: () => void;
  onShowPasses?: () => void;
  onClose: () => void;
}) {
  const { t, lang, num } = useI18n();
  if (!entry) return null;
  const cat = CATEGORIES.find((c) => c.id === entry.category);
  const catLabel = cat ? t(cat.labelKey) : '';

  const formatAge = (days: number): string => {
    if (days < 1 / 24) return t('ageMinutes', { n: Math.round(days * 24 * 60) });
    if (days < 1) return t('ageHours', { n: (days * 24).toFixed(1) });
    return t('ageDays', { n: days.toFixed(1) });
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/70 backdrop-blur-xl sm:w-80">
      <div className="relative h-32 w-full bg-slate-900">
        <img
          src={`assets/sat-${entry.category}.jpg`}
          alt={catLabel}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute right-3 bottom-2 left-3 flex items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat?.color }} />
              <span className="text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
                {catLabel}
              </span>
            </div>
            <div className="mt-0.5 text-lg leading-tight font-semibold text-white">{entry.name}</div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="mb-1 rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="p-4 pt-2">
        <div className="mt-3 flex gap-2">
          <button
            onClick={onToggleTracking}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              tracking
                ? 'border-cyan-400/60 bg-cyan-400/20 text-cyan-200'
                : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {tracking ? t('trackingOn') : t('trackingOff')}
          </button>
          {onShowPasses && (
            <button
              onClick={onShowPasses}
              className="flex-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20"
            >
              {t('whenVisible')}
            </button>
          )}
        </div>

        {/* Identitatea obiectului — TLE-ul spune unde e, SATCAT spune ce e */}
        {satcat && (
          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[9px] font-medium text-sky-300">
                {objectTypeLabel(satcat.objectType, lang)}
              </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-slate-300">
                {ownerLabel(satcat.owner, lang)}
              </span>
              {satcat.decayDate ? (
                <span className="rounded bg-red-400/15 px-1.5 py-0.5 text-[9px] font-medium text-red-300">
                  {t('reentered', { date: satcat.decayDate })}
                </span>
              ) : (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                  {opsStatusLabel(satcat.opsStatus, lang)}
                </span>
              )}
            </div>
            <div className="mt-2 divide-y divide-white/5">
              <Row k={t('launched')} v={satcat.launchDate || '—'} />
              <Row k={t('launchSite')} v={satcat.launchSite || '—'} />
              {satcat.rcs !== null && <Row k={t('radarCrossSection')} v={`${satcat.rcs.toFixed(2)} m²`} />}
            </div>
          </div>
        )}

        <div className="mt-3 divide-y divide-white/5">
          <Row k={t('noradId')} v={String(entry.noradId)} />
          <Row k={t('intlDesignator')} v={entry.intlDes || '—'} />
          {telemetry && (
            <>
              <Row k={t('altitude')} v={`${telemetry.altKm.toFixed(1)} km`} />
              <Row k={t('speed')} v={`${telemetry.velKmS.toFixed(2)} km/s`} />
              <Row k={t('latLon')} v={`${telemetry.lat.toFixed(2)}° / ${telemetry.lon.toFixed(2)}°`} />
              <Row k={t('orbitalPeriod')} v={`${telemetry.periodMin.toFixed(1)} min`} />
              <Row k={t('inclination')} v={`${telemetry.inclinationDeg.toFixed(2)}°`} />
              <Row k={t('eccentricity')} v={telemetry.eccentricity.toFixed(5)} />
              <Row
                k={t('apogeePerigee')}
                v={`${telemetry.apogeeKm.toFixed(0)} / ${telemetry.perigeeKm.toFixed(0)} km`}
              />
              <Row k={t('raan')} v={`${telemetry.raanDeg.toFixed(2)}°`} />
            </>
          )}
          {footprintKm !== null && (
            <Row k={t('footprintRow')} v={t('footprintValue', { km: num(Math.round(footprintKm)) })} />
          )}
        </div>

        {/* Amprenta se poate stinge: pe glob aglomerat, cercul acoperă alte obiecte */}
        <button
          onClick={onToggleFootprint}
          title={t('footprintHint')}
          className={`mt-3 w-full rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            footprintOn
              ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
              : 'border-white/15 bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
        >
          {footprintOn ? t('footprintToggleOn') : t('footprintToggleOff')}
        </button>

        {/* Proveniența datelor pentru acest obiect — fără ea, cifrele de mai sus
            sunt doar niște zecimale convingătoare. */}
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
          <div className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
            {t('provenanceTitle')}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {entry.operatorData ? (
              <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
                {t('operatorEphemeris')}
              </span>
            ) : (
              <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                {t('publicCatalog')}
              </span>
            )}
            <span className="truncate text-[10px] text-slate-400">{t(entry.sourceKey as Key)}</span>
          </div>
          {epochAgeDays !== null && Number.isFinite(epochAgeDays) && (
            <div className="mt-1.5 space-y-0.5 text-[10px] text-slate-500">
              <div className={epochAgeDays > 3 ? 'text-amber-300' : undefined}>
                {t('elementsAge', { age: formatAge(epochAgeDays) })}
              </div>
              {estimatedErrorKm !== null && (
                <div>{t('estimatedError', { km: estimatedErrorKm.toFixed(0) })}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tooltip la hover ---------------- */

export interface HoverInfo {
  x: number;
  y: number;
  name: string;
  noradId: number;
  category: CategoryId;
  altKm: number;
  velKmS: number;
  operatorData: boolean;
}

export function HoverTooltip({ hover }: { hover: HoverInfo | null }) {
  const { t } = useI18n();
  if (!hover) return null;
  const cat = CATEGORIES.find((c) => c.id === hover.category);
  // ținem cartonașul în ecran, indiferent unde e cursorul
  const flipX = hover.x > window.innerWidth - 240;
  const flipY = hover.y > window.innerHeight - 120;
  return (
    <div
      className="pointer-events-none fixed z-40 w-56 rounded-lg border border-white/15 bg-black/85 p-2.5 backdrop-blur-md"
      style={{
        left: flipX ? hover.x - 236 : hover.x + 16,
        top: flipY ? hover.y - 104 : hover.y + 16,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat?.color }} />
        <span className="truncate text-xs font-semibold text-white">{hover.name}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-[10px] text-slate-400">
        <span>NORAD {hover.noradId}</span>
        <span className="text-slate-500">{cat ? t(cat.labelKey) : ''}</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between text-[11px] tabular-nums text-slate-300">
        <span>{hover.altKm.toFixed(0)} km</span>
        <span>{hover.velKmS.toFixed(2)} km/s</span>
      </div>
      {hover.operatorData && (
        <div className="mt-1 text-[9px] text-emerald-400/80">{t('operatorEphemerisShort')}</div>
      )}
    </div>
  );
}

/* ---------------- Control timp ---------------- */

/** Al doilea câmp: pe ecrane mici păstrăm doar treptele cu adevărat utile */
const SPEEDS: { v: number; compact: boolean }[] = [
  { v: 1, compact: true },
  { v: 5, compact: false },
  { v: 20, compact: true },
  { v: 60, compact: false },
  { v: 240, compact: true },
  { v: 1000, compact: false },
];

export function TimeControls({
  simTime,
  speed,
  paused,
  offsetMs,
  onSpeed,
  onPause,
  onLive,
}: {
  simTime: Date;
  speed: number;
  paused: boolean;
  /** decalajul ceasului simulării față de timpul real */
  offsetMs: number;
  onSpeed: (s: number) => void;
  onPause: () => void;
  onLive: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // sub 3 secunde de decalaj și la viteză normală, ce vezi ESTE ce se întâmplă acum
  const isLive = !paused && speed === 1 && Math.abs(offsetMs) < 3000;

  const formatOffset = (ms: number): string => {
    const sign = ms < 0 ? '−' : '+';
    const s = Math.abs(Math.round(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${sign}${d}d ${h}h`;
    if (h > 0) return `${sign}${h}h ${m}m`;
    if (m > 0) return `${sign}${m}m`;
    return `${sign}${s}s`;
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-xl">
      {isLive ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-emerald-300">{t('live')}</span>
        </div>
      ) : (
        <button
          onClick={onLive}
          className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-400/20"
          title={t('backToLive')}
        >
          <span>↺ {paused ? t('paused') : formatOffset(offsetMs)}</span>
          <span className="text-amber-400/70">→ {t('live')}</span>
        </button>
      )}

      <div className="text-right">
        <div className="text-xs font-medium tabular-nums text-slate-200">
          {simTime.toISOString().slice(11, 19)} UTC
        </div>
        <div className="text-[10px] tabular-nums text-slate-500">{simTime.toISOString().slice(0, 10)}</div>
      </div>

      {/* Derularea în timp e un instrument, nu starea implicită — stă strânsă până
          când cineva chiar vrea să vadă o trecere viitoare. */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
          open || !isLive
            ? 'border-white/25 bg-white/10 text-slate-200'
            : 'border-white/10 text-slate-500 hover:bg-white/10'
        }`}
        title={t('scrubTime')}
      >
        ⏱
      </button>

      {open && (
        <>
          <button
            onClick={onPause}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm text-white hover:bg-white/20"
            title={paused ? t('play') : t('pause')}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {SPEEDS.map((s) => (
              <button
                key={s.v}
                onClick={() => onSpeed(s.v)}
                className={`px-2 py-1.5 text-[11px] tabular-nums transition-colors sm:px-2.5 ${
                  s.compact ? '' : 'hidden sm:block'
                } ${speed === s.v && !paused ? 'bg-cyan-500/30 text-cyan-200' : 'text-slate-400 hover:bg-white/10'}`}
              >
                {s.v}×
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Panou Starlink ---------------- */

export function StarlinkPanel({
  shells,
  activeShell,
  onToggleShell,
  onClose,
}: {
  shells: StarlinkShell[];
  activeShell: string | null;
  onToggleShell: (id: string | null) => void;
  onClose: () => void;
}) {
  const { t, num } = useI18n();
  const total = shells.reduce((s, sh) => s + sh.count, 0);
  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur-xl sm:w-80">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-cyan-300 uppercase">
            {t('starlinkModule')}
          </div>
          <div className="mt-1 text-lg font-semibold text-white">
            {t('satellitesTracked', { n: num(total) })}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t('close')}
          className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {shells.map((sh) => {
          const on = activeShell === sh.id;
          return (
            <button
              key={sh.id}
              onClick={() => onToggleShell(on ? null : sh.id)}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
                on ? 'border-cyan-400/50 bg-cyan-400/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: sh.color }} />
              <div className="flex-1">
                <div className="text-xs font-medium text-slate-200">{t(sh.labelKey)}</div>
                <div className="text-[10px] text-slate-500">
                  {sh.altitude ?? t('shellVariable')} · {t('inclShort')}{' '}
                  {sh.inclination ?? t('shellVariable')}
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-slate-300">{num(sh.count)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{t('starlinkNote')}</p>
    </div>
  );
}

/* ---------------- Statistici jos ---------------- */

const SOURCE_BADGE: Record<string, { key: Key; cls: string }> = {
  live: { key: 'srcLive', cls: 'text-emerald-400' },
  cache: { key: 'srcCache', cls: 'text-cyan-400' },
  stale: { key: 'srcStale', cls: 'text-amber-400' },
  fallback: { key: 'srcFallback', cls: 'text-red-400' },
};

export function StatsBar({
  total,
  source,
  fps,
  speed,
  onOpenSources,
}: {
  total: number;
  source: string | null;
  fps: number;
  speed: number;
  onOpenSources: () => void;
}) {
  const { t, num } = useI18n();
  const badge = SOURCE_BADGE[source ?? ''] ?? { key: 'srcLoading' as Key, cls: 'text-slate-400' };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-[11px] text-slate-400 backdrop-blur-md sm:gap-3">
      <span>
        <span className="font-semibold text-slate-200">{num(total)}</span> {t('objects')}
      </span>
      <span className="text-slate-600">|</span>
      <button onClick={onOpenSources} className={`${badge.cls} hover:underline`} title={t('seeSources')}>
        {t(badge.key)}
      </button>
      <span className="hidden text-slate-600 sm:inline">|</span>
      <span className="hidden tabular-nums sm:inline">{fps} FPS</span>
      {speed === 1 && (
        <>
          <span className="hidden text-slate-600 lg:inline">|</span>
          <span className="hidden text-slate-500 lg:inline">{t('streaksHint')}</span>
        </>
      )}
    </div>
  );
}

/* ---------------- Densitate pe altitudini ---------------- */

export interface AltBin {
  lo: number;
  hi: number;
  label: string;
  count: number;
}

export function AltitudePanel({
  bins,
  band,
  bandCount,
  sliderAlt,
  onSelectBin,
  onSlider,
  onClear,
  onClose,
}: {
  bins: AltBin[];
  band: { lo: number; hi: number } | null;
  bandCount: number;
  sliderAlt: number;
  onSelectBin: (b: AltBin) => void;
  onSlider: (alt: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t, num } = useI18n();
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur-xl sm:w-80">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-emerald-300 uppercase">
            {t('orbitalDensity')}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {band
              ? t('objectsAtBand', {
                  n: num(bandCount),
                  lo: Math.round(band.lo),
                  hi: Math.round(band.hi),
                })
              : t('pickAltitude')}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t('close')}
          className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex h-24 items-end gap-[2px]">
        {bins.map((b) => {
          const h = b.count === 0 ? 2 : Math.max(4, (Math.log10(b.count + 1) / Math.log10(maxCount + 1)) * 100);
          const active = band && b.lo === band.lo && b.hi === band.hi;
          return (
            <button
              key={b.label}
              title={t('binObjects', { label: b.label, n: num(b.count) })}
              onClick={() => onSelectBin(b)}
              className={`flex-1 rounded-sm transition-all ${
                active ? 'bg-emerald-400' : 'bg-cyan-500/50 hover:bg-cyan-400/80'
              }`}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-slate-600">
        <span>200 km</span>
        <span>{num(2000)} km</span>
        <span>GEO {num(35786)} km</span>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
            {t('altitudeBand')}
          </span>
          <span className="text-xs font-semibold tabular-nums text-emerald-300">{num(sliderAlt)} km</span>
        </div>
        <input
          type="range"
          min={250}
          max={2000}
          step={10}
          value={sliderAlt}
          onChange={(e) => onSlider(Number(e.target.value))}
          className="w-full accent-emerald-400"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[
          { label: `Starlink ~550 km`, lo: 500, hi: 600 },
          { label: `ISS ~420 km`, lo: 380, hi: 460 },
          { label: `GNSS ~${num(20200)} km`, lo: 19000, hi: 23600 },
          { label: `GEO ~${num(35786)} km`, lo: 35500, hi: 36100 },
        ].map((p) => (
          <button
            key={p.label}
            onClick={() => onSelectBin({ ...p, count: 0 })}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
          >
            {p.label}
          </button>
        ))}
      </div>

      {band && (
        <button
          onClick={onClear}
          className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
        >
          {t('resetView')}
        </button>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{t('altitudeNote')}</p>
    </div>
  );
}

/* ---------------- Mod Observator ---------------- */

export interface VisibleSat {
  index: number;
  name: string;
  noradId: number;
  elevationDeg: number;
  azimuthDeg: number;
  sunlit: boolean;
  category: CategoryId;
}

export function ObserverPanel({
  location,
  locating,
  error,
  computing,
  sunEl,
  aboveCount,
  nakedCount,
  visible,
  passesLoading,
  onUseLocation,
  onManual,
  onComputePasses,
  onClose,
}: {
  location: { lat: number; lon: number } | null;
  locating: boolean;
  error: string | null;
  computing: boolean;
  sunEl: number | null;
  aboveCount: number;
  nakedCount: number;
  visible: VisibleSat[];
  passesLoading: boolean;
  onUseLocation: () => void;
  onManual: (lat: number, lon: number) => void;
  onComputePasses: () => void;
  onClose: () => void;
}) {
  const { t, compass } = useI18n();
  const [latStr, setLatStr] = useState('47.01');
  const [lonStr, setLonStr] = useState('28.86');

  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur-xl sm:w-80">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-amber-300 uppercase">
            {t('observerMode')}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {location ? `${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°` : t('pickLocation')}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t('close')}
          className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>

      {!location && (
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={onUseLocation}
            disabled={locating}
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
          >
            {locating ? t('locating') : t('useMyLocation')}
          </button>
          <div className="flex gap-2">
            <input
              value={latStr}
              onChange={(e) => setLatStr(e.target.value)}
              placeholder="Lat"
              className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-400/60"
            />
            <input
              value={lonStr}
              onChange={(e) => setLonStr(e.target.value)}
              placeholder="Lon"
              className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-400/60"
            />
            <button
              onClick={() => {
                const la = parseFloat(latStr);
                const lo = parseFloat(lonStr);
                if (!isNaN(la) && !isNaN(lo)) onManual(la, lo);
              }}
              className="shrink-0 rounded-md border border-white/15 bg-white/5 px-3 text-xs text-slate-200 hover:bg-white/15"
            >
              {t('setLocation')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Chișinău', lat: 47.01, lon: 28.86 },
              { label: 'București', lat: 44.43, lon: 26.1 },
              { label: 'London', lat: 51.51, lon: -0.13 },
              { label: 'New York', lat: 40.71, lon: -74.01 },
            ].map((c) => (
              <button
                key={c.label}
                onClick={() => onManual(c.lat, c.lon)}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
              >
                {c.label}
              </button>
            ))}
          </div>
          {error && <div className="text-[10px] text-red-400">{error}</div>}
        </div>
      )}

      {location && computing && (
        <div className="py-6 text-center text-xs text-slate-500">
          {t('propagatingCatalog')}
          <div className="mt-1 text-[10px] text-slate-600">{t('propagatingHint')}</div>
        </div>
      )}

      {location && !computing && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-center">
              <div className="text-lg font-bold tabular-nums text-white">{aboveCount}</div>
              <div className="text-[9px] tracking-wide text-slate-500 uppercase">{t('aboveHorizon')}</div>
            </div>
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-center">
              <div className="text-lg font-bold tabular-nums text-amber-300">{nakedCount}</div>
              <div className="text-[9px] tracking-wide text-slate-400 uppercase">{t('observableNow')}</div>
            </div>
          </div>
          <div className="mt-2 text-center text-[10px] text-slate-500">
            {sunEl !== null &&
              (sunEl < -6
                ? t('nightAtObserver', { deg: sunEl.toFixed(0) })
                : t('dayAtObserver', { deg: sunEl.toFixed(0) }))}
          </div>

          <div className="mt-3 max-h-56 overflow-y-auto pr-1">
            {visible.length === 0 && (
              <div className="py-4 text-center text-xs text-slate-500">{t('noneObservable')}</div>
            )}
            {visible.map((s) => (
              <div key={s.noradId} className="flex items-center gap-2 border-b border-white/5 py-1.5 text-xs">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: CATEGORY_COLOR[s.category] }}
                />
                <span className="truncate text-slate-200">{s.name}</span>
                <span className="ml-auto shrink-0 tabular-nums text-slate-400">
                  {s.elevationDeg.toFixed(0)}° · {compass(s.azimuthDeg)}
                </span>
                {s.sunlit ? (
                  <span className="shrink-0 text-amber-300" title={t('sunlit')}>
                    ☀
                  </span>
                ) : (
                  <span className="shrink-0 text-slate-600" title={t('inShadow')}>
                    ●
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={onComputePasses}
              disabled={passesLoading}
              className="flex-1 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
            >
              {passesLoading ? t('calculating') : t('whatsUpTonight')}
            </button>
            <button
              onClick={onUseLocation}
              disabled={locating}
              className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-50"
              title={t('refreshGps')}
            >
              {locating ? '⏳' : '↻'}
            </button>
          </div>
        </>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{t('observerNote')}</p>
    </div>
  );
}

/* ---------------- Treceri prezise ---------------- */

/**
 * Limita ochiului liber pe cer întunecat, fără poluare luminoasă. În oraș e mai
 * degrabă 4. Peste această valoare, „trecerea e vizibilă” devine o promisiune
 * pe care cerul nu o ține.
 */
const NAKED_EYE_MAG = 6.0;

/** Trecerea are și geometria bună, și strălucirea necesară? */
function isNakedEye(p: SatellitePass): boolean {
  return p.visibleToEye && p.estimatedMagnitude !== null && p.estimatedMagnitude <= NAKED_EYE_MAG;
}

function brightnessKey(mag: number): Key {
  if (mag < 1) return 'magVeryBright';
  if (mag < 3) return 'magEasy';
  if (mag < 5) return 'magClearSky';
  if (mag <= NAKED_EYE_MAG) return 'magBorderline';
  return 'magTooFaint';
}

export function PassesPanel({
  passes,
  loading,
  onlyEye,
  scope,
  onToggleOnlyEye,
  onGoToPass,
  onClose,
}: {
  passes: SatellitePass[];
  loading: boolean;
  onlyEye: boolean;
  scope: string;
  onToggleOnlyEye: (v: boolean) => void;
  onGoToPass: (p: SatellitePass) => void;
  onClose: () => void;
}) {
  const { t, compass, dateTime, clock } = useI18n();
  const shown = onlyEye ? passes.filter(isNakedEye) : passes;
  const litButFaint = passes.filter((p) => p.visibleToEye && !isNakedEye(p)).length;

  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur-xl sm:w-80">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-amber-300 uppercase">
            {t('passesTitle')}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{scope}</div>
        </div>
        <button
          onClick={onClose}
          aria-label={t('close')}
          className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
        <input
          type="checkbox"
          checked={onlyEye}
          onChange={(e) => onToggleOnlyEye(e.target.checked)}
          className="accent-amber-400"
        />
        {t('onlyNakedEye')}
      </label>

      {loading && (
        <div className="py-6 text-center text-xs text-slate-500">
          {t('propagating24h')}
          <div className="mt-1 text-[10px] text-slate-600">{t('runsInBackground')}</div>
        </div>
      )}

      {!loading && shown.length === 0 && (
        <div className="py-6 text-center text-xs text-slate-500">
          {t('noPassesMatch')}
          <div className="mt-1 text-[10px] text-slate-600">
            {onlyEye
              ? litButFaint > 0
                ? t('litButFaintHint', { n: litButFaint })
                : t('noneLitHint')
              : t('neverRisesHint')}
          </div>
        </div>
      )}

      {!loading && shown.length > 0 && (
        <div className="mt-3 max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
          {shown.slice(0, 40).map((p, i) => (
            <button
              key={`${p.noradId}-${p.max.timeMs}-${i}`}
              onClick={() => onGoToPass(p)}
              className="w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-left transition-colors hover:bg-white/10"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: CATEGORY_COLOR[p.category] }}
                />
                <span className="truncate text-xs font-medium text-slate-200">{p.name}</span>
                {isNakedEye(p) ? (
                  <span className="ml-auto shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                    {t('badgeNakedEye')}
                  </span>
                ) : p.visibleToEye ? (
                  <span
                    className="ml-auto shrink-0 rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-medium text-slate-400"
                    title={t('badgeLitTitle')}
                  >
                    {t('badgeLit')}
                  </span>
                ) : (
                  <span
                    className="ml-auto shrink-0 rounded bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-medium text-slate-600"
                    title={t('badgeInvisibleTitle')}
                  >
                    {t('badgeInvisible')}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                {dateTime(p.start.timeMs)} → {clock(p.end.timeMs)}
                <span className="text-slate-600"> · </span>
                {Math.round(p.durationSec / 60)} min
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {t('passGeometry', {
                  rise: compass(p.start.azimuthDeg),
                  maxEl: p.max.elevationDeg.toFixed(0),
                  maxAz: compass(p.max.azimuthDeg),
                  set: compass(p.end.azimuthDeg),
                })}
              </div>
              {p.estimatedMagnitude !== null && (
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {t('estimatedBrightness')}{' '}
                  <span className={p.estimatedMagnitude < 3 ? 'text-amber-300' : 'text-slate-400'}>
                    mag {p.estimatedMagnitude.toFixed(1)}
                  </span>
                  {t(brightnessKey(p.estimatedMagnitude))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        {t('passesNote', { mag: NAKED_EYE_MAG.toFixed(1) })}
      </p>
    </div>
  );
}

/* ---------------- Proveniența datelor ---------------- */

const STATUS_LABEL: Record<GroupStatus, { key: Key; cls: string }> = {
  live: { key: 'statusCurrent', cls: 'text-emerald-300' },
  cache: { key: 'statusCache', cls: 'text-cyan-300' },
  stale: { key: 'statusStale', cls: 'text-amber-300' },
  failed: { key: 'statusFailed', cls: 'text-red-400' },
};

export function SourcePanel({
  groups,
  fetchedAt,
  useOperatorData,
  refreshing,
  onToggleOperatorData,
  onRefresh,
  onClose,
}: {
  groups: GroupReport[];
  fetchedAt: number | null;
  useOperatorData: boolean;
  refreshing: boolean;
  onToggleOperatorData: (v: boolean) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const { t, b, num, clock } = useI18n();
  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur-xl sm:w-80">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-cyan-300 uppercase">
            {t('whereDataComesFrom')}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {fetchedAt ? t('updatedAt', { time: clock(fetchedAt) }) : t('noSuccessfulFetch')}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t('close')}
          className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5">
        <input
          type="checkbox"
          checked={useOperatorData}
          onChange={(e) => onToggleOperatorData(e.target.checked)}
          className="mt-0.5 accent-emerald-400"
        />
        <span className="text-[11px] leading-relaxed text-slate-300">
          <span className="font-medium text-slate-100">{t('preferOperator')}</span>
          <span className="block text-[10px] text-slate-500">{t('preferOperatorHint')}</span>
        </span>
      </label>

      <div className="mt-3 space-y-1">
        {groups.map((g) => {
          const s = STATUS_LABEL[g.status];
          return (
            <div key={g.key} className="flex items-center gap-2 border-b border-white/5 py-1 text-[11px]">
              {g.operator && (
                <span className="shrink-0 rounded bg-emerald-400/15 px-1 text-[8px] font-medium text-emerald-300">
                  OP
                </span>
              )}
              <span className="truncate text-slate-300">{t(g.labelKey as Key)}</span>
              <span className="ml-auto shrink-0 tabular-nums text-slate-500">{num(g.count)}</span>
              <span className={`w-24 shrink-0 text-right ${s.cls}`}>{t(s.key)}</span>
            </div>
          );
        })}
      </div>

      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-50"
      >
        {refreshing ? t('reloading') : t('forceReload')}
      </button>

      <div className="mt-3 space-y-2">
        {DATA_SOURCES.filter((s) => s.cors).map((s) => (
          <div key={s.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
            <a
              href={s.homepage}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-medium text-slate-200 hover:text-cyan-300"
            >
              {s.label} ↗
            </a>
            <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{b(s.origin)}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-slate-600">
              <span>{t('sourceCadence', { v: b(s.cadence) })}</span>
              <span>{t('sourceAccuracy', { v: b(s.accuracy) })}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{t('attribution')}</p>
    </div>
  );
}

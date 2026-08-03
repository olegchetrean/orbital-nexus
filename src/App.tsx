import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route } from 'react-router';
import * as THREE from 'three';
import { GlobeEngine, footprintRadiusKm } from './three/engine';
import { SatStore, loadSatellites, computeStarlinkShells } from './lib/data';
import { OrbitWorkerClient } from './lib/orbitWorker';
import { lookAngles, isSunlit, sunElevation, sunDirection } from './lib/astro';
import type { SatellitePass } from './lib/passes';
import type {
  CategoryId,
  GroupReport,
  LoadProgress,
  SatelliteEntry,
  SatTelemetry,
  StarlinkShell,
} from './lib/types';
import { CATEGORIES } from './lib/types';
import {
  LoadingScreen,
  SearchBar,
  FilterBar,
  InfoPanel,
  TimeControls,
  StarlinkPanel,
  StatsBar,
  AltitudePanel,
  ObserverPanel,
  PassesPanel,
  SourcePanel,
  HoverTooltip,
  LangSwitch,
  type AltBin,
  type HoverInfo,
  type VisibleSat,
} from './components/panels';
import { SkyView } from './components/SkyView';
import { loadSatcat, type SatcatEntry } from './lib/satcat';
import { I18nContext, detectLang, makeTranslator, useI18n, type Lang } from './lib/i18n';

/** Bins pentru histograma de altitudine (km) */
function buildBins(store: SatStore): AltBin[] {
  const ranges: { lo: number; hi: number; label: string }[] = [];
  for (let lo = 200; lo < 2000; lo += 100) {
    ranges.push({ lo, hi: lo + 100, label: `${lo}–${lo + 100} km` });
  }
  ranges.push(
    { lo: 2000, hi: 6000, label: '2–6 Mm' },
    { lo: 6000, hi: 10000, label: '6–10 Mm' },
    { lo: 10000, hi: 15000, label: '10–15 Mm' },
    { lo: 15000, hi: 19000, label: '15–19 Mm' },
    { lo: 19000, hi: 24000, label: 'GNSS' },
    { lo: 24000, hi: 30000, label: '24–30 Mm' },
    { lo: 30000, hi: 35500, label: '30–35,5 Mm' },
    { lo: 35500, hi: 36100, label: 'GEO' },
    { lo: 36100, hi: 1e9, label: '> GEO' }
  );
  const bins: AltBin[] = ranges.map((r) => ({ ...r, count: 0 }));
  for (let i = 0; i < store.size; i++) {
    const alt = store.meanAlt[i];
    if (alt < 200) {
      bins[0].count++;
      continue;
    }
    for (const b of bins) {
      if (alt >= b.lo && alt < b.hi) {
        b.count++;
        break;
      }
    }
  }
  return bins;
}

interface ObserverResult {
  aboveCount: number;
  nakedCount: number;
  sunEl: number;
  list: VisibleSat[];
  highlight: Set<number>;
}

/**
 * Întoarce null cât timp nu există încă poziții propagate. Un „0 sateliți
 * deasupra orizontului" afișat înainte de prima propagare ar fi o minciună —
 * răspunsul corect în acel moment e „încă nu știu".
 */
function computeObserver(store: SatStore, lat: number, lon: number, simTime: Date): ObserverResult | null {
  let anyValid = false;
  for (let i = 0; i < store.size; i++) {
    if (store.valid[i]) {
      anyValid = true;
      break;
    }
  }
  if (!anyValid) return null;

  const sun = sunDirection(simTime, new THREE.Vector3());
  const sunEl = sunElevation(lat, lon, sun);
  const dark = sunEl < -6;
  const aboveSet = new Set<number>();
  const nakedSet = new Set<number>();
  const list: VisibleSat[] = [];
  const p = store.positions;

  for (let i = 0; i < store.size; i++) {
    if (!store.valid[i]) continue;
    const la = lookAngles(lat, lon, store.geoLat[i], store.geoLon[i], store.geoAlt[i]);
    if (la.elevationDeg <= 10) continue;
    aboveSet.add(i);
    const lit = isSunlit(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], sun.x, sun.y, sun.z);
    if (lit && dark) nakedSet.add(i);
    list.push({
      index: i,
      name: store.entries[i].name,
      noradId: store.entries[i].noradId,
      elevationDeg: la.elevationDeg,
      azimuthDeg: la.azimuthDeg,
      sunlit: lit,
      category: store.entries[i].category,
    });
  }
  list.sort((a, b) => b.elevationDeg - a.elevationDeg);
  return {
    aboveCount: aboveSet.size,
    nakedCount: nakedSet.size,
    sunEl,
    list: list.slice(0, 14),
    highlight: dark ? nakedSet : aboveSet,
  };
}

/**
 * Candidații pentru „ce se vede la noapte”.
 * Nu are rost să propagăm 12.000 de obiecte pe 24 de ore: din ele, ochiul liber
 * prinde câteva sute. Păstrăm stațiile spațiale, grupul de obiecte strălucitoare
 * al CelesTrak și sateliții Starlink încă jos după lansare — cei care formează
 * „trenurile” vizibile.
 */
const MAX_PASS_CANDIDATES = 1200;

/** Cele trei puncte de vedere asupra acelorași date */
const VIEWS = [
  { id: 'globe', icon: '◍', label: 'viewGlobe', title: 'viewGlobeTitle' },
  { id: 'map', icon: '▭', label: 'viewMap', title: 'viewMapTitle' },
  { id: 'sky', icon: '◠', label: 'viewSky', title: 'viewSkyTitle' },
] as const;

function passCandidates(store: SatStore): { indices: number[]; total: number; dropped: number } {
  const indices: number[] = [];
  for (let i = 0; i < store.size; i++) {
    const e = store.entries[i];
    if (e.category === 'station') indices.push(i);
    else if (e.group === 'gp:visual') indices.push(i);
    else if (e.category === 'starlink' && store.meanAlt[i] < 400) indices.push(i);
  }
  return {
    indices: indices.slice(0, MAX_PASS_CANDIDATES),
    total: indices.length,
    dropped: Math.max(0, indices.length - MAX_PASS_CANDIDATES),
  };
}

function OrbitalNexus() {
  const { t, num } = useI18n();
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const storeRef = useRef<SatStore | null>(null);
  const workerRef = useRef<OrbitWorkerClient | null>(null);
  const simMsRef = useRef<number>(Date.now());
  const simDateRef = useRef<Date>(new Date());
  const speedRef = useRef(1);
  const pausedRef = useRef(false);

  const [progress, setProgress] = useState<LoadProgress>({ done: 0, total: 10, source: null });
  const [entries, setEntries] = useState<SatelliteEntry[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupReport[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [useOperatorData, setUseOperatorData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCats, setVisibleCats] = useState<Set<CategoryId>>(
    () => new Set(CATEGORIES.map((c) => c.id))
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [telemetry, setTelemetry] = useState<SatTelemetry | null>(null);
  const [tracking, setTracking] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [fps, setFps] = useState(0);
  const [showStarlink, setShowStarlink] = useState(false);
  const [shells, setShells] = useState<StarlinkShell[]>([]);
  const [activeShell, setActiveShell] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [viewMode, setViewMode] = useState<'globe' | 'map' | 'sky'>('globe');
  const [satcat, setSatcat] = useState<Map<number, SatcatEntry> | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [footprintOn, setFootprintOn] = useState(true);

  // --- Densitate altitudine ---
  const [showAltitude, setShowAltitude] = useState(false);
  const [bins, setBins] = useState<AltBin[]>([]);
  const [altBand, setAltBand] = useState<{ lo: number; hi: number } | null>(null);
  const [sliderAlt, setSliderAlt] = useState(550);
  const [altBandCount, setAltBandCount] = useState(0);

  // --- Mod Observator ---
  const [showObserver, setShowObserver] = useState(false);
  const [obsLoc, setObsLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [obsLocating, setObsLocating] = useState(false);
  const [obsError, setObsError] = useState<string | null>(null);
  const [obsResult, setObsResult] = useState<ObserverResult | null>(null);

  // --- Treceri prezise ---
  const [showPasses, setShowPasses] = useState(false);
  const [passes, setPasses] = useState<SatellitePass[]>([]);
  const [passesLoading, setPassesLoading] = useState(false);
  const [passScope, setPassScope] = useState('');
  const [onlyEye, setOnlyEye] = useState(true);

  const noradToIndex = useMemo(() => {
    const m = new Map<number, number>();
    entries.forEach((e, i) => m.set(e.noradId, i));
    return m;
  }, [entries]);

  const shellIdSets = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const sh of shells) {
      const idx = new Set<number>();
      for (const id of sh.noradIds) {
        const i = noradToIndex.get(id);
        if (i !== undefined) idx.add(i);
      }
      m.set(sh.id, idx);
    }
    return m;
  }, [shells, noradToIndex]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(CATEGORIES.map((x) => [x.id, 0])) as Record<CategoryId, number>;
    for (const e of entries) c[e.category] += 1;
    return c;
  }, [entries]);

  /** Încarcă (sau reîncarcă) catalogul și rearmează engine-ul + workerul */
  const ingest = useCallback(
    async (opts: { useOperatorData: boolean; force?: boolean }) => {
      const engine = engineRef.current;
      const worker = workerRef.current;
      if (!engine || !worker) return;

      const result = await loadSatellites(setProgress, {
        useOperatorData: opts.useOperatorData,
        force: opts.force,
      });

      const store = new SatStore();
      store.init(result.entries);
      storeRef.current = store;
      engine.setStore(store);
      engine.setVisibleCategories(new Set(CATEGORIES.map((c) => c.id)));
      worker.init(result.entries, store.meanAlt);

      setEntries(result.entries);
      setSource(result.source);
      setGroups(result.groups);
      setFetchedAt(result.fetchedAt);
      setBins(buildBins(store));
      setShells(result.entries.some((e) => e.category === 'starlink') ? computeStarlinkShells(store) : []);
      setSelected(null);
      setPasses([]);
      return result;
    },
    []
  );

  // --- inițializare engine + worker + date ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const engine = new GlobeEngine(mount);
    engineRef.current = engine;

    const worker = new OrbitWorkerClient();
    workerRef.current = worker;
    worker.onSnapshot = (timeMs, buffers) => engine.applySnapshot(timeMs, buffers);
    engine.setWorker(worker);

    if (import.meta.env.DEV) {
      // punct de inspecție pentru dezvoltare: starea reală a propagării
      (window as unknown as Record<string, unknown>).__orbital = {
        engine,
        worker,
        store: () => storeRef.current,
        /** ceasul simulării, scriitor — unelte de captură video îl avansează singure */
        simMs: simMsRef,
        stats: () => {
          const s = storeRef.current;
          if (!s) return { store: null };
          let valid = 0;
          for (let i = 0; i < s.size; i++) valid += s.valid[i];
          return {
            size: s.size,
            valid,
            workerReady: worker.ready,
            latencyMs: Math.round(worker.latencyMs),
            sample: { lat: s.geoLat[0], lon: s.geoLon[0], alt: s.geoAlt[0] },
          };
        },
      };
    }

    engine.onPick = (idx) => {
      setSelected(idx);
      engine.select(idx);
      // urmărirea pornește odată cu selecția: la 7,6 km/s, un obiect „selectat, dar
      // neurmărit" iese din cadru în câteva secunde
      setTracking(idx !== null);
      if (idx !== null) engine.focusOn(idx);
    };

    // click pe Pământ = mută observatorul acolo, cât timp panoul e deschis
    engine.onPickLocation = (lat, lon) => {
      setObsLoc({ lat, lon });
      setObsError(null);
    };

    engine.onHover = (hit) => {
      const store = storeRef.current;
      if (!hit || !store) {
        setHover(null);
        return;
      }
      const e = store.entries[hit.index];
      const i = hit.index;
      setHover({
        x: hit.x,
        y: hit.y,
        name: e.name,
        noradId: e.noradId,
        category: e.category,
        altKm: store.geoAlt[i],
        // viteza orbitală din raza vectoare: v = sqrt(mu/r), suficient pentru un tooltip
        velKmS: Math.sqrt(398600.4418 / (6371 + store.geoAlt[i])),
        operatorData: e.operatorData,
      });
    };

    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsLast = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      frames++;
      if (now - fpsLast >= 1000) {
        setFps(frames);
        frames = 0;
        fpsLast = now;
      }
      if (!pausedRef.current) {
        if (speedRef.current === 1) {
          // La viteză normală ceasul simulării ESTE ceasul real. Acumularea de
          // incremente rămâne în urmă ori de câte ori fila e în fundal și
          // browserul limitează cadrele — iar „LIVE" ar deveni o minciună.
          simMsRef.current = Date.now();
        } else {
          simMsRef.current += dt * speedRef.current;
        }
      }
      simDateRef.current.setTime(simMsRef.current);
      engine.update(simDateRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    let cancelled = false;
    ingest({ useOperatorData: true }).then((result) => {
      if (cancelled || !result) return;
      // parametri URL: ?panel=altitude&alt=550 | ?panel=observer&lat=44.4&lon=26.1 | ?sat=25544
      const q = new URLSearchParams(window.location.search);
      if (q.get('panel') === 'altitude') {
        setShowAltitude(true);
        const alt = Number(q.get('alt') ?? 550);
        setSliderAlt(alt);
        setAltBand({ lo: alt - 50, hi: alt + 50 });
      }
      if (q.get('panel') === 'observer') {
        setShowObserver(true);
        const la = Number(q.get('lat'));
        const lo = Number(q.get('lon'));
        if (!isNaN(la) && !isNaN(lo)) setObsLoc({ lat: la, lon: lo });
      }
      const satId = Number(q.get('sat'));
      if (!isNaN(satId) && q.get('sat')) {
        const idx = result.entries.findIndex((e) => e.noradId === satId);
        if (idx >= 0) {
          setSelected(idx);
          engine.select(idx);
          engine.focusOn(idx);
          setTracking(true);
        }
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      worker.dispose();
      engine.dispose();
      engineRef.current = null;
      storeRef.current = null;
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- ceas afișat + decalajul față de timpul real ---
  useEffect(() => {
    const id = setInterval(() => {
      // La 1× ceasul se resincronizează și aici, nu doar în bucla de randare:
      // când fila e în fundal browserul oprește cadrele, iar la revenire
      // indicatorul ar arăta câteva secunde fals „nu ești pe LIVE".
      if (!pausedRef.current && speedRef.current === 1) simMsRef.current = Date.now();
      setClock(new Date(simMsRef.current));
      setOffsetMs(simMsRef.current - Date.now());
    }, 250);
    return () => clearInterval(id);
  }, []);

  // --- metadatele obiectelor (6,7 MB) se aduc după ce globul e deja pe ecran ---
  useEffect(() => {
    if (entries.length === 0) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      loadSatcat().then((m) => {
        if (!cancelled && m.size > 0) setSatcat(m);
      });
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [entries.length]);

  // --- telemetrie satelit selectat ---
  useEffect(() => {
    if (selected === null) {
      setTelemetry(null);
      return;
    }
    const update = () => {
      const store = storeRef.current;
      if (!store || selected === null) return;
      setTelemetry(store.telemetry(selected, new Date(simMsRef.current), 0));
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [selected]);

  // --- tracking camera ---
  useEffect(() => {
    engineRef.current?.setTracking(tracking);
  }, [tracking]);

  // --- recalculare observator la fiecare 2s ---
  useEffect(() => {
    if (!obsLoc || !showObserver) {
      setObsResult(null);
      return;
    }
    const update = () => {
      const store = storeRef.current;
      if (!store) return;
      setObsResult(computeObserver(store, obsLoc.lat, obsLoc.lon, new Date(simMsRef.current)));
    };
    update();
    const id = setInterval(update, 2000);
    return () => clearInterval(id);
  }, [obsLoc, showObserver]);

  // --- highlight global: Observator > Altitudine > Shell Starlink ---
  useEffect(() => {
    const engine = engineRef.current;
    const store = storeRef.current;
    if (!engine || !store || entries.length === 0) return;

    if (showObserver && obsLoc && obsResult) {
      engine.setHighlightSet(obsResult.highlight);
      return;
    }
    if (altBand) {
      const set = new Set<number>();
      for (let i = 0; i < store.size; i++) {
        if (store.meanAlt[i] >= altBand.lo && store.meanAlt[i] < altBand.hi) set.add(i);
      }
      engine.setHighlightSet(set);
      return;
    }
    if (activeShell) {
      engine.setHighlightSet(shellIdSets.get(activeShell) ?? null);
      return;
    }
    engine.setHighlightSet(null);
  }, [showObserver, obsLoc, obsResult, altBand, activeShell, shellIdSets, entries]);

  // --- shell sferic + marker observator ---
  useEffect(() => {
    engineRef.current?.showShell(altBand ? (altBand.lo + altBand.hi) / 2 : null);
  }, [altBand]);

  useEffect(() => {
    const engine = engineRef.current;
    if (showObserver && obsLoc) engine?.showObserver(obsLoc.lat, obsLoc.lon);
    else engine?.showObserver(null);
    // cursorul devine cruce cât timp un click pe glob/hartă mută observatorul
    engine?.setLocationPickMode(showObserver);
  }, [showObserver, obsLoc]);

  // --- contor bandă altitudine ---
  useEffect(() => {
    const store = storeRef.current;
    if (!store || !altBand) {
      setAltBandCount(0);
      return;
    }
    let c = 0;
    for (let i = 0; i < store.size; i++) {
      if (store.meanAlt[i] >= altBand.lo && store.meanAlt[i] < altBand.hi) c++;
    }
    setAltBandCount(c);
  }, [altBand, entries]);

  const toggleCat = useCallback((c: CategoryId) => {
    setVisibleCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      engineRef.current?.setVisibleCategories(next);
      return next;
    });
  }, []);

  const handleSelectFromSearch = useCallback((index: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    setSelected(index);
    engine.select(index);
    engine.focusOn(index);
    setTracking(true);
  }, []);

  const handleSpeed = (s: number) => {
    speedRef.current = s;
    pausedRef.current = false;
    setSpeed(s);
    setPaused(false);
  };

  const handlePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  const handleLive = () => {
    simMsRef.current = Date.now();
    speedRef.current = 1;
    pausedRef.current = false;
    setSpeed(1);
    setPaused(false);
  };

  const locateObserver = () => {
    setObsLocating(true);
    setObsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObsLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setObsLocating(false);
      },
      () => {
        setObsError(t('locationError'));
        setObsLocating(false);
      },
      { timeout: 10000 }
    );
  };

  /**
   * Comutarea între cele trei puncte de vedere. Modul Cer acoperă complet
   * globul, deci oprim randarea WebGL — dar nu și propagarea, ca la întoarcere
   * scena să fie deja la zi.
   */
  const handleViewMode = (m: 'globe' | 'map' | 'sky') => {
    setViewMode(m);
    const engine = engineRef.current;
    if (m === 'sky') {
      engine?.setRenderEnabled(false);
      if (!obsLoc) locateObserver();
    } else {
      engine?.setRenderEnabled(true);
      engine?.setViewMode(m);
    }
  };

  /* ---------------- Treceri ---------------- */

  const runPasses = useCallback(
    async (mode: 'night' | 'selected') => {
      const store = storeRef.current;
      const worker = workerRef.current;
      if (!store || !worker || !obsLoc) {
        setShowObserver(true);
        setObsError(t('pickLocationFirst'));
        return;
      }
      const single = mode === 'selected' && selected !== null;
      const cand = single ? null : passCandidates(store);
      const indices = single ? [selected as number] : (cand as { indices: number[] }).indices;
      setPassScope(
        single
          ? store.entries[selected as number].name
          : t('scopeObjects', {
              n: num(indices.length),
              lat: obsLoc.lat.toFixed(2),
              lon: obsLoc.lon.toFixed(2),
            }) +
              // niciodată nu tăiem în tăcere: dacă lista a fost limitată, se spune
              (cand && cand.dropped > 0 ? t('scopeDropped', { n: cand.dropped }) : '')
      );
      setShowPasses(true);
      setPassesLoading(true);
      setPasses([]);
      const start = Date.now();
      const result = await worker.computePasses({
        obs: { latDeg: obsLoc.lat, lonDeg: obsLoc.lon, heightKm: 0.1 },
        startMs: start,
        endMs: start + 24 * 3600 * 1000,
        indices,
        minElevationDeg: 10,
        onlyVisibleToEye: false,
        coarseStepSec: indices.length > 10 ? 60 : 20,
      });
      setPasses(result);
      setPassesLoading(false);
    },
    [obsLoc, selected, t, num]
  );

  const handleGoToPass = useCallback((p: SatellitePass) => {
    const engine = engineRef.current;
    if (!engine) return;
    // ducem ceasul cu puțin înainte de răsăritul satelitului și accelerăm ușor
    simMsRef.current = p.start.timeMs - 30000;
    pausedRef.current = false;
    speedRef.current = 20;
    setSpeed(20);
    setPaused(false);
    setSelected(p.index);
    engine.select(p.index);
    engine.focusOn(p.index);
    setTracking(true);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await ingest({ useOperatorData, force: true });
    setRefreshing(false);
  }, [ingest, useOperatorData]);

  const handleToggleOperator = useCallback(
    async (v: boolean) => {
      setUseOperatorData(v);
      setRefreshing(true);
      await ingest({ useOperatorData: v });
      setRefreshing(false);
    },
    [ingest]
  );

  const loading = entries.length === 0;
  const anyPanelOpen = showStarlink || showAltitude || showObserver || showPasses || showSources || selected !== null;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#02030a] font-sans">
      <div ref={mountRef} className="absolute inset-0" />

      {loading && <LoadingScreen done={progress.done} total={progress.total} source={progress.source} />}

      {viewMode === 'sky' && !loading && (
        <SkyView
          store={storeRef.current}
          observer={obsLoc}
          simTimeRef={simMsRef}
          selected={selected}
          visibleCats={visibleCats}
          onSelect={(i) => {
            setSelected(i);
            engineRef.current?.select(i);
          }}
          onNeedLocation={locateObserver}
          onClose={() => handleViewMode('globe')}
        />
      )}

      {viewMode !== 'sky' && <HoverTooltip hover={hover} />}

      {!loading && (
        <>
          {/* Header */}
          <div className="absolute top-0 right-0 left-0 z-30 flex items-center gap-2 p-3 sm:gap-4 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
                ◉
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-bold tracking-widest text-white">{t('appName')}</div>
                <div className="text-[10px] text-slate-500">{t('subtitle')}</div>
              </div>
            </div>
            <button
              onClick={() => setMobileFilters((v) => !v)}
              className="rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-slate-200 backdrop-blur-md lg:hidden"
            >
              ☰
            </button>

            {/* Glob, hartă sau cer — aceleași date, trei puncte de vedere */}
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/50 backdrop-blur-md">
              {VIEWS.map(({ id, icon, label, title }) => (
                <button
                  key={id}
                  onClick={() => handleViewMode(id)}
                  className={`shrink-0 px-2.5 py-2 text-xs whitespace-nowrap transition-colors ${
                    viewMode === id ? 'bg-cyan-500/25 text-cyan-200' : 'text-slate-400 hover:bg-white/10'
                  }`}
                  title={t(title)}
                >
                  {icon}
                  <span className="ml-1 hidden md:inline">{t(label)}</span>
                </button>
              ))}
            </div>

            <div className="flex-1" />
            <SearchBar entries={entries} onSelect={handleSelectFromSearch} />
            <LangSwitch />
          </div>

          {/* Pe mobil, filtrele se deschid peste tot restul — altfel rămân sub foaia de jos */}
          {mobileFilters && (
            <button
              aria-label="Închide filtrele"
              onClick={() => setMobileFilters(false)}
              className="absolute inset-0 z-[25] bg-black/85 backdrop-blur-md lg:hidden"
            />
          )}
          <div
            className={`absolute top-20 left-3 z-30 max-h-[72dvh] w-56 overflow-y-auto pb-4 sm:top-24 sm:left-4 lg:z-20 ${
              mobileFilters ? 'block' : 'hidden'
            } ${viewMode === 'sky' ? 'lg:hidden' : 'lg:block'}`}
          >
            <div className="mb-2 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              {t('filtersTitle')}
            </div>
            <FilterBar active={visibleCats} counts={counts} onToggle={toggleCat} />
            <button
              onClick={() => {
                setShowStarlink((v) => !v);
                setMobileFilters(false);
              }}
              className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs font-medium backdrop-blur-md transition-all ${
                showStarlink
                  ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/15 bg-black/50 text-slate-300 hover:bg-white/10'
              }`}
            >
              {t('btnStarlink')}
            </button>
            <button
              onClick={() => {
                setShowAltitude((v) => !v);
                setMobileFilters(false);
              }}
              className={`mt-2 w-full rounded-lg border px-3 py-2 text-xs font-medium backdrop-blur-md transition-all ${
                showAltitude
                  ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
                  : 'border-white/15 bg-black/50 text-slate-300 hover:bg-white/10'
              }`}
            >
              {t('btnAltitude')}
            </button>
            <button
              onClick={() => {
                setShowObserver((v) => !v);
                setMobileFilters(false);
              }}
              className={`mt-2 w-full rounded-lg border px-3 py-2 text-xs font-medium backdrop-blur-md transition-all ${
                showObserver
                  ? 'border-amber-400/50 bg-amber-400/15 text-amber-200'
                  : 'border-white/15 bg-black/50 text-slate-300 hover:bg-white/10'
              }`}
            >
              {t('btnObserver')}
            </button>
            <button
              onClick={() => {
                setShowSources((v) => !v);
                setMobileFilters(false);
              }}
              className={`mt-2 w-full rounded-lg border px-3 py-2 text-xs font-medium backdrop-blur-md transition-all ${
                showSources
                  ? 'border-sky-400/50 bg-sky-400/15 text-sky-200'
                  : 'border-white/15 bg-black/50 text-slate-300 hover:bg-white/10'
              }`}
            >
              {t('btnSources')}
            </button>
          </div>

          {/* Panouri — coloană dreapta pe desktop, foaie de jos pe mobil */}
          <div
            className={`absolute z-20 flex flex-col gap-3 overflow-y-auto
              inset-x-2 bottom-28 max-h-[58dvh]
              sm:inset-x-auto sm:top-24 sm:right-4 sm:bottom-auto sm:max-h-[calc(100dvh-11rem)]
              ${anyPanelOpen ? '' : 'pointer-events-none'} ${viewMode === 'sky' ? 'hidden' : ''}`}
          >
            {showSources && (
              <SourcePanel
                groups={groups}
                fetchedAt={fetchedAt}
                useOperatorData={useOperatorData}
                refreshing={refreshing}
                onToggleOperatorData={handleToggleOperator}
                onRefresh={handleRefresh}
                onClose={() => setShowSources(false)}
              />
            )}
            {showPasses && (
              <PassesPanel
                passes={passes}
                loading={passesLoading}
                onlyEye={onlyEye}
                scope={passScope}
                onToggleOnlyEye={setOnlyEye}
                onGoToPass={handleGoToPass}
                onClose={() => setShowPasses(false)}
              />
            )}
            {showStarlink && (
              <StarlinkPanel
                shells={shells}
                activeShell={activeShell}
                onToggleShell={setActiveShell}
                onClose={() => {
                  setShowStarlink(false);
                  setActiveShell(null);
                }}
              />
            )}
            {showAltitude && (
              <AltitudePanel
                bins={bins}
                band={altBand}
                bandCount={altBandCount}
                sliderAlt={sliderAlt}
                onSelectBin={(b) => {
                  setAltBand({ lo: b.lo, hi: b.hi });
                  if (b.hi <= 2000) setSliderAlt(Math.round((b.lo + b.hi) / 2));
                }}
                onSlider={(v) => {
                  setSliderAlt(v);
                  setAltBand({ lo: v - 50, hi: v + 50 });
                }}
                onClear={() => setAltBand(null)}
                onClose={() => {
                  setShowAltitude(false);
                  setAltBand(null);
                }}
              />
            )}
            {showObserver && (
              <ObserverPanel
                location={obsLoc}
                locating={obsLocating}
                error={obsError}
                computing={obsResult === null}
                sunEl={obsResult?.sunEl ?? null}
                aboveCount={obsResult?.aboveCount ?? 0}
                nakedCount={obsResult?.nakedCount ?? 0}
                visible={obsResult?.list ?? []}
                passesLoading={passesLoading}
                onUseLocation={locateObserver}
                onManual={(lat, lon) => setObsLoc({ lat, lon })}
                onComputePasses={() => runPasses('night')}
                onClose={() => setShowObserver(false)}
              />
            )}
            {selected !== null && entries[selected] && (
              <InfoPanel
                entry={entries[selected]}
                telemetry={telemetry}
                tracking={tracking}
                epochAgeDays={storeRef.current?.epochAgeDays[selected] ?? null}
                estimatedErrorKm={storeRef.current?.estimatedErrorKm(selected) ?? null}
                satcat={satcat?.get(entries[selected].noradId) ?? null}
                footprintKm={telemetry ? footprintRadiusKm(telemetry.altKm) : null}
                footprintOn={footprintOn}
                onToggleFootprint={() => {
                  setFootprintOn((v) => {
                    engineRef.current?.setFootprintVisible(!v);
                    return !v;
                  });
                }}
                onToggleTracking={() => setTracking((t) => !t)}
                onShowPasses={() => runPasses('selected')}
                onFindInSky={() => handleViewMode('sky')}
                onClose={() => {
                  setSelected(null);
                  engineRef.current?.select(null);
                  setTracking(false);
                }}
              />
            )}
          </div>

          {/* Bara de jos: statistici + control timp + ajutor, într-un singur rând
              care nu se poate suprapune pe sine indiferent de lățime */}
          <div
            className={`absolute inset-x-0 bottom-0 z-20 flex-wrap items-end justify-center gap-2 p-3 sm:justify-between sm:p-4 ${
              viewMode === 'sky' ? 'hidden' : 'flex'
            }`}
          >
            <StatsBar
              total={entries.length}
              source={source}
              fps={fps}
              speed={speed}
              onOpenSources={() => setShowSources(true)}
            />
            <TimeControls
              simTime={clock}
              speed={speed}
              paused={paused}
              offsetMs={offsetMs}
              onSpeed={handleSpeed}
              onPause={handlePause}
              onLive={handleLive}
            />
            <div className="hidden max-w-56 text-right text-[10px] leading-relaxed text-slate-600 2xl:block">
              {t('canvasHint')}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());

  // limba trebuie să se vadă și în afara React-ului: atribut pe <html>, titlu de
  // filă, și memorată pentru vizita următoare
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title =
      lang === 'ro'
        ? 'Orbital Nexus — sateliții, în timp real'
        : 'Orbital Nexus — satellites, in real time';
    try {
      localStorage.setItem('lili-sat-lang', lang);
    } catch {
      /* stocare blocată — limba rămâne doar pe sesiunea curentă */
    }
  }, [lang]);

  const translator = useMemo(() => makeTranslator(lang, setLang), [lang]);

  return (
    <I18nContext.Provider value={translator}>
      <Routes>
        <Route path="/" element={<OrbitalNexus />} />
        <Route path="*" element={<OrbitalNexus />} />
      </Routes>
    </I18nContext.Provider>
  );
}

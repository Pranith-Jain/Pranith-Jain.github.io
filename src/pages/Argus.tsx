import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { Search } from 'lucide-react';
import './argus/argus.css';
import { TabBar } from '../components/ui/TabBar';
import { Spotlight } from './argus/components/Spotlight';
import { Dossier } from './argus/components/Dossier';
import { ACTORS } from './argus/data/actors';
import { FEED_ITEMS } from './argus/data/feed';
import { NATION_PALETTE } from './argus/data/countries';
import type { Actor, GroupType, ViewKey } from './argus/types';

const GlobeView = lazy(() => import('./argus/views/GlobeView').then((m) => ({ default: m.GlobeView })));
const ClusterView = lazy(() => import('./argus/views/ClusterView').then((m) => ({ default: m.ClusterView })));
const DiamondView = lazy(() => import('./argus/views/DiamondView').then((m) => ({ default: m.DiamondView })));
const LandscapeView = lazy(() => import('./argus/views/LandscapeView').then((m) => ({ default: m.LandscapeView })));
const FeedView = lazy(() => import('./argus/views/FeedView').then((m) => ({ default: m.FeedView })));
const HuntView = lazy(() => import('./argus/views/HuntView').then((m) => ({ default: m.HuntView })));

const VIEW_TABS: { id: ViewKey; label: string }[] = [
  { id: 'globe', label: 'Globe' },
  { id: 'cluster', label: 'Relations' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'feed', label: 'Feed' },
  { id: 'hunt', label: 'Hunt' },
];

const NATIONS = Object.fromEntries(Object.entries(NATION_PALETTE).map(([code, n]) => [code, n.name]));

const GROUP_TYPES: { value: GroupType; label: string }[] = [
  { value: 'nation-state', label: 'Nation-State' },
  { value: 'criminal', label: 'Criminal' },
  { value: 'collective', label: 'Collective' },
];

const selectCls =
  'h-9 px-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-mini font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400 outline-none hover:border-slate-300 dark:hover:border-[rgb(var(--border-500))] focus:border-brand-500 dark:focus:border-brand-400 cursor-pointer transition-colors';

export default function ArgusPage() {
  const [view, setView] = useState<ViewKey>('globe');
  const [activeActor, setActiveActor] = useState<Actor | null>(null);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [motivationFilter, setMotivationFilter] = useState<string | null>(null);
  const [groupTypeFilter, setGroupTypeFilter] = useState<GroupType | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const allSectors = useMemo(() => {
    const s = new Set<string>();
    ACTORS.forEach((a) => a.sectors.forEach((sec) => s.add(sec)));
    return [...s].sort();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlightOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setActiveActor(null);
        setSpotlightOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openActor = useCallback((a: Actor) => setActiveActor(a), []);
  const closeActor = useCallback(() => setActiveActor(null), []);

  const onSpotlightSelect = (actorId: string) => {
    const a = ACTORS.find((x) => x.id === actorId);
    if (a) {
      setActiveActor(a);
      setSpotlightOpen(false);
    }
  };

  const visible = ACTORS.filter((a) => {
    if (regionFilter && a.country !== regionFilter) return false;
    if (motivationFilter && a.motivation !== motivationFilter) return false;
    if (groupTypeFilter && a.group_type !== groupTypeFilter) return false;
    if (sectorFilter && !a.sectors.includes(sectorFilter)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay = [a.name, a.apt ?? '', a.aka.join(' '), a.agency, a.sectors.join(' '), a.targets.join(' ')]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const nationCount = new Set(ACTORS.map((a) => a.country)).size;
  const totalTtps = ACTORS.reduce((s, a) => s + a.ttps.length, 0);

  return (
    <div className="w-full py-6 sm:py-8 space-y-6">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="surface-elevated relative p-6 sm:p-10 lg:p-12">
        <div aria-hidden className="pointer-events-none absolute top-0 left-0 h-px w-12 bg-rose-500/60" />

        <div className="flex items-center gap-3 font-mono text-mini uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 rounded-full bg-rose-500 live-pulse" aria-hidden="true" />
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">Live</span>
          </span>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <span>Nation-state CTI</span>
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
          <span className="hidden sm:inline">Curated APT data</span>
        </div>

        <h1 className="font-display text-4xl sm:text-6xl font-bold leading-[0.95] tracking-[-0.04em] text-slate-900 dark:text-white">
          ARGUS
          <span className="block text-rose-600 dark:text-rose-400">Threat Nexus</span>
        </h1>

        <p className="mt-4 max-w-2xl text-tool sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
          Nation-state threat intelligence on {ACTORS.length} tracked APT groups across {nationCount} nations —{' '}
          {totalTtps} mapped MITRE TTPs, relationship graphs, diamond-model analysis, and a live intel feed.
        </p>

        <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-panel border border-[rgb(var(--border-400))] bg-[rgb(var(--border-400))]">
          {[
            { label: 'APT groups', value: ACTORS.length },
            { label: 'Nations', value: nationCount },
            { label: 'MITRE TTPs', value: totalTtps },
            { label: 'Intel items', value: FEED_ITEMS.length },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-[rgb(var(--surface-200))] px-4 py-3.5">
              <dd className="font-display text-2xl sm:text-3xl font-bold leading-none tabular-nums text-slate-900 dark:text-white">
                {s.value.toLocaleString()}
              </dd>
              <dt className="mt-1.5 font-mono text-micro uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {s.label}
              </dt>
            </div>
          ))}
        </dl>
      </section>

      {/* ── View tabs ────────────────────────────────────────────── */}
      <TabBar tabs={VIEW_TABS} active={view} onChange={(id) => setView(id as ViewKey)} className="mb-0" />

      {/* ── Filter toolbar ───────────────────────────────────────── */}
      <div className="surface-card p-3.5 flex items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search actors, CVEs, TTPs, malware…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-rose-500/50 dark:focus:border-rose-400/50 transition-colors"
          />
        </div>

        <select
          value={regionFilter ?? ''}
          onChange={(e) => setRegionFilter(e.target.value || null)}
          className={selectCls}
        >
          <option value="">All nations</option>
          {Object.entries(NATIONS).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={motivationFilter ?? ''}
          onChange={(e) => setMotivationFilter(e.target.value || null)}
          className={selectCls}
        >
          <option value="">Any motive</option>
          <option value="espionage">Espionage</option>
          <option value="financial">Financial</option>
          <option value="destructive">Destructive</option>
          <option value="mixed">Mixed</option>
          <option value="surveillance">Surveillance</option>
        </select>

        <select
          value={groupTypeFilter ?? ''}
          onChange={(e) => setGroupTypeFilter((e.target.value as GroupType) || null)}
          className={`${selectCls} hidden sm:block`}
        >
          <option value="">All groups</option>
          {GROUP_TYPES.map((gt) => (
            <option key={gt.value} value={gt.value}>
              {gt.label}
            </option>
          ))}
        </select>

        <select
          value={sectorFilter ?? ''}
          onChange={(e) => setSectorFilter(e.target.value || null)}
          className={`${selectCls} hidden md:block`}
        >
          <option value="">All sectors</option>
          {allSectors.map((s) => (
            <option key={s} value={s}>
              {s.replace(/-/g, ' ')}
            </option>
          ))}
        </select>

        <span className="ml-auto font-mono text-micro uppercase tracking-wider text-slate-500 dark:text-slate-400 tabular-nums">
          {visible.length}/{ACTORS.length} actors
        </span>
      </div>

      {/* ── Active view ──────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-panel border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] min-h-[560px]">
        <div className="relative h-[62vh] min-h-[520px] max-h-[760px]">
          <Suspense
            fallback={
              <div className="absolute inset-0 grid place-items-center">
                <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-500">
                  <span className="h-6 w-6 rounded-full border-2 border-slate-300 dark:border-[rgb(var(--border-400))] border-t-rose-500 animate-spin" />
                  <span className="font-mono text-micro uppercase tracking-[0.16em]">Loading view</span>
                </div>
              </div>
            }
          >
            {view === 'globe' && <GlobeView actors={visible} onOpen={openActor} />}
            {view === 'cluster' && <ClusterView actors={visible} onOpen={openActor} />}
            {view === 'diamond' && <DiamondView actors={visible} onOpen={openActor} />}
            {view === 'landscape' && <LandscapeView actors={visible} feed={FEED_ITEMS} />}
            {view === 'feed' && <FeedView feed={FEED_ITEMS} actors={ACTORS} onOpen={openActor} />}
            {view === 'hunt' && <HuntView actors={visible} />}
          </Suspense>
        </div>
      </div>

      <Dossier actor={activeActor} onClose={closeActor} onOpen={openActor} />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} onSelect={onSpotlightSelect} />
    </div>
  );
}

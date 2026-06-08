import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  Activity,
  Globe,
  Radio,
  RefreshCw,
  Zap,
  Bug,
  Skull,
  Shield,
  Newspaper,
  Rss,
  MessageSquare,
  AtSign,
  AlertTriangle,
  Plane,
  ShieldAlert,
  Flame,
  Map,
  Box,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Badge } from '../../components/ui/Badge';
import { StatCards } from '../../components/ui/StatCards';
import type { CtiArc, CtiPoint } from '../../components/threatintel/cti/geo';
import { synthesizeArcs, deriveKpis } from '../../components/threatintel/cti/geo';

const PulseMap = lazy(() => import('./PulseMap'));
const CtiGlobe = lazy(() => import('../../components/threatintel/cti/CtiGlobe'));

/* ─── Types ─────────────────────────────────────────────────────────────── */

type PulseKind =
  | 'earthquake'
  | 'ioc_activity'
  | 'geopolitical'
  | 'tech_news'
  | 'reddit'
  | 'telegram'
  | 'x_feed'
  | 'scam'
  | 'breach'
  | 'briefing'
  | 'cyber_attack'
  | 'aircraft'
  | 'war_room'
  | 'c2_tracker'
  | 'cisa_advisory'
  | 'blocklist'
  | 'darkweb'
  | 'infostealer'
  | 'phishing'
  | 'malware'
  | 'ransomware'
  | 'detection'
  | 'cybercrime'
  | 'research'
  | 'cve';

interface PulseEvent {
  id: string;
  kind: PulseKind;
  title: string;
  description: string;
  lat: number;
  lng: number;
  magnitude?: number;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  source: string;
  url?: string;
  country?: string;
}

interface GlobalPulseResponse {
  generated_at: string;
  total_events: number;
  events: PulseEvent[];
  layers: Record<PulseKind, number>;
}

/* ─── Layer config ──────────────────────────────────────────────────────── */

interface LayerDef {
  label: string;
  icon: ReactNode;
  color: string;
  group: 'geo' | 'intel' | 'social';
}

const LAYER_DEFS: Record<PulseKind, LayerDef> = {
  earthquake: { label: 'Earthquakes', icon: <Activity size={12} />, color: 'text-orange-500', group: 'geo' },
  war_room: { label: 'War Room', icon: <Flame size={12} />, color: 'text-red-600', group: 'geo' },
  geopolitical: { label: 'Geopolitical', icon: <Globe size={12} />, color: 'text-purple-500', group: 'geo' },
  aircraft: { label: 'Aircraft', icon: <Plane size={12} />, color: 'text-indigo-500', group: 'geo' },
  ioc_activity: { label: 'IOC Activity', icon: <Radio size={12} />, color: 'text-rose-500', group: 'intel' },
  cyber_attack: { label: 'Live IOCs', icon: <Zap size={12} />, color: 'text-red-500', group: 'intel' },
  cve: { label: 'CVEs', icon: <Bug size={12} />, color: 'text-amber-600', group: 'intel' },
  ransomware: { label: 'Ransomware', icon: <Skull size={12} />, color: 'text-rose-600', group: 'intel' },
  darkweb: { label: 'Dark Web', icon: <ShieldAlert size={12} />, color: 'text-purple-600', group: 'intel' },
  infostealer: { label: 'Infostealers', icon: <Bug size={12} />, color: 'text-orange-600', group: 'intel' },
  phishing: { label: 'Phishing', icon: <AlertTriangle size={12} />, color: 'text-amber-500', group: 'intel' },
  malware: { label: 'Malware', icon: <Bug size={12} />, color: 'text-red-400', group: 'intel' },
  detection: { label: 'Detections', icon: <Shield size={12} />, color: 'text-emerald-500', group: 'intel' },
  cybercrime: { label: 'Cybercrime', icon: <Zap size={12} />, color: 'text-red-400', group: 'intel' },
  c2_tracker: { label: 'C2 Tracker', icon: <ShieldAlert size={12} />, color: 'text-rose-600', group: 'intel' },
  cisa_advisory: {
    label: 'CISA Advisories',
    icon: <AlertTriangle size={12} />,
    color: 'text-amber-600',
    group: 'intel',
  },
  blocklist: { label: 'Blocklist', icon: <ShieldAlert size={12} />, color: 'text-slate-500', group: 'intel' },
  breach: { label: 'Breaches', icon: <ShieldAlert size={12} />, color: 'text-red-400', group: 'intel' },
  scam: { label: 'Scam', icon: <AlertTriangle size={12} />, color: 'text-amber-500', group: 'intel' },
  briefing: { label: 'Briefings', icon: <Newspaper size={12} />, color: 'text-emerald-500', group: 'intel' },
  research: { label: 'Research', icon: <Newspaper size={12} />, color: 'text-sky-500', group: 'social' },
  reddit: { label: 'Reddit', icon: <Rss size={12} />, color: 'text-orange-400', group: 'social' },
  telegram: { label: 'Telegram', icon: <MessageSquare size={12} />, color: 'text-cyan-400', group: 'social' },
  x_feed: { label: 'X/Bluesky', icon: <AtSign size={12} />, color: 'text-blue-400', group: 'social' },
  tech_news: { label: 'Tech News', icon: <Newspaper size={12} />, color: 'text-sky-400', group: 'social' },
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const SEVERITY_VARIANT: Record<string, 'danger' | 'warning' | 'default'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'default',
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

const ALL_KINDS = Object.keys(LAYER_DEFS) as PulseKind[];

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function GlobalPulse(): JSX.Element {
  const [data, setData] = useState<GlobalPulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLayers, setActiveLayers] = useState<Set<PulseKind>>(
    new Set([
      'earthquake',
      'ioc_activity',
      'cyber_attack',
      'ransomware',
      'breach',
      'darkweb',
      'cve',
      'phishing',
      'infostealer',
      'malware',
    ])
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<PulseEvent | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'geo' | 'intel' | 'social'>('all');
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('3d');
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const loadIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const myId = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/global-pulse');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as GlobalPulseResponse;
      if (loadIdRef.current === myId) setData(json);
    } catch (e) {
      if (loadIdRef.current === myId) setError((e as Error).message);
    } finally {
      if (loadIdRef.current === myId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(load, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, load]);

  const toggleLayer = useCallback((layer: PulseKind) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((group: PulseKind[]) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      const allOn = group.every((k) => next.has(k));
      for (const k of group) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    let events = data.events.filter((e) => activeLayers.has(e.kind));
    if (viewMode !== 'all') {
      const groupKinds = ALL_KINDS.filter((k) => LAYER_DEFS[k].group === viewMode);
      events = events.filter((e) => groupKinds.includes(e.kind));
    }
    return events;
  }, [data, activeLayers, viewMode]);

  // Geo points for globe/map
  const geoPoints = useMemo(() => {
    return filteredEvents
      .filter((e) => e.lat !== 0 || e.lng !== 0)
      .map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, severity: e.severity, kind: e.kind }));
  }, [filteredEvents]);

  // Globe data
  const globePoints: CtiPoint[] = useMemo(() => {
    return geoPoints.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      severity: p.severity as CtiPoint['severity'],
      count: 1,
      label: p.id,
      countryCode: '',
    }));
  }, [geoPoints]);

  const globeArcs: CtiArc[] = useMemo(() => synthesizeArcs(globePoints), [globePoints]);
  const kpis = useMemo(() => deriveKpis(globePoints, filteredEvents.length), [globePoints, filteredEvents]);

  // Point click → focus globe
  const handlePointClick = useCallback((point: CtiPoint) => {
    setFocus({ lat: point.lat, lng: point.lng });
  }, []);

  const headerExtra = (
    <div className="space-y-3 mt-2">
      {/* Map mode toggle + view tabs */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setMapMode('3d')}
            className={`inline-flex items-center gap-1 text-[11px] font-mono px-3 py-1.5 transition-colors ${mapMode === '3d' ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'bg-white dark:bg-slate-900 text-slate-500'}`}
          >
            <Box size={12} /> 3D Globe
          </button>
          <button
            type="button"
            onClick={() => setMapMode('2d')}
            className={`inline-flex items-center gap-1 text-[11px] font-mono px-3 py-1.5 transition-colors ${mapMode === '2d' ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'bg-white dark:bg-slate-900 text-slate-500'}`}
          >
            <Map size={12} /> 2D Map
          </button>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          {(
            [
              ['all', 'All'],
              ['geo', 'Geo'],
              ['intel', 'Intel'],
              ['social', 'Social'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              className={`text-[11px] font-mono px-3 py-1.5 transition-colors ${viewMode === m ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'bg-white dark:bg-slate-900 text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Layer toggles by group */}
      <div className="flex flex-wrap gap-3">
        {(['geo', 'intel', 'social'] as const).map((group) => {
          const groupKinds = ALL_KINDS.filter((k) => LAYER_DEFS[k].group === group);
          return (
            <div key={group} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleGroup(groupKinds)}
                className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${groupKinds.some((k) => activeLayers.has(k)) ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}
              >
                {group}
              </button>
              {groupKinds.map((kind) => {
                const def = LAYER_DEFS[kind];
                const on = activeLayers.has(kind);
                const count = data?.layers[kind] ?? 0;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleLayer(kind)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded-md border transition-all ${on ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-60'}`}
                  >
                    <span className={on ? def.color : ''}>{def.icon}</span>
                    {def.label}
                    <span className="opacity-50">{count}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Auto-refresh */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAutoRefresh((p) => !p)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${autoRefresh ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700 text-slate-500'}`}
        >
          <RefreshCw size={12} className={autoRefresh ? 'animate-spin' : ''} /> Auto-refresh
        </button>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
    </div>
  );

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Globe size={28} />}
      title="Global Pulse — Live Intel"
      description="Real-time global intelligence: 3D globe with severity arcs, earthquakes, cyber attacks, IOCs, ransomware, dark web, phishing, malware, CVEs, breaches, social feeds, and more."
      headerExtra={headerExtra}
      loading={loading && !data}
      error={error}
      onRetry={load}
    >
      {data && (
        <>
          {/* KPIs */}
          <StatCards
            cards={[
              { label: 'Total Events', value: data.total_events, icon: <Activity size={16} /> },
              {
                label: 'Critical',
                value: kpis.critical,
                icon: <AlertTriangle size={16} />,
                color: 'text-rose-600 dark:text-rose-400',
              },
              {
                label: 'High',
                value: kpis.high,
                icon: <Shield size={16} />,
                color: 'text-orange-600 dark:text-orange-400',
              },
              {
                label: 'Geo Points',
                value: kpis.geoCount,
                icon: <Globe size={16} />,
                color: 'text-sky-600 dark:text-sky-400',
              },
            ]}
          />

          {/* Map + Feed */}
          <div className="mt-6 grid lg:grid-cols-[1fr_340px] gap-6">
            {/* Map/Globe */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden min-h-[500px]">
              {mapMode === '3d' ? (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-[500px] text-sm text-slate-400">
                      <Globe
                        size={32}
                        className="text-brand-500 animate-spin mx-auto mb-2"
                        style={{ animationDuration: '3s' }}
                      />
                    </div>
                  }
                >
                  <CtiGlobe
                    arcs={globeArcs}
                    points={globePoints}
                    focus={focus}
                    onPointClick={handlePointClick}
                    autoRotate={false}
                  />
                </Suspense>
              ) : (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-[500px] text-sm text-slate-400">
                      Loading map…
                    </div>
                  }
                >
                  <PulseMap markers={geoPoints} />
                </Suspense>
              )}
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                {ALL_KINDS.filter((k) => LAYER_DEFS[k].group === 'geo' && activeLayers.has(k)).map((kind) => (
                  <div key={kind} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${LAYER_DEFS[kind].color.replace('text-', 'bg-')}`} />
                    <span className="text-[9px] font-mono text-slate-500">{LAYER_DEFS[kind].label}</span>
                  </div>
                ))}
                <span className="text-[9px] font-mono text-slate-500 ml-2 border-l border-slate-700 pl-2">
                  Arcs = observed source telemetry → focal target
                </span>
              </div>
            </div>

            {/* Event feed */}
            <aside className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
              <div className="sticky top-0 bg-white dark:bg-slate-950 pb-2 z-10 flex items-center justify-between">
                <h3 className="text-sm font-semibold font-mono text-slate-700 dark:text-slate-300">
                  Live Feed ({filteredEvents.length})
                </h3>
              </div>
              {filteredEvents.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No events match active layers.</p>
              ) : (
                filteredEvents.slice(0, 100).map((ev) => {
                  const def = LAYER_DEFS[ev.kind];
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        setSelectedEvent(selectedEvent?.id === ev.id ? null : ev);
                        if (ev.lat !== 0 || ev.lng !== 0) setFocus({ lat: ev.lat, lng: ev.lng });
                      }}
                      className={`w-full text-left rounded-lg border p-2 transition-colors ${selectedEvent?.id === ev.id ? 'border-brand-500/60 bg-brand-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 shrink-0 ${def.color}`}>{def.icon}</span>
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate block">
                            {ev.title}
                          </span>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{ev.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-mono text-slate-400">{formatTime(ev.timestamp)}</span>
                            <span className="text-[9px] font-mono text-slate-400">{ev.source}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </aside>
          </div>

          {/* Selected event detail */}
          {selectedEvent && (
            <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 animate-fade-in-up">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={LAYER_DEFS[selectedEvent.kind]?.color}>
                      {LAYER_DEFS[selectedEvent.kind]?.icon}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selectedEvent.title}</h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{selectedEvent.description}</p>
                </div>
                <Badge size="sm" variant={SEVERITY_VARIANT[selectedEvent.severity] ?? 'default'}>
                  {selectedEvent.severity}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono text-slate-500">
                <span>Source: {selectedEvent.source}</span>
                <span>Kind: {LAYER_DEFS[selectedEvent.kind]?.label ?? selectedEvent.kind}</span>
                {selectedEvent.url && (
                  <a
                    href={selectedEvent.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    View source →
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </DataPageLayout>
  );
}

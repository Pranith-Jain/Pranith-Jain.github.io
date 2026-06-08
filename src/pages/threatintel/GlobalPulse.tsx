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
  Wifi,
  WifiOff,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Badge } from '../../components/ui/Badge';
import { StatCards } from '../../components/ui/StatCards';
import type { CtiArc, CtiPoint } from '../../components/threatintel/cti/geo';
import { severityColor, synthesizeArcs, deriveKpis } from '../../components/threatintel/cti/geo';

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
  glowColor: string;
  group: 'geo' | 'intel' | 'social';
}

const LAYER_DEFS: Record<PulseKind, LayerDef> = {
  earthquake: {
    label: 'Earthquakes',
    icon: <Activity size={12} />,
    color: 'text-orange-500',
    glowColor: '#f97316',
    group: 'geo',
  },
  war_room: { label: 'War Room', icon: <Flame size={12} />, color: 'text-red-600', glowColor: '#dc2626', group: 'geo' },
  geopolitical: {
    label: 'Geopolitical',
    icon: <Globe size={12} />,
    color: 'text-purple-500',
    glowColor: '#a855f7',
    group: 'geo',
  },
  aircraft: {
    label: 'Aircraft',
    icon: <Plane size={12} />,
    color: 'text-indigo-500',
    glowColor: '#6366f1',
    group: 'geo',
  },
  ioc_activity: {
    label: 'IOC Activity',
    icon: <Radio size={12} />,
    color: 'text-rose-500',
    glowColor: '#f43f5e',
    group: 'intel',
  },
  cyber_attack: {
    label: 'Live IOCs',
    icon: <Zap size={12} />,
    color: 'text-red-500',
    glowColor: '#ef4444',
    group: 'intel',
  },
  cve: { label: 'CVEs', icon: <Bug size={12} />, color: 'text-amber-600', glowColor: '#d97706', group: 'intel' },
  ransomware: {
    label: 'Ransomware',
    icon: <Skull size={12} />,
    color: 'text-rose-600',
    glowColor: '#e11d48',
    group: 'intel',
  },
  darkweb: {
    label: 'Dark Web',
    icon: <ShieldAlert size={12} />,
    color: 'text-purple-600',
    glowColor: '#9333ea',
    group: 'intel',
  },
  infostealer: {
    label: 'Infostealers',
    icon: <Bug size={12} />,
    color: 'text-orange-600',
    glowColor: '#ea580c',
    group: 'intel',
  },
  phishing: {
    label: 'Phishing',
    icon: <AlertTriangle size={12} />,
    color: 'text-amber-500',
    glowColor: '#f59e0b',
    group: 'intel',
  },
  malware: { label: 'Malware', icon: <Bug size={12} />, color: 'text-red-400', glowColor: '#f87171', group: 'intel' },
  detection: {
    label: 'Detections',
    icon: <Shield size={12} />,
    color: 'text-emerald-500',
    glowColor: '#10b981',
    group: 'intel',
  },
  cybercrime: {
    label: 'Cybercrime',
    icon: <Zap size={12} />,
    color: 'text-red-400',
    glowColor: '#f87171',
    group: 'intel',
  },
  c2_tracker: {
    label: 'C2 Tracker',
    icon: <ShieldAlert size={12} />,
    color: 'text-rose-600',
    glowColor: '#e11d48',
    group: 'intel',
  },
  cisa_advisory: {
    label: 'CISA Advisories',
    icon: <AlertTriangle size={12} />,
    color: 'text-amber-600',
    glowColor: '#d97706',
    group: 'intel',
  },
  blocklist: {
    label: 'Blocklist',
    icon: <ShieldAlert size={12} />,
    color: 'text-slate-500',
    glowColor: '#64748b',
    group: 'intel',
  },
  breach: {
    label: 'Breaches',
    icon: <ShieldAlert size={12} />,
    color: 'text-red-400',
    glowColor: '#f87171',
    group: 'intel',
  },
  scam: {
    label: 'Scam',
    icon: <AlertTriangle size={12} />,
    color: 'text-amber-500',
    glowColor: '#f59e0b',
    group: 'intel',
  },
  briefing: {
    label: 'Briefings',
    icon: <Newspaper size={12} />,
    color: 'text-emerald-500',
    glowColor: '#10b981',
    group: 'intel',
  },
  research: {
    label: 'Research',
    icon: <Newspaper size={12} />,
    color: 'text-sky-500',
    glowColor: '#0ea5e9',
    group: 'social',
  },
  reddit: { label: 'Reddit', icon: <Rss size={12} />, color: 'text-orange-400', glowColor: '#fb923c', group: 'social' },
  telegram: {
    label: 'Telegram',
    icon: <MessageSquare size={12} />,
    color: 'text-cyan-400',
    glowColor: '#22d3ee',
    group: 'social',
  },
  x_feed: {
    label: 'X/Bluesky',
    icon: <AtSign size={12} />,
    color: 'text-blue-400',
    glowColor: '#60a5fa',
    group: 'social',
  },
  tech_news: {
    label: 'Tech News',
    icon: <Newspaper size={12} />,
    color: 'text-sky-400',
    glowColor: '#38bdf8',
    group: 'social',
  },
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const SEVERITY_VARIANT: Record<string, 'danger' | 'warning' | 'default'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'default',
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500 shadow-rose-500/50',
  high: 'bg-orange-500 shadow-orange-500/50',
  medium: 'bg-amber-500 shadow-amber-500/50',
  low: 'bg-emerald-500 shadow-emerald-500/50',
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function formatTimeFull(ts: string): string {
  return new Date(ts).toLocaleString();
}

const ALL_KINDS = Object.keys(LAYER_DEFS) as PulseKind[];

/* ─── Layer group definitions ───────────────────────────────────────────── */

const GROUP_LABELS: Record<string, string> = {
  geo: 'Geospatial',
  intel: 'Threat Intel',
  social: 'Social / OSINT',
};

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
      'c2_tracker',
      'cisa_advisory',
      'blocklist',
      'war_room',
      'aircraft',
      'geopolitical',
      'tech_news',
    ])
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<PulseEvent | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'geo' | 'intel' | 'social'>('all');
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('3d');
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
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
      if (loadIdRef.current === myId) {
        setData(json);
        setLastUpdated(new Date().toISOString());
      }
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

  // Count active layers with data
  const activeWithData = useMemo(() => {
    if (!data) return 0;
    return ALL_KINDS.filter((k) => activeLayers.has(k) && (data.layers[k] ?? 0) > 0).length;
  }, [data, activeLayers]);

  // Point click → focus globe
  const handlePointClick = useCallback((point: CtiPoint) => {
    setFocus({ lat: point.lat, lng: point.lng });
  }, []);

  const headerExtra = (
    <div className="space-y-3 mt-2">
      {/* Map mode toggle + view tabs */}
      <div className="flex items-center gap-2 flex-wrap">
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
        {/* Live status indicator */}
        <div className="flex items-center gap-1.5 ml-auto">
          {autoRefresh ? (
            <Wifi size={12} className="text-emerald-500 animate-pulse" />
          ) : (
            <WifiOff size={12} className="text-slate-400" />
          )}
          <span className="text-[10px] font-mono text-slate-500">{geoPoints.length} geo pts</span>
          {lastUpdated && <span className="text-[10px] font-mono text-slate-400">· {formatTime(lastUpdated)}</span>}
        </div>
      </div>

      {/* Layer toggles by group */}
      <div className="flex flex-wrap gap-3">
        {(['geo', 'intel', 'social'] as const).map((group) => {
          const groupKinds = ALL_KINDS.filter((k) => LAYER_DEFS[k].group === group);
          const groupCount = groupKinds.reduce((sum, k) => sum + (data?.layers[k] ?? 0), 0);
          return (
            <div key={group} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleGroup(groupKinds)}
                className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${groupKinds.some((k) => activeLayers.has(k)) ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}
                title={`${GROUP_LABELS[group]} — ${groupCount} events`}
              >
                {group} ({groupCount})
              </button>
              {groupKinds.map((kind) => {
                const def = LAYER_DEFS[kind];
                const on = activeLayers.has(kind);
                const count = data?.layers[kind] ?? 0;
                const hasData = count > 0;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleLayer(kind)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded-md border transition-all ${
                      on
                        ? hasData
                          ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-60'
                    }`}
                    title={`${def.label} — ${count} events`}
                  >
                    <span className={on && hasData ? def.color : ''}>{def.icon}</span>
                    {def.label}
                    <span className={`${on && hasData ? 'opacity-70' : 'opacity-40'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
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
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        {/* Select all / none quick actions */}
        <button
          type="button"
          onClick={() => setActiveLayers(new Set(ALL_KINDS))}
          className="text-[10px] font-mono px-2 py-1 rounded text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 transition-colors"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={() => setActiveLayers(new Set())}
          className="text-[10px] font-mono px-2 py-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          Clear All
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
              {
                label: 'Active Layers',
                value: `${activeWithData}/${activeLayers.size}`,
                icon: <Radio size={16} />,
                color: 'text-emerald-600 dark:text-emerald-400',
              },
            ]}
          />

          {/* Degraded data warning */}
          {data.total_events < 10 && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Limited data available</p>
                <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70">
                  Some data feeds may be warming up. Try refreshing in a moment for more comprehensive coverage.
                </p>
              </div>
            </div>
          )}

          {/* Map + Feed */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
            {/* Map/Globe */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden min-h-[350px] sm:min-h-[500px] relative">
              {/* Empty state for globe */}
              {geoPoints.length === 0 && mapMode === '3d' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                  <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl px-6 py-4 text-center border border-slate-700/50">
                    <Globe size={32} className="text-slate-500 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 font-medium">No geolocated events</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Enable IOC Activity or Earthquake layers to see points on the globe
                    </p>
                  </div>
                </div>
              )}
              {mapMode === '3d' ? (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-[350px] sm:h-[500px] text-sm text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" />
                        <span className="animate-pulse">Loading globe…</span>
                      </div>
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
                    <div className="flex items-center justify-center h-[350px] sm:h-[500px] text-sm text-slate-400">
                      Loading map…
                    </div>
                  }
                >
                  <PulseMap markers={geoPoints} />
                </Suspense>
              )}
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                  <div key={sev} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full shadow-sm ${SEVERITY_DOT[sev]}`} />
                    <span className="text-[9px] font-mono text-slate-500 capitalize">{sev}</span>
                  </div>
                ))}
                <span className="text-[9px] font-mono text-slate-500 ml-2 border-l border-slate-200 dark:border-slate-700 pl-2">
                  Arcs = observed source telemetry → focal target
                </span>
                <span className="text-[9px] font-mono text-slate-400 ml-auto">
                  {geoPoints.length} points · {globeArcs.length} arcs
                </span>
              </div>
            </div>

            {/* Event feed */}
            <aside className="space-y-1 max-h-[400px] sm:max-h-[660px] overflow-y-auto pr-1 custom-scrollbar">
              <div className="sticky top-0 bg-white dark:bg-slate-950 pb-2 z-10 flex items-center justify-between">
                <h3 className="text-sm font-semibold font-mono text-slate-700 dark:text-slate-300">
                  Live Feed ({filteredEvents.length})
                </h3>
                {filteredEvents.length > 0 && (
                  <span className="text-[10px] font-mono text-slate-400">
                    {filteredEvents.filter((e) => e.severity === 'critical').length} critical
                  </span>
                )}
              </div>
              {filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Radio size={24} className="text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-xs text-slate-400 font-medium">No events match active layers</p>
                  <p className="text-[11px] text-slate-500 mt-1">Enable some layers above to see live data</p>
                  <button
                    type="button"
                    onClick={() => setActiveLayers(new Set(ALL_KINDS))}
                    className="mt-3 text-[11px] font-mono px-3 py-1.5 rounded-lg border border-brand-500/30 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 transition-colors"
                  >
                    Enable All Layers
                  </button>
                </div>
              ) : (
                filteredEvents.slice(0, 100).map((ev) => {
                  const def = LAYER_DEFS[ev.kind];
                  const isSelected = selectedEvent?.id === ev.id;
                  const hasGeo = ev.lat !== 0 || ev.lng !== 0;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        setSelectedEvent(isSelected ? null : ev);
                        if (hasGeo) setFocus({ lat: ev.lat, lng: ev.lng });
                      }}
                      className={`w-full text-left rounded-lg border p-2.5 transition-all ${
                        isSelected
                          ? 'border-brand-500/60 bg-brand-500/5 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Severity indicator dot */}
                        <div className="mt-1 shrink-0 relative">
                          <span className={`w-2 h-2 rounded-full block shadow-sm ${SEVERITY_DOT[ev.severity]}`} />
                          {ev.severity === 'critical' && (
                            <span className="absolute inset-0 w-2 h-2 rounded-full bg-rose-500 animate-ping opacity-40" />
                          )}
                        </div>
                        <div className={`shrink-0 ${def?.color ?? 'text-slate-400'}`}>{def?.icon}</div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate block">
                            {ev.title}
                          </span>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {ev.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[9px] font-mono text-slate-400">{formatTime(ev.timestamp)}</span>
                            <span className="text-[9px] font-mono text-slate-400">{ev.source}</span>
                            {hasGeo && (
                              <span className="text-[9px] font-mono text-brand-500 flex items-center gap-0.5">
                                <Globe size={8} /> geo
                              </span>
                            )}
                            {ev.url && (
                              <a
                                href={ev.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[9px] font-mono text-brand-500 hover:underline flex items-center gap-0.5"
                              >
                                <ExternalLink size={8} /> src
                              </a>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          size={12}
                          className={`shrink-0 mt-1 transition-transform ${isSelected ? 'rotate-90 text-brand-500' : 'text-slate-300 dark:text-slate-600'}`}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </aside>
          </div>

          {/* Selected event detail */}
          {selectedEvent && (
            <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 animate-fade-in-up">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className={`shrink-0 ${LAYER_DEFS[selectedEvent.kind]?.color}`}>
                      {LAYER_DEFS[selectedEvent.kind]?.icon}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selectedEvent.title}</h3>
                    <Badge size="sm" variant={SEVERITY_VARIANT[selectedEvent.severity] ?? 'default'}>
                      {selectedEvent.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                    {selectedEvent.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-mono text-slate-500">
                    <span>
                      Source: <span className="text-slate-700 dark:text-slate-300">{selectedEvent.source}</span>
                    </span>
                    <span>
                      Type:{' '}
                      <span className="text-slate-700 dark:text-slate-300">
                        {LAYER_DEFS[selectedEvent.kind]?.label ?? selectedEvent.kind}
                      </span>
                    </span>
                    <span>
                      Time:{' '}
                      <span className="text-slate-700 dark:text-slate-300">
                        {formatTimeFull(selectedEvent.timestamp)}
                      </span>
                    </span>
                    {selectedEvent.country && (
                      <span>
                        Country: <span className="text-slate-700 dark:text-slate-300">{selectedEvent.country}</span>
                      </span>
                    )}
                    {(selectedEvent.lat !== 0 || selectedEvent.lng !== 0) && (
                      <span>
                        Coords:{' '}
                        <span className="text-slate-700 dark:text-slate-300">
                          {selectedEvent.lat.toFixed(2)}, {selectedEvent.lng.toFixed(2)}
                        </span>
                      </span>
                    )}
                    {selectedEvent.magnitude != null && (
                      <span>
                        Magnitude:{' '}
                        <span className="text-slate-700 dark:text-slate-300">{selectedEvent.magnitude.toFixed(1)}</span>
                      </span>
                    )}
                    {selectedEvent.url && (
                      <a
                        href={selectedEvent.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        <ExternalLink size={10} /> View source
                      </a>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="text-[10px] font-mono px-2 py-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </DataPageLayout>
  );
}

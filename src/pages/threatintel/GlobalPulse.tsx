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
  Layers,
  Filter,
  X,
  Clock,
  Crosshair,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Badge } from '../../components/ui/Badge';
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
  shortLabel: string;
  icon: ReactNode;
  color: string;
  bgColor: string;
  group: 'geo' | 'intel' | 'social';
}

const LAYER_DEFS: Record<PulseKind, LayerDef> = {
  earthquake: {
    label: 'Earthquakes',
    shortLabel: 'EQ',
    icon: <Activity size={14} />,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 border-orange-500/20',
    group: 'geo',
  },
  war_room: {
    label: 'War Room',
    shortLabel: 'WAR',
    icon: <Flame size={14} />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
    group: 'geo',
  },
  geopolitical: {
    label: 'Geopolitical',
    shortLabel: 'GEO',
    icon: <Globe size={14} />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
    group: 'geo',
  },
  aircraft: {
    label: 'Aircraft',
    shortLabel: 'AIR',
    icon: <Plane size={14} />,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10 border-indigo-500/20',
    group: 'geo',
  },
  ioc_activity: {
    label: 'IOC Activity',
    shortLabel: 'IOC',
    icon: <Radio size={14} />,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10 border-rose-500/20',
    group: 'intel',
  },
  cyber_attack: {
    label: 'Live IOCs',
    shortLabel: 'IOC',
    icon: <Zap size={14} />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
    group: 'intel',
  },
  cve: {
    label: 'CVEs',
    shortLabel: 'CVE',
    icon: <Bug size={14} />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
    group: 'intel',
  },
  ransomware: {
    label: 'Ransomware',
    shortLabel: 'RANSOM',
    icon: <Skull size={14} />,
    color: 'text-rose-500',
    bgColor: 'bg-rose-600/10 border-rose-600/20',
    group: 'intel',
  },
  darkweb: {
    label: 'Dark Web',
    shortLabel: 'DARK',
    icon: <ShieldAlert size={14} />,
    color: 'text-purple-500',
    bgColor: 'bg-purple-600/10 border-purple-600/20',
    group: 'intel',
  },
  infostealer: {
    label: 'Infostealers',
    shortLabel: 'STEALER',
    icon: <Bug size={14} />,
    color: 'text-orange-500',
    bgColor: 'bg-orange-600/10 border-orange-600/20',
    group: 'intel',
  },
  phishing: {
    label: 'Phishing',
    shortLabel: 'PHISH',
    icon: <AlertTriangle size={14} />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
    group: 'intel',
  },
  malware: {
    label: 'Malware',
    shortLabel: 'MAL',
    icon: <Bug size={14} />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
    group: 'intel',
  },
  detection: {
    label: 'Detections',
    shortLabel: 'DETECT',
    icon: <Shield size={14} />,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    group: 'intel',
  },
  cybercrime: {
    label: 'Cybercrime',
    shortLabel: 'CRIME',
    icon: <Zap size={14} />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
    group: 'intel',
  },
  c2_tracker: {
    label: 'C2 Tracker',
    shortLabel: 'C2',
    icon: <Crosshair size={14} />,
    color: 'text-rose-500',
    bgColor: 'bg-rose-600/10 border-rose-600/20',
    group: 'intel',
  },
  cisa_advisory: {
    label: 'CISA KEV',
    shortLabel: 'KEV',
    icon: <AlertTriangle size={14} />,
    color: 'text-amber-500',
    bgColor: 'bg-amber-600/10 border-amber-600/20',
    group: 'intel',
  },
  blocklist: {
    label: 'Blocklist',
    shortLabel: 'BL',
    icon: <ShieldAlert size={14} />,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
    group: 'intel',
  },
  breach: {
    label: 'Breaches',
    shortLabel: 'BREACH',
    icon: <ShieldAlert size={14} />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
    group: 'intel',
  },
  scam: {
    label: 'Scam',
    shortLabel: 'SCAM',
    icon: <AlertTriangle size={14} />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
    group: 'intel',
  },
  briefing: {
    label: 'Briefings',
    shortLabel: 'INTEL',
    icon: <Newspaper size={14} />,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    group: 'intel',
  },
  research: {
    label: 'Research',
    shortLabel: 'RSRCH',
    icon: <Newspaper size={14} />,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
    group: 'social',
  },
  reddit: {
    label: 'Reddit',
    shortLabel: 'RDDT',
    icon: <Rss size={14} />,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 border-orange-500/20',
    group: 'social',
  },
  telegram: {
    label: 'Telegram',
    shortLabel: 'TG',
    icon: <MessageSquare size={14} />,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20',
    group: 'social',
  },
  x_feed: {
    label: 'X/Bluesky',
    shortLabel: 'X',
    icon: <AtSign size={14} />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    group: 'social',
  },
  tech_news: {
    label: 'Tech Infra',
    shortLabel: 'TECH',
    icon: <Newspaper size={14} />,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
    group: 'social',
  },
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const SEVERITY_CONFIG = {
  critical: {
    dot: 'bg-rose-500',
    ring: 'ring-rose-500/30',
    text: 'text-rose-400',
    bg: 'bg-rose-500/10',
    badge: 'danger' as const,
    pulse: true,
  },
  high: {
    dot: 'bg-orange-500',
    ring: 'ring-orange-500/30',
    text: 'text-orange-400',
    bg: 'bg-orange-500/10',
    badge: 'warning' as const,
    pulse: false,
  },
  medium: {
    dot: 'bg-amber-500',
    ring: 'ring-amber-500/30',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    badge: 'warning' as const,
    pulse: false,
  },
  low: {
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500/30',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    badge: 'default' as const,
    pulse: false,
  },
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function formatTimeFull(ts: string): string {
  return new Date(ts).toLocaleString();
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
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('3d');
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(new Set(['critical', 'high', 'medium', 'low']));
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

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    return data.events.filter((e) => activeLayers.has(e.kind) && severityFilter.has(e.severity));
  }, [data, activeLayers, severityFilter]);

  const geoPoints = useMemo(() => {
    return filteredEvents
      .filter((e) => e.lat !== 0 || e.lng !== 0)
      .map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, severity: e.severity, kind: e.kind }));
  }, [filteredEvents]);

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

  const handlePointClick = useCallback((point: CtiPoint) => {
    setFocus({ lat: point.lat, lng: point.lng });
  }, []);

  // Group layers by category
  const layerGroups = useMemo(() => {
    const groups: Record<string, Array<{ kind: PulseKind; def: LayerDef; count: number; active: boolean }>> = {
      geo: [],
      intel: [],
      social: [],
    };
    for (const kind of ALL_KINDS) {
      const def = LAYER_DEFS[kind];
      const count = data?.layers[kind] ?? 0;
      groups[def.group].push({ kind, def, count, active: activeLayers.has(kind) });
    }
    return groups;
  }, [data, activeLayers]);

  // KPI stats
  const stats = useMemo(() => {
    if (!data) return null;
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    const bySource: Record<string, number> = {};
    for (const e of filteredEvents) {
      bySeverity[e.severity]++;
      bySource[e.source] = (bySource[e.source] || 0) + 1;
    }
    const topSources = Object.entries(bySource)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    return { bySeverity, topSources, geoCount: geoPoints.length };
  }, [data, filteredEvents, geoPoints]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Globe size={28} />}
      title="Global Pulse"
      description="Real-time global intelligence across cyber, geopolitical, and social domains"
      loading={loading && !data}
      error={error}
      onRetry={load}
    >
      {data && (
        <div className="space-y-4">
          {/* ─── Top Stats Bar ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-slate-400" />
                <span className="text-[10px] font-mono uppercase text-slate-500">Total Events</span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{data.total_events}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-1">{geoPoints.length} geo-located</div>
            </div>

            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-rose-400" />
                <span className="text-[10px] font-mono uppercase text-rose-500/70">Critical</span>
              </div>
              <div className="text-2xl font-bold font-mono text-rose-400">{kpis.critical}</div>
              <div className="text-[10px] font-mono text-rose-500/60 mt-1">
                {stats?.bySeverity.high ?? 0} high severity
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Layers size={14} className="text-slate-400" />
                <span className="text-[10px] font-mono uppercase text-slate-500">Active Layers</span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{activeLayers.size}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-1">
                {ALL_KINDS.length - activeLayers.size} hidden
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-slate-400" />
                <span className="text-[10px] font-mono uppercase text-slate-500">Last Update</span>
              </div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                {lastUpdated ? formatTime(lastUpdated) : '—'}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                {autoRefresh ? (
                  <>
                    <Wifi size={10} className="text-emerald-400" />
                    <span className="text-[10px] font-mono text-emerald-500">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={10} className="text-slate-400" />
                    <span className="text-[10px] font-mono text-slate-500">Paused</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ─── Controls Bar ─── */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Map Mode Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setMapMode('3d')}
                className={`inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 transition-colors ${
                  mapMode === '3d'
                    ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Box size={14} /> 3D Globe
              </button>
              <button
                type="button"
                onClick={() => setMapMode('2d')}
                className={`inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 transition-colors ${
                  mapMode === '2d'
                    ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Map size={14} /> 2D Map
              </button>
            </div>

            {/* Filters Toggle */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg border transition-colors ${
                showFilters
                  ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Filter size={14} />
              Filters
              {activeLayers.size < ALL_KINDS.length && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-brand-500/20 text-brand-600 dark:text-brand-400">
                  {activeLayers.size}
                </span>
              )}
            </button>

            {/* Refresh Controls */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setAutoRefresh((p) => !p)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-lg border transition-colors ${
                  autoRefresh
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
              >
                <RefreshCw size={12} className={autoRefresh ? 'animate-spin' : ''} />
                {autoRefresh ? 'Live' : 'Paused'}
              </button>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* ─── Filters Panel ─── */}
          {showFilters && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 animate-fade-in">
              {/* Severity Filter */}
              <div className="mb-4">
                <h4 className="text-[10px] font-mono uppercase text-slate-500 mb-2">Severity</h4>
                <div className="flex gap-2">
                  {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
                    const config = SEVERITY_CONFIG[sev];
                    const active = severityFilter.has(sev);
                    return (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => {
                          setSeverityFilter((prev) => {
                            const next = new Set(prev);
                            if (next.has(sev)) next.delete(sev);
                            else next.add(sev);
                            return next;
                          });
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                          active
                            ? `${config.bg} border-current ${config.text}`
                            : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-60'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${active ? config.dot : 'bg-slate-400'}`} />
                        {sev}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Layer Groups */}
              {(['geo', 'intel', 'social'] as const).map((group) => {
                const layers = layerGroups[group];
                const activeCount = layers.filter((l) => l.active).length;
                const groupLabels = { geo: 'Geospatial', intel: 'Threat Intel', social: 'Social / OSINT' };
                return (
                  <div key={group} className="mb-4 last:mb-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] font-mono uppercase text-slate-500">
                        {groupLabels[group]}
                        <span className="ml-2 text-slate-400">
                          ({activeCount}/{layers.length})
                        </span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveLayers((prev) => {
                            const next = new Set(prev);
                            const allActive = layers.every((l) => next.has(l.kind));
                            for (const l of layers) {
                              if (allActive) next.delete(l.kind);
                              else next.add(l.kind);
                            }
                            return next;
                          });
                        }}
                        className="text-[10px] font-mono text-brand-500 hover:text-brand-600"
                      >
                        {activeCount === layers.length ? 'Clear' : 'Select All'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {layers.map(({ kind, def, count, active }) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => toggleLayer(kind)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                            active
                              ? count > 0
                                ? `${def.bgColor} ${def.color} border-current`
                                : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-400'
                              : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-50'
                          }`}
                        >
                          <span className={active && count > 0 ? def.color : 'text-slate-400'}>{def.icon}</span>
                          {def.shortLabel}
                          {count > 0 && (
                            <span className={`text-[10px] ${active ? 'opacity-70' : 'opacity-40'}`}>{count}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Main Content: Globe + Feed ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
            {/* Globe/Map Container */}
            <div
              className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0a0f1a]"
              style={{ minHeight: '500px' }}
            >
              {/* Globe Status Badge */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                <div className="bg-[#0f1629]/80 backdrop-blur-sm rounded-lg border border-slate-600/50 px-3 py-1.5 flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${mapMode === '3d' ? 'bg-brand-500 animate-pulse' : 'bg-emerald-500'}`}
                  />
                  <span className="text-[10px] font-mono text-slate-400">
                    {mapMode === '3d' ? '3D Globe' : '2D Map'}
                  </span>
                </div>
              </div>

              {/* Empty State */}
              {geoPoints.length === 0 && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <div className="bg-[#0f1629]/90 backdrop-blur-sm rounded-xl px-8 py-6 text-center border border-slate-600/50 max-w-sm">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
                      <Crosshair size={28} className="text-slate-500" />
                    </div>
                    <p className="text-sm font-medium text-slate-300 mb-1">No Geolocated Events</p>
                    <p className="text-xs text-slate-500 mb-4">
                      Enable more layers in the Filters panel to see points on the globe
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowFilters(true)}
                      className="text-xs font-mono px-4 py-2 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 border border-brand-500/30 transition-colors"
                    >
                      Open Filters
                    </button>
                  </div>
                </div>
              )}

              {/* Globe/Map Component */}
              {mapMode === '3d' ? (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-full">
                      <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full border-2 border-brand-500/20" />
                          <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-brand-500 animate-spin" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-slate-300">Loading Globe</p>
                          <p className="text-xs text-slate-500 mt-1">Initializing 3D renderer…</p>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <CtiGlobe arcs={globeArcs} points={globePoints} focus={focus} onPointClick={handlePointClick} />
                </Suspense>
              ) : (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-full">
                      <span className="text-sm text-slate-400">Loading map…</span>
                    </div>
                  }
                >
                  <PulseMap markers={geoPoints} />
                </Suspense>
              )}

              {/* Legend Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent px-4 py-3">
                <div className="flex items-center gap-4">
                  {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                    <div key={sev} className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_CONFIG[sev].dot}`} />
                      <span className="text-[11px] font-mono text-slate-400 capitalize">{sev}</span>
                    </div>
                  ))}
                  <span className="text-[11px] font-mono text-slate-500 ml-auto">
                    {geoPoints.length} points · {globeArcs.length} arcs
                  </span>
                </div>
              </div>
            </div>

            {/* Event Feed */}
            <aside className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden">
              {/* Feed Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Radio size={14} className="text-rose-400 animate-pulse" />
                  <h3 className="text-sm font-semibold font-mono text-slate-700 dark:text-slate-300">Live Feed</h3>
                  <span className="text-xs font-mono text-slate-500">({filteredEvents.length})</span>
                </div>
                {filteredEvents.filter((e) => e.severity === 'critical').length > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    {filteredEvents.filter((e) => e.severity === 'critical').length} critical
                  </span>
                )}
              </div>

              {/* Feed List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[500px] lg:max-h-none">
                {filteredEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <Filter size={32} className="text-slate-300 dark:text-slate-600 mb-4" />
                    <p className="text-sm text-slate-400 font-medium">No events match filters</p>
                    <p className="text-xs text-slate-500 mt-1">Adjust layers or severity filters above</p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLayers(new Set(ALL_KINDS));
                        setSeverityFilter(new Set(['critical', 'high', 'medium', 'low']));
                      }}
                      className="mt-4 text-xs font-mono px-4 py-2 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 transition-colors"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {filteredEvents.slice(0, 80).map((ev) => {
                      const def = LAYER_DEFS[ev.kind];
                      const sevConfig = SEVERITY_CONFIG[ev.severity];
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
                          className={`w-full text-left px-4 py-3 transition-colors ${
                            isSelected ? 'bg-brand-500/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Severity + Icon */}
                            <div className="shrink-0 mt-0.5 relative">
                              <span className={`w-3 h-3 rounded-full block ${sevConfig.dot}`} />
                              {sevConfig.pulse && (
                                <span className="absolute inset-0 w-3 h-3 rounded-full bg-rose-500 animate-ping opacity-40" />
                              )}
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={def?.color ?? 'text-slate-400'}>{def?.icon}</span>
                                <span className="text-[10px] font-mono uppercase text-slate-500">
                                  {def?.shortLabel}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400 ml-auto">
                                  {formatTime(ev.timestamp)}
                                </span>
                              </div>
                              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-1">
                                {ev.title}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                                {ev.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[10px] font-mono text-slate-400">{ev.source}</span>
                                {hasGeo && (
                                  <span className="text-[10px] font-mono text-brand-500 flex items-center gap-0.5">
                                    <Crosshair size={8} /> geo
                                  </span>
                                )}
                                {ev.url && (
                                  <a
                                    href={ev.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[10px] font-mono text-brand-500 hover:underline ml-auto"
                                  >
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* ─── Selected Event Detail ─── */}
          {selectedEvent && (
            <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5 animate-fade-in">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={LAYER_DEFS[selectedEvent.kind]?.color}>
                      {LAYER_DEFS[selectedEvent.kind]?.icon}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedEvent.title}</h3>
                    <Badge size="sm" variant={SEVERITY_CONFIG[selectedEvent.severity]?.badge ?? 'default'}>
                      {selectedEvent.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                    {selectedEvent.description}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Source</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {selectedEvent.source}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Type</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {LAYER_DEFS[selectedEvent.kind]?.label ?? selectedEvent.kind}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Time</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {formatTimeFull(selectedEvent.timestamp)}
                      </span>
                    </div>
                    {selectedEvent.country && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-slate-500 block">Country</span>
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                          {selectedEvent.country}
                        </span>
                      </div>
                    )}
                    {(selectedEvent.lat !== 0 || selectedEvent.lng !== 0) && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-slate-500 block">Coordinates</span>
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                          {selectedEvent.lat.toFixed(4)}, {selectedEvent.lng.toFixed(4)}
                        </span>
                      </div>
                    )}
                    {selectedEvent.magnitude != null && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-slate-500 block">Magnitude</span>
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                          {selectedEvent.magnitude.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                  {selectedEvent.url && (
                    <a
                      href={selectedEvent.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-4 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      <ExternalLink size={12} /> View source
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </DataPageLayout>
  );
}

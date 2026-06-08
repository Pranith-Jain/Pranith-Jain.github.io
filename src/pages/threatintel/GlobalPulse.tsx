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
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Badge } from '../../components/ui/Badge';
import { StatCards } from '../../components/ui/StatCards';
const PulseMap = lazy(() => import('./PulseMap'));

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
  /** Layer is shown on the map (has geo coords). */
  hasGeo: boolean;
  /** Layer group for section headers. */
  group: 'geo' | 'intel' | 'social' | 'monitor';
}

const LAYER_DEFS: Record<PulseKind, LayerDef> = {
  earthquake: {
    label: 'Earthquakes',
    icon: <Activity size={13} />,
    color: 'text-orange-500',
    hasGeo: true,
    group: 'geo',
  },
  war_room: { label: 'War Room', icon: <Flame size={13} />, color: 'text-red-600', hasGeo: true, group: 'geo' },
  geopolitical: {
    label: 'Geopolitical',
    icon: <Globe size={13} />,
    color: 'text-purple-500',
    hasGeo: true,
    group: 'geo',
  },
  aircraft: { label: 'Live Aircraft', icon: <Plane size={13} />, color: 'text-indigo-500', hasGeo: true, group: 'geo' },
  ioc_activity: {
    label: 'IOC Activity',
    icon: <Radio size={13} />,
    color: 'text-rose-500',
    hasGeo: true,
    group: 'intel',
  },
  cyber_attack: { label: 'Live IOCs', icon: <Zap size={13} />, color: 'text-red-500', hasGeo: false, group: 'intel' },
  cve: { label: 'CVEs', icon: <Bug size={13} />, color: 'text-amber-600', hasGeo: false, group: 'intel' },
  ransomware: { label: 'Ransomware', icon: <Skull size={13} />, color: 'text-rose-600', hasGeo: false, group: 'intel' },
  darkweb: {
    label: 'Dark Web',
    icon: <ShieldAlert size={13} />,
    color: 'text-purple-600',
    hasGeo: false,
    group: 'intel',
  },
  infostealer: {
    label: 'Infostealers',
    icon: <Bug size={13} />,
    color: 'text-orange-600',
    hasGeo: false,
    group: 'intel',
  },
  phishing: {
    label: 'Phishing',
    icon: <AlertTriangle size={13} />,
    color: 'text-amber-500',
    hasGeo: false,
    group: 'intel',
  },
  malware: { label: 'Malware', icon: <Bug size={13} />, color: 'text-red-400', hasGeo: false, group: 'intel' },
  detection: {
    label: 'Detections',
    icon: <Shield size={13} />,
    color: 'text-emerald-500',
    hasGeo: false,
    group: 'intel',
  },
  cybercrime: { label: 'Cybercrime', icon: <Zap size={13} />, color: 'text-red-400', hasGeo: false, group: 'intel' },
  c2_tracker: {
    label: 'C2 Tracker',
    icon: <ShieldAlert size={13} />,
    color: 'text-rose-600',
    hasGeo: false,
    group: 'intel',
  },
  cisa_advisory: {
    label: 'CISA Advisories',
    icon: <AlertTriangle size={13} />,
    color: 'text-amber-600',
    hasGeo: true,
    group: 'intel',
  },
  blocklist: {
    label: 'Blocklist',
    icon: <ShieldAlert size={13} />,
    color: 'text-slate-500',
    hasGeo: false,
    group: 'intel',
  },
  breach: { label: 'Breaches', icon: <ShieldAlert size={13} />, color: 'text-red-400', hasGeo: false, group: 'intel' },
  scam: {
    label: 'Scam/Phishing',
    icon: <AlertTriangle size={13} />,
    color: 'text-amber-500',
    hasGeo: false,
    group: 'intel',
  },
  briefing: {
    label: 'Briefings',
    icon: <Newspaper size={13} />,
    color: 'text-emerald-500',
    hasGeo: false,
    group: 'intel',
  },
  research: { label: 'Research', icon: <Newspaper size={13} />, color: 'text-sky-500', hasGeo: false, group: 'social' },
  reddit: { label: 'Reddit', icon: <Rss size={13} />, color: 'text-orange-400', hasGeo: false, group: 'social' },
  telegram: {
    label: 'Telegram',
    icon: <MessageSquare size={13} />,
    color: 'text-cyan-400',
    hasGeo: false,
    group: 'social',
  },
  x_feed: { label: 'X/Bluesky', icon: <AtSign size={13} />, color: 'text-blue-400', hasGeo: false, group: 'social' },
  tech_news: {
    label: 'Tech News',
    icon: <Newspaper size={13} />,
    color: 'text-sky-400',
    hasGeo: false,
    group: 'social',
  },
};

const LAYER_GROUPS = [
  { id: 'geo' as const, label: 'Geospatial' },
  { id: 'intel' as const, label: 'Threat Intel' },
  { id: 'social' as const, label: 'Social & News' },
  { id: 'monitor' as const, label: 'Monitoring' },
];

const ALL_KINDS = Object.keys(LAYER_DEFS) as PulseKind[];

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const SEVERITY_VARIANT: Record<string, 'danger' | 'warning' | 'default'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'default',
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

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
    intervalRef.current = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [autoRefresh, load]);

  const toggleLayer = (layer: PulseKind) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const toggleGroup = (group: PulseKind[]) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      const allOn = group.every((k) => next.has(k));
      for (const k of group) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    let events = data.events.filter((e) => activeLayers.has(e.kind));
    if (viewMode !== 'all') {
      const groupKinds = ALL_KINDS.filter((k) => LAYER_DEFS[k].group === viewMode);
      events = events.filter((e) => groupKinds.includes(e.kind));
    }
    return events;
  }, [data, activeLayers, viewMode]);

  const markers = useMemo(() => {
    return filteredEvents
      .filter((e) => e.lat !== 0 || e.lng !== 0)
      .map((e) => ({
        id: e.id,
        lat: e.lat,
        lng: e.lng,
        severity: e.severity,
        kind: e.kind,
      }));
  }, [filteredEvents]);

  const headerExtra = (
    <div className="space-y-3 mt-2">
      {/* View mode tabs */}
      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
        {(
          [
            ['all', 'All'],
            ['geo', 'Geo'],
            ['intel', 'Intel'],
            ['social', 'Social'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`text-[11px] font-mono px-3 py-1.5 transition-colors ${
              viewMode === mode
                ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Layer toggles by group */}
      <div className="flex flex-wrap gap-3">
        {LAYER_GROUPS.map((group) => {
          const groupKinds = ALL_KINDS.filter((k) => LAYER_DEFS[k].group === group.id);
          const hasActive = groupKinds.some((k) => activeLayers.has(k));
          return (
            <div key={group.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleGroup(groupKinds)}
                className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${
                  hasActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'
                }`}
              >
                {group.label}
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
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded-md border transition-all ${
                      on
                        ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 opacity-60'
                    }`}
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

      {/* Auto-refresh + manual */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAutoRefresh((p) => !p)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
            autoRefresh
              ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
          }`}
        >
          <RefreshCw size={12} className={autoRefresh ? 'animate-spin' : ''} />
          Auto-refresh
        </button>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw size={12} />
          Refresh now
        </button>
      </div>
    </div>
  );

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Globe size={28} />}
      title="Global Pulse — Live Intel"
      description="Real-time global intelligence: earthquakes, cyber attacks, war/conflict zones, live aircraft, geopolitical events, threat IOCs, breaches, scam/phishing, social feeds, and tech news."
      headerExtra={headerExtra}
      loading={loading && !data}
      error={error}
      onRetry={load}
    >
      {data && (
        <>
          <StatCards
            cards={[
              { label: 'Total Events', value: data.total_events, icon: <Activity size={16} /> },
              {
                label: 'Cyber Attacks',
                value: data.layers.cyber_attack,
                icon: <Zap size={16} />,
                color: 'text-red-600 dark:text-red-400',
              },
              {
                label: 'IOC Activity',
                value: data.layers.ioc_activity,
                icon: <Radio size={16} />,
                color: 'text-rose-600 dark:text-rose-400',
              },
              {
                label: 'War/Conflict',
                value: data.layers.war_room + data.layers.geopolitical,
                icon: <Flame size={16} />,
                color: 'text-orange-600 dark:text-orange-400',
              },
              {
                label: 'Breaches',
                value: data.layers.breach,
                icon: <ShieldAlert size={16} />,
                color: 'text-red-500 dark:text-red-400',
              },
              {
                label: 'Social Feeds',
                value: data.layers.reddit + data.layers.telegram + data.layers.x_feed,
                icon: <MessageSquare size={16} />,
                color: 'text-cyan-600 dark:text-cyan-400',
              },
            ]}
          />

          <div className="mt-6 grid lg:grid-cols-[1fr_340px] gap-6">
            {/* Map */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-[400px] text-sm text-slate-400">Loading map…</div>
                }
              >
                <PulseMap markers={markers} />
              </Suspense>
              {/* Map legend */}
              <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                {ALL_KINDS.filter((k) => LAYER_DEFS[k].hasGeo && activeLayers.has(k)).map((kind) => (
                  <div key={kind} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${LAYER_DEFS[kind].color.replace('text-', 'bg-')}`} />
                    <span className="text-[9px] font-mono text-slate-500">{LAYER_DEFS[kind].label}</span>
                  </div>
                ))}
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
                      onClick={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                      className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                        selectedEvent?.id === ev.id
                          ? 'border-brand-500/60 bg-brand-500/5'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 shrink-0 ${def.color}`}>{def.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">
                              {ev.title}
                            </span>
                            <Badge size="sm" variant={SEVERITY_VARIANT[ev.severity] ?? 'default'}>
                              {ev.severity}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {ev.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-mono text-slate-400">{formatTime(ev.timestamp)}</span>
                            <span className="text-[9px] font-mono text-slate-400">{ev.source}</span>
                            {ev.country && <span className="text-[9px] font-mono text-slate-400">{ev.country}</span>}
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
                    <span className={LAYER_DEFS[selectedEvent.kind].color}>{LAYER_DEFS[selectedEvent.kind].icon}</span>
                    <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white">
                      {selectedEvent.title}
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{selectedEvent.description}</p>
                </div>
                <Badge size="sm" variant={SEVERITY_VARIANT[selectedEvent.severity] ?? 'default'}>
                  {selectedEvent.severity}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-mono">Type</span>
                  <p className="font-medium text-slate-700 dark:text-slate-300">
                    {LAYER_DEFS[selectedEvent.kind].label}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 font-mono">Source</span>
                  <p className="font-medium text-slate-700 dark:text-slate-300">{selectedEvent.source}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-mono">Timestamp</span>
                  <p className="font-medium text-slate-700 dark:text-slate-300">
                    {new Date(selectedEvent.timestamp).toLocaleString()}
                  </p>
                </div>
                {selectedEvent.lat !== 0 && (
                  <div>
                    <span className="text-slate-400 font-mono">Coordinates</span>
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      {selectedEvent.lat.toFixed(2)}, {selectedEvent.lng.toFixed(2)}
                    </p>
                  </div>
                )}
                {selectedEvent.country && (
                  <div>
                    <span className="text-slate-400 font-mono">Country</span>
                    <p className="font-medium text-slate-700 dark:text-slate-300">{selectedEvent.country}</p>
                  </div>
                )}
              </div>
              {selectedEvent.url && (
                <div className="mt-3">
                  <a
                    href={selectedEvent.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    View source →
                  </a>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </DataPageLayout>
  );
}

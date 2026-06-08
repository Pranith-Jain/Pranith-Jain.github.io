import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe,
  Shield,
  Radio,
  MapPin,
  AlertTriangle,
  Activity,
  Zap,
  Bug,
  Skull,
  Flame,
  Plane,
  Newspaper,
  Rss,
  MessageSquare,
  AtSign,
  ShieldAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { SocShell, SocKpi, SocPanel, type SocStatus } from '../../components/threatintel/soc/SocShell';
import { downloadCsv, formatNumber } from '../../components/threatintel/soc/utils';
import type { CtiArc, CtiPoint } from '../../components/threatintel/cti/geo';
import { synthesizeArcs, deriveKpis } from '../../components/threatintel/cti/geo';

/* ─── Lazy globe ────────────────────────────────────────────────────────── */

const CtiGlobe = lazy(() => import('../../components/threatintel/cti/CtiGlobe'));

/* ─── Types (matches global-pulse API response) ────────────────────────── */

type PulseKind = string;

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

const LAYER_DEFS: Record<string, LayerDef> = {
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
  breach: { label: 'Breaches', icon: <ShieldAlert size={12} />, color: 'text-red-400', group: 'intel' },
  scam: { label: 'Scam', icon: <AlertTriangle size={12} />, color: 'text-amber-500', group: 'intel' },
  detection: { label: 'Detections', icon: <Shield size={12} />, color: 'text-emerald-500', group: 'intel' },
  cybercrime: { label: 'Cybercrime', icon: <Zap size={12} />, color: 'text-red-400', group: 'intel' },
  research: { label: 'Research', icon: <Newspaper size={12} />, color: 'text-sky-500', group: 'social' },
  reddit: { label: 'Reddit', icon: <Rss size={12} />, color: 'text-orange-400', group: 'social' },
  telegram: { label: 'Telegram', icon: <MessageSquare size={12} />, color: 'text-cyan-400', group: 'social' },
  x_feed: { label: 'X/Bluesky', icon: <AtSign size={12} />, color: 'text-blue-400', group: 'social' },
  briefing: { label: 'Briefings', icon: <Newspaper size={12} />, color: 'text-emerald-500', group: 'intel' },
};

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function CtiPlatform(): JSX.Element {
  const [data, setData] = useState<GlobalPulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
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
    ])
  );
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PulseEvent | null>(null);
  const loadIdRef = useRef(0);

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

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Filter events by active layers
  const filteredEvents = useMemo(() => {
    if (!data) return [];
    return data.events.filter((e) => activeLayers.has(e.kind));
  }, [data, activeLayers]);

  // Convert to globe points
  const points: CtiPoint[] = useMemo(() => {
    return filteredEvents
      .filter((e) => e.lat !== 0 || e.lng !== 0)
      .map((e) => ({
        lat: e.lat,
        lng: e.lng,
        severity: e.severity,
        count: e.magnitude ?? 1,
        label: e.title,
        countryCode: e.country ?? '',
      }));
  }, [filteredEvents]);

  // Synthesize arcs from points
  const arcs: CtiArc[] = useMemo(() => synthesizeArcs(points), [points]);

  // KPIs
  const kpis = useMemo(() => deriveKpis(points, filteredEvents.length), [points, filteredEvents]);

  // Status
  const status = useMemo<SocStatus>(() => {
    if (!data) return { label: 'Loading', severity: 'info' };
    if (kpis.critical > 0) return { label: 'Critical', severity: 'critical' };
    if (kpis.high > 0) return { label: 'Elevated', severity: 'high' };
    return { label: 'Nominal', severity: 'ok' };
  }, [data, kpis]);

  // Layer toggle
  const toggleLayer = useCallback((layer: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  // Point click → focus globe
  const handlePointClick = useCallback((point: CtiPoint) => {
    setFocus({ lat: point.lat, lng: point.lng });
  }, []);

  // Export
  const handleExport = useCallback(() => {
    if (!filteredEvents.length) return;
    const rows: (string | number)[][] = [['Kind', 'Title', 'Severity', 'Source', 'Timestamp', 'URL']];
    for (const e of filteredEvents) {
      rows.push([e.kind, e.title, e.severity, e.source, e.timestamp, e.url ?? '']);
    }
    downloadCsv(`cti-platform-export.csv`, rows);
  }, [filteredEvents]);

  // Layer counts for display
  const layerCounts = data?.layers ?? {};

  return (
    <SocShell
      title="CTI Platform — Live Intel"
      icon={<Globe size={28} />}
      status={status}
      generatedAt={data?.generated_at ?? null}
      loading={loading}
      error={error}
      onRefresh={load}
      windows={[
        { days: 1, label: '24h' },
        { days: 7, label: '7D' },
        { days: 30, label: '30D' },
      ]}
      windowDays={30}
      onWindowChange={() => {}}
      autoRefreshMs={60_000}
      onExport={handleExport}
      description="Real-time global threat intelligence: 3D globe with severity arcs, impact points, live IOCs, ransomware, dark web, infostealers, phishing, malware, CVEs, breaches, social feeds, and more."
      meta={
        data
          ? `${formatNumber(data.total_events)} events · ${formatNumber(points.length)} geo points · ${formatNumber(arcs.length)} arcs`
          : undefined
      }
    >
      {/* Layer toggles */}
      <div className="mb-6 space-y-2">
        {(['geo', 'intel', 'social'] as const).map((group) => {
          const groupLayers = Object.entries(LAYER_DEFS).filter(([, def]) => def.group === group);
          return (
            <div key={group} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 w-12">{group}</span>
              {groupLayers.map(([kind, def]) => {
                const on = activeLayers.has(kind);
                const count = layerCounts[kind] ?? 0;
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

      {/* KPI row */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SocKpi
            label="Total Events"
            value={formatNumber(data.total_events)}
            severity="info"
            sub="All layers"
            icon={<Activity size={14} />}
          />
          <SocKpi
            label="Critical"
            value={formatNumber(kpis.critical)}
            severity="critical"
            sub="Critical geo points"
            icon={<AlertTriangle size={14} />}
          />
          <SocKpi
            label="High"
            value={formatNumber(kpis.high)}
            severity="high"
            sub="High-severity"
            icon={<Shield size={14} />}
          />
          <SocKpi
            label="Geo Count"
            value={formatNumber(kpis.geoCount)}
            severity="info"
            sub="Countries"
            icon={<MapPin size={14} />}
          />
        </div>
      )}

      {/* Main grid: globe + event feed */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-4 mb-4">
        <SocPanel className="relative overflow-hidden min-h-[500px]">
          {points.length > 0 ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-[500px]">
                  <Globe
                    size={32}
                    className="text-brand-500 animate-spin mx-auto mb-2"
                    style={{ animationDuration: '3s' }}
                  />
                </div>
              }
            >
              <CtiGlobe arcs={arcs} points={points} focus={focus} onPointClick={handlePointClick} autoRotate={false} />
            </Suspense>
          ) : (
            <div className="flex items-center justify-center h-[500px] text-xs font-mono text-slate-400">
              {loading ? 'Loading…' : 'No geo data. Enable layers above.'}
            </div>
          )}
        </SocPanel>

        {/* Event feed */}
        <SocPanel className="max-h-[600px] overflow-y-auto">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-3">
            Live Feed ({filteredEvents.length})
          </h3>
          <div className="space-y-1">
            {filteredEvents.slice(0, 80).map((ev) => {
              const def = LAYER_DEFS[ev.kind] ?? { label: ev.kind, icon: <Radio size={12} />, color: 'text-slate-400' };
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    setSelectedEvent(selectedEvent?.id === ev.id ? null : ev);
                    if (ev.lat !== 0 || ev.lng !== 0) setFocus({ lat: ev.lat, lng: ev.lng });
                  }}
                  className={`w-full text-left rounded-lg border p-2 transition-colors ${
                    selectedEvent?.id === ev.id
                      ? 'border-brand-500/60 bg-brand-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 ${def.color}`}>{def.icon}</span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate block">
                        {ev.title}
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{ev.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-mono text-slate-400">{ev.source}</span>
                        <span className="text-[9px] font-mono text-slate-400">{ev.severity}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </SocPanel>
      </div>

      {/* Selected event detail */}
      {selectedEvent && (
        <SocPanel className="animate-fade-in-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selectedEvent.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{selectedEvent.description}</p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/30">
              {selectedEvent.severity}
            </span>
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
        </SocPanel>
      )}
    </SocShell>
  );
}

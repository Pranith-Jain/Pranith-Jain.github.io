import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
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
  ExternalLink,
  Layers,
  Filter,
  X,
  Clock,
  Crosshair,
  Building2,
ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { CountUp } from '../../components/ui/CountUp';
import { Sparkline } from '../../components/threatintel/Sparkline';
import { SeverityPill } from '../../components/Badge';
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
  | 'infostealer'
  | 'phishing'
  | 'malware'
  | 'ransomware'
  | 'cybercrime'
  | 'research'
  | 'cve'
  | 'actor_sighting'
  | 'ioc_correlation'
  | 'secret_leak'
  | 'malicious_package'
  | 'exploit'
  | 'github_advisory'
  | 'supply_chain_attacks'
  | 'kev'
  | 'infrastructure';

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
  cti?: 'ransomware' | 'cve' | 'ioc' | 'threat' | 'other';
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
  actor_sighting: {
    label: 'Threat Actors',
    shortLabel: 'ACTOR',
    icon: <Skull size={14} />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
    group: 'intel',
  },
  ioc_correlation: {
    label: 'IOC Correlations',
    shortLabel: 'CORR',
    icon: <Crosshair size={14} />,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20',
    group: 'intel',
  },
  secret_leak: {
    label: 'GitHub Leaks',
    shortLabel: 'LEAK',
    icon: <ShieldAlert size={14} />,
    color: 'text-fuchsia-400',
    bgColor: 'bg-fuchsia-500/10 border-fuchsia-500/20',
    group: 'intel',
  },
  malicious_package: {
    label: 'Malicious Packages',
    shortLabel: 'PKG',
    icon: <Box size={14} />,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 border-orange-500/20',
    group: 'intel',
  },
  exploit: {
    label: 'Public Exploits',
    shortLabel: 'XPLOIT',
    icon: <Zap size={14} />,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10 border-yellow-500/20',
    group: 'intel',
  },
  github_advisory: {
    label: 'GitHub Advisories',
    shortLabel: 'GHSA',
    icon: <Shield size={14} />,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
    group: 'intel',
  },
  kev: {
    label: 'CISA KEV',
    shortLabel: 'KEV',
    icon: <Flame size={14} />,
    color: 'text-red-500',
    bgColor: 'bg-red-600/10 border-red-600/20',
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
  supply_chain_attacks: {
    label: 'Supply Chain',
    shortLabel: 'CHAIN',
    icon: <Box size={14} />,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-600/10 border-cyan-600/20',
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
  infrastructure: {
    label: 'Infrastructure',
    shortLabel: 'INFRA',
    icon: <Building2 size={14} />,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10 border-teal-500/20',
    group: 'geo',
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
  const d = new Date(ts).getTime();
  if (isNaN(d)) return '—';
  const diff = Date.now() - d;
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
      'ransomware',
      'cve',
      'ioc_activity',
      'cyber_attack',
      'c2_tracker',
      'cisa_advisory',
      'infostealer',
      'phishing',
      'malware',
      'blocklist',
      'breach',
      'cybercrime',
      'scam',
      'actor_sighting',
      'ioc_correlation',
      'secret_leak',
      'malicious_package',
      'exploit',
      'github_advisory',
      'kev',
    ])
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<PulseEvent | null>(null);
  // Default to the 3D globe — it's the showpiece and the "wow" of this page (the
  // recruiter-facing first impression). It's lazy-loaded (globe.gl/three.js,
  // ~506KB gz, route-split to THIS page only) and renders behind a skeleton while
  // the chunk streams in. Switch to '2d' (PulseMap, ~2.3KB) via the toggle / '2'.
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('3d');
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(new Set(['critical', 'high', 'medium', 'low']));
  const [ctiFilter, setCtiFilter] = useState<'all' | 'ransomware' | 'cve' | 'ioc'>('all');
  const [regionFilter, setRegionFilter] = useState<'all' | 'mena'>('all');
  const loadIdRef = useRef(0);

  // Infrastructure search (Overpass API + Nominatim, inspired by Sightline MIT)
  const [infraQuery, setInfraQuery] = useState('');
  const [infraLoading, setInfraLoading] = useState(false);
  const [infraResults, setInfraResults] = useState<PulseEvent[]>([]);
  const [infraError, setInfraError] = useState<string | null>(null);
  const infraAbortRef = useRef<AbortController | null>(null);

  const searchInfra = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setInfraResults([]);
      setInfraError(null);
      return;
    }
    infraAbortRef.current?.abort();
    const ctrl = new AbortController();
    infraAbortRef.current = ctrl;
    setInfraLoading(true);
    setInfraError(null);
    try {
      const r = await fetch('/api/v1/infra-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as {
        results: Array<{
          id: string;
          name: string;
          lat: number;
          lon: number;
          category: string;
          tags: Record<string, string>;
        }>;
      };
      const events: PulseEvent[] = (json.results ?? []).map((item) => ({
        id: `infra-${item.id}`,
        kind: 'infrastructure' as PulseKind,
        title: item.name || item.category,
        description: `${item.category} — ${item.name || 'unnamed'}`,
        lat: item.lat,
        lng: item.lon,
        severity: 'low' as const,
        source: 'OpenStreetMap / Overpass API',
        timestamp: new Date().toISOString(),
      }));
      setInfraResults(events);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setInfraError((e as Error).message);
      setInfraResults([]);
    } finally {
      setInfraLoading(false);
    }
  }, []);

  const MENA_COUNTRIES = useMemo(
    () =>
      new Set([
        'DZ',
        'BH',
        'EG',
        'IQ',
        'IR',
        'IL',
        'JO',
        'KW',
        'LB',
        'LY',
        'MA',
        'OM',
        'PS',
        'QA',
        'SA',
        'SY',
        'TN',
        'TR',
        'AE',
        'YE',
      ]),
    []
  );

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
        // Cache the last-good response so the next visit paints instantly
        // instead of waiting on the (cold ~10-20s) build behind a spinner.
        try {
          localStorage.setItem('gp:last', JSON.stringify(json));
        } catch {
          /* quota / private mode — non-fatal */
        }
      }
    } catch (e) {
      if (loadIdRef.current === myId) setError((e as Error).message);
    } finally {
      if (loadIdRef.current === myId) setLoading(false);
    }
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<number>(0); // 0 = all time, hours
  const [isFullscreen, setIsFullscreen] = useState(false);
  const globeContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleFullscreen = useCallback(() => {
    if (!globeContainerRef.current) return;
    if (!document.fullscreenElement) {
      globeContainerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'r':
          e.preventDefault();
          load();
          break;
        case 'escape':
          setSelectedEvent(null);
          setShowFilters(false);
          break;
        case 's':
          e.preventDefault();
          setShowFilters((prev) => !prev);
          break;
        case '1':
          setMapMode('3d');
          break;
        case '2':
          setMapMode('2d');
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [load, toggleFullscreen]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const ctiPriority = useCallback((cti?: PulseEvent['cti']): number => {
    switch (cti) {
      case 'ransomware':
        return 5;
      case 'cve':
        return 4;
      case 'ioc':
        return 3;
      case 'threat':
        return 1;
      default:
        return 0;
    }
  }, []);

  const filteredEvents = useMemo(() => {
    if (!data) return infraResults.length > 0 && activeLayers.has('infrastructure') ? infraResults : [];
    const now = Date.now();
    const base = data.events.filter((e) => {
      if (!activeLayers.has(e.kind)) return false;
      if (!severityFilter.has(e.severity)) return false;
      if (timeRange > 0) {
        const eventTime = new Date(e.timestamp).getTime();
        if (now - eventTime > timeRange * 3600000) return false;
      }
      if (ctiFilter === 'ransomware' && e.cti !== 'ransomware') return false;
      if (ctiFilter === 'cve' && e.cti !== 'cve') return false;
      if (ctiFilter === 'ioc' && e.cti !== 'ioc') return false;
      if (regionFilter === 'mena' && (!e.country || !MENA_COUNTRIES.has(e.country))) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q) ||
          e.kind.toLowerCase().includes(q)
        );
      }
      return true;
    });
    const all = activeLayers.has('infrastructure') ? [...base, ...infraResults] : base;
    return all.sort((a, b) => {
      const pa = ctiPriority(a.cti);
      const pb = ctiPriority(b.cti);
      if (pa !== pb) return pb - pa;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [
    data,
    activeLayers,
    severityFilter,
    searchQuery,
    timeRange,
    ctiFilter,
    regionFilter,
    MENA_COUNTRIES,
    ctiPriority,
    infraResults,
  ]);

  // Export to CSV
  const exportToCsv = useCallback(() => {
    if (!filteredEvents.length) return;
    const headers = ['ID', 'Kind', 'Title', 'Description', 'Severity', 'Source', 'Timestamp', 'Latitude', 'Longitude'];
    const rows = filteredEvents.map((e) => [
      e.id,
      e.kind,
      e.title,
      e.description,
      e.severity,
      e.source,
      e.timestamp,
      e.lat,
      e.lng,
    ]);
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => (typeof v === 'string' ? '"' + v.replace(/"/g, '""') + '"' : v)).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'global-pulse-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEvents]);

  // Last-good: paint the previous response instantly on mount (client-only, so
  // SSR markup still matches and there's no hydration mismatch), then load()
  // refreshes in the background. Turns a 10-20s cold-spinner into an instant page.
  useEffect(() => {
    try {
      const cached = localStorage.getItem('gp:last');
      if (cached) setData((d) => d ?? (JSON.parse(cached) as GlobalPulseResponse));
    } catch {
      /* ignore */
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

  const geoPoints = useMemo(() => {
    return filteredEvents
      .filter((e) => e.lat !== 0 || e.lng !== 0)
      .map((e) => ({
        id: e.id,
        lat: e.lat,
        lng: e.lng,
        severity: e.severity,
        kind: e.kind,
        title: e.title,
        description: e.description,
        source: e.source,
      }));
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

  // One sample per refresh — drives the KPI deltas + sparklines so the page
  // reads as a live pulse, not a static scoreboard.
  const [trend, setTrend] = useState<{ total: number; critical: number }[]>([]);
  useEffect(() => {
    if (!data) return;
    setTrend((t) => [...t.slice(-23), { total: data.total_events, critical: kpis.critical }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdated]);
  const lastTrend = trend[trend.length - 1];
  const prevTrend = trend[trend.length - 2];
  const totalDelta = lastTrend && prevTrend ? lastTrend.total - prevTrend.total : 0;
  const criticalDelta = lastTrend && prevTrend ? lastTrend.critical - prevTrend.critical : 0;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Globe size={28} />}
      title="Global Pulse"
      description="A live map of worldwide cyber-threat activity — aggregating 20+ real-time intelligence feeds (ransomware, breaches, CVEs, dark-web chatter) and refreshing every minute."
      loading={loading && !data}
      error={error}
      onRetry={load}
      maxWidthClass="max-w-7xl"
    >
      {data && (
        <div className="space-y-4">
          {/* ─── Top Stats Bar ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Total events */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-e1 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="flex items-center gap-1.5 text-eyebrow uppercase text-slate-500">
                  <Activity size={12} className="text-slate-400" /> Total Events
                </span>
                {totalDelta !== 0 && (
                  <span
                    className={`inline-flex items-center text-micro font-mono px-1.5 py-0.5 rounded-full ${
                      totalDelta > 0
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                        : 'text-slate-500 bg-slate-500/10'
                    }`}
                  >
                    {totalDelta > 0 ? '+' : ''}
                    {totalDelta}
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between gap-2">
                <CountUp
                  to={data.total_events}
                  className="text-3xl font-display font-bold text-slate-900 dark:text-white tabular-nums leading-none"
                />
                {trend.length > 1 && (
                  <Sparkline values={trend.map((t) => t.total)} className="text-brand-400/70 mb-0.5" />
                )}
              </div>
              <div className="text-micro font-mono text-slate-500 mt-1.5">{geoPoints.length} geo-located</div>
            </div>

            {/* Critical — the hero metric */}
            <div className="rounded-xl border border-severity-critical/30 bg-severity-critical/5 p-4 ring-1 ring-severity-critical/10 shadow-sm shadow-severity-critical/10">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="flex items-center gap-1.5 text-eyebrow uppercase text-severity-critical">
                  <AlertTriangle size={12} /> Critical
                </span>
                {criticalDelta !== 0 && (
                  <span
                    className={`inline-flex items-center text-micro font-mono px-1.5 py-0.5 rounded-full ${
                      criticalDelta > 0
                        ? 'text-severity-critical bg-severity-critical/15'
                        : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                    }`}
                  >
                    {criticalDelta > 0 ? '+' : ''}
                    {criticalDelta}
                  </span>
                )}
              </div>
              <CountUp
                to={kpis.critical}
                className="block text-3xl font-display font-bold text-severity-critical tabular-nums leading-none"
              />
              {(() => {
                const bs = stats?.bySeverity ?? { critical: 0, high: 0, medium: 0, low: 0 };
                const tot = bs.critical + bs.high + bs.medium + bs.low || 1;
                return (
                  <div className="mt-2 flex h-1 gap-px overflow-hidden rounded-full bg-slate-200/50 dark:bg-slate-800">
                    <div className="bg-severity-critical" style={{ width: `${(bs.critical / tot) * 100}%` }} />
                    <div className="bg-severity-high" style={{ width: `${(bs.high / tot) * 100}%` }} />
                    <div className="bg-severity-medium" style={{ width: `${(bs.medium / tot) * 100}%` }} />
                    <div className="bg-severity-low" style={{ width: `${(bs.low / tot) * 100}%` }} />
                  </div>
                );
              })()}
              <div className="text-micro font-mono text-severity-critical/70 mt-1.5">
                {stats?.bySeverity.high ?? 0} high severity
              </div>
            </div>

            {/* Active layers */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-e1 p-4">
              <div className="flex items-center gap-1.5 text-eyebrow uppercase text-slate-500 mb-2">
                <Layers size={12} className="text-slate-400" /> Active Layers
              </div>
              <CountUp
                to={activeLayers.size}
                className="block text-3xl font-display font-bold text-slate-900 dark:text-white tabular-nums leading-none"
              />
              <div className="text-micro font-mono text-slate-500 mt-1.5">
                {ALL_KINDS.length - activeLayers.size} hidden
              </div>
            </div>

            {/* Live status */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-e1 p-4">
              <div className="flex items-center gap-1.5 text-eyebrow uppercase text-slate-500 mb-2">
                <Clock size={12} className="text-slate-400" /> Last Update
              </div>
              <div className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums leading-none">
                {lastUpdated ? formatTime(lastUpdated) : data ? formatTime(data.generated_at) : '—'}
              </div>
              <div className="mt-2">
                {loading && data ? (
                  <span className="inline-flex items-center gap-1.5" aria-label="Syncing latest data">
                    <RefreshCw size={11} className="animate-spin text-brand-500" />
                    <span className="text-eyebrow text-brand-600 dark:text-brand-400">SYNCING</span>
                  </span>
                ) : autoRefresh ? (
                  <span className="inline-flex items-center gap-1.5" aria-label="Live — auto-refreshing">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-eyebrow text-emerald-600 dark:text-emerald-400">LIVE</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5" aria-label="Paused">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    <span className="text-eyebrow text-slate-500">PAUSED</span>
                  </span>
                )}
              </div>
            </div>

            {/* OSINT Country Map source */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-e1 p-4">
              <div className="flex items-center gap-1.5 text-eyebrow uppercase text-slate-500 mb-2">
                <Globe size={12} className="text-slate-400" /> OSINT Map Source
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/threatintel/osint-map"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Country Resources
                </a>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <a
                  href="https://map.wddadk.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  map.wddadk.com <ExternalLink size={10} />
                </a>
              </div>
              <div className="text-micro font-mono text-slate-500 mt-1.5">247 countries, 1,535 OSINT resources</div>
            </div>
          </div>

          {/* ─── Controls Bar ─── */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:border-brand-500/50"
              />
              <svg
                className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Infrastructure Search (Overpass API + Nominatim) */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <input
                type="text"
                placeholder="Infra: hospitals in berlin…"
                value={infraQuery}
                onChange={(e) => setInfraQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    searchInfra(infraQuery);
                    if (!activeLayers.has('infrastructure')) toggleLayer('infrastructure');
                  }
                }}
                className="w-full pl-8 pr-8 py-2 text-xs font-mono rounded-lg border border-teal-500/30 dark:border-teal-500/20 bg-white dark:bg-slate-900 shadow-e1 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:border-teal-500/50"
              />
              <Building2 size={13} className="absolute left-2.5 top-2.5 text-teal-400" />
              {infraQuery && (
                <button
                  onClick={() => {
                    setInfraQuery('');
                    setInfraResults([]);
                    setInfraError(null);
                  }}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
              {infraLoading && (
                <span className="absolute right-2 top-2">
                  <RefreshCw size={12} className="animate-spin text-teal-400" />
                </span>
              )}
            </div>
            {infraResults.length > 0 && (
              <span className="text-mini font-mono text-teal-500 dark:text-teal-400">{infraResults.length} infra</span>
            )}
            {infraError && (
              <span className="text-mini font-mono text-rose-500" title={infraError}>
                infra error
              </span>
            )}

            {/* Time Range Filter */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              {[
                { hours: 0, label: 'All' },
                { hours: 1, label: '1h' },
                { hours: 6, label: '6h' },
                { hours: 24, label: '24h' },
                { hours: 168, label: '7d' },
              ].map((t) => (
                <button
                  key={t.hours}
                  type="button"
                  onClick={() => setTimeRange(t.hours)}
                  className={`text-mini font-mono px-2.5 py-2 transition-colors ${
                    timeRange === t.hours
                      ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                      : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

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
                <span className="ml-1 px-1.5 py-0.5 text-micro rounded-full bg-brand-500/20 text-brand-600 dark:text-brand-400">
                  {activeLayers.size}
                </span>
              )}
            </button>

            {/* Refresh Controls */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setAutoRefresh((p) => !p)}
                aria-pressed={autoRefresh}
                title={autoRefresh ? 'Streaming — click to pause' : 'Paused — click to resume'}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-lg border transition-colors ${
                  autoRefresh
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
              >
                {autoRefresh ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                )}
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
              {/* Fullscreen */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Toggle fullscreen (F)"
              >
                {isFullscreen ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                )}
                {isFullscreen ? 'Exit' : 'Full'}
              </button>
              {/* Export */}
              <button
                type="button"
                onClick={exportToCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Export to CSV"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Export
              </button>
            </div>
          </div>

          {/* ─── Filters Panel ─── */}
          {showFilters && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-e1 p-4 animate-fade-in">
              {/* Severity Filter */}
              <div className="mb-4">
                <h4 className="text-micro font-mono uppercase text-slate-500 mb-2">Severity</h4>
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
              {(['intel', 'geo', 'social'] as const).map((group) => {
                const layers = layerGroups[group];
                const activeCount = layers.filter((l) => l.active).length;
                const groupLabels = { geo: 'Geospatial', intel: 'Threat Intel', social: 'Social / OSINT' };
                return (
                  <div key={group} className="mb-4 last:mb-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-micro font-mono uppercase text-slate-500">
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
                        className="text-micro font-mono text-brand-500 hover:text-brand-600"
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
                            <span className={`text-micro ${active ? 'opacity-70' : 'opacity-40'}`}>{count}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setActiveLayers(
                      new Set([
                        'ransomware',
                        'cve',
                        'ioc_activity',
                        'cyber_attack',
                        'c2_tracker',
                        'cisa_advisory',
                        'infostealer',
                        'phishing',
                        'malware',
                        'blocklist',
                        'breach',
                        'cybercrime',
                        'scam',
                        'actor_sighting',
                        'ioc_correlation',
                        'secret_leak',
                        'malicious_package',
                        'exploit',
                        'github_advisory',
                        'kev',
                      ])
                    );
                    setSeverityFilter(new Set(['critical', 'high', 'medium', 'low']));
                    setCtiFilter('all');
                    setRegionFilter('all');
                  }}
                  className="text-micro font-mono px-2.5 py-1.5 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 border border-brand-500/20 transition-colors"
                >
                  CTI Defaults
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLayers(
                      new Set([
                        'geopolitical',
                        'war_room',
                        'aircraft',
                        'ioc_activity',
                        'cyber_attack',
                        'c2_tracker',
                        'breach',
                        'cisa_advisory',
                      ])
                    );
                    setSeverityFilter(new Set(['critical', 'high', 'medium', 'low']));
                    setCtiFilter('all');
                    setRegionFilter('mena');
                    setFocus({ lat: 30, lng: 45 });
                    setMapMode('3d');
                  }}
                  className="text-micro font-mono px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
                >
                  MENA Focus
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLayers(new Set(['war_room', 'geopolitical', 'aircraft', 'earthquake']));
                    setSeverityFilter(new Set(['critical', 'high', 'medium', 'low']));
                    setCtiFilter('all');
                    setRegionFilter('all');
                    setMapMode('2d');
                  }}
                  className="text-micro font-mono px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                >
                  Conflict Zones
                </button>
              </div>
            </div>
          )}

          {/* ─── Main Content: Globe + Feed ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-5">
            {/* Globe/Map Container */}
            <div
              ref={globeContainerRef}
              className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0a0f1a]"
              style={{ minHeight: '600px', maxHeight: isFullscreen ? '100vh' : '750px' }}
            >
              {/* Globe Status Badge */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                {regionFilter === 'mena' && (
                  <div className="bg-amber-500/20 backdrop-blur-sm rounded-lg border border-amber-500/50 px-3 py-1.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-micro font-mono text-amber-300">MENA</span>
                  </div>
                )}
                <div className="bg-[#0f1629]/80 backdrop-blur-sm rounded-lg border border-slate-600/50 px-3 py-1.5 flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${mapMode === '3d' ? 'bg-brand-500 animate-pulse' : 'bg-emerald-500'}`}
                  />
                  <span className="text-micro font-mono text-slate-400">
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
                      <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full border-2 border-brand-500/20" />
                          <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-brand-500 animate-spin" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-slate-300">Loading Map</p>
                          <p className="text-xs text-slate-500 mt-1">Initializing 2D renderer…</p>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <PulseMap
                    markers={geoPoints}
                    onMarkerClick={(m) => {
                      const event = filteredEvents.find((e) => e.id === m.id);
                      if (event) setSelectedEvent(event);
                    }}
                  />
                </Suspense>
              )}

              {/* Legend Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent px-4 py-3">
                <div className="flex items-center gap-4">
                  {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                    <div key={sev} className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_CONFIG[sev].dot}`} />
                      <span className="text-mini font-mono text-slate-400 capitalize">{sev}</span>
                    </div>
                  ))}
                  <span className="text-mini font-mono text-slate-500 ml-auto">
                    {geoPoints.length} points · {globeArcs.length} arcs
                  </span>
                </div>
              </div>
            </div>

            {/* Event Feed */}
            <aside
              className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 overflow-hidden"
              style={{ minHeight: '600px', maxHeight: '750px' }}
            >
              {/* Feed Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Radio size={14} className="text-rose-400 animate-pulse" />
                  <h3 className="text-sm font-semibold font-mono text-slate-700 dark:text-slate-300">CTI Live Feed</h3>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">({filteredEvents.length})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {(() => {
                    const ransomCount = filteredEvents.filter((e) => e.kind === 'ransomware').length;
                    const cveCount = filteredEvents.filter((e) => e.cti === 'cve').length;
                    const iocCount = filteredEvents.filter((e) => e.cti === 'ioc').length;
                    return (
                      <>
                        {ransomCount > 0 && (
                          <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400">
                            R{ransomCount}
                          </span>
                        )}
                        {cveCount > 0 && (
                          <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                            C{cveCount}
                          </span>
                        )}
                        {iocCount > 0 && (
                          <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">
                            I{iocCount}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* CTI Quick Filters */}
              <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-slate-800/50">
                {[
                  { key: 'all' as const, label: 'All CTI' },
                  { key: 'ransomware' as const, label: 'Ransomware', icon: <Skull size={12} /> },
                  { key: 'cve' as const, label: 'CVEs', icon: <Bug size={12} /> },
                  { key: 'ioc' as const, label: 'IOCs', icon: <Zap size={12} /> },
                ].map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setCtiFilter(pill.key)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-micro font-mono rounded-md border transition-colors ${
                      ctiFilter === pill.key
                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                        : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {pill.icon}
                    {pill.label}
                  </button>
                ))}
                {ctiFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setCtiFilter('all')}
                    className="ml-auto text-micro font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Feed List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar" aria-label="CTI live event feed">
                <span className="sr-only" role="status" aria-live="polite">
                  {filteredEvents.length} events in feed, {kpis.critical} critical
                </span>
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
                      const isCti = ctiPriority(ev.cti) > 0;
                      const ctiBorder =
                        ev.cti === 'ransomware'
                          ? 'border-l-rose-500'
                          : ev.cti === 'cve'
                            ? 'border-l-amber-500'
                            : ev.cti === 'ioc'
                              ? 'border-l-sky-500'
                              : 'border-l-transparent';

                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => {
                            setSelectedEvent(isSelected ? null : ev);
                            if (hasGeo) setFocus({ lat: ev.lat, lng: ev.lng });
                          }}
                          className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${
                            isSelected
                              ? 'bg-brand-500/5 border-l-brand-500'
                              : `hover:bg-slate-50 dark:hover:bg-slate-800/30 ${ctiBorder}`
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
                                <span className="text-micro font-mono uppercase text-slate-500">{def?.shortLabel}</span>
                                <span className="text-micro font-mono text-slate-400 ml-auto">
                                  {formatTime(ev.timestamp)}
                                </span>
                              </div>
                              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-1">
                                {ev.title}
                              </p>
                              <p className="text-mini text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                                {ev.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-micro font-mono text-slate-400">{ev.source}</span>
                                {isCti && (
                                  <span
                                    className={`text-micro font-mono ${
                                      ev.cti === 'ransomware'
                                        ? 'text-rose-400'
                                        : ev.cti === 'cve'
                                          ? 'text-amber-400'
                                          : ev.cti === 'ioc'
                                            ? 'text-sky-400'
                                            : 'text-slate-400'
                                    }`}
                                  >
                                    ● {ev.cti}
                                  </span>
                                )}
                                {hasGeo && (
                                  <span className="text-micro font-mono text-brand-500 flex items-center gap-0.5">
                                    <Crosshair size={8} /> geo
                                  </span>
                                )}
                                {ev.url && (
                                  <a
                                    href={sanitizeUrl(ev.url) || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-micro font-mono text-brand-500 hover:underline ml-auto flex items-center gap-0.5"
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
                    <SeverityPill severity={selectedEvent.severity} />
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                    {selectedEvent.description}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-micro font-mono uppercase text-slate-500 block">Source</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {selectedEvent.source}
                      </span>
                    </div>
                    <div>
                      <span className="text-micro font-mono uppercase text-slate-500 block">Type</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {LAYER_DEFS[selectedEvent.kind]?.label ?? selectedEvent.kind}
                      </span>
                    </div>
                    <div>
                      <span className="text-micro font-mono uppercase text-slate-500 block">Time</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {formatTimeFull(selectedEvent.timestamp)}
                      </span>
                    </div>
                    {selectedEvent.country && (
                      <div>
                        <span className="text-micro font-mono uppercase text-slate-500 block">Country</span>
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                          {selectedEvent.country}
                        </span>
                      </div>
                    )}
                    {(selectedEvent.lat !== 0 || selectedEvent.lng !== 0) && (
                      <div>
                        <span className="text-micro font-mono uppercase text-slate-500 block">Coordinates</span>
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                          {selectedEvent.lat.toFixed(4)}, {selectedEvent.lng.toFixed(4)}
                        </span>
                      </div>
                    )}
                    {selectedEvent.magnitude != null && (
                      <div>
                        <span className="text-micro font-mono uppercase text-slate-500 block">Magnitude</span>
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                          {selectedEvent.magnitude.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                  {selectedEvent.url && (
                    <a
                      href={sanitizeUrl(selectedEvent.url) || undefined}
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

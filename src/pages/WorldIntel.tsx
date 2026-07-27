import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import {
  Shield, Globe, Zap, Radio, Plane,
  Anchor, Building2, Search, Loader2, ExternalLink,
} from 'lucide-react';

type Tab = 'cyber' | 'earthquakes' | 'outages' | 'space' | 'military' | 'news' | 'maritime' | 'bases';

const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
  { id: 'cyber', label: 'Cyber Threats', icon: Shield },
  { id: 'earthquakes', label: 'Earthquakes', icon: Globe },
  { id: 'outages', label: 'Internet Outages', icon: Zap },
  { id: 'space', label: 'Space Weather', icon: Radio },
  { id: 'military', label: 'Military Flights', icon: Plane },
  { id: 'news', label: 'GDELT News', icon: Search },
  { id: 'maritime', label: 'Maritime', icon: Anchor },
  { id: 'bases', label: 'Strategic Bases', icon: Building2 },
];

const SEV_COLORS: Record<string, string> = {
  critical: 'text-rose-400',
  high: 'text-orange-400',
  medium: 'text-amber-400',
  low: 'text-sky-400',
};

function timeAgo(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="surface-card p-3 rounded-xl">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${color ?? 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function CyberTab() {
  const { data, loading, error } = useDataFetch<{
    threats: Array<{
      type: string; indicator: string; threat: string; severity: string;
      source_feed: string; first_seen: string; details: Record<string, unknown>;
    }>;
    count: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  }>({ url: '/api/v1/world-intel/cyber?limit=100', ttl: 60_000 });

  if (loading) return <div className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading cyber threats...</div>;
  if (error) return <div className="text-destructive py-8">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Threats" value={data.count} />
        {Object.entries(data.bySeverity).map(([sev, n]) => (
          <StatCard key={sev} label={sev} value={n} color={SEV_COLORS[sev]} />
        ))}
      </div>
      <div className="space-y-1">
        {data.threats.map((t, i) => (
          <div key={i} className="surface-card p-3 rounded-xl flex items-start gap-3 text-sm">
            <span className={`font-mono text-xs mt-0.5 ${SEV_COLORS[t.severity] ?? 'text-muted'}`}>
              [{t.severity.toUpperCase()}]
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{t.indicator}</div>
              <div className="text-muted text-xs truncate">{t.threat}</div>
            </div>
            <span className="text-xs text-muted whitespace-nowrap">{t.source_feed}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EarthquakesTab() {
  const { data, loading, error } = useDataFetch<{
    earthquakes: Array<{
      mag?: number; place?: string; time?: number; lat?: number; lon?: number;
      depth?: number; felt?: number; tsunami?: number;
    }>;
    count: number;
  }>({ url: '/api/v1/world-intel/earthquakes?min_mag=4.0&limit=50', ttl: 60_000 });

  if (loading) return <div className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading earthquakes...</div>;
  if (error) return <div className="text-destructive py-8">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Recent Earthquakes" value={data.count} color="text-orange-400" />
        <StatCard label="Max Magnitude" value={Math.max(...data.earthquakes.map((e) => e.mag ?? 0)).toFixed(1)} color="text-rose-400" />
        <StatCard label="Tsunami Risk" value={data.earthquakes.filter((e) => e.tsunami).length} color="text-amber-400" />
      </div>
      <div className="space-y-1">
        {data.earthquakes.map((eq, i) => (
          <div key={i} className="surface-card p-3 rounded-xl flex items-center gap-3 text-sm">
            <span className={`text-lg font-bold ${(eq.mag ?? 0) >= 6 ? 'text-rose-400' : (eq.mag ?? 0) >= 5 ? 'text-orange-400' : 'text-amber-400'}`}>
              M{(eq.mag ?? 0).toFixed(1)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{eq.place ?? 'Unknown location'}</div>
              <div className="text-muted text-xs">
                {eq.time ? timeAgo(Date.now() - eq.time) : ''} · Depth {eq.depth?.toFixed(1) ?? '?'} km
                {eq.felt ? ` · Felt by ${eq.felt}` : ''}
              </div>
            </div>
            {eq.tsunami ? <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">TSUNAMI</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function OutagesTab() {
  const { data, loading, error } = useDataFetch<{
    outages: Array<{
      id?: string; start?: string; end?: string; description: string;
      scope: string; countries: string[]; is_ongoing: boolean;
    }>;
    ongoing_count: number;
    total_7d: number;
  }>({ url: '/api/v1/world-intel/outages', ttl: 60_000 });

  if (loading) return <div className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading outages...</div>;
  if (error) return <div className="text-destructive py-8">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Ongoing Outages" value={data.ongoing_count} color="text-rose-400" />
        <StatCard label="Total (7d)" value={data.total_7d} color="text-amber-400" />
        <StatCard label="Source" value="IODA" />
      </div>
      <div className="space-y-1">
        {data.outages.map((o, i) => (
          <div key={i} className="surface-card p-3 rounded-xl flex items-start gap-3 text-sm">
            <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${o.is_ongoing ? 'bg-rose-500 animate-pulse' : 'bg-muted'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{o.description || 'Unknown outage'}</div>
              <div className="text-muted text-xs">
                {o.scope} · {o.countries.join(', ') || 'Unknown country'}
                {o.start ? ` · Started ${o.start}` : ''}
              </div>
            </div>
          </div>
        ))}
        {data.outages.length === 0 && <div className="text-muted text-sm py-4 text-center">No recent outages detected</div>}
      </div>
    </div>
  );
}

function SpaceWeatherTab() {
  const { data, loading, error } = useDataFetch<{
    kp_index: number | null;
    kp_level: string;
    kp_timestamp: string | null;
    alerts: Array<{ product?: string; issued?: string; summary?: string }>;
  }>({ url: '/api/v1/world-intel/space-weather', ttl: 60_000 });

  if (loading) return <div className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading space weather...</div>;
  if (error) return <div className="text-destructive py-8">{error}</div>;
  if (!data) return null;

  const kpColor = (data.kp_index ?? 0) >= 7 ? 'text-rose-400' : (data.kp_index ?? 0) >= 5 ? 'text-orange-400' : (data.kp_index ?? 0) >= 4 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Kp Index" value={data.kp_index ?? 'N/A'} color={kpColor} />
        <StatCard label="Geomagnetic Level" value={data.kp_level} />
        <StatCard label="Alerts" value={data.alerts.length} />
      </div>
      {data.alerts.length > 0 && (
        <div className="space-y-1">
          {data.alerts.map((a, i) => (
            <div key={i} className="surface-card p-3 rounded-xl text-sm">
              <div className="font-medium">{a.product ?? 'Space Weather Alert'}</div>
              <div className="text-muted text-xs">{a.issued} · {a.summary?.slice(0, 150)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MilitaryTab() {
  const { data, loading, error } = useDataFetch<{
    aircraft: Array<{
      icao24?: string; callsign?: string | null; lat?: number; lon?: number;
      altitude?: number; speed?: number; heading?: number; type?: string;
    }>;
    count: number;
  }>({ url: '/api/v1/world-intel/military-flights?limit=100', ttl: 60_000 });

  if (loading) return <div className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading military flights...</div>;
  if (error) return <div className="text-destructive py-8">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Active Military Aircraft" value={data.count} color="text-emerald-400" />
      </div>
      <div className="space-y-1">
        {data.aircraft.map((ac, i) => (
          <div key={i} className="surface-card p-3 rounded-xl flex items-center gap-3 text-sm">
            <Plane className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-mono font-medium">{ac.callsign ?? ac.icao24 ?? 'Unknown'}</div>
              <div className="text-muted text-xs">
                {ac.lat?.toFixed(2)}°, {ac.lon?.toFixed(2)}° · FL{ac.altitude ? Math.round(ac.altitude / 30.48) : '?'}
                {ac.type ? ` · ${ac.type}` : ''}
              </div>
            </div>
          </div>
        ))}
        {data.aircraft.length === 0 && <div className="text-muted text-sm py-4 text-center">No military flights detected</div>}
      </div>
    </div>
  );
}

function NewsTab() {
  const [query, setQuery] = useState('conflict cyber');
  const { data, loading, error } = useDataFetch<{
    articles: Array<{
      title?: string; url?: string; date?: string;
      domain?: string; language?: string; country?: string;
    }>;
    count: number;
  }>({ url: `/api/v1/world-intel/news?q=${encodeURIComponent(query)}&limit=50`, ttl: 60_000 });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GDELT news..."
          className="flex-1 px-3 py-2 rounded-xl bg-background border text-sm"
        />
      </div>
      {loading && <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /> Searching...</div>}
      {error && <div className="text-destructive py-4">{error}</div>}
      {data && (
        <>
          <div className="text-xs text-muted">{data.count} results for "{query}"</div>
          <div className="space-y-1">
            {data.articles.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                className="surface-card p-3 rounded-xl flex items-start gap-3 text-sm hover:bg-muted/50 transition-colors">
                <ExternalLink className="h-3.5 w-3.5 mt-0.5 text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{a.title}</div>
                  <div className="text-muted text-xs">{a.domain} · {a.country} · {a.date}</div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MaritimeTab() {
  const { data, loading, error } = useDataFetch<{
    warnings: Array<{
      msgYear?: number; msgNumber?: string; navArea?: string;
      subregion?: string; status?: string; issueDate?: string; text?: string;
    }>;
    count: number;
  }>({ url: '/api/v1/world-intel/maritime?limit=50', ttl: 60_000 });

  if (loading) return <div className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading maritime warnings...</div>;
  if (error) return <div className="text-destructive py-8">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Active Warnings" value={data.count} color="text-amber-400" />
      </div>
      <div className="space-y-1">
        {data.warnings.map((w, i) => (
          <div key={i} className="surface-card p-3 rounded-xl text-sm">
            <div className="flex items-center gap-2 mb-1">
              <Anchor className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-mono text-xs">NAVAREA {w.navArea ?? '?'} · #{w.msgNumber ?? '?'}</span>
              <span className="text-xs text-muted ml-auto">{w.issueDate}</span>
            </div>
            <div className="text-muted text-xs line-clamp-2">{w.text}</div>
          </div>
        ))}
        {data.warnings.length === 0 && <div className="text-muted text-sm py-4 text-center">No active maritime warnings</div>}
      </div>
    </div>
  );
}

function BasesTab() {
  const [operator, setOperator] = useState('');
  const { data, loading } = useDataFetch<{
    bases: Array<{
      name: string; operator: string; country: string; lat: number; lon: number;
      type: string; branch: string;
    }>;
    count: number;
  }>({ url: `/api/v1/world-intel/bases${operator ? `?operator=${operator}` : ''}`, ttl: 300_000 });

  if (loading) return <div className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading bases...</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select value={operator} onChange={(e) => setOperator(e.target.value)}
          className="px-3 py-2 rounded-xl bg-background border text-sm">
          <option value="">All Operators</option>
          <option value="USA">USA</option>
          <option value="RUS">Russia</option>
          <option value="CHN">China</option>
          <option value="JPN">Japan</option>
          <option value="VNM">Vietnam</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {data.bases.map((b, i) => (
          <div key={i} className="surface-card p-3 rounded-xl text-sm">
            <div className="font-medium">{b.name}</div>
            <div className="text-muted text-xs">
              {b.operator} · {b.country} · {b.branch} · {b.type.replace('_', ' ')}
            </div>
            <div className="text-muted text-xs font-mono">{b.lat.toFixed(2)}°, {b.lon.toFixed(2)}°</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WorldIntel() {
  const [tab, setTab] = useState<Tab>('cyber');

  return (
    <DataPageLayout
      backTo="/"
      icon={<Globe className="h-5 w-5" />}
      title="World Intel"
      description="Live global intelligence - cyber threats, seismic activity, internet outages, military posture, space weather, and strategic infrastructure from 30+ free public APIs."
      headerExtra={<span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white font-medium">NEW</span>}
    >
      <div className="flex gap-1 overflow-x-auto pb-2 border-b mb-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted hover:bg-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'cyber' && <CyberTab />}
      {tab === 'earthquakes' && <EarthquakesTab />}
      {tab === 'outages' && <OutagesTab />}
      {tab === 'space' && <SpaceWeatherTab />}
      {tab === 'military' && <MilitaryTab />}
      {tab === 'news' && <NewsTab />}
      {tab === 'maritime' && <MaritimeTab />}
      {tab === 'bases' && <BasesTab />}
    </DataPageLayout>
  );
}

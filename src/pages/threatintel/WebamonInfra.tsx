import { useState, type FormEvent } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Search,
  Globe,
  Server,
  FileCode,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

interface EntityResult {
  domain?: Record<string, unknown>;
  server?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  error?: string;
}

function JsonBlock({ data, label }: { data: Record<string, unknown>; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        {open ? (
          <ChevronDown size={14} className="text-slate-400" />
        ) : (
          <ChevronRight size={14} className="text-slate-400" />
        )}
        <span className="font-mono text-[13px] font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-[11px] text-slate-400 font-mono">{Object.keys(data).length} fields</span>
      </button>
      {open && (
        <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-4 overflow-x-auto max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function WebamonInfra(): JSX.Element {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'domain' | 'server' | 'resource'>('domain');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EntityResult | null>(null);

  const doLookup = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const endpoint =
        mode === 'domain'
          ? `/api/v1/webamon/domain/${encodeURIComponent(q)}`
          : mode === 'server'
            ? `/api/v1/webamon/server/${encodeURIComponent(q)}`
            : `/api/v1/webamon/resource/${encodeURIComponent(q)}`;

      const res = await fetch(endpoint);
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData({ [mode]: json as Record<string, unknown> });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const MODES = [
    { key: 'domain' as const, label: 'Domain Lookup', icon: Globe, placeholder: 'example.com' },
    { key: 'server' as const, label: 'Server Lookup', icon: Server, placeholder: 'IP address' },
    { key: 'resource' as const, label: 'Resource Lookup', icon: FileCode, placeholder: 'SHA256 hash' },
  ];

  const activeMode = MODES.find((m) => m.key === mode)!;
  const ModeIcon = activeMode.icon;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> Webamon Infrastructure
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
          Query Webamon's infrastructure graph — look up domains, servers, and web resources to map relationships and
          discover connected infrastructure.
        </p>
      </div>

      <form onSubmit={doLookup} className="mb-6">
        <div className="flex gap-2 max-w-3xl">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`px-3 py-2.5 text-[12px] font-mono flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-brand-600 dark:bg-brand-500 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon size={13} />
                  {m.label}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={activeMode.placeholder}
            aria-label={activeMode.label}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="px-4 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-6 text-sm text-red-700 dark:text-red-400 font-mono flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-8 text-slate-500">
          <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
          <span className="font-mono text-sm">Querying Webamon infrastructure…</span>
        </div>
      )}

      {data && (
        <div className="space-y-3">
          {data.domain && (
            <div>
              <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
                <Globe size={18} className="text-brand-600 dark:text-brand-400" /> Domain Record
              </h2>
              <JsonBlock data={data.domain} label="domain" />
            </div>
          )}
          {data.server && (
            <div>
              <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
                <Server size={18} className="text-brand-600 dark:text-brand-400" /> Server Record
              </h2>
              <JsonBlock data={data.server} label="server" />
            </div>
          )}
          {data.resource && (
            <div>
              <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
                <FileCode size={18} className="text-brand-600 dark:text-brand-400" /> Resource Record
              </h2>
              <JsonBlock data={data.resource} label="resource" />
            </div>
          )}
        </div>
      )}

      {!loading && !error && !data && (
        <div className="text-center py-16 text-slate-400">
          <Search size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-1">Explore Webamon's Infrastructure Graph</p>
          <p className="text-sm max-w-md mx-auto">
            Look up a domain, server IP, or resource SHA256 to see what Webamon knows about the infrastructure.
          </p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Shield, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Plus, Trash2, Globe, Search } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { AppFooter } from '../../components/AppFooter';

interface DomainStatus {
  domain: string;
  ioc_sightings: number;
  ioc_details: Array<{ value: string; kind: string; source: string }>;
  breach_count: number;
  breach_details: Array<{ name: string; pwn_count?: number; breach_date?: string; data_classes?: string[] }>;
}

interface DashboardData {
  watchlist: { domains: string[]; emails: string[] };
  domains: DomainStatus[];
  generated_at: string;
}

export default function MyDashboard(): JSX.Element {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/dashboard');
      if (!res.ok) throw new Error('Failed to load dashboard');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const [actionError, setActionError] = useState<string | null>(null);

  const addDomain = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain || !data) return;
    setActionError(null);
    const updated = [...new Set([...data.watchlist.domains, domain])].slice(0, 20);
    const res = await fetch('/api/v1/dashboard/watchlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domains: updated, emails: data.watchlist.emails }),
    });
    if (res.ok) {
      setNewDomain('');
      await fetchData();
    } else {
      const err = await res.json().catch(() => null);
      setActionError(err?.error ?? 'Failed to add domain');
    }
  };

  const removeDomain = async (domain: string) => {
    if (!data) return;
    setActionError(null);
    const updated = data.watchlist.domains.filter((d) => d !== domain);
    const res = await fetch('/api/v1/dashboard/watchlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domains: updated, emails: data.watchlist.emails }),
    });
    if (res.ok) {
      await fetchData();
    } else {
      const err = await res.json().catch(() => null);
      setActionError(err?.error ?? 'Failed to remove domain');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink to="/threatintel" className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono">
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
            <Shield className="text-brand-600 dark:text-brand-400" size={28} />
            Personal Threat Dashboard
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
            Monitor your domains for IOC sightings, breach disclosures, and more.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30 p-4 flex items-start justify-between gap-3 mb-6">
          <div className="text-sm font-mono text-rose-700 dark:text-rose-300">
            <AlertTriangle size={14} className="inline mr-1" /> {error}
          </div>
          <button onClick={fetchData} className="shrink-0 text-xs font-mono px-3 py-1.5 rounded border border-rose-400/60 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10">retry</button>
        </div>
      )}

      {actionError && (
        <div role="alert" className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30 p-4 mb-6">
          <div className="text-sm font-mono text-rose-700 dark:text-rose-300">
            <AlertTriangle size={14} className="inline mr-1" /> {actionError}
          </div>
        </div>
      )}

      {/* Add domain */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDomain()}
              placeholder="Add a domain to monitor (e.g. example.com)"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          <button
            onClick={addDomain}
            disabled={!newDomain.trim()}
            className="px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 inline-flex items-center gap-2 text-sm"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </section>

      {loading && !data && <DataState type="loading" rows={3} />}

      {data && (
        <div className="space-y-6">
          {data.watchlist.domains.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-10 text-center">
              <Globe size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
              <p className="text-slate-500 dark:text-slate-400 text-sm font-mono">No domains in your watchlist yet.</p>
              <p className="text-xs text-slate-400 mt-1 font-mono">Add a domain above to start monitoring.</p>
            </div>
          ) : (
            data.domains.map((d) => (
              <div key={d.domain} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Globe size={20} className="text-slate-400" />
                    <h3 className="font-display font-semibold text-lg">{d.domain}</h3>
                  </div>
                  <button
                    onClick={() => removeDomain(d.domain)}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                    title="Remove domain"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                  <div className={`p-4 rounded-lg border ${d.ioc_sightings > 0 ? 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800' : 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'}`}>
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold mb-1">
                      {d.ioc_sightings > 0 ? <AlertTriangle size={12} className="text-rose-500" /> : <CheckCircle2 size={12} className="text-emerald-500" />}
                      IOC Sightings
                    </div>
                    <p className={`text-lg font-bold tabular-nums font-mono ${d.ioc_sightings > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {d.ioc_sightings}
                    </p>
                    {d.ioc_sightings > 0 && (
                      <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
                        {d.ioc_details.map((ioc, i) => (
                          <div key={i} className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            <span>{ioc.kind}</span>
                            <span className="text-slate-400 mx-1">·</span>
                            <span>{ioc.source}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={`p-4 rounded-lg border ${d.breach_count > 0 ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800' : 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'}`}>
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold mb-1">
                      {d.breach_count > 0 ? <AlertTriangle size={12} className="text-amber-500" /> : <CheckCircle2 size={12} className="text-emerald-500" />}
                      Breaches
                    </div>
                    <p className={`text-lg font-bold tabular-nums font-mono ${d.breach_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {d.breach_count}
                    </p>
                    {d.breach_count > 0 && (
                      <div className="mt-2 space-y-1">
                        {d.breach_details.map((b, i) => (
                          <div key={i} className="text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="font-medium">{b.name}</span>
                            {b.pwn_count && <span> — {b.pwn_count.toLocaleString()} records</span>}
                            {b.breach_date && <span> ({b.breach_date})</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Links */}
                <div className="flex gap-3 text-xs font-mono">
                  <a
                    href={`/dfir/domain?q=${d.domain}`}
                    className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink size={10} /> Domain scan
                  </a>
                  <a
                    href={`/threatintel/live-iocs?q=${d.domain}`}
                    className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink size={10} /> Live IOCs
                  </a>
                  <a
                    href={`https://haveibeenpwned.com/domain/${d.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink size={10} /> HIBP
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <p className="text-[11px] font-mono text-slate-500 mt-8 text-center">
        Data checked against cached threat intelligence feeds. Last updated: {data?.generated_at ? new Date(data.generated_at).toLocaleString() : '—'}
      </p>

      <AppFooter
        aboutTo="/threatintel/about"
        blurb="Dashboard data is cached and updated periodically. Add domains to monitor for IOC sightings and breach disclosures."
      />
    </div>
  );
}

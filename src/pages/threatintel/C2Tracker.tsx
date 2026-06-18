import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Radar, RefreshCw } from 'lucide-react';
import { DataState } from '../../components/DataState';

interface C2Entry {
  ip: string;
  framework: string;
  first_seen: string;
  sources: string[];
  context?: string;
  port?: number;
}

interface C2Source {
  id: string;
  name: string;
  count: number;
}

interface C2Data {
  generated_at: string;
  count: number;
  sources: C2Source[];
  frameworks: Record<string, number>;
  entries: C2Entry[];
}

const FRAMEWORK_COLORS: Record<string, string> = {
  cobaltstrike: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  sliver: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  metasploit: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  havoc: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  bruteratel: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  deimos: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  nighthawk: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  poshc2: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
  silver: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
  empire: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30',
  mythic: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  pwnrig: 'bg-stone-500/15 text-stone-700 dark:text-stone-300 border-stone-500/30',
  covenant: 'bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/30',
  unknown: 'bg-slate-500/15 text-muted border-slate-500/30',
};

const SOURCE_COLORS: Record<string, string> = {
  c2intel: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  threatfox: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
};

export default function C2Tracker(): JSX.Element {
  const [data, setData] = useState<C2Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/c2-tracker', { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<C2Data>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: { name?: string; message?: string }) => {
        if (!cancelled && e.name !== 'AbortError') setError(e.message ?? 'unknown');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey]);

  const filtered = data ? (filter === 'all' ? data.entries : data.entries.filter((e) => e.framework === filter)) : [];
  const frameworks = data ? Object.keys(data.frameworks).sort() : [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Radar size={28} className="text-brand-600 dark:text-brand-400" /> C2 Infrastructure Tracker
        </h1>
        <p className="text-muted mb-8 max-w-2xl">
          Aggregated live C2 server infrastructure deduped across six independent feeds: C2IntelFeeds (drb-ra),
          ThreatFox (abuse.ch), CriticalPathSecurity Public-Intelligence-Feeds, CriminalIP C2-Daily-Feed, and TweetFeed
          (#C2-tagged tweets). Each framework family is fairly sampled so filters like asyncrat or havoc show real
          entries even when cobaltstrike dominates the total. Cross-check individual IPs via the IOC Checker.
        </p>
      </div>

      <DataState loading={loading} error={error} rows={8}>
        {data && (
          <div className="space-y-6">
            {/* Source Summary */}
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
                <h2 className="font-display font-bold text-xl">Active C2 infrastructure</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{data.count} IPs tracked</span>
                  <button
                    type="button"
                    onClick={() => setRefreshKey((k) => k + 1)}
                    className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1"
                    aria-label="Refresh C2 tracker"
                  >
                    <RefreshCw size={11} /> refresh
                  </button>
                </div>
              </div>
              {/* Source bar */}
              <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                {data.sources.map((s) => (
                  <span
                    key={s.id}
                    className={`text-micro font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${SOURCE_COLORS[s.id] ?? 'bg-slate-500/15 text-slate-500 border-slate-500/30'}`}
                  >
                    {s.name} · {s.count}
                  </span>
                ))}
                <span className="text-micro font-mono text-slate-500">Total · {data.count}</span>
              </div>
              {/* Framework filter */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${filter === 'all' ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-slate-700 text-muted hover:border-brand-500/40'}`}
                >
                  All <span className="opacity-60">· {data.count}</span>
                </button>
                {frameworks.map((fw) => (
                  <button
                    key={fw}
                    onClick={() => setFilter(fw)}
                    className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${filter === fw ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-slate-700 text-muted hover:border-brand-500/40'}`}
                  >
                    {fw} <span className="opacity-60">· {data.frameworks[fw]}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs font-mono text-slate-500 mt-3">
                Sources: C2IntelFeeds · ThreatFox · CriticalPathSecurity · CriminalIP · TweetFeed — cached 30 min
              </p>
            </section>

            {/* IP List */}
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
              <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
                {filter === 'all' ? 'All C2 IPs' : `${filter} C2 IPs`}
                <span className="ml-2 text-slate-500">({filtered.length})</span>
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.slice(0, 300).map((entry, i) => (
                  <div
                    key={`${entry.ip}-${i}`}
                    className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <code className="font-mono text-sm text-slate-900 dark:text-slate-100 font-semibold truncate">
                        {entry.ip}
                      </code>
                      <span
                        className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${FRAMEWORK_COLORS[entry.framework] ?? 'bg-slate-500/15 text-muted border-slate-500/30'}`}
                      >
                        {entry.framework}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {entry.sources.map((s) => (
                        <span
                          key={s}
                          className={`text-micro font-mono uppercase tracking-wider px-1 py-0.5 rounded border ${SOURCE_COLORS[s] ?? 'bg-slate-500/15 text-slate-500 border-slate-500/30'}`}
                        >
                          {s}
                        </span>
                      ))}
                      {entry.port && <span className="text-micro font-mono text-slate-500">:{entry.port}</span>}
                    </div>
                    {entry.context && (
                      <p className="text-micro font-mono text-slate-500 mt-1 truncate" title={entry.context}>
                        {entry.context}
                      </p>
                    )}
                    <div className="flex gap-1.5 mt-1.5">
                      <Link
                        to={`/dfir/ioc-check?indicator=${entry.ip}`}
                        className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        ioc
                      </Link>
                      <Link
                        to={`/dfir/ip-geo?ip=${entry.ip}`}
                        className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        geo
                      </Link>
                      <Link
                        to={`/dfir/domain-rep?domain=${entry.ip}`}
                        className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        bl
                      </Link>
                    </div>
                  </div>
                ))}
                {filtered.length > 300 && (
                  <p className="text-xs font-mono text-slate-500 col-span-full text-center py-2">
                    Showing first 300 of {filtered.length} entries
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </DataState>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Loader2, Globe, Shield, AlertTriangle, ExternalLink } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

// ─── API Response Types ──────────────────────────────────────────────────────

interface TyposquatVariant {
  domain: string;
  type: 'typo' | 'homoglyph' | 'affix' | 'tld-swap';
  ips?: string[];
}

interface DomainMonitorResponse {
  domain: string;
  total_variants: number;
  checked: number;
  active: number;
  inactive: number;
  results: {
    active: TyposquatVariant[];
    inactive: TyposquatVariant[];
    unchecked: TyposquatVariant[];
  };
  generated_at: string;
}

// ─── Type Labels ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  typo: { label: 'Typo', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300' },
  homoglyph: { label: 'Homoglyph', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  affix: { label: 'Affix', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  'tld-swap': { label: 'TLD Swap', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' },
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DomainMonitor(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('domain') ?? '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DomainMonitorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clean = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  const run = useCallback(async () => {
    if (!clean) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const r = await fetch(`/api/v1/domain-monitor?domain=${encodeURIComponent(clean)}`, { signal });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as DomainMonitorResponse;
      setResults(data);
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : 'check failed');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [clean]);

  useEffect(() => {
    if (searchParams.get('domain')) run();
    return () => abortRef.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="Domain Monitor"
      description="Detect typosquat domains, homoglyph attacks, and phishing variants targeting your brand. Generates permutations and checks which are actively registered."
      headerExtra={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="example.com"
                className="w-full pl-9 pr-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                aria-label="Domain to monitor"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !clean}
              className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin inline mr-1" />
              ) : (
                <Search size={16} className="inline mr-1" />
              )}{' '}
              Scan
            </button>
          </div>
        </form>
      }
      loading={loading}
      error={error}
      onRetry={run}
      empty={!loading && !error && !results}
      emptyMessage="Enter a domain above to scan for typosquat variants."
      emptyIcon={<Globe size={28} className="mx-auto text-slate-400" />}
    >
      {results && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="font-display font-bold text-xl mb-4">{results.domain}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{results.total_variants}</div>
                <div className="text-xs font-mono text-slate-500">Total Variants</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-500">{results.checked}</div>
                <div className="text-xs font-mono text-slate-500">Checked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-rose-500">{results.active}</div>
                <div className="text-xs font-mono text-slate-500">Active</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-500">{results.inactive}</div>
                <div className="text-xs font-mono text-slate-500">Inactive</div>
              </div>
            </div>
          </section>

          {/* Risk Assessment */}
          {results.active > 0 && (
            <section className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-display font-semibold text-amber-800 dark:text-amber-200">
                    {results.active} Active Typosquat{results.active !== 1 ? 's' : ''} Detected
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    These domains are registered and could be used for phishing attacks. Consider monitoring them or
                    taking defensive action.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Active Domains (Potential Threats) */}
          {results.results.active.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400 font-mono mb-3 flex items-center gap-2">
                <AlertTriangle size={12} /> Active Typosquats ({results.results.active.length})
              </h3>
              <div className="space-y-2">
                {results.results.active.map((v) => (
                  <div
                    key={v.domain}
                    className="flex items-center justify-between p-3 rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20"
                  >
                    <div className="flex items-center gap-3">
                      <Globe size={14} className="text-rose-500" />
                      <span className="font-mono text-sm">{v.domain}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${TYPE_LABELS[v.type]?.color ?? 'bg-slate-100 text-slate-800'}`}
                      >
                        {TYPE_LABELS[v.type]?.label ?? v.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.ips && v.ips.length > 0 && (
                        <span className="text-[10px] font-mono text-slate-500">{v.ips[0]}</span>
                      )}
                      <Link
                        to={`/dfir/domain-rep?domain=${encodeURIComponent(v.domain)}`}
                        className="text-xs font-mono text-brand-600 hover:text-brand-700 dark:text-brand-400"
                      >
                        Check Rep
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Inactive Domains (Safe) */}
          {results.results.inactive.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 font-mono mb-3">
                Inactive Variants ({results.results.inactive.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {results.results.inactive.map((v) => (
                  <span
                    key={v.domain}
                    className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500"
                    title={v.type}
                  >
                    {v.domain}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Unchecked Variants */}
          {results.results.unchecked.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 font-mono mb-3">
                Additional Variants ({results.results.unchecked.length})
              </h3>
              <p className="text-xs font-mono text-slate-500 mb-3">
                These variants were generated but not checked due to rate limiting. Run a deeper scan for comprehensive
                coverage.
              </p>
              <div className="flex flex-wrap gap-2">
                {results.results.unchecked.slice(0, 20).map((v) => (
                  <span
                    key={v.domain}
                    className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-400"
                    title={v.type}
                  >
                    {v.domain}
                  </span>
                ))}
                {results.results.unchecked.length > 20 && (
                  <span className="text-xs font-mono text-slate-400">
                    +{results.results.unchecked.length - 20} more
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Type Legend */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
              Detection Types
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(TYPE_LABELS).map(([key, { label, color }]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${color}`}>{label}</span>
                  <span className="text-xs text-slate-500">
                    {key === 'typo' && 'Character errors'}
                    {key === 'homoglyph' && 'Lookalike chars'}
                    {key === 'affix' && 'Added prefixes'}
                    {key === 'tld-swap' && 'Different TLD'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Quick Links */}
          <div className="flex gap-2 flex-wrap">
            <Link
              to={`/dfir/domain-rep?domain=${encodeURIComponent(clean)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> Domain Reputation
            </Link>
            <Link
              to={`/dfir/ioc-check?indicator=${encodeURIComponent(clean)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> IOC Checker
            </Link>
            <Link
              to={`/dfir/breach?domain=${encodeURIComponent(clean)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> Breach Check
            </Link>
          </div>
        </div>
      )}
    </DataPageLayout>
  );
}

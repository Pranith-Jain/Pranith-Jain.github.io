import { useState } from 'react';
import { useDataFetch } from '../../hooks/useDataFetch';
import { DataPageLayout } from '../../components/DataPageLayout';
import { PageMeta } from '../../components/PageMeta';
import { Search, Globe, Loader2, ExternalLink, Shield, AlertTriangle } from 'lucide-react';

interface CerastResult {
  domain: string;
  path: string;
  category: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  page_rank: number;
  version: string;
  created: string;
  multihost: boolean;
}

interface CerastResponse {
  query: string;
  results: CerastResult[];
  count: number;
  limited: boolean;
  diagnostics: Array<{ provider: string; status: string; ms: number; error?: string }>;
}

const IMPACT_CLS: Record<string, string> = {
  HIGH: 'border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  MEDIUM: 'border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  LOW: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted',
};

const EXAMPLES = ['staging.', '.gov', 'test-', 'admin.', 'dev.', 'internal.', '.env', 'phpinfo'];

function fmtDate(s: string): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return s;
  }
}

export default function Cerast() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  const { data, loading, error } = useDataFetch<CerastResponse>({
    url: submitted ? `/api/v1/cerast/search?q=${encodeURIComponent(submitted)}` : null,
    ttl: 60_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length >= 3) setSubmitted(trimmed);
  };

  const runExample = (ex: string) => {
    setQuery(ex);
    setSubmitted(ex);
  };

  return (
    <>
      <PageMeta
        title="Cerast Intelligence"
        description="OSINT domain exposure search — find exposed paths, staging environments, and misconfigurations across observed domains."
        section="Threat Intel"
        canonicalPath="/threatintel/external/cerast"
      />
      <DataPageLayout
        backTo="/threatintel/catalog"
        backLabel="Catalog"
        icon={<Globe size={28} />}
        title="Cerast Intelligence"
        description="Search observed domains for exposed paths and misconfigurations. Substring search — find staging, dev, admin, and test environments."
      >
        <div className="space-y-5">
          {/* Search */}
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="domain contains… (min 3 chars)"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-sm font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-shadow"
                minLength={3}
              />
            </div>
            <button
              type="submit"
              disabled={query.trim().length < 3 || loading}
              className="px-5 py-2.5 rounded-xl bg-brand-600 dark:bg-brand-500 text-white font-semibold text-sm hover:brightness-110 disabled:opacity-50 transition-all inline-flex items-center gap-2 shadow-md hover:shadow-md"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </button>
          </form>

          {/* Example queries */}
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => runExample(ex)}
                className="px-2.5 py-1 rounded border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-[11px] font-mono text-muted hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-[rgb(var(--surface-300))] transition-all"
              >
                {ex}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-rose-300/50 dark:border-rose-800/40 bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Results */}
          {data && (
            <div className="space-y-3">
              {/* Match count */}
              <div className="flex items-center justify-between text-sm">
                <div className="text-muted">
                  {data.limited ? (
                    <>
                      <span className="font-semibold text-foreground">{data.count.toLocaleString()}+</span> matches —
                      showing latest {data.results.length}. Refine to narrow.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-foreground">{data.count.toLocaleString()}</span> match
                      {data.count === 1 ? '' : 'es'}
                    </>
                  )}
                </div>
                {data.results.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted">
                    <Shield className="h-3 w-3" />
                    {data.results.filter((r) => r.impact === 'HIGH').length} high ·{' '}
                    {data.results.filter((r) => r.impact === 'MEDIUM').length} medium
                  </div>
                )}
              </div>

              {/* Empty */}
              {data.results.length === 0 && (
                <div className="text-center py-14 text-muted text-sm border border-dashed border-[rgb(var(--border-400))] rounded-xl bg-[rgb(var(--surface-200))]">
                  <Globe className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  No results found for "<span className="font-mono text-foreground">{submitted}</span>".
                </div>
              )}

              {/* Table */}
              {data.results.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgb(var(--border-400))] bg-[rgb(var(--surface-300))]/50">
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">
                          Domain
                        </th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">
                          Path
                        </th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">
                          Category
                        </th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">
                          Impact
                        </th>
                        <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">
                          Score
                        </th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">
                          First Seen
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.results.map((r, i) => (
                        <tr
                          key={`${r.domain}-${r.path}-${i}`}
                          className="border-b border-[rgb(var(--border-400))] last:border-b-0 hover:bg-[rgb(var(--surface-300))]/40 transition-colors group"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs">
                            <span
                              className={
                                r.multihost
                                  ? 'opacity-50'
                                  : 'text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors'
                              }
                            >
                              {r.domain}
                            </span>
                            {r.multihost && (
                              <span className="ml-1.5 text-[9px] uppercase tracking-wider text-muted border border-dashed border-[rgb(var(--border-400))] rounded-full px-1.5 py-0.5">
                                multihost
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted">
                            {r.path && r.path !== '/' ? (
                              <a
                                href={`https://${r.domain}${r.path}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-brand-600 dark:hover:text-brand-400 transition inline-flex items-center gap-1"
                              >
                                {r.path}{' '}
                                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </a>
                            ) : (
                              <span className="opacity-30">/</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded-full border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-300))]/50 text-[11px] text-muted">
                              {r.category}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${IMPACT_CLS[r.impact] ?? IMPACT_CLS.LOW}`}
                            >
                              {r.impact}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-muted">
                            {r.page_rank > 0 ? r.page_rank.toFixed(1) : '–'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted font-mono whitespace-nowrap">
                            {fmtDate(r.created)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Diagnostics */}
              {data.diagnostics.length > 0 && (
                <div className="text-[11px] text-muted space-y-1 pl-1">
                  {data.diagnostics.map((d, i) => (
                    <div key={i} className="font-mono">
                      <span className="text-foreground/60">{d.provider}</span>: {d.status}{' '}
                      <span className="text-foreground/40">({d.ms}ms)</span>
                      {d.error ? <span className="text-rose-500/70"> — {d.error}</span> : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* About */}
          <div className="mt-6 p-5 rounded-xl border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-xs text-muted space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <p className="font-semibold text-foreground text-sm">About Cerast Intelligence</p>
            </div>
            <p className="leading-relaxed">
              Cerast Intelligence is a free OSINT tool that indexes observed domains for exposed paths and
              misconfigurations. Use it to discover staging environments, exposed admin panels, test deployments, and
              other infrastructure that shouldn't be publicly visible.
            </p>
            <p>
              <a
                href="https://search.cerast-intelligence.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 font-medium"
              >
                Open Cerast Intelligence <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>
      </DataPageLayout>
    </>
  );
}

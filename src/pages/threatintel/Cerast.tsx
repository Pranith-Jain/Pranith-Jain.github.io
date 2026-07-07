import { useState } from 'react';
import { useDataFetch } from '../../hooks/useDataFetch';
import { DataPageLayout } from '../../components/DataPageLayout';
import { PageMeta } from '../../components/PageMeta';
import { Search, Globe, Loader2, ExternalLink } from 'lucide-react';

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
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="domain contains… (min 3 chars)"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-sm font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                minLength={3}
              />
            </div>
            <button
              type="submit"
              disabled={query.trim().length < 3 || loading}
              className="px-5 py-2.5 rounded-lg bg-brand-600 dark:bg-brand-500 text-white font-semibold text-sm hover:brightness-110 disabled:opacity-50 transition"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </button>
          </form>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400 text-sm">
              {error}
            </div>
          )}

          {data && (
            <div className="space-y-3">
              <div className="text-sm text-muted">
                {data.limited
                  ? <><span className="font-semibold text-foreground">{data.count.toLocaleString()}+</span> matches — showing latest {data.results.length}. Refine to narrow.</>
                  : <><span className="font-semibold text-foreground">{data.count.toLocaleString()}</span> match{data.count === 1 ? '' : 'es'}</>
                }
              </div>

              {data.results.length === 0 ? (
                <div className="text-center py-12 text-muted text-sm border border-[rgb(var(--border-400))] rounded-lg bg-[rgb(var(--surface-200))]">
                  No results found.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgb(var(--border-400))]">
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">Domain</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">Path</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">Category</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">Impact</th>
                        <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">Score</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted font-semibold">First Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.results.map((r, i) => (
                        <tr key={`${r.domain}-${r.path}-${i}`} className="border-b border-[rgb(var(--border-400))] last:border-b-0 hover:bg-[rgb(var(--surface-300))]/50 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs">
                            <span className={r.multihost ? 'opacity-50' : ''}>{r.domain}</span>
                            {r.multihost && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-muted border border-dashed border-[rgb(var(--border-400))] rounded-full px-1.5 py-0.5">multihost</span>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted">
                            {r.path && r.path !== '/' ? (
                              <a
                                href={`https://${r.domain}${r.path}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-brand-600 dark:hover:text-brand-400 transition inline-flex items-center gap-1"
                              >
                                {r.path} <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : <span className="opacity-50">/</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded-full border border-[rgb(var(--border-400))] text-[11px] text-muted">{r.category}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${IMPACT_CLS[r.impact] ?? IMPACT_CLS.LOW}`}>{r.impact}</span>
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

              {data.diagnostics.length > 0 && (
                <div className="text-[11px] text-muted space-y-1">
                  {data.diagnostics.map((d, i) => (
                    <div key={i}>
                      {d.provider}: {d.status} ({d.ms}ms){d.error ? ` — ${d.error}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 p-4 rounded-lg border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-xs text-muted space-y-2">
            <p className="font-semibold text-foreground text-sm">About Cerast Intelligence</p>
            <p>
              Cerast Intelligence is a free OSINT tool that indexes observed domains for exposed paths and
              misconfigurations. Use it to discover staging environments, exposed admin panels, test deployments,
              and other infrastructure that shouldn't be publicly visible.
            </p>
            <p>
              <a href="https://search.cerast-intelligence.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">
                Open Cerast Intelligence <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>
      </DataPageLayout>
    </>
  );
}

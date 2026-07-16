import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Search, Globe, Loader2, AlertTriangle } from 'lucide-react';

interface DomainResult {
  domain_name: string;
  registrant_name?: string;
  company_name?: string;
  registrant_email?: string;
  creation_date?: string;
  expiry_date?: string;
}

interface WhoxyResponse {
  success: boolean;
  query: string;
  search_type: string;
  total_results: number;
  domains: DomainResult[];
  pages_fetched: number;
  elapsed_ms: number;
  error?: string;
}

const SEARCH_TYPES = [
  { value: 'email', label: 'Email Address' },
  { value: 'name', label: 'Owner Name' },
  { value: 'company', label: 'Company' },
  { value: 'keyword', label: 'Domain Keyword' },
] as const;

export default function Whoxy() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<string>('email');
  const [submittedQuery, setSubmittedQuery] = useState<{ q: string; type: string } | null>(null);

  const { data, loading, error } = useDataFetch<WhoxyResponse>({
    url: submittedQuery
      ? `/api/v1/whoxy/reverse?q=${encodeURIComponent(submittedQuery.q)}&type=${submittedQuery.type}`
      : null,
    ttl: 60_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      setSubmittedQuery({ q: trimmed, type: searchType });
    }
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Globe />}
      title="Whoxy Reverse WHOIS"
      description={
        <span>
          Reverse WHOIS lookup via{' '}
          <a
            href="https://www.whoxy.com/reverse-whois/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            whoxy.com
          </a>{' '}
          — find all domains associated with an email, owner name, company, or keyword.
        </span>
      }
    >
      <div className="space-y-6 max-w-3xl mx-auto">
        <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder={
                    searchType === 'email'
                      ? 'e.g. admin@example.com'
                      : searchType === 'name'
                        ? 'e.g. John Smith'
                        : searchType === 'company'
                          ? 'e.g. Acme Corporation'
                          : 'e.g. yahoo'
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-4 py-2 rounded bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 text-white font-mono text-sm disabled:opacity-50 inline-flex items-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                {loading ? 'searching…' : 'search'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SEARCH_TYPES.map((st) => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => setSearchType(st.value)}
                  className={`text-mini font-mono px-2 py-0.5 rounded border ${
                    searchType === st.value
                      ? 'border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </form>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 size={20} className="animate-spin mr-3" />
            Searching WHOIS records...
          </div>
        )}

        {error && !loading && (
          <p className="text-sm font-mono text-rose-600 dark:text-rose-400 mb-4 inline-flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </p>
        )}

        {data && !loading && (
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
                Summary
              </h2>
              <div className="flex gap-6">
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.total_results}</div>
                  <div className="text-mini font-mono text-slate-400 dark:text-slate-400">Total Domains</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.domains.length}</div>
                  <div className="text-mini font-mono text-slate-400 dark:text-slate-400">Fetched</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.pages_fetched}</div>
                  <div className="text-mini font-mono text-slate-400 dark:text-slate-400">Pages</div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
                Domains ({data.domains.length})
              </h2>
              {data.domains.length > 0 ? (
                <div className="overflow-x-auto -mx-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                        <th className="text-left px-4 py-2 font-mono text-mini uppercase tracking-wider text-muted">
                          Domain
                        </th>
                        <th className="text-left px-4 py-2 font-mono text-mini uppercase tracking-wider text-muted">
                          Registrant
                        </th>
                        <th className="text-left px-4 py-2 font-mono text-mini uppercase tracking-wider text-muted">
                          Company
                        </th>
                        <th className="text-left px-4 py-2 font-mono text-mini uppercase tracking-wider text-muted">
                          Created
                        </th>
                        <th className="text-left px-4 py-2 font-mono text-mini uppercase tracking-wider text-muted">
                          Expires
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.domains.map((d, i) => (
                        <tr
                          key={i}
                          className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] last:border-0"
                        >
                          <td className="px-4 py-2 font-mono text-sm text-brand-600 dark:text-brand-400">
                            <a
                              href={`https://${d.domain_name}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {d.domain_name}
                            </a>
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">
                            {d.registrant_name || <span className="text-muted">—</span>}
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">
                            {d.company_name || <span className="text-muted">—</span>}
                          </td>
                          <td className="px-4 py-2 text-mini text-muted font-mono">{d.creation_date || '—'}</td>
                          <td className="px-4 py-2 text-mini text-muted font-mono">{d.expiry_date || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted py-2">No domains found for this search.</p>
              )}
            </section>

            {data.elapsed_ms && (
              <div className="text-center text-micro text-muted">Query completed in {data.elapsed_ms}ms</div>
            )}
          </div>
        )}

        <div className="text-center pt-6 pb-2 text-xs text-muted border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Powered by{' '}
          <a
            href="https://www.whoxy.com/reverse-whois/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            whoxy.com
          </a>{' '}
          — 705M+ WHOIS records across 1,596 TLDs.
        </div>
      </div>
    </DataPageLayout>
  );
}

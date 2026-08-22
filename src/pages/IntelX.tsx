import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Search, Database, AlertTriangle } from 'lucide-react';

interface IntelxRecord {
  media?: number;
  name?: string;
  value?: string;
  source?: string;
  date?: string;
  size?: number;
  system?: string;
  [key: string]: unknown;
}

interface IntelxResponse {
  success: boolean;
  query: string;
  search_id?: string;
  records: IntelxRecord[];
  total: number;
  elapsed_ms: number;
  mode: string;
  error?: string;
}

const MODES = [
  {
    value: 'search',
    label: 'Leaked Data Search',
    desc: 'Search paste sites, breach archives, and dark-web collections',
  },
  { value: 'phonebook', label: 'Phonebook', desc: 'Find emails, domains, and URLs associated with a search term' },
] as const;

export default function IntelX() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'search' | 'phonebook'>('search');
  const [submittedQuery, setSubmittedQuery] = useState<{ q: string; mode: string } | null>(null);

  const endpoint = submittedQuery
    ? submittedQuery.mode === 'phonebook'
      ? `/api/v1/darknet-intel/intelx/phonebook?q=${encodeURIComponent(submittedQuery.q)}`
      : `/api/v1/darknet-intel/intelx/search?q=${encodeURIComponent(submittedQuery.q)}`
    : null;

  const { data, loading, error } = useDataFetch<IntelxResponse>({
    url: endpoint,
    ttl: 60_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      setSubmittedQuery({ q: trimmed, mode });
    }
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Database />}
      title="IntelligenceX Search"
      description={
        <span>
          Search{' '}
          <a
            href="https://intelx.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            IntelligenceX
          </a>{' '}
          — leaked data, paste sites, breach archives, phonebook (emails, domains, URLs by name/keyword).
        </span>
      }
    >
      <div className="space-y-6 max-w-4xl mx-auto">
        <section className="surface-card p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder={
                    mode === 'search'
                      ? 'e.g. user@example.com, evil.com, BTC address, IBAN...'
                      : 'e.g. John Smith, acme.com, keyword...'
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button
                type="submit"
                variant="primary-brand"
                size="sm"
                loading={loading}
                disabled={!query.trim()}
                icon={<Search size={14} />}
              >
                {loading ? 'searching…' : 'search'}
              </Button>
            </div>
            <div className="flex gap-2">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={`text-mini font-mono px-3 py-1 rounded border transition-colors ${
                    mode === m.value
                      ? 'border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-micro text-muted">{MODES.find((m) => m.value === mode)?.desc}</p>
          </form>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Spinner size="md" className="mr-3" />
            Searching IntelligenceX...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 flex items-center gap-3">
            <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <p className="text-sm font-mono text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            <section className="surface-card p-4">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.16em] text-muted mb-3">Summary</h2>
              <div className="flex gap-6">
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.total}</div>
                  <div className="text-mini font-mono text-slate-400">Records Found</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.mode}</div>
                  <div className="text-mini font-mono text-slate-400">Search Mode</div>
                </div>
                {data.search_id && (
                  <div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                      {data.search_id.slice(0, 8)}…
                    </div>
                    <div className="text-mini font-mono text-slate-400">Search ID</div>
                  </div>
                )}
              </div>
            </section>

            <section className="surface-card p-4">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.16em] text-muted mb-3">
                Records ({data.records.length})
              </h2>
              {data.records.length > 0 ? (
                <div className="space-y-2">
                  {data.records.map((r, i) => (
                    <div
                      key={`${r.value ?? i}`}
                      className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50/50 dark:bg-[rgb(var(--input-200))]/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm text-slate-900 dark:text-slate-100 truncate">
                          {r.value || r.name || JSON.stringify(r)}
                        </div>
                        <div className="flex gap-3 mt-1 text-micro font-mono text-muted">
                          {r.name && <span>{r.name}</span>}
                          {r.source && <span>Source: {r.source}</span>}
                          {r.date && <span>{r.date}</span>}
                          {r.system && <span className="uppercase">{r.system}</span>}
                          {typeof r.size === 'number' && r.size > 0 && <span>{(r.size / 1024).toFixed(1)} KB</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted py-2">No records found for this search.</p>
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
            href="https://intelx.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            IntelligenceX
          </a>{' '}
          — 20B+ records across paste sites, breach archives, and dark-web collections.
        </div>
      </div>
    </DataPageLayout>
  );
}

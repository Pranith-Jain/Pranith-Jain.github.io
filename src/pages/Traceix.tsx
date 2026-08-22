import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Search, Shield, Hash, AlertTriangle } from 'lucide-react';

interface AvResult {
  engine: string;
  engine_type: string;
  file_hash: string;
  verdict: 'Safe' | 'Malicious' | 'Unknown' | 'Failed';
}

interface TraceixResponse {
  success: boolean;
  hash: string;
  requestTimestamp?: number;
  avResults: AvResult[];
  error?: string;
}

const SAMPLES: { label: string; hash: string }[] = [
  { label: 'empty', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  { label: 'EICAR', hash: '275a021bbfb6489e54d4718999a7ea3e93b8d7406b3ac60a75a0e70951f8c6d7' },
];

const VERDICT_STYLE: Record<string, string> = {
  Safe: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Malicious: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  Unknown: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Failed: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted',
};

export default function Traceix() {
  const [hash, setHash] = useState('');
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);

  const { data, loading, error } = useDataFetch<TraceixResponse>({
    url: submittedHash ? `/api/v1/traceix/lookup?hash=${submittedHash}` : null,
    ttl: 60_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = hash.trim();
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      setSubmittedHash(trimmed);
    }
  };

  const maliciousCount = data?.avResults.filter((r) => r.verdict === 'Malicious').length ?? 0;
  const safeCount = data?.avResults.filter((r) => r.verdict === 'Safe').length ?? 0;

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Shield />}
      title="Traceix Hash Lookup"
      description={
        <span>
          Look up a SHA-256 file hash against{' '}
          <a
            href="https://traceix.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            traceix.com
          </a>{' '}
          - antivirus/reputation results powered by{' '}
          <a
            href="https://perkinsfund.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            Perkins Fund (PCEF)
          </a>
          .
        </span>
      }
    >
      <div className="space-y-6 max-w-2xl mx-auto">
        <section className="surface-card p-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Enter a SHA-256 hash (64 hex characters)"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
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
              disabled={!/^[0-9a-f]{64}$/i.test(hash.trim())}
              icon={<Search size={14} />}
            >
              {loading ? 'looking up…' : 'lookup'}
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="text-micro font-mono text-slate-400 dark:text-slate-400 self-center mr-1">samples:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.hash}
                type="button"
                onClick={() => {
                  setHash(s.hash);
                  setSubmittedHash(s.hash);
                }}
                className="text-mini font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Spinner size="md" className="mr-3" />
            Looking up hash...
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
                  <div className="text-2xl font-bold text-heading">{safeCount}</div>
                  <div className="text-mini font-mono text-slate-400 dark:text-slate-400">Safe</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-heading">{maliciousCount}</div>
                  <div className="text-mini font-mono text-slate-400 dark:text-slate-400">Malicious</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-heading">{data.avResults.length}</div>
                  <div className="text-mini font-mono text-slate-400 dark:text-slate-400">Engines</div>
                </div>
              </div>
            </section>

            <section className="surface-card p-4">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.16em] text-muted mb-3">
                Engine Results ({data.avResults.length})
              </h2>
              {data.avResults.length > 0 ? (
                <DataTable
                  columns={
                    [
                      {
                        key: 'engine',
                        header: 'Engine',
                        sortValue: (r) => r.engine,
                        render: (r) => <span className="text-sm text-heading font-medium">{r.engine}</span>,
                      },
                      {
                        key: 'engine_type',
                        header: 'Type',
                        sortValue: (r) => r.engine_type,
                        render: (r) => <span className="text-mini text-muted">{r.engine_type}</span>,
                      },
                      {
                        key: 'verdict',
                        header: 'Verdict',
                        align: 'right',
                        sortValue: (r) => r.verdict,
                        render: (r) => (
                          <span
                            className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${VERDICT_STYLE[r.verdict] ?? VERDICT_STYLE.Unknown}`}
                          >
                            {r.verdict}
                          </span>
                        ),
                      },
                    ] as DataTableColumn<AvResult>[]
                  }
                  rows={data.avResults}
                  rowKey={(r, i) => `${r.engine}-${i}`}
                  className="-mx-4"
                />
              ) : (
                <p className="text-sm text-muted py-2">No AV results found for this hash.</p>
              )}
            </section>

            {data.requestTimestamp && (
              <div className="text-center text-micro text-muted">
                Lookup timestamp: {new Date(data.requestTimestamp * 1000).toISOString()}
              </div>
            )}
          </div>
        )}

        <div className="text-center pt-6 pb-2 text-xs text-muted border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Powered by{' '}
          <a
            href="https://traceix.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            traceix.com
          </a>{' '}
          - a project of{' '}
          <a
            href="https://perkinsfund.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            Perkins Fund (PCEF)
          </a>
          , a 501(c)(3) nonprofit.
          <br />
          API docs at{' '}
          <a
            href="https://docs.perkinsfund.org/readme/traceix-endpoints/traceix.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            docs.perkinsfund.org
          </a>
        </div>
      </div>
    </DataPageLayout>
  );
}

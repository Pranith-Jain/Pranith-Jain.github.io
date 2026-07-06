import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Search, Shield, Hash, Loader2, AlertTriangle } from 'lucide-react';

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
      backTo="/"
      backLabel="Home"
      icon={<Shield />}
      title="Traceix Hash Lookup"
      description={
        <span>
          Look up a SHA-256 file hash against{' '}
          <a href="https://traceix.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            traceix.com
          </a>{' '}
          — antivirus/reputation results powered by{' '}
          <a href="https://perkinsfund.org" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            Perkins Fund (PCEF)
          </a>
          .
        </span>
      }
      accentClass="text-cyan-400"
    >
      <div className="space-y-6 max-w-2xl mx-auto">
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Enter a SHA-256 hash (64 hex characters)"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-400"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !/^[0-9a-f]{64}$/i.test(hash.trim())}
              className="px-4 py-2 rounded bg-cyan-700 hover:bg-cyan-600 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white font-mono text-sm disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {loading ? 'looking up…' : 'lookup'}
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="text-micro font-mono text-slate-400 dark:text-slate-400 self-center mr-1">samples:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.hash}
                type="button"
                onClick={() => { setHash(s.hash); setSubmittedHash(s.hash); }}
                className="text-mini font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-cyan-500/40 hover:text-cyan-600 dark:hover:text-cyan-400"
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 size={20} className="animate-spin mr-3" />
            Looking up hash...
          </div>
        )}

        {error && !loading && (
          <p className="text-sm font-mono text-rose-600 dark:text-rose-400 mb-4 inline-flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </p>
        )}

        {data && !loading && (
          <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
                Summary
              </h2>
              <div className="flex gap-6">
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{safeCount}</div>
                  <div className="text-mini font-mono text-slate-400 dark:text-slate-400">Safe</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{maliciousCount}</div>
                  <div className="text-mini font-mono text-slate-400 dark:text-slate-400">Malicious</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.avResults.length}</div>
                  <div className="text-mini font-mono text-slate-400 dark:text-slate-400">Engines</div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
                Engine Results ({data.avResults.length})
              </h2>
              {data.avResults.length > 0 ? (
                <div className="overflow-x-auto -mx-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                        <th className="text-left px-4 py-2 font-mono text-mini uppercase tracking-wider text-muted">Engine</th>
                        <th className="text-left px-4 py-2 font-mono text-mini uppercase tracking-wider text-muted">Type</th>
                        <th className="text-right px-4 py-2 font-mono text-mini uppercase tracking-wider text-muted">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.avResults.map((r, i) => (
                        <tr key={i} className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] last:border-0">
                          <td className="px-4 py-2 text-sm text-slate-900 dark:text-slate-100 font-medium">{r.engine}</td>
                          <td className="px-4 py-2 text-mini text-muted">{r.engine_type}</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${VERDICT_STYLE[r.verdict] ?? VERDICT_STYLE.Unknown}`}>
                              {r.verdict}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
          <a href="https://traceix.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            traceix.com
          </a>{' '}
          — a project of{' '}
          <a href="https://perkinsfund.org" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            Perkins Fund (PCEF)
          </a>
          , a 501(c)(3) nonprofit.<br />
          API docs at{' '}
          <a href="https://docs.perkinsfund.org/readme/traceix-endpoints/traceix.md" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            docs.perkinsfund.org
          </a>
        </div>
      </div>
    </DataPageLayout>
  );
}

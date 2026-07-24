import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Hash, RefreshCw } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface DnsResult {
  domain: string;
  a?: string[];
  aaaa?: string[];
  mx?: Array<{ host: string; priority: number }>;
  ns?: string[];
  txt?: string[];
  soa?: { mname: string; rname: string; serial: number };
  cname?: string[];
}

export default function DnsInvestigation() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [result, setResult] = useState<DnsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/v1/intodns?domain=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        setError('DNS lookup failed.');
      }
    } catch {
      setError('Network error.');
    }
    setLoading(false);
  };

  return (
    <>
      <PageMeta title="DNS Investigation" description="DNS record lookup and analysis." canonicalPath="/osint/dns" />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/osint"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50"
              >
                <ArrowLeft size={16} className="text-slate-600" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center">
                <Hash size={20} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">DNS Investigation</h1>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter domain"
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? 'Looking up...' : 'Lookup'}
              </button>
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          {error && (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm mb-4">{error}</div>
          )}
          {loading && (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          )}
          {result && (
            <div className="space-y-4">
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">{result.domain}</h2>
                {result.a && result.a.length > 0 && (
                  <div className="mb-3">
                    <label className="text-micro font-mono uppercase text-slate-400">A Records</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {result.a.map((a) => (
                        <span
                          key={a}
                          className="px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] rounded"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.ns && result.ns.length > 0 && (
                  <div className="mb-3">
                    <label className="text-micro font-mono uppercase text-slate-400">NS Records</label>
                    <div className="space-y-1 mt-1">
                      {result.ns.map((ns) => (
                        <p key={ns} className="font-mono text-sm text-slate-700 dark:text-slate-300">
                          {ns}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {result.mx && result.mx.length > 0 && (
                  <div className="mb-3">
                    <label className="text-micro font-mono uppercase text-slate-400">MX Records</label>
                    <div className="space-y-1 mt-1">
                      {result.mx.map((mx) => (
                        <p key={mx.host} className="font-mono text-sm text-slate-700 dark:text-slate-300">
                          {mx.host} ({mx.priority})
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {result.txt && result.txt.length > 0 && (
                  <div>
                    <label className="text-micro font-mono uppercase text-slate-400">TXT Records</label>
                    <div className="space-y-1 mt-1">
                      {result.txt.map((t, i) => (
                        <p key={i} className="font-mono text-xs text-slate-600 dark:text-slate-400 break-all">
                          {t}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Search, Shield, XCircle } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface CheckResult {
  indicator: string;
  type: string;
  malicious: boolean;
  confidence: number;
  sources: Array<{ name: string; malicious: boolean; confidence: number }>;
  tags: string[];
  country?: string;
  asn?: string;
  lastSeen?: string;
}

export default function ReputationCheck() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheck = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/v1/ioc/check?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        setError('Check failed — try a different indicator.');
      }
    } catch {
      setError('Network error.');
    }
    setLoading(false);
  };

  return (
    <>
      <PageMeta
        title="IP & IOC Reputation Check"
        description="Check any IP, domain, or hash against 1.6M+ IoCs."
        canonicalPath="/cti/check"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center">
            <Link to="/cti" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
              <ArrowLeft size={14} /> Back to Command Center
            </Link>
            <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
              <Shield size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">IP & IOC Reputation Check</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-8">
              Check any IP address, domain, or file hash against 1.6M+ indicators of compromise.
            </p>

            <div className="flex gap-2 max-w-xl mx-auto">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
                  placeholder="Enter IP, domain, MD5, SHA-1, or SHA-256..."
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <button
                onClick={handleCheck}
                disabled={loading || !query.trim()}
                className="px-6 py-3 rounded-lg bg-brand-600 text-white font-medium text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Checking...' : 'Check'}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {error && (
            <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
              <XCircle size={16} /> {error}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div
                className={`p-6 rounded-xl border-2 ${result.malicious ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-700' : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700'}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  {result.malicious ? (
                    <XCircle size={24} className="text-rose-600" />
                  ) : (
                    <CheckCircle size={24} className="text-emerald-600" />
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {result.malicious ? 'Malicious' : 'Clean'}
                    </h2>
                    <p className="text-sm text-slate-500">{result.indicator}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400">Type</label>
                    <p className="font-mono">{result.type}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400">Confidence</label>
                    <p className="font-mono">{(result.confidence * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400">Sources</label>
                    <p className="font-mono">{result.sources?.length || 0}</p>
                  </div>
                </div>
              </div>

              {result.sources && result.sources.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Source Breakdown
                  </h3>
                  <div className="space-y-2">
                    {result.sources.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0"
                      >
                        <span className="text-sm text-slate-700 dark:text-slate-300">{s.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono ${s.malicious ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}
                        >
                          {s.malicious ? 'Malicious' : 'Clean'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.tags && result.tags.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-600 dark:text-slate-400 rounded"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

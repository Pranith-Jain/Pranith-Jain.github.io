import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail, RefreshCw, Shield } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface EmailResult {
  email: string;
  valid: boolean;
  disposable: boolean;
  provider?: string;
  breaches?: Array<{ name: string; date: string; records: number }>;
  socialProfiles?: Array<{ platform: string; url: string }>;
}

export default function EmailInvestigation() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [result, setResult] = useState<EmailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/v1/email-reputation?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        setError('Lookup failed.');
      }
    } catch {
      setError('Network error.');
    }
    setLoading(false);
  };

  return (
    <>
      <PageMeta
        title="Email Investigation"
        description="Email validation, breach checks, and social profile lookup."
        canonicalPath="/osint/email"
      />
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
              <div className="w-10 h-10 rounded-lg bg-amber-600 flex items-center justify-center">
                <Mail size={20} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Email Investigation</h1>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter email address"
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? 'Looking up...' : 'Investigate'}
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
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <Mail size={18} /> {result.email}
                </h2>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400">Valid</label>
                    <p className={result.valid ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                      {result.valid ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400">Disposable</label>
                    <p
                      className={
                        result.disposable ? 'text-amber-600 font-semibold' : 'text-slate-700 dark:text-slate-300'
                      }
                    >
                      {result.disposable ? 'Yes' : 'No'}
                    </p>
                  </div>
                  {result.provider && (
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">Provider</label>
                      <p className="text-slate-700 dark:text-slate-300">{result.provider}</p>
                    </div>
                  )}
                </div>
              </div>
              {result.breaches && result.breaches.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5">
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                    <Shield size={12} /> Breach History
                  </h3>
                  <div className="space-y-2">
                    {result.breaches.map((b) => (
                      <div
                        key={b.name}
                        className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0"
                      >
                        <span className="text-sm text-slate-700 dark:text-slate-300">{b.name}</span>
                        <span className="text-xs text-slate-400">
                          {b.date} · {b.records.toLocaleString()} records
                        </span>
                      </div>
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

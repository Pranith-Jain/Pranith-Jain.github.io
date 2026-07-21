import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Search, User } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface UsernameResult {
  username: string;
  found: Array<{ platform: string; url: string; status: string }>;
  notFound: string[];
}

export default function UsernameOsint() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [result, setResult] = useState<UsernameResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/v1/username-osint?q=${encodeURIComponent(query.trim())}`);
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
        title="Username OSINT"
        description="Check a username across 400+ platforms."
        canonicalPath="/osint/username"
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
              <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center">
                <User size={20} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Username OSINT</h1>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter username"
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Search'}
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
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">@{result.username}</h2>
                <p className="text-sm text-slate-500">
                  {result.found.length} profiles found · {result.notFound.length} not found
                </p>
              </div>
              {result.found.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5">
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Found On
                  </h3>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {result.found.map((f) => (
                      <a
                        key={f.platform}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
                      >
                        <span className="text-sm text-slate-700 dark:text-slate-300">{f.platform}</span>
                        <ExternalLink size={12} className="text-slate-400" />
                      </a>
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

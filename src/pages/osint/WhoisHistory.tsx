import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface WhoisResult {
  domain: string;
  registrar?: string;
  registrationDate?: string;
  expirationDate?: string;
  updatedDate?: string;
  nameServers?: string[];
  status?: string[];
  registrant?: { name?: string; organization?: string; country?: string; email?: string };
}

export default function WhoisHistory() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [result, setResult] = useState<WhoisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/v1/whois-history?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        setError('WHOIS lookup failed.');
      }
    } catch {
      setError('Network error.');
    }
    setLoading(false);
  };

  return (
    <>
      <PageMeta
        title="WHOIS History"
        description="Historical WHOIS records and registrant changes."
        canonicalPath="/osint/whois"
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
              <div className="w-10 h-10 rounded-lg bg-pink-600 flex items-center justify-center">
                <FileText size={20} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">WHOIS History</h1>
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
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">{result.domain}</h2>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                {result.registrar && (
                  <div>
                    <label className="text-micro font-mono uppercase text-slate-400">Registrar</label>
                    <p className="text-slate-700 dark:text-slate-300">{result.registrar}</p>
                  </div>
                )}
                {result.registrationDate && (
                  <div>
                    <label className="text-micro font-mono uppercase text-slate-400">Registered</label>
                    <p className="text-slate-700 dark:text-slate-300">{result.registrationDate}</p>
                  </div>
                )}
                {result.expirationDate && (
                  <div>
                    <label className="text-micro font-mono uppercase text-slate-400">Expires</label>
                    <p className="text-slate-700 dark:text-slate-300">{result.expirationDate}</p>
                  </div>
                )}
                {result.updatedDate && (
                  <div>
                    <label className="text-micro font-mono uppercase text-slate-400">Last Updated</label>
                    <p className="text-slate-700 dark:text-slate-300">{result.updatedDate}</p>
                  </div>
                )}
              </div>
              {result.registrant && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Registrant
                  </h3>
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    {result.registrant.name && (
                      <div>
                        <label className="text-micro font-mono uppercase text-slate-400">Name</label>
                        <p className="text-slate-700 dark:text-slate-300">{result.registrant.name}</p>
                      </div>
                    )}
                    {result.registrant.organization && (
                      <div>
                        <label className="text-micro font-mono uppercase text-slate-400">Organization</label>
                        <p className="text-slate-700 dark:text-slate-300">{result.registrant.organization}</p>
                      </div>
                    )}
                    {result.registrant.country && (
                      <div>
                        <label className="text-micro font-mono uppercase text-slate-400">Country</label>
                        <p className="text-slate-700 dark:text-slate-300">{result.registrant.country}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {result.nameServers && result.nameServers.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Name Servers
                  </h3>
                  <div className="space-y-1">
                    {result.nameServers.map((ns) => (
                      <p key={ns} className="font-mono text-sm text-slate-700 dark:text-slate-300">
                        {ns}
                      </p>
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

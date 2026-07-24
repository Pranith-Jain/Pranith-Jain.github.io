import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Phone, RefreshCw } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface PhoneResult {
  number: string;
  valid: boolean;
  country?: string;
  carrier?: string;
  lineType?: string;
}

export default function PhoneInvestigation() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [result, setResult] = useState<PhoneResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/v1/phone-osint?q=${encodeURIComponent(query.trim())}`);
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
        title="Phone OSINT"
        description="Phone number validation, carrier lookup, and line type detection."
        canonicalPath="/osint/phone"
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
              <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center">
                <Phone size={20} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Phone OSINT</h1>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter phone number (e.g., +1 555 123 4567)"
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
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <Phone size={18} /> {result.number}
              </h2>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-micro font-mono uppercase text-slate-400">Valid</label>
                  <p className={result.valid ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                    {result.valid ? 'Yes' : 'No'}
                  </p>
                </div>
                {result.country && (
                  <div>
                    <label className="text-micro font-mono uppercase text-slate-400">Country</label>
                    <p className="text-slate-700 dark:text-slate-300">{result.country}</p>
                  </div>
                )}
                {result.carrier && (
                  <div>
                    <label className="text-micro font-mono uppercase text-slate-400">Carrier</label>
                    <p className="text-slate-700 dark:text-slate-300">{result.carrier}</p>
                  </div>
                )}
                {result.lineType && (
                  <div>
                    <label className="text-micro font-mono uppercase text-slate-400">Line Type</label>
                    <p className="text-slate-700 dark:text-slate-300">{result.lineType}</p>
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

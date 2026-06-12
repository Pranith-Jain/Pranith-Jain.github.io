import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { ArrowLeft, Target, Globe, Building2, TrendingUp, ExternalLink, RefreshCw } from 'lucide-react';

interface CategoryStat {
  key: string;
  label: string;
  count: number;
  description: string;
}

interface TopBrand {
  brand: string;
  count: number;
}

interface OverviewStats {
  detections_total: number;
  brands_detected: number;
  categories: CategoryStat[];
  top_brands: TopBrand[];
}

interface OverviewResponse {
  generated_at: string;
  stats: OverviewStats;
}

const CATEGORY_COLORS: Record<string, string> = {
  finance: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  cryptocurrency: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  application: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  ecommerce: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'social-media': 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  email: 'border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  entertainment: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  government: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  telecom: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  gaming: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  logistics: 'border-stone-500/40 bg-stone-500/10 text-stone-700 dark:text-stone-300',
  travel: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  other: 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-400',
};

export default function PhishingDashboard(): JSX.Element {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    let cancelled = false;
    const ctrl = new AbortController();
    fetch('/api/v1/phishing-overview', { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<OverviewResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  };

  useEffect(fetchData, []);

  const stats = data?.stats;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
            <Target size={28} className="text-brand-600 dark:text-brand-400" /> Phishing Dashboard
          </h1>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
          </button>
        </div>
        <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-3xl leading-relaxed">
          Live phishing intelligence aggregated from{' '}
          <a
            href="https://openphish.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            OpenPhish
          </a>{' '}
          and{' '}
          <a
            href="https://phishtank.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            PhishTank
          </a>
          . Covers <strong>80+ brands</strong> across finance, cryptocurrency, SaaS, e-commerce, and more. Updated
          hourly.
        </p>
      </div>

      <DataState loading={loading} error={error} rows={8} onRetry={fetchData}>
        {stats && (
          <div className="space-y-8 animate-fade-in-up">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1">Active detections</p>
                <p className="text-2xl font-bold font-display">{stats.detections_total.toLocaleString()}</p>
                <p className="text-mini text-slate-400 mt-0.5">live phishing URLs</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1">Brands targeted</p>
                <p className="text-2xl font-bold font-display">{stats.brands_detected}</p>
                <p className="text-mini text-slate-400 mt-0.5">unique brands</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1">Categories</p>
                <p className="text-2xl font-bold font-display">{stats.categories.filter((c) => c.count > 0).length}</p>
                <p className="text-mini text-slate-400 mt-0.5">sectors impacted</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1">Sources</p>
                <p className="text-2xl font-bold font-display">2</p>
                <p className="text-mini text-slate-400 mt-0.5">OpenPhish + PhishTank</p>
              </div>
            </div>

            {/* Category breakdown */}
            <section>
              <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400 font-mono mb-4 flex items-center gap-2">
                <Building2 size={16} /> Categories targeted
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {stats.categories
                  .filter((c) => c.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .map((c) => (
                    <div
                      key={c.key}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-3 flex items-center justify-between"
                    >
                      <div>
                        <span
                          className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[c.key] ?? CATEGORY_COLORS.other}`}
                        >
                          {c.label}
                        </span>
                        <p className="text-mini text-slate-500 dark:text-slate-400 mt-1">{c.description}</p>
                      </div>
                      <span className="text-lg font-bold font-display text-slate-900 dark:text-slate-100 ml-3">
                        {c.count}
                      </span>
                    </div>
                  ))}
              </div>
            </section>

            {/* Top brands */}
            <section>
              <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400 font-mono mb-4 flex items-center gap-2">
                <TrendingUp size={16} /> Most-targeted brands
              </h2>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-micro font-mono uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-2.5 font-medium">#</th>
                      <th className="px-4 py-2.5 font-medium">Brand</th>
                      <th className="px-4 py-2.5 font-medium text-right">Detections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_brands.map((b, i) => (
                      <tr
                        key={b.brand}
                        className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="px-4 py-2.5 text-mini font-mono text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2.5 font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {b.brand}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-sm">{b.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Quick links */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-5">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 flex items-center gap-2">
                <ExternalLink size={13} /> Related resources
              </h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Phishing Monitor', href: '/dfir/phishing' },
                  { label: 'Phishing URLs (raw)', href: '/api/v1/phishing-urls' },
                  { label: 'Phishing Wordlists', href: '/threatintel/phishing-wordlists' },
                  { label: 'Live IOCs', href: '/threatintel/live-iocs' },
                  { label: 'Threat Hunt', href: '/dfir/threat-hunt' },
                  { label: 'Phishing Fingerprint', href: '/dfir/phishing-fingerprint' },
                  { label: 'Domain Lookup', href: '/dfir/domain' },
                  { label: 'Email Reputation', href: '/dfir/email-rep' },
                  { label: 'Secure Headers', href: '/dfir/headers' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className="text-mini font-mono px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </DataState>
    </div>
  );
}

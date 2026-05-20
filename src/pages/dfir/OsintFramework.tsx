import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Compass, ExternalLink, Search } from 'lucide-react';
import { ENTRIES, CATEGORY_LABELS, type Category, type Pricing } from '../../data/osint-framework';

const PRICING_STYLES: Record<Pricing, string> = {
  free: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'free-account': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  freemium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  paid: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const PRICING_LABELS: Record<Pricing, string> = {
  free: 'free',
  'free-account': 'free w/ account',
  freemium: 'freemium',
  paid: 'paid',
};

export default function OsintFramework(): JSX.Element {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [pricingFilter, setPricingFilter] = useState<Pricing | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ENTRIES.filter((e) => {
      if (category !== 'all' && e.category !== category) return false;
      if (pricingFilter !== 'all' && e.pricing !== pricingFilter) return false;
      if (!q) return true;
      const hay = `${e.name} ${e.description} ${CATEGORY_LABELS[e.category]}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [query, category, pricingFilter]);

  const categoryCounts = useMemo(() => {
    const out: Record<Category, number> = Object.fromEntries(
      (Object.keys(CATEGORY_LABELS) as Category[]).map((c) => [c, 0])
    ) as Record<Category, number>;
    for (const e of ENTRIES) out[e.category]++;
    return out;
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Compass size={28} className="text-brand-600 dark:text-brand-400" /> OSINT Framework
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
          {ENTRIES.length} curated OSINT tools and sources across {Object.keys(CATEGORY_LABELS).length} categories.
          Filter by category, by pricing tier (free / free-with-account / freemium / paid), or full-text search.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-6">
          Hand-picked subset of osintframework.com — every entry was reachable when added. Pairs with{' '}
          <Link to="/dfir/username" className="text-brand-600 dark:text-brand-400 hover:underline">
            Username Pivot
          </Link>
          ,{' '}
          <Link to="/dfir/wayback" className="text-brand-600 dark:text-brand-400 hover:underline">
            Wayback Machine Pivot
          </Link>
          , and{' '}
          <Link to="/dfir/socmint" className="text-brand-600 dark:text-brand-400 hover:underline">
            SOCMINT Pivots
          </Link>
          .
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, description, or category — e.g. crypto, breach, court, image"
            className="w-full pl-9 pr-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-sm focus:border-brand-500/60 focus:outline-none"
            aria-label="Search OSINT framework"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 self-center mr-1">
            Pricing
          </span>
          <button
            onClick={() => setPricingFilter('all')}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              pricingFilter === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
            }`}
          >
            All
          </button>
          {(['free', 'free-account', 'freemium', 'paid'] as Pricing[]).map((p) => {
            const count = ENTRIES.filter((e) => e.pricing === p).length;
            if (count === 0) return null;
            return (
              <button
                key={p}
                onClick={() => setPricingFilter(p)}
                className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                  pricingFilter === p
                    ? PRICING_STYLES[p]
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
                }`}
              >
                {PRICING_LABELS[p]} <span className="opacity-60">· {count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 self-center mr-1">
            Category
          </span>
          <button
            onClick={() => setCategory('all')}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              category === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
            }`}
          >
            All
          </button>
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => {
            if (categoryCounts[c] === 0) return null;
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                  category === c
                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
                }`}
              >
                {CATEGORY_LABELS[c]} <span className="opacity-60">· {categoryCounts[c]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-500 mb-3">
        Showing {filtered.length} of {ENTRIES.length}
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => (
          <article
            key={e.id}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
          >
            <header className="flex flex-wrap items-baseline gap-2 mb-1">
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
              >
                {e.name} <ExternalLink size={11} />
              </a>
              <span
                className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${PRICING_STYLES[e.pricing]}`}
              >
                {PRICING_LABELS[e.pricing]}
              </span>
            </header>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 mb-1">
              {CATEGORY_LABELS[e.category]}
            </p>
            <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{e.description}</p>
          </article>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500 dark:text-slate-500">
            No entries match those filters. Try clearing the search or relaxing the category filter.
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Github, Search, BookText, Lock, Star, Plug } from 'lucide-react';
import {
  RESOURCES,
  CATEGORY_LABELS,
  CATEGORY_BLURB,
  PRICING_LABELS,
  type Category,
  type Pricing,
} from '../../data/dfir/cve-resources-catalog';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const ALL_PRICING: Pricing[] = ['open-source', 'free', 'freemium', 'paid'];

const CATEGORY_PILL: Record<Category, string> = {
  database: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  'exploit-poc': 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  'vendor-psirt': 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'scoring-prioritization': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'research-tracker': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'alert-feed': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

const PRICING_PILL: Record<Pricing, string> = {
  'open-source': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  free: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  freemium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  paid: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

export default function CveResourcesCatalog(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const initialCats = (searchParams.get('cat')?.split(',').filter(Boolean) ?? []) as Category[];
  const initialPricing = (searchParams.get('price')?.split(',').filter(Boolean) ?? []) as Pricing[];
  const [activeCats, setActiveCats] = useState<Set<Category>>(new Set(initialCats));
  const [activePricing, setActivePricing] = useState<Set<Pricing>>(new Set(initialPricing));

  // Sync filters → URL so a curated view is shareable.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (activeCats.size > 0) out.set('cat', [...activeCats].join(','));
        else out.delete('cat');
        if (activePricing.size > 0) out.set('price', [...activePricing].join(','));
        else out.delete('price');
        return out;
      },
      { replace: true }
    );
  }, [query, activeCats, activePricing, setSearchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RESOURCES.filter((r) => {
      if (activeCats.size > 0 && !r.categories.some((c) => activeCats.has(c))) return false;
      if (activePricing.size > 0 && !activePricing.has(r.pricing)) return false;
      if (!q) return true;
      const hay =
        `${r.name} ${r.description} ${r.categories.join(' ')} ${r.badge ?? ''} ${r.consumedBy ?? ''}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [query, activeCats, activePricing]);

  const catCounts = useMemo(() => {
    const map = new Map<Category, number>();
    for (const r of filtered) for (const c of r.categories) map.set(c, (map.get(c) ?? 0) + 1);
    return map;
  }, [filtered]);

  const toggleCat = (c: Category) =>
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const togglePricing = (p: Pricing) =>
    setActivePricing((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const clearAll = () => {
    setQuery('');
    setActiveCats(new Set());
    setActivePricing(new Set());
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <BookText size={28} className="text-brand-600 dark:text-brand-400" /> CVE Resources Catalog
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          {RESOURCES.length} hand-picked CVE resources across {ALL_CATEGORIES.length} categories. Right tool for the
          right question — "what is this CVE?" / "is there an exploit?" / "what's the patch?" / "should I patch NOW?" /
          "who's writing about it?" / "tell me when something hits".
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          For the broader SecOps surface (DFIR, threat intel, malware analysis, AI sec, etc):{' '}
          <Link to="/threatintel/secops-tools" className="text-brand-600 dark:text-brand-400 hover:underline">
            SecOps Tools Catalog
          </Link>
          . For per-CVE lookups:{' '}
          <Link to="/dfir/cve" className="text-brand-600 dark:text-brand-400 hover:underline">
            CVE Lookup
          </Link>{' '}
          (NVD + CVSS + EPSS + KEV in one query).
        </p>
      </div>

      {/* Search + pricing toggles */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, description, category — e.g. 'wordpress', 'cisco', 'rss', 'kev'"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search CVE resources"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-[11px] font-mono text-slate-500 mr-1">pricing:</span>
          {ALL_PRICING.map((p) => {
            const active = activePricing.has(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePricing(p)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${active ? PRICING_PILL[p] : 'border-slate-300 dark:border-slate-700 text-slate-500'}`}
              >
                {p === 'paid' && <Lock size={9} className="inline mr-0.5" />}
                {PRICING_LABELS[p]}
              </button>
            );
          })}
          {(query || activeCats.size > 0 || activePricing.size > 0) && (
            <button
              type="button"
              onClick={clearAll}
              className="sm:ml-auto text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              clear filters
            </button>
          )}
        </div>
      </section>

      {/* Category pills */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-500 mr-1">categories:</span>
          {ALL_CATEGORIES.map((c) => {
            const count = catCounts.get(c) ?? 0;
            const active = activeCats.has(c);
            const cls = active ? CATEGORY_PILL[c] : 'border-slate-300 dark:border-slate-700 text-slate-500';
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCat(c)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${cls} ${count === 0 ? 'opacity-30' : ''}`}
                title={CATEGORY_BLURB[c]}
                disabled={count === 0 && !active}
              >
                {CATEGORY_LABELS[c]} <span className="opacity-70">· {count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-4">
        Showing {filtered.length} of {RESOURCES.length}
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
              >
                {r.name} <ExternalLink size={12} className="opacity-60" />
              </a>
              <span
                className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${PRICING_PILL[r.pricing]}`}
              >
                {r.pricing === 'paid' && <Lock size={9} className="inline mr-0.5" />}
                {PRICING_LABELS[r.pricing]}
              </span>
            </div>
            {(r.badge || r.consumedBy) && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                {r.badge && (
                  <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30 inline-flex items-center gap-1">
                    <Star size={9} /> {r.badge}
                  </span>
                )}
                {r.consumedBy && (
                  <Link
                    to={r.consumedBy}
                    className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1 hover:bg-emerald-500/20"
                    title={`This resource is wired into ${r.consumedBy}`}
                  >
                    <Plug size={9} /> wired into {r.consumedBy}
                  </Link>
                )}
              </div>
            )}
            <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
              {r.description}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {r.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCat(c)}
                  className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${CATEGORY_PILL[c]}`}
                  title={`Filter by ${CATEGORY_LABELS[c]}`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
              {r.source_url && (
                <a
                  href={r.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm:ml-auto inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                  title="Source repository"
                >
                  <Github size={10} /> source
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="text-sm font-mono text-slate-500 dark:text-slate-500 mt-6">
          Nothing matches the current filters.{' '}
          <button onClick={clearAll} className="underline text-brand-600 dark:text-brand-400">
            Clear all
          </button>
          ?
        </p>
      )}

      <RelatedWikiArticles />
    </div>
  );
}

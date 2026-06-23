import { useEffect, useMemo, useState } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Github, Search, Globe, Star } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  TOOLS,
  CATEGORY_LABELS,
  CATEGORY_BLURB,
  CATEGORY_PILL,
  type DarkWebCategory,
} from '../../data/threatintel/darkweb-osint-tools';

const ALL_CATS = Object.keys(CATEGORY_LABELS) as DarkWebCategory[];

export default function DarkWebOsintTools(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const initialCats = (searchParams.get('cat')?.split(',').filter(Boolean) ?? []) as DarkWebCategory[];
  const [activeCats, setActiveCats] = useState<Set<DarkWebCategory>>(new Set(initialCats));

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (activeCats.size > 0) out.set('cat', [...activeCats].join(','));
        else out.delete('cat');
        return out;
      },
      { replace: true }
    );
  }, [query, activeCats, setSearchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((t) => {
      if (activeCats.size > 0 && !activeCats.has(t.category)) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.description} ${t.category} ${t.badge ?? ''}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [query, activeCats]);

  const catCounts = useMemo(() => {
    const map = new Map<DarkWebCategory, number>();
    for (const t of filtered) map.set(t.category, (map.get(t.category) ?? 0) + 1);
    return map;
  }, [filtered]);

  const toggleCat = (c: DarkWebCategory) =>
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const clearAll = () => {
    setQuery('');
    setActiveCats(new Set());
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Globe size={28} />}
      title="Dark Web OSINT Tools"
      maxWidthClass="max-w-6xl"
      description={
        <>
          <span className="block mb-2">
            {TOOLS.length} curated tools across {ALL_CATS.length} categories for investigating the dark web. Each entry
            has a clear primary use case, source link, and honest description of what it does.
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400 font-mono">
            Curated from the{' '}
            <a
              href="https://github.com/apurvsinghgautam/dark-web-osint-tools"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              dark-web-osint-tools
            </a>{' '}
            repository with additional sources and cross-references. See also{' '}
            <a
              href="https://github.com/apurvsinghgautam/robin"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              Robin
            </a>{' '}
            — an AI-powered dark-web investigation tool built on top of these engines.
          </span>
        </>
      }
      headerExtra={
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools — e.g. 'crawler', 'ahmia', 'onion scan'"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                aria-label="Search dark web OSINT tools"
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-mini font-mono text-slate-500 mr-1">categories:</span>
              {ALL_CATS.map((c) => {
                const count = catCounts.get(c) ?? 0;
                const active = activeCats.has(c);
                const cls = active
                  ? CATEGORY_PILL[c]
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500';
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCat(c)}
                    className={`text-mini font-mono px-2 py-1 rounded border ${cls} ${count === 0 ? 'opacity-30' : ''}`}
                    title={CATEGORY_BLURB[c]}
                    disabled={count === 0 && !active}
                  >
                    {CATEGORY_LABELS[c]} <span className="opacity-70">· {count}</span>
                  </button>
                );
              })}
              {(query || activeCats.size > 0) && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="sm:ml-auto text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline"
                >
                  clear filters
                </button>
              )}
            </div>
          </section>
        </div>
      }
    >
      <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-4">
        Showing {filtered.length} of {TOOLS.length}
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((t) => (
          <li
            key={t.id}
            className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <a
                href={sanitizeUrl(t.url) || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
              >
                {t.name} <ExternalLink size={12} className="opacity-60" />
              </a>
              <span
                className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${CATEGORY_PILL[t.category]}`}
              >
                {CATEGORY_LABELS[t.category]}
              </span>
            </div>
            {t.badge && (
              <div className="mb-1.5">
                <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30 inline-flex items-center gap-1">
                  <Star size={9} /> {t.badge}
                </span>
              </div>
            )}
            <p className="text-meta font-mono text-muted leading-relaxed mb-2">{t.description}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleCat(t.category)}
                className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${CATEGORY_PILL[t.category]}`}
                title={`Filter by ${CATEGORY_LABELS[t.category]}`}
              >
                {CATEGORY_LABELS[t.category]}
              </button>
              {t.source_url && (
                <a
                  href={sanitizeUrl(t.source_url) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm:ml-auto inline-flex items-center gap-1 text-micro font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
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
        <p className="text-sm font-mono text-slate-500 dark:text-slate-400 mt-6">
          Nothing matches the current filters.{' '}
          <button onClick={clearAll} className="underline text-brand-600 dark:text-brand-400">
            Clear all
          </button>
          ?
        </p>
      )}
    </DataPageLayout>
  );
}

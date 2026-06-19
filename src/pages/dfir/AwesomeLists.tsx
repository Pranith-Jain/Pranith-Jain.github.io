import { useEffect, useMemo, useState } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Github, Search, Star, Sparkles } from 'lucide-react';
import {
  LISTS,
  FOCUS_LABELS,
  FOCUS_BLURB,
  FOCUS_PILL,
  BADGE_PILL,
  type AwesomeFocus,
} from '../../data/dfir/awesome-lists';

const ALL_FOCUS = Object.keys(FOCUS_LABELS) as AwesomeFocus[];

export default function AwesomeLists(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const initialFocus = (searchParams.get('focus')?.split(',').filter(Boolean) ?? []) as AwesomeFocus[];
  const [activeFocus, setActiveFocus] = useState<Set<AwesomeFocus>>(new Set(initialFocus));

  // Keep filter state in the URL so a curated view is shareable.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (activeFocus.size > 0) out.set('focus', [...activeFocus].join(','));
        else out.delete('focus');
        return out;
      },
      { replace: true }
    );
  }, [query, activeFocus, setSearchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LISTS.filter((r) => {
      if (activeFocus.size > 0 && !r.focus.some((f) => activeFocus.has(f))) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.repo} ${r.description} ${r.why} ${r.focus.join(' ')}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [query, activeFocus]);

  const focusCounts = useMemo(() => {
    const map = new Map<AwesomeFocus, number>();
    for (const r of filtered) for (const f of r.focus) map.set(f, (map.get(f) ?? 0) + 1);
    return map;
  }, [filtered]);

  const toggleFocus = (f: AwesomeFocus) =>
    setActiveFocus((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const clearAll = () => {
    setQuery('');
    setActiveFocus(new Set());
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Sparkles size={28} className="text-brand-600 dark:text-brand-400" /> Awesome Lists
        </h1>
        <p className="text-muted mb-2 max-w-3xl leading-relaxed">
          {LISTS.length} curated GitHub awesome-lists I cross-reference when building DFIR / CTI tradecraft. Each card
          opens the canonical README; the <em>why</em> line under each entry explains the niche it fills better than its
          peers.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Awesome-list READMEs decay; star count + the maintainer&apos;s commit cadence are freshness proxies, not
          guarantees. Verify a specific link before relying on it.
        </p>
      </div>

      {/* Search */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, owner, description (e.g. 'osint', 'mcp', 'incident response')"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search awesome-lists"
          />
        </div>
        {(query || activeFocus.size > 0) && (
          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={clearAll}
              className="text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              clear filters
            </button>
          </div>
        )}
      </section>

      {/* Focus pills */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-mini font-mono text-slate-500 mr-1">focus:</span>
          {ALL_FOCUS.map((f) => {
            const count = focusCounts.get(f) ?? 0;
            const active = activeFocus.has(f);
            const cls = active ? FOCUS_PILL[f] : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500';
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleFocus(f)}
                className={`text-mini font-mono px-2 py-1 rounded border ${cls} ${count === 0 ? 'opacity-30' : ''}`}
                title={FOCUS_BLURB[f]}
                disabled={count === 0 && !active}
              >
                {FOCUS_LABELS[f]} <span className="opacity-70">· {count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-4">
        Showing {filtered.length} of {LISTS.length}
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <a
                href={sanitizeUrl(r.url) || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
              >
                {r.name} <ExternalLink size={12} className="opacity-60" />
              </a>
              <span className="text-micro font-mono text-slate-500 inline-flex items-center gap-1 shrink-0">
                <Star size={10} /> {r.stars}
              </span>
            </div>
            <a
              href={sanitizeUrl(r.url) || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-mini font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1 mb-2"
            >
              <Github size={10} /> {r.repo}
            </a>
            {r.badge && (
              <div className="mb-1.5">
                <span
                  className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${BADGE_PILL[r.badge]}`}
                >
                  <Star size={9} /> {r.badge}
                </span>
              </div>
            )}
            <p className="text-meta font-mono text-muted leading-relaxed mb-2">{r.description}</p>
            <p className="text-meta font-mono italic text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              <span className="text-slate-400 dark:text-slate-600 not-italic">why:</span> {r.why}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {r.focus.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFocus(f)}
                  className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${FOCUS_PILL[f]}`}
                  title={`Filter by ${FOCUS_LABELS[f]}`}
                >
                  {FOCUS_LABELS[f]}
                </button>
              ))}
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
    </div>
  );
}

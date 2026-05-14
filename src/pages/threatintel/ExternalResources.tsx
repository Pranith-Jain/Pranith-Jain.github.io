import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Compass, ExternalLink, Search } from 'lucide-react';
import {
  RESOURCES,
  KIND_LABELS,
  KIND_BLURB,
  KIND_PILL,
  type ResourceKind,
} from '../../data/threatintel/external-resources';

const ALL_KINDS = Object.keys(KIND_LABELS) as ResourceKind[];

export default function ExternalResources(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  const initialKinds = (searchParams.get('kind')?.split(',').filter(Boolean) ?? []) as ResourceKind[];
  const [activeKinds, setActiveKinds] = useState<Set<ResourceKind>>(
    new Set(initialKinds.filter((k) => (ALL_KINDS as string[]).includes(k)))
  );

  // Keep filter state in the URL so a curated view is shareable.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (activeKinds.size > 0) out.set('kind', [...activeKinds].join(','));
        else out.delete('kind');
        return out;
      },
      { replace: true }
    );
  }, [query, activeKinds, setSearchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RESOURCES.filter((r) => {
      if (activeKinds.size > 0 && !activeKinds.has(r.kind)) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.description} ${r.why ?? ''}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [query, activeKinds]);

  const kindCounts = useMemo(() => {
    const map = new Map<ResourceKind, number>();
    for (const r of filtered) map.set(r.kind, (map.get(r.kind) ?? 0) + 1);
    return map;
  }, [filtered]);

  const toggleKind = (k: ResourceKind) =>
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const clearAll = () => {
    setQuery('');
    setActiveKinds(new Set());
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Compass size={28} className="text-brand-600 dark:text-brand-400" /> External Resources
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          {RESOURCES.length} off-site sources I cross-reference: dashboards, OSINT directories, training labs, malware
          samples, and research portfolios. Filter by kind or search across name and description.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          External sites change ownership and quality over time. Verify a specific link before relying on it.
        </p>
      </div>

      {/* Search */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, description (e.g. 'osint', 'ransomware', 'llm')"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search external resources"
          />
        </div>
        {(query || activeKinds.size > 0) && (
          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              clear filters
            </button>
          </div>
        )}
      </section>

      {/* Kind pills */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-500 mr-1">kind:</span>
          {ALL_KINDS.map((k) => {
            const count = kindCounts.get(k) ?? 0;
            const active = activeKinds.has(k);
            const cls = active ? KIND_PILL[k] : 'border-slate-300 dark:border-slate-700 text-slate-500';
            const isDisabled = count === 0 && !active;
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${cls} ${count === 0 ? 'opacity-30' : ''}`}
                title={isDisabled ? `${KIND_LABELS[k]} — no entries match the current search` : KIND_BLURB[k]}
                disabled={isDisabled}
                aria-pressed={active}
                aria-label={`Filter by ${KIND_LABELS[k]} (${count} ${count === 1 ? 'entry' : 'entries'})`}
              >
                {KIND_LABELS[k]} <span className="opacity-70">· {count}</span>
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
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
              >
                {r.name} <ExternalLink size={12} className="opacity-60" />
              </a>
              <button
                type="button"
                onClick={() => toggleKind(r.kind)}
                className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${KIND_PILL[r.kind]}`}
                title={`Filter by ${KIND_LABELS[r.kind]}`}
                aria-pressed={activeKinds.has(r.kind)}
                aria-label={`${KIND_LABELS[r.kind]} — toggle filter`}
              >
                {KIND_LABELS[r.kind]}
              </button>
            </div>
            <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
              {r.description}
            </p>
            {r.why && (
              <p className="text-[12px] font-mono italic text-slate-500 dark:text-slate-500 leading-relaxed">
                <span className="text-slate-400 dark:text-slate-600 not-italic">why:</span> {r.why}
              </p>
            )}
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="text-sm font-mono text-slate-500 dark:text-slate-500 mt-6">
          Nothing matches the current filters.{' '}
          <button type="button" onClick={clearAll} className="underline text-brand-600 dark:text-brand-400">
            Clear all
          </button>
          .
        </p>
      )}
    </div>
  );
}

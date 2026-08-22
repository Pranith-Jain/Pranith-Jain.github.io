import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AtSign, ExternalLink, Crosshair, Link2 } from 'lucide-react';
import { CopyChip } from '../../components/dfir/CopyButton';
import {
  EXPLORATORES_CATEGORIES,
  EXPLORATORES_TOTAL,
  EXPLORATORES_VERSION,
  buildExploratoresUrl,
  type ExploratoresCategory,
} from '../../data/dfir/exploratores-links';

const CATEGORY_ACCENT: Record<ExploratoresCategory, { dot: string; text: string; chip: string; ring: string }> = {
  social: {
    dot: 'bg-sky-500',
    text: 'text-sky-700 dark:text-sky-300',
    chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    ring: 'hover:border-sky-500/60 focus-visible:border-sky-500/60',
  },
  financial: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    ring: 'hover:border-emerald-500/60 focus-visible:border-emerald-500/60',
  },
  gaming: {
    dot: 'bg-violet-500',
    text: 'text-violet-700 dark:text-violet-300',
    chip: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    ring: 'hover:border-violet-500/60 focus-visible:border-violet-500/60',
  },
  availability: {
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    ring: 'hover:border-amber-500/60 focus-visible:border-amber-500/60',
  },
  'general-web': {
    dot: 'bg-brand-500',
    text: 'text-brand-700 dark:text-brand-300',
    chip: 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300',
    ring: 'hover:border-brand-500/60 focus-visible:border-brand-500/60',
  },
  security: {
    dot: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-300',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    ring: 'hover:border-rose-500/60 focus-visible:border-rose-500/60',
  },
  'public-records': {
    dot: 'bg-orange-500',
    text: 'text-orange-700 dark:text-orange-300',
    chip: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    ring: 'hover:border-orange-500/60 focus-visible:border-orange-500/60',
  },
  russia: {
    dot: 'bg-teal-500',
    text: 'text-teal-700 dark:text-teal-300',
    chip: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
    ring: 'hover:border-teal-500/60 focus-visible:border-teal-500/60',
  },
};

export default function ExploratoresBoard(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [username, setUsername] = useState(searchParams.get('u') ?? '');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExploratoresCategory>('all');

  const armed = username.trim().length > 0;

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (username.trim()) next.set('u', username.trim());
        else next.delete('u');
        return next;
      },
      { replace: true }
    );
  }, [username, setSearchParams]);

  const visibleCategories = useMemo(
    () =>
      categoryFilter === 'all'
        ? EXPLORATORES_CATEGORIES
        : EXPLORATORES_CATEGORIES.filter((c) => c.id === categoryFilter),
    [categoryFilter]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-heading">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Crosshair size={28} className="text-brand-600 dark:text-brand-400" /> Exploratores Pivot Board
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          {EXPLORATORES_TOTAL} manual OSINT pivots across {EXPLORATORES_CATEGORIES.length} surfaces — social, financial,
          gaming, breach, public-records, and RU platforms. Type a handle and every link arms itself with your target;
          each opens the service's own search or profile page so you can confirm a match by hand.
        </p>
        <p className="text-xs text-muted font-mono mb-8">
          Catalog from Exploratores v{EXPLORATORES_VERSION} (sosintops). Manual pivots complement the automated checks
          in Quick Pivot / Deep Scan — a registered handle isn't proof of identity, so verify via display name, photo,
          and post timing.
        </p>
      </div>

      {/* Console */}
      <section className="surface-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <AtSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={`target username — arms all ${EXPLORATORES_TOTAL} pivots`}
              className="w-full pl-9 pr-3 py-2.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] font-mono text-sm focus:border-brand-500/60 focus:outline-none transition-colors"
              aria-label="Target username"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div
            className={`inline-flex items-center gap-2 px-3 py-2 rounded border font-mono text-xs transition-colors ${
              armed
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted'
            }`}
            aria-live="polite"
          >
            <span className={`relative flex h-2 w-2 ${armed ? '' : 'opacity-40'}`} aria-hidden="true">
              {armed && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${armed ? 'bg-emerald-500' : 'bg-slate-400'}`}
              />
            </span>
            {armed ? `${EXPLORATORES_TOTAL} pivots armed` : 'standby — enter a handle'}
          </div>
          {armed && <CopyChip value={username.trim()} label="copy handle" />}
        </div>
      </section>

      {/* Category filter */}
      <section className="mb-6">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`text-mini font-mono px-2.5 py-1 rounded-full border transition-colors ${
              categoryFilter === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            All surfaces <span className="opacity-60">· {EXPLORATORES_TOTAL}</span>
          </button>
          {EXPLORATORES_CATEGORIES.map((c) => {
            const accent = CATEGORY_ACCENT[c.id];
            const active = categoryFilter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryFilter(active ? 'all' : c.id)}
                className={`inline-flex items-center gap-1.5 text-mini font-mono px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? accent.chip
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-slate-400'
                }`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${accent.dot}`} aria-hidden="true" />
                {c.label} <span className="opacity-60">· {c.links.length}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Link board */}
      <div className="space-y-8">
        {visibleCategories.map((cat, ci) => {
          const accent = CATEGORY_ACCENT[cat.id];
          return (
            <section
              key={cat.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(ci, 6) * 45}ms` }}
              aria-labelledby={`exploratores-${cat.id}`}
            >
              <div className="flex items-baseline gap-2.5 mb-1">
                <span className={`inline-block w-2 h-2 rounded-full self-center ${accent.dot}`} aria-hidden="true" />
                <h2 id={`exploratores-${cat.id}`} className={`font-display font-semibold text-lg ${accent.text}`}>
                  {cat.label}
                </h2>
                <span className="text-mini font-mono text-slate-400 dark:text-slate-500">{cat.links.length}</span>
              </div>
              <p className="text-xs text-muted mb-3 ml-[18px]">{cat.blurb}</p>

              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cat.links.map((link) => {
                  const needsUsername = link.template.includes('{username}');
                  const enabled = !needsUsername || armed;
                  const href = enabled ? buildExploratoresUrl(link, username.trim()) : undefined;
                  const inner = (
                    <>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{link.name}</span>
                        <ExternalLink
                          size={12}
                          className={`shrink-0 transition-transform ${enabled ? 'group-hover:translate-x-0.5 group-hover:-translate-y-0.5' : 'opacity-30'}`}
                          aria-hidden="true"
                        />
                      </span>
                      <span
                        className={`mt-1 block truncate font-mono text-micro transition-colors ${
                          enabled ? 'text-muted' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {enabled ? href : link.template.replace('{username}', '{ handle }').replace('{enddate}', '…')}
                      </span>
                    </>
                  );

                  return (
                    <li key={link.id}>
                      {enabled ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`group block rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-e2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${accent.ring}`}
                        >
                          {inner}
                        </a>
                      ) : (
                        <span
                          className="group block rounded-lg border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] bg-transparent px-3 py-2.5 opacity-55 cursor-not-allowed"
                          title="Enter a username above to arm this pivot"
                        >
                          {inner}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="mt-10 flex items-center gap-1.5 text-mini font-mono text-slate-400 dark:text-slate-500">
        <Link2 size={11} aria-hidden="true" />
        Pivots open in a new tab · links are URL-encoded · no data leaves your browser
      </p>
    </div>
  );
}

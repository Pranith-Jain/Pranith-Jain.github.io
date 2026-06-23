import { Link, useLocation } from 'react-router-dom';
import { Home, Terminal, ArrowRight, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { getSidebarForSection } from '../data/sidebar-nav';

/**
 * Slugs that used to live at /dfir/<slug> and moved to /threatintel/<slug>
 * in May 2026. The router aliases were removed to eliminate the duplicate
 * URL surface, but old bookmarks and search-engine links still land here.
 * We detect the old pattern and surface the canonical destination so the
 * 404 isn't a dead end for stale references.
 */
const MOVED_SLUGS: ReadonlySet<string> = new Set([
  'briefings',
  'darkweb',
  'onion-watch',
  'telegram-watch',
  'scam-watch',
  'tech-ai-news',
  'threat-feeds',
  'threat-map',
  'actors',
  'mitre',
  'rules',
  'cve-resources',
  'wiki',
  'secops-tools',
  'awesome-lists',
  'osint-framework',
]);

function detectMovedUrl(pathname: string): { from: string; to: string } | null {
  const match = /^\/dfir\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/i.exec(pathname);
  if (!match) return null;
  const [, topSlug, subSlug] = match;
  if (!topSlug || !MOVED_SLUGS.has(topSlug)) return null;
  const target = subSlug ? `/threatintel/${topSlug}/${subSlug}` : `/threatintel/${topSlug}`;
  return { from: pathname, to: target };
}

/**
 * Tiny Levenshtein-ish distance — for "did you mean" suggestions on
 * mistyped slugs. Two-row implementation: only the previous row is kept
 * in memory. Cost: O(len(a) * len(b)) with constant extra space, which
 * is fine for the <100 paths we ever compare against.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

interface Suggestion {
  href: string;
  label: string;
  distance: number;
}

function suggestSimilar(pathname: string, max = 2): Suggestion[] {
  const sidebar = getSidebarForSection(pathname);
  if (!sidebar) return [];
  const candidates: { href: string; label: string; slug: string }[] = [];
  for (const group of sidebar.groups) {
    for (const item of group.items) {
      candidates.push({
        href: item.href,
        label: item.label,
        slug: item.href.split('/').pop() ?? '',
      });
    }
  }
  const lastSeg = pathname.split('/').filter(Boolean).pop() ?? '';
  if (!lastSeg) return [];
  return candidates
    .map((c) => ({ href: c.href, label: c.label, distance: editDistance(lastSeg.toLowerCase(), c.slug.toLowerCase()) }))
    .filter((s) => s.distance > 0 && s.distance <= Math.max(3, Math.floor(lastSeg.length / 2)))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max);
}

export default function NotFound(): JSX.Element {
  const location = useLocation();
  const moved = detectMovedUrl(location.pathname);
  const sidebar = useMemo(() => getSidebarForSection(location.pathname), [location.pathname]);
  const suggestions = useMemo(() => suggestSimilar(location.pathname), [location.pathname]);
  const sectionHref = sidebar ? (sidebar.groups[0]?.items[0]?.href.split('/').slice(0, 2).join('/') ?? '/') : '/';
  const sectionName = sidebar?.sectionLabel ?? '';

  // Tell crawlers this is a dead end so they de-index the URL on their
  // next sweep. Without this Google keeps the URL in the index until
  // it crawls again, and a stale bookmark can keep a soft-404 in the
  // SERP for weeks.
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex,nofollow';
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up text-center">
        <div className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
          {moved ? '301 · Moved' : '404 · Not Found'}
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-4">
          {moved ? 'This page moved.' : 'That page is off-grid.'}
        </h1>
        {moved ? (
          <div className="mb-10">
            <p className="text-muted mb-3">
              Intel pages live under <span className="font-mono text-slate-900 dark:text-slate-100">/threatintel/</span>{' '}
              as of May 2026. The page you followed is at a new URL.
            </p>
            <Link
              to={moved.to}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 dark:bg-brand-500 text-white px-5 py-3 text-sm font-mono font-semibold hover:bg-brand-700 dark:hover:bg-brand-400 transition-colors"
            >
              <code className="text-white">{moved.to}</code>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <p className="text-muted mb-6 max-w-xl mx-auto">
            The URL <code className="font-mono text-slate-900 dark:text-slate-100">{location.pathname}</code> doesn't
            match anything on this site. The link may be old, mistyped, or the page has moved.
          </p>
        )}

        {/* Fuzzy "did you mean" — only show if we have sidebar data for
            the section AND the typo is short enough that a near-match
            is more likely than a random URL. */}
        {!moved && suggestions.length > 0 && (
          <div className="mb-8 max-w-xl mx-auto">
            <div className="inline-flex items-center gap-1.5 text-mini font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-2">
              <Search className="h-3 w-3" aria-hidden="true" />
              Did you mean
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <Link
                  key={s.href}
                  to={s.href}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--border-400))] bg-white px-3 py-1.5 text-sm font-mono text-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand-500/40 dark:hover:text-brand-300 transition-colors"
                >
                  {s.label}
                  <ArrowRight size={12} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3 mb-12">
          <Link
            to="/"
className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border-400))] px-5 py-3 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/40 transition-colors"
            >
              <Home size={14} aria-hidden="true" /> Home
            </Link>
            <Link
              to="/threatintel"
              className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border-400))] px-5 py-3 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/40 transition-colors"
            >
              <Terminal size={14} aria-hidden="true" /> Threat Intel
            </Link>
            <Link
              to="/dfir"
              className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border-400))] px-5 py-3 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/40 transition-colors"
          >
            <Terminal size={14} aria-hidden="true" /> DFIR Toolkit
          </Link>
        </div>
      </div>

      {/* Section tool grid — surfaces all 30+ tools in the relevant
          section as a card grid so a 404 still gets the user to a tool
          they want. Renders only when the URL's section matches a
          known sidebar (e.g. /threatintel/* or /dfir/*). For a random
          typo like /foo we skip this and just show the buttons. */}
      {sidebar && (
        <div className="mt-4 sm:mt-8">
          <div className="flex items-center gap-2 mb-3 sm:mb-4 text-xs font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            All {sectionName} tools
          </div>
          <div className="space-y-6 sm:space-y-8">
            {sidebar.groups.map((group) => (
              <div key={group.title}>
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 sm:mb-3">{group.title}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className="group flex items-start gap-2 sm:gap-2.5 rounded-xl border border-[rgb(var(--border-400))] bg-white/70 px-2.5 sm:px-3 py-2 sm:py-2.5 min-h-[44px] hover:border-brand-500/40 hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900 dark:hover:border-brand-500/40 transition-colors"
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600 group-hover:bg-brand-500/10 group-hover:text-brand-600 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-brand-500/15 dark:group-hover:text-brand-300 transition-colors">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="flex flex-col min-w-0 leading-tight">
                          <span className="text-tool sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="text-mini text-slate-500 dark:text-slate-400 line-clamp-2 hidden sm:block">
                              {item.description}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* sectionHref kept here in case we want a 'back to section home'
          button below the grid in a future iteration. */}
      {sectionHref && <div className="hidden">{sectionHref}</div>}
    </div>
  );
}

import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Clock, ArrowRight } from 'lucide-react';
import { useRecentTools } from '../hooks/useRecentTools';
import { getSidebarForSection } from '../data/sidebar-nav';
import type { AccentTone } from './QuickActions';
import type { LucideIcon } from 'lucide-react';

/** Per-tone hover accent for the recent-tool pills (matches the section). */
const TILE_ACCENT: Record<AccentTone, { border: string; text: string; icon: string }> = {
  brand: {
    border: 'hover:border-brand-500/40 dark:hover:border-brand-500/40',
    text: 'hover:text-brand-600 dark:hover:text-brand-300',
    icon: 'group-hover:text-brand-500 dark:group-hover:text-brand-300',
  },
  rose: {
    border: 'hover:border-rose-500/40 dark:hover:border-rose-500/40',
    text: 'hover:text-rose-600 dark:hover:text-rose-300',
    icon: 'group-hover:text-rose-500 dark:group-hover:text-rose-300',
  },
};

/**
 * "Recently used" row shown above the curated QuickActions on the
 * `/dfir` and `/threatintel` landing pages. Reads a list of visited
 * paths from `localStorage` (populated by the AppShell on every route
 * change) and renders them as small inline pills with the matching
 * tool icon. This is the "power-user return" affordance — a person who
 * has used the platform a few times gets to their last tool in one
 * tap instead of scanning the 30-tile section picker.
 *
 * Render rules:
 * - Shows only after hydration (avoids SSR / first-paint flicker).
 * - Shows only when at least 2 distinct paths have been visited (a
 *   single stray visit isn't worth a row).
 * - Renders at most 4 tiles to keep the row scannable.
 * - Unknown paths (e.g. a research blog slug) fall back to a generic
 *   "open" pill so the row never breaks.
 */

interface Props {
  section: 'dfir' | 'threatintel';
  accentClass?: string;
  /** Drives the tile hover accent so it matches the section (default brand). */
  tone?: AccentTone;
}

export function RecentToolsRow({
  section,
  accentClass = 'text-brand-600 dark:text-brand-400',
  tone = 'brand',
}: Props): JSX.Element | null {
  const location = useLocation();
  const { entries, isHydrated, clear } = useRecentTools(section, location.pathname, 4);

  // Build a slug → sidebar item lookup so each entry can pull its icon
  // and label from the canonical sidebar data. Keyed by section (stable),
  // so memoize rather than rebuild the Map on every render.
  const lookup = useMemo(() => {
    const map = new Map<string, { icon: LucideIcon; label: string; description?: string }>();
    const sidebar = getSidebarForSection(`/${section}`);
    if (sidebar) {
      for (const g of sidebar.groups) {
        for (const it of g.items) {
          map.set(it.href, { icon: it.icon, label: it.label, description: it.description });
        }
      }
    }
    return map;
  }, [section]);

  // Don't render until the hook has read localStorage (post-hydration).
  // `isHydrated` from useRecentTools is the single hydration signal — it flips
  // true in the same mount effect that loads `entries`.
  if (!isHydrated || entries.length < 2) return null;

  const accent = TILE_ACCENT[tone];
  const tile = (e: { path: string; label: string }, i: number, extra: string) => {
    const meta = lookup.get(e.path);
    const Icon = meta?.icon ?? Clock;
    return (
      <Link
        key={e.path}
        to={e.path}
        style={{ animationDelay: `${i * 40}ms` }}
        className={`recent-tile group inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 transition-colors ${accent.border} ${accent.text} ${extra}`}
      >
        <Icon className={`h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ${accent.icon}`} aria-hidden="true" />
        <span className="font-medium whitespace-nowrap">{meta?.label ?? e.label}</span>
        <ArrowRight
          className="h-3 w-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all"
          aria-hidden="true"
        />
      </Link>
    );
  };

  return (
    <nav
      aria-label="Recently used tools"
      className="rounded-2xl border border-slate-200/70 bg-white/50 dark:border-slate-800 dark:bg-slate-900/40 px-3 sm:px-4 py-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className={`inline-flex items-center gap-1.5 text-mini font-mono uppercase tracking-[0.18em] ${accentClass}`}
        >
          <Clock className="h-3 w-3" aria-hidden="true" />
          Recently used
        </div>
        <button
          type="button"
          onClick={clear}
          className="text-mini font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          Clear
        </button>
      </div>
      {/*
        Mobile: horizontal scroll with snap so 4+ recent tools fit on a
        360px-wide phone without forcing the user to scroll the whole
        page. sm+: standard flex-wrap so the row reflows when there's
        space. The fade-right gradient on mobile hints that more tiles
        are off-screen.
      */}
      <div className="relative sm:hidden">
        <div className="flex flex-nowrap gap-2 overflow-x-auto snap-x snap-mandatory -mx-3 px-3 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {entries.map((e, i) => tile(e, i, 'shrink-0 snap-start'))}
        </div>
        {/* Right-edge fade — hints that more tiles are off-screen. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white/80 to-transparent dark:from-slate-900/80"
          aria-hidden="true"
        />
      </div>
      <div className="hidden sm:flex sm:flex-wrap sm:gap-2">{entries.map((e, i) => tile(e, i, ''))}</div>
    </nav>
  );
}

import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';

export interface QuickAction {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Optional badge text shown top-right (e.g. "live", "new"). */
  badge?: string;
  /** Visual treatment of the badge — defaults to emerald (live). */
  badgeTone?: 'live' | 'new' | 'beta';
  /** Optional keyboard hint shown bottom-right (e.g. "⌘K"). */
  hint?: string;
}

const BADGE_CLS: Record<NonNullable<QuickAction['badgeTone']>, string> = {
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  new: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  beta: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

export type AccentTone = 'brand' | 'rose';

/**
 * Per-tone hover / focus accent bundle so the tile's interactive state
 * matches the surrounding section (brand-blue on /dfir, rose on
 * /threatintel) instead of always flipping to brand on hover.
 */
const ACCENT: Record<
  AccentTone,
  { border: string; iconBg: string; title: string; ring: string; arrow: string; shadow: string }
> = {
  brand: {
    border: 'hover:border-brand-500/50',
    iconBg: 'group-hover:bg-brand-500/10 dark:group-hover:bg-brand-500/15',
    title: 'group-hover:text-brand-600 dark:group-hover:text-brand-400',
    ring: 'focus-visible:ring-brand-500/40',
    arrow: 'group-hover:text-brand-500 dark:group-hover:text-brand-400',
    shadow: 'hover:shadow-[0_8px_24px_-12px_rgba(44,62,229,0.25)]',
  },
  rose: {
    border: 'hover:border-rose-500/50',
    iconBg: 'group-hover:bg-rose-500/10 dark:group-hover:bg-rose-500/15',
    title: 'group-hover:text-rose-600 dark:group-hover:text-rose-400',
    ring: 'focus-visible:ring-rose-500/40',
    arrow: 'group-hover:text-rose-500 dark:group-hover:text-rose-400',
    shadow: 'hover:shadow-[0_8px_24px_-12px_rgba(225,29,72,0.25)]',
  },
};

interface QuickActionsProps {
  actions: QuickAction[];
  /** Section accent — used for the icon color. */
  accentClass?: string;
  /** Drives the hover/focus accent so it matches the section (default brand). */
  tone?: AccentTone;
  className?: string;
}

/**
 * The "Quick actions" row shown directly under the AppHero on the
 * /dfir and /threatintel landings. For a returning analyst, this is
 * the highest-utility area on the page: 3-4 of the most-clicked
 * tools / live surfaces, in big-tile form, with one-tap entry.
 *
 * Visual contract:
 *   - 2-col on sm, 4-col on lg
 *   - icon in an accent-tinted square, label in display, one-line description
 *   - right arrow on hover + subtle lift (translateY -1px) on hover
 *   - optional `badge` pill (e.g. "live") top-right
 *   - optional `hint` (keyboard shortcut) bottom-right
 *   - tiles fade in with a 40ms-per-index stagger on first mount so the
 *     row assembles instead of slamming in. Respects prefers-reduced-motion
 *     via the `motion-safe:` prefix.
 */
export function QuickActions({
  actions,
  accentClass = 'text-brand-600 dark:text-brand-400',
  tone = 'brand',
  className = '',
}: QuickActionsProps): JSX.Element {
  if (actions.length === 0) return <></>;
  const accent = ACCENT[tone];
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 ${className}`}>
      {/* Mobile: single column for full-width tiles; tablet: 2-col; desktop: 4-col */}
      {actions.map((a, i) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.to}
            to={a.to}
            style={{ animationDelay: `${i * 40}ms` }}
            className={`qa-tile group relative flex items-start gap-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3.5 transition-all duration-150 motion-safe:hover:-translate-y-0.5 hover:bg-slate-50 dark:hover:bg-[#16161f] focus:outline-none focus-visible:ring-2 ${accent.border} ${accent.shadow} ${accent.ring}`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100/80 dark:bg-[rgb(var(--surface-300)/0.6)] ${accent.iconBg} ${accentClass} transition-colors`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate ${accent.title} transition-colors`}
                >
                  {a.label}
                </span>
                {a.badge && (
                  <span
                    className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${BADGE_CLS[a.badgeTone ?? 'live']}`}
                  >
                    {a.badge}
                  </span>
                )}
              </div>
              <p className="text-meta text-slate-600 dark:text-slate-400 leading-snug mt-0.5 line-clamp-2">
                {a.description}
              </p>
            </div>
            <ArrowRight
              size={14}
              className={`absolute right-2.5 bottom-2.5 text-slate-300 dark:text-slate-700 ${accent.arrow} transition-colors`}
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </div>
  );
}

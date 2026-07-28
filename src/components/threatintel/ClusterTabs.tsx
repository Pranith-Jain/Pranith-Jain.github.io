import { NavLink } from 'react-router-dom';
import type { JSX } from 'react';

export interface ClusterTab {
  label: string;
  to: string;
}

/**
 * Route-based tab bar that unifies a cluster of related pages into one
 * "tabbed canonical" surface without merging their content - each tab is a
 * real URL, so deep links and per-page data/behavior are preserved. Drop it
 * into a page's `headerExtra` (DataPageLayout) so siblings share one nav.
 */
export function ClusterTabs({ tabs, ariaLabel = 'Section' }: { tabs: ClusterTab[]; ariaLabel?: string }): JSX.Element {
  return (
    <nav
      className="-mb-px flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))]"
      aria-label={ariaLabel}
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className={({ isActive }) =>
            `border-b-2 px-3 py-2 font-mono text-tool font-semibold transition-colors ${
              isActive
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * The ransomware-intel cluster — two distinct pages, each with its own
 * internal tabs. This nav lets users switch between them.
 *
 * ransomware.live PRO  →  PRO API data (stats, groups, TTPs, YARA, IoCs, KQL)
 * Ransomware Hub        →  public-source data (report, activity, map, payments)
 */
// eslint-disable-next-line react-refresh/only-export-components
export const RANSOMWARE_TABS: ClusterTab[] = [
  { label: 'ransomware.live PRO', to: '/threatintel/ransomware-live' },
  { label: 'Ransomware Hub', to: '/threatintel/ransomware-hub' },
  { label: 'Re-leaks', to: '/threatintel/darkweb/leaks' },
  { label: 'Onion Watch', to: '/threatintel/onion-watch' },
];

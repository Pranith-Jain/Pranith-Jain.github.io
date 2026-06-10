import { NavLink } from 'react-router-dom';
import type { JSX } from 'react';

export interface ClusterTab {
  label: string;
  to: string;
}

/**
 * Route-based tab bar that unifies a cluster of related pages into one
 * "tabbed canonical" surface without merging their content — each tab is a
 * real URL, so deep links and per-page data/behavior are preserved. Drop it
 * into a page's `headerExtra` (DataPageLayout) so siblings share one nav.
 */
export function ClusterTabs({ tabs, ariaLabel = 'Section' }: { tabs: ClusterTab[]; ariaLabel?: string }): JSX.Element {
  return (
    <nav className="-mb-px flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className={({ isActive }) =>
            `border-b-2 px-3 py-2 font-mono text-[13px] font-semibold transition-colors ${
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

/** The ransomware-intel cluster — live victims, geo map, payments, generated report. */
export const RANSOMWARE_TABS: ClusterTab[] = [
  { label: 'Live', to: '/threatintel/ransomware-live' },
  { label: 'Map', to: '/threatintel/ransomware-map' },
  { label: 'Activity', to: '/threatintel/ransomware-activity' },
  { label: 'Payments', to: '/threatintel/ransom-payments' },
  { label: 'Report', to: '/threatintel/ransom-report' },
];

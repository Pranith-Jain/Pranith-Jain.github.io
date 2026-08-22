/**
 * TabBar - reusable tab navigation used across 15+ pages.
 *
 * Replaces the pattern of:
 *   <div className="flex gap-1.5 mb-6">
 *     {tabs.map(t => <button className={active === t ? '...' : '...'}>{label}</button>)}
 *   </div>
 *
 * With:
 *   <TabBar
 *     tabs={[{ id: 'stats', label: 'Statistics' }, { id: 'lookup', label: 'Lookup' }]}
 *     active={activeTab}
 *     onChange={setActiveTab}
 *   />
 */

export interface Tab {
  id: string;
  label: string;
  /** Optional badge count shown next to label. */
  count?: number;
  /** Disable this tab. */
  disabled?: boolean;
}

export interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function TabBar({ tabs, active, onChange, className }: TabBarProps): JSX.Element {
  return (
    // Horizontal scroll rail instead of wrapping: on narrow viewports a
    // long tab list (e.g. /argus's six views) used to overflow the page and
    // force a site-wide horizontal scrollbar. Buttons never shrink or wrap,
    // the rail scrolls under a hidden scrollbar, and wide viewports are
    // unchanged because the content fits.
    <div
      className={`flex gap-1.5 mb-6 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ''}`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => !tab.disabled && onChange(tab.id)}
          disabled={tab.disabled}
          className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded text-meta font-mono border transition-colors ${
            active === tab.id
              ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400'
              : tab.disabled
                ? 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-300 dark:text-slate-400 cursor-not-allowed'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/30'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 text-micro opacity-60">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

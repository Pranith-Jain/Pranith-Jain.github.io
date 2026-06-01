/**
 * TabBar — reusable tab navigation used across 15+ pages.
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
    <div className={`flex gap-1.5 mb-6 ${className ?? ''}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => !tab.disabled && onChange(tab.id)}
          disabled={tab.disabled}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
            active === tab.id
              ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400'
              : tab.disabled
                ? 'border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-brand-500/30'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 text-[10px] opacity-60">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

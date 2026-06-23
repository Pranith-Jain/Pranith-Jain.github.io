import { useId, type ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  children?: ReactNode;
  className?: string;
  tabListClassName?: string;
  panelClassName?: string;
  variant?: 'underline' | 'pills';
}

export function Tabs({
  tabs,
  active,
  onChange,
  children,
  className = '',
  tabListClassName = '',
  panelClassName = '',
  variant = 'pills',
}: TabsProps) {
  const baseId = useId();

  function handleKeyDown(e: React.KeyboardEvent, currentIdx: number) {
    let nextIdx = -1;
    if (e.key === 'ArrowRight') nextIdx = currentIdx + 1;
    if (e.key === 'ArrowLeft') nextIdx = currentIdx - 1;
    if (nextIdx < 0 || nextIdx >= tabs.length) return;
    const next = tabs[nextIdx];
    if (next.disabled) return;
    onChange(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        className={
          variant === 'underline'
            ? `flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] ${tabListClassName}`
            : `flex flex-wrap gap-1.5 ${tabListClassName}`
        }
      >
        {tabs.map((tab, i) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`${baseId}-panel-${tab.id}`}
              disabled={tab.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                if (!tab.disabled) onChange(tab.id);
              }}
              onKeyDown={(e) => handleKeyDown(e, i)}
              className={
                variant === 'underline'
                  ? `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset ${
                      isActive
                        ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`
                  : `px-3 py-1.5 rounded-md text-xs font-mono border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      isActive
                        ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                        : tab.disabled
                          ? 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-300 dark:text-slate-400 cursor-not-allowed'
                          : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-brand-500/30'
                    }`
              }
            >
              {tab.label}
              {tab.count !== undefined && <span className="ml-1.5 text-micro opacity-60">{tab.count}</span>}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={active !== tab.id}
          tabIndex={0}
          className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset ${panelClassName}`}
        >
          {active === tab.id && children}
        </div>
      ))}
    </div>
  );
}

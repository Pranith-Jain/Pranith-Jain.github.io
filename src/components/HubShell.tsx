import type { ReactNode } from 'react';

export interface HubTab<T extends string = string> {
  id: T;
  label: string;
  desc?: string;
}

interface HubShellProps<T extends string> {
  tabs: ReadonlyArray<HubTab<T>>;
  active: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
  tone?: 'rose' | 'brand';
  children: ReactNode;
}

export function HubShell<T extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel = 'Tabs',
  tone = 'rose',
  children,
}: HubShellProps<T>): JSX.Element {
  const accent =
    tone === 'brand'
      ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400'
      : 'border-rose-500/60 bg-rose-500/10 text-rose-600 dark:text-rose-400';
  return (
    <div className="animate-fade-in-up">
      <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1.5 mb-6">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                isActive
                  ? accent
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-rose-500/30'
              }`}
              title={tab.desc}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

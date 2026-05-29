import type { ReactNode } from 'react';

export interface DescriptionListItem {
  label: string;
  value: ReactNode;
}

export interface DescriptionListProps {
  items: DescriptionListItem[];
  columns?: string;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export function DescriptionList({
  items,
  columns = 'sm:grid-cols-[140px_1fr]',
  className = '',
  labelClassName = '',
  valueClassName = '',
}: DescriptionListProps) {
  return (
    <dl className={`grid ${columns} gap-x-4 gap-y-1.5 text-sm font-mono ${className}`}>
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className={`text-slate-500 dark:text-slate-400 break-words ${labelClassName}`}>{item.label}</dt>
          <dd className={`text-slate-900 dark:text-slate-100 break-words ${valueClassName}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, message, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700 ${className}`}
      role="status"
      aria-live="polite"
    >
      {icon && <div className="mb-3 text-slate-300 dark:text-slate-600">{icon}</div>}
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export type AlertVariant = 'error' | 'success' | 'warning' | 'info';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  action?: ReactNode;
  className?: string;
}

const ICON: Record<AlertVariant, ReactNode> = {
  error: <AlertCircle className="h-5 w-5 text-rose-500" aria-hidden="true" />,
  success: <CheckCircle className="h-5 w-5 text-emerald-500" aria-hidden="true" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />,
  info: <Info className="h-5 w-5 text-brand-500" aria-hidden="true" />,
};

const BORDER: Record<AlertVariant, string> = {
  error: 'border-rose-300/70 bg-rose-50/60 dark:border-rose-800/60 dark:bg-rose-950/30',
  success: 'border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/30',
  warning: 'border-amber-300/70 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/30',
  info: 'border-brand-300/70 bg-brand-50/60 dark:border-brand-800/60 dark:bg-brand-950/30',
};

const TEXT: Record<AlertVariant, string> = {
  error: 'text-rose-700 dark:text-rose-300',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  info: 'text-brand-700 dark:text-brand-300',
};

export function Alert({ variant = 'info', title, children, onDismiss, action, className = '' }: AlertProps) {
  return (
    <div role="alert" className={`rounded-xl border p-4 ${BORDER[variant]} ${className}`}>
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5">{ICON[variant]}</span>
        <div className="flex-1 min-w-0">
          {title && <p className={`text-sm font-semibold ${TEXT[variant]}`}>{title}</p>}
          <div className={`text-sm ${title ? 'mt-1' : ''} ${TEXT[variant]}`}>{children}</div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 grid h-6 w-6 place-items-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-[rgb(var(--surface-300))] dark:hover:text-slate-300"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

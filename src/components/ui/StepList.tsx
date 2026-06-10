import { useState, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type StepStatus = 'completed' | 'active' | 'upcoming' | 'error';

export interface Step {
  id: string;
  title: string;
  description?: string;
  status?: StepStatus;
  content?: ReactNode;
  meta?: string;
}

export interface StepListProps {
  steps: Step[];
  defaultOpen?: string[];
  allowMultiple?: boolean;
  numbered?: boolean;
  className?: string;
  renderIcon?: (step: Step, index: number) => ReactNode;
}

const STATUS_COLOR: Record<StepStatus, string> = {
  completed: 'bg-emerald-500',
  active: 'bg-brand-600',
  upcoming: 'bg-slate-300 dark:bg-slate-700',
  error: 'bg-rose-500',
};

const STATUS_TEXT: Record<StepStatus, string> = {
  completed: 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30',
  active: 'text-brand-700 bg-brand-100 dark:text-brand-300 dark:bg-brand-900/30',
  upcoming: 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800',
  error: 'text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/30',
};

export function StepList({
  steps,
  defaultOpen,
  allowMultiple = false,
  numbered = true,
  className = '',
  renderIcon,
}: StepListProps) {
  const initial = new Set(defaultOpen ?? (steps.length > 0 ? [steps[0].id] : []));
  const [openSet, setOpenSet] = useState<Set<string>>(initial);

  function toggle(id: string) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) next.clear();
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {steps.map((step, i) => {
        const isOpen = openSet.has(step.id);
        const status = step.status || (i === 0 ? 'active' : 'upcoming');
        const hasContent = !!step.content;

        return (
          <div
            key={step.id}
            className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40"
          >
            <button
              type="button"
              onClick={() => hasContent && toggle(step.id)}
              className={`flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60 ${!hasContent ? 'cursor-default' : ''}`}
              aria-expanded={hasContent ? isOpen : undefined}
            >
              {renderIcon ? (
                renderIcon(step, i)
              ) : (
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${STATUS_COLOR[status]}`}
                >
                  {status === 'completed' ? <Check className="h-3.5 w-3.5" /> : numbered ? i + 1 : null}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-white">{step.title}</div>
                {step.description && (
                  <div className="text-mini font-mono text-slate-500 dark:text-slate-400">{step.description}</div>
                )}
              </div>
              {step.meta && (
                <span className={`shrink-0 text-micro font-mono rounded px-1.5 py-0.5 ${STATUS_TEXT[status]}`}>
                  {step.meta}
                </span>
              )}
              {hasContent && (
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              )}
            </button>
            {isOpen && hasContent && (
              <div className="border-t border-slate-200/70 p-4 dark:border-slate-800/70">{step.content}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

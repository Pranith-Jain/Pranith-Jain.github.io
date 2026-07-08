import { useId } from 'react';

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string;
  className?: string;
}

export function Toggle({ label, checked, onChange, disabled = false, description, className = '' }: ToggleProps) {
  const id = useId();
  const descriptionId = `${id}-desc`;

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-slate-300 dark:bg-slate-700',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-e1 ring-0 transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
      <div className="flex flex-col">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-slate-900 dark:text-white">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-xs text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

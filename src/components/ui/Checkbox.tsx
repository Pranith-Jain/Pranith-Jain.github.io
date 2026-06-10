import { useId, type ReactNode } from 'react';

export interface CheckboxProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string;
  className?: string;
}

export function Checkbox({ label, checked, onChange, disabled = false, description, className = '' }: CheckboxProps) {
  const id = useId();
  const descriptionId = `${id}-desc`;

  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        className={[
          'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 transition-colors',
          'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'dark:border-slate-600 dark:bg-slate-800 dark:checked:bg-brand-500 dark:focus:ring-offset-slate-900',
        ].join(' ')}
      />
      <div className="flex flex-col">
        <label
          htmlFor={id}
          className={`text-sm font-medium text-slate-900 dark:text-white ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
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

import { useId, type ChangeEvent } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string | null;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  disabled = false,
  required = false,
  className = '',
}: SelectProps) {
  const id = useId();
  const errorId = `${id}-error`;

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
        {required && (
          <span className="ml-0.5 text-rose-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={`w-full appearance-none rounded-md border px-3 py-2 pr-9 text-sm font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed ${
            error
              ? 'border-rose-400 focus:border-rose-500 focus-visible:ring-rose-500/20 dark:border-rose-600'
              : 'border-slate-200 bg-white text-slate-900 focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
          } ${!value && placeholder ? 'text-slate-400 dark:text-slate-500' : ''}`}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

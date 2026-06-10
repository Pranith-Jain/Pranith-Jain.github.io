import { useId, type ChangeEvent, type ReactNode } from 'react';

export type TextFieldVariant = 'default' | 'dark';

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  helperText?: string;
  type?: 'text' | 'email' | 'password' | 'url' | 'tel' | 'search' | 'number';
  variant?: TextFieldVariant;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  icon?: ReactNode;
  autoComplete?: string;
  rows?: number;
  multiline?: boolean;
}

const VARIANT: Record<TextFieldVariant, string> = {
  default:
    'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500',
  dark: 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-zinc-600 focus:border-brand-500',
};

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  error,
  helperText,
  type = 'text',
  variant = 'default',
  disabled = false,
  required = false,
  className = '',
  icon,
  autoComplete,
  rows = 3,
  multiline = false,
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const inputClasses = [
    'w-full px-3 py-2 rounded-lg text-sm font-mono border transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    error
      ? 'border-rose-400 focus:border-rose-500 focus-visible:ring-rose-500/20 dark:border-rose-600'
      : VARIANT[variant],
    icon ? 'pl-9' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const describedBy = [error ? errorId : '', helperText ? helperId : ''].filter(Boolean).join(' ') || undefined;

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
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
            {icon}
          </span>
        )}
        {multiline ? (
          <textarea
            id={id}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            rows={rows}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={inputClasses}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            autoComplete={autoComplete}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={inputClasses}
          />
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={helperId} className="mt-1 text-xs text-slate-400">
          {helperText}
        </p>
      )}
    </div>
  );
}

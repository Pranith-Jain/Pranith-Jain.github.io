import { useId } from 'react';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  className?: string;
  label?: string;
}

export function RadioGroup({ name: nameProp, value, onChange, options, className = '', label }: RadioGroupProps) {
  const baseId = useId();
  const name = nameProp || baseId;

  return (
    <fieldset className={className}>
      {label && <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</legend>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const id = `${baseId}-${opt.value}`;
          return (
            <label
              key={opt.value}
              htmlFor={id}
              className={[
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-mono transition-colors',
                'focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-1',
                value === opt.value
                  ? 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:border-brand-500/40 dark:border-slate-700 dark:text-slate-400',
                opt.disabled ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                disabled={opt.disabled}
                className="sr-only"
              />
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  value === opt.value
                    ? 'border-brand-600 dark:border-brand-400'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
                aria-hidden="true"
              >
                {value === opt.value && <span className="h-2 w-2 rounded-full bg-brand-600 dark:bg-brand-400" />}
              </span>
              <span>{opt.label}</span>
              {opt.description && <span className="text-micro text-slate-400">· {opt.description}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { detectKind, ROUTE_FOR } from './pivot-kind';

/**
 * Shared pivot bar — type an IP or domain and jump to the right tool.
 * Mirrors the etugen.io "Search / pivot" entry. Entity detection lives in
 * pivot-kind.ts (separate file) so React Fast Refresh and the
 * `react-refresh/only-export-components` lint rule stay happy.
 */

interface PivotBarProps {
  initial?: string;
  placeholder?: string;
}

export function PivotBar({ initial = '', placeholder = 'IP or domain…' }: PivotBarProps): JSX.Element {
  const [value, setValue] = useState(initial);
  const navigate = useNavigate();
  const kind = detectKind(value);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (kind === 'unknown') return;
    navigate(ROUTE_FOR[kind](value.trim()));
  };

  return (
    <form onSubmit={onSubmit} className="mb-2">
      <div className="flex gap-2 items-stretch">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            aria-label="Pivot search"
            className="w-full pl-9 pr-20 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          {value.trim() && (
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs uppercase ${
                kind === 'unknown' ? 'text-slate-400 dark:text-slate-600' : 'text-brand-600 dark:text-brand-400'
              }`}
            >
              {kind}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={kind === 'unknown'}
          className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
        >
          Pivot
        </button>
      </div>
    </form>
  );
}

/**
 * FilterBar — reusable search + filter pill row used across 20+ pages.
 *
 * Replaces the pattern of:
 *   <div className="flex gap-1.5 mb-6">
 *     <input type="text" ... />
 *     {filters.map(f => <button className={...}>{f.label}</button>)}
 *   </div>
 *
 * With:
 *   <FilterBar
 *     search={search}
 *     onSearchChange={setSearch}
 *     placeholder="Search…"
 *     filters={[{ id: 'all', label: 'All' }, { id: 'critical', label: 'Critical' }]}
 *     activeFilter={filter}
 *     onFilterChange={setFilter}
 *   />
 */

import { Search } from 'lucide-react';

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  filters?: FilterOption[];
  activeFilter?: string | null;
  onFilterChange?: (id: string | null) => void;
  /** Extra content on the right side (e.g., toggle switches). */
  extra?: React.ReactNode;
}

export function FilterBar({
  search,
  onSearchChange,
  placeholder = 'Search…',
  filters,
  activeFilter,
  onFilterChange,
  extra,
}: FilterBarProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="relative flex-1 min-w-[200px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder || 'Search'}
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
      </div>
      {filters && filters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange?.(activeFilter === f.id ? null : f.id)}
              className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                activeFilter === f.id
                  ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                  : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-brand-500/30'
              }`}
            >
              {f.label}
              {f.count !== undefined && <span className="ml-1 text-micro opacity-60">{f.count}</span>}
            </button>
          ))}
        </div>
      )}
      {extra}
    </div>
  );
}

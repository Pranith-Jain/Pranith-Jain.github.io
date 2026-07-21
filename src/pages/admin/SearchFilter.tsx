import { useMemo, useState } from 'react';

export interface FilterableItem {
  slug: string;
  title: string;
  type?: string;
}

export function SearchFilter<T extends FilterableItem>({
  items,
  children,
  placeholder = 'Search by title or slug…',
}: {
  items: T[];
  children: (filtered: T[]) => React.ReactNode;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const types = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.type) s.add(it.type);
    return [...s].sort();
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((it) => it.title.toLowerCase().includes(q) || it.slug.toLowerCase().includes(q));
    }
    if (typeFilter) {
      result = result.filter((it) => it.type === typeFilter);
    }
    return result;
  }, [items, query, typeFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded placeholder-slate-400 dark:placeholder-slate-500 text-slate-700 dark:text-slate-300"
        />
        {types.length > 1 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2 py-1.5 text-sm bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-slate-700 dark:text-slate-300"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {filtered.length}/{items.length}
        </span>
      </div>
      {children(filtered)}
    </div>
  );
}

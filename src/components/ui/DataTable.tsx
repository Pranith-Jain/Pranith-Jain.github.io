import { useMemo, useState, type ReactNode } from 'react';

/**
 * Generic sortable data table primitive.
 *
 * Replaces the ~17 hand-rolled `<table>` blocks across DFIR pages with one
 * consistent, accessible component: click a sortable header to cycle
 * desc -> asc -> none, with `aria-sort` state and the canonical surface/border
 * styling. Columns opt into sorting by providing a `sortValue` accessor.
 */

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer. */
  render: (row: T) => ReactNode;
  /** Value used for sorting. Omit to make the column non-sortable. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Optional initial sort (defaults to unsorted = input order). */
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Rendered in a full-width row when there are no rows. */
  empty?: ReactNode;
  className?: string;
  rowClassName?: (row: T) => string;
}

function alignClass(a?: 'left' | 'right' | 'center'): string {
  return a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  empty,
  className = '',
  rowClassName,
}: DataTableProps<T>): JSX.Element {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    const mult = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sv(a);
      const bv = sv(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return cmp * mult;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortValue) return;
    // Cycle: none -> desc -> asc -> none (desc first: worst/highest on top).
    setSort((prev) => (prev?.key === key ? (prev.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }));
  };

  return (
    <div
      className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] ${className}`}
    >
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-micro font-mono uppercase tracking-wider text-slate-500 dark:bg-[rgb(var(--surface-200))]/60">
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const sortable = !!col.sortValue;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`px-3 py-2 ${alignClass(col.align)} ${col.headerClassName ?? ''}`}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-slate-800 dark:hover:text-slate-200 ${
                        col.align === 'right' ? 'flex-row-reverse' : ''
                      }`}
                    >
                      {col.header}
                      <span
                        aria-hidden
                        className={`text-[9px] ${active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400/60'}`}
                      >
                        {active ? (sort?.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 && empty ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-slate-500">
                {empty}
              </td>
            </tr>
          ) : (
            sortedRows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={`border-t border-slate-200/70 align-top dark:border-[rgb(var(--border-400))]/70 ${rowClassName?.(row) ?? ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-3 py-2 ${alignClass(col.align)} ${col.className ?? ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;

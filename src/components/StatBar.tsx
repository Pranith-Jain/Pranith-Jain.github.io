/**
 * Shared 4-up stat bar for the /dfir and /threatintel landings so the
 * two surfaces stay visually parallel. Content differs per surface; the
 * frame and typography are unified here.
 */
export interface StatItem {
  label: string;
  value: string;
  mono?: boolean;
}

export function StatBar({ items }: { items: StatItem[] }): JSX.Element {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((s) => (
        <div key={s.label}>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {s.label}
          </div>
          <div
            className={`font-display font-bold text-xl text-slate-900 dark:text-slate-100 ${s.mono ? 'font-mono text-sm' : ''}`}
          >
            {s.value}
          </div>
        </div>
      ))}
    </section>
  );
}

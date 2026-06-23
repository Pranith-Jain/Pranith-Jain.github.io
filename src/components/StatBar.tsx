/**
 * Shared 4-up stat bar for the /dfir and /threatintel landings so the
 * two surfaces stay visually parallel. Content differs per surface; the
 * frame and typography are unified here.
 *
 * Design notes:
 *   - value uses display font (matches AppHero h1) for visual parity
 *   - `mono` flag forces a smaller mono value (used for timestamps,
 *     hashes, build IDs) so the row stays rhythmically even
 *   - dividers are subtle 1px hairlines, not card padding — reads as
 *     "one panel with 4 cells" not "4 cards"
 */
export interface StatItem {
  label: string;
  value: string;
  mono?: boolean;
}

export function StatBar({ items }: { items: StatItem[] }): JSX.Element {
  return (
    <section className="rounded-xl border border-slate-200/80 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--surface-200)/0.4)] overflow-hidden">
      <dl className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200/80 dark:divide-slate-800/80">
        {items.map((s) => (
          <div key={s.label} className="px-4 py-3 sm:py-3.5">
            <dt className="text-micro font-mono uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {s.label}
            </dt>
            <dd
              className={`mt-1 font-display font-bold leading-none text-slate-900 dark:text-slate-100 ${
                s.mono ? 'font-mono text-tool tracking-tight' : 'text-2xl'
              }`}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

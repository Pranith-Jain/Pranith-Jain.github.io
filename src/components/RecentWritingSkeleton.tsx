export function RecentWritingSkeleton(): JSX.Element {
  return (
    <section className="scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <div className="mb-3 h-4 w-20 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] animate-pulse" />
        <div className="h-10 w-64 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] animate-pulse" />
        <div className="mt-4 h-5 w-96 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] animate-pulse" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200)/0.4)] p-5"
          >
            <div className="h-4 w-28 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] animate-pulse" />
            <div className="h-6 w-3/4 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] animate-pulse" />
            <div className="h-4 w-full rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] animate-pulse" />
            <div className="mt-auto h-4 w-32 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}

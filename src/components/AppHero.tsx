import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Shared product hero for /dfir and /threatintel. Consistent kicker /
 * title / sub / meta across both surfaces and their category pages.
 */
export function AppHero({
  kicker = 'Privacy-first · No upload · No login · Local analysis only',
  title,
  sub,
  meta,
}: {
  kicker?: string;
  title: string;
  sub: string;
  meta?: ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 mb-6">
      <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400 mb-3 inline-flex items-center gap-2">
        <Lock size={12} /> {kicker}
      </div>
      <h1 className="font-display font-bold text-3xl sm:text-4xl leading-tight">{title}</h1>
      <p className="text-slate-600 dark:text-slate-400 font-mono mt-3 max-w-3xl leading-relaxed">{sub}</p>
      {meta && <div className="mt-4 font-mono text-[12px] text-slate-500">{meta}</div>}
    </section>
  );
}

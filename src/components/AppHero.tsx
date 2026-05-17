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
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 mb-6">
      {/* Brand wash — this is the page anchor, it should read heavier than
          the uniform cards below it (hierarchy, not more chrome). */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl dark:bg-brand-400/10"
      />
      <div className="relative">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400 mb-3 inline-flex items-center gap-2">
          <Lock size={12} /> {kicker}
        </div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.1] tracking-tight">
          {title}
        </h1>
        {/* Prose is sans (readable) — mono is reserved for IOCs/data. */}
        <p className="text-slate-600 dark:text-slate-300 mt-4 max-w-3xl text-[15px] sm:text-base leading-relaxed">
          {sub}
        </p>
        {meta && <div className="mt-5 font-mono text-[12px] text-slate-500">{meta}</div>}
      </div>
    </section>
  );
}

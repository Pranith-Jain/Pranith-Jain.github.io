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
  tone = 'brand',
}: {
  kicker?: string;
  title: string;
  sub: string;
  meta?: ReactNode;
  /** Accent palette. 'brand' (default, blue) for DFIR, 'rose' for
   *  threat-intel. Drives the kicker text, the hero wash blob, and
   *  the focus ring so the page anchor reads as part of the section. */
  tone?: 'brand' | 'rose';
}): JSX.Element {
  const TONE = {
    brand: {
      kicker: 'text-brand-600 dark:text-brand-400',
      blob: 'bg-brand-500/10 dark:bg-brand-400/10',
    },
    rose: {
      kicker: 'text-rose-600 dark:text-rose-400',
      blob: 'bg-rose-500/10 dark:bg-rose-400/10',
    },
  }[tone];
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] p-4 sm:p-6 lg:p-8 mb-4 sm:mb-6">
      {/* Brand wash — this is the page anchor, it should read heavier than
          the uniform cards below it (hierarchy, not more chrome). */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full ${TONE.blob} blur-3xl`}
      />
      <div className="relative">
        <div
          className={`text-mini font-mono uppercase tracking-[0.18em] ${TONE.kicker} mb-2 sm:mb-3 inline-flex items-center gap-2`}
        >
          <Lock size={12} aria-hidden="true" /> {kicker}
        </div>
        <h1 className="font-display font-bold text-2xl sm:text-4xl lg:text-[2.75rem] leading-[1.1] tracking-tight">
          {title}
        </h1>
        {/* Prose is sans (readable) — mono is reserved for IOCs/data. */}
        <p className="text-slate-600 dark:text-slate-300 mt-3 sm:mt-4 max-w-3xl text-sm sm:text-base leading-relaxed">
          {sub}
        </p>
        {meta && <div className="mt-3 sm:mt-5 font-mono text-meta text-slate-500 leading-relaxed">{meta}</div>}
      </div>
    </section>
  );
}

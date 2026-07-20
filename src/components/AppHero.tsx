import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { PRODUCTS } from '../lib/product-brands';

/**
 * Shared product hero for /dfir and /threatintel. Consistent kicker /
 * title / sub / meta across both surfaces and their category pages.
 *
 * Default kickers are surface-accurate (not a blanket "local only" claim):
 * CRUCIBLE is mostly browser-side; PANOPTICON is edge-hosted live CTI.
 */
export function AppHero({
  kicker,
  title,
  sub,
  meta,
  tone = 'brand',
}: {
  kicker?: string;
  title: string;
  sub: string;
  meta?: ReactNode;
  /** Accent palette. 'brand' (default, blue) for CRUCIBLE; 'rose' for PANOPTICON.
   *  Drives the kicker text and the 1px hairline accent. */
  tone?: 'brand' | 'rose';
}): JSX.Element {
  const resolvedKicker = kicker ?? (tone === 'rose' ? PRODUCTS.panopticon.kicker : PRODUCTS.crucible.kicker);
  const TONE = {
    brand: {
      kicker: 'text-brand-600 dark:text-brand-400',
      accent: 'bg-brand-500/60',
    },
    rose: {
      kicker: 'text-rose-600 dark:text-rose-400',
      accent: 'bg-rose-500/60',
    },
  }[tone];
  return (
    <section className="surface-elevated relative p-4 sm:p-6 lg:p-8 mb-4 sm:mb-6">
      {/* Hairline corner accent — tone-tinted at 1px weight. This is the
          replacement for the large blur-3xl brand wash blob: hierarchy from
          a single mark, not from a 224px decorative color halo. Geist/Vercel
          admin pattern — the page anchor reads as content, not chrome. */}
      <div aria-hidden className={`pointer-events-none absolute top-0 left-0 h-px w-12 ${TONE.accent}`} />
      <div
        className={`text-mini font-mono uppercase tracking-[0.18em] ${TONE.kicker} mb-2 sm:mb-3 inline-flex items-center gap-2`}
      >
        <Lock size={12} aria-hidden="true" /> {resolvedKicker}
      </div>
      <h1 className="font-display font-bold text-2xl sm:text-4xl lg:text-[2.75rem] leading-[1.1] tracking-tight">
        {title}
      </h1>
      {/* Prose is sans (readable) — mono is reserved for IOCs/data. */}
      <p className="text-slate-600 dark:text-slate-300 mt-3 sm:mt-4 max-w-3xl text-sm sm:text-base leading-relaxed">
        {sub}
      </p>
      {meta && <div className="mt-3 sm:mt-5 font-mono text-meta text-slate-500 leading-relaxed">{meta}</div>}
    </section>
  );
}

/**
 * Portfolio-wide FAQ section. The same Q&A array is rendered here and
 * also emitted as FAQPage JSON-LD by Home.tsx via <FaqStructuredData>.
 * 1 source of truth, no schema drift.
 *
 * Visual language: matches the design-system rhythm used by About and
 * Skills. Caps-mono kicker, display heading, single-line lede, then a
 * clean grid of Q&A cards. No glass, no shadows, no AI-pillow wash.
 */

import { HOME_FAQ } from '../../data/home-faq';

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24">
      <div className="mb-10 max-w-3xl">
        <div className="mb-3 text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Common questions
        </div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Answers, up front
        </h2>
        <p className="mt-3 text-base sm:text-lg text-muted leading-relaxed">
          What people most often ask about the portfolio, the toolkit, and the threat-intel platform.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {HOME_FAQ.map((f) => (
          <div
            key={f.question}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5"
          >
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">{f.question}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{f.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

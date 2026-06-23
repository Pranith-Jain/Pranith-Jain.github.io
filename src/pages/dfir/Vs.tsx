/**
 * /dfir/vs — side-by-side comparison of CRUCIBLE with the rival
 * products that AI engines most often field in "X vs Y" queries. Each
 * comparison block follows the same 40-60 word answer format that the
 * FAQPage schema lifts directly, so the schema and the visible text
 * can never drift.
 *
 * The page is intentionally lean: a single intro, a card grid of
 * comparison blocks, and a closing CTA back to /dfir. No interactive
 * widgets, no auth gates, no client-side state. Pre-rendered to a
 * static HTML page at build time so AI crawlers and humans get the
 * same content in one round-trip.
 */

import { ArrowRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageMeta } from '../../components/PageMeta';
import { FaqStructuredData } from '../../components/FaqStructuredData';
import { COMPARE } from '../../data/dfir-compare';

export default function Vs(): JSX.Element {
  const faq = COMPARE.map((c) => ({
    question: `CRUCIBLE vs ${c.rival}?`,
    answer: c.answer,
  }));

  return (
    <>
      <PageMeta
        title="CRUCIBLE vs VirusTotal, ANY.RUN, Hybrid Analysis, URLScan"
        description="Side-by-side comparison of CRUCIBLE (DFIR & Security Toolkit) with VirusTotal, ANY.RUN, Hybrid Analysis, and URLScan.io. When to use which, and how CRUCIBLE complements hosted sandboxes."
        section="DFIR"
        canonicalPath="/dfir/vs"
        ogImage="/og-dfir.svg"
      />
      <FaqStructuredData entries={faq} />
      <div className="w-full py-6 sm:py-10 text-slate-900 dark:text-slate-100 space-y-8 sm:space-y-12">
        {/* Hero — matches the /dfir hero rhythm: kicker, display heading, lede. */}
        <section className="surface-elevated relative p-6 sm:p-10 lg:p-12">
          <div className="max-w-3xl">
            <div className="mb-3 text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Comparison
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[0.95] tracking-[-0.04em] text-slate-900 dark:text-white">
              CRUCIBLE vs{' '}
              <span className="text-brand-600 dark:text-brand-400">VirusTotal, ANY.RUN, Hybrid Analysis, URLScan.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-muted">
              CRUCIBLE is a free, browser-side workbench for the analyst workflow around a sample, not a replacement for
              hosted sandboxes. These notes describe when to use which, written by the person who built CRUCIBLE and
              uses the rivals daily.
            </p>
          </div>
        </section>

        {/* Comparison grid — one card per rival. */}
        <section className="grid gap-4 sm:grid-cols-2">
          {COMPARE.map((c) => (
            <article
              key={c.rival}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200)/0.4)] p-5"
            >
              <header className="mb-3">
                <div className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Comparison
                </div>
                <h2 className="mt-1 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  CRUCIBLE vs {c.rival}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.rivalSummary}</p>
                <a
                  href={c.rivalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {c.rivalUrl.replace(/^https?:\/\//, '')}
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              </header>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{c.answer}</p>
            </article>
          ))}
        </section>

        {/* Closing CTA back to /dfir so the comparison page does not dead-end. */}
        <section className="flex justify-center">
          <Link
            to="/dfir"
            className="inline-flex items-center gap-2 surface-card rounded-xl px-6 py-3 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-600 dark:text-slate-300 dark:hover:border-brand-600 dark:hover:text-brand-400"
          >
            Try CRUCIBLE
            <ArrowRight size={14} />
          </Link>
        </section>
      </div>
    </>
  );
}

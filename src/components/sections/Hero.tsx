import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { PersonalInfo } from '../../core/entities';
import { HeroLiveSparkline } from '../HeroLiveSparkline';
import { PjMark } from '../PjMark';

interface HeroProps {
  personalInfo: PersonalInfo;
}

export function Hero({ personalInfo }: HeroProps) {
  return (
    <section className="relative pt-4 lg:pt-6">
      <div className="grid lg:grid-cols-[1fr_auto] gap-10 lg:gap-16 items-start animate-fade-in-up">
        {/* Left: tagline, live data, CTAs */}
        <div className="min-w-0 max-w-3xl">
          <div className="mb-5 flex items-center gap-2.5 text-eyebrow font-mono uppercase text-slate-500 dark:text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            Certified Cyber Criminologist
          </div>

          <h1 className="font-display text-[1.75rem] font-extrabold leading-[1.1] tracking-[-0.018em] sm:text-5xl lg:text-[3.25rem] text-slate-900 dark:text-white">
            Building at the intersection of AI, threat intelligence,{' '}
            <span className="text-brand-600 dark:text-brand-400">and edge-native security tooling.</span>
          </h1>

          <HeroLiveSparkline />

          {/* Hunt.io-style stat row: discrete pills, mono, even weight, not
              a sentence strung with middots. The period at the end of
              "no login" is intentional — it reads as a finished clause,
              not a tagline trailing off. */}
          <ul className="mt-4 flex flex-wrap items-center gap-2 font-mono text-meta text-slate-600 dark:text-slate-300">
            <li className="rounded border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-2 py-0.5">
              60+ tools
            </li>
            <li className="rounded border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-2 py-0.5">
              18 feeds
            </li>
            <li className="rounded border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-2 py-0.5">
              no login
            </li>
            <li className="rounded border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-2 py-0.5">
              edge-hosted on Cloudflare
            </li>
          </ul>

          <p className="mt-7 max-w-2xl text-base sm:text-lg leading-relaxed text-muted">{personalInfo.description}</p>

          {/* CTAs — equal weight, equal height. The outline variant uses
              a heavier border (slate-400) so it doesn't read as a
              secondary/decoration next to the filled primary. */}
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              to="/dfir/ioc-check"
              className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Try IOC Check
            </Link>
            <Link
              to="/threatintel"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 transition hover:border-brand-500/60 hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Threat Intel Platform
            </Link>
          </div>
        </div>

        {/* Right: personal card — sharp 8px radius (was rounded-2xl) for
            the "instrument panel" feel, sits flush with the surrounding
            data tiles. */}
        <div className="shrink-0 lg:sticky lg:top-24">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-6 sm:p-7 flex flex-col items-center sm:items-start text-center sm:text-left">
            <PjMark className="h-14 w-14 sm:h-16 sm:w-16 mb-4" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">{personalInfo.name}</h2>
            <p className="mt-0.5 text-meta text-muted font-mono">{personalInfo.shortTitle}</p>
            <Link
              to="/about"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
            >
              More about me <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

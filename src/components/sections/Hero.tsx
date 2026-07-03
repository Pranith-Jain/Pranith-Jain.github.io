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
            <span className="inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            Certified Cyber Criminologist
          </div>

          {/* h1: Geist h-40 to h-72 tracking (-1.28 to -2.4px). We use
              -2.4px (heading-40) because the responsive sizes
              (28-52px) sit in that range. */}
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.04em] sm:text-5xl lg:text-[3.25rem] text-slate-900 dark:text-white">
            Building at the intersection of{' '}
            <span className="text-brand-600 dark:text-brand-400">
              AI, threat intelligence, and edge-native security tooling.
            </span>
          </h1>

          <HeroLiveSparkline />

          {/* Geist-style key-value list: 2-column grid, key in `eyebrow`
              mono, value in `label-14` sans. The previous 4-pill row
              used identical brand pills (which signals "same importance"
              to the eye) and one of the values was a sentence fragment
              (`edge-hosted on Cloudflare`) that no pill could carry
              cleanly. The new layout reads as a true stat block. */}
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {[
              ['60+', 'tools'],
              ['30+', 'feeds'],
              ['0', 'login required'],
              ['0', 'data egress'],
            ].map(([k, v]) => (
              <div key={v} className="flex flex-col">
                <dt className="font-display text-2xl font-semibold tracking-[-0.4px] text-slate-900 dark:text-white tabular-nums sm:text-3xl">
                  {k}
                </dt>
                <dd className="mt-0.5 font-mono text-mini uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-7 max-w-2xl text-base sm:text-lg leading-relaxed text-muted">{personalInfo.description}</p>

          {/* CTAs — Geist h-40 (40px) height, 6px radius. The primary
              is brand-blue (this is one of the few surfaces that
              justifies the accent for a CTA — "Try IOC Check" is the
              single most important action on the home page). The
              secondary uses a translucent gray-alpha border with a
              black/5 hover wash (the 100→200 step from the spec). */}
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              to="/dfir/ioc-investigate"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
            >
              Try IOC Check
            </Link>
            <Link
              to="/threatintel"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-black/15 bg-white px-4 text-sm font-medium text-slate-900 transition-colors hover:bg-black/5 hover:border-black/25 dark:bg-transparent dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/5 dark:hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
            >
              Threat Intel Platform
            </Link>
          </div>
        </div>

        {/* Right: personal card — Geist surface ramp. White fill,
            gray-alpha-400 border, no shadow (the previous shadow-e1
            pushed it forward of the page; Geist hierarchy is "borders
            first, shadows subtle" so the card sits in the page). */}
        <div className="shrink-0 lg:sticky lg:top-24">
          <div className="surface-card p-6 sm:p-7 flex flex-col items-center sm:items-start text-center sm:text-left">
            <PjMark className="h-14 w-14 sm:h-16 sm:w-16 mb-4" />
            <h2 className="font-display text-lg font-semibold tracking-[-0.4px] text-slate-900 dark:text-white">
              {personalInfo.name}
            </h2>
            <p className="mt-0.5 text-meta text-muted font-mono">{personalInfo.shortTitle}</p>
            <Link
              to="/about"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              More about me <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

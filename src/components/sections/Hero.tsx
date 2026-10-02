import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { PersonalInfo } from '../../core/entities';
import { HeroLiveSparkline } from '../HeroLiveSparkline';
import { PjMark } from '../PjMark';
import { Button } from '../ui/Button';

interface HeroProps {
  personalInfo: PersonalInfo;
}

export function Hero({ personalInfo }: HeroProps) {
  return (
    <section className="relative pt-4 lg:pt-6">
      <div className="grid lg:grid-cols-[1fr_auto] gap-10 lg:gap-16 items-start animate-fade-in-up">
        {/* Left: tagline, live data, CTAs */}
        <div className="min-w-0 max-w-3xl">
          <div className="mb-5 flex items-center gap-2.5 text-eyebrow font-mono uppercase text-muted">
            <span className="inline-flex rounded-full h-2 w-2 bg-brand-500" aria-hidden="true"></span>
            Certified Cyber Criminologist
          </div>

          {/* h1: Geist h-40 to h-72 tracking (-1.28 to -2.4px). We use
              -2.4px (heading-40) because the responsive sizes
              (28-52px) sit in that range. */}
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.04em] sm:text-5xl lg:text-[3.25rem] text-heading">
            Building at the intersection of{' '}
            <span className="text-brand-600 dark:text-brand-400">
              AI, threat intelligence, and edge-native security tooling.
            </span>
          </h1>

          <HeroLiveSparkline />

          {/* Two real numbers, not four slots. The previous block read
              `60+ tools / 30+ feeds / 0 login required / 0 data egress`, and
              the two zeros were the problem: at `text-3xl` display size a
              literal "0" reads as an empty metric or a broken widget rather
              than a reassurance, and on mobile it stacked into a 2x2 where
              the entire second row was `0` and `0`. PRODUCT.md names "rows of
              identical stat cards, gradient hero-metric blocks" as an
              anti-reference; a 4-across grid where half the cells are zero
              is that template with the numbers removed.

              The privacy claims are real and worth keeping, so they moved
              from display type into one quiet mono line under the numbers.
              Same information, no dead headline weight. */}
          <dl className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            {[
              ['60+', 'tools'],
              ['30+', 'live feeds'],
            ].map(([k, v]) => (
              <div key={v} className="flex items-baseline gap-1.5">
                <dt className="font-display text-2xl font-semibold tracking-[-0.4px] text-heading tabular-nums sm:text-3xl">
                  {k}
                </dt>
                <dd className="font-mono text-mini uppercase tracking-[0.12em] text-muted">{v}</dd>
              </div>
            ))}
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">Privacy</dt>
              <dd className="flex items-center gap-1.5 font-mono text-mini uppercase tracking-[0.12em] text-muted">
                <span aria-hidden="true" className="inline-block h-1 w-1 rounded-full bg-brand-500/60" />
                no signup, runs in your browser
              </dd>
            </div>
          </dl>

          <p className="mt-7 max-w-2xl text-base sm:text-lg leading-relaxed text-muted">{personalInfo.description}</p>

          {/* CTAs - 40px height, 6px radius (--radius-control, set on Button).
              The primary is brand-blue: this is one of the few surfaces
              that justifies the accent for a CTA, since "Try IOC Check" is
              the single most important action on the home page. The
              secondary is a bordered outline with a wash on hover. */}
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button href="/dfir/ioc-investigate" variant="primary-brand" size="md">
              Try IOC Check
            </Button>
            <Button href="/threatintel" variant="secondary" size="md">
              Threat Intel Platform
            </Button>
          </div>
        </div>

        {/* Right: personal card - Geist surface ramp. White fill,
            gray-alpha-400 border, no shadow (the previous shadow-e1
            pushed it forward of the page; Geist hierarchy is "borders
            first, shadows subtle" so the card sits in the page). */}
        <div className="shrink-0 lg:sticky lg:top-24">
          <div className="surface-card p-6 sm:p-7 flex flex-col items-center sm:items-start text-center sm:text-left">
            <PjMark className="h-14 w-14 sm:h-16 sm:w-16 mb-4" />
            <h2 className="font-display text-lg font-semibold tracking-[-0.4px] text-heading">{personalInfo.name}</h2>
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

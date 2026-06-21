/**
 * Branded intro ribbon for /threatintel.
 *
 * The page already has a functional hero (search + categories) in Home.tsx.
 * This sits ABOVE that hero as a smaller, static, dark-mode-only band
 * that establishes the PJ / "working CTI platform" identity — the
 * "campaign card" treatment, not a data source.
 *
 * Visual treatment mirrors the threat-intel screenshot:
 *   - Deep navy page base (--ti-bg-base)
 *   - Magenta radial glow top-right, indigo radial glow bottom-left
 *   - Faint 48px grid lines
 *   - Translucent panels with backdrop-blur
 *   - Indigo to violet to pink gradient on the kicker line and CTA
 *
 * Stats are intentionally hard-coded (18 feeds / 200+ claims / 3 pieces)
 * to match the source design exactly. If you want them dynamic, swap the
 * STATS array for live data and label it as such.
 */
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

interface Stat {
  label: string;
  value: string;
  hint?: string;
}

// Match the screenshot's three metric cards + CTA exactly. If these drift
// from the live numbers, fix both places at once.
const STATS: Stat[] = [
  { label: 'IOC feeds correlated', value: '18' },
  { label: 'Ransomware claims . 7d', value: '200+' },
  { label: 'Authored research', value: '3 pieces' },
];

// Footnote tags under the CTA - also from the screenshot. Treated as
// data tags, not navigation, so they render as plain text.
const TAGS = ['/correlation', '/detections', '/metrics', '/ransomware-activity', '/research', '/breach-disclosures'];

export function BrandHero(): JSX.Element {
  return (
    <section
      className="ti-bg ti-grid relative mb-6 overflow-hidden rounded-hero border border-ti-border sm:mb-8"
      aria-labelledby="brand-hero-title"
    >
      {/* Identity row - PJ monogram + name + section tag */}
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 sm:gap-4 sm:px-8 sm:pt-7">
        <div
          aria-hidden
          className="grid h-11 w-11 place-items-center rounded-card bg-ti-violet font-display text-lg font-bold text-ti-text sm:h-12 sm:w-12"
        >
          PJ
        </div>
        <div>
          <p className="font-display text-base font-semibold tracking-[0.16em] text-ti-text sm:text-lg">PRANITH JAIN</p>
          <p className="font-mono text-mini uppercase tracking-[0.16em] text-ti-muted">
            /threatintel . live CTI platform
          </p>
        </div>
      </div>

      {/* Headline + sub. The second line uses the gradient text treatment
          (indigo to violet to pink), exactly like the screenshot. */}
      <div className="px-5 pt-6 sm:px-8 sm:pt-8">
        <h1
          id="brand-hero-title"
          className="font-display text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-ti-text sm:text-4xl lg:text-5xl"
        >
          A working CTI
          <br />
          <span className="ti-text-gradient">platform on the edge.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ti-muted sm:mt-4 sm:text-base">
          Live ransomware feeds . IOC correlation across 18 sources . authored research
        </p>
      </div>

      {/* Stats row + CTA - the four-card footer from the screenshot.
          Three stat panels + one gradient button. */}
      <div className="mt-6 flex flex-wrap items-stretch gap-2 px-5 pb-5 sm:mt-8 sm:gap-3 sm:px-8 sm:pb-7">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="ti-panel flex min-w-[8rem] flex-1 flex-col rounded-card px-3 py-2 sm:px-4 sm:py-3"
          >
            <span className="font-mono text-mini uppercase tracking-[0.16em] text-ti-muted">{stat.label}</span>
            <span className="mt-0.5 font-display text-xl font-bold text-ti-text sm:text-2xl">{stat.value}</span>
          </div>
        ))}

        <Link
          to="/threatintel"
          className="ti-btn-gradient flex min-w-[8rem] flex-1 items-center justify-between gap-2 rounded-card px-3 py-2 sm:px-4 sm:py-3"
        >
          <div className="flex flex-col text-left">
            <span className="font-mono text-mini uppercase tracking-[0.16em] opacity-80">Open at</span>
            <span className="font-display text-base font-semibold sm:text-lg">/threatintel</span>
          </div>
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>

      {/* Footnote tags - the row of /slug tags at the bottom of the
          screenshot. Plain text, monospace, low-contrast. */}
      <div className="border-t border-ti-border/60 px-5 py-2.5 sm:px-8 sm:py-3">
        <p className="font-mono text-mini text-ti-muted">
          {TAGS.map((tag, i) => (
            <span key={tag}>
              <span className="opacity-80">{tag}</span>
              {i < TAGS.length - 1 && <span className="px-2 opacity-40">.</span>}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

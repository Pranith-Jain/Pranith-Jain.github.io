import { memo } from 'react';

/**
 * Fixed-position gradient + SVG-noise overlay used as the page background on
 * both the portfolio render path and the /dfir, /threatintel app paths.
 *
 * Memoized because the two divs were previously duplicated inline in App.tsx
 * — re-rendered on every route transition — and the inline style objects with
 * a multi-line gradient string + base64 SVG data URI added measurable cost to
 * each transition. Only `isDark` drives variation.
 */

interface BackgroundLayerProps {
  isDark: boolean;
}

// Geist-style atmosphere. One brand-blue pool + one slate fade in light
// mode; dark mode amplifies brand presence by ~2× but stays restrained
// (the old 5-stop wash read as AI-pillow — Geist dark page is essentially
// #000 with one faint radial wash).
const GRADIENT_LIGHT = `
  radial-gradient(at 18% 22%, rgba(44, 62, 229, 0.10) 0px, transparent 55%),
  radial-gradient(at 88% 88%, rgba(33, 41, 155, 0.06) 0px, transparent 55%)
`;

const GRADIENT_DARK = `
  /* Ultra-premium dark atmosphere (v3):
       1. Top “lit from above” wash — cool, same hue family as the
          page bg. Lifts to ~#161d35 at the top, fades to the page
          color over 65% of the height. This is what makes a dark
          page feel lit instead of feeling like a void.
       2. A single deliberate brand-blue pool bottom-right (~6%
          alpha) — asymmetric, not centered. Centered symmetry
          reads as decorative; asymmetric reads as designed.
       3. A second, much fainter brand-blue pool top-left (~3%
          alpha) for the slightest compositional balance without
          making the page feel symmetric.
       4. Bottom edge lift in the bottom 10% so the page doesn't
          end abruptly. Without this, the page feels like a
          poster stuck to a wall. */
  radial-gradient(ellipse 95% 55% at 50% 0%, #161d35 0%, #0a0d18 65%),
  radial-gradient(at 88% 92%, rgba(67, 94, 241, 0.06) 0px, transparent 50%),
  radial-gradient(at 12% 8%, rgba(67, 94, 241, 0.03) 0px, transparent 45%),
  linear-gradient(to bottom, transparent 90%, rgba(20, 24, 34, 0.4) 100%)
`;

const NOISE_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;

function BackgroundLayerImpl({ isDark }: BackgroundLayerProps): JSX.Element {
  return (
    <>
      <div
        className="fixed inset-0 -z-10 transition-all duration-700 ease-in-out"
        style={{
          background: isDark ? GRADIENT_DARK : GRADIENT_LIGHT,
          opacity: isDark ? 0.9 : 0.6,
        }}
        aria-hidden="true"
      />
      {/* Cyberpunk structural grid (2026-06-19). 1px hairlines on a
          24px cell, faded behind the page gradient. The grid is the
          "lit from above" effect of cyberpunk HUDs (CP2077, ctOS,
          Linear Cyber) — it gives the page a coordinate system
          without competing with the gradient wash. Toggled into
          existence with the dark/light themes (the .bg-line-grid
          utility handles both modes). */}
      <div
        className={`fixed inset-0 -z-10 transition-opacity duration-700 ease-in-out ${isDark ? 'bg-line-grid opacity-60' : 'bg-line-grid opacity-100'}`}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 -z-10 pointer-events-none transition-opacity duration-700 ease-in-out"
        style={{
          backgroundImage: NOISE_URL,
          opacity: isDark ? 0.1 : 0.08,
        }}
        aria-hidden="true"
      />
    </>
  );
}

export const BackgroundLayer = memo(BackgroundLayerImpl);

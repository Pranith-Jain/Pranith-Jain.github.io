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

// Light theme: two asymmetric brand-blue radials (10% / 6% opacity) on
// a white canvas. Semi-transparent because the page bg handles the base.
const GRADIENT_LIGHT = `
  radial-gradient(at 18% 22%, rgba(44, 62, 229, 0.10) 0px, transparent 55%),
  radial-gradient(at 88% 88%, rgba(33, 41, 155, 0.06) 0px, transparent 55%)
`;

// Dark theme: the BACKGROUND IS THE GRADIENT. No solid body color shows
// through — the first layer is the deep-navy base (#060A14), with brand-
// blue radial pools layered on top at full opacity. This makes the page
// a true gradient composition, not a solid color with a glow overlay.
const GRADIENT_DARK = `
  linear-gradient(to bottom, #060A14, #060A14),
  radial-gradient(ellipse 80% 35% at 50% 0%, rgba(10, 18, 38, 0.8) 0%, transparent 60%),
  radial-gradient(at 18% 22%, rgba(67, 94, 241, 0.25) 0px, transparent 50%),
  radial-gradient(at 82% 85%, rgba(44, 62, 229, 0.18) 0px, transparent 50%),
  radial-gradient(at 50% 55%, rgba(99, 130, 255, 0.07) 0px, transparent 55%),
  linear-gradient(to bottom, transparent 85%, rgba(2, 4, 10, 0.5) 100%)
`;

const NOISE_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;

function BackgroundLayerImpl({ isDark }: BackgroundLayerProps): JSX.Element {
  return (
    <>
      <div
        className="fixed inset-0 -z-10 transition-all duration-700 ease-in-out"
        style={{
          background: isDark ? GRADIENT_DARK : GRADIENT_LIGHT,
          opacity: isDark ? 1.0 : 0.6,
        }}
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

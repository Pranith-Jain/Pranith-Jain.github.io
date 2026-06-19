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

// Dark theme: a true gradient composition — 8 layers using the full
// brand palette. The base subtly shifts from lighter navy at top to
// deeper at bottom. Three asymmetric brand-blue pools form a visual
// triangle (top-left, bottom-right, top-right) with multi-stop
// falloffs that go through mid-tones instead of jumping to transparent.
// A large ambient wash ties them together, and a bottom vignette
// grounds the page. The noise texture adds tactile richness.
const GRADIENT_DARK = `
  /* 1 — Base: subtle top-to-bottom depth */
  linear-gradient(180deg, #080E1E 0%, #060A14 45%, #030710 100%),

  /* 2 — Large ambient: soft overhead light across the full width */
  radial-gradient(ellipse 100% 40% at 50% 0%, rgba(12, 22, 46, 0.7) 0%, transparent 65%),

  /* 3 — Primary pool: top-left, bright brand-400 center */
  radial-gradient(at 18% 22%, rgba(109, 139, 247, 0.20) 0px, rgba(67, 94, 241, 0.10) 35%, transparent 55%),

  /* 4 — Secondary pool: bottom-right, deeper brand-700 center */
  radial-gradient(at 82% 85%, rgba(44, 62, 229, 0.22) 0px, rgba(35, 46, 191, 0.10) 40%, transparent 55%),

  /* 5 — Tertiary accent: top-right, faint balance point */
  radial-gradient(at 72% 18%, rgba(99, 130, 255, 0.08) 0px, transparent 45%),

  /* 6 — Center ambient: ties the three pools together */
  radial-gradient(at 50% 50%, rgba(67, 94, 241, 0.05) 0px, transparent 55%),

  /* 7 — Bottom grounding: deeper edge so content doesn't float */
  linear-gradient(to bottom, transparent 80%, rgba(2, 4, 10, 0.55) 100%)
`;

const NOISE_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.06'/%3E%3C/svg%3E")`;

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
          opacity: isDark ? 0.12 : 0.08,
        }}
        aria-hidden="true"
      />
    </>
  );
}

export const BackgroundLayer = memo(BackgroundLayerImpl);

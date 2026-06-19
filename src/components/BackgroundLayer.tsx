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

// All-radial mesh — zero linear gradients. Every layer is a radial
// positioned at a different point on the page, creating an organic
// Stripe-like mesh that flows naturally. The base uses a wide ellipse
// so the center (where content lives) reads slightly brighter than
// the edges, with the full brand palette stitched through six pools.
const GRADIENT_DARK = `
  /* 1 — Canvas: wide ellipse, brighter center, deeper edges */
  radial-gradient(ellipse 150% 100% at 50% 50%, #0A1228 0%, #060A14 45%, #03070E 100%),

  /* 2 — Overhead ambient: soft light from above */
  radial-gradient(ellipse 110% 40% at 50% 0%, rgba(12, 22, 48, 0.65) 0%, transparent 65%),

  /* 3 — Primary pool: top-left, brand-400 center → brand-500 mid */
  radial-gradient(at 18% 22%, rgba(109, 139, 247, 0.22) 0px, rgba(67, 94, 241, 0.12) 35%, transparent 55%),

  /* 4 — Secondary pool: bottom-right, brand-600 center → brand-700 */
  radial-gradient(at 82% 85%, rgba(44, 62, 229, 0.24) 0px, rgba(35, 46, 191, 0.12) 40%, transparent 55%),

  /* 5 — Tertiary accent: top-right, faint brand-400 balance */
  radial-gradient(at 72% 18%, rgba(99, 130, 255, 0.09) 0px, transparent 45%),

  /* 6 — Bottom-left counterpoint: rounds out the mesh quilt */
  radial-gradient(at 15% 80%, rgba(67, 94, 241, 0.06) 0px, transparent 50%),

  /* 7 — Center ambient: ties all pools into one field */
  radial-gradient(at 50% 50%, rgba(99, 130, 255, 0.06) 0px, transparent 55%),

  /* 8 — Grounding: bottom-edge ellipse so footer doesn't float */
  radial-gradient(ellipse 130% 25% at 50% 100%, rgba(2, 4, 10, 0.55) 0%, transparent 70%)
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

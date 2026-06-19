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

// Light theme: two asymmetric brand-blue radials (10% / 6% opacity).
// Dark theme: the SAME approach, amplified — navy page (#060A14) with
// brand-blue pools at 18% / 12% opacity. Visible, intentional, branded.
const GRADIENT_LIGHT = `
  radial-gradient(at 18% 22%, rgba(44, 62, 229, 0.10) 0px, transparent 55%),
  radial-gradient(at 88% 88%, rgba(33, 41, 155, 0.06) 0px, transparent 55%)
`;

const GRADIENT_DARK = `
  /* v7 — Deep navy canvas with brand gradient pools (2026-06-19)
     The page bg is #060A14 (deep navy, visible brand character).
     This is the SAME approach as the light theme — asymmetric brand-
     blue radial washes — but amplified for the dark canvas. The light
     theme uses pools at 10% / 6% opacity; this uses 18% / 12% so the
     brand is VISIBLY present rather than whispered.
       1. Top-lit wash: lifts the top ~35% of the page from #060A14
          to ~#0c1324, creating "light from above" depth.
       2. Primary brand-blue pool (top-left, ~18% opacity) — the
          same position and hue as the light theme's primary pool,
          just stronger. This is the dark theme's signature glow.
       3. Secondary brand-indigo pool (bottom-right, ~12% opacity) —
          complementary asymmetry, balanced but not symmetric.
       4. A faint center glow (~5%) so the middle of the page
          doesn't feel hollow between the two edge pools.
       5. Bottom-edge darkening — the last 12% gently darkens so
          the page doesn't end abruptly. */
  radial-gradient(ellipse 85% 40% at 50% 0%, rgba(12, 18, 34, 0.85) 0%, transparent 55%),
  radial-gradient(at 18% 22%, rgba(67, 94, 241, 0.18) 0px, transparent 50%),
  radial-gradient(at 82% 85%, rgba(44, 62, 229, 0.12) 0px, transparent 50%),
  radial-gradient(at 50% 50%, rgba(99, 130, 255, 0.05) 0px, transparent 60%),
  linear-gradient(to bottom, transparent 88%, rgba(4, 7, 14, 0.4) 100%)
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

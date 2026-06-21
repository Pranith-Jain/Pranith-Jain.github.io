import { memo } from 'react';

/**
 * Fixed-position gradient + SVG-noise overlay used as the page background on
 * both the portfolio render path and the /dfir, /threatintel app paths.
 *
 * Memoized because the two divs were previously duplicated inline in App.tsx
 * — re-rendered on every route transition — and the inline style objects with
 * a multi-line gradient string + base64 SVG data URI added measurable cost to
 * each transition. Only `isDark` drives variation.
 *
 * Dark theme uses the v7.3 atmosphere: two brand-blue radials (18% / 14%)
 * with a 0.16 noise layer on top of a navy base. The v8 pass that
 * dimmed the pools to 10%/8% and the noise to 0.08 made the page read
 * as flat black — restored the depth here. Surface primitives in
 * index.css are unchanged: cards still use the v8/v9 outer ring +
 * top-edge highlight recipe to lift off the page.
 */

interface BackgroundLayerProps {
  isDark: boolean;
}

// Light theme: 2 asymmetric brand-blue radials (10% / 6% opacity) on a
// white canvas. Subtle enough to give the page a quiet identity beat
// without reading as a stage-light.
const GRADIENT_LIGHT = `
  radial-gradient(at 18% 22%, rgba(44, 62, 229, 0.10) 0px, transparent 55%),
  radial-gradient(at 88% 88%, rgba(33, 41, 155, 0.06) 0px, transparent 55%)
`;

// Dark theme: 2 brand-blue radials on the navy canvas — the v7.3
// atmosphere. The two pools (top-left brand-blue, bottom-right indigo)
// are richer (18% / 14%) than the v8 "true neutral" pass, which
// dropped them to 10% / 8% and the page read as flat black. Kept
// to two pools (not the v7.4 five-pool mesh) so the navy base still
// reads as the dominant surface and the pools feel like depth, not
// stage lighting.
const GRADIENT_DARK = `
  radial-gradient(at 18% 22%, rgba(67, 94, 241, 0.18) 0px, transparent 55%),
  radial-gradient(at 80% 88%, rgba(33, 41, 155, 0.14) 0px, transparent 55%)
`;

// Fractal noise — baseFrequency 0.9 keeps the dots large enough to read
// as a soft paper-grain texture, not a pixel-level dither. Dark renders
// at 0.08 (vs light's 0.10) so the grain is perceptible on cards without
// bringing back the nosy-grain feel of v7b's 0.18.
const NOISE_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;

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
          opacity: isDark ? 0.16 : 0.08,
        }}
        aria-hidden="true"
      />
    </>
  );
}

export const BackgroundLayer = memo(BackgroundLayerImpl);

import { memo } from 'react';

/**
 * Fixed-position gradient + subtle grain overlay used as the page background
 * on both the portfolio render path and the /dfir, /threatintel app paths.
 *
 * Memoized because the layered divs were previously duplicated inline in
 * App.tsx and re-rendered on every route transition. Only `isDark` drives
 * variation.
 *
 * Texture balance (light vs dark):
 *   - Light: 2 brand-blue radials (0.10/0.06) on a white canvas — a
 *     "quiet identity beat" that gives the page a sense of place without
 *     being a focal point.
 *   - Dark: 3 brand-blue radials (0.10/0.07/0.05) on the navy canvas,
 *     compositionally matching the light theme's depth (3 corner accents
 *     form a triangle) but at the low end of the v7.3 intensity scale so
 *     it never reads as a "stage-light" or the AI-ambient spotlights that
 *     marked the v7.3→v7.4 AI-slop removal. A 0.05 grain overlay is
 *     roughly half the light theme's intensity (0.10), giving dark cards
 *     and text something to land on without the previous nosy-grain feel.
 *
 * The dark theme also carries a wide top-edge highlight (1px subtle
 * brand-blue line) on dark surface cards (see .dark .surface-card in
 * index.css) so cards visually lift off the page the same way the
 * light theme's shadow-e1 + 1px border does.
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

// Dark theme: 3 brand-blue radials on the navy canvas, positioned to
// mirror the light theme's triangular composition. Each pool is at the
// low end of the v7.3 intensity scale (0.05–0.10) so the page never
// reads as a stage-light mesh.
const GRADIENT_DARK = `
  #060A14,
  radial-gradient(at 18% 22%, rgba(67, 94, 241, 0.10) 0px, transparent 55%),
  radial-gradient(at 88% 12%, rgba(109, 139, 247, 0.07) 0px, transparent 50%),
  radial-gradient(at 75% 88%, rgba(33, 41, 155, 0.10) 0px, transparent 55%)
`;

// Very fine fractal noise — same SVG used in v7.3 but rendered at 0.05
// (dark) / 0.10 (light) so it adds tactile richness without the
// nosy-grain feel reported in v7b. baseFrequency 0.9 keeps the dots
// large enough to read as a soft texture, not a pixel-level dither.
const NOISE_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;

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
          opacity: isDark ? 0.05 : 0.1,
        }}
        aria-hidden="true"
      />
    </>
  );
}

export const BackgroundLayer = memo(BackgroundLayerImpl);

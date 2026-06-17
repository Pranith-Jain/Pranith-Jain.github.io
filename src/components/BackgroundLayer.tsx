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

// Cohesive, dominant-color atmosphere. Two brand-blue pools and one cool
// slate fade give depth without leaving the palette. Dark mode amplifies
// the brand presence by ~2× to create a rich, immersive night aesthetic.
const GRADIENT_LIGHT = `
  radial-gradient(at 18% 22%, rgba(44, 62, 229, 0.16) 0px, transparent 55%),
  radial-gradient(at 88% 18%, rgba(67, 94, 241, 0.10) 0px, transparent 50%),
  radial-gradient(at 75% 88%, rgba(33, 41, 155, 0.12) 0px, transparent 55%),
  radial-gradient(at 40% 60%, rgba(100, 116, 139, 0.06) 0px, transparent 60%)
`;

const GRADIENT_DARK = `
  radial-gradient(at 18% 22%, rgba(44, 62, 229, 0.35) 0px, transparent 55%),
  radial-gradient(at 88% 18%, rgba(67, 94, 241, 0.20) 0px, transparent 50%),
  radial-gradient(at 75% 88%, rgba(33, 41, 155, 0.25) 0px, transparent 55%),
  radial-gradient(at 10% 85%, rgba(18, 22, 73, 0.40) 0px, transparent 60%),
  radial-gradient(at 50% 0%, rgba(18, 22, 73, 0.15) 0px, transparent 50%)
`;

const NOISE_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;

function BackgroundLayerImpl({ isDark }: BackgroundLayerProps): JSX.Element {
  return (
    <>
      <div
        className="fixed inset-0 -z-10 transition-all duration-700 ease-in-out"
        style={{
          background: isDark ? GRADIENT_DARK : GRADIENT_LIGHT,
          opacity: isDark ? 0.8 : 0.5,
        }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 -z-10 pointer-events-none transition-opacity duration-700 ease-in-out"
        style={{
          backgroundImage: NOISE_URL,
          opacity: isDark ? 0.22 : 0.1,
        }}
        aria-hidden="true"
      />
    </>
  );
}

export const BackgroundLayer = memo(BackgroundLayerImpl);

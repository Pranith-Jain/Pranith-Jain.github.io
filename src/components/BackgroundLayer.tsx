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
  /* v6 — deep cool-neutral atmosphere (2026-06-19)
     The page bg is now #090C16 (near-black cool, not overtly blue).
     The atmosphere must be much more restrained — the old blue wash
     would look clownish on a neutral page. This version uses:
       1. A gentle top-lit wash that lifts the page from #090C16 to
          ~#0e1322 at the top, creating a subtle "light from above"
          without introducing a visible hue. The ellipse is wider
          and shallower (90% × 45%) so it feels like soft ambient
          light, not a spotlight.
       2. Asymmetric brand-blue pools at very low opacity (4% and
          2%) — enough to whisper the brand identity without making
          the page look blue. They pop more than before because the
          page is neutral.
       3. A bottom-edge lift that subtly darkens the last 12% so
          the page doesn't end abruptly — the footer sits on a
          slightly deeper base. */
  radial-gradient(ellipse 90% 45% at 50% 0%, rgba(14, 19, 34, 0.8) 0%, transparent 65%),
  radial-gradient(at 85% 92%, rgba(67, 94, 241, 0.04) 0px, transparent 50%),
  radial-gradient(at 15% 8%, rgba(67, 94, 241, 0.02) 0px, transparent 45%),
  linear-gradient(to bottom, transparent 88%, rgba(10, 13, 24, 0.35) 100%)
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

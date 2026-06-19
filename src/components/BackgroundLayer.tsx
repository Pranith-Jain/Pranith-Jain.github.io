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

// True CSS mesh: 5 pools + solid base + screen blend mode.
// Screen blend makes overlapping pools brighter instead of
// muddier — this is the key technique behind Stripe/Linear's
// premium mesh look. Each pool uses a different brand-blue
// shade (400→500→700→600) so overlap regions create organic
// in-family color transitions.
const GRADIENT_DARK = `
  /* Base: solid navy canvas */
  #060A14,

  /* Pool 1 — top-left: brand-400 (brightest light blue) */
  radial-gradient(at 20% 25%, rgba(109, 139, 247, 0.26) 0px, rgba(67, 94, 241, 0.12) 35%, transparent 55%),

  /* Pool 2 — top-right: brand-500 (mid blue) */
  radial-gradient(at 80% 20%, rgba(67, 94, 241, 0.22) 0px, transparent 50%),

  /* Pool 3 — bottom-left: brand-700 (deepest blue) */
  radial-gradient(at 25% 80%, rgba(35, 46, 191, 0.24) 0px, transparent 50%),

  /* Pool 4 — bottom-right: brand-600 (core blue) */
  radial-gradient(at 80% 80%, rgba(44, 62, 229, 0.26) 0px, transparent 50%),

  /* Pool 5 — center: brand-400/500 blend, ties the mesh together */
  radial-gradient(at 50% 50%, rgba(99, 130, 255, 0.12) 0px, transparent 50%)
`;

const NOISE_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.06'/%3E%3C/svg%3E")`;

function BackgroundLayerImpl({ isDark }: BackgroundLayerProps): JSX.Element {
  return (
    <>
      <div
        className={`fixed inset-0 -z-10 transition-all duration-700 ease-in-out ${isDark ? 'mesh-animate' : ''}`}
        style={{
          background: isDark ? GRADIENT_DARK : GRADIENT_LIGHT,
          backgroundBlendMode: isDark ? 'screen' : 'normal',
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

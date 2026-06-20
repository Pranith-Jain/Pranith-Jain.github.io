import { memo } from 'react';

/**
 * Fixed-position gradient overlay used as the page background on
 * both the portfolio render path and the /dfir, /threatintel app paths.
 *
 * Memoized because the layered divs were previously duplicated inline in
 * App.tsx and re-rendered on every route transition. Only `isDark` drives
 * variation. A single soft radial in each theme gives the page a quiet
 * identity beat without the "stage-light" feel of a multi-pool mesh.
 */

interface BackgroundLayerProps {
  isDark: boolean;
}

// Light theme: two asymmetric brand-blue radials (10% / 6% opacity) on
// a white canvas. Subtle enough to give the page a quiet identity beat
// without reading as a stage-light.
const GRADIENT_LIGHT = `
  radial-gradient(at 18% 22%, rgba(44, 62, 229, 0.10) 0px, transparent 55%),
  radial-gradient(at 88% 88%, rgba(33, 41, 155, 0.06) 0px, transparent 55%)
`;

// Dark theme: solid navy canvas with a single soft brand-blue wash
// in the top-right. The 5-pool mesh + grain overlay it replaced read
// as the generic AI "stage-light + grain" combo.
const GRADIENT_DARK = `
  #060A14,
  radial-gradient(at 88% 12%, rgba(67, 94, 241, 0.12) 0px, transparent 55%)
`;

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
    </>
  );
}

export const BackgroundLayer = memo(BackgroundLayerImpl);

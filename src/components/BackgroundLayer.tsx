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

// BackgroundLayer renders a single low-opacity brand-blue pool at the
// top-left, dark mode only. One pool, one color, one corner. No
// second indigo pool, no noise overlay, no mesh.
//
// This is the smallest decoration that gives the page atmospheric
// depth without re-introducing the AI-slop tells the
// remove-ai-slop audit banned: a single brand-tinted radial at
// 8% opacity with a 50% spread is below the 'stage-light mesh'
// threshold (which the audit pegged at 10%+ for 2+ pools).
// Light mode skips it entirely so the page stays flat white.

const POOL_DARK = `radial-gradient(at 18% 22%, rgba(67, 94, 241, 0.08) 0px, transparent 50%)`;

function BackgroundLayerImpl({ isDark }: BackgroundLayerProps): JSX.Element | null {
  if (!isDark) return null;
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" style={{ background: POOL_DARK }} aria-hidden="true" />
  );
}

export const BackgroundLayer = memo(BackgroundLayerImpl);

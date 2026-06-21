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

// BackgroundLayer previously rendered a 4-pool radial-gradient mesh
// plus an SVG-noise grain overlay (the canonical 'stage-light + paper-
// grain' AI-slop pattern per the remove-ai-slop audit). Both were
// decorative — they added no information — so the page now ships
// with a flat dark/light base color set on `html.dark` / `html` in
// index.css. The component stays (in case future decoration is
// warranted) but renders nothing.

function BackgroundLayerImpl(_props: BackgroundLayerProps): JSX.Element {
  return null;
}

export const BackgroundLayer = memo(BackgroundLayerImpl);

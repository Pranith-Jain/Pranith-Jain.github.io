import type { DonutSlice } from './SocCharts';

const OTHER_COLOR = '#475569';

/**
 * Fold donut slices whose share of the total is below `threshold` (a fraction,
 * e.g. 0.02 = 2%) into a single "Other" slice. Eliminates the unreadable
 * "sliver" rings that appear when a donut has many tiny categories. Output is
 * sorted descending with "Other" forced last.
 */
export function groupSmallSlices(slices: DonutSlice[], threshold: number): DonutSlice[] {
  if (slices.length === 0) return [];
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return slices.slice();

  let otherValue = 0;
  const kept: DonutSlice[] = [];
  for (const s of slices) {
    if (s.label === 'Other' || s.value / total < threshold) {
      otherValue += s.value;
    } else {
      kept.push(s);
    }
  }
  kept.sort((a, b) => b.value - a.value);
  if (otherValue > 0) kept.push({ label: 'Other', value: otherValue, color: OTHER_COLOR });
  return kept;
}

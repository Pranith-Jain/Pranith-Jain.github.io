import { describe, it, expect } from 'vitest';
import { groupSmallSlices } from './slices';

const S = (label: string, value: number) => ({ label, value, color: '#000' });

describe('groupSmallSlices', () => {
  it('folds sub-threshold slices into a single Other slice', () => {
    const out = groupSmallSlices([S('A', 90), S('B', 6), S('C', 3), S('D', 1)], 0.05);
    expect(out.map((s) => s.label)).toEqual(['A', 'B', 'Other']);
    expect(out.find((s) => s.label === 'Other')?.value).toBe(4);
  });
  it('returns slices unchanged when none are below threshold', () => {
    const out = groupSmallSlices([S('A', 50), S('B', 50)], 0.05);
    expect(out.map((s) => s.label)).toEqual(['A', 'B']);
  });
  it('never emits an Other slice of value 0', () => {
    const out = groupSmallSlices([S('A', 100)], 0.05);
    expect(out.some((s) => s.label === 'Other')).toBe(false);
  });
  it('sorts descending and keeps an existing Other merged', () => {
    const out = groupSmallSlices([S('A', 10), S('Other', 5), S('B', 80), S('C', 1)], 0.05);
    expect(out[0].label).toBe('B');
    expect(out.find((s) => s.label === 'Other')?.value).toBe(6);
  });
  it('handles empty input', () => {
    expect(groupSmallSlices([], 0.05)).toEqual([]);
  });
});

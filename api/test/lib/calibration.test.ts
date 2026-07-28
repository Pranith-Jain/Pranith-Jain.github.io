import { describe, it, expect } from 'vitest';
import { buildCalibrationHint } from '../../src/lib/agent/confidence-calibration';

describe('buildCalibrationHint', () => {
  it('returns empty string when there is insufficient data', () => {
    expect(buildCalibrationHint({})).toBe('');
    expect(buildCalibrationHint({ high: { total: 2, accuracy: 90 } })).toBe('');
  });

  it('summarises confidence levels with enough samples', () => {
    const hint = buildCalibrationHint({
      high: { total: 20, accuracy: 72 },
      medium: { total: 10, accuracy: 55 },
      low: { total: 1, accuracy: 30 },
    });
    expect(hint).toContain('high 72% accurate (20 reports)');
    expect(hint).toContain('medium 55% accurate (10 reports)');
    // low excluded — below minSamples
    expect(hint).not.toContain('low ');
    expect(hint).toContain('<calibration>');
  });

  it('respects a custom minSamples threshold', () => {
    const hint = buildCalibrationHint({ high: { total: 3, accuracy: 80 } }, 3);
    expect(hint).toContain('high 80% accurate');
  });
});

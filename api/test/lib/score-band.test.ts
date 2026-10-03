import { describe, it, expect } from 'vitest';
import {
  bandScore,
  bandCvss,
  bandEpss,
  isActionable,
  SCORE_BANDS,
  SCORE_BAND_THRESHOLDS,
  SCORE_BAND_LABEL,
  type ScoreBand,
} from '../../src/lib/score-band';

/**
 * The load-bearing behaviour is the `unknown` rule: an uncomputable score must
 * never band as low/informational. Same defect class as the `btcAbuseCheck`
 * fix, where a failed lookup returned `count: 0` and an LLM concluded the
 * wallet was clean.
 */

describe('bandScore — thresholds', () => {
  it('bands on the documented boundaries', () => {
    expect(bandScore(100).band).toBe('critical');
    expect(bandScore(85).band).toBe('critical');
    expect(bandScore(84).band).toBe('high');
    expect(bandScore(70).band).toBe('high');
    expect(bandScore(69).band).toBe('medium');
    expect(bandScore(40).band).toBe('medium');
    expect(bandScore(39).band).toBe('low');
    expect(bandScore(20).band).toBe('low');
    expect(bandScore(19).band).toBe('informational');
    expect(bandScore(0).band).toBe('informational');
  });

  it('thresholds are strictly decreasing so no gap can open up', () => {
    const t = SCORE_BAND_THRESHOLDS;
    expect(t.critical).toBeGreaterThan(t.high);
    expect(t.high).toBeGreaterThan(t.medium);
    expect(t.medium).toBeGreaterThan(t.low);
  });

  it('is exhaustive: every band has a label', () => {
    for (const b of SCORE_BANDS) expect(SCORE_BAND_LABEL[b]).toBeTruthy();
  });

  it('covers the whole 0-100 range with no undefined band', () => {
    for (let s = 0; s <= 100; s++) {
      expect(SCORE_BANDS).toContain(bandScore(s).band);
    }
  });
});

describe('bandScore — unknown is never reassuring', () => {
  it('treats null as unknown, not low', () => {
    const b = bandScore(null);
    expect(b.band).toBe('unknown');
    expect(b.band).not.toBe('low');
    expect(b.band).not.toBe('informational');
    expect(b.score).toBeNull();
  });

  it('treats undefined and NaN as unknown too', () => {
    expect(bandScore(undefined).band).toBe('unknown');
    expect(bandScore(Number.NaN).band).toBe('unknown');
  });

  it('says "unassessed", never "no risk"', () => {
    const b = bandScore(null);
    expect(b.rationale).toMatch(/unassessed/i);
    expect(b.rationale).not.toMatch(/no risk|clean|safe/i);
  });

  it('gives unknown a neutral colour, not a green one', () => {
    // A "good" colour on an unassessed finding is the bug this prevents.
    expect(bandScore(null).className).toBe(SCORE_BAND_LABEL.unknown ? bandScore(null).className : '');
    expect(bandScore(null).className).not.toContain('emerald');
    expect(bandScore(null).className).not.toContain('green');
  });

  it('is not actionable', () => {
    expect(isActionable(bandScore(null).band)).toBe(false);
  });
});

describe('bandScore — evidence strength', () => {
  it('escalates with corroborating source count', () => {
    expect(bandScore(80, { sourceCount: 1 }).evidence).toBe('weak');
    expect(bandScore(80, { sourceCount: 2 }).evidence).toBe('moderate');
    expect(bandScore(80, { sourceCount: 3 }).evidence).toBe('strong');
  });

  it('does not let source count change the band itself', () => {
    const bands = [1, 2, 5, 10].map((n) => bandScore(80, { sourceCount: n }).band);
    expect(new Set(bands).size).toBe(1);
  });

  it('treats a missing source count as unverified', () => {
    expect(bandScore(80).evidence).toBe('weak');
  });
});

describe('bandScore — robustness', () => {
  it('clamps out-of-range values instead of throwing', () => {
    expect(bandScore(1000).score).toBe(100);
    expect(bandScore(1000).band).toBe('critical');
    expect(bandScore(-5).score).toBe(0);
    expect(bandScore(-5).band).toBe('informational');
  });

  it('rounds fractional scores', () => {
    expect(bandScore(84.6).score).toBe(85);
  });

  it('accepts a label override without changing the band', () => {
    const b = bandScore(95, { label: 'KEV-listed' });
    expect(b.label).toBe('KEV-listed');
    expect(b.band).toBe('critical');
  });
});

describe('bandCvss', () => {
  it('maps CVSS severity labels rather than scaling linearly', () => {
    expect(bandCvss(9.8).band).toBe('critical');
    expect(bandCvss(9.0).band).toBe('critical');
    expect(bandCvss(7.5).band).toBe('high');
    expect(bandCvss(7.0).band).toBe('high');
    expect(bandCvss(4.9).band).toBe('medium');
    expect(bandCvss(4.0).band).toBe('medium');
    expect(bandCvss(0.1).band).toBe('low');
    expect(bandCvss(0).band).toBe('informational');
  });

  it('does not collapse 7.5 and 9.8 into the same band', () => {
    expect(bandCvss(7.5).band).not.toBe(bandCvss(9.8).band);
  });

  it('clamps to the 0-10 CVSS range', () => {
    expect(bandCvss(12).score).toBe(100);
    expect(bandCvss(-1).score).toBe(0);
  });

  it('reports unknown for a missing CVSS', () => {
    const b = bandCvss(null);
    expect(b.band).toBe('unknown');
    expect(b.label).toBe('CVSS unknown');
  });
});

describe('bandEpss', () => {
  it('bands the probability on a shifted scale', () => {
    expect(bandEpss(0.9).band).toBe('critical');
    expect(bandEpss(0.5).band).toBe('critical');
    expect(bandEpss(0.3).band).toBe('high');
    expect(bandEpss(0.25).band).toBe('high');
    expect(bandEpss(0.15).band).toBe('medium');
    expect(bandEpss(0.1).band).toBe('medium');
    expect(bandEpss(0.02).band).toBe('low');
    expect(bandEpss(0.005).band).toBe('informational');
  });

  it('states the 30-day horizon in the rationale', () => {
    expect(bandEpss(0.5).rationale).toMatch(/30 days/);
  });

  it('reports unknown for a missing probability', () => {
    expect(bandEpss(null).band).toBe('unknown');
  });

  it('accepts a 0-100 EPSS value without exploding', () => {
    // Defensive: some feeds send percent, others send 0-1.
    expect(bandEpss(50).band).toBe('critical');
  });
});

describe('isActionable', () => {
  it('flags only critical and high', () => {
    const actionable = SCORE_BANDS.filter(isActionable);
    expect(actionable).toEqual<ScoreBand[]>(['critical', 'high']);
  });

  it('excludes unknown', () => {
    expect(isActionable('unknown')).toBe(false);
  });
});

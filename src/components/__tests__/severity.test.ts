import { describe, it, expect } from 'vitest';
import { normalizeSeverity, SEVERITY_TONE, SEVERITY_BAR, type Severity } from '../severity';

describe('normalizeSeverity', () => {
  it.each([
    ['critical', 'critical'],
    ['CRITICAL', 'critical'],
    ['Critical', 'critical'],
    ['  high  ', 'high'],
    ['Medium', 'medium'],
    ['low', 'low'],
  ])('normalizes %s -> %s', (input, expected) => {
    expect(normalizeSeverity(input)).toBe(expected);
  });

  it('maps synonyms onto the canonical ramp', () => {
    // Upstreams disagree on vocabulary; these all mean the same step.
    expect(normalizeSeverity('moderate')).toBe('medium');
    expect(normalizeSeverity('important')).toBe('high');
    expect(normalizeSeverity('informational')).toBe('info');
    expect(normalizeSeverity('severe')).toBe('critical');
  });

  it('matches accented, decomposed, and unaccented spellings alike', () => {
    // "í" exists as precomposed U+00ED and as i + combining acute. A test
    // literal is whichever the editor produced, so a naive case list matches
    // one form and silently misses the other — which is exactly the bug this
    // suite caught. Diacritic stripping makes all three agree.
    expect(normalizeSeverity('crítico')).toBe('critical');
    expect(normalizeSeverity('critico')).toBe('critical');
    expect(normalizeSeverity('critica')).toBe('critical');
    expect(normalizeSeverity('medio')).toBe('medium');
    expect(normalizeSeverity('bajo')).toBe('low');
    expect(normalizeSeverity('severo')).toBe('critical');
  });

  it("maps CVSS's 'None' to info rather than low", () => {
    // CVSS emits None for "no severity assigned" — that is genuinely info,
    // not a low-severity finding.
    expect(normalizeSeverity('None')).toBe('info');
  });

  it('falls back to low for unknown and missing values', () => {
    // Deliberately NOT 'info': an unrecognised value from a feed is missing
    // data, and rendering it as informational would downgrade a real finding
    // to a footnote.
    expect(normalizeSeverity('weird')).toBe('low');
    expect(normalizeSeverity(null)).toBe('low');
    expect(normalizeSeverity(undefined)).toBe('low');
    expect(normalizeSeverity('')).toBe('low');
  });
});

describe('severity ramps', () => {
  it('covers every canonical level in both maps', () => {
    const levels: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    for (const level of levels) {
      expect(SEVERITY_TONE[level], `SEVERITY_TONE.${level}`).toBeTruthy();
      expect(SEVERITY_BAR[level], `SEVERITY_BAR.${level}`).toBeTruthy();
    }
  });

  it('renders low as neutral slate, never green', () => {
    // The whole point of the documented ramp: a low-severity finding is still
    // a finding, and green reads as "safe/done". CisaKevCatalog used to map
    // Low to emerald, which is what motivated centralising this.
    expect(SEVERITY_TONE.low).toContain('slate');
    expect(SEVERITY_TONE.low).not.toMatch(/emerald|green/);
    expect(SEVERITY_BAR.low).toContain('slate');
  });
});

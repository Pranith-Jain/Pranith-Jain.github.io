import { describe, it, expect } from 'vitest';
import { detectSlop } from '../../src/lib/ai-output-validator';
import { normalizeDashesAndSemicolons } from '../../src/case-study/generation/social';

describe('normalizeDashesAndSemicolons (social voice punctuation bans)', () => {
  it('replaces an em-dash before an uppercase word with a period', () => {
    expect(normalizeDashesAndSemicolons('The encryptor ran on day 11 — The detection existed on day 1.')).toBe(
      'The encryptor ran on day 11. The detection existed on day 1.'
    );
  });

  it('replaces an em-dash mid-sentence with a comma when continuing lowercase', () => {
    expect(normalizeDashesAndSemicolons('Same haul — second auction. That is churn.')).toBe(
      'Same haul, second auction. That is churn.'
    );
  });

  it('converts semicolons to sentence breaks', () => {
    expect(normalizeDashesAndSemicolons('Patch the edge appliance; rotate the credentials next.')).toBe(
      'Patch the edge appliance. Rotate the credentials next.'
    );
  });

  it('leaves hyphenated compounds, ranges, and CVE ids untouched', () => {
    const input = 'CVE-2026-1234 hit a supply-chain product; 1-2 days of dwell time followed.';
    // semicolon still converts, hyphens stay
    expect(normalizeDashesAndSemicolons(input)).toBe(
      'CVE-2026-1234 hit a supply-chain product. 1-2 days of dwell time followed.'
    );
  });

  it('preserves numeric en-dash ranges (factual data, not punctuation)', () => {
    expect(normalizeDashesAndSemicolons('campaign ran 2020–2024 across 10–15 sectors.')).toBe(
      'campaign ran 2020–2024 across 10–15 sectors.'
    );
  });

  it('does not capitalize pre-existing lowercase sentence starts or mid-sentence words', () => {
    const input = 'lockbit posted again. tracking the affiliate churn — it repeats quarterly.';
    const out = normalizeDashesAndSemicolons(input);
    expect(out.startsWith('lockbit')).toBe(true); // twitter lowercase voice preserved
    expect(out).toContain('it repeats');
  });

  it('collapses doubled separators produced by consecutive dashes', () => {
    expect(normalizeDashesAndSemicolons('A — B — c.')).toBe('A. B, c.');
  });
});

describe('detectSlop (reference ban list)', () => {
  it('flags AI slop verbs and corporate filler from the expanded ban list', () => {
    const text = 'This tool lets you leverage telemetry seamlessly to unlock detections across your ecosystem.';
    const labels = detectSlop(text).map((s) => s.label);
    expect(labels).toContain('AI slop verb');
    expect(labels).toContain('AI slop adverb');
    expect(labels).toContain('corporate filler');
  });

  it('does not flag clean practitioner copy', () => {
    expect(detectSlop('LockBit listed 14 victims. 4 were already on another affiliate site this quarter.')).toHaveLength(
      0
    );
  });
});

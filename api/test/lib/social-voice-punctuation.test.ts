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

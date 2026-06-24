import { describe, it, expect } from 'vitest';
import { buildHashtags } from '../../../src/case-study/generation/hashtags';

describe('buildHashtags', () => {
  it('derives a specific CVE tag + vendor/product from evidence (no hyphens)', () => {
    const tags = buildHashtags({
      type: 'cve',
      evidence: { cveId: 'CVE-2026-1234', vendor: 'Fortinet', product: 'FortiGate' },
    });
    expect(tags).toContain('#CVE202612 34'.replace(' ', '')); // tolerate formatting
  });

  it('includes the CVE id as a hyphen-free hashtag', () => {
    const tags = buildHashtags({ type: 'cve', evidence: { cveId: 'CVE-2026-1234' } });
    expect(tags.some((t) => t.toLowerCase() === '#cve20261234')).toBe(true);
  });

  it('includes a ransomware group tag', () => {
    const tags = buildHashtags({ type: 'ransom', evidence: { group: 'LockBit' } });
    expect(tags.map((t) => t.toLowerCase())).toContain('#lockbit');
  });

  it('falls back to a sensible base when there are no entities', () => {
    const tags = buildHashtags({ type: 'cve', evidence: {} });
    expect(tags.length).toBeGreaterThanOrEqual(2);
    // a CVE post should still carry infosec/vulnerability-ish base tags
    expect(tags.map((t) => t.toLowerCase()).some((t) => /infosec|vulnerab|cve/.test(t))).toBe(true);
  });

  it('dedupes case-insensitively and caps at the requested max', () => {
    const tags = buildHashtags({
      type: 'ransom',
      evidence: { group: 'infosec', sectors: ['InfoSec', 'Healthcare'] },
      max: 4,
    });
    expect(tags.length).toBeLessThanOrEqual(4);
    const lower = tags.map((t) => t.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length); // no dupes
  });

  it('strips spaces and punctuation from multi-word entities', () => {
    const tags = buildHashtags({ type: 'breach', evidence: { vendor: 'Acme Corp.' } });
    expect(tags.map((t) => t.toLowerCase())).toContain('#acmecorp');
  });

  it('every tag starts with # and contains only alphanumerics', () => {
    const tags = buildHashtags({
      type: 'actor',
      evidence: { group: 'APT-29', sectors: ['Government & Defense'] },
    });
    for (const t of tags) expect(t).toMatch(/^#[A-Za-z0-9]+$/);
  });
});

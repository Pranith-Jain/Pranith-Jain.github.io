import { describe, it, expect } from 'vitest';
import { backCategoryFor, __TEST_ONLY } from './back-link';

describe('backCategoryFor', () => {
  it('maps a threat-intel tool slug to /threatintel/c/<cat>', () => {
    expect(backCategoryFor('/threatintel/writeups')).toBe('/threatintel/c/knowledge');
    expect(backCategoryFor('/threatintel/cve-list')).toBe('/threatintel/c/ioc-detection');
    expect(backCategoryFor('/threatintel/ransomware-activity')).toBe('/threatintel/c/ransomware');
  });

  it('maps a dfir tool slug to /dfir/tools/<group>', () => {
    expect(backCategoryFor('/dfir/ioc-check')).toBe('/dfir/tools/core-dfir');
    expect(backCategoryFor('/dfir/domain')).toBe('/dfir/tools/investigation');
    expect(backCategoryFor('/dfir/prompt-injection')).toBe('/dfir/tools/aisec');
  });

  it('returns null for unknown / off-surface paths', () => {
    expect(backCategoryFor('/threatintel/about')).toBeNull(); // not in SECTIONS
    expect(backCategoryFor('/dfir/unknown-tool')).toBeNull();
    expect(backCategoryFor('/threatintel/c/ransomware')).toBeNull(); // already a category page
    expect(backCategoryFor('/blog/some-post')).toBeNull();
  });

  it('routes 3-segment threatintel tab routes to hub base or category', () => {
    // Hub with category mapping: go to category hub
    expect(backCategoryFor('/threatintel/briefings/daily-2026-05-19')).toBe('/threatintel/c/cti-platforms');
    expect(backCategoryFor('/threatintel/actors/APT28')).toBe('/threatintel/c/adversary');
    // Hub without category mapping: go to hub base
    expect(backCategoryFor('/threatintel/social/firehose')).toBe('/threatintel/social');
    expect(backCategoryFor('/threatintel/cves/cves')).toBe('/threatintel/cves');
  });

  // Drift guard: every threat-intel slug declared in the back-link map points
  // to a real category id. Categories live inside Home.tsx — we hardcode the
  // valid set here. If a category is renamed in Home.tsx, this list needs to
  // change in lockstep and the test will fail until both are updated.
  it('every threat-intel mapping points to a real Home.tsx category id', () => {
    const VALID_CATEGORIES = new Set([
      'ransomware',
      'darkweb-breach',
      'feeds-news',
      'cti-platforms',
      'soc-dashboards',
      'ioc-detection',
      'adversary',
      'knowledge',
    ]);
    for (const [slug, cat] of Object.entries(__TEST_ONLY.THREATINTEL_TOOL_TO_CATEGORY)) {
      expect(VALID_CATEGORIES.has(cat), `slug "${slug}" points to unknown category "${cat}"`).toBe(true);
    }
  });
});

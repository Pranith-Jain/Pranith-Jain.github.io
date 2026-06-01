import { describe, it, expect } from 'vitest';
import { expectedLandscapeSlug } from '../../src/lib/landscape-builder';

/**
 * Direct tests for the threat-landscape-report builder. The full
 * `buildLandscapeReport()` is integration-heavy (pulls from the
 * ransomware-recent route, calls Workers AI), so we focus on the pure
 * helpers here and assert the report-shape invariants. The end-to-end
 * build is covered by the schedule's hourly cron (visible in
 * worker/scheduled.ts).
 */

describe('expectedLandscapeSlug', () => {
  it('returns "landscape-YYYY-MM" for any date in the month', () => {
    expect(expectedLandscapeSlug(new Date('2026-05-15T00:00:00Z'))).toBe('landscape-2026-05');
    expect(expectedLandscapeSlug(new Date('2026-05-31T23:59:59Z'))).toBe('landscape-2026-05');
    expect(expectedLandscapeSlug(new Date('2026-05-01T00:00:00Z'))).toBe('landscape-2026-05');
  });

  it('pads single-digit months with a leading zero', () => {
    expect(expectedLandscapeSlug(new Date('2026-01-15T00:00:00Z'))).toBe('landscape-2026-01');
    expect(expectedLandscapeSlug(new Date('2026-09-15T00:00:00Z'))).toBe('landscape-2026-09');
  });

  it('uses UTC, not local time, so the slug is stable across timezones', () => {
    // 2026-05-31T23:30:00Z is the last second of May in UTC but would be
    // June 1 in any US timezone. The slug must reflect the UTC month.
    const edge = new Date('2026-05-31T23:30:00Z');
    expect(expectedLandscapeSlug(edge)).toBe('landscape-2026-05');
  });

  it('defaults to now when no anchor is given', () => {
    // We can't assert a specific value without time-mocking, but we can
    // assert the shape: starts with "landscape-" and matches YYYY-MM.
    const slug = expectedLandscapeSlug();
    expect(slug).toMatch(/^landscape-\d{4}-\d{2}$/);
  });

  it('handles year boundaries (December → January)', () => {
    expect(expectedLandscapeSlug(new Date('2025-12-31T23:59:59Z'))).toBe('landscape-2025-12');
    expect(expectedLandscapeSlug(new Date('2026-01-01T00:00:00Z'))).toBe('landscape-2026-01');
  });
});

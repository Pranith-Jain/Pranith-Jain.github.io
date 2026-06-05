import { describe, it, expect } from 'vitest';
import { computeDailyWindow, computeLiveDailyWindow } from '../../src/lib/briefing-window';

describe('computeDailyWindow (48h calendar-day)', () => {
  it('produces a 48h window ending at start-of-today UTC', () => {
    // 2026-06-05 04:30:00Z → window is 2026-06-03 00:00 → 2026-06-05 00:00
    const anchor = new Date('2026-06-05T04:30:00Z');
    const { start, end, slug, rangeLabel } = computeDailyWindow(anchor);
    expect(start.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-06-05T00:00:00.000Z');
    expect(slug).toBe('daily-2026-06-04');
    expect(rangeLabel).toBe('2026-06-03 – 2026-06-04 (48h)');
  });

  it('crosses a month boundary correctly', () => {
    const anchor = new Date('2026-07-01T00:30:00Z');
    const { start, end, slug, rangeLabel } = computeDailyWindow(anchor);
    expect(start.toISOString()).toBe('2026-06-29T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(slug).toBe('daily-2026-06-30');
    expect(rangeLabel).toBe('2026-06-29 – 2026-06-30 (48h)');
  });
});

describe('computeLiveDailyWindow (48h ending at "now")', () => {
  it('produces a 48h window ending at the current instant and slugs to today', () => {
    const now = new Date('2026-06-05T05:10:54Z');
    const { start, end, slug, rangeLabel } = computeLiveDailyWindow(now);
    expect(start.toISOString()).toBe('2026-06-03T05:10:54.000Z');
    expect(end.toISOString()).toBe('2026-06-05T05:10:54.000Z');
    expect(slug).toBe('daily-2026-06-05');
    expect(rangeLabel).toBe('2026-06-03 – 2026-06-05 (48h, live)');
  });

  it('morning build: live window differs from calendar-day window', () => {
    // The heal at 06:00 on 2026-06-05 must write to daily-2026-06-05.
    // computeDailyWindow(same instant) would write to daily-2026-06-04
    // (yesterday's slug) because the calendar-day window ends at
    // start-of-today. The live variant overrides both end and slug so
    // the heal and the build agree on the row.
    const now = new Date('2026-06-05T06:00:00Z');
    const live = computeLiveDailyWindow(now);
    const cal = computeDailyWindow(now);
    expect(live.slug).toBe('daily-2026-06-05');
    expect(cal.slug).toBe('daily-2026-06-04');
    expect(live.end.getTime()).toBe(now.getTime());
    expect(cal.end.getTime()).toBe(new Date('2026-06-05T00:00:00Z').getTime());
  });
});

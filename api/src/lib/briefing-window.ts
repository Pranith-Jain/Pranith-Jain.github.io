/**
 * Daily briefing window — 24h ending at the start of "today" UTC.
 *
 * `isoDate` is intentionally not imported here — the caller is `buildBriefing`
 * in `briefing-builder.ts` which already has it. We only export the pure
 * window math so it's unit-testable without Workers-only deps.
 */

export interface DailyWindow {
  start: Date;
  end: Date;
  /** "YYYY-MM-DD" of the calendar day this briefing labels itself with. */
  slug: string;
  /** Human-readable range, e.g. "2026-06-04 – 2026-06-04 (24h)". */
  rangeLabel: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function computeDailyWindow(anchor: Date): DailyWindow {
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  const start = new Date(end.getTime() - 86400_000);
  return {
    start,
    end,
    slug: `daily-${isoDate(start)}`,
    rangeLabel: `${isoDate(start)} – ${isoDate(start)} (24h)`,
  };
}

/**
 * "Live" daily — window is the 24h ending at the current instant, NOT at
 * the start of today. Used by the hourly heal to give a `daily-${today}`
 * row that analysts can open right now (the dedicated 00:30 cron only
 * writes the prior day's briefing). The slug is always today's calendar
 * day so the page URL is stable; the exec summary and the briefing header
 * spell out that the window ends "now" so it's clear the data is partial.
 */
export function computeLiveDailyWindow(now: Date): DailyWindow {
  const start = new Date(now.getTime() - 86400_000);
  return {
    start,
    end: now,
    slug: `daily-${isoDate(now)}`,
    rangeLabel: `${isoDate(start)} – ${isoDate(now)} (24h, live)`,
  };
}

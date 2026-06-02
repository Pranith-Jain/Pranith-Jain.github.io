# Weekly briefings roll up their daily briefings

**Date:** 2026-06-02
**Status:** Approved
**Trigger:** `weekly-2026-W22` shows 5 findings / 0 IOCs / 0 critical / 0 high, while its
sibling weeks and its own constituent dailies are rich.

## Problem

Weekly briefings re-query **live, recent-only feeds** (abuse.ch IOC feeds,
cvefeed.io RSS, NVD-recent) for a _historical_ 7-day window. When a weekly is
built late — W22 (week of 2026-05-25 – 2026-05-31) was generated
`2026-06-02T08:01`, ~2 days after the week ended — those feeds have already
rolled past the window, so date-filtering yields nothing:

- abuse.ch feeds → 0 IOCs in window
- NVD-recent → 0 CVEs for the old range
- only CISA KEV survives (full catalog, filterable by `dateAdded`) → 5 KEV
  findings, and the per-CVE NVD CVSS lookup also failed → severity 0/0/0/0

The faithful record of the week already exists: the **7 daily briefings** inside
the window each captured the real IOCs/CVEs at the time (May 25–31 dailies sum to
~742 findings / 109 critical / 503 high / ~8,700 IOC-observations).

A past week **cannot** be reconstructed from live feeds. The dailies are the only
source of truth, so the weekly must roll them up.

### Why it stays broken

- `isBriefingRich` treats W22 as "rich" (5 findings > 0), so the hourly self-heal
  (`worker/scheduled.ts`) skips it forever.
- W22 is not flagged `degraded` (KEV succeeded; only NVD failed →
  `degraded = !kevR.ok && !nvdR.ok` is false), so the degraded-heal path never
  engages either.

## Fix

### Part 1 — Builder: weekly merges in its dailies (`api/src/lib/briefing-builder.ts`)

New helper `aggregateWeeklyFromDailies(db, rangeStartIso, rangeEndIso)`:

- Query `SELECT slug, stats_json, body FROM briefings WHERE type='daily' AND
date >= ? AND date <= ?` (inclusive Monday→Sunday).
- Parse each daily `body` (full `Briefing` JSON). Stored daily bodies preserve
  per-finding `id`, `severity`, `cvss`, `source`, `mitre_techniques`, so findings
  are fully recoverable.
- Returns: CVE findings (deduped by uppercased CVE id, preferring the copy with a
  known CVSS), ransomware findings (deduped by id), `iocsTotal` (sum of the 7
  daily `stats.iocs`), merged+capped IOC display buckets, union of daily
  `sources`, and `dailyCount`.

In `buildBriefing`'s weekly path, after the existing live fetch and **before**
`buildStats`, when `env.BRIEFINGS_DB` is bound and `dailyCount > 0`:

- `findings = unionByCveId([...liveFindings, ...rollup.findings])`
- `ransomwareFindings = dedupById([...live, ...rollup]).slice(0, 60)`
- `iocsRawTotal = max(liveUniqueCount, rollup.iocsTotal)`
- IOC display buckets = the richer of live vs merged-daily buckets
- `sources = union(liveSources, rollup.sources)`
- stats (`cves`, `kevs`, `critical/high/medium/low`, `findings`) recomputed from
  the merged findings — accurate, because dailies carry real severities.

**IOC semantics:** raw indicators are NOT recoverable from stored bodies (capped
at 30/type), so the weekly IOC total is the **sum of daily unique counts** — an
honest "indicators observed across the week" figure, not a cross-day-deduped
count. The executive summary wording reflects this.

If no dailies exist (retention swept them), the path falls back to today's
pure-live behavior — never worse than current.

Result: every weekly is a **superset** of its dailies. On-time weeklies are
unaffected (live ≈ dailies); late ones inherit the dailies' richness. Recurrence
prevented for W23+.

### Part 2 — Self-heal auto-repairs sparse weeklies (`worker/scheduled.ts`)

New predicate `weeklyUndercountsDailies(db, weeklySlug, rangeStartIso,
rangeEndIso)`: true when the stored weekly's `findings` (or `iocs`) is far below
the sum of its constituent dailies (threshold: weekly < 0.5 × daily-sum).

The hourly weekly self-heal already targets the current weekly slug (which **is**
W22 right now). Add `weeklyUndercountsDailies` as an extra heal trigger alongside
`briefingNeedsHeal`. Combined with Part 1, the cron auto-repairs W22 within the
hour after deploy — **no admin token needed** — then converges (post-rebuild the
weekly is no longer sparse, so it stops rebuilding; no thrash).

## Testing (TDD, `api/test/lib/briefing-builder.test.ts`)

- `aggregateWeeklyFromDailies`: union dedup keeps the CVSS-bearing copy; severity
  counts recompute correctly; `iocsTotal` sums daily uniques; ransomware deduped.
- weekly merge: `max` IOC selection; empty-dailies falls back to live.
- `weeklyUndercountsDailies`: fires when weekly ≪ daily-sum; false after a
  rich rebuild.

## Expected result for W22

~742 findings / 5 KEVs / ~109 critical / ~503 high / ~8,700 IOCs — in line with
siblings W21 (443/3,685) and W20 (909/5,023), instead of 5/0/0/0.

## Deploy

Per `deploy-checklist`: deploy from repo root (two wranglers). After deploy the
hourly cron self-repairs W22; can also force immediately via the admin build
endpoint.

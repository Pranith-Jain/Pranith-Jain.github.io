# Briefing Cron Safety

**Category:** Maintenance / manual

## Loop Description

After touching the weekly-briefing or self-heal cron, verify it stays within the
Free-plan limits: at most ONE briefing build per invocation, and at most 50 subrequests
per invocation (KV and Cache-API operations both count). Loop until the invocation is
provably within budget.

**Heal architecture (maintainer's call, 2026-06-10; extended 2026-06-21):** the
daily/weekly self-heal runs **inline at the END of the `0 * * * *` hourly cron**,
NOT in a dedicated `20 * * * *` cron. wrangler crons are the 4:
`0 * * * *`, `5 0 * * *`, `30 0 * * *`, `45 0 * * 1`.
Do **not** re-introduce a dedicated heal cron / `runBriefingHealOnce` — that was tried
and explicitly reverted.

The inline heal fires a single `buildBriefing` per tick. Three gates, evaluated in
order; the first that returns true wins:

1. `briefingNeedsHeal` (30-min cooldown) — row is missing, empty, or degraded.
2. `dailyNeedsCveReenrich` (3h cooldown) — row is "rich" (IOCs > 0) but has zero
   CVE findings, the NVD-lag signature. Re-fetches the build.
3. `dailyNeedsRansomwareReenrich` (3h cooldown, added 2026-06-21) — row is
   "rich" (CVE findings > 0 OR IOCs > 0) but `ransomware_victims === 0`. Closes
   the gap where a transient upstream failure on the original 00:30 build left the
   ransomware section empty, but the rest of the briefing was non-empty so the
   primary gate never re-fired. Without this gate, a daily with findings+IOCs but
   no ransomware would stay that way forever.

In addition to the closed-daily heal above, the inline path ALSO rebuilds today's
`live` daily (slug = `daily-<today>`) via `computeLiveDailyWindow`. The 00:30
cron only writes the prior calendar day by design; the live heal guarantees the
public page always has a current row mid-day. Cheap D1 read, only one build fires
per heal tick.

The accepted tradeoff is that the inline heal runs after the cache-warm fan-out,
so under subrequest pressure it can write a transient _degraded_ daily (IOCs only,
no CVE/KEV findings); it self-corrects on a later tick via gate 2. For an
immediate full rebuild, use `POST /api/v1/briefings/build?type=daily` (admin
token) — a dedicated request with a fresh 50-subrequest budget.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Self-heal lives **inline in `0 * * * *`**; do NOT add a dedicated `20 * * * *` heal
  cron (it was reverted on 2026-06-10). The inline heal must stay conditional — a cheap
  `briefingNeedsHeal` D1 read, with the source fetches firing ONLY when the row is
  empty/degraded/missing — so a healthy hour is effectively free.
- Do NOT do more than one build per invocation to "catch up" — that blows the
  50-subrequest cap. A backlog of stale rows drains over successive hourly ticks.
- Do NOT add per-provider cache ops inside the IOC fan-out; it must use ONE batched KV
  read + write (`primeBatch`/`flushBatch`).
- Do NOT raise the assumed subrequest budget above 50 to make the count pass — the cap
  is the platform limit, not a tunable.
- Keep every upstream `await` in `buildBriefing` failure-tolerant (wrapped or `.catch`):
  one un-wrapped throw (e.g. `fetchNvdByIds`) aborts the whole build and persists NO
  row — the `daily-2026-06-09` "not yet generated" failure mode.

## Kickoff Prompt

```
Start the "Briefing Cron Safety" loop.

Goal: Each briefing cron invocation does ≤1 build and stays under 50 subrequests
Max iterations: 6
Between iterations run: a trace/count of subrequests + build count for one cron invocation
Exit when: build count ≤ 1 per invocation AND subrequest count < 50

Step 1: Trace one invocation of the cron path. Count builds and subrequests (KV +
Cache-API both count). If over budget, batch the IOC fan-out (primeBatch/flushBatch) and
keep the inline self-heal to one build per `0 * * * *` tick (do NOT add a dedicated cron).

Self-pace this loop. After each iteration, run the count, read it, and only continue if
over budget. Stop when within budget or max iterations is reached. Give a short status
update each pass.
```

## Steps (Agent Actions)

1. **Pick the invocation** — the `0 * * * *` hourly cron (cache-warm fan-out + inline tail self-heal), the `30 0 * * *` daily build, or the `45 0 * * 1` weekly build.
2. **Count builds** — confirm ≤1 build per invocation (the inline heal is conditional and rebuilds at most one slug).
3. **Count subrequests** — sum KV + Cache-API ops in the IOC fan-out; confirm batched (one read + one write).
4. **Fix at the source** — batch fan-out / split work across ticks; never raise the assumed cap; never add a dedicated heal cron.

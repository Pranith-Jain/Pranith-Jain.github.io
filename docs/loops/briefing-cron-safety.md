# Briefing Cron Safety

**Category:** Maintenance / manual

## Loop Description

After touching the weekly-briefing or self-heal cron, verify it stays within the
Free-plan limits: at most ONE briefing build per invocation, and at most 50 subrequests
per invocation (KV and Cache-API operations both count). Loop until the invocation is
provably within budget.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT move briefing builds back into the `0 * * * *` cron — self-heal runs in its OWN
  `20 * * * *` cron, ONE build per invocation.
- Do NOT do more than one build per invocation to "catch up" — that blows the
  50-subrequest cap.
- Do NOT add per-provider cache ops inside the IOC fan-out; it must use ONE batched KV
  read + write (`primeBatch`/`flushBatch`).
- Do NOT raise the assumed subrequest budget above 50 to make the count pass — the cap
  is the platform limit, not a tunable.

## Kickoff Prompt

```
Start the "Briefing Cron Safety" loop.

Goal: Each briefing cron invocation does ≤1 build and stays under 50 subrequests
Max iterations: 6
Between iterations run: a trace/count of subrequests + build count for one cron invocation
Exit when: build count ≤ 1 per invocation AND subrequest count < 50

Step 1: Trace one invocation of the cron path. Count builds and subrequests (KV +
Cache-API both count). If over budget, batch the IOC fan-out (primeBatch/flushBatch) and
keep self-heal to one build per `20 * * * *` tick.

Self-pace this loop. After each iteration, run the count, read it, and only continue if
over budget. Stop when within budget or max iterations is reached. Give a short status
update each pass.
```

## Steps (Agent Actions)

1. **Pick the invocation** — `0 * * * *` (hourly) vs the `20 * * * *` self-heal build.
2. **Count builds** — confirm ≤1 build per invocation.
3. **Count subrequests** — sum KV + Cache-API ops in the IOC fan-out; confirm batched (one read + one write).
4. **Fix at the source** — batch fan-out / split work across ticks; never raise the assumed cap.

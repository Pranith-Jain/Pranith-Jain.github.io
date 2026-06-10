# Optimize Hot Path

**Category:** Performance / manual

## Loop Description

Speed up a slow backend path — investigator step latency, the IOC enrichment fan-out, or
an endpoint's p95 — with measurement, not vibes. Establish a baseline, make one change,
re-measure, and keep only changes that move the number without breaking correctness or
the subrequest budget.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT optimize without a before/after measurement — "should be faster" is not a result.
- Do NOT trade latency for the subrequest budget — the Free-plan 50/invocation cap (KV +
  Cache-API) is a hard ceiling; a faster path that blows it is a regression.
- Do NOT drop correctness for speed — fewer providers / skipped enrichment that quietly
  reduces report quality is not an optimization, it's a downgrade. Log any coverage you
  trade away.
- Revert any change that doesn't measurably help.

## Kickoff Prompt

```
Start the "Optimize Hot Path" loop.

Goal: The target path is measurably faster within the subrequest budget, correctness intact
Max iterations: 8
Between iterations run: measure the target latency (agent step / fan-out / endpoint p95) + count subrequests
Exit when: latency meets target AND subrequests < 50 AND outputs are unchanged (or improved)

Step 1: Baseline the path. Make ONE scoped change (batching, parallelism, caching the
right thing, trimming a slow call), re-measure latency + subrequests, and keep it only if
it helps without regressing correctness or budget.

Self-pace this loop. After each iteration, measure, read the numbers, and only continue if
the target is unmet. Stop when it's met or max iterations is reached. Give a short status
update each pass.
```

## Steps (Agent Actions)

1. **Baseline** — measure the target latency and subrequest count; record it.
2. **One change** — batch / parallelize / cache / trim; scope it tightly.
3. **Re-measure** — latency + subrequests + output diff; keep only measured wins.
4. **Guard correctness** — confirm outputs unchanged (or better) and budget intact; revert non-wins.

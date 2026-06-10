# Debug Systematically

**Category:** Debugging / manual

## Loop Description

Drive a bug to root cause instead of guessing: reproduce it reliably, isolate the failing
layer, form one hypothesis, test it, fix the root cause, and verify the fix. Tuned for
this app's failure shapes — a provider returning status-ok-but-empty, an agent run
erroring or synthesizing garbage, a route 400ing valid input, a cron blowing its budget.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT apply a fix before you can reproduce the bug — "probably this" is not a root
  cause.
- Do NOT mask the symptom (swallow the error, add a retry, widen a type) without
  explaining the underlying cause; if you must mitigate, say so explicitly.
- Change ONE thing per hypothesis so you know what fixed it.
- The fix is not done until the original reproduction passes AND you've checked you didn't
  break an adjacent path.

## Kickoff Prompt

```
Start the "Debug Systematically" loop.

Goal: The bug is root-caused and fixed, with the reproduction now passing
Max iterations: 10
Between iterations run: the minimal reproduction (a failing test, a curl, an agent run, or the affected check)
Exit when: the reproduction passes AND the root cause is understood and addressed (not masked)

Step 1: Reproduce the bug minimally. Isolate which layer fails (provider / planner / route
/ middleware / cron). Form one hypothesis, test it, and fix the root cause. Re-run the
reproduction.

Self-pace this loop. After each iteration, run the reproduction, read the output, and only
continue if it still fails or the cause is unclear. Stop when fixed-and-understood or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Reproduce** — minimal failing test / curl / agent run that triggers it every time.
2. **Isolate** — bisect the layer (provider adapter → planner → tool exec → route → middleware → cron).
3. **One hypothesis, one change** — test it; keep it only if it moves the reproduction.
4. **Fix + verify** — address the root cause; confirm the reproduction passes and no adjacent path regressed.

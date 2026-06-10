# Incident Rollback

**Category:** Ops / manual

## Loop Description

When a deploy breaks production, restore service fast, then fix forward. Loop until the
site is healthy again — use the fastest safe mitigation first (the `OPEN_PUBLIC_READS`
valve, redeploy of last-good), then root-cause and ship the real fix. Recovery is the
exit, not the diagnosis.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Restore service FIRST — do not debug a broken prod while users are down if a rollback or
  valve flip recovers them now.
- Do NOT leave an emergency valve flipped as the "fix" — `OPEN_PUBLIC_READS=true` removes
  the API-key gate; flip it back once the real fix ships.
- Deploy the fix from the REPO ROOT (two wranglers); a fix deployed from `api/` won't
  restore the frontend.
- Confirm recovery with the actual health signal (smoke + a real page load), not just "the
  deploy command exited 0".

## Kickoff Prompt

```
Start the "Incident Rollback" loop.

Goal: Production is healthy again, then fixed forward with emergency valves reset
Max iterations: 6
Between iterations run: smoke (SMOKE_API_KEY) + load / and a prerendered route + check error rate
Exit when: smoke green, pages load and hydrate, and any emergency valve has been reset after the real fix

Step 1: Mitigate now (rollback to last-good deploy and/or flip OPEN_PUBLIC_READS if reads
are 401ing). Confirm recovery. Then root-cause, ship the fix from the repo root, and reset
any valve.

Self-pace this loop. After each iteration, run the health checks, read them, and only
continue while prod is unhealthy or a valve is still flipped. Stop when healthy-and-reset
or max iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Mitigate** — redeploy last-good from root and/or flip `OPEN_PUBLIC_READS` (no redeploy needed) to stop the bleeding.
2. **Confirm recovery** — smoke + real page load + error rate.
3. **Root-cause + fix forward** — find the cause; deploy the real fix from the repo root.
4. **Reset valves** — flip `OPEN_PUBLIC_READS` back; re-confirm health.

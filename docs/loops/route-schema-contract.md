# Route Schema Contract

**Category:** Testing / manual

## Loop Description

After editing an `api/src/routes/` handler's request reads, keep its `validate()`
middleware schema in lockstep with what the handler actually reads. Drift here 400s
otherwise-valid requests _before the handler runs_ — loop until the route-schema contract
tests pass.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT loosen a schema to `z.any()`/`.passthrough()` just to clear a failure — the
  schema must mirror the real handler reads (and the UI/D1 it serves).
- Do NOT delete or `.skip` a contract test to make the suite green; those tests exist
  because ~30 schemas had silently drifted.
- Fix the side that is wrong: if the handler read changed intentionally, update the
  schema to match; if the schema is right, fix the handler.
- Do NOT weaken the auth gate or set `OPEN_PUBLIC_READS` to dodge a 401 surfaced by the
  test config.

## Kickoff Prompt

```
Start the "Route Schema Contract" loop.

Goal: Every touched route's validate() schema mirrors its handler reads
Max iterations: 6
Between iterations run: the api route-schema contract test (test/lib/route-schema-contracts.test.ts)
Exit when: the contract test exits 0 for the touched routes

Step 1: For each route changed in api/src/routes/, diff the handler's request reads
(query/params/body) against its validate() schema and reconcile them. Re-run the contract
test.

Self-pace this loop. After each iteration, run the check, read the output, and only
continue if any contract is still broken. Stop when green or max iterations is reached.
Give a short status update each pass.
```

## Steps (Agent Actions)

1. **List touched routes** — `git diff --name-only origin/main -- api/src/routes/`.
2. **Diff reads vs schema** — compare each handler's `c.req` reads to its `validate()` schema in `validation-schemas`.
3. **Reconcile** — update whichever side drifted; mirror the UI payload + D1 columns.
4. **Run contract test** — locally with the sandbox disabled (CI skips `test/routes/`); confirm exit 0.

# Build Until Green

**Category:** CI / manual

## Loop Description

Run the production build and both typecheck passes (root TS + the `worker/` config),
fix compile, bundling, and budget errors, and loop until everything succeeds.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT silence type errors with `@ts-ignore`/`any` to pass the typecheck — fix the
  type.
- Do NOT raise or remove the bundle budgets in `scripts/check-budgets.mjs` to pass
  `check:budgets`. The budget IS the check.
- Do NOT skip `tsc -p api/tsconfig.worker.json` — the per-edit hook does not cover
  `worker/`, so this is the only gate for that code.
- If a budget regression is unavoidable and justified, STOP and discuss with the user
  before changing the budget.

## Kickoff Prompt

```
Start the "Build Until Green" loop.

Goal: Production build, both typecheck passes, and bundle budgets all green
Max iterations: 8
Between iterations run: npm run build:check && tsc -p api/tsconfig.worker.json --noEmit
Exit when: build exits 0, budgets pass, and both `tsc` passes are clean

Step 1: Run the build + budget check and the worker typecheck. Read the first error,
fix it at the source, and re-run.

Self-pace this loop. After each iteration, run the check command, read the output, and
only continue if anything is still failing. Stop when all are green or max iterations is
reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Build + budgets** — `npm run build:check` (build:client → build:server → build:prerender → check-budgets).
2. **Root typecheck** — the per-edit hook runs `tsc` on touched `src/`/`api/src/` files; confirm clean.
3. **Worker typecheck** — `tsc -p api/tsconfig.worker.json --noEmit` (covers `worker/`, which the hook skips).
4. **Fix at the source** — resolve each error/over-budget bundle; never weaken the check.

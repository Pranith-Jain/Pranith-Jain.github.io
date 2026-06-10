# Typecheck Until Clean

**Category:** CI / manual

## Loop Description

Run all three TypeScript projects (frontend root, `api/`, and `worker/`) and fix type
errors until every one is clean. Workers deploy via esbuild with **no typecheck**, so
latent type errors accumulate invisibly and a single parse error can mask the rest of
`tsc` — this loop is how you flush that debt before it ships.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT suppress errors with `@ts-ignore`, `@ts-expect-error`, or `as any` to clear the
  count — fix the underlying type. The whole point is that esbuild already lets these
  through; silencing them defeats the loop.
- Do NOT exclude files from a tsconfig to make it pass.
- Fix the FIRST error first — a single parse/syntax error can hide dozens of real ones
  downstream, so re-run after each structural fix to reveal the true remaining set.
- Do NOT relax `strict`/`noUncheckedIndexedAccess` or other compiler flags to pass.
- If an error is in unrelated WIP you were explicitly told not to touch, STOP and report
  it rather than editing someone else's half-finished work.

## Kickoff Prompt

```
Start the "Typecheck Until Clean" loop.

Goal: All three TS projects typecheck with zero errors
Max iterations: 12
Between iterations run: npx tsc -p tsconfig.json --noEmit; npx tsc -p api/tsconfig.json --noEmit; npx tsc -p api/tsconfig.worker.json --noEmit
Exit when: all three tsc invocations report 0 errors

Step 1: Run the three typechecks. Fix the first real error at the source, then re-run
(a parse error can mask the rest). Repeat until all three are clean.

Self-pace this loop. After each iteration, run the check command, read the output, and
only continue if any project still reports errors. Stop when all are clean or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Frontend** — `npx tsc -p tsconfig.json --noEmit` (root SPA/SSR).
2. **API worker** — `npx tsc -p api/tsconfig.json --noEmit`.
3. **Root worker** — `npx tsc -p api/tsconfig.worker.json --noEmit` (covers `worker/`, which the per-edit hook skips).
4. **Fix at the source** — resolve the first error, re-run, repeat. Never suppress.

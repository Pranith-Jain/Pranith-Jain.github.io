# Loop: AI Threat Actors sync

Kick off when **`public/data/ai-threats/`** needs rebuilding — either because
the weekly cron ran, or because you manually synced from upstream.

## Kickoff Prompt

```
/ai-threats-sync
```

## Goal

Regenerate `public/data/ai-threats/` from the Cybershujin tracker, producing a
slim `index.json` + per-slug bodies under `entries/` that the Worker's MCP +
REST + SPA surfaces serve through `env.ASSETS`.

## Max Iterations

2 (sync + build is deterministic).

## Between-iteration Check

```bash
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p api/tsconfig.json && npx tsc --noEmit -p api/tsconfig.worker.json
```

If typecheck fails, fix and re-run. Never weaken the check.

## Exit Condition

- `public/data/ai-threats/index.json` reports non-zero `total` count
- At least one entry file exists under `public/data/ai-threats/entries/`
- All three `tsc` projects pass

## Anti-gaming Guardrails

- **Never skip the typecheck.** esbuild will bundle without it and type errors
  will accumulate invisibly.
- **Never point the sync script at a non-public source** — all data must come
  from the public Cybershujin GitHub Pages tracker.

## What to Do

1. Run `node scripts/sync-ai-threats.mjs` (fetches tracker.json from upstream).
2. Run `node scripts/build-ai-threats.mjs` (slices staged data into per-slug
   JSON under `public/data/ai-threats/`).
3. Run the between-iteration check (typecheck).
4. Verify exit conditions. Report counts.
5. If all green: commit, push, and PR per the weekly workflow.

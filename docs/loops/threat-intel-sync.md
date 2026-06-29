# Loop: Threat Intel sync

Kick off when **`public/data/threat-intel/`** needs rebuilding — either because the weekly cron ran, or because you manually synced from upstream sources (NVD, CISA KEV, Daily-Hunt).

## Kickoff Prompt

```
/threat-intel-sync
```

## Goal

Regenerate `public/data/threat-intel/` from upstream public data sources, producing a slim `index.json` + per-slug bodies that the Worker's MCP + REST + SPA surfaces serve through `env.ASSETS`.

## Max Iterations

2 (sync + build is deterministic). After iteration 2 stop and report.

## Between-iteration Check

```bash
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p api/tsconfig.json && npx tsc --noEmit -p api/tsconfig.worker.json
```

If typecheck fails, fix and re-run. Never weaken the check.

## Exit Condition

- `public/data/threat-intel/index.json` reports non-zero counts in `cves`, `iocs`, `sectors`, `kevTotal`
- `public/data/threat-intel/cves/kev.json` exists and is valid JSON
- At least one sector brief file exists under `public/data/threat-intel/sectors/`
- All three `tsc` projects pass
- `npx vitest run worker/lib/threat-intel-manifest.test.ts` passes

## Anti-gaming Guardrails

- **Never skip the typecheck.** esbuild will bundle without it and type errors will accumulate invisibly.
- **Never vendor OpenThreat code.** All priority scoring must be derived independently per the AGPL boundary in `docs/decisions/2026-06-29-threat-intel-vertical.md`.
- **Never modify the sync script to point at a private/internal API** — all sources must be public and unauthenticated.

## What to Do

1. Run `node scripts/sync-threat-intel.mjs` (fetches NVD recent, CISA KEV, sparse Daily-Hunt clone into `threat-intel-staging/`).
2. Run `node scripts/build-threat-intel.mjs` (slices staged data into `public/data/threat-intel/` per-slug JSON).
3. Run the between-iteration check (typecheck + vitest).
4. Verify exit conditions. Report counts.
5. If all green: commit, push, and PR per the weekly workflow.

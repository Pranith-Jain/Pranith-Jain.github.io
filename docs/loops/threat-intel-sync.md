# Loop: Threat Intel sync

Kick off when **`public/data/threat-intel/`** needs rebuilding — either because the daily cron ran, or because you manually synced from upstream sources (NVD, CISA KEV, Daily-Hunt).

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
- `public/data/threat-intel/threatcluster/index.json` reports non-zero counts in `clusters`, `vulnerabilities`, `exploits`, `victims`, `iocs`
- `public/data/threat-intel/dphish/index.json` reports non-zero counts in `indicators`, `active`, `byCategory`
- `public/data/threat-intel/living-threat/index.json` reports non-zero counts in `incidents` and `shards`
- `public/data/threat-intel/malwareanalyzer/index.json` reports non-zero counts in `malicious`, `newlyObserved`
- All three `tsc` projects pass
- `npx vitest run worker/lib/threat-intel-manifest.test.ts` passes

## Anti-gaming Guardrails

- **Never skip the typecheck.** esbuild will bundle without it and type errors will accumulate invisibly.
- **Never vendor OpenThreat code.** All priority scoring must be derived independently per the AGPL boundary in `docs/decisions/2026-06-29-threat-intel-vertical.md`.
- **Never modify the sync script to point at a private/internal API** — all sources must be public and unauthenticated.

## What to Do

1. Run `node scripts/sync-threat-intel.mjs` (fetches NVD recent, CISA KEV, sparse Daily-Hunt clone into `threat-intel-staging/`).
2. Run `node scripts/sync-darknetlist.mjs` (Tor site directory) and `node scripts/sync-threatcluster.mjs` (5 ThreatCluster feeds + MISP manifest).
3. Run `node scripts/sync-dphish.mjs` (dPhish public TAXII 2.1 phishing collection — incremental via `added_after`).
4. Run `node scripts/sync-living-threat.mjs` (Living Threat Repository bootstrap — newest 5000 of ~21k incidents, keyless) and `node scripts/sync-malwareanalyzer.mjs` (MalwareAnalyzer by Cyble malicious + newly-observed feeds, keyless).
5. Run `node scripts/build-threat-intel.mjs`, `node scripts/build-darknetlist.mjs`, `node scripts/build-threatcluster.mjs`, `node scripts/build-dphish.mjs`, `node scripts/build-living-threat.mjs` (index + sharded bodies — **shards keep the 20k static-asset cap intact**), and `node scripts/build-malwareanalyzer.mjs` (slice staged data into `public/data/threat-intel/`).
6. Run the between-iteration check (typecheck + vitest).
7. Verify exit conditions. Report counts.
8. If all green: commit, push, and PR per the daily workflow.

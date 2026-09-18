# Loop: AI Security sync

Kick off when **`public/data/ai-security/`** needs rebuilding — either because
the daily cron ran, or because you manually synced from upstream.

## Kickoff Prompt

```
/ai-security-sync
```

## Goal

Regenerate `public/data/ai-security/` from the hub sources, producing a
hub `index.json` + `escape-parity.json` + slim `matrix/index.json` with per-repo
bodies under `matrix/tools/` + slim `incidents/index.json` with a bundled
`incidents/bodies.json` + slim `vulns/index.json` (KEV first) with a bundled
`vulns/bodies.json` + `advisories/index.json` + `research/index.json` that the
Worker's REST + SPA surfaces serve through `env.ASSETS`.

## Max Iterations

2 (sync + build is deterministic).

## Between-iteration Check

```bash
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p api/tsconfig.json && npx tsc --noEmit -p api/tsconfig.worker.json
```

If typecheck fails, fix and re-run. Never weaken the check.

## Exit Condition

- `public/data/ai-security/index.json` reports non-zero `matrixTools` and `incidentReports`
- At least one tool body exists under `public/data/ai-security/matrix/tools/`
- `public/data/ai-security/escape-parity.json` exists with a `checkedAt` timestamp
- `public/data/ai-security/vulns/index.json` reports non-zero vulns with a `kev` count
- `public/data/ai-security/advisories/index.json` and `research/index.json` exist with non-zero totals
- All three `tsc` projects pass

## Anti-gaming Guardrails

- **Never skip the typecheck.** esbuild will bundle without it and type errors
  will accumulate invisibly.
- **Never auto-merge Escape Watch drift.** The parity report is read-only:
  `onlyUpstream` / `onlyLocal` IDs are ported via reviewed PR in either
  direction (same "reviewed before publish" rule as the registry).
- **Never point the sync scripts at a non-public source** — all data must come
  from the public upstreams (ai-escape.watch API/app.js,
  aisecuritymatrix.com/data.json, incidentdatabase.ai/rss.xml, ENISA EUVD,
  NVD, OSV.dev, FIRST EPSS, GitHub Atoms, ExploitDB RSS, research RSS).
- **Keep per-source isolation.** Each fetch in `sync-ai-security.mjs` and
  `sync-ai-vulns.mjs` is try/catch-isolated; one flaky upstream must never
  abort the others.
- **Normalize EPSS at build time.** EUVD ships mixed 0–1 / 0–100 scales;
  `build-ai-security.mjs` normalizes to 0–1 — never "fix" this by editing
  staged data.

## What to Do

1. Run `node scripts/sync-ai-security.mjs` (parity + matrix + incidents into
   `threat-intel-staging/ai-security/`).
2. Run `node scripts/sync-ai-vulns.mjs` (vulns + advisories + research into
   the same staging dir; NVD calls are 7s-paced for the keyless rate).
3. Run `node scripts/build-ai-security.mjs` (slices staged data into
   `public/data/ai-security/`).
4. Run the between-iteration check (typecheck).
5. Verify exit conditions. Report counts + drift IDs + KEV headliners.
6. If all green: commit, push, and PR per the daily workflow.

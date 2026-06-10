# CLAUDE.md

Guidance for agents working in this repo. Keep it short; deep context lives in
`docs/` and in the loop templates.

## Loop templates — read these first for recurring workflows

This repo encodes its recurring dev workflows as **loop templates** in
[`docs/loops/`](docs/loops/) (see [`docs/LOOP-ENGINEERING.md`](docs/LOOP-ENGINEERING.md)).
Each is a goal + max-iterations + a between-iteration check + an exit condition + anti-
gaming guardrails, designed to be driven by an agent (e.g. Claude Code's `/loop`). Before
deploying, editing a provider, touching a route, changing the IOC fan-out, etc., check
[`docs/loops/README.md`](docs/loops/README.md) for the matching loop — it carries this
repo's footguns so you don't rediscover them.

## Operational footguns (the short list)

- **Two wranglers.** Deploy from the **repo root** (`wrangler.jsonc` → Worker
  `pranithjain`), NOT from `api/`, for any frontend/prod change. `npm run deploy` from
  root. See [`docs/loops/deploy-from-root.md`](docs/loops/deploy-from-root.md).
- **esbuild deploys past `tsc`.** Workers bundle without a typecheck, so type errors
  accumulate invisibly and a single parse error masks the rest. Run all three projects:
  `tsc -p tsconfig.json`, `tsc -p api/tsconfig.json`, `tsc -p api/tsconfig.worker.json`.
  The per-edit hook checks api/src but skips `worker/`.
- **API route tests.** CI skips `test/routes/`; run them locally (vitest-pool-workers
  needs the sandbox disabled). External `/api/v1/*` reads are key-gated.
- **D1 binding is `BRIEFINGS_DB`** (database `pranithjain-briefings`), not `DB`.
  Migrations are immutable; add new ones via `/create-migration`; `--remote` is
  destructive.
- **Free-plan limits.** 50 subrequests per invocation (KV + Cache-API both count); the
  IOC fan-out must use one batched `primeBatch` + one `flushBatch`. Briefing self-heal
  runs its own `20 * * * *` cron, one build per invocation.
- **`main` moves fast.** Feature branches auto-FF-merge into `main` mid-session; commit on
  a branch and let it merge — never rebase/force-push/`branch -f main`. Re-check the
  current branch before any git mutation. Rebase onto `origin/main` right before
  deploying.
- **MCP server** (`worker/mcp-server.ts`, `/api/mcp`) is mirrored to the standalone repo
  `dfir-mcp-server` via branch + PR.

## Runtime loop engine

The investigator agent is built on a small generic loop engine
(`api/src/lib/agent/loop-engine.ts` + `cti-loop.ts`); its behavior is pinned by
`api/test/lib/loop-engine.test.ts`. Keep that parity test green when changing exit
conditions or guardrails. See [`docs/LOOP-ENGINEERING.md`](docs/LOOP-ENGINEERING.md).

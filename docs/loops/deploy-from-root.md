# Deploy From Root

**Category:** Deploy / manual

## Loop Description

Deploy this dual-worker app correctly: build, deploy from the repository root (never
`api/`), apply any pending D1 migrations, and verify with a smoke test — loop until prod
is consistent and smoke is green.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT deploy from `api/` to "make it pass" — frontend/prod changes only ship from the
  repo root (`wrangler.jsonc` → Worker `pranithjain`).
- Do NOT skip the smoke test or downgrade `--slow` to shrink the check.
- Do NOT set `OPEN_PUBLIC_READS=true` to make smoke pass — that is an emergency rollback
  valve, not a way to satisfy the exit condition. Mint a real `SMOKE_API_KEY` instead.
- Do NOT `wrangler deploy` a stale `dist/`. Build first.
- If a migration is destructive against `--remote`, STOP and confirm with the user
  rather than forcing the deploy through.

## Kickoff Prompt

```
Start the "Deploy From Root" loop.

Goal: Both workers deployed from the repo root with smoke green and prod consistent
Max iterations: 6
Between iterations run: SMOKE_API_KEY=<key> node scripts/smoke.mjs --slow
Exit when: deploy succeeded from root AND smoke --slow exits 0

Step 1: From the REPO ROOT, run `npm run deploy` (build:client → build:server →
build:prerender → wrangler deploy). Apply pending D1 migrations only after confirming
with the user. Then run the smoke check and fix any failure at the source.

Self-pace this loop. After each iteration, run the check command, read the output, and
only continue if the exit condition is not met. Stop when smoke is green or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Build + deploy from root** — `npm run deploy` from the repository root (NOT `api/`).
2. **Migrations (if any)** — `npx wrangler d1 migrations apply pranithjain-briefings --remote` only after user confirmation (remote is destructive).
3. **Smoke** — `SMOKE_API_KEY=<key> node scripts/smoke.mjs --slow`; external `/api/v1/*` reads are key-gated, so a real key is required.
4. **Verify hydration + CSP** — load `/` and a prerendered route; confirm JS executes (nonce-based CSP not blocking) and no spinner-stuck pages.

# Canary After Deploy

**Category:** Deploy / verification

## Loop Description

After `wrangler deploy` ships a new Worker version, verify the deployment is actually
serving correctly — not just that the deploy command exited 0. A green deploy can still
serve 500s (broken DO migration, missing binding, bad env var, a route that typechecks
but throws at runtime). This loop runs the public-page liveness check, the keyless MCP
auth-gate canary, and (when a `SMOKE_API_KEY` is available) the full keyed smoke suite,
looping until prod is confirmed live or a rollback is needed.

This is the post-deploy half of [`deploy-from-root.md`](deploy-from-root.md). Run that
loop first; run this one once the deploy step reports success.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT declare the deploy healthy based on the `wrangler deploy` exit code alone —
  the Worker can publish successfully and still 500 on the first request (cold DO init,
  missing secret, broken `env.ASSETS` fetch). The HTTP canary is the check, not the
  deploy log.
- Do NOT set `OPEN_PUBLIC_READS=true` to make keyed smoke checks pass — that is an
  emergency rollback valve, not a way to satisfy the exit condition. Mint a real
  `SMOKE_API_KEY` at `/admin` instead.
- Do NOT downgrade a failing check to `[200, 503]` to make it green. If a route that
  was 200 last deploy is now 503, that is a regression — investigate, don't widen the
  tolerance.
- If the MCP auth-gate canary (`/api/mcp` → 401) returns anything other than 401, STOP.
  A 500 means the `DfirMcpServer` DO binding or migration is broken; a 200 means the
  auth gate was bypassed. Either is a rollback signal, not a pass.
- If more than 2 routes fail that were green on the previous deploy, treat it as a
  regression batch and roll back rather than chasing individual fixes.

## Kickoff Prompt

```
Start the "Canary After Deploy" loop.

Goal: Confirm the just-deployed Worker is serving correctly across public pages, the
MCP auth gate, and (if a smoke key is set) the keyed /api/v1/* surface.
Max iterations: 4
Between iterations run: sleep 10 && node scripts/smoke.mjs
Exit when: public pages (/ /dfir /threatintel) all return 200, the MCP canary
(/api/mcp → 401) passes, and `node scripts/smoke.mjs` exits 0 (or exits 0 with
--slow if SMOKE_API_KEY is set)

Step 1: Wait ~10s for the new version to propagate, then run the public-page liveness
curl loop and the smoke suite. If any check fails, read the response body / Worker
logs (`npx wrangler tail`), decide whether it's a transient cold-start (retry once) or
a real regression (roll back with `wrangler rollback`), and re-run.

Self-pace this loop. After each iteration, run the check command, read the output, and
only continue if the exit condition is not met. Stop when all canaries are green or
max iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Propagate wait** — `sleep 10` after `wrangler deploy` returns. Cloudflare routes
   the new version within seconds, but the first request to a cold DO can be slow.
2. **Public-page liveness** — curl `/`, `/dfir`, `/threatintel`; each must return 200.
   A non-200 here means the SPA shell or prerendered route is broken — roll back.
3. **MCP auth-gate canary** — `GET /api/mcp` with no `Authorization` header must return
   `401` with a JSON body `{"error":"api key required..."}`. This proves the
   `DfirMcpServer` DO is bound and reachable and the auth gate is intact. Anything else
   is a rollback signal.
4. **Full keyed smoke** — `SMOKE_API_KEY=<key> node scripts/smoke.mjs` (or `--slow` for
   the heavy fan-out checks). External `/api/v1/*` reads are key-gated; without a key
   only the keyless subset runs. Mint a key at `/admin` if one isn't set.
5. **Triage failures** — a single transient 503 on a cold-cache fan-out route (e.g.
   `threat-map`, `ioc-correlation`) is acceptable on the first pass; retry once. A 500
   or a 503 that persists across two passes is a regression.
6. **Rollback decision** — if canaries fail after 2 passes, `npx wrangler rollback`
   to the previous version and report which check failed + the response body. Do NOT
   attempt to fix-forward unless the failure is a known safe config change.

## Notes

- The `deploy.yml` GitHub Action already runs the public-page liveness + optional full
  smoke as post-deploy steps. This loop is the **local / manual** equivalent for when
  you deploy from your machine (`npm run deploy`) rather than via the Action, and adds
  the MCP auth-gate canary that the Action does not yet check.
- `scripts/smoke.mjs` self-throttles to ~25 req/min to stay under the Worker's 30/min/colo
  rate limit, so a full run takes ~2-3 min. The `--slow` flag adds the heavy fan-out
  checks (cve-recent, actor-enrich, cert-search) — only run with a real `SMOKE_API_KEY`.

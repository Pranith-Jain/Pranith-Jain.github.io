# Supply-Chain Intelligence — Deploy + Verification Runbook

Operator's guide for shipping the work in
[`2026-06-11-supply-chain-intel.md`](2026-06-11-supply-chain-intel.md) (Phases 1–3 + 2b)
and the deferred Phases 4–5. Spec: [`2026-06-11-supply-chain-intel-design.md`](../specs/2026-06-11-supply-chain-intel-design.md).

> **Two wranglers — deploy from the REPO ROOT.** Frontend/prod changes ship the Worker
> `pranithjain` from `wrangler.jsonc` at the repo root via `npm run deploy`, **NOT** from
> `api/`. See [`docs/loops/deploy-from-root.md`](../../loops/deploy-from-root.md). This
> initiative is API-side code that lands in that same Worker — deploy from root.

> **No D1 migrations.** This initiative is KV + Cache-API only (see §8.3 of the spec).
> Do **not** run `d1 migrations apply`. The optional ethereum-lists D1 backfill (§6d) is a
> separate fast-follow, not part of this deploy.

---

## 1. Pre-deploy gate (run all, in order)

Run from the **repo root**. Route tests need the sandbox disabled
(`dangerouslyDisableSandbox: true` on the Bash tool — there is no `--no-sandbox` CLI flag)
because CI skips `test/routes/`. Lib/gatherer tests run in CI with zero network.

| #   | Gate                                                                                  | Command                                                                                                                 | Sandbox      |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **All 3 tsc projects** (esbuild deploys past tsc — mandatory)                         | `tsc -p tsconfig.json && tsc -p api/tsconfig.json && tsc -p api/tsconfig.worker.json`                                   | normal       |
| 2   | New supply-chain lib unit tests (CI, no network)                                      | `cd api && npx vitest run test/lib/supply-chain`                                                                        | disabled     |
| 3   | Agent-tool unit test (scan_dependencies)                                              | `cd api && npx vitest run test/lib/agent/scan-dependencies.test.ts`                                                     | disabled     |
| 4   | Copilot gatherer regression tests (Phase 1 stub fixes + cve/ioc gatherers)            | `cd api && npx vitest run test/lib/report/gatherer.test.ts`                                                             | disabled     |
| 5   | cve-lookup / cve-enrich (GHSA + KEV refactor parity)                                  | `cd api && npx vitest run test/lib/cve-lookup.test.ts`                                                                  | disabled     |
| 6   | **Route tests** (CI-skipped — mount real router + validate + OPEN_PUBLIC_READS valve) | `cd api && npx vitest run test/routes/supply-chain.test.ts test/routes/osv.test.ts test/routes/github-security.test.ts` | **disabled** |
| 7   | Loop-engine parity (unchanged by this work — confirm still green)                     | `cd api && npx vitest run test/lib/loop-engine.test.ts`                                                                 | disabled     |

`tsc -p api/tsconfig.worker.json` is **load-bearing** for Phase 5 / bgp.tools-cron: those
touch `worker/durable-objects/investigator-agent.ts` (DO call site) and
`worker/scheduled.ts`, and the per-edit hook **skips** `worker/`.

**Live-format smokes are NOT in this gate** — they are CI-skipped (`describe.skip`) and run
on demand in §6. Two of them are **merge gates** (§6).

---

## 2. Secrets to provision (`wrangler secret put`, server-side only)

Run from the **repo root** (binds to the `pranithjain` Worker). All optional —
**features no-op without them**; the libs return `needs-key`/`null` with zero fetches.

| Secret              | Phase | Purpose                                                                                             | Behavior when unset                                                          |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ARKHAM_API_KEY`    | 5     | Arkham entity attribution                                                                           | `arkham_attribute_address` tool **not registered**; lib returns `needs-key`  |
| `ARKHAM_API_BASE`   | 5     | Arkham base URL (`api.arkhamintelligence.com` vs `api.arkm.com` is ambiguous — do **not** hardcode) | lib cannot call; treat as needs-key                                          |
| `MISTTRACK_API_KEY` | 5     | MistTrack/MetaSleuth AML risk                                                                       | `check_crypto_address_risk` tool **not registered**; lib returns `needs-key` |

```
npx wrangler secret put ARKHAM_API_KEY
npx wrangler secret put ARKHAM_API_BASE
npx wrangler secret put MISTTRACK_API_KEY
```

**Already provisioned (do not re-add):**

- `GITHUB_TOKEN` — raises GHSA rate limit 60→5000/hr. GHSA paths **work unauthenticated**;
  the token is an optimization, not a requirement.
- `RANSOMWARELIVE_API_KEY` — required by the `kev-cves` gatherer (group→CVE list via
  `fetchRlUpstream`). When absent the gatherer degrades to `empty` and emits a
  `console.warn` (silent-empty honesty, §7.6) — not an error, but the gatherer produces
  nothing. Confirm it is set before relying on `kev-cves`.

> **Conditional registration.** The Arkham/MistTrack agent tools are added to
> `buildToolRegistry()` **only when their key is set** (the DO passes
> `{ hasArkhamKey, hasMisttrackKey }` from `worker/durable-objects/investigator-agent.ts`).
> An unkeyed tool is **absent** from the registry, so the planner never wastes a slot or an
> internal hop on a guaranteed-empty tool. After `wrangler secret put`, the tool appears on
> the **next** Worker invocation — no redeploy needed for registration to flip, but the
> Worker must be running the code that reads the key (i.e. Phase 5 must be deployed).

---

## 3. Cron change (Phase 2b — bgp.tools `asns.csv` warm)

`worker/scheduled.ts` gains `warmBgpAsnNameMap(env.KV_CACHE)` inside the **existing**
`0 * * * *` (hourly) block, **hour-gated to run once per day at 03:00 UTC**. It is
**cron-only** (bgp.tools etiquette: bulk dumps ≤1/30min) and **never** runs per-step.

Verify after deploy:

- The warm runs **once/day**, not per-hour and never per-request. Confirm the hour gate
  (`03:00 UTC`) in the `0 * * * *` block; it must not fan out on every hourly tick.
- It populates KV: `sc:bgptools:asnames` (a `{ asn -> name }` JSON map, 24h TTL).
- The `/api/v1/supply-chain/bgp-tools` route **reads** this KV key (single read), never
  warms it.
- Log line: `{"job":"bgptools-asnames-warm","asns":<count>}` on success;
  `logCronFail('bgptools-asnames-warm')` on failure (fail-open, never halts the cron).

Check the KV value once a daily tick has run (or force a manual warm via the admin path if
one exists):

```
npx wrangler kv key get --binding=KV_CACHE "sc:bgptools:asnames" | head -c 200
npx wrangler tail pranithjain --format=pretty | grep bgptools-asnames-warm
```

> Free plan caps cron triggers at 5; this work adds **no new trigger** — it piggybacks the
> existing `0 * * * *`. Do not register a new cron string in `wrangler.jsonc`.

---

## 4. New routes inventory

Every external `/api/v1/*` read is **key-gated** via the global key gate; the
`OPEN_PUBLIC_READS` valve opens them (test config sets it `true`; prod relies on
`SMOKE_API_KEY`/client key). All routes below are key-gated reads (not admin-gated).

| Route                                    | Method | Phase  | Lib fn / handler                                                                                                                         | Key-gated |
| ---------------------------------------- | ------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `/api/v1/osv/scan`                       | POST   | 1      | existing `osvScanHandler` (wired to new `scan_dependencies` tool)                                                                        | yes       |
| `/api/v1/supply-chain/package`           | GET    | 2      | `fetchDepsDev` (deps.dev)                                                                                                                | yes       |
| `/api/v1/supply-chain/malicious-package` | POST   | 2      | `checkMaliciousPackage` (OSV MAL-)                                                                                                       | yes       |
| `/api/v1/github-security`                | GET    | 2      | `fetchGhsaAdvisories` + net-new `type=malware` path                                                                                      | yes       |
| `/api/v1/supply-chain/asn-drop`          | GET    | 2      | `lookupAsnDrop` / `lookupAsnDropForIp` (Spamhaus)                                                                                        | yes       |
| `/api/v1/supply-chain/abusix`            | GET    | 2      | `lookupAbuseContact` (Abusix DoH TXT)                                                                                                    | yes       |
| `/api/v1/supply-chain/bgp-routing`       | GET    | 2      | `fetchRipeRouting` (RIPEstat `bgp-state`)                                                                                                | yes       |
| `/api/v1/supply-chain/ca-distrust`       | GET    | 2      | `assessCaReputation` (crt.sh)                                                                                                            | yes       |
| `/api/v1/rdap`                           | GET    | 2      | `rdap.ts` dispatch → `rdapIpLookup`/`rdapAsnLookup`/`rdapLookup`                                                                         | yes       |
| `/api/v1/supply-chain/bgp-tools`         | GET    | **2b** | `bgpToolsLookup` (whois/43; reads `sc:bgptools:asnames`)                                                                                 | yes       |
| `/api/v1/crypto-trace/oracle`            | GET    | 3      | `checkChainalysisOracle` (NEW sub-route, own `validate('query', oracleSchema)` `{address,chain?}` — NOT the `cryptoTraceSchema` handler) | yes       |
| `/api/v1/token-security`                 | GET    | 3      | `fetchTokenSecurity` (GoPlus)                                                                                                            | yes       |
| `/api/v1/honeypot-check`                 | GET    | 3      | `checkHoneypot` (Honeypot.is; 429 fail-open)                                                                                             | yes       |
| `/api/v1/supply-chain/ethlist-label`     | GET    | 3      | `lookupEthList` (ethereum-lists)                                                                                                         | yes       |
| `/api/v1/supply-chain/arkham`            | GET    | 5      | `lookupArkhamEntity` (needs `ARKHAM_API_KEY`)                                                                                            | yes       |
| `/api/v1/supply-chain/address-risk`      | GET    | 5      | `lookupMisttrack` (needs `MISTTRACK_API_KEY`)                                                                                            | yes       |

`check_mixer_exposure` (Tornado Cash) is a **direct lib import** (`checkTornadoCash`,
embedded const, 0 subrequests) — **no route**.

**Schema-drift footgun:** every `validate()` schema must mirror its handler's reads exactly
or valid requests 400. The new `/api/v1/crypto-trace/oracle` route needs its **own**
`oracleSchema` `{address, chain?}` (commonly missed — it is not a reuse of the tracer's
`cryptoTraceSchema`).

---

## 5. Deploy step

From the **repo root** (never `api/`):

```
git fetch origin && git rebase origin/main   # main moves fast; rebase the worktree first
tsc -p tsconfig.json && tsc -p api/tsconfig.json && tsc -p api/tsconfig.worker.json
npm run deploy                               # build:client → build:server → build:prerender → wrangler deploy
```

Order:

1. Provision any Phase-5 secrets (§2) **before** deploying Phase 5 code (so conditional
   registration sees them).
2. **No D1 migrations** — skip `d1 migrations apply` entirely (KV/Cache-API only).
3. `npm run deploy` from root deploys the `pranithjain` Worker.
4. Run the post-deploy smoke (§6).

> Commit on the feature branch and let it auto-FF-merge into `main`; never
> rebase/force-push `main` or `branch -f main`. Re-check the current branch before any git
> mutation.

**Standard prod smoke** (regression guard for the whole Worker, not new routes):

```
SMOKE_API_KEY=<key> node scripts/smoke.mjs --slow
```

(External `/api/v1/*` reads are key-gated, so a real `SMOKE_API_KEY` is required. Do **not**
flip `OPEN_PUBLIC_READS=true` to make smoke pass — that is an emergency rollback valve.)

---

## 6. Post-deploy verification — CI-skipped live-format smokes (run on demand)

Providers silently rot (wrong auth/field/branch → status ok but empty). Each new source has
a `describe.skip(...)` live smoke that GETs the **real** upstream and asserts its response
shape. They are offline-default (CI/local default runs stay green); run them **manually**
with the sandbox disabled. To run one, temporarily flip `describe.skip` → `describe`
locally, run it, then **revert to `describe.skip`**.

Command shape (`dangerouslyDisableSandbox: true`):

```
cd api && npx vitest run test/lib/supply-chain/<source>.live.test.ts
```

| Source check                 | Live smoke file                                                                                  | Asserts                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| OSV (axios/lodash)           | `test/lib/supply-chain/osv.live.test.ts`                                                         | vuln IDs incl. MAL- for known-bad pkg                                                                   |
| deps.dev                     | `test/lib/supply-chain/depsdev.live.test.ts`                                                     | Scorecard/dep-graph/license shape                                                                       |
| GHSA (+`type=malware`)       | `test/lib/supply-chain/ghsa.live.test.ts`                                                        | advisory fields + malware path                                                                          |
| OSSF malicious-packages      | `test/lib/supply-chain/malicious-packages.live.test.ts`                                          | MAL- verdict shape                                                                                      |
| CISA KEV                     | `test/lib/supply-chain/kev.live.test.ts`                                                         | catalog blob fields                                                                                     |
| Spamhaus **ASN-DROP** header | `test/lib/supply-chain/asndrop.live.test.ts`                                                     | `asndrop.json` JSON-Lines + trailing `metadata.copyright`                                               |
| Abusix                       | `test/lib/supply-chain/abusix.live.test.ts`                                                      | DoH TXT abuse-contact                                                                                   |
| RIPEstat `bgp-state`         | `test/lib/supply-chain/ripe-routing.live.test.ts`                                                | bgp-state envelope + `sourceapp`                                                                        |
| crt.sh CA-distrust           | `test/lib/supply-chain/ca-distrust.live.test.ts`                                                 | issuer DN parse                                                                                         |
| RDAP IP/ASN                  | `test/lib/supply-chain/rdap.live.test.ts`                                                        | RIR bootstrap shape                                                                                     |
| **Chainalysis Oracle**       | `test/lib/supply-chain/chainalysis-oracle.live.test.ts`                                          | **see merge gate ↓**                                                                                    |
| Tornado Cash                 | `test/lib/supply-chain/tornado-cash.live.test.ts`                                                | pool snapshot (optional refresh)                                                                        |
| **GoPlus**                   | `test/lib/supply-chain/goplus.live.test.ts`                                                      | token-security `'0'/'1'`→bool fields                                                                    |
| **Honeypot.is**              | `test/lib/supply-chain/honeypot.live.test.ts`                                                    | `/v2/IsHoneypot` + 429/`Retry-After`                                                                    |
| **ethereum-lists**           | `test/lib/supply-chain/ethereum-lists.live.test.ts`                                              | USDT/DAI per-address files                                                                              |
| **cvedb.shodan.io**          | (gatherer) `test/lib/report/gatherer.test.ts` live variant / `cvedb.shodan.io/cve/CVE-2024-1709` | CVSS/EPSS/KEV fields (`ranking_epss` is percentile, `epss` is score; `ransomware_campaign` is a string) |
| Malpedia (Phase-1 stub)      | `test/lib/report/malpedia.live.test.ts`                                                          | actor/family JSON (`family_name`/`common_name`; `description` may be `''`)                              |
| Arkham (Phase 5)             | `test/lib/supply-chain/arkham.live.test.ts`                                                      | host + field shapes (needs key)                                                                         |
| MistTrack (Phase 5)          | `test/lib/supply-chain/misttrack.live.test.ts`                                                   | envelope + `risk_score` version (needs key)                                                             |

### MERGE GATES (not optional — per spec §3.4)

These two are **blocking** before merging their phase. A green merge gate is what upgrades
the source from "smoke-gated" to "live-verified end-to-end" and is exactly the check that
would have caught the existing rot.

| Merge gate             | Phase | File                                                    | Pass condition                                                                                                                                                                                                                                                                                              |
| ---------------------- | ----- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chainalysis Oracle** | 3     | `test/lib/supply-chain/chainalysis-oracle.live.test.ts` | POSTs a real `eth_call` against the actual `EVM_RPCS` and a **historically-sanctioned Tornado Cash address** (`0x722122dF12D4e14e13Ac3b6895a86e84145b6967`) returns `sanctioned:true` on mainnet. Until green, the lib must return `sanctioned:null` if all RPCs reject `eth_call` — never a false "clean". |
| **bgp.tools**          | 2b    | `test/lib/supply-chain/bgp-tools.live.test.ts`          | GET `https://bgp.tools/asns.csv` **WITH the contact User-Agent** returns 200 and the header `asn,name,class,cc` (a **403 means the contact UA is wrong**); a real whois/43 `bgpToolsLookup` for a known IP returns an ASN fact.                                                                             |

---

## 7. Rollback + attribution

### Rollback

- **No DB state to undo** (no migrations). Roll the Worker back with
  `npx wrangler rollback` (or redeploy the previous commit from root). KV keys
  (`sc:*`, `goplus:*`, `ethlist:*`) self-expire by TTL and are safe to leave; delete a
  specific stale blob with `wrangler kv key delete --binding=KV_CACHE "<key>"` if needed.
- **Emergency public-reads valve:** `OPEN_PUBLIC_READS=true` opens key-gated reads — this is
  a rollback valve only, **never** a way to satisfy a smoke/exit condition.
- A failing **merge gate** (§6) means the source ships as a no-op (`sanctioned:null` /
  fail-open to RIPE/RDAP) — degrade, do not claim it works; revert the `describe` back to
  `describe.skip` and leave the gate red.

### Attribution requirements (spec §11 — surface in any UI/report rendering)

- **Spamhaus ASN-DROP:** credit Spamhaus and **preserve `metadata.copyright`** + date from
  the `asndrop.json` trailing metadata line.
- **RIPEstat:** add `sourceapp=pranithjain-dfir` to **all** `stat.ripe.net` calls
  (fix the existing omissions in `asn.ts` / `asn-graph.ts` in the same change).
- **bgp.tools:** hard-enforced **custom contact User-Agent** (403 without it); no HTML
  scraping; bulk `asns.csv` dumps ≤1/30min (cron only, never per-step); **always fail open**
  to RIPE/RDAP if throttled.
- **Tornado Cash:** encode `ofac_status:'delisted_2025-03-21'` as a documented constant;
  treat exposure as an **AML/laundering signal, NOT a sanctions hit**; do not merge into the
  `sanctioned` set.
- Other sources (OSV.dev, ethereum-lists, OpenSSF, Malpedia): permissively licensed; send a
  descriptive UA (`pranithjain-dfir/1.0` / `pranithjain-copilot/1.0`).

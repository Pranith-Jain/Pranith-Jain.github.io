<!-- spec: supply-chain intelligence upgrade for the investigator agent + Copilot report engine -->

## Decisions (2026-06-11)

Locked with the maintainer during brainstorming:

- **Scope = A + C:** shared-lib architecture (`api/src/lib/supply-chain/`, one fn per source, two callers) **and** broad multi-source breadth across all three angles (software / crypto fund-flow / infra-hosting), plus fixing the 6 stubbed/un-wired gatherers.
- **Phase 4 is IN this initiative:** add `package` + `crypto-address` subject types/templates so the deferred software & crypto copilot gatherers can actually fire in reports (not just via agent tools).
- **Key-gated sources (Arkham, MistTrack) built behind no-op guards now:** lib + conditionally-registered tool written now, dormant (`needs-key`) until a secret is provisioned.
- **Execution this session:** spec → implementation plan → implement **Phases 1–3** end-to-end with tests, checkpointing between phases for review. Phases 4–5 follow after.

Every API claim below was live-verified on 2026-06-11; sources that could not be confirmed are explicitly marked unverified / needs-key / smoke-gated rather than asserted.

---

# Supply-Chain Intelligence — Design Document (Final)

Upgrade the investigator agent **and** the Copilot report engine with supply-chain intelligence across three angles (software, crypto fund-flow, infra/hosting), built on a new shared library at `api/src/lib/supply-chain/`. Chosen scope: **A + C** (shared-lib architecture + broad multi-source breadth) plus fixing the 6 stubbed/un-wired gatherers.

> **Revision note (addresses P0).** This branch's report engine **cannot route a crypto-address subject to any template**. Verified in `api/src/lib/report/subject-resolver.ts`: `detectType()` runs `CVE → IP → DOMAIN → HASH → keyword → 'generic'`; `HASH_RE = /^[a-fA-F0-9]{32,64}$/` does **not** match a `0x`-prefixed 42-char EVM address, and `TEMPLATE_BY_TYPE['generic'] = 'threat-actor'`. So an EVM/TRON address resolves to `generic → threat-actor`, **never `ioc`**. The earlier draft attached crypto gatherers (`chainalysis-oracle`, `tornado-cash-mixers`, `goplus-token-security`, `honeypot-is`, `ethlist-label`) to the `ioc` template; **they would never fire for any crypto address** and would self-skip to empty for real IP/domain/hash subjects — i.e. silently-empty stubs, the exact malpedia/kev-cves anti-pattern this initiative exists to kill. **All five crypto gatherers are therefore moved out of the now-shippable set and into Phase 4, behind a real `crypto-address` subject type + resolver regex.** The crypto **agent tools** are unaffected and still ship in Phase 3 (they have no template dependency). Every per-source verdict in the data independently flagged "no crypto/address subject type exists"; this revision honors that instead of overriding it.

---

## 1. Overview & goals

"Supply-chain intelligence" here is the set of signals that answer _"is this dependency / counterparty / hosting provider trustworthy, and who is behind it?"_ across three orthogonal angles:

- **Software** — for an open-source package: known vulnerabilities, **malicious-package** verdicts (typosquat / dependency-confusion / protestware), CVSS, fixed version, license/deprecation, OpenSSF Scorecard, resolved dependency-graph size, CISA-KEV exploitation status. Sources: OSV.dev, deps.dev, GitHub GHSA (incl. `type=malware`), OpenSSF malicious-packages (via OSV), CISA KEV.
- **Crypto fund-flow** — for a wallet/contract counterparty surfaced during tracing: authoritative on-chain sanctions status, mixer exposure, token-contract risk (honeypot/rug), and curated entity labels. Sources: Chainalysis on-chain Sanctions Oracle, Tornado Cash pool list, GoPlus token-security, Honeypot.is, ethereum-lists; key-gated: Arkham, MistTrack.
- **Infra / hosting** — for an IP / domain / ASN: bulletproof/abusive AS membership, abuse-contact desk, BGP routing/upstream-transit provenance, ground-truth AS+prefix facts, and distrusted-CA certificate history. Sources: Spamhaus ASN-DROP, Abusix, RIPEstat `bgp-state`, bgp.tools, crt.sh CA-distrust.

**Goals**

1. **One implementation per source.** Each source gets exactly one lib function in `api/src/lib/supply-chain/` (or, for already-resident infra sources, the existing `lib/rdap.ts` / `lib/cve-enrich.ts`), consumed by **both** an agent tool and a copilot gatherer. No duplicated upstream clients.
2. **Honest budget discipline.** Every new path fits the Cloudflare free-plan 50-subrequest/invocation cap; copilot gatherers declare a true `cost`; nothing is added to the IOC fan-out (one `primeBatch`+`flushBatch`).
3. **No silently-empty stubs.** A gatherer is wired **only when a subject can actually resolve to a template that lists it**. This is now a hard rule with teeth: the crypto gatherers are deferred to Phase 4 precisely because no address subject resolves to `ioc` today (P0). Where no resolver path exists yet (package/crypto-address), ship the agent tool now, defer the gatherer.
4. **Verified or honest.** Every shipped source is live-verified against its real upstream response shape. Needs-key and unverified sources are gated behind a secret and ship as safe no-ops. End-to-end paths that lean on an _inference_ (e.g. public RPCs accepting `eth_call`, bgp.tools whois/43 line format) are explicitly flagged as **smoke-gated**, not "live-verified end-to-end," until their dedicated live smoke passes.

---

## 2. Architecture: the `api/src/lib/supply-chain/` shared module

### 2.1 Module layout (one file per source)

```
api/src/lib/supply-chain/
  types.ts                 # shared normalized result envelopes (below)
  osv.ts                   # queryOsvPackage() + queryOsvBatch() (refactor of routes/osv.ts)
  depsdev.ts               # fetchDepsDev() + resolveLatestVersion()
  ghsa.ts                  # fetchGhsaAdvisories() + fetchGhsaById()  (refactor of routes/github-security.ts)
  malicious-packages.ts    # checkMaliciousPackage()  (MAL- subset of OSV)
  kev.ts                   # fetchKevCatalog() + kevForCves()  (dedup of ~7 KEV impls)
  chainalysis-oracle.ts    # checkChainalysisOracle() + encode/decode helpers
  tornado-cash.ts          # checkTornadoCash() + loadTornadoCashSet() (embedded snapshot)
  goplus.ts                # fetchTokenSecurity()
  honeypot.ts              # checkHoneypot()
  ethereum-lists.ts        # lookupEthList()
  asndrop.ts               # lookupAsnDrop() + parseAsnDrop()
  ca-distrust.ts           # classifyIssuer() (pure) + assessCaReputation()
  ripe-routing.ts          # fetchRipeRouting()  (bgp-state only — registry calls already in asn-graph.ts)
  bgp-tools.ts             # bgpToolsLookup() (whois/43) + warmBgpAsnNameMap()
  arkham.ts                # lookupArkhamEntity()  (needs-key, no-op without ARKHAM_API_KEY)
  misttrack.ts             # lookupMisttrack()     (needs-key)
```

**NOT in this module (RDAP exception).** RDAP is infra _registration_ data, not supply-chain. The shared lib lives in `api/src/lib/rdap.ts` — export the existing private `tryRdap`, add `rdapIpLookup()` / `rdapAsnLookup()` there. Do **not** create `supply-chain/rdap.ts`.

### 2.2 The duplication rule

> Each source has exactly ONE lib function. The agent tool's `execute()` calls a thin internal route (`apiFetch(self, '/api/v1/...')`) whose handler calls the lib fn; the copilot gatherer (`FETCHERS[id]`) imports and calls the **same** lib fn directly with `ctx.env`-bound fetch. The lib fn is pure-ish: inputs + an injectable `fetchImpl`/`fetcher` (defaults to global `fetch`), no `env` import except where a secret/KV is unavoidable (then `env` is a typed param). Caching lives in the **route handler** (or in the gather budget), never inside the lib, so the lib stays unit-testable with zero network.

This kills the duplication the task warns about: OSV (`routes/osv.ts` browser scanner vs new agent tool), GHSA (`cve-lookup.ts` + `github-security.ts`), KEV (~7 copies), Tornado labels (`chain-seed-labels.ts` 3 stale rows).

**Two rule clarifications from review (P3):**

- **RDAP dispatch lives in exactly one place.** The `rdap_registration` agent tool's route (`/api/v1/rdap`) does the target-type dispatch to `rdapLookup`/`rdapIpLookup`/`rdapAsnLookup`. `execute()` only forwards the raw `target` string — it does **not** re-classify the target. No duplicated dispatch.
- **Tornado has exactly one fn, three callers.** `checkTornadoCash`/`loadTornadoCashSet` (embedded const) is imported by (a) the `check_mixer_exposure` agent tool, (b) the deferred `tornado-cash-mixers` gatherer, and (c) the tracer sweep/risk path — zero subrequests, one source of truth. This is the cleanest integration in the doc; keep it intact.

### 2.3 Normalized output types

`api/src/lib/supply-chain/types.ts`:

```ts
export type Fetchish = typeof fetch;

/** Common envelope every supply-chain lib fn returns (status is honest, never throws). */
export type SCStatus = 'ok' | 'empty' | 'error' | 'needs-key';

export interface SCBase {
  source: string; // e.g. 'osv.dev', 'deps.dev', 'Chainalysis Sanctions Oracle'
  status: SCStatus;
  fetched_at: string; // ISO
  error?: string;
}

/** ── SOFTWARE ── */
export interface SCFinding {
  id: string; // GHSA-*, CVE-*, MAL-*
  malicious: boolean; // id.startsWith('MAL-')
  summary?: string;
  cvss?: string; // e.g. "7.5"
  severity?: string; // critical|high|medium|low|unknown
  aliases: string[];
  fixed?: string;
  modified?: string;
  references?: string[];
}
export interface SCSoftwareResult extends SCBase {
  package: string;
  ecosystem: string;
  version?: string;
  total: number;
  malicious_count: number;
  findings: SCFinding[];
}

/** ── CRYPTO ── reuses the in-app LabelCategory so it feeds risk-score.ts directly. */
import type { LabelCategory } from '../address-labels';
export interface SCAddressSignal extends SCBase {
  address: string;
  chain?: string;
  category: LabelCategory | null; // mixer | sanctioned | exchange | bridge | ...
  sanctioned: boolean | null; // null = inconclusive (Oracle RPC failed)
  risk_flags: string[]; // e.g. 'honeypot','high-sell-tax','tornado-pool'
  risk_score?: number; // 0..100 where the source provides one
  label?: string; // human label (entity/token name)
  detail?: Record<string, unknown>;
}

/** ── INFRA ── */
export interface SCInfraResult extends SCBase {
  resource: string; // ip | cidr | "AS####" | domain
  listed?: boolean; // ASN-DROP / distrusted-CA membership
  facts: Array<{ label: string; value: string; url?: string }>;
  detail?: Record<string, unknown>;
}
```

Each lib fn may return a _richer_ source-specific shape (e.g. `DepsDevReport`, `OracleCheck`) for the agent path, plus a `toSC*()` mapper the gatherer uses to flatten into `SourceItem[]`. The common envelope guarantees a uniform `status` contract so callers can branch identically.

### 2.4 SourceItem mapping (copilot side)

Gatherers wrap results via the existing `base(src, status, items)` helper (`gatherer.ts:36`). Mapper convention: one `SourceItem` per discrete, separately-citable fact (mirrors `cveFetcher()` emitting per-fact items), with `fields` carrying the structured object so the report writer can cite it.

---

## 3. Verified source inventory

All verifications dated 2026-06-11 against live upstreams. **Subrequest cost** = warm-cache cost (cold in parens).

### 3.1 SHIP NOW — zero-auth, live-verified

| Source                                                     | Angle    | Auth                      | Recommendation                                        | Subrequest cost                           | Already in app                                    |
| ---------------------------------------------------------- | -------- | ------------------------- | ----------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| **OSV.dev** `/v1/query`                                    | software | none                      | **ship-now** (agent tool) + enrichment (lib refactor) | 1 (1 KV + 0–1 fetch + 0–1 KV)             | yes (`routes/osv.ts`, unwired to agent)           |
| **deps.dev** v3                                            | software | none                      | **ship-now**                                          | ≤4 typical, hard-cap 6 (1 KV warm)        | no                                                |
| **GitHub GHSA** Global Advisories                          | software | optional PAT (60→5000/hr) | enrichment (+`type=malware` is net-new)               | 1 (CF edge cache)                         | yes (twice; never uses `type=malware`)            |
| **OpenSSF malicious-packages** (via OSV)                   | software | none                      | enrichment                                            | 1 (1 KV warm)                             | partial (`routes/osv.ts` doesn't isolate MAL-)    |
| **CISA KEV**                                               | software | none                      | enrichment + **dedup** (~7 impls→1)                   | 1 Cache-API warm (3 cold)                 | yes (7+ files)                                    |
| **Chainalysis Sanctions Oracle** (on-chain `isSanctioned`) | crypto   | none (eth_call)           | enrichment — **smoke-gated** (see §3.4)               | 1–3 (eth_call + Cache-API)                | partial (`ofac-sanctions.ts` is a different list) |
| **Tornado Cash pool list** (embedded snapshot)             | crypto   | none                      | enrichment                                            | **0** (embedded const)                    | partial (3 stale seed rows)                       |
| **GoPlus token-security**                                  | crypto   | none                      | **ship-now** (agent tool)                             | 1 (3 with KV)                             | no                                                |
| **Honeypot.is** `/v2/IsHoneypot`                           | crypto   | none                      | enrichment (agent tool now)                           | 1 (3 with Cache-API)                      | no                                                |
| **ethereum-lists** (tokens+contracts)                      | crypto   | none                      | enrichment (single-address only)                      | 1 KV warm (3–4 cold); negative-cache 404s | no (adjacent to label store)                      |
| **Spamhaus ASN-DROP**                                      | infra    | none                      | **ship-now**                                          | 1 list fetch/hr, then 0                   | no                                                |
| **Abusix Abuse Contact** (DoH TXT)                         | infra    | none                      | enrichment                                            | 1 DoH (0 KV warm)                         | partial (RIPE/RDAP give abuse contacts)           |
| **RIPEstat `bgp-state`**                                   | infra    | none                      | enrichment (only `bgp-state` is net-new)              | 1                                         | yes (other RIPEstat calls in `asn-graph.ts`)      |
| **crt.sh CA-distrust**                                     | infra    | none                      | enrichment                                            | 1 (CF edge cache; pure classifier = 0)    | yes (crt.sh used; never flags distrust)           |
| **RDAP IP/ASN** (`lib/rdap.ts`)                            | infra    | none                      | enrichment (domain RDAP already shipped)              | 1 (24h edge cache)                        | yes (domain only)                                 |

### 3.2 NEEDS-KEY / SPLIT-OUT / DEFER — build behind a guard, do not claim it works

| Source                     | Angle  | Auth                                                                               | Recommendation                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **bgp.tools**              | infra  | none, but **hard contact-UA required (403 without)**; live path is whois/43 socket | enrichment — **own sub-phase (2b), smoke-gated** (P2 #7) | **CRITICAL: existing `asn-graph.ts` calls `https://bgp.tools/api/v1/preview/<ip>` + `/api/v1/as/<asn>` which return the HTML homepage, not JSON — those endpoints DO NOT EXIST and silently contribute nothing.** Fix: replace with whois/43 (`lib/whois-tcp.ts` pattern) + KV-cached `asns.csv` name map (cron-warmed). The whois/43 single-line format is **documented but NOT runnable in the analysis sandbox** and `class` field meaning is undocumented — so this is **not** a "flagship zero-auth" item; it ships in its own sub-phase **2b** with the live-format smoke (GET `asns.csv` WITH contact UA, assert `asn,name,class,cc` header) as a merge gate. |
| **Arkham Intelligence**    | crypto | paid, application-gated (`API-Key` header)                                         | enrichment, behind `ARKHAM_API_KEY` no-op                | Base URL ambiguous (`api.arkhamintelligence.com` vs `api.arkm.com`) — use `ARKHAM_API_BASE` secret, do not hardcode. Only `/intelligence/address/{addr}/all` is independently verified. **Registration policy: consistent with MistTrack — the Arkham agent tool is also registered only when `ARKHAM_API_KEY` is set** (see §4 / §11 #9), so the planner never wastes a slot or an internal hop on a guaranteed-empty tool.                                                                                                                                                                                                                                         |
| **MistTrack / MetaSleuth** | crypto | paid (`api_key` query), no free tier                                               | **defer**                                                | `risk_score` version (v2 vs v3) and `{success,msg,data}` envelope unconfirmed without a key. Don't register the agent tool unless `MISTTRACK_API_KEY` is set (so the planner never picks a dead tool).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### 3.3 DROP

| Source                | Angle  | Reason                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DefiLlama bridges** | crypto | **drop.** Every `bridges.llama.fi/*` path now returns HTTP 402 (moved to Pro tier). Independent second blocker: the `/bridges` list returns **no addresses** (only volume), so it can never label a counterparty. If bridge labeling is wanted, add curated bridge-contract addresses to `chain-seed-labels.ts` (free, in the existing `LabelCategory:'bridge'` pipeline). |

### 3.4 Honesty notes on what is NOT verified end-to-end

- **Chainalysis Oracle (smoke-gated, P2 #8).** The contract ABI/addresses are verified (Etherscan-confirmed `SanctionsList`, selector `0xdf592f7d`, Base divergence). What is **not** independently confirmed is that the repo's public `EVM_RPCS` accept **`eth_call`** — only `eth_getTransactionByHash` is proven in-repo; the `eth_call` claim is an _inference_ from `tx-fetch.ts`'s POST pattern. Do **not** describe the Oracle as "live-verified end-to-end in our RPC path" until the §10.5 smoke (historically-sanctioned TC address returns `true`) passes against the actual RPC list. The lib must try the RPC fallback list and return `sanctioned:null` if all RPCs reject `eth_call`.
- **bgp.tools whois/43** single-line format is documented but not runnable in the analysis sandbox (socket); `class` semantics undocumented. Parser is **unverified against a live response** → see Phase 2b merge gate.
- **bgp.tools "BGPView shutdown" claim:** plausible but not independently confirmed.
- **Arkham** broader endpoint list (transfers/portfolio/tags) and numeric rate limits: community-doc only, unverified. Base URL genuinely unverifiable without a key.
- **MistTrack:** entirely doc-derived (no key); response envelope and `risk_score` version unconfirmed.

---

## 4. Agent integration (`buildToolRegistry()` in `api/src/lib/agent/tools.ts`)

New tools added to the array returned by `buildToolRegistry()` (`~line 77`). Each follows the existing `apiFetch(self, '/api/v1/...', apiKey, init, ih)` pattern. `ih` is the signed `x-internal-token` minted by the investigator DO; auth passes through automatically.

**Section: SUPPLY CHAIN / SBOM (new, ~near the CVE block line 197)**

| Tool                          | Params                                                          | Route                                                                   | Subreq                   |
| ----------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| `scan_dependencies`           | `packages: string` ("eco:name@ver" lines/commas)                | POST `/api/v1/osv/scan` (existing)                                      | ≤36 (batch path, capped) |
| `scan_package`                | `system: enum`, `name: string`, `version?: string`              | GET `/api/v1/supply-chain/package` → `fetchDepsDev`                     | ≤6                       |
| `check_supply_chain_advisory` | `package?`, `ecosystem? enum`, `cve?`, `ghsa?`, `malware? bool` | GET `/api/v1/github-security?...` (add `type=malware` path)             | 1                        |
| `check_malicious_package`     | `name: string`, `ecosystem: string`                             | POST `/api/v1/supply-chain/malicious-package` → `checkMaliciousPackage` | 1                        |

> **OSV tool-naming reconciliation (P1 #2).** The underlying data carries **two** sketches literally named `scan_package` — one from OSV's verdict (→ OSV `/v1/query`) and one from deps.dev's verdict (→ deps.dev). This doc resolves the collision deliberately: **`scan_package` is deps.dev** (single-package deep intel: Scorecard + dep-graph + license). **OSV's single-`/v1/query` agent path is folded, not built** — OSV survives in the agent only as (a) `scan_dependencies` (lockfile/batch, vuln IDs, version-pinned, 35-detail cap) and (b) `check_malicious_package` (the MAL- malicious-package check). An implementer must **not** build a third, colliding OSV `scan_package` tool from the OSV verdict; the descriptions disambiguate scan_dependencies (batch) vs scan_package (deps.dev single-package). `check_malicious_package` and `scan_dependencies` both touch OSV MAL- data, but the former is the "is this package malware?" verdict and the latter surfaces MAL- IDs incidentally inside a vuln scan — the descriptions keep them distinct.

**Section: CRYPTO & FINANCIAL (existing, ~line 662, next to `trace_crypto_address`)**

| Tool                        | Params                                      | Route / call                                                                                                | Subreq                                         |
| --------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `check_sanctions_oracle`    | `address`, `chain? enum`                    | GET **`/api/v1/crypto-trace/oracle`** (NEW sub-route, own `validate('query',…)`) → `checkChainalysisOracle` | 1–3                                            |
| `check_mixer_exposure`      | `address`                                   | **direct lib import** `checkTornadoCash` (embedded)                                                         | 0                                              |
| `check_token_security`      | `contract`, `chain? enum`                   | GET `/api/v1/token-security` → `fetchTokenSecurity`                                                         | 1–3                                            |
| `check_token_honeypot`      | `address`, `chain? enum[ethereum,bsc,base]` | GET `/api/v1/honeypot-check` → `checkHoneypot`                                                              | 1–3                                            |
| `lookup_evm_contract_label` | `address`, `chain_id? number`               | GET `/api/v1/supply-chain/ethlist-label` → `lookupEthList`                                                  | 1–4                                            |
| `arkham_attribute_address`  | `address`                                   | GET `/api/v1/supply-chain/arkham` → `lookupArkhamEntity`                                                    | **registered only if `ARKHAM_API_KEY` set**    |
| `check_crypto_address_risk` | `address`, `coin?`                          | GET `/api/v1/supply-chain/address-risk` → `lookupMisttrack`                                                 | **registered only if `MISTTRACK_API_KEY` set** |

> **`check_sanctions_oracle` route is genuinely new (P1 #5).** The existing tracer is **GET-only** at `/api/v1/crypto-trace` with `validate('query', cryptoTraceSchema)` (confirmed: `api/src/index.ts:712`). The oracle is **not** a reuse of that handler — it is a **new** sub-route `GET /api/v1/crypto-trace/oracle` that needs its **own** route registration and its **own** `validate('query', oracleSchema)` mirroring exactly `{address, chain?}`. This schema is added to the §10.3 mirroring checklist (it was omitted in the draft).

### cti-loop guardrail considerations

- **No new banned tools.** None are "dump" tools; `BANNED_TOOLS` (`cti-loop.ts:27`) is unchanged. `noUnknownTools` auto-admits each because `validToolNames` is derived from the registry at runtime.
- **`MAX_TOOLS_PER_STEP = 2`**: the only co-tenancy hazard is `scan_dependencies` (≤36 subreq) paired with another heavy fan-out in one step. The route's own 35-detail cap + the 2-tool cap keep realistic pairings under 50; tool descriptions nudge the LLM toward focused inputs. All other new tools are 0–4 subreq, so any pairing is safe.
- **No-dup-args** guardrail already prevents repeated identical calls.
- **Conditional registration (unified rule, P2 #9):** `check_crypto_address_risk` (MistTrack) **and** `arkham_attribute_address` (Arkham) are both added to the registry array **only when their key is set** (`env.MISTTRACK_API_KEY` / `env.ARKHAM_API_KEY`). Rationale: a "registered-but-empty" tool still consumes a planner tool slot and an internal hop; gating both keeps the rule consistent and the planner clean. The lib fns still return a safe no-op (`null`/`needs-key`) if ever invoked without a key, but the tool is simply absent from the registry when unkeyed.

---

## 5. Copilot integration (`FETCHERS` + `SOURCE_CATALOG`)

The report engine's `TemplateId` is **only** `ransomware-group | threat-actor | cve | ioc`, and `SubjectType` is `cve | ip | domain | hash | actor | ransomware | generic`. **There is no package, crypto-address, or token template/subject.** The task preamble's `cve/ip/domain/hash/actor/ransomware/generic` _template_ list is wrong for this branch — `ioc` is the template that serves ip/domain/hash subjects, and `generic` resolves to the `threat-actor` template.

### 5.1 Gatherers shippable NOW (subjects actually resolve to these templates)

Add to `FETCHERS` in `gatherer.ts` and the descriptor to `SOURCE_CATALOG['ioc']` / `['cve']`. **Every entry below was checked against `subject-resolver.ts`: an `ip`/`domain` subject does resolve to `ioc`, and a `cve` subject does resolve to `cve`.** No crypto-address gatherers appear here (see §5.2 and the P0 note) because no address subject resolves to `ioc`.

| FETCHERS id         | Template | Subject guard                                                       | kind / authority / cost     | Lib call                                                                               |
| ------------------- | -------- | ------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `ghsa-supply-chain` | `cve`    | `type==='cve'` (via `cve_id`); +`malware` call if ecosystem present | live / A / 1 (2 w/ malware) | `fetchGhsaAdvisories`                                                                  |
| `asn-drop`          | `ioc`    | `type==='ip'\|'domain'` (resolve ASN)                               | live / A / 1                | `lookupAsnDrop` / `lookupAsnDropForIp`                                                 |
| `abusix-contact`    | `ioc`    | `type==='ip'`                                                       | live / B / 1                | `lookupAbuseContact`                                                                   |
| `ripe-routing`      | `ioc`    | `type==='ip'`                                                       | live / B / 1                | `fetchRipeRouting`                                                                     |
| `bgp-tools`         | `ioc`    | `type==='ip'`                                                       | live / B / 1                | `bgpToolsLookup` _(ships in Phase 2b with the rest of the bgp.tools fix, not Phase 2)_ |
| `ca-reputation`     | `ioc`    | `type==='domain'`                                                   | live / A / 1                | `assessCaReputation`                                                                   |

> All shippable infra gatherers self-skip non-matching subjects (`return base(src, 'empty')`). They are attached to `ioc` only (never cve/actor/ransomware). This is honest because `ip`/`domain` subjects genuinely route to `ioc` — unlike crypto addresses, which do not.
>
> `rdap` gatherer is **deferred**: no domain/ip _template_ beyond `ioc`; add `{ id:'rdap', name:'RDAP Registration', kind:'live', authority:'A', cost:1 }` to `ioc` only when an IP/domain RDAP fact is wanted there — recommended as part of this same `ioc`-enrichment batch, guarding `type in {ip,domain}`.

### 5.2 Gatherers DEFERRED (no subject resolves to them today)

`osv-package`, `depsdev`, `ossf-malicious-package` (software) **and** `chainalysis-oracle`, `tornado-cash-mixers`, `goplus-token-security`, `honeypot-is`, `ethlist-label`, `arkham-attribution`, `misttrack-risk` (crypto). **Do not register any of these** — they would silently no-op for every current subject (the malpedia/kev-cves anti-pattern, and, for the crypto ones, the **P0 root cause**: `0x…` addresses resolve to `generic → threat-actor`, never `ioc`). Ship their **agent tools** now (Phases 2/3); add the gatherers in **Phase 4** once the report engine gains `package` / `crypto-address` `TemplateId`s + the matching `detectType` regex branches + `TEMPLATE_BY_TYPE` entries.

---

## 6. Crypto tracer integration

The tracer already: cross-refs OFAC (`ofac-sanctions.ts loadSanctionedSet`) + ScamSniffer (`scamsniffer.ts loadScamSnifferSet`) in `address-watch.ts evaluateAlerts()` (line 46); resolves curated/Blockscout/ENS/user labels via `address-labels.ts` (`LabelCategory` includes `mixer|sanctioned|bridge|exchange|...`); and bumps risk in `risk-score.ts` for `labelCategory==='mixer'|'sanctioned'` etc. The new sources slot into these three existing seams **without touching the IOC fan-out**. (Note: this section is **agent-tool + tracer** integration only — the crypto _copilot gatherers_ are deferred to Phase 4 per §5.2/P0.)

**(a) Tornado Cash — fix the stale seed + feed the sweep/risk/watch.** `chain-seed-labels.ts` has only 3 TC rows with a stale "OFAC-sanctioned" comment (TC contracts were delisted 2025-03-21). Replace/augment with `loadTornadoCashSet()` (67 embedded instance addrs + curated router/proxy), fix the comment **in the same change** (otherwise `risk-score.ts` double-counts via both the stale seed and the new set), and feed the set into:

- `address-watch.ts evaluateAlerts()` — add a 4th cross-ref set `tornado: Set<string>` alongside `sanctioned`/`scam`. Verified against `address-watch.ts`: `evaluateAlerts` cross-refs sets with EVM-lowercasing (`watch.chain === 'evm' ? lc : t.counterparty`), and the sweep loader (lines ~166–168) gates on `needSuspicious`. The embedded set is zero-subrequest, lowercase-keyed to match. A TC counterparty fires **`suspicious_counterparty` (an AML signal, NOT a sanctions hit)** with `ofac_status:'delisted_2025-03-21'`. **TC must NOT be merged into the `sanctioned` set** (which still drives the true OFAC alert) — preserve this distinction exactly.
- `risk-score.ts` — `labelCategory==='mixer'` already bumps risk; the embedded set makes far more counterparties resolve to `mixer`. Zero subrequest cost (embedded).

**(b) Chainalysis Sanctions Oracle — confirmation/second-source signal (smoke-gated).** Wire `checkChainalysisOracle()` as an **opt-in single-address** enrichment on the tracer **root node only** (not per-counterparty — that would blow the budget). Interpretation matrix: oracle+OFAC-list agree → high confidence; oracle-only → newer designation than the cached `0xB10C` list; list-only → on SDN but not yet pushed on-chain (documented lag). Surfaced via the `check_sanctions_oracle` agent tool and the new `/api/v1/crypto-trace/oracle` route. Keep `ofac-sanctions.ts` as the fan-out cross-ref (it covers BTC/XMR/Tron/Solana the EVM oracle cannot). **Per §3.4, treat the RPC `eth_call` path as smoke-gated** — ship the no-throw lib now (returns `sanctioned:null` if RPCs reject `eth_call`) but gate the "works end-to-end" claim on the §10.5 live smoke.

**(c) GoPlus / Honeypot.is — token-contract risk (orthogonal to wallet tracing).** These analyze **token contracts**, not wallets, so they do not enter the per-counterparty sweep. They are agent tools (`check_token_security`, `check_token_honeypot`) the investigator invokes for a specific contract surfaced in a trace. `fetchTokenSecurity` derives `risk_flags`/`risk_score` that map into `SCAddressSignal`. (Their copilot gatherers are deferred to Phase 4 — no contract-address subject resolves today.) **Honeypot.is rate limit (P1 #6):** the live API enforces `x-ratelimit-limit: 50` per rolling window; the route must **honor `Retry-After` and degrade to `isHoneypot:null` on 429** (fail-open, never infer "safe"). The 300s Cache-API TTL absorbs repeats but does not replace 429 handling.

**(d) ethereum-lists — single-target label enrichment, NEVER a fan-out.** `lookupEthList()` is single-address (per-address files, no aggregate endpoint, EIP-55 checksum path). For tracer counterparty labeling keep using the existing **one batched D1 `SELECT`** (`loadLabelsForAddresses`). Use the live lib only for the agent single-address tool and a cold-miss enrichment of the tracer **root node**. Optional fast-follow: extend `AddressLabel.source` union with `'ethereum-lists'` and add an admin/offline backfill into the D1 `address_labels` store so fan-out stays at one batched SELECT.

**(e) Arkham / MistTrack — deferred enrichment behind keys.** Higher-coverage attribution/AML layers on top of the curated/Blockscout/ENS labels. Build behind `ARKHAM_API_KEY` / `MISTTRACK_API_KEY` no-op guards; both tools are conditionally registered (§4); dormant until a key exists.

---

## 7. Stub fixes (6 approved)

Each is purely additive (one `FETCHERS` key or one registry object); descriptors/routes already exist. Make the `FETCHERS` key match the `SOURCE_CATALOG` id **exactly** — a typo silently re-stubs it. **Phasing honesty (P1 #3):** these are the lowest-risk fixes, but Phase 1 is _not_ literally zero-risk — see §7.6's documented cross-fetcher ordering + double-fetch + silent-empty notes, now surfaced rather than buried.

### 7.1 `osv-into-agent` (agent tool)

**Reuse:** `routes/osv.ts osvScanHandler` (live), `apiFetch` helper, `validation-schemas.ts:276 osvScanSchema`. **Edit:** add the `scan_dependencies` tool object to `buildToolRegistry()` (~line 197). `execute()` parses `"eco:name@ver"` lines/commas via `/^([^:]+):([^@]+)(?:@(.+))?$/`, builds `{packages:[{name,ecosystem,version?}]}` (must match `osvScanSchema` or `validate('json')` 400s), rejects on zero valid specs. **No cti-loop change** (`noUnknownTools` auto-admits). Cost ≤36 subreq, route-capped. **looseValidation note (P5 #15):** this is a JSON (not multipart) POST; the body is tiny and stays well under the 256KB `looseValidation` cap.

### 7.2 `malpedia-gatherer` (copilot)

**Reuse:** the live actor/family pattern in `copilot.ts:563–578` and `routes/malpedia.ts` slug normalization `name.trim().toLowerCase().replace(/[^a-z0-9.-]/g,'-')`; `base()`/`needle()`/`arr`/`str`. **Do NOT** use the hash-only `providers/malpedia.ts`. **Edit:** add `malpedia` Fetcher to `FETCHERS` — guard `type in {actor,ransomware,generic}`, try `/api/get/actor/{slug}` then fall back to `/api/get/family/{slug}`, **skip empty-description items** (win.lockbit returns `description:''`), emit description/attribution/families/aliases items. Cost 2 (descriptor already correct). No catalog edit.

### 7.3 `actor-kb-gatherer` (copilot)

**Reuse:** `ACTOR_ALIASES` from `data/threat-actor-aliases.ts` + the `.includes` match predicate from `copilot.ts:516`; mirror the `mitre-group` dynamic-import style. **Edit:** add pure (zero-fetch) `actor-kb` Fetcher to `FETCHERS` — filter `ACTOR_ALIASES`, emit alias/MITRE items, `slice(0,10)`. Actual cost 0; leave declared cost 1 to avoid phase repacking (P5 #16 — agreed). Keep alongside `mitre-group` (corroboration, not duplication).

### 7.4 `wikipedia-gatherer` (copilot)

**Reuse:** `copilot.ts:580–636` REST-v1 summary + `w/api.php` search fallback, UA `pranithjain-copilot/1.0`. **Edit:** add `wikipedia` Fetcher (threat-actor template) — guard out `ip/domain/hash/cve`, direct summary then search fallback, HTML-strip snippets, use `ctx.signal` (not a fresh timeout). Cost 2. Risk: REST-v1 is being deprecated by WMF; `w/api.php` is the durable fallback; degrade to `empty` (not `error`).

### 7.5 `shodan-cvedb-gatherer` (copilot)

**Reuse:** `copilot.ts:469–507` CVEDB fetch + field reads; mirror `cveFetcher()`. **Edit:** add `shodan-cvedb` Fetcher (cve template) — guard `type==='cve'`, fetch `https://cvedb.shodan.io/cve/{CVE}`, 404→`empty`, non-ok→`error`, emit CVSS/EPSS/KEV/`propose_action` items prefixed `Shodan CVEDB:`. **Field trap:** `ranking_epss` is the percentile, `epss` the score; `ransomware_campaign` is a string ('Known'/'Unknown'), not bool. Cost 1 (declared 2 OK). Use `ctx.signal`.

### 7.6 `kev-cves-gatherer` (copilot) — with explicit ordering + silent-empty honesty (P1 #3, #4)

**Reuse:** `fetchRlUpstream(env, '/group/<slug>')` (`routes/ransomwarelive.ts:72`, **confirmed import-safe from the gatherer**) for the group→CVE list (KEV has **no** per-group keying), and `enrichCves(cves, {signal})` (`cve-enrich.ts:238`) for batched KEV+EPSS (1 cached catalog + 1 batched EPSS, ≤100 CVEs; `CveEnrichment` carries `kevListed/kevDateAdded/kevDueDate/epssScore/epssPercentile` — confirmed). **`enrichCves` needs no `env`** (it owns its Cache-API path) — confirmed; do **not** loop `lookupCve` per CVE (6 fetches each → budget blowout). **Edit:** add `kev-cves` Fetcher (ransomware-group) — guard `type==='ransomware'`, collect `vulnerabilities[].CVE`, `enrichCves`, emit `"<group> exploits <CVE> — CISA KEV: LISTED (added…, due…) · EPSS …"`.

**Two failure modes this fix must surface honestly, not bury:**

- **Ordering / double-fetch:** the group→CVE list comes from `/group/<slug>`, which is also hit by `ransomwarelive-profile` in the **same** gather phase. The KEV verdict's own sketch warns that if they run concurrently the CVE list "isn't available yet." This design picks **self-fetch (option b)** — `kev-cves` fetches `/group/<slug>` itself via `fetchRlUpstream`, which is correct but means **both** `ransomwarelive-profile` and `kev-cves` hit `/group/<slug>` (bypassing the route cache) → a deliberate, budget-acceptable double-fetch. Follow-up (not blocking): trim the bare `Exploits <CVE>` lines from the profile fetcher once `kev-cves` ships, and/or memoize `/group/<slug>` per report build.
- **Silent-empty on a missing key (P1 #4):** `fetchRlUpstream(ctx.env, …)` needs `env` and a `RANSOMWARELIVE_API_KEY`; when unset it returns null → status `'empty'`, **indistinguishable from "group has no CVEs."** This is the same silent-empty failure mode the initiative is fixing, so emit a log/telemetry line when the key is absent. Also note RL **slug fragility** ("LockBit" may need `lockbit3`) — a real silent-empty risk; consider trying `identifiers.group`/aliases. Cost 2.

---

## 8. Subrequest-budget analysis

Free plan: **50 subrequests / invocation; KV reads AND Cache-API both count.** Gather phase budget-packs into rounds of ≤40.

### 8.1 Agent (per step, `MAX_TOOLS_PER_STEP=2`, 20s/tool)

Worst realistic per-tool external cost: `scan_dependencies` ≤36 (route-capped), `scan_package` ≤6, all others 0–4. Pairing two ≤4-cost tools = ≤8. Only hazard is `scan_dependencies` + another fan-out tool in one step (≤36 + N) — bounded by the route cap and tool descriptions. **All other pairings sit comfortably under 50.**

### 8.2 Copilot gather rounds (≤40/round)

- **cve template** live phase after fixes: `nvd(2)+epss(1)+kev(1)+shodan-cvedb(2)+vulncheck-cve(1)+ghsa-supply-chain(1)=8`. Headroom huge.
- **ioc template** (IP subject) with all shippable infra gatherers firing: `virustotal(1)+abuseipdb(1)+greynoise(1)+otx(1)+urlscan(1)+malwarebazaar(1)+vulncheck(1)+asn-drop(1)+abusix-contact(1)+ripe-routing(1)+bgp-tools(1)+ca-reputation(1)=12`. **Packer never exceeds 40.** Note: there are **no crypto gatherers in the ioc round** — they were removed (P0). The earlier "EVM-address subject fires crypto gatherers" math is **moot/incorrect** for this branch and is deleted; recompute it in Phase 4 once a `crypto-address` template + resolver exist (P5 #14). `bgp-tools` is counted here but actually lands in Phase 2b.
- **ransomware-group**: `+kev-cves(2)+malpedia(2)` on top of existing — well under 40.

### 8.3 KV / Cache-API keys + TTLs (slow-changing datasets)

| Dataset               | Cache layer              | Key                                                           | TTL                                            | Notes                                                                                 |
| --------------------- | ------------------------ | ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| OSV single-pkg        | KV                       | `sc:osv:<eco>:<name>@<ver\|*>`                                | 6h                                             | `modified` ts shows freshness                                                         |
| deps.dev report       | KV (route)               | `sc:depsdev:<system>:<name>:<version>`                        | 6h; 404 negative 1h                            | normalized object only                                                                |
| GHSA                  | CF edge (existing route) | n/a                                                           | `cacheTtl 3600`                                | no extra KV                                                                           |
| OSSF malicious        | KV (route)               | `sc:malpkg:<eco>:<name>`                                      | 6–12h; cache negatives                         |                                                                                       |
| **CISA KEV (shared)** | Cache-API                | `https://intel-cache.internal/kev/v1`                         | 6h                                             | one whole-catalog blob; in-memory Map filter; **dedups 7 impls**                      |
| Chainalysis Oracle    | Cache-API                | `https://chainalysis-oracle-cache.internal/v1/<chain>/<addr>` | 1–6h (short — designations are time-sensitive) |                                                                                       |
| **Tornado list**      | **embedded const**       | n/a                                                           | n/a (compile-time)                             | optional `refreshTornadoCashSnapshot()` Cache-API `…/v1/pools` 7–30d, cron/admin only |
| GoPlus                | KV                       | `goplus:tok:<chainId>:<contract>`                             | 1h                                             | drop `holders[]` before caching                                                       |
| Honeypot.is           | Cache-API (route)        | `…(chainID,address)`                                          | **300s** (volatile)                            | honor `Retry-After`/429 fail-open                                                     |
| **ethereum-lists**    | KV                       | `ethlist:v1:<chainId>:<lcaddr>`                               | 24h+                                           | **negative-cache 404s** (most are misses)                                             |
| **ASN-DROP**          | KV (whole list)          | `sc:asndrop:list`                                             | 3600s                                          | honors Spamhaus "≤1/hr"; N lookups = 0 extra subreq within the hour                   |
| Abusix                | KV                       | `sc:abusix:<ip>`                                              | 7d                                             |                                                                                       |
| RIPEstat bgp-state    | KV                       | `sc:ripe-route:<resource>`                                    | 6h                                             | query by IP/CIDR, cap paths/communities                                               |
| bgp.tools asn names   | KV (cron-warmed)         | `sc:bgptools:asnames`                                         | 24h                                            | full `asns.csv` pulled by cron ONLY, never per-step (Phase 2b)                        |
| bgp.tools whois/43    | Cache-API (route)        | `https://bgp-tools.internal/<ip\|asn>/<value>`                | 10min                                          |                                                                                       |
| crt.sh distrust       | CF edge (existing)       | n/a                                                           | 1h                                             | pure `classifyIssuer` = 0; share one ct-log fetch                                     |
| RDAP IP/ASN           | CF edge                  | n/a                                                           | `200-299:86400`                                | reuse `rdap.ts` config                                                                |
| Arkham                | KV                       | `sc:arkham:<addrLower>`                                       | 24h                                            | attribution only; never `/transfers`                                                  |
| MistTrack             | KV                       | `sc:misttrack:<coin>:<addr_lc>`                               | 6–24h                                          |                                                                                       |

**Hard rules enforced:** never per-counterparty / per-dependency-node / per-CVE cache ops; never add Cache-API on top of KV for the same value; never call any of these inside the IOC `primeBatch`/`flushBatch` fan-out.

---

## 9. Phasing / sequencing

Each phase is independently shippable + testable. Run all three `tsc` projects (`tsconfig.json`, `api/tsconfig.json`, `api/tsconfig.worker.json`) before any deploy; deploy from repo root.

**Phase 1 — Stub fixes (lowest risk, but not zero-risk).**
The 6 fixes in §7. Pure-fetcher unit tests run in CI. Closes the existing silently-empty/dead-capability gaps (incl. `osv-into-agent` agent wiring). No new routes, no secrets. **Caveats now surfaced (P1 #3/#4):** `kev-cves` introduces a deliberate `/group/<slug>` double-fetch and a key-absent silent-empty mode (telemetry-logged); RL slug fragility is a known silent-empty risk.

**Phase 2 — Zero-auth software + infra flagships, both subsystems.**
Shared libs + routes + agent tools + `ioc`/`cve` gatherers for: OSV refactor (extract `supply-chain/osv.ts`, dedup `routes/osv.ts`), deps.dev (`scan_package`), GHSA refactor + `type=malware`, malicious-packages, **KEV dedup** (consolidate ~7 impls into `supply-chain/kev.ts`), ASN-DROP, Abusix, RIPEstat `bgp-state`, crt.sh CA-distrust, RDAP IP/ASN. Agent tools + `ioc`/`cve` gatherers (the ones in §5.1, minus bgp-tools) all ship. **bgp.tools is explicitly NOT in this flagship set** (P2 #7).

**Phase 2b — bgp.tools rot fix (own sub-phase, smoke-gated).**
Rip the dead `/api/v1/*` calls in `asn-graph.ts`; replace with whois/43 (`cloudflare:sockets connect()`, contact-UA, fail-open to RIPE/RDAP) + cron-warmed `asns.csv` KV name map. Ship the `bgp-tools` agent tool + `ioc` gatherer here, **gated on the live-format smoke** (GET `asns.csv` WITH contact UA → assert `asn,name,class,cc` header; parse a real whois/43 line) as a merge gate. Materially higher-effort/riskier than Phase 2 (socket + unverified single-line parser + shared-IP throttling), so it is not bundled with the flagships.

**Phase 3 — Zero-auth crypto, agent tools + tracer (NO copilot gatherers).**
Chainalysis Oracle (smoke-gated, §3.4/§10.5), Tornado embedded set (+ fix stale seed/comment in the same change, feed sweep/risk/watch), GoPlus, Honeypot.is (429 fail-open), ethereum-lists. **Agent tools ship; tracer integration (§6) ships.** Crypto `ioc`-template gatherers do **NOT** ship here — per P0 they cannot fire, so they are deferred to Phase 4.

**Phase 4 — New `package` + `crypto-address` templates (the real unblock for all deferred gatherers).**
Add `TemplateId` `package`/`crypto-address`; add **resolver support** — new `detectType` branches (`PACKAGE`/`purl` form; an EVM `^0x[0-9a-fA-F]{40}$` + TRON `^T[1-9A-HJ-NP-Za-km-z]{33}$` address branch) and `TEMPLATE_BY_TYPE` mappings; extend `SubjectType`. Only then register the deferred gatherers (`osv-package`, `depsdev`, `ossf-malicious-package` under `package`; `chainalysis-oracle`, `tornado-cash-mixers`, `goplus-token-security`, `honeypot-is`, `ethlist-label` under `crypto-address`; `arkham-attribution`, `misttrack-risk` behind keys). This is the genuine cost of full copilot coverage for software + crypto-address subjects and is the **only** honest home for the §5.2 deferred set. Larger surface; own PR.

**Phase 5 — Key-gated enrichment (only if keys are provisioned).**
Arkham (`ARKHAM_API_KEY` + `ARKHAM_API_BASE`), MistTrack (`MISTTRACK_API_KEY`). Both tools conditionally registered. Build-behind-no-op-guard in earlier phases is fine; "claim it works" only after one live call confirms host + field shapes.

**Dropped:** DefiLlama bridges — not built. If bridge labeling is wanted, curated rows into `chain-seed-labels.ts`.

---

## 10. Testing strategy

1. **Pure-lib unit tests** (`api/test/lib/supply-chain/*.test.ts`, run in CI, no network): inject a `fetchImpl` returning fixtures captured from the live responses documented in the source verdicts. Assert field mapping, `malicious`/`MAL-` flagging, CVSS/fixed extraction, `'0'/'1'`→bool normalization (GoPlus), `null`-safe honeypot mapping, error/empty branches, and that no-key paths return `'needs-key'`/`null` with **zero** fetch calls. Pure helpers tested standalone: `encodeIsSanctionedCalldata`/`decodeBoolWord` (Oracle), `buildAbusixQueryName` (reverse-octet/nibble), `parseAsnDrop` (skip metadata line), `classifyIssuer` (CA DNs incl. `issued_after_distrust`), `checkTornadoCash` (size===67, case-insensitive, `ofac_status` const).
2. **Route tests** (`api/test/routes/*.test.ts`): run **locally with the vitest-pool-workers sandbox disabled** (`dangerouslyDisableSandbox`) — CI skips `test/routes/`. Mount the real router + key gate (OPEN_PUBLIC_READS valve), stub upstream/socket. The two **POST** routes (`/api/v1/osv/scan`, `/api/v1/supply-chain/malicious-package`) are **JSON, not multipart**, and the bodies are tiny — confirm they stay under the 256KB `looseValidation` cap (P5 #15).
3. **`validate()`-schema mirroring** (the known drift footgun): every new route's `validate()` schema MUST mirror exactly the handler's query/body reads:
   - `{ecosystem,name,version?}` (OSV malicious-package POST)
   - `{system,name,version?}` (deps.dev)
   - `{contract,chain?}` (GoPlus)
   - **`{address,chain?}` for the NEW `/api/v1/crypto-trace/oracle` route** (P1 #5 — was omitted in the draft; the oracle route needs its own `validate('query',…)`, separate from `cryptoTraceSchema`)
   - single `{target}`/`{resource}`/`{domain}` for the infra routes.
     The `scan_dependencies` unit test imports `osvScanSchema` and `.parse()`es the captured request body to guard against drift.
4. **Gatherer regression tests**: build a `GatherContext` with the relevant `subject`, call `FETCHERS[id](ctx, planned)` directly, assert `status`/`total`/no-empty-text-items and that wrong subject types return `'empty'` with zero fetches. **Add a P0 guard test for Phase 4:** assert that a `0x…40hex` query through `resolveSubject()` yields `type==='crypto-address'` → the `crypto-address` template (and, pre-Phase-4, a test asserting the crypto gatherers are NOT registered, so they can't silently no-op).
5. **"Verify against live upstream format"** (providers silently rot): each source has ONE network-gated, CI-skipped live smoke (a known-good fixture: axios/lodash/GHSA/MAL- for software, a historically-sanctioned address for the Oracle, `asndrop.json` header, `cvedb.shodan.io/cve/CVE-2024-1709`, a TC instance, ethereum-lists USDT/DAI files). **Two smokes are explicit merge gates, not optional (§3.4):** (a) the **Chainalysis Oracle** smoke must POST `eth_call` against the actual `EVM_RPCS` and confirm a historically-sanctioned TC address returns `true` — until this passes, the Oracle is "smoke-gated," not "live-verified end-to-end"; (b) the **bgp.tools** smoke (GET `asns.csv` WITH contact UA → assert `asn,name,class,cc` header) is the Phase-2b merge gate and is exactly what would have caught the existing rot.

---

## 11. Risks & open questions

- **[P0, RESOLVED] Crypto-address subjects don't route to any template.** The report resolver sends `0x…` addresses to `generic → threat-actor`, never `ioc`. All crypto copilot gatherers are therefore **deferred to Phase 4** behind a new `crypto-address` `SubjectType` + `detectType` regex + `TEMPLATE_BY_TYPE` mapping; only the **agent tools** ship pre-Phase-4. Do not re-attach crypto gatherers to `ioc`.
- **Unverified APIs.** Arkham broader endpoints + rate limits and MistTrack's entire schema (envelope, `risk_score` v2-vs-v3) are doc/community-only. Treat as unverified until a key + one live call confirm host/fields. Ship behind no-op guards + conditional registration; do not advertise.
- **Smoke-gated "live" sources.** Chainalysis Oracle (RPC `eth_call` is inferred, not proven) and bgp.tools whois/43 (line format unrunnable in sandbox) are **not** claimed working end-to-end until their §10.5 smokes pass. The Oracle lib returns `sanctioned:null` if RPCs reject `eth_call`; bgp.tools fails open to RIPE/RDAP.
- **Secret/key management.** New secrets: `ARKHAM_API_KEY`, `ARKHAM_API_BASE`, `MISTTRACK_API_KEY` (all `wrangler secret put`, server-side only). `GITHUB_TOKEN` already exists (raises GHSA 60→5000/hr; works unauthenticated). Conditional tool registration for **both** Arkham and MistTrack so the planner never selects a dead tool (unified rule, P2 #9).
- **bgp.tools licensing/etiquette.** Hard-enforced **custom contact User-Agent** (403 otherwise); no HTML scraping; bulk dumps ≤1/30min (cron only, never per-step). No formal license clause — email `admin@bgp.tools` for volume. Single-rack operator that throttles the shared CF egress IP → **always fail open** to RIPE/RDAP. Ships in its own Phase 2b, smoke-gated.
- **Dataset attribution.** Spamhaus ASN-DROP terms require crediting Spamhaus + preserving `metadata.copyright`/date — surface in any UI/report rendering. OSV.dev, ethereum-lists, OpenSSF malicious-packages are permissively licensed but send a descriptive UA (`pranithjain-dfir/1.0`). RIPEstat fair-use: add `sourceapp=pranithjain-dfir` to **all** `stat.ripe.net` calls (currently missing in `asn.ts`/`asn-graph.ts` — fix while there).
- **Tornado Cash legal nuance.** TC smart contracts were **delisted** from OFAC SDN on 2025-03-21. Encode `ofac_status:'delisted_2025-03-21'` as a documented constant and treat exposure as an **AML/laundering signal, not a sanctions hit**. Do not re-introduce a stale "OFAC-sanctioned" label, and fix the stale `chain-seed-labels.ts` comment in the same change to avoid risk-score double-counting.
- **Honeypot.is rate limit.** `x-ratelimit-limit: 50`/window on the live API — honor `Retry-After`, degrade to `isHoneypot:null` on 429 (fail-open, never infer "safe"). The 300s Cache-API TTL only absorbs repeats.
- **Chainalysis Oracle scope.** EVM-only; **Base uses a different contract** (`0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B` vs `0x40C5…`) — hardcode per-chain. Use `isSanctioned` (view bool), not `isSanctionedVerbose` (nonpayable, emits an event, no struct). Does not cover BTC/Tron/Solana — keep `ofac-sanctions.ts` for those.
- **crt.sh / Wikipedia flakiness & deprecation.** crt.sh returns HTML error bodies under load (guard `JSON.parse`, 15s timeout + retry, share the ct-log fetch). Wikipedia REST-v1 summary is being deprecated by WMF — the `w/api.php` search fallback is the durable path; degrade to `empty`, not `error`.
- **[RESOLVED] Phase 4 scope.** Phase 4 (new `TemplateId`s + `detectType`/`TEMPLATE_BY_TYPE` changes + `SubjectType` extension) is **in this initiative** (maintainer decision, 2026-06-11) — it is the real cost of full copilot coverage for software and crypto-address subjects and carries **all** deferred software _and_ crypto gatherers (the P0 fix moved the crypto ones here). Agent tools are unblocked immediately in Phases 2–3; Phase 4 lands as its own PR after the zero-auth phases. **Session execution stops after Phase 3 for review; Phases 4–5 follow.**
- **deps.dev `GetDependencies` coverage.** Only npm/Cargo/Maven/PyPI (not Go/RubyGems/NuGet) — degrade gracefully. Never iterate `GetVersion` over graph nodes (hard-cap total deps.dev sub-calls at 6).

---

Relevant existing files (absolute): `/Users/pranith/Documents/portfolio/api/src/lib/report/subject-resolver.ts` (P0 root cause), `/Users/pranith/Documents/portfolio/api/src/lib/report/source-planner.ts`, `/Users/pranith/Documents/portfolio/api/src/lib/report/gatherer.ts`, `/Users/pranith/Documents/portfolio/api/src/lib/report/types.ts`, `/Users/pranith/Documents/portfolio/api/src/lib/agent/tools.ts`, `/Users/pranith/Documents/portfolio/api/src/lib/agent/cti-loop.ts`, `/Users/pranith/Documents/portfolio/api/src/routes/crypto-trace.ts` (GET-only at `/api/v1/crypto-trace`), `/Users/pranith/Documents/portfolio/api/src/lib/validation-schemas.ts` (`cryptoTraceSchema`), `/Users/pranith/Documents/portfolio/api/src/lib/address-watch.ts`, `/Users/pranith/Documents/portfolio/api/src/lib/address-labels.ts`, `/Users/pranith/Documents/portfolio/api/src/lib/chain-seed-labels.ts`, `/Users/pranith/Documents/portfolio/api/src/lib/risk-score.ts`, `/Users/pranith/Documents/portfolio/api/src/lib/rdap.ts`, `/Users/pranith/Documents/portfolio/api/src/lib/cve-enrich.ts`, `/Users/pranith/Documents/portfolio/api/src/routes/osv.ts`. New module root: `/Users/pranith/Documents/portfolio/api/src/lib/supply-chain/`.

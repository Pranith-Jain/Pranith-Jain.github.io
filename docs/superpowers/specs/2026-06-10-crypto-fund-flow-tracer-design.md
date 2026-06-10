# Crypto Fund-Flow Tracer ("ChainTrace") — Design Spec

**Date:** 2026-06-10
**Status:** Draft — awaiting user review
**Scope:** Build an Arkham / Spectra / MetaSleuth / Chainalysis-Reactor-class
**blockchain intelligence tracer** on top of the platform's existing CryptoTrace
feature. One combined spec, phased (A–E) so it stays buildable. Public-read,
client-driven incremental graph expansion.

---

## Background — how we got here

The trigger: _"we have blockchain analysis to check BTC and other address tracing —
is it possible to create something like Arkham? A blockchain tracer to trace threat
actors and crypto crimes like a crypto investigator."_

Seven reference platforms were audited (2026-06-10):

| Platform                            | What we took from it                                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arkham**                          | Entity-centric model; multi-hop **Tracer**; interactive **Visualizer**. (Dropped: ARKM token / Intel Exchange marketplace.)                                                                                                                                     |
| **Spectra** (Intelligence On Chain) | **Tracer with time-tolerance** knob; **analyst-confirms-the-hop** honesty model; **Bloodhound** OSINT pivot. (Dropped: IOC-token gating.)                                                                                                                       |
| **ChainsIntelligence**              | **Risk score** Low/Med/High/Critical aggregated from multiple signals.                                                                                                                                                                                          |
| **MetaSleuth**                      | Customizable canvas; **auto-path to CEX/Mixer** ("uncover hidden paths"); monitoring/alerts; share + export.                                                                                                                                                    |
| **Chainalysis Reactor**             | Annotations + off-chain context on the graph; auto-interpret swaps/bridges/mixers into readable steps; export/report.                                                                                                                                           |
| **IOC OSINT Toolkit**               | Curated OSINT directory (address → identity, leaks, domains, phone). Feeds Phase D.                                                                                                                                                                             |
| **ransom-isac TxDataHiding heist**  | Threat actors abuse transaction **calldata** as a C2 dead-drop (TRON/Aptos tx → pointer to a BSC tx hash, read via `eth_getTransactionByHash`). Motivates a **calldata / TxDataHiding inspector** (Phase B) — a CTI angle the commercial tracers don't surface. |

**Key finding — the platform already owns most of the spine.** The genuinely new
work is a fund-flow _traversal_, an address _label store_, a _risk scorer_, and
wiring addresses/flows into the existing investigation workspace + OSINT routes.

### What already exists (reuse map, verified 2026-06-10)

| Capability                                                                                                       | Reuse       | File                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| Single-address inspector (BTC/EVM/Solana, balance, txs, explorer pivots)                                         | extend      | `api/src/routes/crypto-trace.ts`, `src/pages/dfir/CryptoTrace.tsx`      |
| EVM transfers w/ direction + counterparty                                                                        | reuse       | `api/src/lib/blockscout.ts` (`getRecentTransfers`, `getAddressContext`) |
| OFAC sanctions (12 chains, GitHub, 24h cache)                                                                    | reuse       | `api/src/lib/ofac-sanctions.ts` (`checkAddress`)                        |
| ScamSniffer phishing flags (6h cache)                                                                            | reuse       | `api/src/lib/scamsniffer.ts` (`checkScamSniffer`)                       |
| Explorer/NFT/DeFi/scam deep-link grid                                                                            | reuse       | `src/lib/dfir/crypto-explorers.ts`                                      |
| Graph model + traversal (`upsertNode/Edge`, `getNeighbors`, `shortestPath`, `neighborhood`, `detectCommunities`) | reuse       | `api/src/routes/threat-graph.ts`                                        |
| Interactive graph canvas (React Flow v12 + dagre/force, minimap, node-click)                                     | reuse       | `src/pages/threatintel/RelationshipGraphCanvas.tsx`                     |
| Investigation workspace (4 D1 tables: investigations / observables / tasks / timeline)                           | extend      | `api/src/routes/investigations.ts`                                      |
| Entity-resolver pattern (algorithmic, no clustering store)                                                       | mirror      | `api/src/routes/entity-resolver.ts`, `lib/entity-resolution.ts`         |
| OSINT — Google Dorks + OSINT route suite                                                                         | reuse       | `api/src/routes/google-dorks.ts` + others                               |
| Threat-actor KB (ransomware wallets, attribution)                                                                | seed labels | `src/data/dfir/actor-kb.ts`, `threat-actors.ts`                         |

---

## Goal

A `/dfir/tracer` page where an analyst seeds an address and, click by click,
expands an interactive fund-flow graph across chains — each node carrying a
real-world **label**, a **risk score**, and balance/tx context — with
**time-tolerance** filtering, **analyst-confirmed** hops, auto-pathing to
CEX/Mixer nodes, an OSINT pivot, and the whole trace savable/exportable as an
**investigation**.

## Non-goals

- **No server-side N-hop fan-out.** (See hard constraint below — physically
  impossible on the Free plan.) Expansion is one-address-per-request, client-driven.
- **No token economy / marketplace / paid label exchange.** Not a tracer.
- **No claim of Arkham-scale label coverage.** 800M labels is a commercial moat;
  we ship a curated seed (hundreds–thousands) + on-the-fly Blockscout/ENS labels +
  heuristic clustering. Coverage grows over time; honesty about gaps is a feature.
- **No scam-recovery service, certification academy, or compliance attestation.**
- **No real-time mempool streaming.** Confirmed on-chain data only.

---

## Hard platform constraints (verified 2026-06-10)

| Constraint                 | Value (Free plan)                                                                                  | Source                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Subrequests per invocation | **50** (KV + Cache-API both count)                                                                 | CLAUDE.md / memory `ioc-subrequest-limit`    |
| `/api/v1/*` body cap       | 256 KB (non-multipart)                                                                             | memory `loose-validate-body-cap`             |
| External `/api/v1/*` reads | **key-gated** (`OPEN_PUBLIC_READS` valve)                                                          | memory `validate-schema-and-auth-gate`       |
| D1 binding                 | **`BRIEFINGS_DB`** (db `pranithjain-briefings`), migrations immutable, add via `/create-migration` | CLAUDE.md                                    |
| Deploy                     | from **repo root** (Worker `pranithjain`), rebased on `origin/main`                                | CLAUDE.md / memory `project_deploy_topology` |
| Typecheck                  | 3 `tsc` projects; esbuild deploys past tsc; `worker/` checked via `api/tsconfig.worker.json`       | CLAUDE.md                                    |
| Route tests                | live in `test/routes/`, **CI skips them**, run locally un-sandboxed                                | memory `api_tests_run_unsandboxed`           |
| `validate()` schemas       | MUST mirror handler reads or valid requests 400                                                    | memory `validate-schema-and-auth-gate`       |

### The constraint that shapes the whole architecture

A genuine fund-flow fan-out (1 address → ~20 counterparties → ~400 → …) would
issue hundreds of upstream calls in a single Worker invocation and **blow the
50-subrequest cap immediately**. Therefore:

> **The server never traces more than one address, on one chain, one hop, per
> request.** The React client holds the growing graph, persists it to D1, and
> issues a new `/expand` request only when the analyst clicks a node.

This is not only forced by the platform — it is _better forensics_. It matches
Spectra's "the traced output is not proven connected" model: every
auto-discovered edge is a **candidate** until the analyst confirms it.

**Per-`/expand` subrequest budget (one node, one chain):**

| Op                                         | Subrequests | Notes                                 |
| ------------------------------------------ | ----------- | ------------------------------------- |
| Transfer history (chain adapter)           | 1–2         | paginated, capped at N transfers      |
| `getAddressContext` (Blockscout, EVM only) | 0–1         | cached 5 min                          |
| OFAC check                                 | 0           | GitHub list cached 24h; in-memory set |
| ScamSniffer check                          | 0           | GitHub list cached 6h; in-memory set  |
| Label lookup (D1)                          | 0           | D1 query is not a subrequest          |
| **Total**                                  | **≤ 4**     | comfortably under 50                  |

Multi-chain is handled by expanding **one chain per request**, never fanning a
node across all chains at once (unlike today's `crypto-trace.ts`, which fans one
address across 6 EVM chains — acceptable for a one-shot inspector, unacceptable as
a per-hop traversal primitive).

---

## Architecture

```
                          ┌─────────────────────────── React client (Tracer.tsx) ──────────────┐
                          │  holds graph state (nodes+edges) · renders RelationshipGraphCanvas  │
                          │  click node ─▶ POST /expand ─▶ merge returned nodes/edges           │
                          │  "Confirm hop" · "Find path to CEX/Mixer" (local BFS) · "Save"      │
                          └───────────────┬───────────────────────────────────┬────────────────┘
                                          │                                   │
                       POST /api/v1/tracer/expand                  POST /api/v1/tracer/save → D1
                                          │
            ┌─────────────────────────────▼──────────────────────────────┐
            │ routes/tracer.ts  (one address · one chain · one hop)        │
            │   1. chain-sources/{evm,btc,tron,solana}.ts → transfers[]    │
            │   2. time-tolerance + token/amount filter                    │
            │   3. address-labels.ts  → label each counterparty            │
            │   4. risk-score.ts      → level per counterparty             │
            │   5. normalise → { nodes[], edges[] } (candidate edges)      │
            └──────────────────────────────────────────────────────────────┘
```

### Components — backend (`api/src/`)

- **`lib/chain-sources/index.ts`** — dispatch by detected chain; common return type:

  ```ts
  interface Transfer {
    counterparty: string;
    direction: 'in' | 'out' | 'self';
    amount: string; // human-readable, with unit
    amount_raw: string;
    token: string; // symbol
    tx_hash: string;
    timestamp: string; // ISO 8601
    chain: string;
  }
  ```

  - `evm.ts` — wraps `blockscout.getRecentTransfers`.
  - `btc.ts` — lifts the esplora/mempool.space logic out of `crypto-trace.ts` into a
    reusable fetcher that yields `Transfer[]` (input/output counterparties).
  - `tron.ts` — **new**; TronGrid public API (`/v1/accounts/{addr}/transactions`),
    no key, cached 60 s.
  - `solana.ts` — lifts Solana logic from `crypto-trace.ts`.
  - Each adapter caps at a configurable `maxTransfers` (default 50) and honors the
    time window before returning, so the payload stays under the 256 KB body cap.

- **`lib/address-labels.ts`** — attribution resolver, mirrors `entity-resolution.ts`:
  - `resolveLabel(address, chain): AddressLabel | null` — checks, in order:
    1. D1 `address_labels` (curated + user-added),
    2. seed map (CEX hot wallets, mixers — Tornado Cash etc., bridges, ransomware
       wallets imported from `actor-kb.ts`),
    3. Blockscout `label` / ENS (EVM, from `getAddressContext`).
  - `AddressLabel = { label, category, source, confidence }` where
    `category ∈ {exchange, mixer, bridge, defi, contract, ransomware, scammer,
sanctioned, wallet, unknown}`.
  - Seed data lives in `lib/chain-seed-labels.ts` (a curated constant, version-controlled).

- **`lib/risk-score.ts`** — pure, deterministic, no I/O:
  - `scoreAddress({ sanctions, scam, label, stats }): RiskScore`
  - `RiskScore = { level: 'low'|'medium'|'high'|'critical', score: 0-100, signals: string[] }`
  - Rules (illustrative): OFAC-listed → critical; mixer/known-drainer label → high;
    ScamSniffer-flagged → high; fresh wallet funneling to mixer → medium; otherwise
    low. Signals are human-readable strings shown in the UI.

- **`routes/tracer.ts`** — endpoints (public-read, key-gated like the rest of
  `/api/v1/*`; `OPEN_PUBLIC_READS` valve applies):
  - `POST /api/v1/tracer/expand` — body
    `{ address, chain, direction, window?: {from?,to?,around?,toleranceMin?}, filters?: {token?, minAmount?} }`
    → `{ root: NodeProfile, nodes: Node[], edges: Edge[] }`. **One node, one chain, one hop.**
  - `GET /api/v1/tracer/label/:chain/:address` → `{ label, risk, context }` (panel data).
  - `POST /api/v1/tracer/paths` — body `{ graph, targetCategories: ['exchange','mixer'] }`
    → shortest candidate path **over the already-loaded subgraph only** (no new
    upstream fetches — reuses `threat-graph.shortestPath` semantics in memory).
  - `GET /api/v1/tracer/graph/:id` / `POST /api/v1/tracer/save` — load/save a
    `tracer_graphs` row (the latter optionally linked to an investigation).

### Components — frontend (`src/`)

- **`src/pages/dfir/Tracer.tsx`** — the page. Layout:
  - **Left control rail:** seed input + chain selector; hop direction (in / out /
    both); **time-tolerance** controls (`around` + `± minutes`, or `from`/`to`);
    token + min-amount filters.
  - **Center canvas:** `RelationshipGraphCanvas` (`layoutMode='force'`) with a custom
    crypto node renderer — color by **risk level**, icon by **category**
    (exchange/mixer/bridge/wallet/contract), label chip, balance.
  - **Right node-detail panel:** balance, label + category, **risk badge + signals**,
    recent txs, and actions: **Expand**, **Confirm hop**, **Find path to CEX/Mixer**,
    **Pivot to OSINT** (Phase D), **Add to investigation**.
- **`src/lib/dfir/tracer-graph.ts`** — client graph state: merge `/expand` results
  (dedupe nodes by `address+chain`, edges by `tx_hash`), promote candidate→confirmed,
  serialize for save/export.
- Custom node component (extends the existing `RelNodeBox` pattern in
  `RelationshipGraphCanvas.tsx`).

### Data model — new migration (via `/create-migration`, binding `BRIEFINGS_DB`)

```sql
CREATE TABLE IF NOT EXISTS address_labels (
  address     TEXT NOT NULL,
  chain       TEXT NOT NULL,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL,          -- exchange|mixer|bridge|defi|contract|ransomware|scammer|sanctioned|wallet|unknown
  source      TEXT NOT NULL,          -- 'curated'|'blockscout'|'ens'|'user'|'actor-kb'
  confidence  INTEGER NOT NULL DEFAULT 70,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (address, chain)
);
CREATE INDEX IF NOT EXISTS idx_address_labels_category ON address_labels(category);

CREATE TABLE IF NOT EXISTS tracer_graphs (
  id               TEXT PRIMARY KEY,
  investigation_id TEXT,              -- nullable FK → investigations.id
  seed_address     TEXT NOT NULL,
  chain            TEXT NOT NULL,
  graph_json       TEXT NOT NULL,     -- { nodes[], edges[] } incl. confirmed/candidate state
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracer_graphs_investigation ON tracer_graphs(investigation_id);
```

Plus extend `investigation_observables.type` to accept `'crypto-address'` and
`'tx-hash'` (no schema change needed — `type` is free TEXT today; only the
`validate()` schema + UI enum widen).

> **Cross-correlation bonus:** expanded nodes can _also_ be upserted into the
> existing `threat-graph` node/edge tables (node type `crypto-address`), so a
> crypto address can link to IP/domain/actor IOCs already in the graph — a
> correlation the standalone competitors don't have. Phase B; optional.

---

## The four selected v1 features, concretely

1. **Time-tolerance filter** — `/expand` accepts `window`; the chain adapter filters
   `Transfer.timestamp` to `[from,to]` or `[around−tol, around+tol]` before
   labeling/scoring. Mirrors Spectra exactly.
2. **Risk score per node** — `risk-score.ts` runs on every returned counterparty;
   badge on canvas + signal list in the panel. Inputs already exist (OFAC +
   ScamSniffer + label category).
3. **Multi-chain EVM + BTC + Tron (+ Solana)** — via `chain-sources/`. Cross-chain
   hops (e.g. a bridge deposit) surface as **candidate** cross-chain edges the
   analyst confirms; we do **not** auto-fetch the other chain.
4. **Analyst-confirm hops** — every `/expand` edge returns `confidence:'candidate'`;
   a Confirm action (client-side, persisted on save) promotes to `'confirmed'`.
   Export defaults to confirmed-only.

---

## Phasing (one spec, buildable increments)

| Phase                                 | Deliverable                                                                                                                                                                                                                                                                                                     | Mostly new vs. reuse                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **A — Tracer core**                   | `chain-sources/`, `address-labels.ts` (seed only), `risk-score.ts`, `routes/tracer.ts` (`/expand`, `/label`), `Tracer.tsx` w/ canvas + panel + time-tolerance + risk badge + confirm-hop. The visible Arkham/Spectra tracer.                                                                                    | new traversal + scorer; reuse canvas + blockscout + OFAC + ScamSniffer |
| **B — Labeling & attribution depth**  | D1 `address_labels` + user-add; BTC common-input-ownership clustering heuristic; `/tracer/paths` auto-path to CEX/Mixer; **calldata / TxDataHiding inspector** (decode a tx `input`, flag embedded payloads + cross-chain tx-hash pointers per the ransom-isac analysis); optional `threat-graph` cross-upsert. | new clustering + calldata decode; reuse `shortestPath`                 |
| **C — Investigation workspace**       | `tracer_graphs` table; save/reload; extend `investigation_observables` for address/tx; **export** (JSON + CSV + PNG of canvas); share link.                                                                                                                                                                     | reuse `investigations`; new export + save                              |
| **D — Bloodhound OSINT pivot**        | "Pivot to OSINT" wires an address into `google-dorks` + OSINT routes → off-chain identity panel.                                                                                                                                                                                                                | reuse OSINT routes                                                     |
| **E — Monitoring/alerts** _(stretch)_ | watch an address; cron diff of new transfers → alert. Respect the inline-heal cron policy (no new dedicated cron without cause).                                                                                                                                                                                | reuse cron infra                                                       |

---

## Error handling

- **Upstream chain API down / rate-limited** → node returns `{ error }`, renders as a
  greyed node with a retry affordance; the rest of the graph is unaffected.
- **Unknown / malformed address** → 400 with the detected-vs-expected chain hint
  (reuse `crypto-trace.ts` address-shape detection).
- **Oversize expansion** (node with thousands of transfers) → adapter caps at
  `maxTransfers`, returns a `truncated:true` flag the UI surfaces ("showing top 50
  of N — narrow the time window"). Never silently drop (memory: no silent caps).
- **Subrequest budget** — `/expand` is single-chain by contract; a guard rejects any
  request that would fan more than one chain.

## Testing

- `test/routes/tracer.test.ts` (run locally, un-sandboxed; CI skips `test/routes/`):
  - `/expand` returns normalized nodes/edges for a known EVM/BTC/Tron address (mocked
    upstream); candidate edges; time-window filtering; `truncated` flag.
  - `validate()` schema mirrors the handler reads (contract test — memory
    `validate-schema-and-auth-gate`).
  - Key-gating honored (`OPEN_PUBLIC_READS` test valve).
- `lib/risk-score.test.ts` — pure-function table tests (OFAC→critical, mixer→high, …).
- `lib/address-labels.test.ts` — seed + D1 + Blockscout precedence order.
- Frontend: `tracer-graph.ts` merge/dedupe/promote unit tests.
- All 3 `tsc` projects green before deploy.

## Open questions (resolve during planning, not blocking)

1. Tron transfer fetcher — confirm TronGrid public-tier limits vs. the 60 s cache;
   fall back to Tronscan API if needed.
2. Seed-label sourcing — how many CEX/mixer/bridge addresses to ship in v1
   (target: the top ~200 highest-signal: major CEX hot wallets, all OFAC-listed
   mixers, top bridges). Pull ransomware wallets from `actor-kb.ts`.
3. PNG export of the React Flow canvas — `html-to-image` vs. React Flow's built-in
   `toPng`; confirm bundle-size impact against the perf budget (memory
   `perf_experiments_documented` — grep before adding any dependency).

---

## Summary

A phased, client-driven fund-flow tracer that reuses the platform's graph canvas,
graph traversal, address data feeds, threat flagging, and investigation workspace —
adding only a per-hop traversal API, an address-label store, a risk scorer, and the
Tracer UI. Architecture is dictated by the 50-subrequest cap (one node / one chain /
one hop per request), which doubles as a forensically-honest analyst-confirms-the-hop
model. Ships Arkham's tracer + Spectra's time-tolerance + ChainsIntelligence's risk
score + MetaSleuth's auto-pathing + Reactor's annotated investigations — without the
commercial moats (label scale, marketplace) we can't and shouldn't replicate.

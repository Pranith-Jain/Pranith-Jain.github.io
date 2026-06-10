# Crypto Fund-Flow Tracer — Phase B (Attribution Depth + Actor-Tracing Intel) Design Spec

**Date:** 2026-06-11
**Status:** Draft — awaiting user review
**Scope:** Phase B of the Fund-Flow Tracer. Builds on Phase A (branch
`feat/crypto-tracer-phaseA`). Four pieces, all selected by the user:
**(1) Calldata / TxDataHiding inspector**, **(2) D1 address-label store + user-add**,
**(3) auto-path to CEX/Mixer**, **(4) BTC common-input clustering**.

**Parent spec:** `docs/superpowers/specs/2026-06-10-crypto-fund-flow-tracer-design.md`
**Phase A plan:** `docs/superpowers/plans/2026-06-10-crypto-tracer-phase-a.md`

---

## Background

Phase A shipped a working client-driven tracer (`/dfir/tracer`): seed an address,
expand hop-by-hop across EVM/BTC/Tron, each node labeled (curated seed only) +
risk-scored, with time-tolerance and analyst-confirm hops. Phase B adds the
attribution _depth_ and the threat-actor-focused intel that distinguishes this from
a balance viewer:

- **Persistent, growing labels** (Phase A labels were a hardcoded seed).
- **The blockchain-as-C2 angle** (calldata/TxDataHiding) — the one capability the
  commercial tracers don't surface, motivated by the ransom-isac heist analysis.
- **"Find the cash-out"** pathing and **BTC entity clustering** — classic forensic moves.

## Hard constraints (unchanged from Phase A)

- **≤ 50 subrequests / invocation** (KV + Cache-API + fetch all count). Per-request
  work stays tiny; no N-hop fan-out.
- D1 binding `BRIEFINGS_DB`; migrations immutable, added via `/create-migration`.
- `/api/v1/*` reads are key-gated (public via `OPEN_PUBLIC_READS` valve in tests);
  the global gate runs before `validate`, so **POSTs in route tests must be signed
  with `withTestApiKey()`** (Phase A lesson).
- `validate()` schemas MUST mirror handler reads.
- Three `tsc` projects; typecheck with `--noEmit` (api config emits otherwise).
- Route tests live in `test/routes/`, run locally un-sandboxed (CI skips them).

---

## §1 · Calldata / TxDataHiding inspector

**Goal:** given a transaction, expose blockchain-as-C2 tradecraft — payloads hidden
in calldata and cross-chain tx-hash pointers (a TRON/Aptos tx pointing to a BSC tx
read via `eth_getTransactionByHash`, per the ransom-isac analysis).

**New files:**

- `api/src/lib/calldata-analysis.ts` — **pure**, no I/O:

  ```ts
  export interface EmbeddedPointer {
    value: string;
    offset: number;
  }
  export interface CalldataAnalysis {
    selector: string | null; // '0x' + 8 hex (EVM), null if input too short
    known_method: string | null; // from a small selector table, else null
    input_size: number; // bytes
    flags: string[]; // human-readable heuristic hits
    embedded_pointers: EmbeddedPointer[]; // 32-byte tx-hash-looking values
    verdict: 'clean' | 'suspicious' | 'data-hiding';
  }
  export function analyzeCalldata(input: string): CalldataAnalysis;
  ```

  Heuristics (deterministic): selector lookup (`transfer`/`approve`/`transferFrom`/
  `multicall`/etc.); `input_size`; flags for (a) input far larger than the known
  method's ABI arg footprint, (b) a long trailing run of high-entropy bytes, (c)
  ASCII/UTF-8- or base64-decodable segments, (d) one or more embedded 32-byte
  (64-hex) values that look like tx hashes (the cross-chain pointers). Verdict:
  `data-hiding` if an embedded pointer **or** decodable-payload flag is present;
  `suspicious` if oversized/high-entropy only; else `clean`.

- `api/src/lib/tx-fetch.ts` — minimal tx retrieval (the network piece, isolated so
  the analyzer stays pure):
  ```ts
  export interface FetchedTx {
    found: boolean;
    chain: string;
    input: string;
    from?: string;
    to?: string;
  }
  export async function fetchEvmTx(hash: string, rpcs: string[]): Promise<FetchedTx>; // eth_getTransactionByHash
  export async function fetchTronTx(hash: string): Promise<FetchedTx>; // TronGrid /wallet/gettransactionbyid
  ```
  Reuses the public-RPC list pattern from `crypto-trace.ts` (ETH + BSC RPCs). Never
  throws — returns `{found:false,...}` on failure.

**New route** (`api/src/routes/tracer.ts`, extend):

- `GET /api/v1/tracer/calldata?chain=<evm|tron>&hash=<txhash>` (public-read).
- Handler: fetch the tx → `analyzeCalldata(input)` → **follow one pointer** (the
  user-selected depth): take the first `embedded_pointers[0].value` and try fetching
  it as a tx on the _other_ candidate EVM chains (ETH + BSC) via `fetchEvmTx`; if
  found, attach `resolved: { chain, found, input_excerpt }` (first ~200 bytes of that
  tx's calldata). Subrequest cost: 1 (source tx) + up to 2 (pointer across ETH/BSC) = ≤3.
- Response: `{ chain, hash, analysis: CalldataAnalysis, resolved_pointer?: {...} }`.
- Zod `tracerCalldataSchema` mirroring the two query reads.

**UI** (`Tracer.tsx` + a small `CalldataPanel`): an "Inspect calldata" button in the
node/edge detail panel (enabled when an edge/tx is selected) → fetches `/tracer/calldata`
and renders selector, flags, verdict badge, and any resolved cross-chain pointer
(clickable to seed the tracer at the pointed-to tx's `to` address).

---

## §2 · D1 address-label store + user-add

**Migration** (via `/create-migration`, expected `migrations/0019_address_labels.sql`,
binding `BRIEFINGS_DB`):

```sql
CREATE TABLE IF NOT EXISTS address_labels (
  address    TEXT NOT NULL,
  chain      TEXT NOT NULL,   -- 'evm' | 'btc' | 'tron'
  label      TEXT NOT NULL,
  category   TEXT NOT NULL,   -- LabelCategory
  source     TEXT NOT NULL,   -- 'user' | 'curated' | 'import'
  confidence INTEGER NOT NULL DEFAULT 80,
  created_at TEXT NOT NULL,
  PRIMARY KEY (address, chain)
);
CREATE INDEX IF NOT EXISTS idx_address_labels_category ON address_labels(category);
```

**Resolver changes** (`api/src/lib/address-labels.ts`):

- Keep the pure `resolveSeedLabel`. Add a **batched** D1 reader:
  ```ts
  export async function loadLabelsForAddresses(
    db: D1Database,
    chain: TracerChain,
    addresses: string[]
  ): Promise<Map<string, AddressLabel>>; // one SELECT ... WHERE address IN (...)
  ```
  (EVM addresses lowercased for the key, matching `resolveSeedLabel`.) D1 queries are
  not subrequests, but batching keeps it to **one query per expand**.
- The expand handler's labeling precedence becomes **D1 → curated seed → (EVM root)
  Blockscout/ENS**. `buildNode` gains an optional `dbLabel` override sourced from the
  batched map; if absent it falls back to `resolveSeedLabel`.

**User-add endpoint:**

- `POST /api/v1/tracer/labels` body `{ address, chain, label, category }` →
  `INSERT OR REPLACE` with `source:'user'`, `confidence:90`, `created_at:now`.
- **Admin-gated** without opening the public read routes: register a targeted
  `app.use('/api/v1/tracer/labels', requireAdminMiddleware)` (and the handler) so
  `/tracer/expand`, `/tracer/label`, `/tracer/calldata` stay public.
- Zod `tracerLabelAddSchema` (address, chain enum, label ≤80, category enum).

**UI:** an "Add label" affordance in the node detail panel (admin only — gated by the
existing admin-token presence the app already tracks); on success the node re-resolves.

---

## §3 · Auto-path to CEX/Mixer ("find the cash-out")

**Client-side, pure** (no endpoint, no fetches — the parent spec's "over the
already-loaded subgraph only"):

- `findPathToCategory(graph, targets: string[]): string[] | null` in
  `src/lib/dfir/tracer-graph.ts`: BFS from `graph.seedId` over edges (treated
  undirected for reachability) to the nearest node whose `category` ∈ `targets`
  (default `['exchange','mixer']`); returns the ordered node-id path, or `null`.
- **UI:** a "Find cash-out (CEX/Mixer)" button in `Tracer.tsx`; the result is passed
  to the canvas's existing `highlightedPath` prop (already supported by
  `RelationshipGraphCanvas`). A toast/notice when no path exists in the loaded graph
  (analyst expands further).

---

## §4 · BTC common-input clustering

**Pure fn** in `api/src/lib/chain-sources/btc.ts`:

```ts
export interface CoInputCluster {
  address: string;
  shared_tx_count: number;
}
export function clusterCommonInputs(txs: EsploraTx[], address: string): CoInputCluster[];
```

For each tx where `address` is among the inputs, every _other_ input address is
inferred same-owner (common-input-ownership heuristic); aggregate by address with a
`shared_tx_count`, sorted desc, capped (e.g. top 20).

**Surfaced** via an optional field on the expand response (BTC only): `cluster?:
CoInputCluster[]` on `ExpandResponse`. The BTC adapter already fetches the address's
txs; the expand handler computes the cluster from the same fetched txs (no extra
fetch). **UI:** the node detail panel shows "N likely same-owner addresses (common-input)"
with an "add to graph" action that seeds expansion on a chosen co-input address.

---

## §5 · Decisions & non-goals

**Decisions (locked):**

- Auto-path is **client-side/pure**, not a server endpoint.
- D1 label reads are **batched** into one query per expand.
- Label **writes are admin-gated** on the `/tracer/labels` subpath; all reads public.
- Calldata depth = **flag + decode + follow one pointer** (across ETH/BSC).

**Non-goals (YAGNI for Phase B):**

- `threat-graph` cross-upsert (crypto↔IP/domain IOC correlation) — deferred.
- Following >1 embedded pointer or recursive dead-drop chains — one hop of follow only.
- Solana calldata/clustering — EVM + Tron (calldata) and BTC (clustering) only.
- Editing/deleting existing labels — add-only in this iteration.

---

## §6 · Error handling

- Calldata: tx not found / RPC down → `analysis` with `verdict:'clean'`,
  `flags:['tx not found']`, `resolved_pointer` omitted. Never throws.
- Pointer-follow miss → `embedded_pointers[].resolved.found=false`; surfaced, not dropped.
- D1 unavailable (`BRIEFINGS_DB` unbound) → label resolver falls back to seed silently;
  label-add returns 503 `{error:'label store unavailable'}`.
- Auto-path: no path → return `null`, UI shows "no cash-out path in the loaded graph".
- Clustering: address absent from inputs / no co-inputs → `[]`.

## §7 · Testing

- `api/test/lib/calldata-analysis.test.ts` — crafted calldata: plain transfer
  (clean), oversized high-entropy blob (suspicious), input embedding a 32-byte
  tx-hash value (data-hiding + pointer extracted at the right offset).
- `api/test/lib/chain-sources/btc.test.ts` (extend) — `clusterCommonInputs`:
  co-input aggregation + shared_tx_count + cap.
- `api/test/routes/tracer.test.ts` (extend) — `/tracer/calldata` (signed POST? no —
  it's GET, keyless ok) returns analysis for a known tx (mocked RPC); `/tracer/labels`
  POST is admin-gated (401 without admin token, 200/inserted with it) and a
  subsequent expand reflects the new label.
- `src/lib/dfir/tracer-graph.test.ts` (extend) — `findPathToCategory`: finds nearest
  exchange/mixer; returns null when none loaded; undirected reachability.
- Migration exercised against the test D1 (table created, insert+select round-trips).

---

## §8 · Build order (independent, each shippable)

1. **§2 D1 labels** (migration + batched reader + resolver precedence + admin add) —
   foundational; other pieces benefit from richer labels.
2. **§1 Calldata inspector** (pure analyzer → tx-fetch → route → UI) — the headline feature.
3. **§4 BTC clustering** (pure fn → expand-response field → UI).
4. **§3 Auto-path** (pure client fn → button → highlightedPath).

---

## Summary

Phase B turns the Phase A balance-and-label viewer into an attribution tool: labels
persist and grow (D1 + analyst input), the tracer can decode and follow the
blockchain-as-C2 calldata tradecraft that motivated the whole project, surfaces the
likely cash-out path, and clusters BTC co-spends into entities. All within the
subrequest budget, reusing the Phase A node/edge model, the React Flow canvas
(`highlightedPath`), and the existing admin-gating + validate patterns.

# Crypto Fund-Flow Tracer — Phase A (Tracer Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working `/dfir/tracer` page where an analyst seeds a crypto address and expands an interactive fund-flow graph hop-by-hop (EVM/BTC/Tron), every node carrying a real-world label + risk score, with time-tolerance filtering and analyst-confirm hops.

**Architecture:** Client-driven incremental expansion — the server traces **one address, one chain, one hop per request** (forced by the Free-plan 50-subrequest cap). A new `POST /api/v1/tracer/expand` route fetches normalized transfers via per-chain adapters, labels + risk-scores each counterparty using in-memory sets (OFAC + ScamSniffer loaded once, seed-label map), and returns candidate nodes/edges. The React page holds the growing graph and reuses the existing `RelationshipGraphCanvas` (which already supports `onExpandNode`).

**Tech Stack:** Cloudflare Workers + Hono + Zod (`validate()` middleware), TypeScript, vitest (`cloudflare:test` for routes, root vitest for frontend), React + `@xyflow/react` (React Flow v12), Tailwind.

**Scope note:** Phase A is **read-only and stateless** — no D1 migration, no save/export, no user-added labels (those are Phase C). Solana is detected but **expansion is not supported in v1** (counterparty extraction needs per-signature `getTransaction` calls that blow the subrequest budget); it returns a leaf node with a notice. Labeling depth, BTC clustering, auto-path-to-CEX, and the calldata/TxDataHiding inspector are Phase B.

**Spec:** `docs/superpowers/specs/2026-06-10-crypto-fund-flow-tracer-design.md`

---

## File Structure

**Backend (new):**

- `api/src/lib/chain-sources/types.ts` — `TracerChain`, `Transfer`, `TransferFilter`, `FetchResult`.
- `api/src/lib/chain-sources/filter.ts` — `applyFilter()` (time/token/min-amount filter + cap + `truncated`).
- `api/src/lib/chain-sources/evm.ts` — `fetchEvmTransfers()` (wraps `blockscout.getRecentTransfers`).
- `api/src/lib/chain-sources/btc.ts` — `fetchBtcTransfers()` (Esplora, counterparty extraction).
- `api/src/lib/chain-sources/tron.ts` — `fetchTronTransfers()` (TronGrid TRC-20).
- `api/src/lib/chain-sources/index.ts` — `fetchTransfers()` dispatcher.
- `api/src/lib/address-labels.ts` — `LabelCategory`, `AddressLabel`, `resolveSeedLabel()` (pure).
- `api/src/lib/chain-seed-labels.ts` — `SEED_LABELS` curated constant.
- `api/src/lib/risk-score.ts` — `RiskLevel`, `RiskScore`, `scoreAddress()` (pure).
- `api/src/routes/tracer.ts` — `TracerNode`, `TracerEdge`, `ExpandResponse`, `tracerExpandHandler`, `tracerLabelHandler`.

**Backend (modified):**

- `api/src/lib/ofac-sanctions.ts` — export `loadSanctionedSet()`.
- `api/src/lib/validation-schemas.ts` — add `tracerExpandSchema`, `tracerLabelSchema`.
- `api/src/index.ts` — import + register the two routes.

**Backend (tests):**

- `api/test/lib/chain-sources/filter.test.ts`, `api/test/lib/risk-score.test.ts`, `api/test/lib/address-labels.test.ts`, `api/test/routes/tracer.test.ts`.

**Frontend (new):**

- `src/lib/dfir/tracer-graph.ts` — client graph model: `mergeExpand()`, `toGraphResponse()`, `riskToNodeType()`.
- `src/pages/dfir/Tracer.tsx` — the page.
- `src/lib/dfir/tracer-graph.test.ts` — merge/dedupe unit tests.

**Frontend (modified):**

- `src/pages/threatintel/relationship-graph-shared.ts` — add 4 crypto risk node types + colors; add optional `data?` to `GraphEdgeData`.
- `src/App.tsx` — lazy import + route entry.
- `src/components/dfir/tool-sections.ts` — tool card entry.

---

## Conventions for the implementing engineer

- **Running route tests:** `cd api && npm test -- routes/tracer`. The vitest-pool-workers sandbox must be disabled — when invoking the Bash tool, set `dangerouslyDisableSandbox: true` (per repo memory `api_tests_run_unsandboxed`; CI skips `test/routes/`, so these MUST be run locally).
- **Running lib tests:** `cd api && npm test -- lib/risk-score` etc. (same sandbox note).
- **Running frontend tests:** from repo root, `npm test -- tracer-graph`.
- **Typecheck before commit:** `npx tsc -p api/tsconfig.json` for api changes, `npx tsc -p tsconfig.json` for frontend changes. esbuild deploys past tsc, so latent type errors are invisible — typecheck explicitly.
- **Commit on the current feature branch** (`git branch --show-current` first). Never rebase/force-push `main`.

---

### Task 1: Chain-source types + transfer filter

**Files:**

- Create: `api/src/lib/chain-sources/types.ts`
- Create: `api/src/lib/chain-sources/filter.ts`
- Test: `api/test/lib/chain-sources/filter.test.ts`

- [ ] **Step 1: Create the shared types**

`api/src/lib/chain-sources/types.ts`:

```ts
/** Chains whose counterparties can be expanded within the subrequest budget. */
export type TracerChain = 'evm' | 'btc' | 'tron';

/** One value transfer, normalised across chains, relative to the queried address. */
export interface Transfer {
  /** The other party in this transfer (the address NOT being queried). */
  counterparty: string;
  direction: 'in' | 'out' | 'self';
  /** Human-readable amount with unit, e.g. "1.23 USDT". */
  amount: string;
  /** Best-effort numeric token amount for filtering (0 if unparseable). */
  amount_num: number;
  /** Token symbol; '' for native-only chains where unknown. */
  token: string;
  tx_hash: string;
  /** ISO 8601, or null if upstream omitted it. */
  timestamp: string | null;
  chain: TracerChain;
  explorer_url: string;
}

export interface TransferFilter {
  /** ISO 8601 inclusive lower bound. */
  from?: string;
  /** ISO 8601 inclusive upper bound. */
  to?: string;
  /** Case-insensitive token-symbol match. */
  token?: string;
  /** Keep transfers with amount_num >= minAmount. */
  minAmount?: number;
  /** Hard cap on returned transfers (default 50). */
  maxTransfers?: number;
}

export interface FetchResult {
  transfers: Transfer[];
  /** True if more transfers matched the filter than maxTransfers allowed. */
  truncated: boolean;
}
```

- [ ] **Step 2: Write the failing filter test**

`api/test/lib/chain-sources/filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyFilter } from '../../../src/lib/chain-sources/filter';
import type { Transfer } from '../../../src/lib/chain-sources/types';

function tx(over: Partial<Transfer>): Transfer {
  return {
    counterparty: '0xaaa',
    direction: 'out',
    amount: '1 USDT',
    amount_num: 1,
    token: 'USDT',
    tx_hash: '0xhash',
    timestamp: '2026-06-10T12:00:00.000Z',
    chain: 'evm',
    explorer_url: 'https://x',
    ...over,
  };
}

describe('applyFilter', () => {
  it('filters by time window [from,to] inclusive', () => {
    const list = [
      tx({ tx_hash: 'a', timestamp: '2026-06-10T11:00:00.000Z' }),
      tx({ tx_hash: 'b', timestamp: '2026-06-10T12:00:00.000Z' }),
      tx({ tx_hash: 'c', timestamp: '2026-06-10T13:00:00.000Z' }),
    ];
    const r = applyFilter(list, { from: '2026-06-10T11:30:00.000Z', to: '2026-06-10T12:30:00.000Z' });
    expect(r.transfers.map((t) => t.tx_hash)).toEqual(['b']);
    expect(r.truncated).toBe(false);
  });

  it('filters by token symbol case-insensitively', () => {
    const list = [tx({ tx_hash: 'a', token: 'USDT' }), tx({ tx_hash: 'b', token: 'DAI' })];
    const r = applyFilter(list, { token: 'usdt' });
    expect(r.transfers.map((t) => t.tx_hash)).toEqual(['a']);
  });

  it('filters by minAmount', () => {
    const list = [tx({ tx_hash: 'a', amount_num: 0.5 }), tx({ tx_hash: 'b', amount_num: 5 })];
    const r = applyFilter(list, { minAmount: 1 });
    expect(r.transfers.map((t) => t.tx_hash)).toEqual(['b']);
  });

  it('caps at maxTransfers and sets truncated', () => {
    const list = [tx({ tx_hash: 'a' }), tx({ tx_hash: 'b' }), tx({ tx_hash: 'c' })];
    const r = applyFilter(list, { maxTransfers: 2 });
    expect(r.transfers).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it('keeps transfers with null timestamp when a window is set', () => {
    const list = [tx({ tx_hash: 'a', timestamp: null })];
    const r = applyFilter(list, { from: '2026-06-10T00:00:00.000Z' });
    expect(r.transfers.map((t) => t.tx_hash)).toEqual(['a']);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd api && npm test -- lib/chain-sources/filter` (Bash with `dangerouslyDisableSandbox: true`)
Expected: FAIL — `applyFilter` not found.

- [ ] **Step 4: Implement `applyFilter`**

`api/src/lib/chain-sources/filter.ts`:

```ts
import type { Transfer, TransferFilter, FetchResult } from './types';

const DEFAULT_MAX = 50;

/**
 * Apply time-window / token / min-amount filtering, then cap. A transfer with a
 * null timestamp is kept (we can't prove it's outside the window). `truncated`
 * is true when more transfers matched than the cap allowed.
 */
export function applyFilter(transfers: Transfer[], filter: TransferFilter = {}): FetchResult {
  const fromMs = filter.from ? Date.parse(filter.from) : undefined;
  const toMs = filter.to ? Date.parse(filter.to) : undefined;
  const tokenLc = filter.token?.toLowerCase();

  const matched = transfers.filter((t) => {
    if (fromMs !== undefined || toMs !== undefined) {
      if (t.timestamp) {
        const ts = Date.parse(t.timestamp);
        if (!Number.isNaN(ts)) {
          if (fromMs !== undefined && ts < fromMs) return false;
          if (toMs !== undefined && ts > toMs) return false;
        }
      }
    }
    if (tokenLc && t.token.toLowerCase() !== tokenLc) return false;
    if (filter.minAmount !== undefined && t.amount_num < filter.minAmount) return false;
    return true;
  });

  const cap = filter.maxTransfers ?? DEFAULT_MAX;
  return { transfers: matched.slice(0, cap), truncated: matched.length > cap };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd api && npm test -- lib/chain-sources/filter`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json
git add api/src/lib/chain-sources/types.ts api/src/lib/chain-sources/filter.ts api/test/lib/chain-sources/filter.test.ts
git commit -m "feat(tracer): chain-source transfer types + filter"
```

---

### Task 2: EVM transfer adapter (wraps Blockscout)

**Files:**

- Create: `api/src/lib/chain-sources/evm.ts`

This adapter reuses `blockscout.getRecentTransfers` (already returns ERC-20 transfers with counterparty + direction + human amount). No new test file — it's exercised end-to-end in the route test (Task 8) with a mocked Blockscout. Native-ETH and internal-tx tracing is deferred to Phase B (ERC-20 transfers are the highest-signal first cut).

- [ ] **Step 1: Implement the EVM adapter**

`api/src/lib/chain-sources/evm.ts`:

```ts
import { getRecentTransfers } from '../blockscout';
import { applyFilter } from './filter';
import type { Transfer, TransferFilter, FetchResult } from './types';

/** Parse the leading numeric out of a human amount like "1.23 USDT" → 1.23. */
function leadingNum(amount: string): number {
  const m = amount.match(/^[\d.]+/);
  const n = m ? parseFloat(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function fetchEvmTransfers(
  address: string,
  filter: TransferFilter,
  flaggedSet: Set<string> = new Set()
): Promise<FetchResult> {
  const raw = await getRecentTransfers(address, flaggedSet);
  const transfers: Transfer[] = raw
    .filter((t) => t.tx_hash && t.counterparty)
    .map((t) => ({
      counterparty: t.counterparty,
      direction: t.direction,
      amount: t.amount ?? '',
      amount_num: leadingNum(t.amount ?? ''),
      token: t.token_symbol ?? '',
      tx_hash: t.tx_hash,
      timestamp: t.timestamp,
      chain: 'evm' as const,
      explorer_url: t.explorer_url,
    }));
  return applyFilter(transfers, filter);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json
git add api/src/lib/chain-sources/evm.ts
git commit -m "feat(tracer): EVM transfer adapter via Blockscout"
```

---

### Task 3: BTC transfer adapter (Esplora, counterparty extraction)

**Files:**

- Create: `api/src/lib/chain-sources/btc.ts`
- Test: `api/test/lib/chain-sources/btc.test.ts`

- [ ] **Step 1: Write the failing test (counterparty + direction extraction)**

`api/test/lib/chain-sources/btc.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractBtcTransfers } from '../../../src/lib/chain-sources/btc';

afterEach(() => vi.restoreAllMocks());

const ADDR = 'bc1qself';

const txs = [
  {
    // outgoing: our address is the only input, pays bc1qcounter
    txid: 't1',
    status: { confirmed: true, block_time: 1718020800 }, // 2024-06-10T12:00:00Z
    vin: [{ prevout: { scriptpubkey_address: ADDR, value: 100000 } }],
    vout: [
      { scriptpubkey_address: 'bc1qcounter', value: 90000 },
      { scriptpubkey_address: ADDR, value: 9000 }, // change back to self
    ],
  },
  {
    // incoming: someone pays our address
    txid: 't2',
    status: { confirmed: true, block_time: 1718024400 },
    vin: [{ prevout: { scriptpubkey_address: 'bc1qsender', value: 50000 } }],
    vout: [{ scriptpubkey_address: ADDR, value: 50000 }],
  },
];

describe('extractBtcTransfers', () => {
  it('derives direction + counterparty from vin/vout', () => {
    const out = extractBtcTransfers(ADDR, txs as never);
    expect(out).toHaveLength(2);
    const t1 = out.find((t) => t.tx_hash === 't1')!;
    expect(t1.direction).toBe('out');
    expect(t1.counterparty).toBe('bc1qcounter');
    expect(t1.token).toBe('BTC');
    const t2 = out.find((t) => t.tx_hash === 't2')!;
    expect(t2.direction).toBe('in');
    expect(t2.counterparty).toBe('bc1qsender');
  });

  it('produces ISO timestamps from block_time', () => {
    const out = extractBtcTransfers(ADDR, txs as never);
    expect(out.find((t) => t.tx_hash === 't1')!.timestamp).toBe('2024-06-10T12:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npm test -- lib/chain-sources/btc`
Expected: FAIL — `extractBtcTransfers` not found.

- [ ] **Step 3: Implement the BTC adapter**

`api/src/lib/chain-sources/btc.ts`:

```ts
import { applyFilter } from './filter';
import type { Transfer, TransferFilter, FetchResult } from './types';

const FETCH_TIMEOUT = 10_000;

interface EsploraTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
}

function fmtBtc(sat: number): string {
  return `${(Math.abs(sat) / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} BTC`;
}

/**
 * Pure tx→Transfer extraction (no network), so it's unit-testable.
 * Direction is the net sat flow for `address`; counterparty is the largest
 * other-side address (top vout for outgoing, top vin for incoming).
 */
export function extractBtcTransfers(address: string, txs: EsploraTx[]): Transfer[] {
  const out: Transfer[] = [];
  for (const tx of txs) {
    const inputSum = tx.vin
      .filter((v) => v.prevout?.scriptpubkey_address === address)
      .reduce((n, v) => n + (v.prevout?.value ?? 0), 0);
    const outputSum = tx.vout.filter((v) => v.scriptpubkey_address === address).reduce((n, v) => n + v.value, 0);
    const net = outputSum - inputSum;
    const direction: 'in' | 'out' | 'self' = net === 0 ? 'self' : net > 0 ? 'in' : 'out';

    let counterparty = '';
    if (direction === 'out') {
      const top = tx.vout
        .filter((v) => v.scriptpubkey_address && v.scriptpubkey_address !== address)
        .sort((a, b) => b.value - a.value)[0];
      counterparty = top?.scriptpubkey_address ?? '';
    } else {
      const top = tx.vin
        .filter((v) => v.prevout?.scriptpubkey_address && v.prevout.scriptpubkey_address !== address)
        .sort((a, b) => (b.prevout?.value ?? 0) - (a.prevout?.value ?? 0))[0];
      counterparty = top?.prevout?.scriptpubkey_address ?? '';
    }
    if (!counterparty) continue;

    const amtSat = Math.abs(net);
    out.push({
      counterparty,
      direction,
      amount: fmtBtc(amtSat),
      amount_num: amtSat / 1e8,
      token: 'BTC',
      tx_hash: tx.txid,
      timestamp: tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : null,
      chain: 'btc',
      explorer_url: `https://mempool.space/tx/${tx.txid}`,
    });
  }
  return out;
}

export async function fetchBtcTransfers(address: string, filter: TransferFilter): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`https://blockstream.info/api/address/${address}/txs`, { signal: ctrl.signal });
    if (!res.ok) return { transfers: [], truncated: false };
    const txs = (await res.json().catch(() => [])) as EsploraTx[];
    return applyFilter(extractBtcTransfers(address, Array.isArray(txs) ? txs : []), filter);
  } catch {
    return { transfers: [], truncated: false };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npm test -- lib/chain-sources/btc`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json
git add api/src/lib/chain-sources/btc.ts api/test/lib/chain-sources/btc.test.ts
git commit -m "feat(tracer): BTC transfer adapter with counterparty extraction"
```

---

### Task 4: Tron adapter (TronGrid TRC-20) + dispatcher

**Files:**

- Create: `api/src/lib/chain-sources/tron.ts`
- Create: `api/src/lib/chain-sources/index.ts`
- Test: `api/test/lib/chain-sources/tron.test.ts`

- [ ] **Step 1: Write the failing test (pure TRC-20 row → Transfer mapping)**

`api/test/lib/chain-sources/tron.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapTrc20Rows } from '../../../src/lib/chain-sources/tron';

const ADDR = 'TSelfAddr';

const rows = [
  {
    transaction_id: 'x1',
    block_timestamp: 1718020800000, // ms
    from: ADDR,
    to: 'TCounter',
    value: '1500000', // raw, 6 decimals → 1.5
    token_info: { symbol: 'USDT', decimals: 6 },
  },
  {
    transaction_id: 'x2',
    block_timestamp: 1718024400000,
    from: 'TSender',
    to: ADDR,
    value: '2000000',
    token_info: { symbol: 'USDT', decimals: 6 },
  },
];

describe('mapTrc20Rows', () => {
  it('maps direction, counterparty, and decimal-scaled amount', () => {
    const out = mapTrc20Rows(ADDR, rows as never);
    const x1 = out.find((t) => t.tx_hash === 'x1')!;
    expect(x1.direction).toBe('out');
    expect(x1.counterparty).toBe('TCounter');
    expect(x1.amount_num).toBeCloseTo(1.5);
    expect(x1.token).toBe('USDT');
    const x2 = out.find((t) => t.tx_hash === 'x2')!;
    expect(x2.direction).toBe('in');
    expect(x2.counterparty).toBe('TSender');
    expect(x2.amount_num).toBeCloseTo(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npm test -- lib/chain-sources/tron`
Expected: FAIL — `mapTrc20Rows` not found.

- [ ] **Step 3: Implement the Tron adapter**

`api/src/lib/chain-sources/tron.ts`:

```ts
import { applyFilter } from './filter';
import type { Transfer, TransferFilter, FetchResult } from './types';

const FETCH_TIMEOUT = 10_000;

interface Trc20Row {
  transaction_id: string;
  block_timestamp: number; // ms
  from: string;
  to: string;
  value: string; // raw integer string
  token_info?: { symbol?: string; decimals?: number };
}

function scale(raw: string, decimals: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n / Math.pow(10, decimals);
}

/** Pure mapping (no network) so it's unit-testable. */
export function mapTrc20Rows(address: string, rows: Trc20Row[]): Transfer[] {
  return rows
    .filter((r) => r.transaction_id && r.from && r.to)
    .map((r) => {
      const isOut = r.from === address;
      const isIn = r.to === address;
      const direction: 'in' | 'out' | 'self' = isOut && isIn ? 'self' : isOut ? 'out' : 'in';
      const decimals = r.token_info?.decimals ?? 6;
      const symbol = r.token_info?.symbol ?? '';
      const num = scale(r.value, decimals);
      return {
        counterparty: isOut ? r.to : r.from,
        direction,
        amount: `${num} ${symbol}`.trim(),
        amount_num: num,
        token: symbol,
        tx_hash: r.transaction_id,
        timestamp: r.block_timestamp ? new Date(r.block_timestamp).toISOString() : null,
        chain: 'tron' as const,
        explorer_url: `https://tronscan.org/#/transaction/${r.transaction_id}`,
      };
    });
}

export async function fetchTronTransfers(address: string, filter: TransferFilter): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const limit = filter.maxTransfers ?? 50;
    const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=${Math.min(limit, 200)}`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { transfers: [], truncated: false };
    const body = (await res.json().catch(() => null)) as { data?: Trc20Row[] } | null;
    return applyFilter(mapTrc20Rows(address, body?.data ?? []), filter);
  } catch {
    return { transfers: [], truncated: false };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Implement the dispatcher**

`api/src/lib/chain-sources/index.ts`:

```ts
import { fetchEvmTransfers } from './evm';
import { fetchBtcTransfers } from './btc';
import { fetchTronTransfers } from './tron';
import type { TracerChain, TransferFilter, FetchResult } from './types';

export type { TracerChain, Transfer, TransferFilter, FetchResult } from './types';

/** One address, one chain, one hop. The caller pre-loads `flaggedSet` (EVM only). */
export function fetchTransfers(
  chain: TracerChain,
  address: string,
  filter: TransferFilter,
  flaggedSet?: Set<string>
): Promise<FetchResult> {
  switch (chain) {
    case 'evm':
      return fetchEvmTransfers(address, filter, flaggedSet);
    case 'btc':
      return fetchBtcTransfers(address, filter);
    case 'tron':
      return fetchTronTransfers(address, filter);
  }
}
```

- [ ] **Step 5: Run to verify the tron test passes**

Run: `cd api && npm test -- lib/chain-sources/tron`
Expected: PASS (1 test).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json
git add api/src/lib/chain-sources/tron.ts api/src/lib/chain-sources/index.ts api/test/lib/chain-sources/tron.test.ts
git commit -m "feat(tracer): Tron adapter + chain-source dispatcher"
```

---

### Task 5: Seed labels + address-label resolver

**Files:**

- Create: `api/src/lib/chain-seed-labels.ts`
- Create: `api/src/lib/address-labels.ts`
- Test: `api/test/lib/address-labels.test.ts`

- [ ] **Step 1: Create the curated seed-label constant**

`api/src/lib/chain-seed-labels.ts`:

```ts
import type { LabelCategory } from './address-labels';

export interface SeedLabel {
  label: string;
  category: LabelCategory;
}

/**
 * Curated, version-controlled address labels (Phase A seed — extended in Phase B
 * with a D1-backed store + user additions). EVM keys MUST be lowercase. These are
 * widely-published, high-signal addresses (major CEX hot wallets + OFAC-listed
 * Tornado Cash mixer contracts).
 */
export const SEED_LABELS: Record<string, SeedLabel> = {
  // Mixers (OFAC-sanctioned Tornado Cash contracts)
  '0x722122df12d4e14e13ac3b6895a86e84145b6967': { label: 'Tornado Cash: Router', category: 'mixer' },
  '0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc': { label: 'Tornado Cash: 0.1 ETH', category: 'mixer' },
  '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936': { label: 'Tornado Cash: 1 ETH', category: 'mixer' },
  // Exchanges (hot wallets)
  '0x28c6c06298d514db089934071355e5743bf21d60': { label: 'Binance 14', category: 'exchange' },
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': { label: 'Binance 15', category: 'exchange' },
  '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': { label: 'Kraken', category: 'exchange' },
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': { label: 'Coinbase 1', category: 'exchange' },
};
```

- [ ] **Step 2: Write the failing resolver test**

`api/test/lib/address-labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveSeedLabel } from '../../src/lib/address-labels';

describe('resolveSeedLabel', () => {
  it('matches a known EVM address case-insensitively', () => {
    const r = resolveSeedLabel('0x28C6c06298d514Db089934071355E5743Bf21d60', 'evm');
    expect(r).not.toBeNull();
    expect(r!.category).toBe('exchange');
    expect(r!.label).toBe('Binance 14');
    expect(r!.source).toBe('curated');
  });

  it('matches a mixer', () => {
    const r = resolveSeedLabel('0x722122dF12D4e14e13Ac3b6895a86e84145b6967', 'evm');
    expect(r!.category).toBe('mixer');
  });

  it('returns null for an unknown address', () => {
    expect(resolveSeedLabel('0x0000000000000000000000000000000000000001', 'evm')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd api && npm test -- lib/address-labels`
Expected: FAIL — `resolveSeedLabel` not found.

- [ ] **Step 4: Implement the resolver**

`api/src/lib/address-labels.ts`:

```ts
import type { TracerChain } from './chain-sources/types';
import { SEED_LABELS } from './chain-seed-labels';

export type LabelCategory =
  | 'exchange'
  | 'mixer'
  | 'bridge'
  | 'defi'
  | 'contract'
  | 'ransomware'
  | 'scammer'
  | 'sanctioned'
  | 'wallet'
  | 'unknown';

export interface AddressLabel {
  label: string;
  category: LabelCategory;
  source: 'curated' | 'blockscout' | 'ens' | 'user';
  confidence: number; // 0-100
}

/**
 * Pure seed-map lookup (no I/O). EVM addresses match case-insensitively;
 * BTC/Tron match exactly. Blockscout/ENS enrichment + D1 store are Phase B/C
 * and handled by the route for the root node only.
 */
export function resolveSeedLabel(address: string, chain: TracerChain): AddressLabel | null {
  const key = chain === 'evm' ? address.toLowerCase() : address;
  const hit = SEED_LABELS[key];
  if (!hit) return null;
  return { label: hit.label, category: hit.category, source: 'curated', confidence: 95 };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd api && npm test -- lib/address-labels`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json
git add api/src/lib/chain-seed-labels.ts api/src/lib/address-labels.ts api/test/lib/address-labels.test.ts
git commit -m "feat(tracer): curated seed labels + address-label resolver"
```

---

### Task 6: Risk scorer (pure)

**Files:**

- Create: `api/src/lib/risk-score.ts`
- Test: `api/test/lib/risk-score.test.ts`

- [ ] **Step 1: Write the failing test**

`api/test/lib/risk-score.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreAddress } from '../../src/lib/risk-score';

describe('scoreAddress', () => {
  it('sanctioned → critical', () => {
    const r = scoreAddress({ sanctioned: true, scamFlagged: false, labelCategory: null });
    expect(r.level).toBe('critical');
    expect(r.signals.some((s) => /sanction/i.test(s))).toBe(true);
  });

  it('mixer label → critical', () => {
    expect(scoreAddress({ sanctioned: false, scamFlagged: false, labelCategory: 'mixer' }).level).toBe('critical');
  });

  it('scam-flagged → high', () => {
    expect(scoreAddress({ sanctioned: false, scamFlagged: true, labelCategory: null }).level).toBe('high');
  });

  it('ransomware label → high', () => {
    expect(scoreAddress({ sanctioned: false, scamFlagged: false, labelCategory: 'ransomware' }).level).toBe('high');
  });

  it('exchange label → low (informational)', () => {
    expect(scoreAddress({ sanctioned: false, scamFlagged: false, labelCategory: 'exchange' }).level).toBe('low');
  });

  it('unknown plain wallet → low', () => {
    const r = scoreAddress({ sanctioned: false, scamFlagged: false, labelCategory: null });
    expect(r.level).toBe('low');
    expect(r.score).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npm test -- lib/risk-score`
Expected: FAIL — `scoreAddress` not found.

- [ ] **Step 3: Implement the scorer**

`api/src/lib/risk-score.ts`:

```ts
import type { LabelCategory } from './address-labels';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskInput {
  sanctioned: boolean;
  scamFlagged: boolean;
  labelCategory: LabelCategory | null;
}

export interface RiskScore {
  level: RiskLevel;
  score: number; // 0-100
  signals: string[];
}

function levelFor(score: number): RiskLevel {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/** Deterministic, no I/O. Highest contributing signal sets the score. */
export function scoreAddress(input: RiskInput): RiskScore {
  const signals: string[] = [];
  let score = 0;

  if (input.sanctioned) {
    score = Math.max(score, 100);
    signals.push('OFAC-sanctioned address');
  }
  if (input.labelCategory === 'mixer' || input.labelCategory === 'sanctioned') {
    score = Math.max(score, 95);
    signals.push(`Labeled as ${input.labelCategory}`);
  }
  if (input.scamFlagged) {
    score = Math.max(score, 80);
    signals.push('Flagged by ScamSniffer (phishing / drainer)');
  }
  if (input.labelCategory === 'ransomware' || input.labelCategory === 'scammer') {
    score = Math.max(score, 75);
    signals.push(`Labeled as ${input.labelCategory}`);
  }
  if (input.labelCategory === 'exchange' || input.labelCategory === 'bridge' || input.labelCategory === 'defi') {
    // Informational — known service, not inherently risky.
    signals.push(`Known ${input.labelCategory}`);
  }

  return { level: levelFor(score), score, signals };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npm test -- lib/risk-score`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json
git add api/src/lib/risk-score.ts api/test/lib/risk-score.test.ts
git commit -m "feat(tracer): deterministic address risk scorer"
```

---

### Task 7: Export a one-shot OFAC set loader

**Files:**

- Modify: `api/src/lib/ofac-sanctions.ts`

The route must NOT call `checkAddress` per counterparty (each call does Cache-API `match` ops that count toward the 50-subrequest cap). Instead it loads a merged sanctioned set **once** and does in-memory `.has()`.

- [ ] **Step 1: Add the exported loader**

In `api/src/lib/ofac-sanctions.ts`, after the existing `checkAddress` function (end of file), add:

```ts
/**
 * Load and merge the sanctioned-address sets for the given chains ONCE, so a
 * caller can do many in-memory `.has()` checks without per-address Cache-API ops
 * (which count toward the Worker subrequest budget). Values are normalised the
 * same way as `checkAddress` (lowercased for EVM/bech32, exact otherwise).
 */
export async function loadSanctionedSet(chains: SanctionsChain[]): Promise<Set<string>> {
  const merged = new Set<string>();
  const sets = await Promise.all(chains.map((c) => loadList(c)));
  for (const s of sets) for (const a of s) merged.add(a);
  return merged;
}
```

Note: `loadList` and `normalize` already exist in this file and are in scope.

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json
git add api/src/lib/ofac-sanctions.ts
git commit -m "feat(tracer): one-shot loadSanctionedSet for budget-safe lookups"
```

---

### Task 8: Tracer route (`/expand` + `/label`) + schemas + registration

**Files:**

- Modify: `api/src/lib/validation-schemas.ts`
- Create: `api/src/routes/tracer.ts`
- Modify: `api/src/index.ts`
- Test: `api/test/routes/tracer.test.ts`

- [ ] **Step 1: Add the Zod schemas**

In `api/src/lib/validation-schemas.ts`, after the `cryptoTraceSchema` block (around line 191), add:

```ts
export const tracerExpandSchema = z.object({
  address: z.string().min(1, 'address is required').max(200, 'address too long'),
  chain: z.enum(['evm', 'btc', 'tron']),
  direction: z.enum(['in', 'out', 'both']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  around: z.string().datetime().optional(),
  toleranceMin: z.number().int().positive().max(10080).optional(),
  token: z.string().max(20).optional(),
  minAmount: z.number().nonnegative().optional(),
  maxTransfers: z.number().int().positive().max(100).optional(),
});
export type TracerExpandInput = z.infer<typeof tracerExpandSchema>;

export const tracerLabelSchema = z.object({
  address: z.string().min(1, 'address is required').max(200, 'address too long'),
  chain: z.enum(['evm', 'btc', 'tron']),
});
export type TracerLabelInput = z.infer<typeof tracerLabelSchema>;
```

- [ ] **Step 2: Write the failing route test**

`api/test/routes/tracer.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('POST /api/v1/tracer/expand', () => {
  it('400s on missing chain', async () => {
    const r = await SELF.fetch('https://x/api/v1/tracer/expand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '0x28C6c06298d514Db089934071355E5743Bf21d60' }),
    });
    expect(r.status).toBe(400);
  });

  it('400s on an unsupported chain enum', async () => {
    const r = await SELF.fetch('https://x/api/v1/tracer/expand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'x', chain: 'dogecoin' }),
    });
    expect(r.status).toBe(400);
  });

  it('returns a root node with risk + candidate edges for an EVM address', async () => {
    const r = await SELF.fetch('https://x/api/v1/tracer/expand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '0x28C6c06298d514Db089934071355E5743Bf21d60', chain: 'evm' }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      root: { address: string; risk: { level: string }; category: string };
      nodes: unknown[];
      edges: { confidence: string }[];
      generated_at: string;
    };
    // Root is a curated exchange → risk low, label present.
    expect(body.root.category).toBe('exchange');
    expect(body.root.risk.level).toBe('low');
    expect(Array.isArray(body.nodes)).toBe(true);
    // Any returned edge must be a candidate (server never confirms).
    for (const e of body.edges) expect(e.confidence).toBe('candidate');
    expect(typeof body.generated_at).toBe('string');
  });
});

describe('GET /api/v1/tracer/label', () => {
  it('resolves a curated mixer label', async () => {
    const r = await SELF.fetch(
      'https://x/api/v1/tracer/label?address=0x722122dF12D4e14e13Ac3b6895a86e84145b6967&chain=evm'
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { label: { category: string } | null; risk: { level: string } };
    expect(body.label?.category).toBe('mixer');
    expect(body.risk.level).toBe('critical');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd api && npm test -- routes/tracer` (Bash with `dangerouslyDisableSandbox: true`)
Expected: FAIL — route not registered (404) / handler missing.

- [ ] **Step 4: Implement the route**

`api/src/routes/tracer.ts`:

```ts
import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchTransfers, type TracerChain } from '../lib/chain-sources';
import { resolveSeedLabel, type AddressLabel, type LabelCategory } from '../lib/address-labels';
import { scoreAddress, type RiskScore } from '../lib/risk-score';
import { loadSanctionedSet, type SanctionsChain } from '../lib/ofac-sanctions';
import { loadScamSnifferSet } from '../lib/scamsniffer';
import { getAddressContext } from '../lib/blockscout';
import type { TracerExpandInput, TracerLabelInput } from '../lib/validation-schemas';

export interface TracerNode {
  id: string; // `${chain}:${address}`
  address: string;
  chain: TracerChain;
  label: string | null;
  category: LabelCategory;
  risk: RiskScore;
  is_root: boolean;
  explorer_url: string;
}

export interface TracerEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  direction: 'in' | 'out' | 'self';
  amount: string;
  token: string;
  tx_hash: string;
  timestamp: string | null;
  confidence: 'candidate'; // server never confirms a hop
}

export interface ExpandResponse {
  root: TracerNode;
  nodes: TracerNode[];
  edges: TracerEdge[];
  truncated: boolean;
  warning?: string;
  generated_at: string;
}

const EXPLORER: Record<TracerChain, (a: string) => string> = {
  evm: (a) => `https://etherscan.io/address/${a}`,
  btc: (a) => `https://mempool.space/address/${a}`,
  tron: (a) => `https://tronscan.org/#/address/${a}`,
};

// OFAC list keys to merge per chain (EVM uses ETH list; BTC uses XBT; Tron uses TRX).
const OFAC_CHAINS: Record<TracerChain, SanctionsChain[]> = {
  evm: ['ETH', 'USDT', 'USDC', 'BSC', 'ARB'],
  btc: ['XBT'],
  tron: ['TRX', 'USDT'],
};

function nodeId(chain: TracerChain, address: string): string {
  return `${chain}:${address}`;
}

function normForSet(chain: TracerChain, address: string): string {
  return chain === 'evm' ? address.toLowerCase() : address;
}

/** Build a labeled, risk-scored node from in-memory sets (no per-node I/O). */
function buildNode(
  chain: TracerChain,
  address: string,
  isRoot: boolean,
  sanctionedSet: Set<string>,
  scamSet: Set<string>,
  override?: AddressLabel | null
): TracerNode {
  const label = override ?? resolveSeedLabel(address, chain);
  const sanctioned = sanctionedSet.has(normForSet(chain, address));
  const scamFlagged = chain === 'evm' && scamSet.has(address.toLowerCase());
  const risk = scoreAddress({ sanctioned, scamFlagged, labelCategory: label?.category ?? null });
  return {
    id: nodeId(chain, address),
    address,
    chain,
    label: label?.label ?? null,
    category: label?.category ?? 'unknown',
    risk,
    is_root: isRoot,
    explorer_url: EXPLORER[chain](address),
  };
}

export async function tracerExpandHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerExpandInput }).parsed;
  const { address, chain } = input;

  // Resolve the time window (around+tolerance OR explicit from/to).
  let from = input.from;
  let to = input.to;
  if (input.around && input.toleranceMin) {
    const center = Date.parse(input.around);
    if (!Number.isNaN(center)) {
      from = new Date(center - input.toleranceMin * 60_000).toISOString();
      to = new Date(center + input.toleranceMin * 60_000).toISOString();
    }
  }
  const filter = {
    from,
    to,
    token: input.token,
    minAmount: input.minAmount,
    maxTransfers: input.maxTransfers ?? 50,
  };

  // Load the flagged/sanctioned sets ONCE (budget-safe).
  const [sanctionedSet, scamSet] = await Promise.all([
    loadSanctionedSet(OFAC_CHAINS[chain]),
    chain === 'evm' ? loadScamSnifferSet() : Promise.resolve(new Set<string>()),
  ]);

  // Root label: seed + (EVM only) one Blockscout context call.
  let rootOverride: AddressLabel | null = resolveSeedLabel(address, chain);
  if (chain === 'evm' && !rootOverride) {
    const ctx = await getAddressContext(address);
    const lbl = ctx.label ?? ctx.ens_name;
    if (lbl) {
      rootOverride = {
        label: lbl,
        category: ctx.is_contract ? 'contract' : 'wallet',
        source: ctx.ens_name && !ctx.label ? 'ens' : 'blockscout',
        confidence: 60,
      };
    } else if (ctx.is_scam) {
      rootOverride = { label: 'Flagged scam (Blockscout)', category: 'scammer', source: 'blockscout', confidence: 70 };
    }
  }

  const root = buildNode(chain, address, true, sanctionedSet, scamSet, rootOverride);

  const direction = input.direction ?? 'both';
  const { transfers, truncated } = await fetchTransfers(chain, address, filter, scamSet);

  const nodes: TracerNode[] = [root];
  const edges: TracerEdge[] = [];
  const seen = new Set<string>([root.id]);

  for (const t of transfers) {
    if (direction !== 'both' && t.direction !== direction && t.direction !== 'self') continue;
    const cpId = nodeId(chain, t.counterparty);
    if (!seen.has(cpId)) {
      seen.add(cpId);
      nodes.push(buildNode(chain, t.counterparty, false, sanctionedSet, scamSet));
    }
    const source = t.direction === 'out' ? root.id : cpId;
    const target = t.direction === 'out' ? cpId : root.id;
    edges.push({
      id: `${t.tx_hash}:${cpId}`,
      source,
      target,
      direction: t.direction,
      amount: t.amount,
      token: t.token,
      tx_hash: t.tx_hash,
      timestamp: t.timestamp,
      confidence: 'candidate',
    });
  }

  const body: ExpandResponse = {
    root,
    nodes,
    edges,
    truncated,
    ...(truncated
      ? { warning: `Showing first ${filter.maxTransfers} transfers — narrow the time window or raise minAmount.` }
      : {}),
    generated_at: new Date().toISOString(),
  };
  return c.json(body, 200, { 'Cache-Control': 'public, max-age=60' });
}

export async function tracerLabelHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerLabelInput }).parsed;
  const { address, chain } = input;
  const [sanctionedSet, scamSet] = await Promise.all([
    loadSanctionedSet(OFAC_CHAINS[chain]),
    chain === 'evm' ? loadScamSnifferSet() : Promise.resolve(new Set<string>()),
  ]);
  const node = buildNode(chain, address, true, sanctionedSet, scamSet);
  return c.json(
    {
      address,
      chain,
      label: node.label ? { label: node.label, category: node.category } : null,
      risk: node.risk,
      explorer_url: node.explorer_url,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}
```

- [ ] **Step 5: Register the routes in `api/src/index.ts`**

Add the import near the other route imports (next to the `cryptoTraceHandler` import, ~line 28):

```ts
import { tracerExpandHandler, tracerLabelHandler } from './routes/tracer';
```

Add the schema import to the existing import from `./lib/validation-schemas` (find the line importing `cryptoTraceSchema` and add the two names), or add a new import line:

```ts
import { tracerExpandSchema, tracerLabelSchema } from './lib/validation-schemas';
```

Register the routes near the `crypto-trace` registration (~line 682):

```ts
app.post('/api/v1/tracer/expand', validate('json', tracerExpandSchema), tracerExpandHandler);
app.get('/api/v1/tracer/label', validate('query', tracerLabelSchema), tracerLabelHandler);
```

(No `ADMIN_GATED_PREFIXES` entry — the tracer is public-read by design.)

- [ ] **Step 6: Run the route test to verify it passes**

Run: `cd api && npm test -- routes/tracer` (Bash with `dangerouslyDisableSandbox: true`)
Expected: PASS (4 tests). The EVM expand test hits live Blockscout/OFAC; the assertions only require the curated root label + candidate-edge invariant, so they hold even if upstream returns zero transfers.

- [ ] **Step 7: Typecheck all three projects + commit**

```bash
npx tsc -p api/tsconfig.json && npx tsc -p api/tsconfig.worker.json && npx tsc -p tsconfig.json
git add api/src/lib/validation-schemas.ts api/src/routes/tracer.ts api/src/index.ts api/test/routes/tracer.test.ts
git commit -m "feat(tracer): /tracer/expand + /tracer/label routes (public-read)"
```

---

### Task 9: Extend the graph canvas shared types for crypto nodes

**Files:**

- Modify: `src/pages/threatintel/relationship-graph-shared.ts`

The canvas colors nodes by `GraphNodeType` (via `NODE_COLORS`). To get **color-by-risk** for free from the existing renderer, add four risk-level node types. Also add an optional `data?` field to `GraphEdgeData` so edges can carry confidence/amount.

- [ ] **Step 1: Add the four crypto risk node types**

In `src/pages/threatintel/relationship-graph-shared.ts`, extend the `GraphNodeType` union (currently ending `| 'reference';`):

```ts
export type GraphNodeType =
  | 'cve'
  | 'actor'
  | 'ransomware'
  | 'malware'
  | 'campaign'
  | 'ip'
  | 'domain'
  | 'hash'
  | 'technique'
  | 'victim'
  | 'c2_framework'
  | 'product'
  | 'reference'
  | 'crypto_low'
  | 'crypto_medium'
  | 'crypto_high'
  | 'crypto_critical';
```

- [ ] **Step 2: Add their colors**

In the same file, add to the `NODE_COLORS` record (it is `Record<GraphNodeType, string>`, so TypeScript REQUIRES all four — omitting any will fail the build):

```ts
  crypto_low: '#22c55e',
  crypto_medium: '#eab308',
  crypto_high: '#f97316',
  crypto_critical: '#dc2626',
```

- [ ] **Step 3: Add optional `data` to `GraphEdgeData`**

Change the `GraphEdgeData` interface (currently `{ id; source; target; label }`) to add an optional field:

```ts
export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
  data?: Record<string, unknown>;
}
```

(Adding an optional field is non-breaking for the existing `RelationshipGraph` page.)

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc -p tsconfig.json
git add src/pages/threatintel/relationship-graph-shared.ts
git commit -m "feat(tracer): crypto risk node types + edge data on shared graph types"
```

---

### Task 10: Client graph model (`tracer-graph.ts`)

**Files:**

- Create: `src/lib/dfir/tracer-graph.ts`
- Test: `src/lib/dfir/tracer-graph.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/dfir/tracer-graph.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  emptyGraph,
  mergeExpand,
  toGraphResponse,
  riskToNodeType,
  confirmEdge,
  type ExpandResponse,
} from './tracer-graph';

function resp(over: Partial<ExpandResponse> = {}): ExpandResponse {
  return {
    root: {
      id: 'evm:0xroot',
      address: '0xroot',
      chain: 'evm',
      label: 'Binance 14',
      category: 'exchange',
      risk: { level: 'low', score: 0, signals: [] },
      is_root: true,
      explorer_url: 'https://x',
    },
    nodes: [
      {
        id: 'evm:0xroot',
        address: '0xroot',
        chain: 'evm',
        label: 'Binance 14',
        category: 'exchange',
        risk: { level: 'low', score: 0, signals: [] },
        is_root: true,
        explorer_url: 'https://x',
      },
      {
        id: 'evm:0xa',
        address: '0xa',
        chain: 'evm',
        label: null,
        category: 'unknown',
        risk: { level: 'critical', score: 100, signals: ['OFAC-sanctioned address'] },
        is_root: false,
        explorer_url: 'https://x',
      },
    ],
    edges: [
      {
        id: 'tx1:evm:0xa',
        source: 'evm:0xroot',
        target: 'evm:0xa',
        direction: 'out',
        amount: '1 ETH',
        token: 'ETH',
        tx_hash: 'tx1',
        timestamp: null,
        confidence: 'candidate',
      },
    ],
    truncated: false,
    generated_at: '2026-06-10T12:00:00.000Z',
    ...over,
  };
}

describe('tracer-graph', () => {
  it('riskToNodeType maps level → crypto node type', () => {
    expect(riskToNodeType('low')).toBe('crypto_low');
    expect(riskToNodeType('critical')).toBe('crypto_critical');
  });

  it('mergeExpand adds nodes + edges to an empty graph', () => {
    const g = mergeExpand(emptyGraph('evm:0xroot'), resp());
    expect(g.nodes.size).toBe(2);
    expect(g.edges.size).toBe(1);
  });

  it('mergeExpand dedupes nodes + edges by id', () => {
    let g = mergeExpand(emptyGraph('evm:0xroot'), resp());
    g = mergeExpand(g, resp()); // same payload again
    expect(g.nodes.size).toBe(2);
    expect(g.edges.size).toBe(1);
  });

  it('toGraphResponse renders crypto node types + edge labels', () => {
    const g = mergeExpand(emptyGraph('evm:0xroot'), resp());
    const gr = toGraphResponse(g);
    const sanctioned = gr.nodes.find((n) => n.id === 'evm:0xa')!;
    expect(sanctioned.type).toBe('crypto_critical');
    const edge = gr.edges[0];
    expect(edge.label).toMatch(/out/i);
    expect(edge.data?.confidence).toBe('candidate');
  });

  it('confirmEdge flips an edge to confirmed', () => {
    let g = mergeExpand(emptyGraph('evm:0xroot'), resp());
    g = confirmEdge(g, 'tx1:evm:0xa');
    expect(g.edges.get('tx1:evm:0xa')!.confidence).toBe('confirmed');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (repo root): `npm test -- tracer-graph`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client graph model**

`src/lib/dfir/tracer-graph.ts`:

```ts
import type {
  GraphNodeType,
  GraphResponse,
  GraphNodeData,
  GraphEdgeData,
} from '../../pages/threatintel/relationship-graph-shared';

export type TracerChain = 'evm' | 'btc' | 'tron';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface TracerNode {
  id: string;
  address: string;
  chain: TracerChain;
  label: string | null;
  category: string;
  risk: { level: RiskLevel; score: number; signals: string[] };
  is_root: boolean;
  explorer_url: string;
}

export interface TracerEdge {
  id: string;
  source: string;
  target: string;
  direction: 'in' | 'out' | 'self';
  amount: string;
  token: string;
  tx_hash: string;
  timestamp: string | null;
  confidence: 'candidate' | 'confirmed';
}

export interface ExpandResponse {
  root: TracerNode;
  nodes: TracerNode[];
  edges: TracerEdge[];
  truncated: boolean;
  warning?: string;
  generated_at: string;
}

export interface TracerGraph {
  seedId: string;
  nodes: Map<string, TracerNode>;
  edges: Map<string, TracerEdge>;
}

export function emptyGraph(seedId: string): TracerGraph {
  return { seedId, nodes: new Map(), edges: new Map() };
}

export function riskToNodeType(level: RiskLevel): GraphNodeType {
  return `crypto_${level}` as GraphNodeType;
}

/** Merge an /expand payload into the graph (dedupe by id; new nodes/edges win on re-expand). */
export function mergeExpand(graph: TracerGraph, resp: ExpandResponse): TracerGraph {
  const nodes = new Map(graph.nodes);
  const edges = new Map(graph.edges);
  for (const n of resp.nodes) nodes.set(n.id, nodes.get(n.id) ?? n);
  for (const e of resp.edges) {
    // Preserve a prior confirmed state if the same edge re-arrives as candidate.
    const prior = edges.get(e.id);
    edges.set(e.id, prior?.confidence === 'confirmed' ? { ...e, confidence: 'confirmed' } : e);
  }
  return { seedId: graph.seedId, nodes, edges };
}

export function confirmEdge(graph: TracerGraph, edgeId: string): TracerGraph {
  const edges = new Map(graph.edges);
  const e = edges.get(edgeId);
  if (e) edges.set(edgeId, { ...e, confidence: 'confirmed' });
  return { ...graph, edges };
}

function shortAddr(a: string): string {
  return a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Project the client graph into the shape RelationshipGraphCanvas consumes. */
export function toGraphResponse(graph: TracerGraph): GraphResponse {
  const nodes: GraphNodeData[] = [...graph.nodes.values()].map((n) => ({
    id: n.id,
    type: riskToNodeType(n.risk.level),
    label: n.label ?? shortAddr(n.address),
    subtitle: `${n.category} · ${n.risk.level}`,
    data: { ...n },
  }));
  const edges: GraphEdgeData[] = [...graph.edges.values()].map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: `${e.direction} ${e.amount}${e.confidence === 'confirmed' ? ' ✓' : ''}`,
    data: { confidence: e.confidence, tx_hash: e.tx_hash, timestamp: e.timestamp },
  }));
  const seedNode = graph.nodes.get(graph.seedId);
  return {
    nodes,
    edges,
    seed: graph.nodes.get(graph.seedId)?.address ?? '',
    seed_type: seedNode ? riskToNodeType(seedNode.risk.level) : null,
    generated_at: new Date().toISOString(),
    depth: 1,
    truncated: false,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run (repo root): `npm test -- tracer-graph`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p tsconfig.json
git add src/lib/dfir/tracer-graph.ts src/lib/dfir/tracer-graph.test.ts
git commit -m "feat(tracer): client graph model (merge/dedupe/confirm/project)"
```

---

### Task 11: Tracer page + route + tool-card wiring

**Files:**

- Create: `src/pages/dfir/Tracer.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/dfir/tool-sections.ts`

- [ ] **Step 1: Implement the page**

`src/pages/dfir/Tracer.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Coins, Loader2, AlertTriangle, ExternalLink, Check } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import RelationshipGraphCanvas from '../../pages/threatintel/RelationshipGraphCanvas';
import type { GraphNodeData } from '../../pages/threatintel/relationship-graph-shared';
import {
  emptyGraph,
  mergeExpand,
  toGraphResponse,
  confirmEdge,
  type TracerGraph,
  type TracerNode,
  type TracerChain,
  type ExpandResponse,
} from '../../lib/dfir/tracer-graph';

const CHAINS: { id: TracerChain; label: string }[] = [
  { id: 'evm', label: 'EVM (ETH)' },
  { id: 'btc', label: 'Bitcoin' },
  { id: 'tron', label: 'Tron' },
];

export default function Tracer(): JSX.Element {
  const [seed, setSeed] = useState('');
  const [chain, setChain] = useState<TracerChain>('evm');
  const [direction, setDirection] = useState<'in' | 'out' | 'both'>('both');
  const [around, setAround] = useState('');
  const [toleranceMin, setToleranceMin] = useState('');
  const [token, setToken] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [graph, setGraph] = useState<TracerGraph | null>(null);
  const [selected, setSelected] = useState<TracerNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const expand = useCallback(
    async (address: string, forChain: TracerChain, base: TracerGraph | null) => {
      setLoading(true);
      setError(null);
      try {
        const body: Record<string, unknown> = { address, chain: forChain, direction };
        if (around && toleranceMin) {
          body.around = new Date(around).toISOString();
          body.toleranceMin = Number(toleranceMin);
        }
        if (token) body.token = token;
        if (minAmount) body.minAmount = Number(minAmount);
        const res = await fetch('/api/v1/tracer/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setError(`Expand failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as ExpandResponse;
        setWarning(data.warning ?? null);
        setGraph((prev) => mergeExpand(prev ?? base ?? emptyGraph(data.root.id), data));
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    },
    [direction, around, toleranceMin, token, minAmount]
  );

  const onSeed = useCallback(() => {
    const a = seed.trim();
    if (!a) return;
    setGraph(emptyGraph(`${chain}:${a}`));
    setSelected(null);
    void expand(a, chain, emptyGraph(`${chain}:${a}`));
  }, [seed, chain, expand]);

  const graphData = useMemo(() => (graph ? toGraphResponse(graph) : null), [graph]);

  const onNodeClick = useCallback(
    (node: GraphNodeData | null) => {
      if (!node || !graph) return setSelected(null);
      const tn = graph.nodes.get(node.id) ?? null;
      setSelected(tn);
    },
    [graph]
  );

  const onExpandNode = useCallback(
    (node: GraphNodeData) => {
      const tn = graph?.nodes.get(node.id);
      if (tn) void expand(tn.address, tn.chain, graph);
    },
    [graph, expand]
  );

  const confirmHopsTo = useCallback(
    (nodeId: string) => {
      if (!graph) return;
      let g = graph;
      for (const e of graph.edges.values()) {
        if (e.source === nodeId || e.target === nodeId) g = confirmEdge(g, e.id);
      }
      setGraph(g);
    },
    [graph]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <BackLink to="/dfir" label="DFIR Toolkit" />
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
        <Coins className="h-6 w-6" /> Fund-Flow Tracer
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Seed an address, then click a node to expand the next hop. Edges are <strong>candidates</strong> until you
        confirm them.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_300px]">
        {/* Control rail */}
        <div className="space-y-3 rounded-lg border border-gray-700 p-3 text-sm">
          <label className="block">
            <span className="text-gray-400">Chain</span>
            <select
              className="mt-1 w-full rounded bg-gray-800 p-2"
              value={chain}
              onChange={(e) => setChain(e.target.value as TracerChain)}
            >
              {CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-gray-400">Seed address</span>
            <input
              className="mt-1 w-full rounded bg-gray-800 p-2 font-mono text-xs"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="0x… / bc1… / T…"
            />
          </label>
          <label className="block">
            <span className="text-gray-400">Direction</span>
            <select
              className="mt-1 w-full rounded bg-gray-800 p-2"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'in' | 'out' | 'both')}
            >
              <option value="both">Both</option>
              <option value="out">Outgoing</option>
              <option value="in">Incoming</option>
            </select>
          </label>
          <div className="border-t border-gray-700 pt-2">
            <span className="text-gray-400">Time tolerance (optional)</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded bg-gray-800 p-2 text-xs"
              value={around}
              onChange={(e) => setAround(e.target.value)}
            />
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded bg-gray-800 p-2 text-xs"
              value={toleranceMin}
              onChange={(e) => setToleranceMin(e.target.value)}
              placeholder="± minutes"
            />
          </div>
          <input
            className="w-full rounded bg-gray-800 p-2 text-xs"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token symbol filter (e.g. USDT)"
          />
          <input
            type="number"
            className="w-full rounded bg-gray-800 p-2 text-xs"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            placeholder="Min amount"
          />
          <button
            className="flex w-full items-center justify-center gap-2 rounded bg-blue-600 p-2 font-medium hover:bg-blue-500 disabled:opacity-50"
            onClick={onSeed}
            disabled={loading || !seed.trim()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Trace
          </button>
          {error ? (
            <p className="flex items-center gap-1 text-xs text-red-400">
              <AlertTriangle className="h-3 w-3" /> {error}
            </p>
          ) : null}
          {warning ? <p className="text-xs text-amber-400">{warning}</p> : null}
        </div>

        {/* Canvas */}
        <div className="min-h-[560px] rounded-lg border border-gray-700">
          {graphData ? (
            <RelationshipGraphCanvas
              graphData={graphData}
              onNodeClick={onNodeClick}
              onExpandNode={onExpandNode}
              layoutMode="force"
            />
          ) : (
            <div className="flex h-[560px] items-center justify-center text-gray-500">Seed an address to begin.</div>
          )}
        </div>

        {/* Detail panel */}
        <div className="space-y-3 rounded-lg border border-gray-700 p-3 text-sm">
          {selected ? (
            <>
              <div className="break-all font-mono text-xs">{selected.address}</div>
              <div>
                <span className="text-gray-400">Label: </span>
                {selected.label ?? '—'} <span className="text-gray-500">({selected.category})</span>
              </div>
              <div>
                <span className="text-gray-400">Risk: </span>
                <span className="font-semibold uppercase">{selected.risk.level}</span> ({selected.risk.score})
              </div>
              {selected.risk.signals.length ? (
                <ul className="list-inside list-disc text-xs text-gray-400">
                  {selected.risk.signals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  className="rounded bg-blue-600 p-2 text-xs hover:bg-blue-500"
                  onClick={() => void expand(selected.address, selected.chain, graph)}
                >
                  Expand this node
                </button>
                <button
                  className="flex items-center justify-center gap-1 rounded bg-emerald-700 p-2 text-xs hover:bg-emerald-600"
                  onClick={() => confirmHopsTo(selected.id)}
                >
                  <Check className="h-3 w-3" /> Confirm hops
                </button>
                <a
                  className="flex items-center justify-center gap-1 rounded border border-gray-600 p-2 text-xs hover:bg-gray-800"
                  href={selected.explorer_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3 w-3" /> Open explorer
                </a>
              </div>
            </>
          ) : (
            <p className="text-gray-500">Click a node to inspect it.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `src/App.tsx`**

Add a lazy import near the other `dfir` lazy imports (e.g. by the `IocCheck`/`Domain` group):

```ts
const Tracer = lazy(() => import('./pages/dfir/Tracer'));
```

Add an entry to the `ROUTES` array (near the other `/dfir/*` entries):

```ts
  { path: '/dfir/tracer', Component: Tracer },
```

- [ ] **Step 3: Add the tool card in `src/components/dfir/tool-sections.ts`**

Find the existing `crypto-trace` entry (it uses `icon: Coins`) and add directly after it, in the same section array:

```ts
  {
    path: '/dfir/tracer',
    useCase: 'Trace fund flows hop-by-hop and map an actor’s on-chain footprint.',
    label: 'Fund-Flow Tracer',
    desc: 'EVM + BTC + Tron · interactive graph · labels · risk score · time-tolerance · analyst-confirm hops',
    icon: Coins,
  },
```

(`Coins` is already imported in this file for the crypto-trace entry — no new import needed.)

- [ ] **Step 4: Typecheck + build + commit**

```bash
npx tsc -p tsconfig.json
git add src/pages/dfir/Tracer.tsx src/App.tsx src/components/dfir/tool-sections.ts
git commit -m "feat(tracer): /dfir/tracer page + route + tool card"
```

- [ ] **Step 5: Manual smoke (optional, before deploy)**

Run the frontend dev server and the API locally; navigate to `/dfir/tracer`, seed `0x28C6c06298d514Db089934071355E5743Bf21d60` on EVM, confirm a root node renders with an "exchange / low" label and (if Blockscout returns transfers) counterparty nodes you can click to expand. Confirm a hop and verify the edge label gains a ✓.

---

## Deploy (after all tasks pass)

1. Rebase the feature branch onto `origin/main` (main moves fast): `git fetch origin && git rebase origin/main`.
2. Re-run all three typechecks + the new tests.
3. Deploy from the **repo root** (Worker `pranithjain`): `npm run deploy`. Do **not** deploy from `api/`.
4. No D1 migration in Phase A — nothing to apply remotely.

---

## Self-Review (completed during planning)

**Spec coverage (Phase A scope):**

- Multi-chain EVM+BTC+Tron expansion → Tasks 2–4. ✓
- Time-tolerance filter → Task 1 (`applyFilter`) + Task 8 (`around`/`toleranceMin` → window). ✓
- Risk score per node → Task 6 + wired in Task 8 `buildNode`. ✓
- Analyst-confirm hops → server emits `confidence:'candidate'` (Task 8); client `confirmEdge` + UI (Tasks 10–11). ✓
- Labels (seed + Blockscout root enrichment) → Tasks 5, 8. ✓
- Interactive graph reusing the existing canvas → Tasks 9–11. ✓
- Subrequest-budget safety (sets loaded once, root-only Blockscout, one chain/hop) → Tasks 7, 8. ✓
- Public-read, no admin gate → Task 8 Step 5. ✓
- Tests + 3× typecheck + deploy-from-root → throughout + Deploy section. ✓
- **Deferred (documented, not gaps):** Solana expansion, D1 `address_labels`/`tracer_graphs`, save/export, user labels, BTC clustering, auto-path-to-CEX, calldata/TxDataHiding inspector, OSINT pivot, monitoring → Phases B–E.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `TracerChain` ('evm'|'btc'|'tron') used uniformly; `Transfer`/`FetchResult`/`TransferFilter` defined in Task 1 and consumed in Tasks 2–4, 8; `LabelCategory`/`AddressLabel` defined in Task 5 and consumed by Task 6 (`RiskInput.labelCategory`) and Task 8; `TracerNode`/`TracerEdge`/`ExpandResponse` defined server-side in Task 8 and mirrored client-side in Task 10; `crypto_{low,medium,high,critical}` node types defined in Task 9 and produced by `riskToNodeType` in Task 10. `scoreAddress`, `resolveSeedLabel`, `applyFilter`, `fetchTransfers`, `loadSanctionedSet`, `mergeExpand`, `toGraphResponse`, `confirmEdge` names are consistent across definition and call sites.

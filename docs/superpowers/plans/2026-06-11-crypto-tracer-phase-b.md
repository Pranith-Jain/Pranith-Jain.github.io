# Crypto Fund-Flow Tracer — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add attribution depth + actor-tracing intel to the Phase A tracer: a calldata/TxDataHiding inspector, a persistent D1 address-label store with admin add, "find the cash-out" auto-pathing, and BTC common-input clustering.

**Architecture:** All four pieces reuse Phase A primitives. Network stays within the ≤50-subrequest budget (calldata inspector spends ≤3; everything else is D1 queries or pure/client-side). D1 tables use the repo's **runtime ensure pattern** (`CREATE TABLE IF NOT EXISTS`, like `investigations.ts`/`threat-graph.ts`) — **no migration file** — so the test D1 and prod both get the schema with no separate apply step.

**Tech Stack:** Cloudflare Workers + Hono + Zod, TypeScript, vitest (`cloudflare:test` for routes/D1, root vitest for frontend), React + `@xyflow/react`.

**Spec:** `docs/superpowers/specs/2026-06-11-crypto-tracer-phase-b-design.md`
**Base branch:** `feat/crypto-tracer-phaseA` (Phase A complete here; Phase A is NOT in origin/main, so build ON this branch).

---

## Conventions for the implementing engineer (read once)

- **Branch:** the repo has aggressive branch automation. Run `git branch --show-current` immediately before each `git commit` and commit on whatever branch is checked out. Do **NOT** create your own branch, do **NOT** `git stash`. Only `git add` the files each task names.
- **api tests:** `cd api && npm test -- <pattern>` — invoke the Bash tool with `dangerouslyDisableSandbox: true` (vitest-pool-workers needs it; CI skips `test/routes/`).
- **frontend tests:** from repo root, `npx vitest run <path>`.
- **typecheck:** `npx tsc -p api/tsconfig.json --noEmit` (api), `npx tsc -p tsconfig.json --noEmit` (frontend). ALWAYS `--noEmit` (the api config emits `.js` otherwise — delete any stray `.js` under `api/src` if it appears). Ignore ONLY pre-existing errors under `src/components/dfir/osint/` or `src/lib/dfir/osint/` (a parallel work stream); any other error is yours.
- **Route auth:** `/api/v1/*` reads are public via the `OPEN_PUBLIC_READS` valve in tests, but it opens GET/HEAD only — **POSTs in route tests must be signed with `withTestApiKey()`** from `api/test/test-helpers.ts`. Admin-gated routes need an admin token; see how existing admin route tests authenticate.
- **validate() schemas must mirror the handler's reads.**

---

## File Structure

**New:**

- `api/src/lib/calldata-analysis.ts` — pure `analyzeCalldata()` (no I/O).
- `api/src/lib/tx-fetch.ts` — `fetchEvmTx()`, `fetchTronTx()` (network, never throws).
- `api/test/lib/calldata-analysis.test.ts`.

**Modified:**

- `api/src/lib/address-labels.ts` — add `ensureAddressLabelsTable`, `loadLabelsForAddresses`, `insertUserLabel`, `LABEL_CATEGORIES`.
- `api/src/lib/chain-sources/btc.ts` — add `clusterCommonInputs` + `CoInputCluster`.
- `api/src/lib/validation-schemas.ts` — add `tracerCalldataSchema`, `tracerLabelAddSchema`.
- `api/src/routes/tracer.ts` — D1 labels in expand; `cluster` on BTC expand; `tracerCalldataHandler`; `tracerLabelAddHandler`.
- `api/src/index.ts` — register the two new routes + admin-gate `/api/v1/tracer/labels`.
- `src/lib/dfir/tracer-graph.ts` — add `findPathToCategory`; add optional `cluster` to client `ExpandResponse`.
- `src/pages/dfir/Tracer.tsx` — calldata inspect panel, add-label affordance, find-cash-out button, cluster display.
- test extensions: `api/test/routes/tracer.test.ts`, `api/test/lib/chain-sources/btc.test.ts`, `src/lib/dfir/tracer-graph.test.ts`.

---

# Part 1 — D1 address-label store + user-add (§2)

### Task 1: D1 label helpers in `address-labels.ts`

**Files:** Modify `api/src/lib/address-labels.ts`

- [ ] **Step 1: Add the D1 helpers** (append to the file; keep `resolveSeedLabel` unchanged)

```ts
import type { D1Database } from '@cloudflare/workers-types';

/** Allowed categories for user-added labels (mirrors LabelCategory minus 'unknown'). */
export const LABEL_CATEGORIES: LabelCategory[] = [
  'exchange',
  'mixer',
  'bridge',
  'defi',
  'contract',
  'ransomware',
  'scammer',
  'sanctioned',
  'wallet',
];

const LABELS_DDL = `CREATE TABLE IF NOT EXISTS address_labels (
  address    TEXT NOT NULL,
  chain      TEXT NOT NULL,
  label      TEXT NOT NULL,
  category   TEXT NOT NULL,
  source     TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 80,
  created_at TEXT NOT NULL,
  PRIMARY KEY (address, chain)
);`;

/** Runtime table creation (repo convention — see investigations.ts/threat-graph.ts). */
export async function ensureAddressLabelsTable(db: D1Database): Promise<void> {
  await db.prepare(LABELS_DDL).run();
}

function labelKey(chain: TracerChain, address: string): string {
  return chain === 'evm' ? address.toLowerCase() : address;
}

/**
 * Batched read: one `SELECT ... WHERE address IN (...)` for all queried addresses.
 * Returns a Map keyed the same way resolveSeedLabel keys (EVM lowercased).
 * Tolerant of a missing table / unbound db → returns an empty Map (never throws).
 */
export async function loadLabelsForAddresses(
  db: D1Database | undefined,
  chain: TracerChain,
  addresses: string[]
): Promise<Map<string, AddressLabel>> {
  const out = new Map<string, AddressLabel>();
  if (!db || addresses.length === 0) return out;
  const keys = [...new Set(addresses.map((a) => labelKey(chain, a)))];
  const placeholders = keys.map(() => '?').join(',');
  try {
    const res = await db
      .prepare(
        `SELECT address, label, category, source, confidence FROM address_labels WHERE chain = ? AND address IN (${placeholders})`
      )
      .bind(chain, ...keys)
      .all();
    for (const row of (res.results ?? []) as Array<{
      address: string;
      label: string;
      category: string;
      source: string;
      confidence: number;
    }>) {
      out.set(row.address, {
        label: row.label,
        category: row.category as LabelCategory,
        source: row.source as AddressLabel['source'],
        confidence: row.confidence,
      });
    }
  } catch {
    /* table missing or db error — fall back to empty (seed labels still apply) */
  }
  return out;
}

/** Insert/replace a user label. Caller ensures admin auth. Returns the stored label. */
export async function insertUserLabel(
  db: D1Database,
  chain: TracerChain,
  address: string,
  label: string,
  category: LabelCategory,
  nowIso: string
): Promise<AddressLabel> {
  await ensureAddressLabelsTable(db);
  const key = labelKey(chain, address);
  await db
    .prepare(
      `INSERT OR REPLACE INTO address_labels (address, chain, label, category, source, confidence, created_at) VALUES (?, ?, ?, ?, 'user', 90, ?)`
    )
    .bind(key, chain, label, category, nowIso)
    .run();
  return { label, category, source: 'user', confidence: 90 };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p api/tsconfig.json --noEmit`
Expected: no new errors. (`AddressLabel`, `LabelCategory`, `TracerChain` are already imported/defined in this file.)

- [ ] **Step 3: Commit**

```bash
git add api/src/lib/address-labels.ts
git commit -m "feat(tracer): D1 address-label store helpers (ensure/load/insert)"
```

(No standalone unit test — these need a real D1 and are exercised by the route test in Task 3.)

---

### Task 2: Wire batched D1 labels into the expand handler

**Files:** Modify `api/src/routes/tracer.ts`

The current handler builds the root node, then iterates transfers building counterparty nodes — labeling each via `resolveSeedLabel` inside `buildNode`. Change it to load D1 labels for all addresses in ONE query and pass them as overrides (precedence: **D1 → seed → (EVM root) Blockscout**).

- [ ] **Step 1: Add the import**

At the top, extend the address-labels import:

```ts
import { resolveSeedLabel, loadLabelsForAddresses, type AddressLabel, type LabelCategory } from '../lib/address-labels';
```

- [ ] **Step 2: Reorder the handler to fetch transfers first, then batch-load labels, then build nodes**

Replace the body of `tracerExpandHandler` FROM the line `const [sanctionedSet, scamSet] = await Promise.all([` THROUGH the end of the transfer loop (i.e. replace the current lines 108–160) with:

```ts
const [sanctionedSet, scamSet] = await Promise.all([
  loadSanctionedSet(OFAC_CHAINS[chain]),
  chain === 'evm' ? loadScamSnifferSet() : Promise.resolve(new Set<string>()),
]);

const direction = input.direction ?? 'both';
const { transfers, truncated } = await fetchTransfers(chain, address, filter, scamSet);

// Collect every address we will render, then load all D1 labels in ONE query.
const allAddresses = [address, ...transfers.map((t) => t.counterparty)];
const dbLabels = await loadLabelsForAddresses(c.env.BRIEFINGS_DB, chain, allAddresses);
const dbLabelFor = (addr: string): AddressLabel | null =>
  dbLabels.get(chain === 'evm' ? addr.toLowerCase() : addr) ?? null;

// Root label precedence: D1 → seed → (EVM only) Blockscout/ENS.
let rootOverride: AddressLabel | null = dbLabelFor(address) ?? resolveSeedLabel(address, chain);
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

const nodes: TracerNode[] = [root];
const edges: TracerEdge[] = [];
const seen = new Set<string>([root.id]);

for (const t of transfers) {
  // 'self' transfers are kept under any direction filter — they render as a self-loop on the root (counterparty === root address).
  if (direction !== 'both' && t.direction !== direction && t.direction !== 'self') continue;
  const cpId = nodeId(chain, t.counterparty);
  if (!seen.has(cpId)) {
    seen.add(cpId);
    // Counterparty label precedence: D1 → seed (buildNode falls back to seed when override is null).
    nodes.push(buildNode(chain, t.counterparty, false, sanctionedSet, scamSet, dbLabelFor(t.counterparty)));
  }
  const source = t.direction === 'out' ? root.id : cpId;
  const target = t.direction === 'out' ? cpId : root.id;
  // Edge id is tx-grained (one edge per tx per counterparty); multi-transfer txs to the same counterparty intentionally collapse to one edge.
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
```

(The `filter` block above line 108 and the `body`/return below line 160 stay unchanged. Note `buildNode` already accepts the `override` param and does `override ?? resolveSeedLabel(...)`, so passing `dbLabelFor(...)` gives D1→seed precedence for counterparties automatically.)

- [ ] **Step 2b: Remove the now-duplicated old root-override block.** The original lines 113–132 (the old `let rootOverride` + `const root` + `const direction` + `fetchTransfers`) are now replaced by the block above. Ensure there is exactly ONE `const root =`, ONE `const direction =`, ONE `fetchTransfers` call. Read the function after editing to confirm no duplication.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p api/tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the existing route test (must still pass)**

Run: `cd api && npm test -- routes/tracer` (Bash `dangerouslyDisableSandbox: true`)
Expected: the existing 4 tests still PASS (D1 is empty so behavior is unchanged — curated seed still labels Binance/Tornado).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/tracer.ts
git commit -m "feat(tracer): batched D1 label lookup in expand (D1→seed→blockscout)"
```

---

### Task 3: Admin label-add route + schema + registration

**Files:** Modify `api/src/lib/validation-schemas.ts`, `api/src/routes/tracer.ts`, `api/src/index.ts`; Test `api/test/routes/tracer.test.ts`

- [ ] **Step 1: Add the Zod schema** (in validation-schemas.ts, after `tracerLabelSchema`)

```ts
export const tracerLabelAddSchema = z.object({
  address: z.string().min(1, 'address is required').max(200, 'address too long'),
  chain: z.enum(['evm', 'btc', 'tron']),
  label: z.string().min(1, 'label is required').max(80, 'label too long'),
  category: z.enum([
    'exchange',
    'mixer',
    'bridge',
    'defi',
    'contract',
    'ransomware',
    'scammer',
    'sanctioned',
    'wallet',
  ]),
});
export type TracerLabelAddInput = z.infer<typeof tracerLabelAddSchema>;
```

- [ ] **Step 2: Add the handler** (in tracer.ts, after `tracerLabelHandler`)

```ts
import { insertUserLabel } from '../lib/address-labels';
import type { TracerLabelAddInput } from '../lib/validation-schemas';

export async function tracerLabelAddHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerLabelAddInput }).parsed;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'label store unavailable' }, 503);
  const stored = await insertUserLabel(
    db,
    input.chain,
    input.address,
    input.label,
    input.category,
    new Date().toISOString()
  );
  return c.json({ ok: true, address: input.address, chain: input.chain, label: stored }, 201);
}
```

(Add `insertUserLabel` to the existing `../lib/address-labels` import rather than a second import line if you prefer; either compiles.)

- [ ] **Step 3: Register + admin-gate** (in index.ts)

Add the handler to the tracer import:

```ts
import { tracerExpandHandler, tracerLabelHandler, tracerCalldataHandler, tracerLabelAddHandler } from './routes/tracer';
```

(`tracerCalldataHandler` is added in Task 6 — if you implement Part 1 before Part 2, import only what exists and add `tracerCalldataHandler` in Task 6. To avoid a tsc break now, import just `tracerLabelAddHandler` here and the calldata one in Task 6.)

Add the schema import: extend the existing validation-schemas import with `tracerLabelAddSchema`.

Admin-gate the specific subpath — add NEAR the other targeted `app.use(..., requireAdminMiddleware)` lines (around index.ts:448-452), BEFORE the route registration:

```ts
app.use('/api/v1/tracer/labels', requireAdminMiddleware);
```

Register the route next to the other tracer routes:

```ts
app.post('/api/v1/tracer/labels', validate('json', tracerLabelAddSchema), tracerLabelAddHandler);
```

- [ ] **Step 4: Write the route test** (append to `api/test/routes/tracer.test.ts`)

```ts
import { withTestApiKey } from '../test-helpers';

describe('POST /api/v1/tracer/labels (admin)', () => {
  it('401s without an admin token', async () => {
    const r = await SELF.fetch('https://x/api/v1/tracer/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xabc0000000000000000000000000000000000001',
        chain: 'evm',
        label: 'Test Exch',
        category: 'exchange',
      }),
    });
    expect(r.status).toBe(401);
  });

  it('inserts a label with admin token and expand reflects it', async () => {
    const addr = '0xabc0000000000000000000000000000000000002';
    const add = await SELF.fetch(
      'https://x/api/v1/tracer/labels',
      withTestApiKey(
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: addr, chain: 'evm', label: 'My Tagged Mixer', category: 'mixer' }),
        },
        { admin: true }
      )
    );
    expect(add.status).toBe(201);

    const exp = await SELF.fetch(
      'https://x/api/v1/tracer/expand',
      withTestApiKey({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, chain: 'evm' }),
      })
    );
    expect(exp.status).toBe(200);
    const body = (await exp.json()) as { root: { label: string | null; category: string; risk: { level: string } } };
    expect(body.root.label).toBe('My Tagged Mixer');
    expect(body.root.category).toBe('mixer');
    expect(body.root.risk.level).toBe('critical'); // mixer → critical via risk-score
  });
});
```

IMPORTANT: open `api/test/test-helpers.ts` first and confirm `withTestApiKey`'s exact signature and how it conveys "admin" (e.g. an `{admin:true}` option, or a separate `withTestAdminKey` helper). Adjust the test calls to match the real helper. If a distinct admin helper exists, use it. Report what you found.

- [ ] **Step 5: Run the test**

Run: `cd api && npm test -- routes/tracer` (Bash `dangerouslyDisableSandbox: true`)
Expected: all tracer route tests PASS (the original 4 + 2 new). The insert→expand round-trip proves the D1 store + batched read + risk scoring.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json --noEmit
git add api/src/lib/validation-schemas.ts api/src/routes/tracer.ts api/src/index.ts api/test/routes/tracer.test.ts
git commit -m "feat(tracer): admin POST /tracer/labels + D1 round-trip test"
```

---

# Part 2 — Calldata / TxDataHiding inspector (§1)

### Task 4: `analyzeCalldata` pure analyzer

**Files:** Create `api/src/lib/calldata-analysis.ts`, `api/test/lib/calldata-analysis.test.ts`

- [ ] **Step 1: Write the failing test**

`api/test/lib/calldata-analysis.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { analyzeCalldata } from '../../src/lib/calldata-analysis';

// ERC-20 transfer(to, amount): selector + 32-byte addr (12 zero bytes + 20) + small amount.
const TRANSFER =
  '0xa9059cbb' +
  '000000000000000000000000abcabcabcabcabcabcabcabcabcabcabcabcabca' + // to (address-shaped, 20 nonzero bytes)
  '0000000000000000000000000000000000000000000000000de0b6b3a7640000'; // 1e18 (small, many zero bytes)

// selector + one full-entropy 32-byte word (32 nonzero bytes → tx-hash-looking pointer).
const WITH_POINTER = '0x12345678' + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// selector + a long run of printable ASCII ("AAAA..." = 0x41) → embedded text.
const WITH_ASCII = '0x12345678' + '41'.repeat(40);

describe('analyzeCalldata', () => {
  it('recognises a plain transfer as clean with no pointers', () => {
    const r = analyzeCalldata(TRANSFER);
    expect(r.selector).toBe('0xa9059cbb');
    expect(r.known_method).toBe('transfer');
    expect(r.embedded_pointers).toHaveLength(0);
    expect(r.verdict).toBe('clean');
  });

  it('flags an embedded tx-hash-looking pointer as data-hiding', () => {
    const r = analyzeCalldata(WITH_POINTER);
    expect(r.embedded_pointers).toHaveLength(1);
    expect(r.embedded_pointers[0].value).toBe('0x' + 'aa'.repeat(32));
    expect(r.embedded_pointers[0].offset).toBe(4); // bytes, after the 4-byte selector
    expect(r.verdict).toBe('data-hiding');
  });

  it('flags an embedded ASCII payload as data-hiding', () => {
    const r = analyzeCalldata(WITH_ASCII);
    expect(r.flags.some((f) => /ascii|text/i.test(f))).toBe(true);
    expect(r.verdict).toBe('data-hiding');
  });

  it('handles empty / too-short input', () => {
    expect(analyzeCalldata('0x').selector).toBeNull();
    expect(analyzeCalldata('0x').verdict).toBe('clean');
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd api && npm test -- lib/calldata-analysis` (Bash `dangerouslyDisableSandbox: true`)
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`api/src/lib/calldata-analysis.ts`:

```ts
export interface EmbeddedPointer {
  value: string; // '0x' + 64 hex
  offset: number; // byte offset within the calldata
}

export interface CalldataAnalysis {
  selector: string | null;
  known_method: string | null;
  input_size: number; // bytes
  flags: string[];
  embedded_pointers: EmbeddedPointer[];
  verdict: 'clean' | 'suspicious' | 'data-hiding';
}

const KNOWN_SELECTORS: Record<string, string> = {
  '0xa9059cbb': 'transfer',
  '0x095ea7b3': 'approve',
  '0x23b872dd': 'transferFrom',
  '0xa22cb465': 'setApprovalForAll',
  '0xac9650d8': 'multicall',
  '0x38ed1739': 'swapExactTokensForTokens',
};

// transfer/approve/transferFrom are all 4 + 32 + 32 = 68 bytes (transferFrom is 100).
const EXPECTED_SIZE: Record<string, number> = {
  transfer: 68,
  approve: 68,
  transferFrom: 100,
  setApprovalForAll: 68,
};

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

export function analyzeCalldata(input: string): CalldataAnalysis {
  const hex = input.replace(/^0x/i, '').toLowerCase();
  const bytes = hexToBytes(hex);
  const size = bytes.length;
  const flags: string[] = [];
  const embedded_pointers: EmbeddedPointer[] = [];

  if (size < 4) {
    return { selector: null, known_method: null, input_size: size, flags, embedded_pointers, verdict: 'clean' };
  }

  const selector = '0x' + hex.slice(0, 8);
  const known_method = KNOWN_SELECTORS[selector] ?? null;

  // Scan 32-byte words after the selector for "tx-hash-looking" values
  // (>=28 of 32 bytes non-zero distinguishes a hash from an address/small uint).
  for (let off = 4; off + 32 <= size; off += 32) {
    const word = bytes.slice(off, off + 32);
    const nonZero = word.filter((b) => b !== 0).length;
    if (nonZero >= 28) {
      embedded_pointers.push({ value: '0x' + hex.slice(off * 2, off * 2 + 64), offset: off });
    }
  }

  // Oversized-for-method.
  if (known_method && EXPECTED_SIZE[known_method] !== undefined && size > EXPECTED_SIZE[known_method] + 4) {
    flags.push(`input larger than ${known_method}'s ABI footprint`);
  }

  // High-entropy payload after the selector.
  const payload = bytes.slice(4);
  if (payload.length >= 64) {
    const nz = payload.filter((b) => b !== 0).length / payload.length;
    if (nz > 0.6) flags.push('high-entropy payload after selector');
  }

  // Embedded printable-ASCII run (>=8 consecutive 0x20–0x7e bytes).
  let run = 0;
  let maxRun = 0;
  for (const b of payload) {
    if (b >= 0x20 && b <= 0x7e) {
      run += 1;
      if (run > maxRun) maxRun = run;
    } else run = 0;
  }
  if (maxRun >= 8) flags.push('embedded ASCII text');

  if (embedded_pointers.length > 0) flags.push('embedded tx-hash-looking pointer(s)');

  const hasHidingSignal = embedded_pointers.length > 0 || flags.includes('embedded ASCII text');
  const hasSuspicious = flags.some((f) => /larger than|high-entropy/.test(f));
  const verdict: CalldataAnalysis['verdict'] = hasHidingSignal ? 'data-hiding' : hasSuspicious ? 'suspicious' : 'clean';

  return { selector, known_method, input_size: size, flags, embedded_pointers, verdict };
}
```

- [ ] **Step 4: Run → PASS**

Run: `cd api && npm test -- lib/calldata-analysis`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json --noEmit
git add api/src/lib/calldata-analysis.ts api/test/lib/calldata-analysis.test.ts
git commit -m "feat(tracer): pure calldata/TxDataHiding analyzer"
```

---

### Task 5: `tx-fetch.ts` (EVM + Tron tx retrieval)

**Files:** Create `api/src/lib/tx-fetch.ts`

(No standalone unit test — network module; exercised by the route test in Task 6.)

- [ ] **Step 1: Implement**

`api/src/lib/tx-fetch.ts`:

```ts
const FETCH_TIMEOUT = 10_000;

export interface FetchedTx {
  found: boolean;
  chain: string;
  input: string; // '0x…' calldata, '' if none/not found
  from?: string;
  to?: string;
}

/** Public-RPC sets per logical chain (mirrors crypto-trace.ts). */
export const EVM_RPCS: Record<string, string[]> = {
  eth: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'],
  bsc: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org'],
};

interface RpcTx {
  input?: string;
  from?: string;
  to?: string;
}

async function rpcGetTx(rpc: string, hash: string): Promise<RpcTx | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [hash] }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { result?: RpcTx | null } | null;
    return j?.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Try each RPC in `rpcs` until one returns the tx. Never throws. */
export async function fetchEvmTx(hash: string, rpcs: string[]): Promise<FetchedTx> {
  for (const rpc of rpcs) {
    const tx = await rpcGetTx(rpc, hash);
    if (tx) return { found: true, chain: 'evm', input: tx.input ?? '', from: tx.from, to: tx.to ?? undefined };
  }
  return { found: false, chain: 'evm', input: '' };
}

interface TronTxRaw {
  raw_data?: {
    contract?: Array<{ parameter?: { value?: { data?: string; owner_address?: string; contract_address?: string } } }>;
  };
}

/** TronGrid tx lookup. Calldata lives in contract[0].parameter.value.data. Never throws. */
export async function fetchTronTx(hash: string): Promise<FetchedTx> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch('https://api.trongrid.io/wallet/gettransactionbyid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ value: hash }),
      signal: ctrl.signal,
    });
    if (!r.ok) return { found: false, chain: 'tron', input: '' };
    const j = (await r.json().catch(() => null)) as TronTxRaw | null;
    const contract = j?.raw_data?.contract?.[0]?.parameter?.value;
    if (!contract) return { found: false, chain: 'tron', input: '' };
    return {
      found: true,
      chain: 'tron',
      input: contract.data ? '0x' + contract.data : '',
      from: contract.owner_address,
      to: contract.contract_address,
    };
  } catch {
    return { found: false, chain: 'tron', input: '' };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json --noEmit
git add api/src/lib/tx-fetch.ts
git commit -m "feat(tracer): tx-fetch (EVM eth_getTransactionByHash + TronGrid)"
```

---

### Task 6: `/tracer/calldata` route (fetch → analyze → follow one pointer)

**Files:** Modify `api/src/lib/validation-schemas.ts`, `api/src/routes/tracer.ts`, `api/src/index.ts`; Test `api/test/routes/tracer.test.ts`

- [ ] **Step 1: Add the Zod schema** (validation-schemas.ts, after `tracerLabelAddSchema`)

```ts
export const tracerCalldataSchema = z.object({
  chain: z.enum(['evm', 'tron']),
  hash: z.string().min(1, 'hash is required').max(80, 'hash too long'),
});
export type TracerCalldataInput = z.infer<typeof tracerCalldataSchema>;
```

- [ ] **Step 2: Add the handler** (tracer.ts)

Add imports:

```ts
import { analyzeCalldata } from '../lib/calldata-analysis';
import { fetchEvmTx, fetchTronTx, EVM_RPCS, type FetchedTx } from '../lib/tx-fetch';
import type { TracerCalldataInput } from '../lib/validation-schemas';
```

Handler:

```ts
export async function tracerCalldataHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerCalldataInput }).parsed;
  const { chain, hash } = input;

  const tx: FetchedTx = chain === 'tron' ? await fetchTronTx(hash) : await fetchEvmTx(hash, EVM_RPCS.eth);

  if (!tx.found) {
    return c.json(
      {
        chain,
        hash,
        analysis: {
          selector: null,
          known_method: null,
          input_size: 0,
          flags: ['tx not found'],
          embedded_pointers: [],
          verdict: 'clean',
        },
      },
      200,
      { 'Cache-Control': 'public, max-age=60' }
    );
  }

  const analysis = analyzeCalldata(tx.input);

  // Follow ONE embedded pointer across the other candidate EVM chains (the TRON→BSC dead-drop).
  let resolved_pointer: { value: string; chain: string; found: boolean; input_excerpt: string } | undefined;
  if (analysis.embedded_pointers.length > 0) {
    const ptr = analysis.embedded_pointers[0].value;
    for (const cand of ['bsc', 'eth'] as const) {
      const hit = await fetchEvmTx(ptr, EVM_RPCS[cand]);
      if (hit.found) {
        resolved_pointer = { value: ptr, chain: cand, found: true, input_excerpt: hit.input.slice(0, 200) };
        break;
      }
    }
    if (!resolved_pointer) resolved_pointer = { value: ptr, chain: 'unknown', found: false, input_excerpt: '' };
  }

  return c.json(
    { chain, hash, from: tx.from, to: tx.to, analysis, ...(resolved_pointer ? { resolved_pointer } : {}) },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}
```

- [ ] **Step 3: Register** (index.ts) — add `tracerCalldataHandler` to the tracer import and `tracerCalldataSchema` to the validation-schemas import, then register (public-read, GET):

```ts
app.get('/api/v1/tracer/calldata', validate('query', tracerCalldataSchema), tracerCalldataHandler);
```

- [ ] **Step 4: Add the route test** (append to `api/test/routes/tracer.test.ts`)

```ts
describe('GET /api/v1/tracer/calldata', () => {
  it('400s on missing hash', async () => {
    const r = await SELF.fetch('https://x/api/v1/tracer/calldata?chain=evm');
    expect(r.status).toBe(400);
  });

  it('returns an analysis envelope for a lookup (clean when tx not found)', async () => {
    const r = await SELF.fetch('https://x/api/v1/tracer/calldata?chain=evm&hash=0xdeadbeef');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { analysis: { verdict: string; flags: string[] } };
    expect(typeof body.analysis.verdict).toBe('string');
    expect(Array.isArray(body.analysis.flags)).toBe(true);
  });
});
```

(The analyzer is unit-tested in Task 4; this test only proves the route is wired, validates input, and returns the envelope without hitting a flaky live tx.)

- [ ] **Step 5: Run + typecheck + commit**

```bash
cd api && npm test -- routes/tracer    # all pass (run with dangerouslyDisableSandbox)
cd .. && npx tsc -p api/tsconfig.json --noEmit
git add api/src/lib/validation-schemas.ts api/src/routes/tracer.ts api/src/index.ts api/test/routes/tracer.test.ts
git commit -m "feat(tracer): GET /tracer/calldata — fetch, analyze, follow one cross-chain pointer"
```

---

### Task 7: Calldata UI in `Tracer.tsx`

**Files:** Modify `src/pages/dfir/Tracer.tsx`

(Frontend; verified by typecheck + manual smoke. No new unit test.)

- [ ] **Step 1: Add calldata state + fetch + render**

In `Tracer.tsx`, add state near the other `useState` hooks:

```tsx
const [calldata, setCalldata] = useState<null | {
  hash: string;
  analysis: {
    selector: string | null;
    known_method: string | null;
    input_size: number;
    flags: string[];
    embedded_pointers: { value: string; offset: number }[];
    verdict: string;
  };
  resolved_pointer?: { value: string; chain: string; found: boolean; input_excerpt: string };
}>(null);
const [calldataLoading, setCalldataLoading] = useState(false);

const inspectCalldata = useCallback(async (txHash: string, forChain: TracerChain) => {
  if (forChain === 'btc') return; // calldata is EVM/Tron only
  setCalldataLoading(true);
  setCalldata(null);
  try {
    const res = await fetch(`/api/v1/tracer/calldata?chain=${forChain}&hash=${encodeURIComponent(txHash)}`);
    if (res.ok) setCalldata((await res.json()) as never);
  } finally {
    setCalldataLoading(false);
  }
}, []);
```

- [ ] **Step 2: Add an "Inspect calldata" affordance + panel**

In the detail panel, when a node is `selected`, render (below the existing actions) a section listing the selected node's incident edges with an inspect button, plus the result panel. Add inside the `selected ? (...)` block, after the existing action buttons `</div>`:

```tsx
{
  graph ? (
    <div className="border-t border-gray-700 pt-2">
      <span className="text-gray-400">Transactions</span>
      <ul className="mt-1 space-y-1">
        {[...graph.edges.values()]
          .filter((e) => e.source === selected.id || e.target === selected.id)
          .slice(0, 6)
          .map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[10px] text-gray-400">{e.tx_hash.slice(0, 14)}…</span>
              <button
                className="rounded border border-gray-600 px-1 text-[10px] hover:bg-gray-800 disabled:opacity-40"
                disabled={selected.chain === 'btc' || calldataLoading}
                onClick={() => void inspectCalldata(e.tx_hash, selected.chain)}
              >
                Inspect calldata
              </button>
            </li>
          ))}
      </ul>
    </div>
  ) : null;
}
{
  calldataLoading ? <p className="text-xs text-gray-500">Analyzing calldata…</p> : null;
}
{
  calldata ? (
    <div className="rounded border border-gray-700 p-2 text-xs">
      <div>
        Verdict:{' '}
        <span
          className={
            calldata.analysis.verdict === 'data-hiding'
              ? 'font-semibold text-red-400'
              : calldata.analysis.verdict === 'suspicious'
                ? 'font-semibold text-amber-400'
                : 'text-emerald-400'
          }
        >
          {calldata.analysis.verdict}
        </span>
      </div>
      <div className="text-gray-400">
        {calldata.analysis.known_method ?? calldata.analysis.selector ?? 'no selector'} · {calldata.analysis.input_size}
        B
      </div>
      {calldata.analysis.flags.length ? (
        <ul className="list-inside list-disc text-gray-400">
          {calldata.analysis.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      {calldata.resolved_pointer ? (
        <div className="mt-1 border-t border-gray-700 pt-1">
          Cross-chain pointer →{' '}
          {calldata.resolved_pointer.found ? `${calldata.resolved_pointer.chain} (resolved)` : 'unresolved'}
          <div className="break-all font-mono text-[10px] text-gray-500">{calldata.resolved_pointer.value}</div>
        </div>
      ) : null}
    </div>
  ) : null;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add src/pages/dfir/Tracer.tsx
git commit -m "feat(tracer): calldata inspector UI panel"
```

---

# Part 3 — BTC common-input clustering (§4)

### Task 8: `clusterCommonInputs` + surface on BTC expand

**Files:** Modify `api/src/lib/chain-sources/btc.ts`, `api/src/routes/tracer.ts`, `src/lib/dfir/tracer-graph.ts`; Test `api/test/lib/chain-sources/btc.test.ts`

- [ ] **Step 1: Write the failing test** (append to `api/test/lib/chain-sources/btc.test.ts`)

```ts
import { clusterCommonInputs } from '../../../src/lib/chain-sources/btc';

describe('clusterCommonInputs', () => {
  const ADDR = 'bc1qself';
  const txs = [
    {
      txid: 'a',
      status: { confirmed: true },
      vin: [
        { prevout: { scriptpubkey_address: ADDR, value: 1 } },
        { prevout: { scriptpubkey_address: 'bc1qco1', value: 1 } },
      ],
      vout: [],
    },
    {
      txid: 'b',
      status: { confirmed: true },
      vin: [
        { prevout: { scriptpubkey_address: ADDR, value: 1 } },
        { prevout: { scriptpubkey_address: 'bc1qco1', value: 1 } },
        { prevout: { scriptpubkey_address: 'bc1qco2', value: 1 } },
      ],
      vout: [],
    },
    {
      txid: 'c',
      status: { confirmed: true },
      vin: [{ prevout: { scriptpubkey_address: 'bc1qother', value: 1 } }],
      vout: [],
    }, // ADDR not an input → ignored
  ];
  it('aggregates co-input addresses by shared tx count, excluding self', () => {
    const out = clusterCommonInputs(txs as never, ADDR);
    const co1 = out.find((c) => c.address === 'bc1qco1')!;
    expect(co1.shared_tx_count).toBe(2);
    expect(out.find((c) => c.address === 'bc1qco2')!.shared_tx_count).toBe(1);
    expect(out.find((c) => c.address === ADDR)).toBeUndefined();
    expect(out.find((c) => c.address === 'bc1qother')).toBeUndefined();
    expect(out[0].address).toBe('bc1qco1'); // sorted desc by shared_tx_count
  });
});
```

- [ ] **Step 2: Run → FAIL** — `cd api && npm test -- lib/chain-sources/btc` (dangerouslyDisableSandbox). Expected: FAIL (clusterCommonInputs not found).

- [ ] **Step 3: Implement** (append to `api/src/lib/chain-sources/btc.ts`)

```ts
export interface CoInputCluster {
  address: string;
  shared_tx_count: number;
}

/**
 * Common-input-ownership heuristic: addresses co-spent as inputs alongside
 * `address` in the same tx are inferred same-owner. Aggregated by co-input
 * address, sorted desc, capped at 20. Pure (no network).
 */
export function clusterCommonInputs(txs: EsploraTx[], address: string): CoInputCluster[] {
  const counts = new Map<string, number>();
  for (const tx of txs) {
    const inputs = tx.vin.map((v) => v.prevout?.scriptpubkey_address).filter((a): a is string => Boolean(a));
    if (!inputs.includes(address)) continue;
    for (const a of new Set(inputs)) {
      if (a === address) continue;
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([address, shared_tx_count]) => ({ address, shared_tx_count }))
    .sort((x, y) => y.shared_tx_count - x.shared_tx_count)
    .slice(0, 20);
}
```

- [ ] **Step 4: Run → PASS** — `cd api && npm test -- lib/chain-sources/btc`. Expected: PASS (existing BTC tests + the new clustering test).

- [ ] **Step 5: Surface on the BTC expand response.** This needs the BTC txs in the handler. The cleanest budget-safe approach: have the BTC adapter optionally return the raw txs it already fetched. Add an exported helper in `btc.ts`:

```ts
export async function fetchBtcTxsRaw(address: string): Promise<EsploraTx[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`https://blockstream.info/api/address/${address}/txs`, { signal: ctrl.signal });
    if (!res.ok) return [];
    const txs = (await res.json().catch(() => [])) as EsploraTx[];
    return Array.isArray(txs) ? txs : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
```

Then refactor `fetchBtcTransfers` to call `fetchBtcTxsRaw` internally (DRY — one fetch path):

```ts
export async function fetchBtcTransfers(address: string, filter: TransferFilter): Promise<FetchResult> {
  const txs = await fetchBtcTxsRaw(address);
  return applyFilter(extractBtcTransfers(address, txs), filter);
}
```

(Confirm `EsploraTx`, `FETCH_TIMEOUT`, `extractBtcTransfers`, `applyFilter` are all already in `btc.ts`.)

- [ ] **Step 6: Add `cluster` to the server + client ExpandResponse and populate it for BTC.**

In `api/src/routes/tracer.ts`: add `import { clusterCommonInputs, fetchBtcTxsRaw, type CoInputCluster } from '../lib/chain-sources/btc';`, extend the interface:

```ts
export interface ExpandResponse {
  root: TracerNode;
  nodes: TracerNode[];
  edges: TracerEdge[];
  truncated: boolean;
  warning?: string;
  cluster?: CoInputCluster[];
  generated_at: string;
}
```

In `tracerExpandHandler`, after building `edges` and before `const body`, add:

```ts
let cluster: CoInputCluster[] | undefined;
if (chain === 'btc') {
  const btcTxs = await fetchBtcTxsRaw(address);
  const c2 = clusterCommonInputs(btcTxs, address);
  if (c2.length) cluster = c2;
}
```

and add `...(cluster ? { cluster } : {}),` into the `body` object literal.
NOTE: this adds ONE extra subrequest for BTC expands (the cluster fetch). That's fine (≤ ~6 total). If you want to avoid the double-fetch, that's a later optimization — keep it simple and correct now.

In `src/lib/dfir/tracer-graph.ts`: add the optional field + type to the client `ExpandResponse`:

```ts
export interface CoInputCluster {
  address: string;
  shared_tx_count: number;
}
```

and add `cluster?: CoInputCluster[];` to the client `ExpandResponse` interface (it currently has root/nodes/edges/truncated/warning?/generated_at).

- [ ] **Step 7: Typecheck (api + frontend) + run route test + commit**

```bash
npx tsc -p api/tsconfig.json --noEmit && npx tsc -p tsconfig.json --noEmit
cd api && npm test -- routes/tracer   # still green (dangerouslyDisableSandbox); btc expand path unchanged for evm
cd ..
git add api/src/lib/chain-sources/btc.ts api/src/routes/tracer.ts src/lib/dfir/tracer-graph.ts api/test/lib/chain-sources/btc.test.ts
git commit -m "feat(tracer): BTC common-input clustering on expand"
```

- [ ] **Step 8: (UI) show the cluster in `Tracer.tsx`.** Capture `data.cluster` when expanding and show it in the detail panel. Add state `const [cluster, setCluster] = useState<{address:string;shared_tx_count:number}[]|null>(null);`, set it in the `expand` success path (`setCluster(data.cluster ?? null)`), and render a small list under the panel:

```tsx
{
  cluster && cluster.length ? (
    <div className="border-t border-gray-700 pt-2">
      <span className="text-gray-400">Likely same-owner (common-input)</span>
      <ul className="mt-1 space-y-1">
        {cluster.slice(0, 8).map((c) => (
          <li key={c.address} className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px]">{c.address}</span>
            <button
              className="rounded border border-gray-600 px-1 text-[10px] hover:bg-gray-800"
              onClick={() => {
                setSeed(c.address);
              }}
            >
              seed
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
}
```

Typecheck `npx tsc -p tsconfig.json --noEmit`, then `git add src/pages/dfir/Tracer.tsx && git commit -m "feat(tracer): show BTC common-input cluster in panel"`.

---

# Part 4 — Auto-path to CEX/Mixer (§3)

### Task 9: `findPathToCategory` + "find cash-out" button

**Files:** Modify `src/lib/dfir/tracer-graph.ts`, `src/pages/dfir/Tracer.tsx`; Test `src/lib/dfir/tracer-graph.test.ts`

- [ ] **Step 1: Write the failing test** (append to `src/lib/dfir/tracer-graph.test.ts`)

```ts
import { findPathToCategory } from './tracer-graph';

describe('findPathToCategory', () => {
  function graphWith(nodes: { id: string; category: string }[], edges: [string, string][]) {
    const g = emptyGraph(nodes[0].id);
    for (const n of nodes) {
      g.nodes.set(n.id, {
        id: n.id,
        address: n.id.split(':')[1] ?? n.id,
        chain: 'evm',
        label: null,
        category: n.category,
        risk: { level: 'low', score: 0, signals: [] },
        is_root: n.id === nodes[0].id,
        explorer_url: '',
      });
    }
    edges.forEach(([s, t], i) => {
      g.edges.set(`e${i}`, {
        id: `e${i}`,
        source: s,
        target: t,
        direction: 'out',
        amount: '',
        token: '',
        tx_hash: `tx${i}`,
        timestamp: null,
        confidence: 'candidate',
      });
    });
    return g;
  }

  it('finds the shortest path from seed to the nearest exchange/mixer', () => {
    const g = graphWith(
      [
        { id: 'evm:seed', category: 'wallet' },
        { id: 'evm:a', category: 'wallet' },
        { id: 'evm:cex', category: 'exchange' },
      ],
      [
        ['evm:seed', 'evm:a'],
        ['evm:a', 'evm:cex'],
      ]
    );
    expect(findPathToCategory(g, ['exchange', 'mixer'])).toEqual(['evm:seed', 'evm:a', 'evm:cex']);
  });

  it('returns null when no target category is reachable', () => {
    const g = graphWith(
      [
        { id: 'evm:seed', category: 'wallet' },
        { id: 'evm:a', category: 'wallet' },
      ],
      [['evm:seed', 'evm:a']]
    );
    expect(findPathToCategory(g, ['exchange', 'mixer'])).toBeNull();
  });

  it('treats edges as undirected for reachability', () => {
    const g = graphWith(
      [
        { id: 'evm:seed', category: 'wallet' },
        { id: 'evm:cex', category: 'exchange' },
      ],
      [['evm:cex', 'evm:seed']] // edge points toward seed
    );
    expect(findPathToCategory(g, ['exchange'])).toEqual(['evm:seed', 'evm:cex']);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/dfir/tracer-graph.test.ts`. Expected: FAIL (findPathToCategory not found).

- [ ] **Step 3: Implement** (append to `src/lib/dfir/tracer-graph.ts`)

```ts
/**
 * BFS from the seed over edges (undirected) to the nearest node whose category
 * is in `targets`. Returns the ordered node-id path (seed → … → target) or null.
 * Pure; operates only on the already-loaded graph.
 */
export function findPathToCategory(graph: TracerGraph, targets: string[]): string[] | null {
  const targetSet = new Set(targets);
  const adj = new Map<string, string[]>();
  for (const e of graph.edges.values()) {
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
  }
  const start = graph.seedId;
  if (!graph.nodes.has(start)) return null;
  const queue: string[] = [start];
  const prev = new Map<string, string | null>([[start, null]]);
  while (queue.length) {
    const cur = queue.shift()!;
    const node = graph.nodes.get(cur);
    if (node && cur !== start && targetSet.has(node.category)) {
      const path: string[] = [];
      let p: string | null = cur;
      while (p !== null) {
        path.unshift(p);
        p = prev.get(p) ?? null;
      }
      return path;
    }
    for (const nb of adj.get(cur) ?? []) {
      if (!prev.has(nb)) {
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/lib/dfir/tracer-graph.test.ts`. Expected: PASS (all tracer-graph tests).

- [ ] **Step 5: Wire the button** in `Tracer.tsx`. Add `findPathToCategory` to the tracer-graph import, add state `const [highlightPath, setHighlightPath] = useState<string[] | undefined>(undefined);`, pass `highlightedPath={highlightPath}` to `<RelationshipGraphCanvas .../>`, and add a button (e.g. in the control rail, after the Trace button):

```tsx
<button
  className="w-full rounded border border-amber-600 p-2 text-xs text-amber-300 hover:bg-amber-950 disabled:opacity-40"
  disabled={!graph}
  onClick={() => {
    if (!graph) return;
    const path = findPathToCategory(graph, ['exchange', 'mixer']);
    setHighlightPath(path ?? undefined);
    if (!path) setError('No cash-out (CEX/Mixer) path in the loaded graph — expand further.');
  }}
>
  Find cash-out (CEX/Mixer)
</button>
```

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add src/lib/dfir/tracer-graph.ts src/lib/dfir/tracer-graph.test.ts src/pages/dfir/Tracer.tsx
git commit -m "feat(tracer): find-cash-out auto-path to CEX/Mixer"
```

---

## Final verification (after all tasks)

- [ ] `cd api && npm test -- routes/tracer` and `npm test -- lib/calldata-analysis lib/chain-sources` all green (dangerouslyDisableSandbox).
- [ ] `npx vitest run src/lib/dfir/tracer-graph.test.ts` green.
- [ ] `npx tsc -p api/tsconfig.json --noEmit`, `npx tsc -p api/tsconfig.worker.json --noEmit`, `npx tsc -p tsconfig.json --noEmit` — no new errors (ignore pre-existing osint-stream errors).
- [ ] Manual smoke at `/dfir/tracer`: seed an EVM address → expand → select a node → "Inspect calldata" on a tx → verdict + flags render; "Find cash-out" highlights a path when one exists; (admin) add a label and re-expand shows it; BTC seed shows a common-input cluster.
- [ ] Deploy is the user's call (Phase A + B both still off origin/main); deploy from repo root, rebased on origin/main.

---

## Self-Review (completed during planning)

**Spec coverage:** §1 calldata inspector → Tasks 4–7 (pure analyzer, tx-fetch, route+follow-pointer, UI). §2 D1 labels → Tasks 1–3 (helpers, expand wiring, admin add + test). §3 auto-path → Task 9. §4 BTC clustering → Task 8. Error handling (§6): tx-not-found clean envelope (Task 6), D1 missing → empty map / 503 add (Tasks 1,3), no-path null (Task 9), no-coinput [] (Task 8). Testing (§7): unit tests for analyzeCalldata/clusterCommonInputs/findPathToCategory; route tests for labels + calldata; D1 round-trip via route. Non-goals respected (no threat-graph upsert, one pointer hop, EVM/Tron calldata only, add-only labels). **Deviation from spec §2:** uses the repo's runtime-ensure table convention instead of a `/create-migration` file — matches `investigations.ts`/`threat-graph.ts` and makes the test D1 work without a migration-apply step; documented in the plan header.

**Placeholder scan:** none — every step has complete code/commands.

**Type consistency:** `AddressLabel`/`LabelCategory`/`TracerChain` reused from address-labels.ts; `CalldataAnalysis`/`EmbeddedPointer` defined in Task 4 and consumed in Task 6; `FetchedTx`/`EVM_RPCS` defined in Task 5 and consumed in Task 6; `CoInputCluster` defined in Task 8 (btc.ts) and mirrored in the client tracer-graph.ts; `findPathToCategory` defined and consumed consistently; server `ExpandResponse.cluster?` mirrored by client `ExpandResponse.cluster?`. `withTestApiKey` admin form must be confirmed against the real helper (Task 3 Step 4 instructs this).

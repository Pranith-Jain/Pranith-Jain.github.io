# Crypto Fund-Flow Tracer — Phase E (Monitoring & Alerts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Watch a crypto address and alert on new movement — admin watch CRUD, an hourly budget-safe diff sweep (new_transfer / suspicious_counterparty / large_transfer), an in-app alerts feed, and an opt-in webhook.

**Architecture:** Mirrors `ct-monitor.ts` (D1 runtime-ensure tables + handlers) and reuses `fetchTransfers` + the OFAC/ScamSniffer sets. A pure core (`diffTransfers`/`evaluateAlerts`) is wrapped by a D1-backed `checkAddressWatches` hooked into the existing `0 * * * *` cron — one cheap `fetchTransfers` call per watched address, oldest-first, capped.

**Tech Stack:** Cloudflare Workers + Hono + Zod, D1, vitest. No new deps.

**Spec:** `docs/superpowers/specs/2026-06-11-crypto-tracer-phase-e-design.md`
**Base branch:** `feat/crypto-tracer-de` (off current `origin/main`, A+B+C live).

---

## Conventions

- Branch automation moves HEAD; `git branch --show-current` before each commit; commit on the checked-out branch; no new branch/stash; only `git add` named files.
- api tests: `cd api && npm test -- <pattern>` (Bash `dangerouslyDisableSandbox: true`). Typecheck `npx tsc -p api/tsconfig.json --noEmit` (ALWAYS `--noEmit`; `noUncheckedIndexedAccess` — guard indexed access). Ignore only pre-existing `file2txt/mime` error.
- Admin route tests: mini-app pattern (`report.test.ts` / the Phase C `tracer.test.ts` block) — Hono app + `env = () => ({ ...testEnv, ADMIN_TOKEN: 'sekret' })` + `Authorization: Bearer sekret`.
- ids `crypto.randomUUID()`; timestamps `new Date().toISOString()`.

---

## File Structure

**New:** `api/src/lib/address-watch.ts` (types + pure `diffTransfers`/`evaluateAlerts` + D1 layer + `checkAddressWatches`), `api/src/routes/crypto-monitor.ts` (4 handlers), `api/test/lib/address-watch.test.ts`, `api/test/routes/crypto-monitor.test.ts`.
**Modified:** `api/src/lib/validation-schemas.ts` (`cryptoWatchAddSchema`), `api/src/index.ts` (routes + admin gate), `worker/scheduled.ts` (cron hook), `src/pages/dfir/Tracer.tsx` (watch button + alerts feed).

---

### Task PE-1: Pure diff + alert-evaluation core

**Files:** Create `api/src/lib/address-watch.ts` (types + pure fns), `api/test/lib/address-watch.test.ts`

- [ ] **Step 1: Write the failing test**

`api/test/lib/address-watch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffTransfers, evaluateAlerts, type WatchRow } from '../../src/lib/address-watch';
import type { Transfer } from '../../src/lib/chain-sources/types';

function tx(over: Partial<Transfer>): Transfer {
  return {
    counterparty: '0xcp',
    direction: 'in',
    amount: '5 USDT',
    amount_num: 5,
    token: 'USDT',
    tx_hash: 'h',
    timestamp: '2026-06-11T00:00:00.000Z',
    chain: 'evm',
    explorer_url: 'x',
    ...over,
  };
}
function watch(over: Partial<WatchRow>): WatchRow {
  return {
    address: '0xself',
    chain: 'evm',
    alert_types: ['new_transfer'],
    min_amount: null,
    webhook_url: null,
    label: null,
    added_at: 'a',
    last_checked: null,
    last_fingerprint: null,
    ...over,
  };
}

describe('diffTransfers', () => {
  it('returns the net-new transfers above the stored fingerprint', () => {
    const list = [tx({ tx_hash: 'c' }), tx({ tx_hash: 'b' }), tx({ tx_hash: 'a' })]; // newest-first
    expect(diffTransfers(list, 'b').map((t) => t.tx_hash)).toEqual(['c']);
  });
  it('returns all when the fingerprint is gone (or null on first run)', () => {
    const list = [tx({ tx_hash: 'c' }), tx({ tx_hash: 'b' })];
    expect(diffTransfers(list, 'zzz')).toHaveLength(2);
    expect(diffTransfers(list, null)).toHaveLength(2);
  });
  it('returns none when nothing is new', () => {
    expect(diffTransfers([tx({ tx_hash: 'c' })], 'c')).toHaveLength(0);
  });
});

describe('evaluateAlerts', () => {
  const empty = new Set<string>();
  it('new_transfer fires for any new transfer', () => {
    const a = evaluateAlerts(watch({ alert_types: ['new_transfer'] }), [tx({})], empty, empty);
    expect(a.map((x) => x.alert_type)).toEqual(['new_transfer']);
  });
  it('large_transfer respects min_amount', () => {
    const w = watch({ alert_types: ['large_transfer'], min_amount: 10 });
    expect(evaluateAlerts(w, [tx({ amount_num: 5 })], empty, empty)).toHaveLength(0);
    expect(evaluateAlerts(w, [tx({ amount_num: 50 })], empty, empty)).toHaveLength(1);
  });
  it('suspicious_counterparty fires on a sanctioned/scam counterparty', () => {
    const w = watch({ alert_types: ['suspicious_counterparty'] });
    const sanctioned = new Set(['0xbad']);
    expect(evaluateAlerts(w, [tx({ counterparty: '0xBAD' })], sanctioned, empty)).toHaveLength(1);
    expect(evaluateAlerts(w, [tx({ counterparty: '0xok' })], sanctioned, empty)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `cd api && npm test -- lib/address-watch` (dangerouslyDisableSandbox).

- [ ] **Step 3: Implement the types + pure core** — create `api/src/lib/address-watch.ts` with (D1 layer added in PE-2):

```ts
import type { Transfer, TracerChain } from './chain-sources/types';

export type AlertType = 'new_transfer' | 'suspicious_counterparty' | 'large_transfer';

export interface WatchRow {
  address: string;
  chain: TracerChain;
  alert_types: AlertType[];
  min_amount: number | null;
  webhook_url: string | null;
  label: string | null;
  added_at: string;
  last_checked: string | null;
  last_fingerprint: string | null;
}

export interface AlertRow {
  alert_type: AlertType;
  transfer: Transfer;
}

/** Net-new transfers since `lastFingerprint`. Transfers are newest-first. Pure. */
export function diffTransfers(transfers: Transfer[], lastFingerprint: string | null): Transfer[] {
  if (!lastFingerprint) return transfers;
  const idx = transfers.findIndex((t) => t.tx_hash === lastFingerprint);
  return idx === -1 ? transfers : transfers.slice(0, idx);
}

/** Evaluate a watch's alert types against the net-new transfers. Pure. */
export function evaluateAlerts(
  watch: WatchRow,
  newTransfers: Transfer[],
  sanctioned: Set<string>,
  scam: Set<string>
): AlertRow[] {
  const out: AlertRow[] = [];
  const types = new Set(watch.alert_types);
  for (const t of newTransfers) {
    if (types.has('new_transfer')) out.push({ alert_type: 'new_transfer', transfer: t });
    if (types.has('large_transfer') && watch.min_amount != null && t.amount_num >= watch.min_amount) {
      out.push({ alert_type: 'large_transfer', transfer: t });
    }
    if (types.has('suspicious_counterparty')) {
      const lc = t.counterparty.toLowerCase();
      const key = watch.chain === 'evm' ? lc : t.counterparty;
      if (sanctioned.has(key) || scam.has(lc)) out.push({ alert_type: 'suspicious_counterparty', transfer: t });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS** — `cd api && npm test -- lib/address-watch`.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json --noEmit
git add api/src/lib/address-watch.ts api/test/lib/address-watch.test.ts
git commit -m "feat(monitor): pure transfer-diff + alert-evaluation core"
```

---

### Task PE-2: D1 layer + the sweep engine

**Files:** Modify `api/src/lib/address-watch.ts`

(D1-backed; exercised by the PE-3 route test + cron. No standalone unit test for the D1 glue.)

- [ ] **Step 1: Append the D1 layer + engine**

Add imports at the top of `address-watch.ts`:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { fetchTransfers } from './chain-sources';
import { loadSanctionedSet, type SanctionsChain } from './ofac-sanctions';
import { loadScamSnifferSet } from './scamsniffer';
```

Append:

```ts
const SWEEP_BATCH = 15;
const OFAC_CHAINS: Record<TracerChain, SanctionsChain[]> = {
  evm: ['ETH', 'USDT', 'USDC', 'BSC', 'ARB'],
  btc: ['XBT'],
  tron: ['TRX', 'USDT'],
};

const DDL = `CREATE TABLE IF NOT EXISTS address_watch (
  address TEXT NOT NULL, chain TEXT NOT NULL, alert_types TEXT NOT NULL,
  min_amount REAL, webhook_url TEXT, label TEXT, added_at TEXT NOT NULL,
  last_checked TEXT, last_fingerprint TEXT, PRIMARY KEY (address, chain)
);
CREATE TABLE IF NOT EXISTS address_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, chain TEXT NOT NULL,
  alert_type TEXT NOT NULL, detail TEXT NOT NULL, detected_at TEXT NOT NULL, webhook_sent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_address_alerts_addr ON address_alerts(address, chain);`;

export async function ensureAddressWatchTables(db: D1Database): Promise<void> {
  for (const stmt of DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(stmt).run();
}

interface WatchDbRow {
  address: string;
  chain: string;
  alert_types: string;
  min_amount: number | null;
  webhook_url: string | null;
  label: string | null;
  added_at: string;
  last_checked: string | null;
  last_fingerprint: string | null;
}

function rowToWatch(r: WatchDbRow): WatchRow {
  return {
    address: r.address,
    chain: r.chain as TracerChain,
    alert_types: JSON.parse(r.alert_types) as AlertType[],
    min_amount: r.min_amount,
    webhook_url: r.webhook_url,
    label: r.label,
    added_at: r.added_at,
    last_checked: r.last_checked,
    last_fingerprint: r.last_fingerprint,
  };
}

/** Current newest tx_hash for an address (for seeding/diffing). One cheap call. */
export async function currentFingerprint(chain: TracerChain, address: string): Promise<string | null> {
  const { transfers } = await fetchTransfers(chain, address, { maxTransfers: 1 });
  return transfers[0]?.tx_hash ?? null;
}

export async function addWatch(
  db: D1Database,
  w: Omit<WatchRow, 'added_at' | 'last_checked' | 'last_fingerprint'>
): Promise<void> {
  await ensureAddressWatchTables(db);
  const now = new Date().toISOString();
  const fp = await currentFingerprint(w.chain, w.address); // seed so first sweep doesn't alert all history
  await db
    .prepare(
      `INSERT OR REPLACE INTO address_watch (address, chain, alert_types, min_amount, webhook_url, label, added_at, last_checked, last_fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(w.address, w.chain, JSON.stringify(w.alert_types), w.min_amount, w.webhook_url, w.label, now, now, fp)
    .run();
}

export async function listWatches(db: D1Database): Promise<WatchRow[]> {
  await ensureAddressWatchTables(db);
  const res = await db.prepare(`SELECT * FROM address_watch ORDER BY added_at DESC`).all();
  return ((res.results ?? []) as unknown as WatchDbRow[]).map(rowToWatch);
}

export async function removeWatch(db: D1Database, address: string, chain: string): Promise<void> {
  await ensureAddressWatchTables(db);
  await db.prepare(`DELETE FROM address_watch WHERE address = ? AND chain = ?`).bind(address, chain).run();
}

export interface StoredAlert {
  id: number;
  address: string;
  chain: string;
  alert_type: string;
  detail: string;
  detected_at: string;
}
export async function listAlerts(db: D1Database, address: string, chain: string, limit = 100): Promise<StoredAlert[]> {
  await ensureAddressWatchTables(db);
  const res = await db
    .prepare(
      `SELECT id, address, chain, alert_type, detail, detected_at FROM address_alerts WHERE address = ? AND chain = ? ORDER BY id DESC LIMIT ?`
    )
    .bind(address, chain, Math.min(limit, 500))
    .all();
  return (res.results ?? []) as unknown as StoredAlert[];
}

/** The hourly sweep: oldest-first, one cheap call per watch, diff + alert. Never throws out of the loop. */
export async function checkAddressWatches(env: Env, now: string, db: D1Database): Promise<number> {
  await ensureAddressWatchTables(db);
  const res = await db
    .prepare(`SELECT * FROM address_watch ORDER BY last_checked ASC NULLS FIRST LIMIT ?`)
    .bind(SWEEP_BATCH)
    .all();
  const watches = ((res.results ?? []) as unknown as WatchDbRow[]).map(rowToWatch);
  // Load sets ONCE for the whole sweep.
  const needSuspicious = watches.some((w) => w.alert_types.includes('suspicious_counterparty'));
  const sanctioned = needSuspicious
    ? await loadSanctionedSet(['ETH', 'XBT', 'TRX', 'USDT', 'USDC', 'BSC', 'ARB'])
    : new Set<string>();
  const scam = needSuspicious ? await loadScamSnifferSet() : new Set<string>();

  let alertCount = 0;
  for (const w of watches) {
    try {
      const { transfers } = await fetchTransfers(w.chain, w.address, { maxTransfers: 25 });
      const newest = transfers[0]?.tx_hash ?? w.last_fingerprint;
      const fresh = diffTransfers(transfers, w.last_fingerprint);
      const alerts = evaluateAlerts(w, fresh, sanctioned, scam);
      for (const a of alerts) {
        await db
          .prepare(
            `INSERT INTO address_alerts (address, chain, alert_type, detail, detected_at, webhook_sent) VALUES (?, ?, ?, ?, ?, 0)`
          )
          .bind(w.address, w.chain, a.alert_type, JSON.stringify(a.transfer), now)
          .run();
        alertCount += 1;
      }
      if (alerts.length && w.webhook_url) {
        try {
          await fetch(w.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: w.address,
              chain: w.chain,
              alerts: alerts.map((a) => ({ alert_type: a.alert_type, transfer: a.transfer })),
            }),
          });
          await db
            .prepare(`UPDATE address_alerts SET webhook_sent = 1 WHERE address = ? AND chain = ? AND webhook_sent = 0`)
            .bind(w.address, w.chain)
            .run();
        } catch {
          /* webhook failure: alert still stored in-app; webhook_sent stays 0 */
        }
      }
      await db
        .prepare(`UPDATE address_watch SET last_checked = ?, last_fingerprint = ? WHERE address = ? AND chain = ?`)
        .bind(now, newest, w.address, w.chain)
        .run();
    } catch {
      // fetch failed this tick: bump last_checked so the sweep rotates; keep fingerprint
      await db
        .prepare(`UPDATE address_watch SET last_checked = ? WHERE address = ? AND chain = ?`)
        .bind(now, w.address, w.chain)
        .run();
    }
  }
  return alertCount;
}
```

NOTE: `OFAC_CHAINS` is referenced for parity with the tracer route but the sweep loads a merged set directly; if your linter flags `OFAC_CHAINS` unused, delete that const. Confirm `loadSanctionedSet` accepts the `SanctionsChain[]` array used above (it does — see `ofac-sanctions.ts`).

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json --noEmit
git add api/src/lib/address-watch.ts
git commit -m "feat(monitor): D1 watch store + budget-safe sweep engine"
```

---

### Task PE-3: crypto-monitor routes + schema + registration + test

**Files:** Create `api/src/routes/crypto-monitor.ts`; Modify `api/src/lib/validation-schemas.ts`, `api/src/index.ts`; Test `api/test/routes/crypto-monitor.test.ts`

- [ ] **Step 1: Add the Zod schema** (validation-schemas.ts, after the Phase C tracer-graph schema)

```ts
export const cryptoWatchAddSchema = z.object({
  address: z.string().min(1).max(200),
  chain: z.enum(['evm', 'btc', 'tron']),
  alert_types: z.array(z.enum(['new_transfer', 'suspicious_counterparty', 'large_transfer'])).min(1),
  min_amount: z.number().nonnegative().optional(),
  webhook_url: z.string().url().max(2048).optional(),
  label: z.string().max(120).optional(),
});
export type CryptoWatchAddInput = z.infer<typeof cryptoWatchAddSchema>;
```

- [ ] **Step 2: Create the handlers** — `api/src/routes/crypto-monitor.ts`:

```ts
import type { Context } from 'hono';
import type { Env } from '../env';
import { addWatch, listWatches, removeWatch, listAlerts } from '../lib/address-watch';
import type { CryptoWatchAddInput } from '../lib/validation-schemas';

export async function cryptoWatchAddHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: CryptoWatchAddInput }).parsed;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'watch store unavailable' }, 503);
  await addWatch(db, {
    address: input.address,
    chain: input.chain,
    alert_types: input.alert_types,
    min_amount: input.min_amount ?? null,
    webhook_url: input.webhook_url ?? null,
    label: input.label ?? null,
  });
  return c.json({ ok: true, address: input.address, chain: input.chain }, 201);
}

export async function cryptoWatchListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'watch store unavailable' }, 503);
  return c.json({ watches: await listWatches(db) }, 200);
}

export async function cryptoWatchRemoveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'watch store unavailable' }, 503);
  await removeWatch(db, c.req.param('address') ?? '', c.req.param('chain') ?? '');
  return c.json({ ok: true }, 200);
}

export async function cryptoAlertsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'watch store unavailable' }, 503);
  const address = c.req.query('address') ?? '';
  const chain = c.req.query('chain') ?? '';
  return c.json({ alerts: await listAlerts(db, address, chain) }, 200);
}
```

- [ ] **Step 3: Register + admin-gate** (index.ts) — add the handler import + `cryptoWatchAddSchema` to the validation-schemas import; add the admin gate near the other targeted gates:

```ts
app.use('/api/v1/crypto-monitor', requireAdminMiddleware);
app.use('/api/v1/crypto-monitor/*', requireAdminMiddleware);
```

Register the routes:

```ts
app.post('/api/v1/crypto-monitor/watch', validate('json', cryptoWatchAddSchema), cryptoWatchAddHandler);
app.get('/api/v1/crypto-monitor/watches', cryptoWatchListHandler);
app.delete('/api/v1/crypto-monitor/watch/:address/:chain', cryptoWatchRemoveHandler);
app.get('/api/v1/crypto-monitor/alerts', cryptoAlertsHandler);
```

- [ ] **Step 4: Route test** — `api/test/routes/crypto-monitor.test.ts` (mini-app):

```ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { env as testEnv } from 'cloudflare:test';
import { requireAdminMiddleware } from '../../src/lib/admin-auth';
import { validate } from '../../src/lib/validate';
import { cryptoWatchAddSchema } from '../../src/lib/validation-schemas';
import {
  cryptoWatchAddHandler,
  cryptoWatchListHandler,
  cryptoWatchRemoveHandler,
  cryptoAlertsHandler,
} from '../../src/routes/crypto-monitor';

function app() {
  const a = new Hono<any>();
  a.use('/api/v1/crypto-monitor', requireAdminMiddleware);
  a.use('/api/v1/crypto-monitor/*', requireAdminMiddleware);
  a.post('/api/v1/crypto-monitor/watch', validate('json', cryptoWatchAddSchema), cryptoWatchAddHandler);
  a.get('/api/v1/crypto-monitor/watches', cryptoWatchListHandler);
  a.delete('/api/v1/crypto-monitor/watch/:address/:chain', cryptoWatchRemoveHandler);
  a.get('/api/v1/crypto-monitor/alerts', cryptoAlertsHandler);
  return a;
}
const env = (): any => ({ ...testEnv, ADMIN_TOKEN: 'sekret' });
const bearer = { 'content-type': 'application/json', Authorization: 'Bearer sekret' };

describe('crypto-monitor (admin, mini-app)', () => {
  it('401 without admin token', async () => {
    const r = await app().request('/api/v1/crypto-monitor/watches', {}, env());
    expect(r.status).toBe(401);
  });
  it('400 on a bad chain', async () => {
    const r = await app().request(
      '/api/v1/crypto-monitor/watch',
      {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({ address: '0xabc', chain: 'doge', alert_types: ['new_transfer'] }),
      },
      env()
    );
    expect(r.status).toBe(400);
  });
  it('add -> list -> alerts -> delete round-trip', async () => {
    const add = await app().request(
      '/api/v1/crypto-monitor/watch',
      {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({ address: '0xWATCHED1', chain: 'evm', alert_types: ['new_transfer'] }),
      },
      env()
    );
    expect(add.status).toBe(201);
    const list = await app().request('/api/v1/crypto-monitor/watches', { headers: bearer }, env());
    const { watches } = (await list.json()) as { watches: { address: string }[] };
    expect(watches.some((w) => w.address === '0xWATCHED1')).toBe(true);
    const alerts = await app().request(
      '/api/v1/crypto-monitor/alerts?address=0xWATCHED1&chain=evm',
      { headers: bearer },
      env()
    );
    expect(alerts.status).toBe(200);
    const del = await app().request(
      '/api/v1/crypto-monitor/watch/0xWATCHED1/evm',
      { method: 'DELETE', headers: bearer },
      env()
    );
    expect(del.status).toBe(200);
  });
});
```

NOTE: the `add` test calls `addWatch`, which calls `currentFingerprint` → a live `fetchTransfers`. For a nonexistent test address this returns `[]`/null quickly (graceful), so the test is not flaky; it asserts only the 201 + round-trip, not alert content.

- [ ] **Step 5: Run + typecheck + commit**

```bash
cd api && npm test -- routes/crypto-monitor
cd .. && npx tsc -p api/tsconfig.json --noEmit
git add api/src/routes/crypto-monitor.ts api/src/lib/validation-schemas.ts api/src/index.ts api/test/routes/crypto-monitor.test.ts
git commit -m "feat(monitor): admin crypto-monitor watch/alerts routes + round-trip test"
```

---

### Task PE-4: Cron hook

**Files:** Modify `worker/scheduled.ts`

- [ ] **Step 1: Add the sweep to the hourly block.** Open `worker/scheduled.ts`, find the `if (csCron === '0 * * * *') {` block and the existing `checkWatches(...)` `ctx.waitUntil(...)` call within it. Add an import at top:

```ts
import { checkAddressWatches } from '../api/src/lib/address-watch';
```

Inside that hourly block, next to the `checkWatches` call, add (match the EXACT variable names used there — confirm whether it's `env`/`csNow`/`db`/`ctx` and the `logCronFail` helper; the surrounding lines show them):

```ts
if (db) ctx.waitUntil(checkAddressWatches(env, csNow.toISOString(), db).catch(logCronFail('crypto-monitor')));
```

(If the block uses a different now-variable or already has `now` as an ISO string, use that. The `db` guard mirrors how `checkWatches`/other D1 jobs are guarded.)

- [ ] **Step 2: Typecheck (worker config too) + commit**

```bash
npx tsc -p api/tsconfig.worker.json --noEmit
git add worker/scheduled.ts
git commit -m "feat(monitor): run address-watch sweep in the hourly cron"
```

---

### Task PE-5: Tracer UI — watch button + alerts feed

**Files:** Modify `src/pages/dfir/Tracer.tsx`

- [ ] **Step 1: Add state + handlers**

Add state near the other `useState`s:

```ts
const [alerts, setAlerts] = useState<{ alert_type: string; detail: string; detected_at: string }[] | null>(null);
```

Add handlers:

```ts
const watchAddress = useCallback(async () => {
  if (!selected) return;
  const res = await fetch('/api/v1/crypto-monitor/watch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: selected.address,
      chain: selected.chain,
      alert_types: ['new_transfer', 'suspicious_counterparty'],
    }),
  });
  if (res.status === 401 || res.status === 403) setError('Watching requires an admin session.');
  else setError(res.ok ? null : `Watch failed (${res.status})`);
}, [selected]);

const loadAlerts = useCallback(async () => {
  if (!selected) return;
  const res = await fetch(
    `/api/v1/crypto-monitor/alerts?address=${encodeURIComponent(selected.address)}&chain=${selected.chain}`
  );
  if (res.status === 401 || res.status === 403) return setError('Alerts require an admin session.');
  if (res.ok) setAlerts(((await res.json()) as { alerts: typeof alerts }).alerts);
}, [selected]);
```

- [ ] **Step 2: Add the buttons + feed** in the detail panel (after the OSINT pivots section from Phase D, or after the node action buttons if Phase D not present):

```tsx
<div className="border-t border-gray-700 pt-2">
  <div className="grid grid-cols-2 gap-2">
    <button className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800" onClick={watchAddress}>
      Watch address
    </button>
    <button className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800" onClick={loadAlerts}>
      Load alerts
    </button>
  </div>
  {alerts ? (
    alerts.length ? (
      <ul className="mt-1 space-y-1 text-[10px]">
        {alerts.slice(0, 8).map((al, i) => (
          <li key={i} className="text-gray-400">
            <span className="font-semibold text-amber-400">{al.alert_type}</span> · {al.detected_at.slice(0, 16)}
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-1 text-[10px] text-gray-500">no alerts yet</p>
    )
  ) : null}
</div>
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add src/pages/dfir/Tracer.tsx
git commit -m "feat(monitor): watch-address button + alerts feed in Tracer"
```

---

## Final verification

- [ ] `cd api && npm test -- lib/address-watch routes/crypto-monitor` green.
- [ ] `npx tsc -p api/tsconfig.json --noEmit`, `npx tsc -p api/tsconfig.worker.json --noEmit`, `npx tsc -p tsconfig.json --noEmit` clean.
- [ ] Manual smoke (admin): select a node → "Watch address" (201) → appears via `/crypto-monitor/watches`; "Load alerts" shows the (initially empty) feed.

## Self-Review (completed during planning)

**Spec coverage:** §1 tables → PE-2 DDL. §2 engine (diff, alert types, sets-once, budget) → PE-1 (pure) + PE-2 (`checkAddressWatches`). §3 routes → PE-3. §4 cron → PE-4. §5 UI → PE-5. §7 error handling → PE-2 (per-watch try/catch, webhook-failure tolerance, fingerprint seed-on-add) + PE-3 (503). §8 testing → PE-1 unit + PE-3 round-trip. Non-goals respected (no email, raw-units threshold, token-transfer fingerprint, hourly).

**Placeholders:** none — one verify-against-reality note (the exact `env`/`csNow`/`db` var names in `scheduled.ts` PE-4), which is correct since they depend on the live file.

**Type consistency:** `WatchRow`/`AlertRow`/`AlertType` defined in PE-1 and consumed in PE-2/PE-3; `Transfer`/`TracerChain` reused; `cryptoWatchAddSchema`/`CryptoWatchAddInput` defined in PE-3 and used in handler + test; `checkAddressWatches(env, now, db)` signature consistent between PE-2 and PE-4; `addWatch` param shape (`Omit<WatchRow, 'added_at'|'last_checked'|'last_fingerprint'>`) matches the PE-3 handler call.

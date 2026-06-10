# Crypto Fund-Flow Tracer — Phase C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a trace persistent and shareable-with-the-team: save/reload trace graphs (admin), export JSON/CSV/PNG, and pin crypto addresses/txs into the existing investigations workspace.

**Architecture:** A new admin-gated `tracer_graphs` D1 store (runtime-ensure, like Phase B) holds the serialized client graph; the client gains pure `serializeGraph`/`deserializeGraph`. Export is pure client-side (JSON/CSV) plus a dynamically-imported `html-to-image` for PNG (kept out of the page chunk). Pinning reuses the existing `investigations` workspace by widening the observable `type`.

**Tech Stack:** Cloudflare Workers + Hono + Zod, TypeScript, vitest, React + `@xyflow/react`, `html-to-image` (new, dynamic-imported).

**Spec:** `docs/superpowers/specs/2026-06-11-crypto-tracer-phase-c-design.md`
**Base branch:** `feat/crypto-tracer-phasec` (off current `origin/main`, which has A+B).

---

## Conventions (read once)

- **Branch:** aggressive automation moves HEAD. Run `git branch --show-current` right before each commit; commit on the checked-out branch. Do NOT create a branch / `git stash` / touch main. Only `git add` the files each task names. If a commit lands on a different branch than `feat/crypto-tracer-phasec`, note the SHA so it can be cherry-picked back.
- **api tests:** `cd api && npm test -- <pattern>` with the Bash tool's `dangerouslyDisableSandbox: true`.
- **frontend tests:** repo root, `npx vitest run <path>`.
- **typecheck:** `npx tsc -p api/tsconfig.json --noEmit` / `npx tsc -p tsconfig.json --noEmit`. ALWAYS `--noEmit`. api tsconfig has `noUncheckedIndexedAccess` (guard indexed access). Ignore only pre-existing `api/test/lib/file2txt/mime.test.ts`.
- **Admin route tests:** mini-app pattern (see `api/test/routes/report.test.ts`): a small Hono app mirroring the index wiring, `env = () => ({ ...testEnv, ADMIN_TOKEN: 'sekret' })` (with `import { env as testEnv } from 'cloudflare:test'` for the real D1), admin auth via `Authorization: Bearer sekret`.
- **ids:** `crypto.randomUUID()`. **timestamps:** `new Date().toISOString()`.

---

## File Structure

**New:**

- `api/src/lib/tracer-graphs.ts` — D1 persistence (ensure/save/list/get/delete).
- `src/lib/dfir/tracer-export.ts` — pure `toJSON`/`toCSV`.
- `src/lib/dfir/tracer-export.test.ts`.

**Modified:**

- `src/lib/dfir/tracer-graph.ts` — `SerializedGraph`, `serializeGraph`, `deserializeGraph`.
- `src/lib/dfir/tracer-graph.test.ts` — round-trip tests.
- `api/src/lib/validation-schemas.ts` — `tracerGraphSaveSchema`; widen `investigationObservableSchema.type`.
- `api/src/routes/tracer.ts` — graphs CRUD handlers.
- `api/src/routes/investigations.ts` — widen `Observable.type` union.
- `api/src/index.ts` — register graphs routes + admin-gate.
- `api/test/routes/tracer.test.ts` — graphs CRUD round-trip (mini-app).
- `src/pages/dfir/Tracer.tsx` — save/load/export/pin UI.
- `package.json` — add `html-to-image`.

---

### Task PC-1: Client graph serialize/deserialize

**Files:** Modify `src/lib/dfir/tracer-graph.ts`, `src/lib/dfir/tracer-graph.test.ts`

- [ ] **Step 1: Write the failing test** (append to `src/lib/dfir/tracer-graph.test.ts`)

```ts
import { serializeGraph, deserializeGraph } from './tracer-graph';

describe('serialize/deserialize round-trip', () => {
  function sampleGraph() {
    const g = emptyGraph('evm:0xroot');
    g.nodes.set('evm:0xroot', {
      id: 'evm:0xroot',
      address: '0xroot',
      chain: 'evm',
      label: 'Binance 14',
      category: 'exchange',
      risk: { level: 'low', score: 0, signals: [] },
      is_root: true,
      explorer_url: 'https://x',
    });
    g.nodes.set('evm:0xa', {
      id: 'evm:0xa',
      address: '0xa',
      chain: 'evm',
      label: null,
      category: 'unknown',
      risk: { level: 'critical', score: 100, signals: ['OFAC-sanctioned address'] },
      is_root: false,
      explorer_url: 'https://x',
    });
    g.edges.set('tx1:evm:0xa', {
      id: 'tx1:evm:0xa',
      source: 'evm:0xroot',
      target: 'evm:0xa',
      direction: 'out',
      amount: '1 ETH',
      token: 'ETH',
      tx_hash: 'tx1',
      timestamp: null,
      confidence: 'confirmed',
    });
    return g;
  }

  it('round-trips nodes, edges, seedId and confirmed state', () => {
    const g = sampleGraph();
    const restored = deserializeGraph(JSON.parse(JSON.stringify(serializeGraph(g))));
    expect(restored.seedId).toBe('evm:0xroot');
    expect(restored.nodes.size).toBe(2);
    expect(restored.edges.size).toBe(1);
    expect(restored.edges.get('tx1:evm:0xa')!.confidence).toBe('confirmed');
    expect(restored.nodes.get('evm:0xa')!.risk.level).toBe('critical');
  });

  it('deserialize tolerates malformed input → empty graph', () => {
    expect(deserializeGraph(null).nodes.size).toBe(0);
    expect(deserializeGraph({ nodes: 'nope' }).edges.size).toBe(0);
    expect(deserializeGraph(42).seedId).toBe('');
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/dfir/tracer-graph.test.ts` (serializeGraph not found).

- [ ] **Step 3: Implement** (append to `src/lib/dfir/tracer-graph.ts`)

```ts
export interface SerializedGraph {
  seedId: string;
  nodes: TracerNode[];
  edges: TracerEdge[];
}

/** Flatten the Map-based graph for persistence/export. Pure. */
export function serializeGraph(graph: TracerGraph): SerializedGraph {
  return { seedId: graph.seedId, nodes: [...graph.nodes.values()], edges: [...graph.edges.values()] };
}

/** Rebuild a TracerGraph from a serialized blob. Tolerant of malformed input → empty graph. */
export function deserializeGraph(data: unknown): TracerGraph {
  const nodes = new Map<string, TracerNode>();
  const edges = new Map<string, TracerEdge>();
  const d = (data && typeof data === 'object' ? data : {}) as Partial<SerializedGraph>;
  const seedId = typeof d.seedId === 'string' ? d.seedId : '';
  if (Array.isArray(d.nodes)) {
    for (const n of d.nodes)
      if (n && typeof (n as TracerNode).id === 'string') nodes.set((n as TracerNode).id, n as TracerNode);
  }
  if (Array.isArray(d.edges)) {
    for (const e of d.edges)
      if (e && typeof (e as TracerEdge).id === 'string') edges.set((e as TracerEdge).id, e as TracerEdge);
  }
  return { seedId, nodes, edges };
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/lib/dfir/tracer-graph.test.ts` (all tracer-graph tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add src/lib/dfir/tracer-graph.ts src/lib/dfir/tracer-graph.test.ts
git commit -m "feat(tracer): serialize/deserialize client graph for persistence"
```

---

### Task PC-2: Pure JSON/CSV export

**Files:** Create `src/lib/dfir/tracer-export.ts`, `src/lib/dfir/tracer-export.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/dfir/tracer-export.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toJSON, toCSV } from './tracer-export';
import { emptyGraph } from './tracer-graph';

function graph() {
  const g = emptyGraph('evm:0xroot');
  g.edges.set('tx1:evm:0xa', {
    id: 'tx1:evm:0xa',
    source: 'evm:0xroot',
    target: 'evm:0xa',
    direction: 'out',
    amount: '1,234 USDT',
    token: 'USDT',
    tx_hash: 'tx1',
    timestamp: '2026-06-11T00:00:00.000Z',
    confidence: 'candidate',
  });
  return g;
}

describe('tracer-export', () => {
  it('toJSON parses back to the serialized shape', () => {
    const parsed = JSON.parse(toJSON(graph())) as { seedId: string; edges: unknown[] };
    expect(parsed.seedId).toBe('evm:0xroot');
    expect(parsed.edges).toHaveLength(1);
  });

  it('toCSV emits a header + one row per edge with quoting', () => {
    const csv = toCSV(graph());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('from,to,amount,token,tx_hash,direction,confidence,timestamp');
    // amount "1,234 USDT" contains a comma → must be quoted
    expect(lines[1]).toContain('"1,234 USDT"');
    expect(lines[1]).toContain('evm:0xroot');
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/dfir/tracer-export.test.ts`.

- [ ] **Step 3: Implement**

`src/lib/dfir/tracer-export.ts`:

```ts
import { serializeGraph, type TracerGraph } from './tracer-graph';

export function toJSON(graph: TracerGraph): string {
  return JSON.stringify(serializeGraph(graph), null, 2);
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** One row per edge — a flow table for spreadsheets / legal hand-off. */
export function toCSV(graph: TracerGraph): string {
  const header = ['from', 'to', 'amount', 'token', 'tx_hash', 'direction', 'confidence', 'timestamp'];
  const rows = [...graph.edges.values()].map((e) =>
    [e.source, e.target, e.amount, e.token, e.tx_hash, e.direction, e.confidence, e.timestamp ?? '']
      .map((c) => csvCell(String(c)))
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/lib/dfir/tracer-export.test.ts`.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add src/lib/dfir/tracer-export.ts src/lib/dfir/tracer-export.test.ts
git commit -m "feat(tracer): pure JSON/CSV trace export"
```

---

### Task PC-3: D1 persistence helpers (`tracer-graphs.ts`)

**Files:** Create `api/src/lib/tracer-graphs.ts`

(No standalone unit test — needs a real D1; exercised by the route test in PC-4.)

- [ ] **Step 1: Implement**

`api/src/lib/tracer-graphs.ts`:

```ts
import type { D1Database } from '@cloudflare/workers-types';

export interface TracerGraphRow {
  id: string;
  investigation_id: string | null;
  title: string;
  seed_address: string;
  chain: string;
  graph_json: string;
  created_at: string;
  updated_at: string;
}

export type TracerGraphMeta = Omit<TracerGraphRow, 'graph_json'>;

const DDL = `CREATE TABLE IF NOT EXISTS tracer_graphs (
  id               TEXT PRIMARY KEY,
  investigation_id TEXT,
  title            TEXT NOT NULL,
  seed_address     TEXT NOT NULL,
  chain            TEXT NOT NULL,
  graph_json       TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracer_graphs_investigation ON tracer_graphs(investigation_id);`;

export async function ensureTracerGraphsTable(db: D1Database): Promise<void> {
  for (const stmt of DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await db.prepare(stmt).run();
  }
}

export async function saveTracerGraph(db: D1Database, row: TracerGraphRow): Promise<void> {
  await ensureTracerGraphsTable(db);
  await db
    .prepare(
      `INSERT OR REPLACE INTO tracer_graphs (id, investigation_id, title, seed_address, chain, graph_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id,
      row.investigation_id,
      row.title,
      row.seed_address,
      row.chain,
      row.graph_json,
      row.created_at,
      row.updated_at
    )
    .run();
}

export async function listTracerGraphs(db: D1Database): Promise<TracerGraphMeta[]> {
  await ensureTracerGraphsTable(db);
  const res = await db
    .prepare(
      `SELECT id, investigation_id, title, seed_address, chain, created_at, updated_at FROM tracer_graphs ORDER BY updated_at DESC`
    )
    .all();
  return (res.results ?? []) as unknown as TracerGraphMeta[];
}

export async function getTracerGraph(db: D1Database, id: string): Promise<TracerGraphRow | null> {
  await ensureTracerGraphsTable(db);
  const row = await db.prepare(`SELECT * FROM tracer_graphs WHERE id = ?`).bind(id).first();
  return (row as unknown as TracerGraphRow) ?? null;
}

export async function deleteTracerGraph(db: D1Database, id: string): Promise<void> {
  await ensureTracerGraphsTable(db);
  await db.prepare(`DELETE FROM tracer_graphs WHERE id = ?`).bind(id).run();
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc -p api/tsconfig.json --noEmit
git add api/src/lib/tracer-graphs.ts
git commit -m "feat(tracer): D1 persistence helpers for saved trace graphs"
```

---

### Task PC-4: Graphs CRUD routes + schema + registration + test

**Files:** Modify `api/src/lib/validation-schemas.ts`, `api/src/routes/tracer.ts`, `api/src/index.ts`; Test `api/test/routes/tracer.test.ts`

- [ ] **Step 1: Add the Zod schema** (validation-schemas.ts — after the Phase B tracer schemas / `tracerCalldataSchema`)

```ts
export const tracerGraphSaveSchema = z.object({
  title: z.string().min(1, 'title is required').max(120, 'title too long'),
  seed_address: z.string().min(1).max(200),
  chain: z.enum(['evm', 'btc', 'tron']),
  graph_json: z
    .string()
    .min(1)
    .max(512 * 1024, 'graph too large — prune it first'),
  investigation_id: z.string().max(64).optional(),
});
export type TracerGraphSaveInput = z.infer<typeof tracerGraphSaveSchema>;
```

- [ ] **Step 2: Add the handlers** (tracer.ts)

Imports:

```ts
import {
  ensureTracerGraphsTable,
  saveTracerGraph,
  listTracerGraphs,
  getTracerGraph,
  deleteTracerGraph,
  type TracerGraphRow,
} from '../lib/tracer-graphs';
import type { TracerGraphSaveInput } from '../lib/validation-schemas';
```

Handlers (append after the existing tracer handlers):

```ts
export async function tracerGraphSaveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerGraphSaveInput }).parsed;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'graph store unavailable' }, 503);
  const now = new Date().toISOString();
  const row: TracerGraphRow = {
    id: crypto.randomUUID(),
    investigation_id: input.investigation_id ?? null,
    title: input.title,
    seed_address: input.seed_address,
    chain: input.chain,
    graph_json: input.graph_json,
    created_at: now,
    updated_at: now,
  };
  await saveTracerGraph(db, row);
  return c.json({ id: row.id, title: row.title }, 201);
}

export async function tracerGraphListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'graph store unavailable' }, 503);
  return c.json({ graphs: await listTracerGraphs(db) }, 200);
}

export async function tracerGraphGetHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'graph store unavailable' }, 503);
  const row = await getTracerGraph(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row, 200);
}

export async function tracerGraphDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'graph store unavailable' }, 503);
  await deleteTracerGraph(db, c.req.param('id'));
  return c.json({ ok: true }, 200);
}
```

(`ensureTracerGraphsTable` is imported for parity but the helpers ensure internally; if your linter flags it unused, drop it from the import.)

- [ ] **Step 3: Register + admin-gate** (index.ts)

Add the handlers to the `./routes/tracer` import and `tracerGraphSaveSchema` to the validation-schemas import. Add the admin gate near the other targeted `app.use(..., requireAdminMiddleware)` lines:

```ts
app.use('/api/v1/tracer/graphs', requireAdminMiddleware);
app.use('/api/v1/tracer/graphs/*', requireAdminMiddleware);
```

Register near the other tracer routes:

```ts
app.post('/api/v1/tracer/graphs', validate('json', tracerGraphSaveSchema), tracerGraphSaveHandler);
app.get('/api/v1/tracer/graphs', tracerGraphListHandler);
app.get('/api/v1/tracer/graphs/:id', tracerGraphGetHandler);
app.delete('/api/v1/tracer/graphs/:id', tracerGraphDeleteHandler);
```

IMPORTANT: register `app.use('/api/v1/tracer/graphs', ...)` BEFORE the existing `app.use('/api/v1/tracer/labels', ...)`? No — order among `app.use` exact paths doesn't matter; just ensure the gate `app.use` lines are in the same admin-gate block (before route handlers run). The exact-path `/api/v1/tracer/graphs` gate does NOT catch `/api/v1/tracer/expand|label|calldata` (those stay public). The `/*` variant covers `/graphs/:id`.

- [ ] **Step 4: Write the route test** (append to `api/test/routes/tracer.test.ts`, reuse the mini-app helpers added in Phase B if present, else add them)

```ts
import {
  tracerGraphSaveHandler,
  tracerGraphListHandler,
  tracerGraphGetHandler,
  tracerGraphDeleteHandler,
} from '../../src/routes/tracer';
import { tracerGraphSaveSchema } from '../../src/lib/validation-schemas';

function graphsApp() {
  const a = new Hono<any>();
  a.use('/api/v1/tracer/graphs', requireAdminMiddleware);
  a.use('/api/v1/tracer/graphs/*', requireAdminMiddleware);
  a.post('/api/v1/tracer/graphs', validate('json', tracerGraphSaveSchema), tracerGraphSaveHandler);
  a.get('/api/v1/tracer/graphs', tracerGraphListHandler);
  a.get('/api/v1/tracer/graphs/:id', tracerGraphGetHandler);
  a.delete('/api/v1/tracer/graphs/:id', tracerGraphDeleteHandler);
  return a;
}
// reuse adminEnv() from the Phase B block if present; otherwise:
// const adminEnv = (): any => ({ ...testEnv, ADMIN_TOKEN: 'sekret' });
const bearer = { 'content-type': 'application/json', Authorization: 'Bearer sekret' };

describe('tracer graphs CRUD (admin, mini-app)', () => {
  it('401 without admin token', async () => {
    const r = await graphsApp().request('/api/v1/tracer/graphs', { method: 'GET' }, adminEnv());
    expect(r.status).toBe(401);
  });

  it('save → list → get → delete round-trip', async () => {
    const save = await graphsApp().request(
      '/api/v1/tracer/graphs',
      {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({
          title: 'Heist trace',
          seed_address: '0xabc',
          chain: 'evm',
          graph_json: '{"seedId":"evm:0xabc","nodes":[],"edges":[]}',
        }),
      },
      adminEnv()
    );
    expect(save.status).toBe(201);
    const { id } = (await save.json()) as { id: string };

    const list = await graphsApp().request('/api/v1/tracer/graphs', { headers: bearer }, adminEnv());
    const { graphs } = (await list.json()) as { graphs: { id: string; title: string }[] };
    expect(graphs.some((g) => g.id === id && g.title === 'Heist trace')).toBe(true);

    const get = await graphsApp().request(`/api/v1/tracer/graphs/${id}`, { headers: bearer }, adminEnv());
    const row = (await get.json()) as { graph_json: string };
    expect(row.graph_json).toContain('evm:0xabc');

    const del = await graphsApp().request(
      `/api/v1/tracer/graphs/${id}`,
      { method: 'DELETE', headers: bearer },
      adminEnv()
    );
    expect(del.status).toBe(200);
    const after = await graphsApp().request(`/api/v1/tracer/graphs/${id}`, { headers: bearer }, adminEnv());
    expect(after.status).toBe(404);
  });
});
```

NOTE: ensure `Hono`, `requireAdminMiddleware`, `validate`, `testEnv`/`adminEnv` are imported in the file (the Phase B admin block already imports most; add any missing). If `adminEnv` isn't already defined in the file, add `const adminEnv = (): any => ({ ...testEnv, ADMIN_TOKEN: 'sekret' });`.

- [ ] **Step 5: Run + typecheck + commit**

```bash
cd api && npm test -- routes/tracer    # dangerouslyDisableSandbox; all pass
cd .. && npx tsc -p api/tsconfig.json --noEmit
git add api/src/lib/validation-schemas.ts api/src/routes/tracer.ts api/src/index.ts api/test/routes/tracer.test.ts
git commit -m "feat(tracer): admin graphs CRUD (save/list/get/delete) + round-trip test"
```

---

### Task PC-5: Widen observable type for crypto pinning

**Files:** Modify `api/src/lib/validation-schemas.ts`, `api/src/routes/investigations.ts`

- [ ] **Step 1: Widen the validation enum** (validation-schemas.ts)

Change `investigationObservableSchema`:

```ts
export const investigationObservableSchema = z.object({
  type: z.enum(['ip', 'domain', 'hash', 'url', 'email', 'crypto-address', 'tx-hash']),
  value: z.string().min(1).max(2048),
  notes: z.string().max(2000).optional(),
});
```

- [ ] **Step 2: Widen the handler TS union** (investigations.ts, the `Observable` interface ~line 10)

```ts
type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'crypto-address' | 'tx-hash';
```

- [ ] **Step 3: Add a quick schema test** (append to `api/test/routes/tracer.test.ts` or a small new test; simplest inline):

```ts
import { investigationObservableSchema } from '../../src/lib/validation-schemas';

describe('investigationObservableSchema crypto widening', () => {
  it('accepts crypto-address and tx-hash', () => {
    expect(investigationObservableSchema.safeParse({ type: 'crypto-address', value: '0xabc' }).success).toBe(true);
    expect(investigationObservableSchema.safeParse({ type: 'tx-hash', value: '0xdeadbeef' }).success).toBe(true);
  });
});
```

- [ ] **Step 4: Typecheck + run + commit**

```bash
cd api && npm test -- routes/tracer
cd .. && npx tsc -p api/tsconfig.json --noEmit
git add api/src/lib/validation-schemas.ts api/src/routes/investigations.ts api/test/routes/tracer.test.ts
git commit -m "feat(tracer): allow crypto-address/tx-hash observables for investigation pinning"
```

---

### Task PC-6: Tracer UI — save / load / export / pin

**Files:** Modify `src/pages/dfir/Tracer.tsx`, `package.json`

- [ ] **Step 1: Add the `html-to-image` dependency**

```bash
npm install --save html-to-image
```

Verify it lands in `package.json` `dependencies`. (It is only ever imported dynamically — see Step 4 — so it stays out of the tracer page chunk.)

- [ ] **Step 2: Add save/load/pin state + handlers** to `Tracer.tsx`

Add imports:

```ts
import { serializeGraph, deserializeGraph } from '../../lib/dfir/tracer-graph';
import { toJSON, toCSV } from '../../lib/dfir/tracer-export';
```

Add state near the other `useState`s:

```ts
const [savedList, setSavedList] = useState<{ id: string; title: string; seed_address: string; chain: string }[] | null>(
  null
);
```

Add a download helper + handlers (inside the component):

```ts
const download = useCallback((filename: string, content: string | Blob, mime: string) => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}, []);

const saveTrace = useCallback(async () => {
  if (!graph) return;
  const title = window.prompt('Save trace as:', `${chain}:${seed.slice(0, 10)}`);
  if (!title) return;
  const res = await fetch('/api/v1/tracer/graphs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      seed_address: graph.nodes.get(graph.seedId)?.address ?? seed,
      chain,
      graph_json: JSON.stringify(serializeGraph(graph)),
    }),
  });
  if (res.status === 401 || res.status === 403) setError('Saving requires an admin session.');
  else if (!res.ok) setError(`Save failed (${res.status})`);
  else setError(null);
}, [graph, chain, seed]);

const loadList = useCallback(async () => {
  const res = await fetch('/api/v1/tracer/graphs');
  if (res.status === 401 || res.status === 403) return setError('Saved traces require an admin session.');
  if (res.ok) setSavedList(((await res.json()) as { graphs: typeof savedList }).graphs);
}, []);

const loadTrace = useCallback(async (id: string) => {
  const res = await fetch(`/api/v1/tracer/graphs/${id}`);
  if (!res.ok) return setError('Could not load that trace.');
  const row = (await res.json()) as { graph_json: string; seed_address: string; chain: TracerChain };
  try {
    const g = deserializeGraph(JSON.parse(row.graph_json));
    setGraph(g);
    setSeed(row.seed_address);
    setChain(row.chain);
    setSelected(null);
  } catch {
    setError('Saved trace is corrupted.');
  }
}, []);

const exportTrace = useCallback(
  async (fmt: 'json' | 'csv' | 'png') => {
    if (!graph) return;
    const base = `tracer-${chain}-${(graph.nodes.get(graph.seedId)?.address ?? 'trace').slice(0, 10)}`;
    if (fmt === 'json') return download(`${base}.json`, toJSON(graph), 'application/json');
    if (fmt === 'csv') return download(`${base}.csv`, toCSV(graph), 'text/csv');
    // PNG — dynamic import keeps html-to-image out of the page chunk
    try {
      const { toPng } = await import('html-to-image');
      const vp = document.querySelector('.react-flow__viewport') as HTMLElement | null;
      const flow = document.querySelector('.react-flow') as HTMLElement | null;
      const target = vp ?? flow;
      if (!target) return setError('Canvas not ready for export.');
      const dataUrl = await toPng(target, { backgroundColor: '#0b0f1a', pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${base}.png`;
      a.click();
    } catch {
      setError('PNG export failed — JSON/CSV still work.');
    }
  },
  [graph, chain, download]
);

const pinToInvestigation = useCallback(async (value: string, type: 'crypto-address' | 'tx-hash') => {
  const listRes = await fetch('/api/v1/investigations');
  if (listRes.status === 401 || listRes.status === 403) return setError('Pinning requires an admin session.');
  if (!listRes.ok) return setError('Could not load investigations.');
  const { investigations } = (await listRes.json()) as { investigations: { id: string; title: string }[] };
  if (!investigations?.length) return setError('No investigations exist yet — create one in the workspace first.');
  const choice = window.prompt(
    `Pin to which investigation?\n${investigations.map((i, n) => `${n + 1}. ${i.title}`).join('\n')}`,
    '1'
  );
  const idx = choice ? Number(choice) - 1 : -1;
  const inv = investigations[idx];
  if (!inv) return;
  const res = await fetch(`/api/v1/investigations/${inv.id}/observables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, type }),
  });
  setError(res.ok ? null : `Pin failed (${res.status})`);
}, []);
```

NOTE: confirm `GET /api/v1/investigations` returns `{ investigations: [...] }` — open `listInvestigationsHandler` in `api/src/routes/investigations.ts` and match the actual response key (it may return an array directly or under a different key). Adjust the destructure to match. Report what you found.

- [ ] **Step 3: Add the toolbar buttons** in the control rail (after the existing "Find cash-out" button):

```tsx
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800 disabled:opacity-40" disabled={!graph} onClick={saveTrace}>
              Save trace
            </button>
            <button className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800" onClick={loadList}>
              Load…
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button className="rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800 disabled:opacity-40" disabled={!graph} onClick={() => void exportTrace('json')}>JSON</button>
            <button className="rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800 disabled:opacity-40" disabled={!graph} onClick={() => void exportTrace('csv')}>CSV</button>
            <button className="rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800 disabled:opacity-40" disabled={!graph} onClick={() => void exportTrace('png')}>PNG</button>
          </div>
          {savedList ? (
            <div className="rounded border border-gray-700 p-2 text-xs">
              <span className="text-gray-400">Saved traces</span>
              {savedList.length ? (
                <ul className="mt-1 space-y-1">
                  {savedList.map((s) => (
                    <li key={s.id}>
                      <button className="w-full truncate text-left hover:text-blue-400" onClick={() => void loadTrace(s.id)}>
                        {s.title} <span className="text-gray-500">({s.chain})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">none yet</p>
              )}
            </div>
          ) : null}
```

- [ ] **Step 4: Add "Pin to investigation"** in the detail panel — alongside the node action buttons (after "Open explorer"):

```tsx
<button
  className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800"
  onClick={() => void pinToInvestigation(selected.address, 'crypto-address')}
>
  Pin to investigation
</button>
```

And in the per-tx "Transactions" list (next to "Inspect calldata"), add a small pin button:

```tsx
<button
  className="rounded border border-gray-600 px-1 text-[10px] hover:bg-gray-800"
  onClick={() => void pinToInvestigation(e.tx_hash, 'tx-hash')}
>
  pin
</button>
```

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p tsconfig.json --noEmit   # ignore only src/.../osint errors if any pre-existing
git add src/pages/dfir/Tracer.tsx package.json package-lock.json
git commit -m "feat(tracer): save/load/export(JSON,CSV,PNG)/pin investigation UI"
```

- [ ] **Step 6: (optional) bundle-budget sanity** — run `npm run build` and confirm `check-budgets` passes (html-to-image should be in its own async chunk via the dynamic import; if a budget trips, that's a signal the dynamic import regressed to static — verify the `await import('html-to-image')` is the only reference).

---

## Final verification (after all tasks)

- [ ] `cd api && npm test -- routes/tracer lib/calldata-analysis lib/chain-sources lib/risk-score lib/address-labels` green.
- [ ] `npx vitest run src/lib/dfir/tracer-graph.test.ts src/lib/dfir/tracer-export.test.ts` green.
- [ ] `npx tsc -p api/tsconfig.json --noEmit`, `npx tsc -p api/tsconfig.worker.json --noEmit`, `npx tsc -p tsconfig.json --noEmit` clean.
- [ ] Manual smoke at `/dfir/tracer` (admin session): seed → expand → Save trace → reload page → Load… → the trace returns; Export JSON/CSV/PNG download; Pin a node to an investigation and see it in the workspace.
- [ ] Land + deploy: this is the user's call (merge tracer-only onto current origin/main like the A+B landing, then `npm run deploy` from root).

---

## Self-Review (completed during planning)

**Spec coverage:** §1 saved graphs → PC-3 (D1) + PC-4 (routes) + PC-1 (client serialize). §2 pinning → PC-5 (type widening) + PC-6 Step 4 (UI). §3 export → PC-2 (JSON/CSV pure) + PC-6 (PNG dynamic + UI). §4 UI → PC-6. §6 error handling → 503 (PC-4 handlers), 404 (get), malformed→empty (PC-1 deserialize), 512KB cap (PC-4 schema), PNG catch + admin-only messaging (PC-6). §7 testing → PC-1/PC-2 pure tests, PC-4 round-trip, PC-5 schema test. Non-goals respected (private-only, no versioning/sharing).

**Placeholder scan:** none — every step has complete code/commands. (Two verify-against-reality notes: the `GET /investigations` response key in PC-6 Step 2, and reusing the Phase B `adminEnv`/imports in PC-4 — both instruct the engineer to confirm and adjust, which is correct since those depend on the live file.)

**Type consistency:** `TracerGraph`/`TracerNode`/`TracerEdge` reused from tracer-graph.ts; `SerializedGraph` defined in PC-1 and consumed by PC-2 (`serializeGraph`); `TracerGraphRow`/`TracerGraphMeta` defined in PC-3 and consumed in PC-4; `tracerGraphSaveSchema`/`TracerGraphSaveInput` defined in PC-4 Step 1 and used in PC-4 Step 2/3 + test; observable `'crypto-address'|'tx-hash'` consistent across PC-5 (schema + union) and PC-6 (pin calls).

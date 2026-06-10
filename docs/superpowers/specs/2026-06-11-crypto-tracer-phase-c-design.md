# Crypto Fund-Flow Tracer — Phase C (Investigation Workspace) Design Spec

**Date:** 2026-06-11
**Status:** Draft — awaiting user review
**Scope:** Phase C of the Fund-Flow Tracer. Builds on Phases A+B (merged to
`origin/main`, live at `/dfir/tracer`). Make a trace **savable, reloadable,
exportable, and pinnable into the existing investigations workspace**.

**Parent spec:** `docs/superpowers/specs/2026-06-10-crypto-fund-flow-tracer-design.md`
**Phase B spec:** `docs/superpowers/specs/2026-06-11-crypto-tracer-phase-b-design.md`

---

## Background

Phases A+B shipped the tracer: hop-by-hop fund-flow graph (EVM/BTC/Tron),
labels + risk, calldata/TxDataHiding inspector, BTC clustering, auto-path. But a
trace lives only in browser memory — close the tab and it's gone. Phase C delivers
the user's original third ask ("case / investigation workspace"): **persist a
trace, reload it, export it, and tie it into the existing case-management
workspace** (`investigations`, which already has severity/TLP/tasks/timeline).

This is mostly **integration + persistence**, not new case-management UI — the
`investigations` workspace already exists and is admin-gated.

## Decisions (locked, from brainstorming)

- **Saved graphs + investigation pinning** (both).
- **Export: JSON + CSV + PNG.**
- **Private / admin-only** — no public share links (saved traces are sensitive).
- PNG via **dynamic-imported** `html-to-image` (keeps it out of the main/tracer
  chunk → no bundle-budget regression).

## Hard constraints (unchanged)

- D1 binding `BRIEFINGS_DB`; tables via the **runtime-ensure pattern** (no migration).
- `validate()` schemas mirror handler reads.
- Admin-gated POSTs in route tests use the **report.test.ts mini-app pattern**
  (Hono app + inline `env` with `ADMIN_TOKEN:'sekret'` + `Authorization: Bearer`).
- api tsconfig has `noUncheckedIndexedAccess` — guard indexed access.
- 3× `tsc --noEmit`; route tests run un-sandboxed (CI skips `test/routes/`).

---

## §1 · Saved trace graphs (admin)

**New runtime-ensure table** (`ensureTracerGraphsTable(db)` in a new
`api/src/lib/tracer-graphs.ts`):

```sql
CREATE TABLE IF NOT EXISTS tracer_graphs (
  id               TEXT PRIMARY KEY,
  investigation_id TEXT,
  title            TEXT NOT NULL,
  seed_address     TEXT NOT NULL,
  chain            TEXT NOT NULL,
  graph_json       TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracer_graphs_investigation ON tracer_graphs(investigation_id);
```

`graph_json` stores the serialized client graph (nodes/edges arrays + seedId).

**Persistence helpers** (`tracer-graphs.ts`, D1): `ensureTracerGraphsTable`,
`saveTracerGraph(db, row)`, `listTracerGraphs(db)` (metadata only — id/title/seed/
chain/updated_at, NOT the full json), `getTracerGraph(db, id)`, `deleteTracerGraph(db, id)`.
Each ensures the table first; tolerant of an unbound db (503 at the route).

**Routes** (`api/src/routes/tracer.ts`, extend) — **admin-gated**:

- `POST /api/v1/tracer/graphs` — body `{title, seed_address, chain, graph_json, investigation_id?}` → `{id}`. (Server generates the id.)
- `GET /api/v1/tracer/graphs` — list metadata.
- `GET /api/v1/tracer/graphs/:id` — full row incl. `graph_json`.
- `DELETE /api/v1/tracer/graphs/:id`.
- Gate: `app.use('/api/v1/tracer/graphs', requireAdminMiddleware)` + `'/api/v1/tracer/graphs/*'`.
- Zod `tracerGraphSaveSchema` (title ≤120, seed_address ≤200, chain enum, graph_json
  string ≤ 512KB, investigation_id ≤64 optional) mirroring the POST reads.

**Client serialization** (`src/lib/dfir/tracer-graph.ts`, extend) — **pure**:

- `serializeGraph(graph: TracerGraph): { seedId: string; nodes: TracerNode[]; edges: TracerEdge[] }`
- `deserializeGraph(data): TracerGraph` (rebuilds the Maps; tolerant of malformed input → empty graph).
  Round-trip: `deserializeGraph(serializeGraph(g))` ≡ `g`.

---

## §2 · Investigation pinning

The `investigations` workspace already stores observables. Widen the observable
**type** so crypto artifacts can be pinned:

- `api/src/lib/validation-schemas.ts`: `investigationObservableSchema.type` enum
  `['ip','domain','hash','url','email']` → add `'crypto-address'`, `'tx-hash'`.
- `api/src/routes/investigations.ts`: widen the `Observable.type` TS union (line ~10)
  to include the two new values. The D1 column is free TEXT — **no migration**.

**UI:** a "Pin to investigation" action on a selected node (address → `crypto-address`)
and on an inspected tx (→ `tx-hash`): fetch `GET /api/v1/investigations` (admin), let
the analyst pick one, `POST /api/v1/investigations/:id/observables`. Admin-gated, so it
works when an admin token is present (same as Phase B label-add). No new
case-management screens — reuses the existing investigation pages.

---

## §3 · Export (client-side, pure + dynamic PNG)

**New `src/lib/dfir/tracer-export.ts`** — pure, no deps, unit-tested:

- `toJSON(graph: TracerGraph): string` — `JSON.stringify(serializeGraph(graph), null, 2)` (re-importable).
- `toCSV(graph: TracerGraph): string` — one row per edge: `from,to,amount,token,tx_hash,direction,confidence,timestamp` with a header and proper quoting.

**PNG** — a thin helper invoked from the component, using React Flow's
`getNodesBounds`/`getViewportForBounds` (from `@xyflow/react`, already a dep) +
`toPng` from `html-to-image` **imported dynamically** inside the click handler
(`const { toPng } = await import('html-to-image')`). The dependency is added to
`package.json` but, via dynamic import, lands in its own async chunk — not the
tracer page chunk — so the bundle budget is unaffected.

**UI:** an "Export ▾" control offering JSON / CSV / PNG; each builds a Blob and
triggers a download (`<a download>`). JSON/CSV are instant; PNG snapshots the canvas.

---

## §4 · UI wiring (`src/pages/dfir/Tracer.tsx`)

- **Save trace** button → prompt for a title → `POST /tracer/graphs` with
  `serializeGraph(graph)`. On success show the saved id/title.
- **Load** → a collapsible list from `GET /tracer/graphs`; clicking an entry does
  `GET /tracer/graphs/:id` → `deserializeGraph` → `setGraph`.
- **Export ▾** → JSON / CSV / PNG (§3).
- **Pin to investigation** → on the selected node + on an inspected tx (§2).
- Save/Load/Pin call admin endpoints (work with an admin token, like label-add);
  expand/calldata stay public. If a call returns 401/403, surface "admin only".

---

## §5 · Non-goals (YAGNI)

- No public share-by-link (private/admin only).
- No graph diffing, versioning, or auto-save (manual save only; re-save overwrites by id).
- No collaborative/multi-user editing.
- No new investigation case-management UI — pin into the existing workspace.
- No server-side render/export — JSON/CSV/PNG are all client-side.

---

## §6 · Error handling

- `BRIEFINGS_DB` unbound → graphs routes return 503 `{error:'graph store unavailable'}`.
- `GET /tracer/graphs/:id` unknown id → 404.
- `deserializeGraph` malformed json → empty graph (never throws); the load UI shows "couldn't load".
- `graph_json` over the schema cap (512KB) → 400 (validate); the UI warns to prune the graph first.
- PNG export failure (dynamic import / render) → caught; toast "PNG export failed", JSON/CSV still work.
- Pin when not admin → 401/403 surfaced as "admin only".

## §7 · Testing

- `src/lib/dfir/tracer-graph.test.ts` (extend) — `serializeGraph`/`deserializeGraph` round-trip (incl. confirmed-edge state preserved); malformed input → empty graph.
- `src/lib/dfir/tracer-export.test.ts` (new) — `toCSV` header + a row with correct quoting/escaping; `toJSON` parses back to the serialized shape.
- `api/test/routes/tracer.test.ts` (extend) — mini-app: admin-gate on `/tracer/graphs` (401 without token); save→list→get→delete round-trip against the test D1 (asserts list returns metadata, get returns `graph_json`, delete 404s afterward).
- Observable widening — assert `investigationObservableSchema` accepts `type:'crypto-address'`.

---

## §8 · File structure

**New:**

- `api/src/lib/tracer-graphs.ts` — D1 persistence helpers.
- `src/lib/dfir/tracer-export.ts` — pure JSON/CSV serializers.
- `src/lib/dfir/tracer-export.test.ts`.

**Modified:**

- `api/src/lib/validation-schemas.ts` — `tracerGraphSaveSchema`; widen `investigationObservableSchema.type`.
- `api/src/routes/tracer.ts` — graphs CRUD handlers.
- `api/src/routes/investigations.ts` — widen `Observable.type` union.
- `api/src/index.ts` — register graphs routes + admin-gate the subpath.
- `src/lib/dfir/tracer-graph.ts` — `serializeGraph`/`deserializeGraph`.
- `src/pages/dfir/Tracer.tsx` — save/load/export/pin UI.
- `package.json` — add `html-to-image` (dynamic-imported).
- test extensions above.

---

## Summary

Phase C closes the loop: a trace can be **saved, listed, reloaded, exported
(JSON/CSV/PNG), and pinned into the existing admin investigations workspace** —
all private/admin-only, reusing the case-management workspace wholesale, with the
PNG dependency dynamically imported so the bundle budget is untouched. Pure
serialization + export functions are unit-tested; the admin graphs CRUD is
round-trip-tested against the test D1 via the mini-app pattern.

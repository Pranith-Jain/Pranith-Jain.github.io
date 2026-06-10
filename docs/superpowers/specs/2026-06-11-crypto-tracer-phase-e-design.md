# Crypto Fund-Flow Tracer — Phase E (Monitoring & Alerts) Design Spec

**Date:** 2026-06-11
**Status:** Draft — awaiting user review
**Scope:** Phase E. Watch a crypto address; on the hourly cron, detect new
movement and raise alerts (in-app feed + opt-in webhook). Mirrors the existing
Certificate-Transparency monitor (`ct-monitor.ts` + `watch-engine.ts`).

**Parent spec:** `docs/superpowers/specs/2026-06-10-crypto-fund-flow-tracer-design.md`

## Background

Phases A–C are live. Phase E adds MetaSleuth-style monitoring: an analyst watches
an address and gets alerted when it moves. The repo already has the canonical
"watch → diff on cron → pulled feed (+ webhook)" pattern in `ct-monitor.ts` /
`watch-engine.ts`, with `checkWatches()` already firing in the `0 * * * *` cron.
Phase E clones that pattern for addresses.

## Decisions (locked, from brainstorming)

- **Alert types (all three):** `new_transfer` (any movement), `suspicious_counterparty`
  (OFAC/ScamSniffer hit on a new counterparty), `large_transfer` (raw-amount threshold).
- **Delivery:** in-app pulled feed **+** opt-in user-supplied webhook.
- **Fingerprint:** latest tx_hash (one cheap call per address; native-only value-move
  blind spot accepted for v1).

## Hard constraints

- **≤ 50 subrequests / invocation.** The hourly cron is already busy → the sweep does
  **one** `fetchTransfers` call per watched address, oldest-first, capped per tick;
  offload to `FEEDS_QUEUE` if watches outgrow a tick. No per-address cache ops.
- D1 binding `BRIEFINGS_DB`; runtime-ensure tables (no migration).
- **No new cron expression** (Free-plan 5-cron cap) — hook into the existing `0 * * * *`
  block beside `checkWatches()`; inherit the `acquireCronLease` single-flight.
- Watch routes are **admin-gated** (like `watches.ts`/`ct-monitor`).
- `validate()` schemas mirror handler reads; route tests un-sandboxed (mini-app for admin).

---

## §1 · Data model (runtime-ensure, `BRIEFINGS_DB`)

```sql
CREATE TABLE IF NOT EXISTS address_watch (
  address          TEXT NOT NULL,
  chain            TEXT NOT NULL,              -- 'evm' | 'btc' | 'tron'
  alert_types      TEXT NOT NULL,              -- JSON: ['new_transfer','suspicious_counterparty','large_transfer']
  min_amount       REAL,                       -- raw-token threshold for large_transfer (nullable)
  webhook_url      TEXT,                        -- opt-in push (nullable)
  label            TEXT,                        -- analyst note
  added_at         TEXT NOT NULL,
  last_checked     TEXT,
  last_fingerprint TEXT,                        -- newest tx_hash seen
  PRIMARY KEY (address, chain)
);
CREATE TABLE IF NOT EXISTS address_alerts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  address      TEXT NOT NULL,
  chain        TEXT NOT NULL,
  alert_type   TEXT NOT NULL,                   -- one of the three
  detail       TEXT NOT NULL,                   -- JSON: the net-new transfer(s)
  detected_at  TEXT NOT NULL,
  webhook_sent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_address_alerts_addr ON address_alerts(address, chain);
```

Watch identity is the **(address, chain)** composite (an EVM address can be valid on
multiple chains — keep them distinct).

## §2 · The diff engine — `checkAddressWatches(env, now, db)`

Lives in a new `api/src/lib/address-watch.ts` (sibling to `watch-engine.ts`; reuses
its `appendAlertLog`/webhook-dispatch helpers where they fit). Per tick:

1. `SELECT … FROM address_watch ORDER BY last_checked ASC LIMIT SWEEP_BATCH` (default 15).
2. For each: `fetchTransfers(chain, address, { maxTransfers: 25 })` — **one** call.
3. `newest = transfers[0]?.tx_hash`. If `newest === last_fingerprint` → no change; just
   update `last_checked`.
4. Else: walk `transfers` until the stored `last_fingerprint` (or the whole page on
   first run) → the **net-new transfers**. For each, evaluate the watch's `alert_types`:
   - `new_transfer` → always emits.
   - `large_transfer` → emits if `amount_num >= min_amount` (uses the existing parsed
     amount; raw token units, no price feed).
   - `suspicious_counterparty` → load the OFAC + ScamSniffer sets ONCE per sweep (cached;
     reuse `loadSanctionedSet`/`loadScamSnifferSet`), emit if a counterparty is in either set.
5. Insert `address_alerts` rows; if `webhook_url` set, POST
   `{address, chain, alerts:[{alert_type, transfer}]}` (mark `webhook_sent`).
6. Update `last_checked` + `last_fingerprint = newest`.

**Budget:** N calls for N watched addresses (≤ SWEEP_BATCH per tick) + ~3 cached
set-loads. If watch count regularly exceeds the per-tick budget, enqueue one
`FEEDS_QUEUE` message per address (consumer does one fetch per invocation), mirroring
`live-iocs`/`gp:warm`. `log()` what was deferred — no silent truncation.

## §3 · Routes (admin-gated, `/api/v1/crypto-monitor/*`)

- `POST /api/v1/crypto-monitor/watch` — body `{address, chain, alert_types[], min_amount?, webhook_url?, label?}` → adds a watch (seeds `last_fingerprint` from the current newest tx so the first alert is genuinely _new_).
- `GET /api/v1/crypto-monitor/watches` — list watches + last_checked.
- `DELETE /api/v1/crypto-monitor/watch/:address/:chain` — remove.
- `GET /api/v1/crypto-monitor/alerts?address=&chain=` — pulled alert feed (newest first, capped).
- Admin-gate: `app.use('/api/v1/crypto-monitor', requireAdminMiddleware)` + `/*`.
- Zod `cryptoWatchAddSchema` mirroring the POST reads.

## §4 · Cron wiring

In `worker/scheduled.ts`, inside the existing `0 * * * *` branch (next to the
`checkWatches()` call), add:
`ctx.waitUntil(checkAddressWatches(env, now, db).catch(logCronFail('crypto-monitor')));`
No new cron expression; inherits the existing lease/single-flight.

## §5 · UI (`src/pages/dfir/Tracer.tsx`)

- A **"Watch address"** button on the selected node (admin-gated, like Phase C's
  pin/save) → opens a small form (alert types, optional min-amount + webhook) →
  `POST /crypto-monitor/watch`.
- An **alerts feed** panel (collapsible) cloned from `CtMonitor.tsx`: `GET
/crypto-monitor/alerts` for the selected address → shows recent movement alerts
  with type + transfer detail; a node with active alerts gets a badge.

## §6 · Non-goals (YAGNI)

- No email/Telegram delivery (no email binding; webhook + in-app only).
- No price-USD thresholds (raw token units).
- No native-only value-move detection (token-transfer fingerprint only; documented blind spot).
- No per-tx push streaming; hourly cadence only.
- No multi-user ownership model (admin-scoped, like the rest of the workspace).

## §7 · Error handling

- `fetchTransfers` failure for a watch → skip it this tick (update `last_checked`, keep `last_fingerprint`); never throw out of the sweep.
- Webhook POST failure → alert still stored in-app; `webhook_sent` stays 0 (retried next detection, not retried in a loop).
- `BRIEFINGS_DB` unbound → watch routes 503; cron sweep no-ops.
- Duplicate watch (same address+chain) → upsert (idempotent add).
- First check after add → `last_fingerprint` seeded at add-time, so no spurious "all history is new" alert.

## §8 · Testing

- `api/test/lib/address-watch.test.ts` — the diff logic as a **pure** core
  (`diffTransfers(transfers, lastFingerprint) → newOnes`) + alert-type evaluation
  (`evaluateAlerts(watch, newTransfers, sanctionedSet, scamSet) → AlertRow[]`):
  new_transfer emits for any; large_transfer respects min_amount; suspicious_counterparty
  fires on a flagged counterparty; no-change when fingerprint unchanged.
- `api/test/routes/crypto-monitor.test.ts` (mini-app) — admin gate (401), add→list→
  alerts→delete round-trip against the test D1; schema 400 on bad chain.
- The cron hook is covered by the engine unit test (the `checkAddressWatches` wrapper
  is thin glue over the pure core + D1).

## §9 · File structure

**New:** `api/src/lib/address-watch.ts` (pure `diffTransfers`/`evaluateAlerts` + the
D1-backed `checkAddressWatches` + ensure-tables), `api/src/routes/crypto-monitor.ts`
(4 handlers), `api/test/lib/address-watch.test.ts`, `api/test/routes/crypto-monitor.test.ts`.
**Modified:** `api/src/lib/validation-schemas.ts` (`cryptoWatchAddSchema`),
`api/src/index.ts` (routes + admin gate), `worker/scheduled.ts` (cron hook),
`src/pages/dfir/Tracer.tsx` (watch button + alerts feed).

## Summary

Phase E clones the proven ct-monitor watch/diff/feed pattern for crypto addresses:
a budget-safe hourly sweep fingerprints each watched address by its newest tx_hash,
emits net-new-transfer alerts (any / suspicious-counterparty / large), surfaces them
in a pulled feed, and optionally pushes to a user webhook — all admin-gated, no new
cron, no migration, reusing `fetchTransfers` + the OFAC/ScamSniffer sets.

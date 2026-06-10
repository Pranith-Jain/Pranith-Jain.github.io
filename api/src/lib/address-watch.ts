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

// ── D1 layer + sweep engine ──────────────────────────────────────
import type { D1Database } from '@cloudflare/workers-types';
import { fetchTransfers } from './chain-sources';
import { loadSanctionedSet } from './ofac-sanctions';
import { loadScamSnifferSet } from './scamsniffer';
import { pinnedFetch } from './ssrf-guard';

const SWEEP_BATCH = 10;

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
  const fp = await currentFingerprint(w.chain, w.address);
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
export async function checkAddressWatches(now: string, db: D1Database): Promise<number> {
  await ensureAddressWatchTables(db);
  const res = await db
    .prepare(`SELECT * FROM address_watch ORDER BY last_checked ASC NULLS FIRST LIMIT ?`)
    .bind(SWEEP_BATCH)
    .all();
  const watches = ((res.results ?? []) as unknown as WatchDbRow[]).map(rowToWatch);
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
          await pinnedFetch(w.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: w.address,
              chain: w.chain,
              alerts: alerts.map((a) => ({ alert_type: a.alert_type, transfer: a.transfer })),
            }),
            signal: AbortSignal.timeout(5000),
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
      try {
        await db
          .prepare(`UPDATE address_watch SET last_checked = ? WHERE address = ? AND chain = ?`)
          .bind(now, w.address, w.chain)
          .run();
      } catch {
        /* leave last_checked stale; ORDER BY last_checked ASC NULLS FIRST re-selects next tick */
      }
    }
  }
  return alertCount;
}

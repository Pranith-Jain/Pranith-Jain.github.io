import type { D1Database } from '@cloudflare/workers-types';
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

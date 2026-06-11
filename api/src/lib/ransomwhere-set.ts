import type { RiskScore } from './risk-score';

/** Raw row from the Ransomwhere crowdsourced API. */
export interface RansomwhereRow {
  address?: string;
  blockchain: string;
  family: string;
}

/**
 * In-memory index: blockchain-normalised address → ransomware family.
 *
 * - EVM addresses are lowercased for case-insensitive matching.
 * - Bitcoin addresses are stored as-is.
 * - Untraceable chains (monero) and rows without an address are dropped.
 */
export type RansomMap = Map<string, string>;

export function buildRansomMap(data: RansomwhereRow[] | null | undefined): RansomMap {
  if (!Array.isArray(data)) return new Map();

  const map: RansomMap = new Map();

  for (const row of data) {
    if (!row.address) continue;
    if (row.blockchain === 'monero') continue;

    const key = row.blockchain === 'ethereum' ? row.address.toLowerCase() : row.address;

    map.set(key, row.family || '');
  }

  return map;
}

export function checkRansomwhere(
  map: RansomMap,
  chain: 'evm' | 'btc' | 'tron',
  address: string
): { flagged: boolean; family: string | null } {
  if (chain === 'tron') {
    return { flagged: false, family: null };
  }

  const key = chain === 'evm' ? address.toLowerCase() : address;
  const family = map.get(key);

  if (family === undefined) {
    return { flagged: false, family: null };
  }

  return { flagged: true, family: family || null };
}

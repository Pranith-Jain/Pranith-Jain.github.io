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

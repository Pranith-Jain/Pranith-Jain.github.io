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

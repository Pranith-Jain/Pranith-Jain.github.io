/**
 * Curated explorer / NFT marketplace / scam-flag deep links per chain.
 * Used by /dfir/crypto-trace to render a one-click pivot grid for any
 * inspected address.
 */

export interface ExplorerLink {
  label: string;
  /** URL template - `${ADDR}` placeholder. */
  url: string;
  /** Optional category for grouping in UI. */
  category: 'explorer' | 'nft' | 'defi' | 'scam-check' | 'analytics';
}

export interface ChainExplorerSet {
  chain: string;
  label: string;
  links: ExplorerLink[];
}

const make = (label: string, url: string, category: ExplorerLink['category']): ExplorerLink => ({
  label,
  url,
  category,
});

const SCAM_CHECKS_GENERIC: ExplorerLink[] = [
  make('Chainabuse search', 'https://www.chainabuse.com/address/${ADDR}', 'scam-check'),
  make('OFAC SDN search', 'https://sanctionssearch.ofac.treas.gov/Default.aspx', 'scam-check'),
  make('ScamSniffer', 'https://scamsniffer.io/', 'scam-check'),
];

export const EXPLORERS: Record<string, ChainExplorerSet> = {
  btc: {
    chain: 'btc',
    label: 'Bitcoin',
    links: [
      make('mempool.space', 'https://mempool.space/address/${ADDR}', 'explorer'),
      make('Blockstream', 'https://blockstream.info/address/${ADDR}', 'explorer'),
      make('OXT.me', 'https://oxt.me/address/${ADDR}', 'analytics'),
      make('Blockchain.com', 'https://www.blockchain.com/btc/address/${ADDR}', 'explorer'),
      ...SCAM_CHECKS_GENERIC,
    ],
  },
  eth: {
    chain: 'eth',
    label: 'Ethereum',
    links: [
      make('Etherscan', 'https://etherscan.io/address/${ADDR}', 'explorer'),
      make('Etherscan tokens', 'https://etherscan.io/tokenholdings?a=${ADDR}', 'explorer'),
      make('Etherscan NFTs', 'https://etherscan.io/nft-holdings?a=${ADDR}', 'nft'),
      make('OpenSea', 'https://opensea.io/${ADDR}', 'nft'),
      make('Blur', 'https://blur.io/eth/user/${ADDR}', 'nft'),
      make('LooksRare', 'https://looksrare.org/accounts/${ADDR}', 'nft'),
      make('Zerion', 'https://app.zerion.io/${ADDR}/overview', 'defi'),
      make('DeBank', 'https://debank.com/profile/${ADDR}', 'defi'),
      make('Revoke.cash', 'https://revoke.cash/address/${ADDR}', 'defi'),
      make('Etherscan token-approval', 'https://etherscan.io/tokenapprovalchecker?search=${ADDR}', 'defi'),
      ...SCAM_CHECKS_GENERIC,
    ],
  },
  polygon: {
    chain: 'polygon',
    label: 'Polygon',
    links: [
      make('PolygonScan', 'https://polygonscan.com/address/${ADDR}', 'explorer'),
      make('PolygonScan tokens', 'https://polygonscan.com/tokenholdings?a=${ADDR}', 'explorer'),
      make('OpenSea (Polygon)', 'https://opensea.io/${ADDR}', 'nft'),
      make('DeBank', 'https://debank.com/profile/${ADDR}', 'defi'),
      ...SCAM_CHECKS_GENERIC,
    ],
  },
  bsc: {
    chain: 'bsc',
    label: 'BNB Smart Chain',
    links: [
      make('BscScan', 'https://bscscan.com/address/${ADDR}', 'explorer'),
      make('BscScan tokens', 'https://bscscan.com/tokenholdings?a=${ADDR}', 'explorer'),
      make('DeBank', 'https://debank.com/profile/${ADDR}', 'defi'),
      ...SCAM_CHECKS_GENERIC,
    ],
  },
  arbitrum: {
    chain: 'arbitrum',
    label: 'Arbitrum One',
    links: [
      make('Arbiscan', 'https://arbiscan.io/address/${ADDR}', 'explorer'),
      make('Arbiscan tokens', 'https://arbiscan.io/tokenholdings?a=${ADDR}', 'explorer'),
      make('DeBank', 'https://debank.com/profile/${ADDR}', 'defi'),
      ...SCAM_CHECKS_GENERIC,
    ],
  },
  optimism: {
    chain: 'optimism',
    label: 'Optimism',
    links: [
      make('Optimism Etherscan', 'https://optimistic.etherscan.io/address/${ADDR}', 'explorer'),
      make('DeBank', 'https://debank.com/profile/${ADDR}', 'defi'),
      ...SCAM_CHECKS_GENERIC,
    ],
  },
  base: {
    chain: 'base',
    label: 'Base',
    links: [
      make('BaseScan', 'https://basescan.org/address/${ADDR}', 'explorer'),
      make('OpenSea (Base)', 'https://opensea.io/${ADDR}', 'nft'),
      make('DeBank', 'https://debank.com/profile/${ADDR}', 'defi'),
      ...SCAM_CHECKS_GENERIC,
    ],
  },
  solana: {
    chain: 'solana',
    label: 'Solana',
    links: [
      make('Solscan', 'https://solscan.io/account/${ADDR}', 'explorer'),
      make('SolanaFM', 'https://solana.fm/address/${ADDR}', 'explorer'),
      make('Helius XRAY', 'https://xray.helius.xyz/account/${ADDR}', 'analytics'),
      make('Magic Eden', 'https://magiceden.io/u/${ADDR}', 'nft'),
      make('Tensor', 'https://www.tensor.trade/portfolio?wallet=${ADDR}', 'nft'),
      make('Step Finance', 'https://app.step.finance/en/dashboard?watching=${ADDR}', 'defi'),
      ...SCAM_CHECKS_GENERIC,
    ],
  },
};

export const CATEGORY_LABELS: Record<ExplorerLink['category'], string> = {
  explorer: 'Block explorer',
  nft: 'NFT',
  defi: 'DeFi / portfolio',
  'scam-check': 'Scam check',
  analytics: 'Analytics',
};

export const CATEGORY_ORDER: ExplorerLink['category'][] = ['explorer', 'nft', 'defi', 'analytics', 'scam-check'];

export function buildLink(template: string, addr: string): string {
  return template.replace(/\$\{ADDR\}/g, encodeURIComponent(addr));
}

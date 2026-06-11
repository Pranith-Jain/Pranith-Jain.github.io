/**
 * Blockscout (eth.blockscout.com) public-API client.
 *
 * Two queries, both EVM-mainnet only, both cached at the edge:
 *   - getAddressContext(addr)  — ENS reverse, label, contract/EOA, reputation.
 *   - getRecentTransfers(addr) — last N ERC-20 transfers in/out, normalised.
 *
 * Free, no API key. Public Blockscout instance — graceful degradation if
 * upstream is unreachable (returns null fields, never throws).
 *
 * Also exposes a keyless native-ETH transfer source (getBlockscoutNativeTransfers)
 * used as the fallback when no ETHERSCAN_API_KEY is configured.
 */

import type { Transfer } from './chain-sources/types';

const FETCH_TIMEOUT = 10_000;
const CTX_CACHE_TTL = 300; // 5 min
const TX_CACHE_TTL = 120; // 2 min
const TX_LIMIT = 12;

const BS_BASE = 'https://eth.blockscout.com/api/v2';

const RE_EVM = /^0x[a-fA-F0-9]{40}$/;

export interface AddressContext {
  found: boolean;
  is_contract: boolean;
  is_scam: boolean;
  ens_name: string | null;
  /** Best human-readable label: contract name, public tag, or named-entity tag. */
  label: string | null;
  reputation: string | null;
  source: string;
  source_url: string;
}

export interface TokenTransfer {
  tx_hash: string;
  timestamp: string | null;
  direction: 'in' | 'out' | 'self';
  counterparty: string;
  counterparty_label: string | null;
  /** Marked true if the counterparty appears in the caller-provided flagged-set. */
  counterparty_flagged: boolean;
  token_symbol: string | null;
  token_name: string | null;
  amount: string | null;
  method: string | null;
  explorer_url: string;
}

interface BSAddressLite {
  hash?: string;
  ens_domain_name?: string | null;
  name?: string | null;
  is_contract?: boolean;
  is_scam?: boolean;
  is_verified?: boolean;
  reputation?: string | null;
  public_tags?: Array<{ display_name?: string; label?: string } | string>;
  metadata?: { tags?: Array<{ name?: string; tagType?: string }> } | null;
}

interface BSAddressResponse extends BSAddressLite {
  status?: string;
  message?: string;
}

interface BSTransferItem {
  tx_hash?: string;
  timestamp?: string | null;
  from?: BSAddressLite;
  to?: BSAddressLite;
  token?: { symbol?: string | null; name?: string | null; decimals?: string | number | null };
  total?: { value?: string | null; decimals?: string | number | null };
  method?: string | null;
  type?: string | null;
}

interface BSTransfersResponse {
  items?: BSTransferItem[];
  message?: string;
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickLabel(d: BSAddressLite): string | null {
  // Priority: human-named tag from metadata > contract name > public tag.
  const nameTag = d.metadata?.tags?.find((t) => t?.tagType === 'name')?.name;
  if (nameTag) return nameTag;
  if (d.name) return d.name;
  const pub = d.public_tags?.[0];
  if (typeof pub === 'string') return pub;
  if (pub && typeof pub === 'object') return pub.display_name ?? pub.label ?? null;
  return null;
}

export function fmtAmount(rawDec: string, decimals: number, precision = 4): string {
  const s = rawDec.replace(/^0+/, '') || '0';
  const padded = s.length <= decimals ? s.padStart(decimals + 1, '0') : s;
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded
    .slice(padded.length - decimals)
    .slice(0, precision)
    .replace(/0+$/, '');
  return `${intPart}${fracPart ? '.' + fracPart : ''}`;
}

const EMPTY_CTX = (address: string): AddressContext => ({
  found: false,
  is_contract: false,
  is_scam: false,
  ens_name: null,
  label: null,
  reputation: null,
  source: 'Blockscout (eth.blockscout.com)',
  source_url: `https://eth.blockscout.com/address/${address}`,
});

export async function getAddressContext(address: string): Promise<AddressContext> {
  if (!RE_EVM.test(address)) return EMPTY_CTX(address);

  const cache = (caches as unknown as { default: Cache }).default;
  const lower = address.toLowerCase();
  const cacheKey = new Request(`https://blockscout-cache.internal/v1/ctx/${lower}`);
  const cached = await cache.match(cacheKey);
  if (cached) return (await cached.json()) as AddressContext;

  const res = await fetchWithTimeout(`${BS_BASE}/addresses/${address}`);
  if (!res || !res.ok) return EMPTY_CTX(address);

  const body = (await res.json().catch(() => null)) as BSAddressResponse | null;
  if (!body || !body.hash) return EMPTY_CTX(address);

  const ctx: AddressContext = {
    found: true,
    is_contract: Boolean(body.is_contract),
    is_scam: Boolean(body.is_scam),
    ens_name: body.ens_domain_name ?? null,
    label: pickLabel(body),
    reputation: body.reputation ?? null,
    source: 'Blockscout (eth.blockscout.com)',
    source_url: `https://eth.blockscout.com/address/${address}`,
  };

  const stored = new Response(JSON.stringify(ctx), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CTX_CACHE_TTL}`,
    },
  });
  void cache.put(cacheKey, stored);
  return ctx;
}

export async function getRecentTransfers(address: string, flaggedSet: Set<string>): Promise<TokenTransfer[]> {
  if (!RE_EVM.test(address)) return [];

  const cache = (caches as unknown as { default: Cache }).default;
  const lower = address.toLowerCase();
  const cacheKey = new Request(`https://blockscout-cache.internal/v1/tx/${lower}`);
  const cached = await cache.match(cacheKey);
  let raw: BSTransferItem[] | null = null;
  if (cached) {
    raw = ((await cached.json().catch(() => null)) as { items?: BSTransferItem[] } | null)?.items ?? null;
  }

  if (!raw) {
    const res = await fetchWithTimeout(`${BS_BASE}/addresses/${address}/token-transfers?type=ERC-20`);
    if (!res || !res.ok) return [];
    const body = (await res.json().catch(() => null)) as BSTransfersResponse | null;
    raw = body?.items ?? [];
    const stored = new Response(JSON.stringify({ items: raw }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${TX_CACHE_TTL}`,
      },
    });
    void cache.put(cacheKey, stored);
  }

  const out: TokenTransfer[] = [];
  for (const it of raw.slice(0, TX_LIMIT)) {
    const fromHash = it.from?.hash ?? '';
    const toHash = it.to?.hash ?? '';
    if (!fromHash || !toHash) continue;
    const isOut = fromHash.toLowerCase() === lower;
    const isIn = toHash.toLowerCase() === lower;
    const direction: 'in' | 'out' | 'self' = isOut && isIn ? 'self' : isOut ? 'out' : 'in';
    const counterparty = direction === 'out' ? toHash : fromHash;
    const counterpartyMeta = direction === 'out' ? it.to : it.from;
    const counterpartyLabel = counterpartyMeta ? pickLabel(counterpartyMeta) : null;

    const decimalsStr = it.total?.decimals ?? it.token?.decimals ?? '0';
    const decimals = typeof decimalsStr === 'number' ? decimalsStr : parseInt(decimalsStr, 10) || 0;
    const valueRaw = it.total?.value ?? '0';
    const amount = `${fmtAmount(valueRaw, decimals)} ${it.token?.symbol ?? ''}`.trim();

    out.push({
      tx_hash: it.tx_hash ?? '',
      timestamp: it.timestamp ?? null,
      direction,
      counterparty,
      counterparty_label: counterpartyLabel,
      counterparty_flagged: flaggedSet.has(counterparty.toLowerCase()),
      token_symbol: it.token?.symbol ?? null,
      token_name: it.token?.name ?? null,
      amount,
      method: it.method ?? null,
      explorer_url: it.tx_hash ? `https://etherscan.io/tx/${it.tx_hash}` : '',
    });
  }
  return out;
}

/**
 * Pure: normalise Blockscout's `/addresses/{addr}/transactions` response (native
 * ETH txs) into the tracer's `Transfer` shape. Accepts either the raw items
 * array or the `{ items }` envelope. Drops zero-value txs (no ETH moved) and
 * contract creations (null `to`). The keyless counterpart to Etherscan's txlist.
 */
export function parseBlockscoutNativeTxs(data: unknown, address: string): Transfer[] {
  const items = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : null;
  if (!items) return [];

  const lower = address.toLowerCase();
  const out: Transfer[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    const hash = typeof it.hash === 'string' ? it.hash : '';
    const fromHash = (it.from as { hash?: string } | null)?.hash ?? '';
    const toHash = (it.to as { hash?: string } | null)?.hash ?? '';
    const valueWei = typeof it.value === 'string' ? it.value : '';
    if (!hash || !fromHash || !toHash) continue;
    if (!valueWei || /^0*$/.test(valueWei)) continue;

    const isOut = fromHash.toLowerCase() === lower;
    const isIn = toHash.toLowerCase() === lower;
    const direction: 'in' | 'out' | 'self' = isOut && isIn ? 'self' : isOut ? 'out' : 'in';
    const counterparty = direction === 'in' ? fromHash : toHash;
    const amount = `${fmtAmount(valueWei, 18)} ETH`;
    out.push({
      counterparty,
      direction,
      amount,
      amount_num: parseFloat(amount) || 0,
      token: 'ETH',
      tx_hash: hash,
      timestamp: typeof it.timestamp === 'string' ? it.timestamp : null,
      chain: 'evm',
      explorer_url: `https://etherscan.io/tx/${hash}`,
    });
  }
  return out;
}

/**
 * Keyless native-ETH transfer fetch (Blockscout). Returns [] on any failure so
 * the EVM fetcher still has its ERC-20 transfers. One subrequest.
 */
export async function getBlockscoutNativeTransfers(address: string): Promise<Transfer[]> {
  if (!RE_EVM.test(address)) return [];
  const res = await fetchWithTimeout(`${BS_BASE}/addresses/${address}/transactions`);
  if (!res || !res.ok) return [];
  const body = await res.json().catch(() => null);
  return parseBlockscoutNativeTxs(body, address);
}

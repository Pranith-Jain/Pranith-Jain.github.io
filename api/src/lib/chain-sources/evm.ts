import { getRecentTransfers, getBlockscoutNativeTransfers } from '../blockscout';
import { fetchEtherscanNativeTransfers } from '../etherscan';
import { applyFilter } from './filter';
import type { Transfer, TransferFilter, FetchResult } from './types';

/** Parse the leading numeric out of a human amount like "1.23 USDT" → 1.23. */
function leadingNum(amount: string): number {
  const m = amount.match(/^[\d.]+/);
  const n = m ? parseFloat(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Native ETH transfers: Etherscan when a key is configured (richer, canonical),
 * else Blockscout's keyless native endpoint. Either way the EVM graph gains the
 * native ETH movement that the ERC-20-only path misses.
 */
function fetchNativeEthTransfers(address: string, etherscanKey?: string): Promise<Transfer[]> {
  return etherscanKey ? fetchEtherscanNativeTransfers(address, etherscanKey) : getBlockscoutNativeTransfers(address);
}

export async function fetchEvmTransfers(
  address: string,
  filter: TransferFilter,
  flaggedSet: Set<string> = new Set(),
  etherscanKey?: string
): Promise<FetchResult> {
  const [raw, native] = await Promise.all([
    getRecentTransfers(address, flaggedSet),
    fetchNativeEthTransfers(address, etherscanKey),
  ]);
  const erc20: Transfer[] = raw
    .filter((t) => t.tx_hash && t.counterparty)
    .map((t) => ({
      counterparty: t.counterparty,
      direction: t.direction,
      amount: t.amount ?? '',
      amount_num: leadingNum(t.amount ?? ''),
      token: t.token_symbol ?? '',
      tx_hash: t.tx_hash,
      timestamp: t.timestamp,
      chain: 'evm' as const,
      explorer_url: t.explorer_url,
    }));
  // Merge ERC-20 + native ETH; the tracer's edge id (tx_hash:counterparty)
  // naturally collapses any native+token pair that shares a tx and counterparty.
  return applyFilter([...erc20, ...native], filter);
}

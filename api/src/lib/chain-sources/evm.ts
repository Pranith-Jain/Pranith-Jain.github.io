import { getRecentTransfers } from '../blockscout';
import { applyFilter } from './filter';
import type { Transfer, TransferFilter, FetchResult } from './types';

/** Parse the leading numeric out of a human amount like "1.23 USDT" → 1.23. */
function leadingNum(amount: string): number {
  const m = amount.match(/^[\d.]+/);
  const n = m ? parseFloat(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function fetchEvmTransfers(
  address: string,
  filter: TransferFilter,
  flaggedSet: Set<string> = new Set()
): Promise<FetchResult> {
  const raw = await getRecentTransfers(address, flaggedSet);
  const transfers: Transfer[] = raw
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
  return applyFilter(transfers, filter);
}

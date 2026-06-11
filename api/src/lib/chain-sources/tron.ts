import { applyFilter } from './filter';
import { safeNullLog } from '../safe-catch';
import type { Transfer, TransferFilter, FetchResult } from './types';

const FETCH_TIMEOUT = 10_000;

interface Trc20Row {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  value: string;
  token_info?: { symbol?: string; decimals?: number };
}

function scale(raw: string, decimals: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n / Math.pow(10, decimals);
}

/** Pure mapping (no network) so it's unit-testable. */
export function mapTrc20Rows(address: string, rows: Trc20Row[]): Transfer[] {
  return rows
    .filter((r) => r.transaction_id && r.from && r.to)
    .map((r) => {
      const isOut = r.from === address;
      const isIn = r.to === address;
      const direction: 'in' | 'out' | 'self' = isOut && isIn ? 'self' : isOut ? 'out' : 'in';
      const decimals = r.token_info?.decimals ?? 6;
      const symbol = r.token_info?.symbol ?? '';
      const num = scale(r.value, decimals);
      return {
        counterparty: isOut ? r.to : r.from,
        direction,
        amount: `${num} ${symbol}`.trim(),
        amount_num: num,
        token: symbol,
        tx_hash: r.transaction_id,
        timestamp: r.block_timestamp ? new Date(r.block_timestamp).toISOString() : null,
        chain: 'tron' as const,
        explorer_url: `https://tronscan.org/#/transaction/${r.transaction_id}`,
      };
    });
}

export async function fetchTronTransfers(address: string, filter: TransferFilter): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const limit = filter.maxTransfers ?? 50;
    const url = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?limit=${Math.min(limit, 200)}`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { transfers: [], truncated: false };
    const body = (await safeNullLog('tron-tr20-json', res.json())) as { data?: Trc20Row[] } | null;
    return applyFilter(mapTrc20Rows(address, body?.data ?? []), filter);
  } catch {
    return { transfers: [], truncated: false };
  } finally {
    clearTimeout(timer);
  }
}

import type { Transfer, TransferFilter, FetchResult } from './types';

const DEFAULT_MAX = 50;

/**
 * Apply time-window / token / min-amount filtering, then cap. A transfer with a
 * null timestamp is kept (we can't prove it's outside the window). `truncated`
 * is true when more transfers matched than the cap allowed.
 */
export function applyFilter(transfers: Transfer[], filter: TransferFilter = {}): FetchResult {
  const fromMs = filter.from ? Date.parse(filter.from) : undefined;
  const toMs = filter.to ? Date.parse(filter.to) : undefined;
  const tokenLc = filter.token?.toLowerCase();

  const matched = transfers.filter((t) => {
    if (fromMs !== undefined || toMs !== undefined) {
      if (t.timestamp) {
        const ts = Date.parse(t.timestamp);
        if (!Number.isNaN(ts)) {
          if (fromMs !== undefined && ts < fromMs) return false;
          if (toMs !== undefined && ts > toMs) return false;
        }
      }
    }
    if (tokenLc && t.token.toLowerCase() !== tokenLc) return false;
    if (filter.minAmount !== undefined && t.amount_num < filter.minAmount) return false;
    return true;
  });

  const cap = filter.maxTransfers ?? DEFAULT_MAX;
  return { transfers: matched.slice(0, cap), truncated: matched.length > cap };
}

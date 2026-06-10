/** Chains whose counterparties can be expanded within the subrequest budget. */
export type TracerChain = 'evm' | 'btc' | 'tron';

/** One value transfer, normalised across chains, relative to the queried address. */
export interface Transfer {
  /** The other party in this transfer (the address NOT being queried). */
  counterparty: string;
  direction: 'in' | 'out' | 'self';
  /** Human-readable amount with unit, e.g. "1.23 USDT". */
  amount: string;
  /** Best-effort numeric token amount for filtering (0 if unparseable). */
  amount_num: number;
  /** Token symbol; '' for native-only chains where unknown. */
  token: string;
  tx_hash: string;
  /** ISO 8601, or null if upstream omitted it. */
  timestamp: string | null;
  chain: TracerChain;
  explorer_url: string;
}

export interface TransferFilter {
  /** ISO 8601 inclusive lower bound. */
  from?: string;
  /** ISO 8601 inclusive upper bound. */
  to?: string;
  /** Case-insensitive token-symbol match. */
  token?: string;
  /** Keep transfers with amount_num >= minAmount. */
  minAmount?: number;
  /** Hard cap on returned transfers (default 50). */
  maxTransfers?: number;
}

export interface FetchResult {
  transfers: Transfer[];
  /** True if more transfers matched the filter than maxTransfers allowed. */
  truncated: boolean;
}

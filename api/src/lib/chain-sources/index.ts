import { fetchEvmTransfers } from './evm';
import { fetchBtcTransfers } from './btc';
import { fetchTronTransfers } from './tron';
import type { TracerChain, TransferFilter, FetchResult } from './types';

export type { TracerChain, Transfer, TransferFilter, FetchResult } from './types';

/** One address, one chain, one hop. The caller pre-loads `flaggedSet` (EVM only). */
export function fetchTransfers(
  chain: TracerChain,
  address: string,
  filter: TransferFilter,
  flaggedSet?: Set<string>
): Promise<FetchResult> {
  switch (chain) {
    case 'evm':
      return fetchEvmTransfers(address, filter, flaggedSet);
    case 'btc':
      return fetchBtcTransfers(address, filter);
    case 'tron':
      return fetchTronTransfers(address, filter);
  }
}

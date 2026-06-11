import { safeNullLog } from './safe-catch';
const FETCH_TIMEOUT = 10_000;

export interface FetchedTx {
  found: boolean;
  chain: string;
  input: string; // '0x…' calldata, '' if none/not found
  from?: string;
  to?: string;
}

/** Public-RPC sets per logical chain (mirrors crypto-trace.ts). */
export const EVM_RPCS: Record<string, string[]> = {
  eth: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'],
  bsc: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org'],
};

interface RpcTx {
  input?: string;
  from?: string;
  to?: string;
}

async function rpcGetTx(rpc: string, hash: string): Promise<RpcTx | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [hash] }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = (await safeNullLog('evm-rpc-json', r.json())) as { result?: RpcTx | null } | null;
    return j?.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Try each RPC in `rpcs` until one returns the tx. Never throws. */
export async function fetchEvmTx(hash: string, rpcs: string[]): Promise<FetchedTx> {
  for (const rpc of rpcs) {
    const tx = await rpcGetTx(rpc, hash);
    if (tx) return { found: true, chain: 'evm', input: tx.input ?? '', from: tx.from, to: tx.to ?? undefined };
  }
  return { found: false, chain: 'evm', input: '' };
}

interface TronTxRaw {
  raw_data?: {
    contract?: Array<{ parameter?: { value?: { data?: string; owner_address?: string; contract_address?: string } } }>;
  };
}

/** TronGrid tx lookup. Calldata lives in contract[0].parameter.value.data. Never throws. */
export async function fetchTronTx(hash: string): Promise<FetchedTx> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch('https://api.trongrid.io/wallet/gettransactionbyid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ value: hash }),
      signal: ctrl.signal,
    });
    if (!r.ok) return { found: false, chain: 'tron', input: '' };
    const j = (await safeNullLog('tron-tx-json', r.json())) as TronTxRaw | null;
    const contract = j?.raw_data?.contract?.[0]?.parameter?.value;
    if (!contract) return { found: false, chain: 'tron', input: '' };
    return {
      found: true,
      chain: 'tron',
      input: contract.data ? '0x' + contract.data : '',
      from: contract.owner_address,
      to: contract.contract_address,
    };
  } catch {
    return { found: false, chain: 'tron', input: '' };
  } finally {
    clearTimeout(timer);
  }
}

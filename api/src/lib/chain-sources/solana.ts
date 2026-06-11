/**
 * Solana fund-flow adapter for the tracer — keyless public-RPC, no API key.
 *
 * Solana has no keyless "list transfers for address" endpoint, so we do two
 * batched JSON-RPC calls and stay within the subrequest budget:
 *   1. getSignaturesForAddress(addr, {limit})        — one POST
 *   2. getTransaction(sig, jsonParsed) for each sig   — ONE batched POST (array)
 *
 * Transfers are extracted from the jsonParsed instructions: `system.transfer`
 * (native SOL — source/destination are wallets) and `spl-token`
 * transfer/transferChecked (SPL — source/destination are token accounts, which
 * we resolve to owner wallets via meta.{pre,post}TokenBalances). Parsing is pure
 * + fixture-tested; the fetch wrapper degrades to [] on any RPC failure.
 *
 * Risk note: OFAC / ScamSniffer / Ransomwhere lists don't cover Solana base58
 * addresses, so Solana nodes score on D1 labels only (see tracer.ts).
 */

import { fmtAmount } from '../blockscout';
import { applyFilter } from './filter';
import type { Transfer, TransferFilter, FetchResult } from './types';

export const RE_SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const RPCS = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'];
const SIG_LIMIT = 10;
import { safeNullLog } from '../safe-catch';
const FETCH_TIMEOUT = 10_000;

/** Mainnet mints worth labelling; everything else shows as 'SPL'. */
const KNOWN_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
};

function leadingNum(amount: string): number {
  const m = amount.match(/^[\d.]+/);
  const n = m ? parseFloat(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}

function pubkeyAt(accountKeys: unknown, index: number): string {
  if (!Array.isArray(accountKeys)) return '';
  const k = accountKeys[index];
  if (typeof k === 'string') return k;
  if (k && typeof k === 'object' && typeof (k as { pubkey?: unknown }).pubkey === 'string') {
    return (k as { pubkey: string }).pubkey;
  }
  return '';
}

interface TokenAcct {
  owner: string;
  mint: string;
  decimals: number;
}

/** Map every token-account pubkey → {owner, mint, decimals} from the balance metas. */
function buildTokenAccountMap(meta: Record<string, unknown>, accountKeys: unknown): Map<string, TokenAcct> {
  const map = new Map<string, TokenAcct>();
  const lists = [meta.preTokenBalances, meta.postTokenBalances];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const b of list) {
      if (!b || typeof b !== 'object') continue;
      const e = b as Record<string, unknown>;
      const idx = typeof e.accountIndex === 'number' ? e.accountIndex : -1;
      const ata = pubkeyAt(accountKeys, idx);
      const owner = typeof e.owner === 'string' ? e.owner : '';
      const mint = typeof e.mint === 'string' ? e.mint : '';
      const decimals =
        typeof (e.uiTokenAmount as { decimals?: unknown } | undefined)?.decimals === 'number'
          ? (e.uiTokenAmount as { decimals: number }).decimals
          : 0;
      if (ata && owner) map.set(ata, { owner, mint, decimals });
    }
  }
  return map;
}

interface RawTransfer {
  srcOwner: string;
  dstOwner: string;
  amount: string; // human, e.g. "1.5 SOL"
  token: string;
}

function collectInstructions(message: Record<string, unknown>, meta: Record<string, unknown>): unknown[] {
  const top = Array.isArray(message.instructions) ? message.instructions : [];
  const inner: unknown[] = [];
  if (Array.isArray(meta.innerInstructions)) {
    for (const g of meta.innerInstructions) {
      const gi = (g as { instructions?: unknown })?.instructions;
      if (Array.isArray(gi)) inner.push(...gi);
    }
  }
  return [...top, ...inner];
}

/**
 * Pure: extract native-SOL + SPL transfers involving `address` from a single
 * getTransaction(jsonParsed) result. Failed txs and transfers not touching the
 * address are dropped.
 */
export function parseSolanaTransfers(tx: unknown, address: string): Transfer[] {
  if (!tx || typeof tx !== 'object') return [];
  const t = tx as Record<string, unknown>;
  const meta = (t.meta ?? {}) as Record<string, unknown>;
  if (meta.err != null) return [];

  const transaction = (t.transaction ?? {}) as Record<string, unknown>;
  const message = (transaction.message ?? {}) as Record<string, unknown>;
  const accountKeys = message.accountKeys;
  const signature = Array.isArray(transaction.signatures) ? String(transaction.signatures[0] ?? '') : '';
  if (!signature) return [];
  const blockTime = typeof t.blockTime === 'number' ? t.blockTime : null;
  const timestamp = blockTime != null ? new Date(blockTime * 1000).toISOString() : null;

  const ataMap = buildTokenAccountMap(meta, accountKeys);
  const raws: RawTransfer[] = [];

  for (const insn of collectInstructions(message, meta)) {
    if (!insn || typeof insn !== 'object') continue;
    const program = (insn as { program?: unknown }).program;
    const parsed = (insn as { parsed?: unknown }).parsed;
    if (!parsed || typeof parsed !== 'object') continue;
    const type = (parsed as { type?: unknown }).type;
    const info = ((parsed as { info?: unknown }).info ?? {}) as Record<string, unknown>;

    if (program === 'system' && (type === 'transfer' || type === 'transferWithSeed')) {
      const lamports = info.lamports;
      const wei = typeof lamports === 'number' ? String(lamports) : typeof lamports === 'string' ? lamports : '';
      if (!wei || /^0*$/.test(wei)) continue;
      raws.push({
        srcOwner: typeof info.source === 'string' ? info.source : '',
        dstOwner: typeof info.destination === 'string' ? info.destination : '',
        amount: `${fmtAmount(wei, 9)} SOL`,
        token: 'SOL',
      });
    } else if (program === 'spl-token' && (type === 'transfer' || type === 'transferChecked')) {
      const srcAta = typeof info.source === 'string' ? info.source : '';
      const dstAta = typeof info.destination === 'string' ? info.destination : '';
      const srcMeta = ataMap.get(srcAta);
      const dstMeta = ataMap.get(dstAta);
      const mint = (typeof info.mint === 'string' ? info.mint : '') || srcMeta?.mint || dstMeta?.mint || '';
      const decimals =
        (info.tokenAmount as { decimals?: number } | undefined)?.decimals ??
        srcMeta?.decimals ??
        dstMeta?.decimals ??
        0;
      const uiStr = (info.tokenAmount as { uiAmountString?: string } | undefined)?.uiAmountString;
      const rawAmt =
        (info.tokenAmount as { amount?: string } | undefined)?.amount ??
        (typeof info.amount === 'string' ? info.amount : '');
      const human = uiStr ?? (rawAmt ? fmtAmount(rawAmt, decimals) : '0');
      const label = KNOWN_MINTS[mint] ?? 'SPL';
      raws.push({
        srcOwner: srcMeta?.owner || srcAta,
        dstOwner: dstMeta?.owner || dstAta,
        amount: `${human} ${label}`,
        token: label,
      });
    }
  }

  const out: Transfer[] = [];
  for (const r of raws) {
    const isOut = r.srcOwner === address;
    const isIn = r.dstOwner === address;
    if (!isOut && !isIn) continue;
    const direction: 'in' | 'out' | 'self' = isOut && isIn ? 'self' : isOut ? 'out' : 'in';
    const counterparty = direction === 'in' ? r.srcOwner : r.dstOwner;
    out.push({
      counterparty,
      direction,
      amount: r.amount,
      amount_num: leadingNum(r.amount),
      token: r.token,
      tx_hash: signature,
      timestamp,
      chain: 'solana',
      explorer_url: `https://solscan.io/tx/${signature}`,
    });
  }
  return out;
}

interface RpcResp<T> {
  result?: T;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  for (const url of RPCS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const j = (await safeNullLog('solana-rpc-json', res.json())) as RpcResp<T> | null;
      if (j && 'result' in j) return j.result ?? null;
    } catch {
      /* try next RPC */
    }
  }
  return null;
}

/** Batched getTransaction — one POST for all signatures. */
async function batchGetTransactions(signatures: string[]): Promise<unknown[]> {
  const body = signatures.map((sig, i) => ({
    jsonrpc: '2.0',
    id: i,
    method: 'getTransaction',
    params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
  }));
  for (const url of RPCS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const arr = (await safeNullLog('solana-batch-json', res.json())) as Array<{ result?: unknown }> | null;
      if (Array.isArray(arr)) return arr.map((e) => e?.result ?? null);
    } catch {
      /* try next RPC */
    }
  }
  return [];
}

interface SolSignature {
  signature: string;
}

export async function fetchSolanaTransfers(address: string, filter: TransferFilter): Promise<FetchResult> {
  if (!RE_SOLANA.test(address)) return { transfers: [], truncated: false };

  const sigs = await rpc<SolSignature[]>('getSignaturesForAddress', [address, { limit: SIG_LIMIT }]);
  const signatures = (sigs ?? []).map((s) => s?.signature).filter((s): s is string => typeof s === 'string');
  if (signatures.length === 0) return { transfers: [], truncated: false };

  const txs = await batchGetTransactions(signatures);
  const transfers: Transfer[] = [];
  for (const tx of txs) transfers.push(...parseSolanaTransfers(tx, address));

  const filtered = applyFilter(transfers, filter);
  return { ...filtered, truncated: filtered.truncated || signatures.length >= SIG_LIMIT };
}

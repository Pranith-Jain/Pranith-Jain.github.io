import type { Context } from 'hono';
import type { Env } from '../env';
import { checkAddress, type SanctionsCheck } from '../lib/ofac-sanctions';
import { checkScamSniffer, loadScamSnifferSet, type ScamSnifferCheck } from '../lib/scamsniffer';
import { getAddressContext, getRecentTransfers, type AddressContext, type TokenTransfer } from '../lib/blockscout';

/**
 * Multi-chain crypto address inspector — Etherscan / Solscan / mempool.space
 * lite, glued together from public-RPC and public-Esplora endpoints.
 *
 * No API keys; rate-limit comes from the upstream public nodes (which is why
 * the response is cached for 60 s in the Cache API).
 *
 * Supported address shapes:
 *   - BTC P2PKH / P2SH (base58, "1…" / "3…")
 *   - BTC bech32 ("bc1…" / "tb1…")
 *   - EVM (`0x` + 40 hex) — fanned out across ETH, Polygon, BSC, Arbitrum,
 *     Optimism, Base
 *   - Solana (base58, 32-44 chars, doesn't match BTC patterns)
 *
 * The response is normalised so the client doesn't need per-chain branching.
 */

const CACHE_TTL = 60;
const FETCH_TIMEOUT = 8_000;

export type ChainKind = 'btc' | 'evm' | 'solana';

export interface ChainResult {
  chain: string; // 'btc' / 'eth' / 'polygon' / 'bsc' / 'arbitrum' / 'optimism' / 'base' / 'solana'
  label: string;
  symbol: string;
  /** Human-readable balance like "1.2345 ETH". */
  balance: string;
  /** Raw balance in smallest units, as decimal string. */
  balance_raw: string;
  tx_count?: number;
  has_activity: boolean;
  recent_txs: RecentTx[];
  explorer_url: string;
  error?: string;
}

export interface RecentTx {
  hash: string;
  time?: string;
  /** Direction relative to the queried address — 'in' / 'out' / 'self'. */
  direction?: 'in' | 'out' | 'self';
  /** Human-readable amount with unit. */
  amount?: string;
  link: string;
}

interface TraceResponse {
  address: string;
  detected_kind: ChainKind | 'unknown';
  results: ChainResult[];
  sanctions: SanctionsCheck;
  scam: ScamSnifferCheck;
  /** Blockscout enrichment: ENS, label, contract/EOA, reputation. EVM only. */
  context?: AddressContext;
  /** Recent ERC-20 transfers with counterparty cross-referenced against ScamSniffer. EVM only. */
  recent_token_transfers?: TokenTransfer[];
  generated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Address detection
// ─────────────────────────────────────────────────────────────────────────

const RE_EVM = /^0x[a-fA-F0-9]{40}$/;
const RE_BTC_BASE58 = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const RE_BTC_BECH32 = /^(bc1|tb1)[ac-hj-np-z02-9]{8,87}$/i;
const RE_SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function detectChain(addr: string): ChainKind | 'unknown' {
  if (RE_EVM.test(addr)) return 'evm';
  if (RE_BTC_BECH32.test(addr)) return 'btc';
  if (RE_BTC_BASE58.test(addr)) return 'btc';
  if (RE_SOLANA.test(addr)) return 'solana';
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function fmtUnits(rawDecimal: string, decimals: number, symbol: string, precision = 6): string {
  // rawDecimal is a base-10 string for an integer of `decimals` precision.
  // Format with up to `precision` decimal places, trimmed.
  const s = rawDecimal.replace(/^0+/, '') || '0';
  const padded = s.length <= decimals ? s.padStart(decimals + 1, '0') : s;
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded
    .slice(padded.length - decimals)
    .slice(0, precision)
    .replace(/0+$/, '');
  return `${intPart}${fracPart ? '.' + fracPart : ''} ${symbol}`;
}

function hexToDec(hex: string): string {
  // Convert a 0x-prefixed hex string (potentially > Number.MAX_SAFE_INTEGER) to decimal.
  if (!hex || hex === '0x' || hex === '0x0') return '0';
  const cleaned = hex.replace(/^0x/i, '');
  let dec = 0n;
  for (const ch of cleaned) {
    const d = parseInt(ch, 16);
    dec = dec * 16n + BigInt(d);
  }
  return dec.toString(10);
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// BTC via Blockstream Esplora
// ─────────────────────────────────────────────────────────────────────────

interface EsploraAddr {
  address: string;
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
}
interface EsploraTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
}

async function fetchBtc(address: string): Promise<ChainResult> {
  const explorer_url = `https://mempool.space/address/${address}`;
  try {
    const [meta, txs] = await Promise.all([
      withTimeout(
        fetch(`https://blockstream.info/api/address/${address}`).then((r) => r.json() as Promise<EsploraAddr>),
        FETCH_TIMEOUT
      ),
      withTimeout(
        fetch(`https://blockstream.info/api/address/${address}/txs`).then((r) => r.json() as Promise<EsploraTx[]>),
        FETCH_TIMEOUT
      ),
    ]);
    if (!meta) throw new Error('Esplora unreachable');
    const totalFunded = meta.chain_stats.funded_txo_sum + meta.mempool_stats.funded_txo_sum;
    const totalSpent = meta.chain_stats.spent_txo_sum + meta.mempool_stats.spent_txo_sum;
    const balanceSat = totalFunded - totalSpent;
    const balanceBtc = (balanceSat / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    const txCount = meta.chain_stats.tx_count + meta.mempool_stats.tx_count;
    const recent: RecentTx[] = (txs ?? []).slice(0, 5).map((tx) => {
      const inputSum = tx.vin
        .filter((v) => v.prevout?.scriptpubkey_address === address)
        .reduce((n, v) => n + (v.prevout?.value ?? 0), 0);
      const outputSum = tx.vout.filter((v) => v.scriptpubkey_address === address).reduce((n, v) => n + v.value, 0);
      const net = outputSum - inputSum;
      const direction: 'in' | 'out' | 'self' = net === 0 ? 'self' : net > 0 ? 'in' : 'out';
      return {
        hash: tx.txid,
        time: tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : undefined,
        direction,
        amount: `${(Math.abs(net) / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} BTC`,
        link: `https://mempool.space/tx/${tx.txid}`,
      };
    });
    return {
      chain: 'btc',
      label: 'Bitcoin',
      symbol: 'BTC',
      balance: `${balanceBtc} BTC`,
      balance_raw: String(balanceSat),
      tx_count: txCount,
      has_activity: txCount > 0,
      recent_txs: recent,
      explorer_url,
    };
  } catch (e) {
    return {
      chain: 'btc',
      label: 'Bitcoin',
      symbol: 'BTC',
      balance: '—',
      balance_raw: '0',
      has_activity: false,
      recent_txs: [],
      explorer_url,
      error: (e as Error).message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// EVM via public RPC nodes
// ─────────────────────────────────────────────────────────────────────────

interface EvmChainConfig {
  id: string;
  label: string;
  symbol: string;
  /** Ordered list of RPCs to try — first that responds wins. */
  rpcs: string[];
  explorer: (addr: string) => string;
}

const EVM_CHAINS: EvmChainConfig[] = [
  {
    id: 'eth',
    label: 'Ethereum',
    symbol: 'ETH',
    rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
    explorer: (a) => `https://etherscan.io/address/${a}`,
  },
  {
    id: 'polygon',
    label: 'Polygon',
    symbol: 'MATIC',
    rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com', 'https://rpc.ankr.com/polygon'],
    explorer: (a) => `https://polygonscan.com/address/${a}`,
  },
  {
    id: 'bsc',
    label: 'BNB Smart Chain',
    symbol: 'BNB',
    rpcs: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc'],
    explorer: (a) => `https://bscscan.com/address/${a}`,
  },
  {
    id: 'arbitrum',
    label: 'Arbitrum One',
    symbol: 'ETH',
    rpcs: ['https://arbitrum-one.publicnode.com', 'https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
    explorer: (a) => `https://arbiscan.io/address/${a}`,
  },
  {
    id: 'optimism',
    label: 'Optimism',
    symbol: 'ETH',
    rpcs: ['https://optimism-rpc.publicnode.com', 'https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism'],
    explorer: (a) => `https://optimistic.etherscan.io/address/${a}`,
  },
  {
    id: 'base',
    label: 'Base',
    symbol: 'ETH',
    rpcs: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://rpc.ankr.com/base'],
    explorer: (a) => `https://basescan.org/address/${a}`,
  },
];

interface RpcResp<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(rpc: string, method: string, params: unknown[]): Promise<T | null> {
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as RpcResp<T>;
    return j.result ?? null;
  } catch {
    return null;
  }
}

async function rpcWithFallback<T>(rpcs: string[], method: string, params: unknown[]): Promise<T | null> {
  for (const rpc of rpcs) {
    const r = await withTimeout(rpcCall<T>(rpc, method, params), FETCH_TIMEOUT);
    if (r != null) return r;
  }
  return null;
}

async function fetchEvmChain(address: string, cfg: EvmChainConfig): Promise<ChainResult> {
  const explorer_url = cfg.explorer(address);
  const [balanceHex, nonceHex] = await Promise.all([
    rpcWithFallback<string>(cfg.rpcs, 'eth_getBalance', [address, 'latest']),
    rpcWithFallback<string>(cfg.rpcs, 'eth_getTransactionCount', [address, 'latest']),
  ]);
  if (balanceHex == null) {
    return {
      chain: cfg.id,
      label: cfg.label,
      symbol: cfg.symbol,
      balance: '—',
      balance_raw: '0',
      has_activity: false,
      recent_txs: [],
      explorer_url,
      error: 'RPC unreachable',
    };
  }
  const wei = hexToDec(balanceHex);
  const nonce = nonceHex ? parseInt(nonceHex, 16) : 0;
  const balanceFmt = fmtUnits(wei, 18, cfg.symbol, 6);
  return {
    chain: cfg.id,
    label: cfg.label,
    symbol: cfg.symbol,
    balance: balanceFmt,
    balance_raw: wei,
    tx_count: nonce,
    has_activity: wei !== '0' || nonce > 0,
    recent_txs: [], // public RPC eth_getLogs / scan would be heavy; use Etherscan link instead
    explorer_url,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Solana via public RPC
// ─────────────────────────────────────────────────────────────────────────

interface SolBalance {
  context: { slot: number };
  value: number;
}
interface SolSignature {
  signature: string;
  slot: number;
  blockTime?: number;
  err?: unknown;
}

async function fetchSolana(address: string): Promise<ChainResult> {
  const explorer_url = `https://solscan.io/account/${address}`;
  const RPC = 'https://api.mainnet-beta.solana.com';
  const [bal, sigs] = await Promise.all([
    withTimeout(rpcCall<SolBalance>(RPC, 'getBalance', [address]), FETCH_TIMEOUT),
    withTimeout(rpcCall<SolSignature[]>(RPC, 'getSignaturesForAddress', [address, { limit: 5 }]), FETCH_TIMEOUT),
  ]);
  if (bal == null) {
    return {
      chain: 'solana',
      label: 'Solana',
      symbol: 'SOL',
      balance: '—',
      balance_raw: '0',
      has_activity: false,
      recent_txs: [],
      explorer_url,
      error: 'Solana RPC unreachable',
    };
  }
  const lamports = String(bal.value);
  const balanceFmt = fmtUnits(lamports, 9, 'SOL', 6);
  const recent: RecentTx[] = (sigs ?? []).slice(0, 5).map((s) => ({
    hash: s.signature,
    time: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : undefined,
    link: `https://solscan.io/tx/${s.signature}`,
    direction: s.err ? undefined : undefined,
  }));
  return {
    chain: 'solana',
    label: 'Solana',
    symbol: 'SOL',
    balance: balanceFmt,
    balance_raw: lamports,
    tx_count: recent.length,
    has_activity: bal.value > 0 || recent.length > 0,
    recent_txs: recent,
    explorer_url,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────

export async function cryptoTraceHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const address = (c.req.query('address') ?? '').trim();
  if (!address) return c.json({ error: 'missing address' }, 400);
  if (address.length > 100) return c.json({ error: 'address too long' }, 400);

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://crypto-trace-cache.internal/v1?a=${address}`);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const detected = detectChain(address);
  let results: ChainResult[] = [];
  let sanctions: SanctionsCheck = {
    listed: false,
    source: 'OFAC SDN (via 0xB10C/ofac-sanctioned-digital-currency-addresses)',
    source_url: 'https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses',
  };
  let scam: ScamSnifferCheck = {
    flagged: false,
    source: 'ScamSniffer scam-database',
    source_url: 'https://github.com/scamsniffer/scam-database',
  };
  let context: AddressContext | undefined;
  let recentTokenTransfers: TokenTransfer[] | undefined;

  if (detected === 'btc') {
    [results, sanctions] = await Promise.all([Promise.all([fetchBtc(address)]), checkAddress(address, ['XBT'])]);
  } else if (detected === 'evm') {
    // ETH list covers most EVM addresses; USDT/USDC overlap heavily but we
    // include them so token-specific entries are caught. ScamSniffer is
    // EVM-only so it runs alongside the OFAC + RPC fan-out here. We also
    // pull Blockscout enrichment (ENS, label, contract flag) and the last
    // 12 ERC-20 transfers; transfer counterparties are cross-referenced
    // against the ScamSniffer set so victims of drainers see a red flag
    // even when their own wallet is clean.
    const scamSetPromise = loadScamSnifferSet();
    let scamSet: Set<string>;
    // allSettled — one degraded EVM RPC (e.g., Arbitrum) must not blank the
    // whole trace. Failed chains are dropped from the response with a
    // wrangler-tail warning, succeeded chains render.
    const evmSettled = await Promise.all([
      Promise.allSettled(EVM_CHAINS.map((cfg) => fetchEvmChain(address, cfg))),
      checkAddress(address, ['ETH', 'USDT', 'USDC', 'ARB', 'BSC']),
      checkScamSniffer(address),
      getAddressContext(address),
      scamSetPromise,
    ]);
    const evmResults = evmSettled[0];
    results = evmResults
      .map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        const chain = EVM_CHAINS[i]?.label ?? 'unknown';
        console.warn(`crypto-trace: ${chain} RPC failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
        return null;
      })
      .filter((x): x is ChainResult => x !== null);
    [, sanctions, scam, context, scamSet] = evmSettled;
    recentTokenTransfers = await getRecentTransfers(address, scamSet);
  } else if (detected === 'solana') {
    // No SOL list published; we still resolve balance.
    results = [await fetchSolana(address)];
  }

  const body: TraceResponse = {
    address,
    detected_kind: detected,
    results,
    sanctions,
    scam,
    ...(context ? { context } : {}),
    ...(recentTokenTransfers ? { recent_token_transfers: recentTokenTransfers } : {}),
    generated_at: new Date().toISOString(),
  };

  const response = c.json(body, 200, {
    'Cache-Control': detected === 'unknown' ? 'no-store' : `public, max-age=${CACHE_TTL}`,
  });
  if (detected !== 'unknown') {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

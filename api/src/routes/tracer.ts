import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchTransfers, type TracerChain } from '../lib/chain-sources';
import { clusterCommonInputs, fetchBtcTxsRaw, type CoInputCluster } from '../lib/chain-sources/btc';
import {
  resolveSeedLabel,
  loadLabelsForAddresses,
  insertUserLabel,
  type AddressLabel,
  type LabelCategory,
} from '../lib/address-labels';
import { scoreAddress, type RiskScore } from '../lib/risk-score';
import { loadSanctionedSet, type SanctionsChain } from '../lib/ofac-sanctions';
import { loadScamSnifferSet } from '../lib/scamsniffer';
import { getAddressContext } from '../lib/blockscout';
import { analyzeCalldata } from '../lib/calldata-analysis';
import { fetchEvmTx, fetchTronTx, EVM_RPCS, type FetchedTx } from '../lib/tx-fetch';
import {
  saveTracerGraph,
  listTracerGraphs,
  getTracerGraph,
  deleteTracerGraph,
  type TracerGraphRow,
} from '../lib/tracer-graphs';
import type {
  TracerExpandInput,
  TracerLabelInput,
  TracerLabelAddInput,
  TracerCalldataInput,
  TracerGraphSaveInput,
} from '../lib/validation-schemas';

export interface TracerNode {
  id: string; // `${chain}:${address}`
  address: string;
  chain: TracerChain;
  label: string | null;
  category: LabelCategory;
  risk: RiskScore;
  is_root: boolean;
  explorer_url: string;
}

export interface TracerEdge {
  id: string;
  source: string;
  target: string;
  direction: 'in' | 'out' | 'self';
  amount: string;
  token: string;
  tx_hash: string;
  timestamp: string | null;
  confidence: 'candidate';
}

export interface ExpandResponse {
  root: TracerNode;
  nodes: TracerNode[];
  edges: TracerEdge[];
  truncated: boolean;
  warning?: string;
  cluster?: CoInputCluster[];
  generated_at: string;
}

const EXPLORER: Record<TracerChain, (a: string) => string> = {
  evm: (a) => `https://etherscan.io/address/${a}`,
  btc: (a) => `https://mempool.space/address/${a}`,
  tron: (a) => `https://tronscan.org/#/address/${a}`,
  solana: (a) => `https://solscan.io/account/${a}`,
};

const OFAC_CHAINS: Record<TracerChain, SanctionsChain[]> = {
  evm: ['ETH', 'USDT', 'USDC', 'BSC', 'ARB'],
  btc: ['XBT'],
  tron: ['TRX', 'USDT'],
  // The OFAC list keys on EVM/BTC/Tron address formats, not Solana base58 — no
  // usable Solana coverage, so Solana nodes score on D1 labels only.
  solana: [],
};

function nodeId(chain: TracerChain, address: string): string {
  return `${chain}:${address}`;
}

function normForSet(chain: TracerChain, address: string): string {
  return chain === 'evm' ? address.toLowerCase() : address;
}

function buildNode(
  chain: TracerChain,
  address: string,
  isRoot: boolean,
  sanctionedSet: Set<string>,
  scamSet: Set<string>,
  override?: AddressLabel | null
): TracerNode {
  const label = override ?? resolveSeedLabel(address, chain);
  const sanctioned = sanctionedSet.has(normForSet(chain, address));
  const scamFlagged = chain === 'evm' && scamSet.has(address.toLowerCase());
  const risk = scoreAddress({ sanctioned, scamFlagged, labelCategory: label?.category ?? null });
  return {
    id: nodeId(chain, address),
    address,
    chain,
    label: label?.label ?? null,
    category: label?.category ?? 'unknown',
    risk,
    is_root: isRoot,
    explorer_url: EXPLORER[chain](address),
  };
}

export async function tracerExpandHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerExpandInput }).parsed;
  const { address, chain } = input;

  let from = input.from;
  let to = input.to;
  if (input.around && input.toleranceMin) {
    const center = Date.parse(input.around);
    if (!Number.isNaN(center)) {
      from = new Date(center - input.toleranceMin * 60_000).toISOString();
      to = new Date(center + input.toleranceMin * 60_000).toISOString();
    }
  }
  const filter = {
    from,
    to,
    token: input.token,
    minAmount: input.minAmount,
    maxTransfers: input.maxTransfers ?? 50,
  };

  const [sanctionedSet, scamSet] = await Promise.all([
    loadSanctionedSet(OFAC_CHAINS[chain]),
    chain === 'evm' ? loadScamSnifferSet() : Promise.resolve(new Set<string>()),
  ]);

  const direction = input.direction ?? 'both';
  const { transfers, truncated } = await fetchTransfers(chain, address, filter, scamSet, c.env.ETHERSCAN_API_KEY);

  // Collect every address we will render, then load all D1 labels in ONE query.
  const allAddresses = [address, ...transfers.map((t) => t.counterparty)];
  const dbLabels = await loadLabelsForAddresses(c.env.BRIEFINGS_DB, chain, allAddresses);
  const dbLabelFor = (addr: string): AddressLabel | null =>
    dbLabels.get(chain === 'evm' ? addr.toLowerCase() : addr) ?? null;

  // Root label precedence: D1 → seed → (EVM only) Blockscout/ENS.
  let rootOverride: AddressLabel | null = dbLabelFor(address) ?? resolveSeedLabel(address, chain);
  if (chain === 'evm' && !rootOverride) {
    const ctx = await getAddressContext(address);
    const lbl = ctx.label ?? ctx.ens_name;
    if (lbl) {
      rootOverride = {
        label: lbl,
        category: ctx.is_contract ? 'contract' : 'wallet',
        source: ctx.ens_name && !ctx.label ? 'ens' : 'blockscout',
        confidence: 60,
      };
    } else if (ctx.is_scam) {
      rootOverride = { label: 'Flagged scam (Blockscout)', category: 'scammer', source: 'blockscout', confidence: 70 };
    }
  }

  const root = buildNode(chain, address, true, sanctionedSet, scamSet, rootOverride);

  const nodes: TracerNode[] = [root];
  const edges: TracerEdge[] = [];
  const seen = new Set<string>([root.id]);

  for (const t of transfers) {
    // 'self' transfers are kept under any direction filter — they render as a self-loop on the root (counterparty === root address).
    if (direction !== 'both' && t.direction !== direction && t.direction !== 'self') continue;
    const cpId = nodeId(chain, t.counterparty);
    if (!seen.has(cpId)) {
      seen.add(cpId);
      // Counterparty label precedence: D1 → seed (buildNode falls back to seed when override is null).
      nodes.push(buildNode(chain, t.counterparty, false, sanctionedSet, scamSet, dbLabelFor(t.counterparty)));
    }
    const source = t.direction === 'out' ? root.id : cpId;
    const target = t.direction === 'out' ? cpId : root.id;
    // Edge id is tx-grained (one edge per tx per counterparty); multi-transfer txs to the same counterparty intentionally collapse to one edge.
    edges.push({
      id: `${t.tx_hash}:${cpId}`,
      source,
      target,
      direction: t.direction,
      amount: t.amount,
      token: t.token,
      tx_hash: t.tx_hash,
      timestamp: t.timestamp,
      confidence: 'candidate',
    });
  }

  // BTC common-input clustering (one extra fetch; still well within budget).
  let cluster: CoInputCluster[] | undefined;
  if (chain === 'btc') {
    const btcTxs = await fetchBtcTxsRaw(address);
    const c2 = clusterCommonInputs(btcTxs, address);
    if (c2.length) cluster = c2;
  }

  const body: ExpandResponse = {
    root,
    nodes,
    edges,
    truncated,
    ...(truncated
      ? { warning: `Showing first ${filter.maxTransfers} transfers — narrow the time window or raise minAmount.` }
      : {}),
    ...(cluster ? { cluster } : {}),
    generated_at: new Date().toISOString(),
  };
  return c.json(body, 200, { 'Cache-Control': 'public, max-age=60' });
}

export async function tracerLabelHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerLabelInput }).parsed;
  const { address, chain } = input;
  const [sanctionedSet, scamSet] = await Promise.all([
    loadSanctionedSet(OFAC_CHAINS[chain]),
    chain === 'evm' ? loadScamSnifferSet() : Promise.resolve(new Set<string>()),
  ]);
  const node = buildNode(chain, address, true, sanctionedSet, scamSet);
  return c.json(
    {
      address,
      chain,
      label: node.label ? { label: node.label, category: node.category } : null,
      risk: node.risk,
      explorer_url: node.explorer_url,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}

export async function tracerLabelAddHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerLabelAddInput }).parsed;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'label store unavailable' }, 503);
  const stored = await insertUserLabel(
    db,
    input.chain,
    input.address,
    input.label,
    input.category,
    new Date().toISOString()
  );
  return c.json({ ok: true, address: input.address, chain: input.chain, label: stored }, 201);
}

export async function tracerCalldataHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerCalldataInput }).parsed;
  const { chain, hash } = input;

  const tx: FetchedTx = chain === 'tron' ? await fetchTronTx(hash) : await fetchEvmTx(hash, EVM_RPCS.eth ?? []);

  if (!tx.found) {
    return c.json(
      {
        chain,
        hash,
        analysis: {
          selector: null,
          known_method: null,
          input_size: 0,
          flags: ['tx not found'],
          embedded_pointers: [],
          verdict: 'clean',
        },
      },
      200,
      { 'Cache-Control': 'public, max-age=60' }
    );
  }

  const analysis = analyzeCalldata(tx.input);

  // Follow ONE embedded pointer across the other candidate EVM chains (the TRON→BSC dead-drop).
  let resolved_pointer: { value: string; chain: string; found: boolean; input_excerpt: string } | undefined;
  const ptr = analysis.embedded_pointers[0]?.value;
  if (ptr) {
    for (const cand of ['bsc', 'eth'] as const) {
      const hit = await fetchEvmTx(ptr, EVM_RPCS[cand] ?? []);
      if (hit.found) {
        resolved_pointer = { value: ptr, chain: cand, found: true, input_excerpt: hit.input.slice(0, 200) };
        break;
      }
    }
    if (!resolved_pointer) resolved_pointer = { value: ptr, chain: 'unknown', found: false, input_excerpt: '' };
  }

  return c.json(
    { chain, hash, from: tx.from, to: tx.to, analysis, ...(resolved_pointer ? { resolved_pointer } : {}) },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}

export async function tracerGraphSaveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: TracerGraphSaveInput }).parsed;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'graph store unavailable' }, 503);
  const now = new Date().toISOString();
  const row: TracerGraphRow = {
    id: crypto.randomUUID(),
    investigation_id: input.investigation_id ?? null,
    title: input.title,
    seed_address: input.seed_address,
    chain: input.chain,
    graph_json: input.graph_json,
    created_at: now,
    updated_at: now,
  };
  await saveTracerGraph(db, row);
  return c.json({ id: row.id, title: row.title }, 201);
}

export async function tracerGraphListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'graph store unavailable' }, 503);
  return c.json({ graphs: await listTracerGraphs(db) }, 200);
}

export async function tracerGraphGetHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'graph store unavailable' }, 503);
  const row = await getTracerGraph(db, c.req.param('id') ?? '');
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row, 200);
}

export async function tracerGraphDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'graph store unavailable' }, 503);
  await deleteTracerGraph(db, c.req.param('id') ?? '');
  return c.json({ ok: true }, 200);
}

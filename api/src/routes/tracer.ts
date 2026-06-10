import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchTransfers, type TracerChain } from '../lib/chain-sources';
import { resolveSeedLabel, loadLabelsForAddresses, type AddressLabel, type LabelCategory } from '../lib/address-labels';
import { scoreAddress, type RiskScore } from '../lib/risk-score';
import { loadSanctionedSet, type SanctionsChain } from '../lib/ofac-sanctions';
import { loadScamSnifferSet } from '../lib/scamsniffer';
import { getAddressContext } from '../lib/blockscout';
import type { TracerExpandInput, TracerLabelInput } from '../lib/validation-schemas';

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
  generated_at: string;
}

const EXPLORER: Record<TracerChain, (a: string) => string> = {
  evm: (a) => `https://etherscan.io/address/${a}`,
  btc: (a) => `https://mempool.space/address/${a}`,
  tron: (a) => `https://tronscan.org/#/address/${a}`,
};

const OFAC_CHAINS: Record<TracerChain, SanctionsChain[]> = {
  evm: ['ETH', 'USDT', 'USDC', 'BSC', 'ARB'],
  btc: ['XBT'],
  tron: ['TRX', 'USDT'],
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
  const { transfers, truncated } = await fetchTransfers(chain, address, filter, scamSet);

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

  const body: ExpandResponse = {
    root,
    nodes,
    edges,
    truncated,
    ...(truncated
      ? { warning: `Showing first ${filter.maxTransfers} transfers — narrow the time window or raise minAmount.` }
      : {}),
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

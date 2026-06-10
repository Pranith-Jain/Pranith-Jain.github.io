import type {
  GraphNodeType,
  GraphResponse,
  GraphNodeData,
  GraphEdgeData,
} from '../../pages/threatintel/relationship-graph-shared';

export type TracerChain = 'evm' | 'btc' | 'tron';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface TracerNode {
  id: string;
  address: string;
  chain: TracerChain;
  label: string | null;
  category: string;
  risk: { level: RiskLevel; score: number; signals: string[] };
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
  confidence: 'candidate' | 'confirmed';
}

export interface CoInputCluster {
  address: string;
  shared_tx_count: number;
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

export interface TracerGraph {
  seedId: string;
  nodes: Map<string, TracerNode>;
  edges: Map<string, TracerEdge>;
}

export function emptyGraph(seedId: string): TracerGraph {
  return { seedId, nodes: new Map(), edges: new Map() };
}

export function riskToNodeType(level: RiskLevel): GraphNodeType {
  return `crypto_${level}` as GraphNodeType;
}

/** Merge an /expand payload into the graph (dedupe by id; preserve confirmed edges on re-expand). */
export function mergeExpand(graph: TracerGraph, resp: ExpandResponse): TracerGraph {
  const nodes = new Map(graph.nodes);
  const edges = new Map(graph.edges);
  for (const n of resp.nodes) nodes.set(n.id, nodes.get(n.id) ?? n);
  for (const e of resp.edges) {
    const prior = edges.get(e.id);
    edges.set(e.id, prior?.confidence === 'confirmed' ? { ...e, confidence: 'confirmed' } : e);
  }
  return { seedId: graph.seedId, nodes, edges };
}

export function confirmEdge(graph: TracerGraph, edgeId: string): TracerGraph {
  const edges = new Map(graph.edges);
  const e = edges.get(edgeId);
  if (e) edges.set(edgeId, { ...e, confidence: 'confirmed' });
  return { ...graph, edges };
}

function shortAddr(a: string): string {
  return a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Project the client graph into the shape RelationshipGraphCanvas consumes. */
export function toGraphResponse(graph: TracerGraph): GraphResponse {
  const nodes: GraphNodeData[] = [...graph.nodes.values()].map((n) => ({
    id: n.id,
    type: riskToNodeType(n.risk.level),
    label: n.label ?? shortAddr(n.address),
    subtitle: `${n.category} · ${n.risk.level}`,
    data: { ...n },
  }));
  const edges: GraphEdgeData[] = [...graph.edges.values()].map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: `${e.direction} ${e.amount}${e.confidence === 'confirmed' ? ' ✓' : ''}`,
    data: { confidence: e.confidence, tx_hash: e.tx_hash, timestamp: e.timestamp },
  }));
  const seedNode = graph.nodes.get(graph.seedId);
  return {
    nodes,
    edges,
    seed: graph.nodes.get(graph.seedId)?.address ?? '',
    seed_type: seedNode ? riskToNodeType(seedNode.risk.level) : null,
    generated_at: new Date().toISOString(),
    depth: 1,
    truncated: false,
  };
}

/**
 * Types + node palette shared between RelationshipGraph (the page shell) and
 * RelationshipGraphCanvas (the lazily-loaded ReactFlow/dagre canvas). Kept dep-
 * free so importing it into the page does NOT pull in @xyflow/react or dagre —
 * those load only when the canvas chunk is fetched.
 */

export type GraphNodeType =
  | 'cve'
  | 'actor'
  | 'ransomware'
  | 'malware'
  | 'campaign'
  | 'ip'
  | 'domain'
  | 'hash'
  | 'technique'
  | 'victim'
  | 'c2_framework'
  | 'product'
  | 'reference'
  | 'crypto_low'
  | 'crypto_medium'
  | 'crypto_high'
  | 'crypto_critical';

export interface GraphNodeData {
  id: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  weight?: number;
  data?: Record<string, unknown>;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface GraphResponse {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  seed: string;
  seed_type: GraphNodeType | null;
  generated_at: string;
  depth: number;
  truncated: boolean;
  warning?: string;
}

export type LayoutMode = 'dagre' | 'force';

export type PathFinderState =
  | { phase: 'idle' }
  | { phase: 'select-first' }
  | { phase: 'select-second'; first: string }
  | { phase: 'result'; first: string; second: string; path: string[] };

export const NODE_COLORS: Record<GraphNodeType, string> = {
  cve: '#f59e0b',
  actor: '#ef4444',
  ransomware: '#f97316',
  malware: '#a855f7',
  campaign: '#ec4899',
  ip: '#3b82f6',
  domain: '#06b6d4',
  hash: '#14b8a6',
  technique: '#8b5cf6',
  victim: '#6b7280',
  c2_framework: '#84cc16',
  product: '#6366f1',
  reference: '#94a3b8',
  crypto_low: '#22c55e',
  crypto_medium: '#eab308',
  crypto_high: '#fb923c',
  crypto_critical: '#dc2626',
};

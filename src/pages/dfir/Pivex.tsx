import { useState, useMemo, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { Network, Search, Download, Eye, EyeOff, Loader2 } from 'lucide-react';

type EntityType =
  | 'ip'
  | 'domain'
  | 'certificate'
  | 'asn'
  | 'actor'
  | 'cve'
  | 'ransomware'
  | 'malware'
  | 'campaign'
  | 'hash'
  | 'technique'
  | 'victim'
  | 'c2_framework'
  | 'product'
  | 'reference';

interface GraphNode {
  id: string;
  label: string;
  type: EntityType;
  subtitle?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

interface GraphApiResponse {
  nodes: Array<{ id: string; type: string; label: string; subtitle?: string }>;
  edges: Array<{ id: string; source: string; target: string; label: string }>;
  seed: string;
  seed_type: string | null;
  truncated: boolean;
  warning?: string;
}

const ENTITY_COLORS: Record<string, string> = {
  ip: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  domain: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  certificate: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  asn: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  actor: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  cve: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  ransomware: 'border-rose-600/40 bg-rose-600/10 text-rose-700 dark:text-rose-300',
  malware: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  campaign: 'border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  hash: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  technique: 'border-cyan-500/40 bg-cyan-500/10 text-sky-700 dark:text-sky-300',
  victim: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  c2_framework: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  product: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  reference: 'border-slate-400/40 bg-slate-400/10 text-muted',
};

const ENTITY_BG: Record<string, string> = {
  ip: 'bg-blue-100 dark:bg-blue-900/20',
  domain: 'bg-emerald-100 dark:bg-emerald-900/20',
  certificate: 'bg-amber-100 dark:bg-amber-900/20',
  asn: 'bg-purple-100 dark:bg-purple-900/20',
  actor: 'bg-rose-100 dark:bg-rose-900/20',
  cve: 'bg-rose-100 dark:bg-rose-900/20',
  ransomware: 'bg-rose-100 dark:bg-rose-900/20',
  malware: 'bg-orange-100 dark:bg-orange-900/20',
  campaign: 'bg-pink-100 dark:bg-pink-900/20',
  hash: 'bg-slate-100 dark:bg-[rgb(var(--surface-200))]/20',
  technique: 'bg-sky-100 dark:bg-cyan-900/20',
  victim: 'bg-slate-100 dark:bg-[rgb(var(--surface-200))]/20',
  c2_framework: 'bg-fuchsia-100 dark:bg-fuchsia-900/20',
  product: 'bg-teal-100 dark:bg-teal-900/20',
  reference: 'bg-slate-100 dark:bg-[rgb(var(--surface-200))]/20',
};

const ENTITY_ICON_COLORS: Record<string, string> = {
  ip: 'text-blue-600 dark:text-blue-400',
  domain: 'text-emerald-600 dark:text-emerald-400',
  certificate: 'text-amber-600 dark:text-amber-400',
  asn: 'text-purple-600 dark:text-purple-400',
  actor: 'text-rose-600 dark:text-rose-400',
  cve: 'text-rose-600 dark:text-rose-400',
  ransomware: 'text-rose-600 dark:text-rose-400',
  malware: 'text-orange-600 dark:text-orange-400',
  campaign: 'text-pink-600 dark:text-pink-400',
  hash: 'text-muted',
  technique: 'text-cyan-600 dark:text-cyan-400',
  victim: 'text-muted',
  c2_framework: 'text-fuchsia-600 dark:text-fuchsia-400',
  product: 'text-teal-600 dark:text-teal-400',
  reference: 'text-slate-500 dark:text-slate-400',
};

const TYPE_LABELS: Record<string, string> = {
  ip: 'IP Address',
  domain: 'Domain',
  certificate: 'Certificate',
  asn: 'ASN',
  actor: 'Threat Actor',
  cve: 'CVE',
  ransomware: 'Ransomware',
  malware: 'Malware',
  campaign: 'Campaign',
  hash: 'Hash',
  technique: 'MITRE Technique',
  victim: 'Victim',
  c2_framework: 'C2 Framework',
  product: 'Product',
  reference: 'Reference',
};

export default function Pivex(): JSX.Element {
  const [query, setQuery] = useState('');
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [highlightNode, setHighlightNode] = useState<string | null>(null);
  const [highlightMode, setHighlightMode] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedInfo, setSeedInfo] = useState<{
    seed: string;
    type: string | null;
    truncated: boolean;
    warning?: string;
  } | null>(null);

  const adjacencyList = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [edges]);

  const connectedNodeIds = useMemo(() => {
    if (!highlightNode || !highlightMode) return null;
    const visited = new Set<string>();
    const queue = [highlightNode];
    visited.add(highlightNode);
    for (const id of queue) {
      const neighbors = adjacencyList.get(id);
      if (neighbors) {
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
    }
    return visited;
  }, [highlightNode, highlightMode, adjacencyList]);

  const edgesBySource = useMemo(() => {
    const map = new Map<string, GraphEdge[]>();
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, []);
      map.get(e.source)!.push(e);
    }
    return map;
  }, [edges]);

  const handleBuildGraph = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setShowGraph(true);
    try {
      const res = await fetch(`/api/v1/relationship-graph?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: GraphApiResponse = await res.json();
      const mappedNodes: GraphNode[] = data.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        type: (n.type as EntityType) ?? 'domain',
        subtitle: n.subtitle,
      }));
      const mappedEdges: GraphEdge[] = data.edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label,
      }));
      setNodes(mappedNodes);
      setEdges(mappedEdges);
      setSeedInfo({ seed: data.seed, type: data.seed_type, truncated: data.truncated, warning: data.warning });
    } catch (e) {
      console.error('handler failed:', e instanceof Error ? e.message : String(e));
      setError(e instanceof Error ? e.message : 'Graph build failed');
      setNodes([]);
      setEdges([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleExportJson = useCallback(() => {
    const graph = {
      nodes,
      edges,
      metadata: { generated: new Date().toISOString(), totalNodes: nodes.length, totalEdges: edges.length },
    };
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pivex-graph-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  const getNodeColor = (type: string): string => ENTITY_COLORS[type] ?? ENTITY_COLORS.reference ?? '';
  const getNodeBg = (type: string): string => ENTITY_BG[type] ?? ENTITY_BG.reference ?? '';
  const getIconColor = (type: string): string => ENTITY_ICON_COLORS[type] ?? ENTITY_ICON_COLORS.reference ?? '';

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const isDimmed = (nodeId: string) => {
    if (!connectedNodeIds || !highlightMode) return false;
    return !connectedNodeIds.has(nodeId);
  };

  const edgeOpacity = (source: string, target: string) => {
    if (!connectedNodeIds || !highlightMode) return 'opacity-100';
    if (connectedNodeIds.has(source) && connectedNodeIds.has(target)) return 'opacity-100';
    return 'opacity-10';
  };

  const uniqueEdgeLabels = useMemo(() => [...new Set(edges.map((e) => e.label))], [edges]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Network size={28} className="text-brand-600 dark:text-brand-400" /> PIVEX
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Infrastructure pivot graph — map relationships between IPs, domains, certificates, ASNs, and threat actors.
          {nodes.length > 0 && (
            <span className="text-slate-500">
              {' '}
              {nodes.length} nodes · {edges.length} relationships
            </span>
          )}
        </p>
      </div>

      <div className="surface-card/40 shadow-e1 p-5 mb-6">
        <h2 className="font-display font-bold text-sm mb-3">Start Investigation</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuildGraph()}
              placeholder="IP address, domain, CVE, actor name, or hash…"
              className="w-full pl-9 pr-3 h-10 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 font-mono"
            />
          </div>
          <button
            onClick={handleBuildGraph}
            disabled={loading || !query.trim()}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 rounded-xl text-sm font-semibold text-white transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
            {loading ? 'Building…' : 'Build Graph'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300/50 dark:border-rose-800/50 bg-rose-50/50 dark:bg-rose-950/20 p-4 mb-6">
          <p className="text-sm text-rose-700 dark:text-rose-300 font-mono">{error}</p>
        </div>
      )}

      {!showGraph && !loading && (
        <div className="surface-card/40 shadow-e1 p-8 text-center">
          <Network size={48} className="mx-auto mb-3 text-slate-300 dark:text-slate-400" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Enter an IP, domain, CVE, or actor name and click{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">Build Graph</span> to visualise the
            infrastructure pivot graph.
          </p>
        </div>
      )}

      {showGraph && (
        <div className="space-y-6 animate-fade-in-up">
          {seedInfo && (
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <span>
                Seed: <span className="text-slate-700 dark:text-slate-300">{seedInfo.seed}</span>
              </span>
              {seedInfo.type && <span className="text-slate-400">({seedInfo.type})</span>}
              {seedInfo.truncated && <span className="text-amber-600">· truncated</span>}
              {seedInfo.warning && <span className="text-amber-600">· {seedInfo.warning}</span>}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {nodes.length} entities · {edges.length} relationships
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setHighlightMode(!highlightMode);
                  if (!highlightMode) setHighlightNode(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition-colors flex items-center gap-1.5 ${highlightMode ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-brand-500/30'}`}
              >
                {highlightMode ? <Eye size={12} /> : <EyeOff size={12} />}
                {highlightMode ? 'Highlight On' : 'Highlight Mode'}
              </button>
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 rounded-xl text-xs font-mono border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-brand-500/30 transition-colors flex items-center gap-1.5"
              >
                <Download size={12} /> Export JSON
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.keys(TYPE_LABELS)
              .filter((t) => nodes.some((n) => n.type === t))
              .map((type) => (
                <div
                  key={type}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-mono ${getNodeColor(type)}`}
                >
                  <span className={`w-2 h-2 rounded-full ${getNodeBg(type)} border`} />
                  {TYPE_LABELS[type]}
                </div>
              ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200)/0.6)] shadow-e1 p-6 overflow-x-auto">
            <div className="flex flex-col gap-6 min-w-[700px]">
              <GraphCluster
                nodes={nodes}
                edgesBySource={edgesBySource}
                nodeMap={nodeMap}
                getNodeColor={getNodeColor}
                getIconColor={getIconColor}
                isDimmed={isDimmed}
                edgeOpacity={edgeOpacity}
                highlightNode={highlightNode}
                onNodeClick={(id) => setHighlightNode(highlightNode === id ? null : id)}
              />
            </div>
          </div>

          {uniqueEdgeLabels.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uniqueEdgeLabels.map((label) => (
                <RelationCard
                  key={label}
                  title={label}
                  edges={edges.filter((e) => e.label === label)}
                  nodeMap={nodeMap}
                  getNodeColor={getNodeColor}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GraphCluster({
  nodes: graphNodes,
  edgesBySource,
  nodeMap,
  getNodeColor,
  getIconColor,
  isDimmed,
  edgeOpacity: getEdgeOpacity,
  highlightNode,
  onNodeClick,
}: {
  nodes: GraphNode[];
  edgesBySource: Map<string, GraphEdge[]>;
  nodeMap: Map<string, GraphNode>;
  getNodeColor: (t: string) => string;
  getIconColor: (t: string) => string;
  isDimmed: (id: string) => boolean;
  edgeOpacity: (s: string, t: string) => string;
  highlightNode: string | null;
  onNodeClick: (id: string) => void;
}) {
  const typeOrder = [
    'ip',
    'domain',
    'certificate',
    'asn',
    'actor',
    'cve',
    'ransomware',
    'malware',
    'campaign',
    'hash',
    'technique',
    'victim',
    'c2_framework',
    'product',
    'reference',
  ];
  const grouped = new Map<string, GraphNode[]>();
  for (const type of typeOrder) grouped.set(type, []);
  for (const n of graphNodes) {
    const arr = grouped.get(n.type);
    if (arr) arr.push(n);
  }

  return (
    <div className="space-y-8">
      {typeOrder.map((type) => {
        const typeNodes = grouped.get(type) ?? [];
        if (typeNodes.length === 0) return null;
        return (
          <div key={type}>
            <h3 className={`text-xs font-mono font-semibold uppercase tracking-wider mb-3 ${getIconColor(type)}`}>
              {TYPE_LABELS[type] ?? type} ({typeNodes.length})
            </h3>
            <div className="flex flex-wrap gap-3">
              {typeNodes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onNodeClick(n.id)}
                  className={`px-3 py-2 rounded-xl border text-left transition-all ${getNodeColor(n.type)} ${isDimmed(n.id) ? 'opacity-20' : 'hover:scale-105'} ${highlightNode === n.id ? 'ring-2 ring-brand-500' : ''}`}
                >
                  <div className="text-xs font-mono font-bold">{n.label}</div>
                  {n.subtitle && <div className="text-micro opacity-70 mt-0.5">{n.subtitle}</div>}
                </button>
              ))}
            </div>
            <div className="mt-2 space-y-0.5">
              {typeNodes.flatMap((n) =>
                (edgesBySource.get(n.id) ?? []).map((e) => {
                  const target = nodeMap.get(e.target);
                  if (!target) return null;
                  return (
                    <div
                      key={`${e.source}-${e.target}`}
                      className={`flex items-center gap-2 text-mini font-mono transition-opacity ${getEdgeOpacity(e.source, e.target)}`}
                    >
                      <span className="text-slate-500">{n.label}</span>
                      <span className="text-slate-400">── {e.label} ──</span>
                      <span className="text-slate-600 dark:text-slate-300">{target.label}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RelationCard({
  title,
  edges,
  nodeMap,
  getNodeColor,
}: {
  title: string;
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  getNodeColor: (t: string) => string;
}) {
  return (
    <div className="surface-card/40 shadow-e1 p-4">
      <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        {title}
      </h3>
      {edges.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No relationships mapped</p>
      ) : (
        <div className="space-y-1.5">
          {edges.map((e, i) => {
            const source = nodeMap.get(e.source);
            const target = nodeMap.get(e.target);
            if (!source || !target) return null;
            return (
              <div key={`${e.source}-${e.target}-${i}`} className="flex items-center gap-2 text-xs font-mono">
                <span className={`px-1.5 py-0.5 rounded text-micro ${getNodeColor(source.type)}`}>{source.label}</span>
                <span className="text-slate-400 text-micro">→</span>
                <span className={`px-1.5 py-0.5 rounded text-micro ${getNodeColor(target.type)}`}>{target.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

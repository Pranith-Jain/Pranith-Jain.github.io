import { Suspense, lazy, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Loader2, AlertTriangle, ExternalLink, Hash, Bug, TrendingUp, Network } from 'lucide-react';

type GraphNodeType =
  | 'cve' | 'actor' | 'ransomware' | 'malware' | 'campaign'
  | 'ip' | 'domain' | 'hash' | 'technique' | 'victim'
  | 'c2_framework' | 'product' | 'reference';

interface GraphNodeData {
  id: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  weight?: number;
  data?: Record<string, unknown>;
}

interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface GraphResponse {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  seed: string;
  seed_type: GraphNodeType | null;
  generated_at: string;
  depth: number;
  truncated: boolean;
  warning?: string;
}

const NODE_COLORS: Record<GraphNodeType, string> = {
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
};

function RelNodeBox({ data, selected }: { data: { label: string; subtitle?: string; nodeType: GraphNodeType }; selected?: boolean }): JSX.Element {
  const color = NODE_COLORS[data.nodeType] ?? '#94a3b8';
  return (
    <div
      className={`rounded-lg border-2 px-3 py-2 text-xs font-mono shadow-sm bg-white dark:bg-slate-900 ${
        selected ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950' : ''
      }`}
      style={{ borderColor: color, minWidth: 130, maxWidth: 200 }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div className="text-[10px] uppercase tracking-wider font-bold mb-0.5" style={{ color }}>
        {data.nodeType}
      </div>
      <div className="text-slate-900 dark:text-slate-100 break-words leading-tight">{data.label}</div>
      {data.subtitle && (
        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{data.subtitle}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { relNode: RelNodeBox };

function RelGraph({ nodes, edges, onNodeClick }: {
  nodes: Array<{ id: string; [k: string]: unknown }>;
  edges: Array<{ id: string; [k: string]: unknown }>;
  onNodeClick: (e: unknown, node: { id: string; [k: string]: unknown }) => void;
}): JSX.Element {
  return (
    <ReactFlow
      nodes={nodes as unknown as Node[]}
      edges={edges as unknown as Edge[]}
      nodeTypes={NODE_TYPES}
      onNodeClick={onNodeClick as unknown as (e: unknown, node: Node) => void}
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1} />
      <Controls position="bottom-right" showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        maskColor="rgba(15, 23, 42, 0.6)"
        nodeColor={(n) =>
          NODE_COLORS[(n.data as { nodeType?: GraphNodeType })?.nodeType ?? 'reference'] ?? '#94a3b8'
        }
        style={{ height: 80 }}
      />
    </ReactFlow>
  );
}

interface TrendingCve {
  id: string;
  severity?: string;
}

const EXAMPLE_QUERIES = ['LockBit', 'APT28', 'Lazarus Group', 'CVE-2024-1709', 'CVE-2023-34362'];

const DEFAULT_AUTO_SEED = 'CVE-2024-1709';

export default function RelationshipGraphPage(): JSX.Element {
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);
  const [trendingCves, setTrendingCves] = useState<TrendingCve[]>([]);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch trending CVEs on mount for suggestion chips
  useEffect(() => {
    fetch('/api/v1/cve-recent')
      .then((r) => r.json())
      .then((data: { cves?: TrendingCve[] }) => {
        const list = (data.cves ?? []).slice(0, 12);
        setTrendingCves(list);
        // Auto-load with the first trending critical CVE or the default seed
        if (!autoLoaded && list.length > 0) {
          const critical = list.find((c) => c.severity === 'CRITICAL' || c.severity === 'HIGH');
          const seed = critical?.id ?? DEFAULT_AUTO_SEED;
          setQuery(seed);
          void fetchGraph(seed);
          setAutoLoaded(true);
        }
      })
      .catch(() => {
        // fallback: still auto-load with default seed
        if (!autoLoaded) {
          setQuery(DEFAULT_AUTO_SEED);
          void fetchGraph(DEFAULT_AUTO_SEED);
          setAutoLoaded(true);
        }
      })
      .finally(() => setInitialLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchGraph = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    try {
      const res = await fetch(`/api/v1/relationship-graph?q=${encodeURIComponent(q.trim())}&depth=${depth}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as GraphResponse;
      setGraphData(data);
    } catch (e) {
      setError((e as Error).message);
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  }, [depth]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchGraph(query);
  };

  const flowNodes = useMemo(() => {
    if (!graphData) return [];
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 120, marginx: 40, marginy: 40 });

    const nodes = graphData.nodes.map((n) => ({
      id: n.id,
      type: 'relNode',
      position: { x: 0, y: 0 },
      data: {
        label: n.label,
        subtitle: n.subtitle,
        nodeType: n.type,
        raw: n,
      },
    }));

    const nodeWidth = 160;
    const nodeHeight = 50;
    for (const n of nodes) {
      g.setNode(n.id, { width: nodeWidth, height: nodeHeight });
    }
    for (const e of graphData.edges) {
      g.setEdge(e.source, e.target);
    }
    dagre.layout(g);

    for (const n of nodes) {
      const pos = g.node(n.id);
      if (pos) {
        n.position = { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 };
      }
    }
    return nodes;
  }, [graphData]);

  const flowEdges = useMemo(() => {
    if (!graphData) return [];
    return graphData.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'smoothstep',
      style: { stroke: '#475569', strokeWidth: 1.5 },
      labelStyle: { fontSize: 9, fontFamily: 'ui-monospace, monospace', fill: '#94a3b8' },
      labelBgStyle: { fill: 'transparent' },
    }));
  }, [graphData]);

  const onNodeClick = useCallback((_e: unknown, node: { id: string; data?: { raw?: GraphNodeData } }) => {
    setSelectedNode(node.data?.raw ?? null);
  }, []);

  const clearGraph = () => {
    setGraphData(null);
    setSelectedNode(null);
    setError(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Relationship Graph</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-3xl">
          Explore connections between CVEs, threat actors, ransomware groups, MITRE techniques, and more.
          Search any entity to see its relationships across all intelligence sources.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="flex gap-3 items-end mb-6 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="rel-graph-query" className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">
            Search entity
          </label>
          <input
            id="rel-graph-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="CVE ID, actor name, IP, domain, hash…"
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            spellCheck={false}
          />
        </div>
        <div>
          <label htmlFor="rel-graph-depth" className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">
            Depth
          </label>
          <select
            id="rel-graph-depth"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          >
            <option value={1}>1 hop</option>
            <option value={2}>2 hops</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-mono text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Exploring…' : 'Explore'}
          </button>
          {graphData && (
            <button
              type="button"
              onClick={clearGraph}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-sm"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Suggested examples */}
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="text-[11px] font-mono text-slate-500 self-center">Try:</span>
        {EXAMPLE_QUERIES.map((eq) => (
          <button
            key={eq}
            type="button"
            onClick={() => { setQuery(eq); void fetchGraph(eq); }}
            className="text-[11px] font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
          >
            {eq}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-sm font-mono inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {graphData?.warning && (
        <div className="mb-4 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-300 text-xs font-mono inline-flex items-center gap-1.5">
          <AlertTriangle size={12} /> {graphData.warning}
        </div>
      )}

      {/* Main layout: graph + detail panel */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Graph canvas */}
        <div
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden"
          style={{ height: '70vh', minHeight: 520 }}
        >
          {loading || initialLoading ? (
            <div className="flex h-full items-center justify-center text-slate-500 font-mono text-xs gap-2">
              <Loader2 size={14} className="animate-spin" /> building relationship graph…
            </div>
          ) : graphData && flowNodes.length > 0 ? (
            <RelGraph nodes={flowNodes} edges={flowEdges} onNodeClick={onNodeClick} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-slate-500 font-mono text-sm gap-4 p-8 text-center">
              <Network size={40} className="text-slate-300 dark:text-slate-600" />
              <div className="font-semibold text-slate-600 dark:text-slate-400">
                Search any entity to see its relationships
              </div>
              <div className="text-xs text-slate-400 max-w-md">
                Traverses CVE ↔ actor, actor ↔ ransomware, actor ↔ technique, and infrastructure links across all intelligence sources.
              </div>
              {/* Trending CVEs as clickable starting points */}
              {trendingCves.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-center gap-1.5">
                    <TrendingUp size={12} /> trending CVEs
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5 max-w-lg">
                    {trendingCves.slice(0, 8).map((cve) => (
                      <button
                        key={cve.id}
                        type="button"
                        onClick={() => { setQuery(cve.id); void fetchGraph(cve.id); }}
                        className="text-[11px] font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
                      >
                        {cve.id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <aside className="space-y-4">
          {selectedNode ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 animate-fade-in-up">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-500">Selected</div>
              </div>
              <div
                className="text-[10px] uppercase tracking-wider font-bold mb-1"
                style={{ color: NODE_COLORS[selectedNode.type] ?? '#94a3b8' }}
              >
                {selectedNode.type}
              </div>
              <div className="font-display font-semibold text-slate-900 dark:text-slate-100 mb-1 break-words">
                {selectedNode.label}
              </div>
              {selectedNode.subtitle && (
                <div className="text-xs font-mono text-slate-500 mb-3">{selectedNode.subtitle}</div>
              )}
              {selectedNode.data && Object.keys(selectedNode.data).length > 0 && (
                <pre className="font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-80 bg-slate-50 dark:bg-slate-950 rounded p-2 border border-slate-200 dark:border-slate-800">
                  {JSON.stringify(selectedNode.data, null, 2)}
                </pre>
              )}
            </div>
          ) : graphData ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center text-xs font-mono text-slate-500">
              <Bug size={16} className="mx-auto mb-2 text-slate-400" />
              Click any node to inspect its data.
            </div>
          ) : null}

          {/* Legend */}
          {graphData && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-3">Legend</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {(Object.entries(NODE_COLORS) as [GraphNodeType, string][]).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    {type}
                  </div>
                ))}
              </div>
            </div>
          )}

          {graphData && (
            <div className="text-[10px] font-mono text-slate-500 text-center">
              {graphData.nodes.length} nodes · {graphData.edges.length} edges · depth {graphData.depth}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

import { useState, useMemo, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Network,
  Search,
  Download,
  Eye,
  EyeOff,
} from 'lucide-react';

type EntityType = 'ip' | 'domain' | 'certificate' | 'asn' | 'actor';

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

const ENTITY_COLORS: Record<EntityType, string> = {
  ip: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  domain: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  certificate: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  asn: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  actor: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const ENTITY_BG: Record<EntityType, string> = {
  ip: 'bg-blue-100 dark:bg-blue-900/20',
  domain: 'bg-emerald-100 dark:bg-emerald-900/20',
  certificate: 'bg-amber-100 dark:bg-amber-900/20',
  asn: 'bg-purple-100 dark:bg-purple-900/20',
  actor: 'bg-rose-100 dark:bg-rose-900/20',
};

const ENTITY_ICON_COLORS: Record<EntityType, string> = {
  ip: 'text-blue-600 dark:text-blue-400',
  domain: 'text-emerald-600 dark:text-emerald-400',
  certificate: 'text-amber-600 dark:text-amber-400',
  asn: 'text-purple-600 dark:text-purple-400',
  actor: 'text-rose-600 dark:text-rose-400',
};

const EXAMPLE_NODES: GraphNode[] = [
  { id: 'ip-1', label: '185.130.44.0', type: 'ip', subtitle: 'Origin IP' },
  { id: 'ip-2', label: '198.51.100.23', type: 'ip', subtitle: 'C2 Server' },
  { id: 'ip-3', label: '203.0.113.88', type: 'ip', subtitle: 'Exfil IP' },

  { id: 'dom-1', label: 'malware-c2.net', type: 'domain', subtitle: 'C2 Domain' },
  { id: 'dom-2', label: 'update-service.org', type: 'domain', subtitle: 'Phishing Domain' },
  { id: 'dom-3', label: 'cdn-assets.io', type: 'domain', subtitle: 'Staging Domain' },
  { id: 'dom-4', label: 'docs-helper.com', type: 'domain', subtitle: 'SAN Domain' },
  { id: 'dom-5', label: 'api-gateway.dev', type: 'domain', subtitle: 'SAN Domain' },
  { id: 'dom-6', label: 'analytics-pulse.net', type: 'domain', subtitle: 'SAN Domain' },
  { id: 'dom-7', label: 'status-checker.org', type: 'domain', subtitle: 'SAN Domain' },
  { id: 'dom-8', label: 'redirect-edge.com', type: 'domain', subtitle: 'SAN Domain' },
  { id: 'dom-9', label: 'known-malware.bazar', type: 'domain', subtitle: 'Malware Domain' },

  { id: 'cert-1', label: '*.malware-c2.net', type: 'certificate', subtitle: 'Wildcard Cert' },

  { id: 'asn-1', label: 'ASN 394161', type: 'asn', subtitle: 'Hosting Provider' },
  { id: 'asn-2', label: 'ASN 20473', type: 'asn', subtitle: 'AS SHARKTECH' },

  { id: 'actor-1', label: 'TA-1842', type: 'actor', subtitle: 'FIN7 Cluster' },
];

const EXAMPLE_EDGES: GraphEdge[] = [
  { source: 'ip-1', target: 'dom-1', label: 'reverse DNS' },
  { source: 'ip-1', target: 'dom-2', label: 'reverse DNS' },
  { source: 'ip-1', target: 'dom-3', label: 'reverse DNS' },
  { source: 'dom-1', target: 'ip-2', label: 'DNS resolution' },
  { source: 'dom-2', target: 'ip-2', label: 'DNS resolution' },
  { source: 'dom-1', target: 'cert-1', label: 'CT log' },
  { source: 'cert-1', target: 'dom-3', label: 'SAN' },
  { source: 'cert-1', target: 'dom-4', label: 'SAN' },
  { source: 'cert-1', target: 'dom-5', label: 'SAN' },
  { source: 'cert-1', target: 'dom-6', label: 'SAN' },
  { source: 'cert-1', target: 'dom-7', label: 'SAN' },
  { source: 'cert-1', target: 'dom-8', label: 'SAN' },
  { source: 'ip-2', target: 'asn-1', label: 'BGP origin' },
  { source: 'ip-3', target: 'asn-2', label: 'BGP origin' },
  { source: 'asn-2', target: 'dom-9', label: 'hosts domain' },
  { source: 'actor-1', target: 'dom-1', label: 'attributed C2' },
  { source: 'actor-1', target: 'ip-3', label: 'attributed exfil' },
  { source: 'dom-9', target: 'asn-2', label: 'DNS resolution' },
];

const EDGE_LABEL_COLORS: Record<string, string> = {
  'reverse DNS': 'text-cyan-600 dark:text-cyan-400',
  'DNS resolution': 'text-emerald-600 dark:text-emerald-400',
  'CT log': 'text-amber-600 dark:text-amber-400',
  SAN: 'text-orange-600 dark:text-orange-400',
  'BGP origin': 'text-purple-600 dark:text-purple-400',
  'hosts domain': 'text-sky-600 dark:text-sky-400',
  'attributed C2': 'text-rose-600 dark:text-rose-400',
  'attributed exfil': 'text-rose-600 dark:text-rose-400',
};

const TYPE_LABELS: Record<EntityType, string> = {
  ip: 'IP Address',
  domain: 'Domain',
  certificate: 'Certificate',
  asn: 'ASN',
  actor: 'Threat Actor',
};

export default function Pivex(): JSX.Element {
  const [query, setQuery] = useState('185.130.44.0');
  const [highlightNode, setHighlightNode] = useState<string | null>(null);
  const [highlightMode, setHighlightMode] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  const nodes = EXAMPLE_NODES;
  const edges = EXAMPLE_EDGES;

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

  const handleBuildGraph = useCallback(() => {
    setShowGraph(true);
  }, []);

  const handleExportJson = useCallback(() => {
    const graph = { nodes, edges, metadata: { generated: new Date().toISOString(), totalNodes: nodes.length, totalEdges: edges.length } };
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pivex-graph-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  const getNodeColor = (type: EntityType) => ENTITY_COLORS[type];
  const getNodeBg = (type: EntityType) => ENTITY_BG[type];
  const getIconColor = (type: EntityType) => ENTITY_ICON_COLORS[type];

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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Network size={28} className="text-brand-600 dark:text-brand-400" /> PIVEX
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Infrastructure pivot graph — map relationships between IPs, domains, certificates, ASNs, and threat actors
          using force-directed link analysis. <span className="text-slate-500">{nodes.length} node types · {edges.length} edge types</span>
        </p>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5 mb-6">
        <h2 className="font-display font-bold text-sm mb-3">Start Investigation</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="IP address, domain, or certificate hash…"
              className="w-full pl-9 pr-3 h-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 font-mono"
            />
          </div>
          <button
            onClick={handleBuildGraph}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm font-semibold text-white transition-colors flex items-center gap-2"
          >
            <Network size={14} /> Build Graph
          </button>
        </div>
      </div>

      {!showGraph && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-8 text-center">
          <Network size={48} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Enter an IP or domain and click <span className="font-semibold text-slate-700 dark:text-slate-300">Build Graph</span> to visualise
            the infrastructure pivot graph.
          </p>
        </div>
      )}

      {showGraph && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Controls */}
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
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors flex items-center gap-1.5 ${highlightMode ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-brand-500/30'}`}
              >
                {highlightMode ? <Eye size={12} /> : <EyeOff size={12} />}
                {highlightMode ? 'Highlight On' : 'Highlight Mode'}
              </button>
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-brand-500/30 transition-colors flex items-center gap-1.5"
              >
                <Download size={12} /> Export JSON
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {(Object.entries(TYPE_LABELS) as [EntityType, string][]).map(([type, label]) => (
              <div key={type} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono ${getNodeColor(type)}`}>
                <span className={`w-2 h-2 rounded-full ${getNodeBg(type)} border`} />
                {label}
              </div>
            ))}
          </div>

          {/* Graph Visualization */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 shadow-e1 p-6 overflow-x-auto">
            <div className="flex flex-col gap-6 min-w-[700px]">
              {/* Node grid with edges shown as lines between grouped clusters */}
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

          {/* Relationship cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RelationCard
              title="IP ↔ Domain (Reverse DNS)"
              edges={edges.filter((e) => e.label === 'reverse DNS')}
              nodeMap={nodeMap}
              getNodeColor={getNodeColor}
            />
            <RelationCard
              title="Domain ↔ IP (DNS Resolution)"
              edges={edges.filter((e) => e.label === 'DNS resolution')}
              nodeMap={nodeMap}
              getNodeColor={getNodeColor}
            />
            <RelationCard
              title="Domain ↔ Certificate (CT Logs)"
              edges={edges.filter((e) => e.label === 'CT log')}
              nodeMap={nodeMap}
              getNodeColor={getNodeColor}
            />
            <RelationCard
              title="Certificate ↔ Domains (SANs)"
              edges={edges.filter((e) => e.label === 'SAN')}
              nodeMap={nodeMap}
              getNodeColor={getNodeColor}
            />
            <RelationCard
              title="IP ↔ ASN (BGP Origin)"
              edges={edges.filter((e) => e.label === 'BGP origin')}
              nodeMap={nodeMap}
              getNodeColor={getNodeColor}
            />
            <RelationCard
              title="ASN ↔ Domain (Hosted Services)"
              edges={edges.filter((e) => e.label === 'hosts domain')}
              nodeMap={nodeMap}
              getNodeColor={getNodeColor}
            />
          </div>
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
  getNodeColor: (t: EntityType) => string;
  getIconColor: (t: EntityType) => string;
  isDimmed: (id: string) => boolean;
  edgeOpacity: (s: string, t: string) => string;
  highlightNode: string | null;
  onNodeClick: (id: string) => void;
}) {
  const typeOrder: EntityType[] = ['ip', 'domain', 'certificate', 'asn', 'actor'];
  const grouped = new Map<EntityType, GraphNode[]>();
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
              {TYPE_LABELS[type]} ({typeNodes.length})
            </h3>
            <div className="flex flex-wrap gap-3">
              {typeNodes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onNodeClick(n.id)}
                  className={`px-3 py-2 rounded-lg border text-left transition-all ${getNodeColor(n.type)} ${isDimmed(n.id) ? 'opacity-20' : 'hover:scale-105'} ${highlightNode === n.id ? 'ring-2 ring-brand-500' : ''}`}
                >
                  <div className="text-xs font-mono font-bold">{n.label}</div>
                  {n.subtitle && <div className="text-[10px] opacity-70 mt-0.5">{n.subtitle}</div>}
                </button>
              ))}
            </div>
            {/* Edges from these nodes */}
            <div className="mt-2 space-y-0.5">
              {typeNodes.flatMap((n) => (edgesBySource.get(n.id) ?? []).map((e) => {
                const target = nodeMap.get(e.target);
                if (!target) return null;
                return (
                  <div key={`${e.source}-${e.target}`} className={`flex items-center gap-2 text-[11px] font-mono transition-opacity ${getEdgeOpacity(e.source, e.target)}`}>
                    <span className="text-slate-500">{n.label}</span>
                    <span className={`text-slate-400 ${EDGE_LABEL_COLORS[e.label] ?? 'text-slate-400'}`}>── {e.label} ──</span>
                    <span className="text-slate-600 dark:text-slate-300">{target.label}</span>
                  </div>
                );
              }))}
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
  getNodeColor: (t: EntityType) => string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-4">
      <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        {title}
      </h3>
      {edges.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No relationships mapped</p>
      ) : (
        <div className="space-y-1.5">
          {edges.map((e) => {
            const source = nodeMap.get(e.source);
            const target = nodeMap.get(e.target);
            if (!source || !target) return null;
            return (
              <div key={`${e.source}-${e.target}`} className="flex items-center gap-2 text-xs font-mono">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${getNodeColor(source.type)}`}>
                  {source.label}
                </span>
                <span className="text-slate-400 text-[10px]">→</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${getNodeColor(target.type)}`}>
                  {target.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider, type Node, type Edge } from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { Network, RefreshCw, Filter } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

type NodeType = 'ip' | 'domain' | 'hash' | 'url' | 'actor' | 'malware' | 'campaign' | 'cve' | 'technique';

interface RawNode {
  id: string;
  type: NodeType | string;
  value: string;
  properties: string; // JSON-encoded
  first_seen: string;
  last_seen: string;
  confidence: number;
  sources: string; // JSON-encoded array
  source_count?: number;
}
interface RawEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  confidence: number;
}
interface KGResponse {
  nodes: RawNode[];
  edges: RawEdge[];
  stats: { nodeCount: number; edgeCount: number; sourceTypes: string[] };
  cutoff: string | null;
  types: NodeType[];
  limit: number;
}

const TYPE_COLORS: Record<string, string> = {
  ip: '#3b82f6',
  domain: '#06b6d4',
  hash: '#14b8a6',
  url: '#8b5cf6',
  actor: '#ef4444',
  malware: '#a855f7',
  campaign: '#ec4899',
  cve: '#f59e0b',
  technique: '#8b5cf6',
};

const TYPE_OPTIONS: Array<{ id: NodeType; label: string }> = [
  { id: 'ip', label: 'IP' },
  { id: 'domain', label: 'Domain' },
  { id: 'hash', label: 'Hash' },
  { id: 'url', label: 'URL' },
  { id: 'actor', label: 'Actor' },
  { id: 'malware', label: 'Malware' },
  { id: 'campaign', label: 'Campaign' },
  { id: 'cve', label: 'CVE' },
  { id: 'technique', label: 'Technique' },
];

function layoutGraph(raw: KGResponse): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of raw.nodes) g.setNode(n.id, { width: 160, height: 36 });
  for (const e of raw.edges) g.setEdge(e.source_id, e.target_id);
  dagre.layout(g);

  const nodes: Node[] = raw.nodes.map((n) => {
    const pos = g.node(n.id) ?? { x: 0, y: 0 };
    const color = TYPE_COLORS[n.type] ?? 'rgb(var(--muted, #94a3b8))';
    const label = n.value.length > 32 ? `${n.value.slice(0, 30)}…` : n.value;
    const subtitleParts: string[] = [n.type.toUpperCase()];
    if (typeof n.source_count === 'number' && n.source_count > 0) {
      subtitleParts.push(`${n.source_count} src`);
    }
    if (n.confidence && n.confidence !== 50) {
      subtitleParts.push(`c${n.confidence}`);
    }
    return {
      id: n.id,
      position: { x: pos.x - 80, y: pos.y - 18 },
      data: { label, subtitle: subtitleParts.join(' · '), nodeType: n.type },
      style: {
        background: 'rgb(var(--surface-200))',
        border: `2px solid ${color}`,
        borderRadius: 8,
        padding: 0,
        fontSize: 11,
        fontFamily: 'monospace',
        color: 'currentColor',
        minWidth: 120,
        maxWidth: 240,
      },
    };
  });
  const edges: Edge[] = raw.edges.map((e) => ({
    id: e.id,
    source: e.source_id,
    target: e.target_id,
    label: e.relationship,
    type: 'smoothstep',
    style: { stroke: 'rgb(var(--border-500, #94a3b8))', strokeWidth: 1.4 },
    labelStyle: { fontSize: 10, fontFamily: 'monospace', fill: 'rgb(var(--muted, #475569))' },
  }));
  return { nodes, edges };
}

/**
 * Cross-report Knowledge Graph Explorer. Backs /api/v1/graph/cross-report,
 * which returns the top-N most-referenced nodes across every ingested
 * source (live IOCs, briefings, feed scheduler, intel-bundle), with the
 * edges that connect them. Page lets the analyst filter by node type
 * and time window, then visualizes the result with dagre + xyflow.
 */
export default function KnowledgeGraph(): JSX.Element {
  const [types, setTypes] = useState<Set<NodeType>>(new Set());
  const [days, setDays] = useState(90);
  const [limit, setLimit] = useState(200);
  const [minConn, setMinConn] = useState(0);
  const [data, setData] = useState<KGResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (types.size > 0) params.set('types', Array.from(types).join(','));
    params.set('days', String(days));
    params.set('limit', String(limit));
    if (minConn > 0) params.set('minConn', String(minConn));
    fetch(`/api/v1/graph/cross-report?${params.toString()}`, {
      signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: KGResponse) => {
        if (!cancelled) setData(j);
      })
      .catch((e: { name?: string; message?: string }) => {
        if (cancelled || e.name === 'AbortError') return;
        setError(e.message ?? 'fetch failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [types, days, limit, minConn, refreshKey]);

  const toggleType = (t: NodeType) => {
    setTypes((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  };

  const { nodes, edges } = useMemo(() => (data ? layoutGraph(data) : { nodes: [], edges: [] }), [data]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Network className="h-6 w-6" />}
      title="Knowledge Graph Explorer"
      description="Cross-report view of every threat-intel entity the platform has ingested — IOCs, actors, malware, CVEs, techniques, campaigns. Filter by type and time window; nodes are ranked by recency and source count."
      maxWidthClass="max-w-6xl"
    >
      {/* Filter card */}
      <section className="surface-card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            types:
          </span>
          {TYPE_OPTIONS.map((t) => {
            const active = types.has(t.id);
            const c = TYPE_COLORS[t.id] ?? '#94a3b8';
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleType(t.id)}
                className={`text-micro font-mono uppercase tracking-wider rounded-full border px-2 py-0.5 transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-slate-500 dark:text-slate-400 border-slate-300 dark:border-[rgb(var(--border-400))]'
                }`}
                style={active ? { background: c, borderColor: c } : undefined}
              >
                {t.label}
              </button>
            );
          })}
          {types.size > 0 && (
            <button
              type="button"
              onClick={() => setTypes(new Set())}
              className="text-micro font-mono rounded-full border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-0.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              clear
            </button>
          )}
          <span className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <label htmlFor="kg-days">last</label>
            <select
              id="kg-days"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] px-1.5 py-0.5 text-xs font-mono"
            >
              <option value={7}>7d</option>
              <option value={30}>30d</option>
              <option value={90}>90d</option>
              <option value={365}>1y</option>
              <option value={0}>all</option>
            </select>
            <label htmlFor="kg-limit">limit</label>
            <input
              id="kg-limit"
              type="number"
              min={10}
              max={1000}
              value={limit}
              onChange={(e) => setLimit(Math.min(1000, Math.max(10, parseInt(e.target.value, 10) || 200)))}
              className="w-20 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] px-1.5 py-0.5 text-xs font-mono"
            />
            <label htmlFor="kg-minconn">min conn</label>
            <input
              id="kg-minconn"
              type="number"
              min={0}
              max={50}
              value={minConn}
              onChange={(e) => setMinConn(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-16 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] px-1.5 py-0.5 text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-0.5 text-xs hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400"
            >
              <RefreshCw className="h-3 w-3" /> refresh
            </button>
          </span>
        </div>
      </section>

      {/* Status bar */}
      {data && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1">
            {data.stats.nodeCount} nodes
          </span>
          <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1">
            {data.stats.edgeCount} edges
          </span>
          <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1">
            types: {data.stats.sourceTypes.join(', ') || '—'}
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Loading — without this the page renders only the filter bar over
          emptiness while /graph/cross-report resolves, which reads as broken. */}
      {loading && !data && !error && (
        <section
          className="surface-card flex items-center justify-center"
          style={{ height: 620 }}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin text-brand-500" aria-hidden="true" />
            <span>Building the cross-report graph…</span>
          </div>
        </section>
      )}

      {/* Graph */}
      {data &&
        (data.nodes.length > 0 ? (
          <section className="surface-card" style={{ height: 620 }}>
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                proOptions={{ hideAttribution: true }}
                minZoom={0.1}
                maxZoom={2.5}
              >
                <Background gap={16} />
                <Controls position="bottom-right" />
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(n) => TYPE_COLORS[(n.data as { nodeType?: string })?.nodeType ?? ''] ?? '#94a3b8'}
                />
              </ReactFlow>
            </ReactFlowProvider>
          </section>
        ) : (
          <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No nodes match the current filters. Try widening the time window or clearing the type filter.
          </section>
        ))}
    </DataPageLayout>
  );
}

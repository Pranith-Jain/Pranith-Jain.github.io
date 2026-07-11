import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  Search,
  Loader2,
  AlertTriangle,
  Bug,
  TrendingUp,
  Network,
  Layout,
  GitBranch,
  Crosshair,
  Expand,
} from 'lucide-react';
import {
  NODE_COLORS,
  type GraphNodeData,
  type GraphResponse,
  type LayoutMode,
  type PathFinderState,
} from './relationship-graph-shared';

const RelationshipGraphCanvas = lazy(() => import('./RelationshipGraphCanvas'));

interface TrendingCve {
  id: string;
  severity?: string;
}

const EXAMPLE_QUERIES = ['LockBit', 'APT28', 'Lazarus Group', 'CVE-2024-1709', 'CVE-2023-34362'];
const DEFAULT_AUTO_SEED = 'CVE-2024-1709';

function CanvasFallback(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center text-slate-500 font-mono text-xs gap-2">
      <Loader2 size={14} className="animate-spin" /> loading graph engine…
    </div>
  );
}

function mergeWithGraph(existing: GraphResponse, incoming: GraphResponse): GraphResponse {
  const nodeMap = new Map(existing.nodes.map((n) => [n.id, n]));
  for (const n of incoming.nodes) {
    if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
  }
  const edgeMap = new Map(existing.edges.map((e) => [e.id, e]));
  for (const e of incoming.edges) {
    if (!edgeMap.has(e.id)) edgeMap.set(e.id, e);
  }
  return {
    ...existing,
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    depth: Math.max(existing.depth, incoming.depth),
    truncated: existing.truncated || incoming.truncated,
  };
}

function findShortestPath(
  nodes: GraphNodeData[],
  edges: GraphResponse['edges'],
  from: string,
  to: string
): string[] | null {
  if (from === to) return [from];
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }
  const visited = new Set<string>([from]);
  const queue: Array<{ id: string; path: string[] }> = [{ id: from, path: [from] }];
  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    for (const neighbor of adj.get(id) ?? []) {
      if (neighbor === to) return [...path, to];
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, path: [...path, neighbor] });
      }
    }
  }
  return null;
}

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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('dagre');
  const [pathFinder, setPathFinder] = useState<PathFinderState>({ phase: 'idle' });
  const [expandedCount, setExpandedCount] = useState(0);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/v1/cve-recent', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15000)]) })
      .then((r) => r.json())
      .then((data: { cves?: TrendingCve[] }) => {
        const list = (data.cves ?? []).slice(0, 12);
        setTrendingCves(list);
        if (!autoLoaded && list.length > 0) {
          const critical = list.find((c) => c.severity === 'CRITICAL' || c.severity === 'HIGH');
          const seed = critical?.id ?? DEFAULT_AUTO_SEED;
          setQuery(seed);
          void fetchGraph(seed);
          setAutoLoaded(true);
        }
      })
      .catch(() => {
        if (!autoLoaded) {
          setQuery(DEFAULT_AUTO_SEED);
          void fetchGraph(DEFAULT_AUTO_SEED);
          setAutoLoaded(true);
        }
      })
      .finally(() => setInitialLoading(false));
    return () => ctrl.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchGraph = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      const reqId = ++reqIdRef.current;
      const ctrl = new AbortController();
      setLoading(true);
      setError(null);
      setSelectedNode(null);
      setExpandedCount(0);
      setPathFinder({ phase: 'idle' });
      try {
        const res = await fetch(`/api/v1/relationship-graph?q=${encodeURIComponent(q.trim())}&depth=${depth}`, {
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15000)]),
        });
        if (reqId !== reqIdRef.current) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as GraphResponse;
        if (reqId !== reqIdRef.current) return;
        setGraphData(data);
      } catch (e) {
        if (reqId !== reqIdRef.current) return;
        setError((e as Error).message);
        setGraphData(null);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [depth]
  );

  const expandNode = useCallback(async (node: GraphNodeData) => {
    const ctrl = new AbortController();
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/relationship-graph?q=${encodeURIComponent(node.label)}&depth=1`, {
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15000)]),
      });
      if (!res.ok) return;
      const data = (await res.json()) as GraphResponse;
      if (data.nodes.length <= 1) return;
      setGraphData((prev) => {
        if (!prev) return prev;
        return mergeWithGraph(prev, data);
      });
      setExpandedCount((c) => c + 1);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchGraph(query);
  };

  const clearGraph = () => {
    setGraphData(null);
    setSelectedNode(null);
    setError(null);
    setExpandedCount(0);
    setPathFinder({ phase: 'idle' });
  };

  const toggleLayout = () => {
    setLayoutMode((m) => (m === 'dagre' ? 'force' : 'dagre'));
  };

  const totalNodes = graphData?.nodes.length ?? 0;
  const totalEdges = graphData?.edges.length ?? 0;

  const pathResult = useMemo(() => {
    if (pathFinder.phase !== 'result' || !graphData) return null;
    return findShortestPath(graphData.nodes, graphData.edges, pathFinder.first, pathFinder.second);
  }, [pathFinder, graphData]);

  const handleNodeClick = useCallback(
    (node: GraphNodeData | null) => {
      setSelectedNode(node);

      if (pathFinder.phase === 'select-first' && node) {
        setPathFinder({ phase: 'select-second', first: node.id });
      } else if (pathFinder.phase === 'select-second' && node) {
        if (node.id !== pathFinder.first) {
          setPathFinder({
            phase: 'result',
            first: pathFinder.first,
            second: node.id,
            path: [],
          });
        }
      }
    },
    [pathFinder]
  );

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Network />}
      title="Relationship Graph"
      description="Explore connections between CVEs, threat actors, ransomware groups, MITRE techniques, and more. Search any entity to see its relationships across all intelligence sources."
      maxWidthClass="max-w-7xl"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {/* Search */}
        <form onSubmit={handleSubmit} className="flex gap-2 items-end flex-1 min-w-0">
          <div className="flex-1 min-w-[180px]">
            <label
              htmlFor="rel-graph-query"
              className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5"
            >
              Search entity
            </label>
            <input
              id="rel-graph-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="CVE ID, actor name, IP, domain, hash…"
              className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              spellCheck={false}
            />
          </div>
          <div>
            <label
              htmlFor="rel-graph-depth"
              className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5"
            >
              Depth
            </label>
            <select
              id="rel-graph-depth"
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            >
              <option value={1}>1 hop</option>
              <option value={2}>2 hops</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-mono text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Exploring…' : 'Explore'}
          </button>
          {graphData && (
            <button
              type="button"
              onClick={clearGraph}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] font-mono text-sm"
            >
              Clear
            </button>
          )}
        </form>

        {/* Graph actions */}
        {graphData && (
          <div className="flex gap-1.5 items-center">
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              type="button"
              onClick={toggleLayout}
              className={`px-2.5 py-1.5 rounded-xl font-mono text-xs inline-flex items-center gap-1.5 border transition-colors ${
                layoutMode === 'force'
                  ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                  : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-muted hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]'
              }`}
              title="Toggle between hierarchical (dagre) and force-directed layout"
            >
              <Layout size={12} />
              {layoutMode === 'force' ? 'force' : 'dagre'}
            </button>
            <button
              type="button"
              onClick={() => setPathFinder({ phase: 'select-first' })}
              className={`px-2.5 py-1.5 rounded-xl font-mono text-xs inline-flex items-center gap-1.5 border transition-colors ${
                pathFinder.phase !== 'idle'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                  : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-muted hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]'
              }`}
              title="Find shortest path between two nodes"
            >
              <GitBranch size={12} />
              path
            </button>
            {expandedCount > 0 && (
              <span className="text-mini font-mono text-slate-500 dark:text-slate-400">
                +{expandedCount} expansion{expandedCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Example queries */}
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="text-mini font-mono text-slate-500 self-center">Try:</span>
        {EXAMPLE_QUERIES.map((eq) => (
          <button
            key={eq}
            type="button"
            onClick={() => {
              setQuery(eq);
              void fetchGraph(eq);
            }}
            className="text-mini font-mono px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-700 dark:text-slate-300 hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
          >
            {eq}
          </button>
        ))}
      </div>

      {/* Status bar */}
      {pathFinder.phase === 'select-first' && (
        <div className="mb-4 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-300 text-xs font-mono inline-flex items-center gap-2">
          <Crosshair size={12} /> Click the first node in the graph
          <button type="button" onClick={() => setPathFinder({ phase: 'idle' })} className="ml-2 underline">
            cancel
          </button>
        </div>
      )}
      {pathFinder.phase === 'select-second' && (
        <div className="mb-4 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-300 text-xs font-mono inline-flex items-center gap-2">
          <Crosshair size={12} /> Click the second node to find the path
          <button type="button" onClick={() => setPathFinder({ phase: 'idle' })} className="ml-2 underline">
            cancel
          </button>
        </div>
      )}
      {pathFinder.phase === 'result' && (
        <div className="mb-4 p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-300 text-xs font-mono inline-flex items-center gap-2">
          <GitBranch size={12} />
          {pathResult
            ? `path: ${pathResult.length > 8 ? pathResult.slice(0, 8).join(' → ') + ' …' : pathResult.join(' → ')}`
            : `no path found between ${pathFinder.first} and ${pathFinder.second}`}
          <button type="button" onClick={() => setPathFinder({ phase: 'idle' })} className="ml-2 underline">
            clear
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-sm font-mono inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {graphData?.warning && (
        <div className="mb-4 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-300 text-xs font-mono inline-flex items-center gap-1.5">
          <AlertTriangle size={12} /> {graphData.warning}
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Graph canvas */}
        <div
          className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] overflow-hidden relative"
          style={{ height: '70vh', minHeight: 520 }}
        >
          {loading || initialLoading ? (
            <div className="flex h-full items-center justify-center text-slate-500 font-mono text-xs gap-2">
              <Loader2 size={14} className="animate-spin" /> building relationship graph…
            </div>
          ) : graphData && graphData.nodes.length > 0 ? (
            <Suspense fallback={<CanvasFallback />}>
              <RelationshipGraphCanvas
                graphData={graphData}
                onNodeClick={handleNodeClick}
                onExpandNode={expandNode}
                layoutMode={layoutMode}
                highlightedPath={pathResult ?? undefined}
              />
            </Suspense>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-slate-500 font-mono text-sm gap-4 p-8 text-center">
              <Network size={40} className="text-slate-300 dark:text-slate-400" />
              <div className="font-semibold text-muted">Search any entity to see its relationships</div>
              <div className="text-xs text-slate-400 max-w-md">
                Traverses CVE ↔ actor, actor ↔ ransomware, actor ↔ technique, and infrastructure links across all
                intelligence sources.
              </div>
              {trendingCves.length > 0 && (
                <div className="mt-2">
                  <div className="text-mini font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-center gap-1.5">
                    <TrendingUp size={12} /> trending CVEs
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5 max-w-lg">
                    {trendingCves.slice(0, 8).map((cve) => (
                      <button
                        key={cve.id}
                        type="button"
                        onClick={() => {
                          setQuery(cve.id);
                          void fetchGraph(cve.id);
                        }}
                        className="text-mini font-mono px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
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
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 animate-fade-in-up">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-500">Selected</div>
              </div>
              <div
                className="text-micro uppercase tracking-wider font-bold mb-1"
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
                <pre className="font-mono text-mini text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-80 bg-slate-50 dark:bg-[rgb(var(--input-200))] rounded p-2 border border-slate-200 dark:border-[rgb(var(--border-400))]">
                  {JSON.stringify(selectedNode.data, null, 2)}
                </pre>
              )}
              {/* Expand button */}
              <button
                type="button"
                onClick={() => expandNode(selectedNode)}
                disabled={loading}
                className="mt-3 w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] font-mono text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Expand size={12} />
                Expand node
              </button>
            </div>
          ) : graphData ? (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 text-center text-xs font-mono text-slate-500 space-y-2">
              <Bug size={16} className="mx-auto text-slate-400" />
              <div>Click any node to inspect.</div>
              <div className="text-micro text-slate-400">
                Double-click a node or click "Expand" in its detail panel to load its neighbors.
              </div>
            </div>
          ) : null}

          {/* Legend */}
          {graphData && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-3">Legend</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {(Object.entries(NODE_COLORS) as [GraphNodeData['type'], string][]).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2 text-mini font-mono text-muted">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {type}
                  </div>
                ))}
              </div>
            </div>
          )}

          {graphData && (
            <div className="text-micro font-mono text-slate-500 text-center space-y-0.5">
              <div>
                {totalNodes} nodes · {totalEdges} edges · depth {graphData.depth}
              </div>
              {expandedCount > 0 && (
                <div className="text-brand-600 dark:text-brand-400">
                  +{expandedCount} expansion{expandedCount > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </DataPageLayout>
  );
}

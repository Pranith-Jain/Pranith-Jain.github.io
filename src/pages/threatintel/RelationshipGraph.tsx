import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Loader2, AlertTriangle, Bug, TrendingUp, Network } from 'lucide-react';
import { NODE_COLORS, type GraphNodeData, type GraphResponse } from './relationship-graph-shared';

// The ReactFlow + dagre canvas (~250KB) loads only when a graph is rendered,
// so the page shell paints immediately. See RelationshipGraphCanvas.tsx.
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

  const fetchGraph = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      setError(null);
      setSelectedNode(null);
      try {
        const res = await fetch(`/api/v1/relationship-graph?q=${encodeURIComponent(q.trim())}&depth=${depth}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as GraphResponse;
        setGraphData(data);
      } catch (e) {
        setError((e as Error).message);
        setGraphData(null);
      } finally {
        setLoading(false);
      }
    },
    [depth]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchGraph(query);
  };

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
          Explore connections between CVEs, threat actors, ransomware groups, MITRE techniques, and more. Search any
          entity to see its relationships across all intelligence sources.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="flex gap-3 items-end mb-6 flex-wrap">
        <div className="flex-1 min-w-[240px]">
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
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
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
            onClick={() => {
              setQuery(eq);
              void fetchGraph(eq);
            }}
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
          ) : graphData && graphData.nodes.length > 0 ? (
            <Suspense fallback={<CanvasFallback />}>
              <RelationshipGraphCanvas graphData={graphData} onNodeClick={setSelectedNode} />
            </Suspense>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-slate-500 font-mono text-sm gap-4 p-8 text-center">
              <Network size={40} className="text-slate-300 dark:text-slate-600" />
              <div className="font-semibold text-slate-600 dark:text-slate-400">
                Search any entity to see its relationships
              </div>
              <div className="text-xs text-slate-400 max-w-md">
                Traverses CVE ↔ actor, actor ↔ ransomware, actor ↔ technique, and infrastructure links across all
                intelligence sources.
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
                        onClick={() => {
                          setQuery(cve.id);
                          void fetchGraph(cve.id);
                        }}
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
                {(Object.entries(NODE_COLORS) as [GraphNodeData['type'], string][]).map(([type, color]) => (
                  <div
                    key={type}
                    className="flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400"
                  >
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
            <div className="text-[10px] font-mono text-slate-500 text-center">
              {graphData.nodes.length} nodes · {graphData.edges.length} edges · depth {graphData.depth}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

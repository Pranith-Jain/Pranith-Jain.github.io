import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, RefreshCw, Info, TrendingUp, ShieldAlert } from 'lucide-react';

interface PathNode {
  id: string;
  label: string;
  type: 'domain' | 'subdomain' | 'ip' | 'port' | 'technology' | 'entry' | 'crown_jewel';
  group: string;
  score: number;
  is_entry: boolean;
  is_crown_jewel: boolean;
}

interface PathEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

interface AttackPathData {
  nodes: PathNode[];
  edges: PathEdge[];
  paths: Array<{ hops: string[]; total_score: number; hop_count: number }>;
  choke_points: Array<{ node_id: string; label: string; path_count: number; score: number }>;
  entry_points: string[];
  crown_jewels: string[];
  stats: {
    total_nodes: number;
    total_edges: number;
    total_paths: number;
    avg_path_length: number;
    worst_score: number;
  };
}

const NODE_COLORS: Record<string, string> = {
  entry: '#f43f5e',
  subdomain: '#f97316',
  ip: '#8b5cf6',
  technology: '#06b6d4',
  certificate: '#10b981',
  crown_jewel: '#10b981',
  domain: '#3b82f6',
  port: '#eab308',
};

interface ForceNode extends PathNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface ForceEdge extends PathEdge {
  sourceIdx: number;
  targetIdx: number;
}

function runForceLayout(nodes: PathNode[], edges: PathEdge[]): { nodes: ForceNode[]; edges: ForceEdge[] } {
  const fnodes: ForceNode[] = nodes.map((n, i) => ({
    ...n,
    x: 200 + (i % 5) * 120,
    y: 100 + Math.floor(i / 5) * 120,
    vx: 0,
    vy: 0,
  }));

  const labelToIdx = new Map<string, number>();
  fnodes.forEach((n, i) => labelToIdx.set(n.label, i));

  const fedges: ForceEdge[] = edges
    .map((e) => ({
      ...e,
      sourceIdx: labelToIdx.get(e.source) ?? -1,
      targetIdx: labelToIdx.get(e.target) ?? -1,
    }))
    .filter((e) => e.sourceIdx >= 0 && e.targetIdx >= 0);

  const REPULSION = 5000;
  const ATTRACTION = 0.005;
  const CENTERING = 0.02;
  const DAMPING = 0.8;
  const MIN_DIST = 30;
  const ITERATIONS = 100;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Repulsion
    for (let i = 0; i < fnodes.length; i++) {
      for (let j = i + 1; j < fnodes.length; j++) {
        const a = fnodes[i]!;
        const b = fnodes[j]!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_DIST);
        const force = REPULSION / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx += dx;
        a.vy += dy;
        b.vx -= dx;
        b.vy -= dy;
      }
    }

    // Attraction along edges
    for (const e of fedges) {
      const a = fnodes[e.sourceIdx]!;
      const b = fnodes[e.targetIdx]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_DIST);
      const force = ATTRACTION * e.weight * dist;
      a.vx += (dx / dist) * force;
      b.vx -= (dx / dist) * force;
      a.vy += (dy / dist) * force;
      b.vy -= (dy / dist) * force;
    }

    // Centering
    const cx = 400;
    const cy = 300;
    for (const n of fnodes) {
      n.vx += (cx - n.x) * CENTERING;
      n.vy += (cy - n.y) * CENTERING;
    }

    // Apply velocity
    for (const n of fnodes) {
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
    }
  }

  const minX = Math.min(...fnodes.map((n) => n.x));
  const minY = Math.min(...fnodes.map((n) => n.y));
  for (const n of fnodes) {
    n.x -= minX - 40;
    n.y -= minY - 40;
  }

  return { nodes: fnodes, edges: fedges };
}

export default function AttackPathGraph(): JSX.Element {
  const [data, setData] = useState<AttackPathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<number | null>(null);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/attack-path-graph');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as AttackPathData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const layout = useMemo(() => {
    if (!data) return null;
    const laid = runForceLayout(data.nodes, data.edges);
    // Scale to fit
    const maxX = Math.max(...laid.nodes.map((n) => n.x));
    const maxY = Math.max(...laid.nodes.map((n) => n.y));
    const scaleX = 800 / Math.max(maxX, 1);
    const scaleY = 500 / Math.max(maxY, 1);
    const scale = Math.min(scaleX, scaleY, 1);
    for (const n of laid.nodes) {
      n.x *= scale;
      n.y *= scale;
    }
    return laid;
  }, [data]);

  const pathNodeSet = useMemo(() => {
    if (data == null || selectedPath == null) return new Set<string>();
    return new Set(data.paths[selectedPath]?.hops ?? []);
  }, [data, selectedPath]);

  const selectedPathData = useMemo(() => {
    if (data == null || selectedPath == null) return null;
    return data.paths[selectedPath];
  }, [data, selectedPath]);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Shield size={28} />}
      title="Attack Path Graph"
      description="Reachability graph from internet-exposed assets to crown jewels. Shows the easiest attack paths and the choke points that sever the most routes."
      loading={loading}
      error={error}
      onRetry={fetchData}
      maxWidthClass="max-w-6xl"
    >
      {/* Stats bar */}
      {data && (
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Nodes</div>
            <div className="text-lg font-bold font-mono mt-1">{data.stats.total_nodes}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Edges</div>
            <div className="text-lg font-bold font-mono mt-1">{data.stats.total_edges}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Attack Paths</div>
            <div className="text-lg font-bold font-mono mt-1">{data.stats.total_paths}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Avg Path Length</div>
            <div className="text-lg font-bold font-mono mt-1">{data.stats.avg_path_length}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Worst Score</div>
            <div className="text-lg font-bold font-mono mt-1 text-rose-600 dark:text-rose-400">
              {data.stats.worst_score}
            </div>
          </div>
        </div>
      )}

      {/* Layout */}
      {!loading && data && layout && (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Graph canvas */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4 overflow-hidden">
            <svg
              ref={svgRef}
              viewBox={`0 0 800 500`}
              className="w-full h-[500px]"
              style={{ fontFamily: 'ui-monospace, monospace' }}
            >
              {/* Edges */}
              {layout.edges.map((e, i) => {
                const source = layout.nodes[e.sourceIdx]!;
                const target = layout.nodes[e.targetIdx]!;
                const isHighlighted = pathNodeSet.has(source.label) && pathNodeSet.has(target.label);
                const isAdjacent =
                  highlightedNode && (source.label === highlightedNode || target.label === highlightedNode);
                return (
                  <g key={`e-${i}`}>
                    <line
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke={isHighlighted ? '#f59e0b' : isAdjacent ? '#818cf8' : '#cbd5e1'}
                      strokeWidth={isHighlighted ? 3 : isAdjacent ? 2 : 1}
                      strokeOpacity={isHighlighted ? 1 : isAdjacent ? 0.8 : 0.4}
                      className="transition-all duration-300"
                    />
                    {isHighlighted && (
                      <text
                        x={(source.x + target.x) / 2}
                        y={(source.y + target.y) / 2 - 4}
                        textAnchor="middle"
                        fill="#d97706"
                        fontSize={8}
                        className="select-none"
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {layout.nodes.map((n, i) => {
                const isEntry = n.is_entry;
                const isCrownJewel = n.is_crown_jewel;
                const inPath = pathNodeSet.has(n.label);
                const isChoke = data?.choke_points.some((c) => c.node_id === n.id || c.label === n.label);
                const isHighlightedNode = highlightedNode === n.label;

                let color = NODE_COLORS[n.type] ?? '#64748b';
                if (isEntry) color = '#f43f5e';
                if (isCrownJewel) color = '#10b981';
                if (isChoke) color = '#f59e0b';

                let r = 16;
                if (isEntry) r = 20;
                if (isCrownJewel) r = 20;
                if (isChoke) r = 22;

                return (
                  <g
                    key={`n-${i}`}
                    onMouseEnter={() => setHighlightedNode(n.label)}
                    onMouseLeave={() => setHighlightedNode(null)}
                    className="cursor-pointer"
                    style={{ transition: 'all 0.3s' }}
                  >
                    {/* Glow for highlighted */}
                    {(inPath || isHighlightedNode) && (
                      <circle cx={n.x} cy={n.y} r={r + 4} fill="none" stroke={color} strokeWidth={2} opacity={0.4}>
                        <animate
                          attributeName="r"
                          values={`${r + 2};${r + 6};${r + 2}`}
                          dur="2s"
                          repeatCount="indefinite"
                        />
                        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      fill={color}
                      fillOpacity={inPath || isHighlightedNode ? 1 : 0.7}
                      stroke={inPath ? '#f59e0b' : 'none'}
                      strokeWidth={inPath ? 2 : 0}
                    />
                    {isEntry && (
                      <text x={n.x} y={n.y + 1} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">
                        E
                      </text>
                    )}
                    {isCrownJewel && (
                      <text x={n.x} y={n.y + 1} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">
                        CJ
                      </text>
                    )}
                    <text
                      x={n.x}
                      y={n.y + r + 13}
                      textAnchor="middle"
                      fill="currentColor"
                      fontSize={9}
                      className="select-none text-slate-700 dark:text-slate-300"
                    >
                      {n.label.length > 20 ? `${n.label.slice(0, 18)}..` : n.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-micro font-mono text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Entry
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Crown Jewel
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Choke Point
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block" /> IP
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Subdomain
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" /> Technology
              </span>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Attack paths list */}
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
              <h3 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <TrendingUp size={12} /> Attack Paths
              </h3>
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {data.paths.slice(0, 15).map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedPath(selectedPath === i ? null : i)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors text-micro font-mono ${
                      selectedPath === i
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-xs">Path {i + 1}</span>
                      <span
                        className={`font-mono text-xs font-bold ${p.total_score >= 70 ? 'text-rose-500' : p.total_score >= 50 ? 'text-amber-500' : 'text-slate-500'}`}
                      >
                        {p.total_score}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {p.hop_count} hops · {p.hops[0]} → {p.hops[p.hops.length - 1]}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5 truncate">{p.hops.join(' → ')}</div>
                  </button>
                ))}
                {data.paths.length > 15 && (
                  <p className="text-center text-micro text-slate-400 pt-1">+{data.paths.length - 15} more paths</p>
                )}
                {data.paths.length === 0 && (
                  <p className="text-center text-micro text-slate-400 py-4">
                    No attack paths computed. Add assets via ASM scan.
                  </p>
                )}
              </div>
            </div>

            {/* Choke points */}
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
              <h3 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <ShieldAlert size={12} /> Choke Points
              </h3>
              <div className="space-y-1.5">
                {data.choke_points.slice(0, 5).map((cp, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-micro font-mono"
                  >
                    <span className="font-medium text-amber-700 dark:text-amber-300 truncate">{cp.label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-500">{cp.path_count} paths</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{cp.score}%</span>
                    </div>
                  </div>
                ))}
                {data.choke_points.length === 0 && (
                  <p className="text-center text-micro text-slate-400 py-2">No choke points identified.</p>
                )}
              </div>
            </div>

            {/* Selected path detail */}
            {selectedPathData && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
                <h3 className="text-micro font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
                  Selected Path
                </h3>
                <div className="text-xs font-mono text-amber-700 dark:text-amber-300 space-y-1">
                  <p>
                    Score: <strong>{selectedPathData.total_score}</strong> · {selectedPathData.hop_count} hops
                  </p>
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    {selectedPathData.hops.map((hop, i) => (
                      <span key={i}>
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40">{hop}</span>
                        {i < selectedPathData.hops.length - 1 && <span className="mx-0.5 text-amber-400">→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty / refresh */}
      {!loading && !layout && (
        <div className="text-center py-12">
          <Info size={32} className="mx-auto mb-3 text-slate-400" />
          <p className="font-mono text-sm text-slate-500 mb-4">
            No asset data found. Run an ASM domain scan first, or refresh to generate a demo graph.
          </p>
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      )}
    </DataPageLayout>
  );
}

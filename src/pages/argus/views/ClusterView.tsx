import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import type { Actor, Edge } from '../types';
import { EDGES } from '../data/actors';
import { NATION_PALETTE } from '../data/countries';

interface Props {
  actors: Actor[];
  onOpen: (a: Actor) => void;
}

type LinkMode = 'all' | 'malware' | 'cve' | 'ttp';
type NodeDatum = d3.SimulationNodeDatum & { id: string; actor: Actor };
type LinkDatum = { source: string | NodeDatum; target: string | NodeDatum; weight: number; shared: Edge['shared'] };

// Edge-type accent hues — resolved from the --edge-malware / --edge-cve
// / --edge-ttp CSS vars (defined in argus.css) so the graph and the chips
// below it share the same single source of truth. Resolved once at module
// load; falls back to the chip palette for unknown kinds.
const EDGE_COLORS: Record<string, string> = (() => {
  if (typeof window === 'undefined') return { malware: '#06b6d4', cve: '#f59e0b', ttp: '#a78bfa' };
  const style = getComputedStyle(document.documentElement);
  return {
    malware: style.getPropertyValue('--edge-malware').trim() || '#06b6d4',
    cve: style.getPropertyValue('--edge-cve').trim() || '#f59e0b',
    ttp: style.getPropertyValue('--edge-ttp').trim() || '#a78bfa',
  };
})();

// Pre-compute actor lookup map for O(1) access
function buildActorMap(actors: Actor[]): Map<string, Actor> {
  const map = new Map<string, Actor>();
  actors.forEach((a) => map.set(a.id, a));
  return map;
}

export function ClusterView({ actors, onOpen }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<LinkMode>('all');
  const [hovered, setHovered] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simRef = useRef<d3.Simulation<any, any> | null>(null);

  const actorMap = useMemo(() => buildActorMap(actors), [actors]);

  const idSet = useMemo(() => new Set(actors.map((a) => a.id)), [actors]);
  const filteredEdges = useMemo(() => {
    return EDGES.filter((e) => idSet.has(e.source) && idSet.has(e.target)).filter((e) => {
      if (mode === 'all') return true;
      if (mode === 'malware') return (e.shared.malware?.length ?? 0) > 0;
      if (mode === 'cve') return (e.shared.cves?.length ?? 0) > 0;
      if (mode === 'ttp') return (e.shared.ttps?.length ?? 0) > 0;
      return true;
    });
  }, [actors, mode, idSet]);

  const edgeTypeCount = useMemo(() => {
    const counts = { malware: 0, cve: 0, ttp: 0 };
    for (const e of filteredEdges) {
      if (e.shared.malware?.length) counts.malware++;
      if (e.shared.cves?.length) counts.cve++;
      if (e.shared.ttps?.length) counts.ttp++;
    }
    return counts;
  }, [filteredEdges]);

  // Pre-compute connected edges for faster hover lookups
  const connectedMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    filteredEdges.forEach((e) => {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    });
    return map;
  }, [filteredEdges]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg) return;

    const W = wrap.clientWidth || 800;
    const H = wrap.clientHeight || 600;

    const nodes: NodeDatum[] = actors.map((a) => ({ id: a.id, actor: a }));
    const links: LinkDatum[] = filteredEdges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      shared: e.shared,
    }));

    const sel = d3.select(svg);
    sel.selectAll('*').remove();
    sel.attr('viewBox', `0 0 ${W} ${H}`);

    const defs = sel.append('defs');

    // (Removed 2026-06-20: SVG glow filter — feGaussianBlur on the
    //  cluster nodes was the AI "glow on borders" tell. Node identity
    //  is carried by the stroke colour and the hover ring instead.)

    // Arrow marker
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L10,0L0,4')
      .attr('fill', 'rgba(148,163,184,0.4)');

    const g = sel.append('g');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on('zoom', (e) => g.attr('transform', e.transform));
    sel.call(zoom);

    // Edge groups
    const edgeG = g.append('g').attr('class', 'edges');
    const link = edgeG
      .selectAll<SVGGElement, LinkDatum>('g')
      .data(links)
      .join('g')
      .attr('class', 'edge-group')
      .style('cursor', 'pointer');

    // Edge paths — use simple lines for performance, curves only on hover
    link
      .append('line')
      .attr('stroke', (d) => {
        if (mode !== 'all') return EDGE_COLORS[mode] ?? '#64748b';
        const srcActor = actorMap.get(typeof d.source === 'string' ? d.source : d.source.id);
        const tgtActor = actorMap.get(typeof d.target === 'string' ? d.target : d.target.id);
        if (srcActor && tgtActor && srcActor.country === tgtActor.country) {
          return NATION_PALETTE[srcActor.country]?.color ?? '#64748b';
        }
        return '#475569';
      })
      .attr('stroke-width', (d) => Math.max(1, Math.min(3, Math.sqrt(d.weight) * 0.6)))
      .attr('stroke-opacity', 0.3)
      .attr('marker-end', 'url(#arrow)');

    // Edge labels (hidden by default)
    link
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', '#94a3b8')
      .attr('opacity', 0)
      .attr('dy', -4);

    // Node groups
    const nodeG = g.append('g').attr('class', 'nodes');
    const node = nodeG
      .selectAll<SVGGElement, NodeDatum>('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .on('mouseenter', (_, d) => handleHover(d.id))
      .on('mouseleave', () => handleHover(null))
      .on('click', (_, d) => onOpen(d.actor));

    // Outer glow ring
    node
      .append('circle')
      .attr('r', (d) => 16 + Math.min(10, d.actor.ttps.length * 0.5))
      .attr('fill', (d) => NATION_PALETTE[d.actor.country]?.color ?? '#64748b')
      .attr('fill-opacity', 0.08)
      .attr('stroke', 'none');

    // Main node circle
    node
      .append('circle')
      .attr('r', (d) => 12 + Math.min(7, d.actor.ttps.length * 0.4))
      .attr('fill', (d) => NATION_PALETTE[d.actor.country]?.color ?? '#64748b')
      .attr('fill-opacity', 0.2)
      .attr('stroke', (d) => NATION_PALETTE[d.actor.country]?.color ?? '#64748b')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6);

    // Inner dot
    node
      .append('circle')
      .attr('r', (d) => 3 + Math.min(3, d.actor.malware.length * 0.5))
      .attr('fill', (d) => NATION_PALETTE[d.actor.country]?.color ?? '#64748b')
      .attr('fill-opacity', 0.9);

    // Name label
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => -(18 + Math.min(7, d.actor.ttps.length * 0.4)))
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('font-family', 'Inter, sans-serif')
      .attr('fill', '#e2e8f0')
      .text((d) => d.actor.name);

    // APT label
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => -(8 + Math.min(7, d.actor.ttps.length * 0.4)) + 12)
      .attr('font-size', 8)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', (d) => NATION_PALETTE[d.actor.country]?.color ?? '#64748b')
      .attr('opacity', 0.7)
      .text((d) => d.actor.apt ?? d.actor.country);

    // Motivation badge
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => 12 + Math.min(7, d.actor.ttps.length * 0.4) + 14)
      .attr('font-size', 7)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', '#94a3b8')
      .text((d) => d.actor.motivation.toUpperCase());

    // Simulation — tuned for performance
    const sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink<NodeDatum, LinkDatum>(links)
          .id((d) => d.id)
          .distance((d) => Math.max(90, 140 - Math.min(50, d.weight * 3)))
          .strength((d) => 0.3 + Math.min(0.3, d.weight * 0.04))
      )
      .force('charge', d3.forceManyBody().strength(-350).distanceMax(300))
      .force('center', d3.forceCenter(W / 2, H / 2).strength(0.05))
      .force(
        'collide',
        d3
          .forceCollide<NodeDatum>()
          .radius((d) => 28 + Math.min(10, d.actor.ttps.length * 0.5))
          .strength(0.7)
      )
      .force('x', d3.forceX(W / 2).strength(0.02))
      .force('y', d3.forceY(H / 2).strength(0.02))
      .alphaDecay(0.025)
      .on('tick', () => {
        // Batch DOM updates
        link
          .select<SVGLineElement>('line')
          .attr('x1', (d) => (d.source as NodeDatum).x ?? 0)
          .attr('y1', (d) => (d.source as NodeDatum).y ?? 0)
          .attr('x2', (d) => (d.target as NodeDatum).x ?? 0)
          .attr('y2', (d) => (d.target as NodeDatum).y ?? 0);

        link
          .select<SVGTextElement>('text')
          .attr('x', (d) => {
            const sx = (d.source as NodeDatum).x ?? 0;
            const tx = (d.target as NodeDatum).x ?? 0;
            return (sx + tx) / 2;
          })
          .attr('y', (d) => {
            const sy = (d.source as NodeDatum).y ?? 0;
            const ty = (d.target as NodeDatum).y ?? 0;
            return (sy + ty) / 2;
          });

        node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    simRef.current = sim;

    // Drag — uses requestAnimationFrame for smooth updates
    const drag = d3
      .drag<SVGGElement, NodeDatum>()
      .on('start', (e, d) => {
        if (!e.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (e, d) => {
        d.fx = e.x;
        d.fy = e.y;
      })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(drag as never);

    return () => {
      sim.stop();
    };
  }, [actors, filteredEdges, mode, onOpen, actorMap]);

  // Optimized hover handler with RAF
  const handleHover = useCallback(
    (nodeId: string | null) => {
      setHovered(nodeId);
      const sel = d3.select(svgRef.current!);
      if (!nodeId) {
        // Reset all
        sel
          .selectAll('.edge-group line')
          .attr('stroke-opacity', 0.3)
          .attr('stroke-width', (d: unknown) => {
            const link = d as LinkDatum;
            return Math.max(1, Math.min(3, Math.sqrt(link.weight) * 0.6));
          });
        sel.selectAll('.edge-group text').attr('opacity', 0);
        sel.selectAll('.nodes g').attr('opacity', 1);
        return;
      }

      const connectedIds = connectedMap.get(nodeId) ?? new Set<string>();
      connectedIds.add(nodeId);

      // Dim unconnected nodes
      sel.selectAll('.nodes g').attr('opacity', (d: unknown) => {
        const node = d as NodeDatum;
        return connectedIds.has(node.id) ? 1 : 0.12;
      });

      // Highlight connected edges
      sel
        .selectAll('.edge-group line')
        .attr('stroke-opacity', (d: unknown) => {
          const link = d as LinkDatum;
          const src = typeof link.source === 'string' ? link.source : link.source.id;
          const tgt = typeof link.target === 'string' ? link.target : link.target.id;
          return src === nodeId || tgt === nodeId ? 0.9 : 0.05;
        })
        .attr('stroke-width', (d: unknown) => {
          const link = d as LinkDatum;
          const src = typeof link.source === 'string' ? link.source : link.source.id;
          const tgt = typeof link.target === 'string' ? link.target : link.target.id;
          return src === nodeId || tgt === nodeId ? Math.max(2, Math.sqrt(link.weight) * 1.2) : 0.3;
        });

      // Show labels on connected edges
      sel
        .selectAll('.edge-group text')
        .attr('opacity', (d: unknown) => {
          const link = d as LinkDatum;
          const src = typeof link.source === 'string' ? link.source : link.source.id;
          const tgt = typeof link.target === 'string' ? link.target : link.target.id;
          return src === nodeId || tgt === nodeId ? 1 : 0;
        })
        .text((d: unknown) => {
          const link = d as LinkDatum;
          const parts: string[] = [];
          if (link.shared.malware?.length) parts.push(`${link.shared.malware.length}m`);
          if (link.shared.cves?.length) parts.push(`${link.shared.cves.length}c`);
          if (link.shared.ttps?.length) parts.push(`${link.shared.ttps.length}t`);
          return parts.join(' · ');
        });
    },
    [connectedMap]
  );

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {};
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Toolbar */}
      <div className="chrome-glass border-b flex items-center gap-3 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-eyebrow font-mono text-slate-500 dark:text-slate-400 mr-1">Link by</span>
          {(['all', 'malware', 'cve', 'ttp'] as LinkMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-3 py-1.5 rounded-lg text-tool font-medium border transition-all duration-200"
              style={
                mode === m
                  ? {
                      borderColor: `${EDGE_COLORS[m] ?? '#5b8def'}55`,
                      color: EDGE_COLORS[m] ?? '#5b8def',
                      background: `${EDGE_COLORS[m] ?? '#5b8def'}12`,
                    }
                  : { borderColor: 'rgb(var(--border-400))', color: 'rgb(var(--muted))', background: 'transparent' }
              }
            >
              {m === 'ttp' ? 'TTP' : m.toUpperCase()}
              {mode === 'all' && (
                <span className="ml-1.5 text-micro font-mono opacity-60">
                  {m === 'malware'
                    ? edgeTypeCount.malware
                    : m === 'cve'
                      ? edgeTypeCount.cve
                      : m === 'ttp'
                        ? edgeTypeCount.ttp
                        : filteredEdges.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="ml-4 flex items-center gap-3 text-micro font-mono text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500/70" /> RU
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500/70" /> CN
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500/70" /> KP
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500/70" /> IR
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-500/70" /> IN/PK
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-500/70" /> VN
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3 text-micro font-mono text-slate-500 dark:text-slate-400">
          <span>{filteredEdges.length} edges</span>
          <span>{actors.length} nodes</span>
          <span>drag · zoom · click</span>
        </div>
      </div>

      {/* Graph */}
      <div ref={wrapRef} className="flex-1 relative bg-dot-grid">
        <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ color: 'var(--muted)' }} />

        {/* Hover card */}
        {hovered && <HoverCard actorId={hovered} actors={actors} edges={filteredEdges} />}

        {/* Stats overlay */}
        <div className="absolute bottom-4 left-4 flex gap-2 pointer-events-none">
          <div className="surface-card px-3 py-1.5">
            <div className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">{filteredEdges.length}</div>
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              connections
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HoverCard({ actorId, actors, edges }: { actorId: string; actors: Actor[]; edges: Edge[] }) {
  const a = actors.find((x) => x.id === actorId);
  if (!a) return null;

  const connected = edges.filter((e) => e.source === actorId || e.target === actorId);
  const nation = NATION_PALETTE[a.country];

  const sharedMalware = new Set<string>();
  const sharedCves = new Set<string>();
  const sharedTtps = new Set<string>();
  for (const e of connected) {
    e.shared.malware?.forEach((m) => sharedMalware.add(m));
    e.shared.cves?.forEach((c) => sharedCves.add(c));
    e.shared.ttps?.forEach((t) => sharedTtps.add(t));
  }

  return (
    <div className="absolute top-3 right-3 w-80 surface-raised p-4 pointer-events-none animate-pop-in">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ background: nation?.color, boxShadow: `0 0 8px ${nation?.color}44` }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-slate-900 dark:text-slate-100">{a.name}</div>
          <div className="text-micro font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {a.apt} · {nation?.name}
          </div>
        </div>
        <span className="chip capitalize">{a.motivation}</span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatBox label="TTPs" value={a.ttps.length} color="#a78bfa" />
        <StatBox label="Malware" value={a.malware.length} color="#06b6d4" />
        <StatBox label="CVEs" value={a.cves.length} color="#f59e0b" />
        <StatBox label="Links" value={connected.length} color="#64748b" />
      </div>

      {connected.length > 0 && (
        <div>
          <div className="text-eyebrow font-mono text-slate-500 dark:text-slate-400 mb-1.5">
            Connections ({connected.length})
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
            {connected.slice(0, 6).map((e, i) => {
              const otherId = e.source === actorId ? e.target : e.source;
              const other = actors.find((x) => x.id === otherId);
              if (!other) return null;
              const otherNation = NATION_PALETTE[other.country];
              return (
                <div key={i} className="flex items-center gap-2 text-mini">
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: otherNation?.color }} />
                  <span className="text-slate-900 dark:text-slate-100 truncate flex-1">{other.name}</span>
                  {e.shared.malware?.length ? <span className="chip chip-cyan">{e.shared.malware.length}m</span> : null}
                  {e.shared.cves?.length ? <span className="chip chip-gold">{e.shared.cves.length}c</span> : null}
                  {e.shared.ttps?.length ? <span className="chip chip-violet">{e.shared.ttps.length}t</span> : null}
                </div>
              );
            })}
            {connected.length > 6 && (
              <div className="text-micro text-slate-500 dark:text-slate-400 text-center py-0.5">
                +{connected.length - 6} more
              </div>
            )}
          </div>
        </div>
      )}

      {(sharedMalware.size > 0 || sharedCves.size > 0 || sharedTtps.size > 0) && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          <div className="text-eyebrow font-mono text-slate-500 dark:text-slate-400 mb-1">Shared tradecraft</div>
          <div className="flex flex-wrap gap-1">
            {[...sharedMalware].slice(0, 4).map((m) => (
              <span
                key={`m-${m}`}
                className="text-micro font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20"
              >
                {m}
              </span>
            ))}
            {[...sharedCves].slice(0, 3).map((c) => (
              <span
                key={`c-${c}`}
                className="text-micro font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
              >
                {c}
              </span>
            ))}
            {sharedTtps.size > 0 && (
              <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                {sharedTtps.size} shared TTPs
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-1.5 rounded-lg" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="font-mono text-base font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-micro font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}

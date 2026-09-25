/**
 * FlowViz canvas — lazy-loaded ReactFlow render.
 *
 * Split out of pages/threatintel/FlowViz.tsx so the route chunk doesn't
 * pull @xyflow/react (~133KB) until the user actually renders a graph.
 * Same pattern as pages/dfir/StixGraph.tsx and
 * pages/threatintel/RelationshipGraphCanvas.tsx (see the lazy-vendor
 * allowlist in eslint.config.js).
 */
import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

const NODE_COLORS: Record<string, string> = {
  action: '#8b5cf6',
  tool: '#3b82f6',
  malware: '#a855f7',
  asset: '#06b6d4',
  infrastructure: '#ec4899',
  url: '#14b8a6',
  vulnerability: '#f59e0b',
  AND_operator: '#64748b',
  OR_operator: '#64748b',
};

function layouted(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) {
    const t = String((n.data as { type?: string } | undefined)?.type ?? n.type ?? '');
    const isOp = t === 'AND_operator' || t === 'OR_operator';
    g.setNode(n.id, { width: isOp ? 90 : 270, height: isOp ? 44 : 120 });
  }
  for (const e of edges) {
    if (nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const p = g.node(n.id) ?? { x: 0, y: 0 };
      const d = ((n.data ?? {}) as Record<string, unknown>);
      const t = String(d.type ?? n.type ?? 'action');
      const color = NODE_COLORS[t] ?? '#94a3b8';
      return {
        ...n,
        position: { x: p.x - 135, y: p.y - 60 },
        data: { ...d, label: String(d.name ?? n.id) },
        style: {
          background: 'rgb(var(--surface-200))',
          border: `2px solid ${color}`,
          borderRadius: 10,
          padding: 8,
          fontSize: 11,
          width: 250,
          color: 'currentColor',
        },
      };
    }),
    edges: edges.map((e) => ({ ...e, label: e.label ?? '', animated: false })),
  };
}

export default function FlowVizCanvas({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (_e: unknown, n: Node) => void;
}): JSX.Element {
  const laid = useMemo(() => layouted(nodes, edges), [nodes, edges]);
  return (
    <ReactFlow nodes={laid.nodes} edges={laid.edges} onNodeClick={onNodeClick} fitView proOptions={{ hideAttribution: true }}>
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}

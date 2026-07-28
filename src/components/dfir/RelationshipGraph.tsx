import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export interface RelationshipGraphData {
  nodes: Array<{ id: string; label: string; type: string; severity?: string }>;
  edges: Array<{ source: string; target: string; relationship: string; confidence: 'high' | 'medium' | 'low' }>;
}

const TYPE_COLORS: Record<string, string> = {
  ioc: '#6366f1',
  actor: '#e11d48',
  cve: '#d97706',
  technique: '#0891b2',
  malware: '#7c3aed',
  campaign: '#059669',
};

const EDGE_COLORS: Record<string, string> = {
  high: '#16a34a',
  medium: '#ca8a04',
  low: '#94a3b8',
};

function layout(nodes: RelationshipGraphData['nodes']): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const n = nodes.length;
  if (n === 0) return positions;
  if (n === 1) {
    positions[nodes[0]!.id] = { x: 0, y: 0 };
    return positions;
  }
  const radius = Math.max(220, n * 45);
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    positions[node.id] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  return positions;
}

export function RelationshipGraph({ graph }: { graph: RelationshipGraphData }): JSX.Element | null {
  const nodes = useMemo<Node[]>(() => {
    const positions = layout(graph.nodes);
    return graph.nodes.map((n) => ({
      id: n.id,
      position: positions[n.id] ?? { x: 0, y: 0 },
      data: { label: n.label },
      style: {
        background: TYPE_COLORS[n.type] ?? '#475569',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '6px 10px',
        fontSize: '12px',
        maxWidth: '180px',
      },
    }));
  }, [graph.nodes]);

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e, i) => ({
        id: `e-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: e.relationship,
        animated: e.confidence === 'high',
        style: { stroke: EDGE_COLORS[e.confidence] ?? '#94a3b8' },
        labelStyle: { fontSize: 10, fill: '#64748b' },
      })),
    [graph.edges]
  );

  if (graph.nodes.length === 0) return null;

  return (
    <div className="h-[460px] rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

export default RelationshipGraph;

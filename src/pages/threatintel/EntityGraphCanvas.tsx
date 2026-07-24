import { useMemo } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- lazy-loaded by EntityGraphPage
import {
  ReactFlow,
  ReactFlowProvider,
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

type EntityType = 'cve' | 'actor' | 'ioc' | 'sector' | 'technique';

interface EntityNode {
  id: string;
  type: EntityType;
  label: string;
  subtitle?: string;
  weight?: number;
}

interface EntityEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface GraphData {
  nodes: EntityNode[];
  edges: EntityEdge[];
}

const NODE_COLORS: Record<EntityType, string> = {
  cve: '#f59e0b',
  actor: '#ef4444',
  ioc: '#3b82f6',
  sector: '#10b981',
  technique: '#8b5cf6',
};

const NODE_ICONS: Record<EntityType, string> = {
  cve: '🛡',
  actor: '👤',
  ioc: '🔗',
  sector: '🏢',
  technique: '⚔',
};

function EntityNodeBox({
  data,
  selected,
}: {
  data: { label: string; subtitle?: string; nodeType: EntityType };
  selected?: boolean;
}): JSX.Element {
  const color = NODE_COLORS[data.nodeType] ?? '#94a3b8';
  return (
    <div
      className={`rounded-xl border-2 px-3 py-2 text-xs font-mono shadow-e1 bg-white dark:bg-[rgb(var(--surface-200))] ${
        selected ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950' : ''
      }`}
      style={{ borderColor: color, minWidth: 120, maxWidth: 180 }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px]">{NODE_ICONS[data.nodeType]}</span>
        <span className="text-micro uppercase tracking-wider font-bold" style={{ color }}>
          {data.nodeType}
        </span>
      </div>
      <div className="text-slate-900 dark:text-slate-100 break-words leading-tight text-[11px]">{data.label}</div>
      {data.subtitle && (
        <div className="text-micro text-slate-500 dark:text-slate-400 mt-0.5 truncate">{data.subtitle}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { entityNode: EntityNodeBox };

function layoutGraph(data: GraphData): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 20, marginy: 20 });

  for (const node of data.nodes) {
    g.setNode(node.id, { width: 160, height: 60 });
  }
  for (const edge of data.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: Node[] = data.nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: 'entityNode',
      position: { x: (pos.x ?? 0) - 80, y: (pos.y ?? 0) - 30 },
      data: { label: n.label, subtitle: n.subtitle, nodeType: n.type },
    };
  });

  const edges: Edge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
    labelStyle: { fontSize: 9, fontFamily: 'monospace', fill: '#94a3b8' },
  }));

  return { nodes, edges };
}

function CanvasInner({ graphData }: { graphData: GraphData }) {
  const { nodes, edges } = useMemo(() => layoutGraph(graphData), [graphData]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{ type: 'smoothstep' }}
    >
      <Background color="#e2e8f0" gap={20} />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={(n) => NODE_COLORS[(n.data as { nodeType: EntityType }).nodeType] ?? '#94a3b8'}
        maskColor="rgba(255,255,255,0.7)"
        style={{ width: 120, height: 80 }}
      />
    </ReactFlow>
  );
}

export default function EntityGraphCanvas({ graphData }: { graphData: GraphData }): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasInner graphData={graphData} />
    </ReactFlowProvider>
  );
}

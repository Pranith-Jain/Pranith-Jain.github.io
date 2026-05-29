import { useMemo } from 'react';
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
import { NODE_COLORS, type GraphNodeType, type GraphNodeData, type GraphResponse } from './relationship-graph-shared';

/**
 * The ReactFlow + dagre graph canvas. Split into its own module and loaded via
 * React.lazy from RelationshipGraph so the ~250KB graph engine (and the dagre
 * layout) only download when a graph is actually rendered — the page shell
 * (search box, examples, detail panel) paints without waiting for it.
 */

function RelNodeBox({
  data,
  selected,
}: {
  data: { label: string; subtitle?: string; nodeType: GraphNodeType };
  selected?: boolean;
}): JSX.Element {
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

export default function RelationshipGraphCanvas({
  graphData,
  onNodeClick,
}: {
  graphData: GraphResponse;
  onNodeClick: (node: GraphNodeData | null) => void;
}): JSX.Element {
  const flowNodes = useMemo(() => {
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

  const flowEdges = useMemo(
    () =>
      graphData.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: 'smoothstep',
        style: { stroke: '#475569', strokeWidth: 1.5 },
        labelStyle: { fontSize: 9, fontFamily: 'ui-monospace, monospace', fill: '#94a3b8' },
        labelBgStyle: { fill: 'transparent' },
      })),
    [graphData]
  );

  return (
    <ReactFlow
      nodes={flowNodes as unknown as Node[]}
      edges={flowEdges as unknown as Edge[]}
      nodeTypes={NODE_TYPES}
      onNodeClick={
        ((_e: unknown, node: { data?: { raw?: GraphNodeData } }) => onNodeClick(node.data?.raw ?? null)) as unknown as (
          e: unknown,
          node: Node
        ) => void
      }
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
        nodeColor={(n) => NODE_COLORS[(n.data as { nodeType?: GraphNodeType })?.nodeType ?? 'reference'] ?? '#94a3b8'}
        style={{ height: 80 }}
      />
    </ReactFlow>
  );
}

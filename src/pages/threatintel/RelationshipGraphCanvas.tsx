import { useMemo, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import {
  NODE_COLORS,
  type GraphNodeType,
  type GraphNodeData,
  type GraphResponse,
  type LayoutMode,
} from './relationship-graph-shared';
import { ForceSimulation, type SimNode, type SimLink } from './force-layout';

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
      <div className="text-micro uppercase tracking-wider font-bold mb-0.5" style={{ color }}>
        {data.nodeType}
      </div>
      <div className="text-slate-900 dark:text-slate-100 break-words leading-tight">{data.label}</div>
      {data.subtitle && (
        <div className="text-micro text-slate-500 dark:text-slate-400 mt-0.5 truncate">{data.subtitle}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { relNode: RelNodeBox };

export default function RelationshipGraphCanvas({
  graphData,
  onNodeClick,
  onExpandNode,
  layoutMode = 'dagre',
  highlightedPath,
}: {
  graphData: GraphResponse;
  onNodeClick: (node: GraphNodeData | null) => void;
  onExpandNode?: (node: GraphNodeData) => void;
  layoutMode?: LayoutMode;
  highlightedPath?: string[];
}): JSX.Element {
  const reactFlowInstance = useReactFlow();
  const simRef = useRef<ForceSimulation | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const prevNodeCount = useRef(graphData.nodes.length);

  const dagreLayout = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 120, marginx: 40, marginy: 40 });

    const nodeWidth = 160;
    const nodeHeight = 50;
    for (const n of graphData.nodes) {
      g.setNode(n.id, { width: nodeWidth, height: nodeHeight });
    }
    for (const e of graphData.edges) {
      g.setEdge(e.source, e.target);
    }
    dagre.layout(g);

    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of graphData.nodes) {
      const pos = g.node(n.id);
      if (pos) {
        positions[n.id] = { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 };
      }
    }
    return positions;
  }, [graphData]);

  const pathSet = useMemo(() => (highlightedPath ? new Set(highlightedPath) : null), [highlightedPath]);

  const flowNodes: Node[] = useMemo(
    () =>
      graphData.nodes.map((n) => {
        const pos = dagreLayout[n.id] ?? { x: 0, y: 0 };
        const inPath = pathSet?.has(n.id);
        return {
          id: n.id,
          type: 'relNode',
          position: pos,
          draggable: layoutMode === 'force',
          data: {
            label: n.label,
            subtitle: n.subtitle,
            nodeType: n.type,
            raw: n,
            inPath,
          },
        };
      }),
    [graphData, dagreLayout, layoutMode, pathSet]
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      graphData.edges.map((e) => {
        const inPath = highlightedPath && highlightedPath.includes(e.source) && highlightedPath.includes(e.target);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          type: 'smoothstep',
          style: {
            stroke: inPath ? '#f59e0b' : '#475569',
            strokeWidth: inPath ? 3 : 1.5,
          },
          labelStyle: {
            fontSize: 9,
            fontFamily: 'ui-monospace, monospace',
            fill: inPath ? '#f59e0b' : '#94a3b8',
          },
          labelBgStyle: { fill: 'transparent' },
          animated: !!inPath,
        };
      }),
    [graphData, highlightedPath]
  );

  useEffect(() => {
    if (layoutMode === 'force') {
      const currentPos = new Map(reactFlowInstance.getNodes().map((n) => [n.id, n.position]));
      const simNodes: SimNode[] = graphData.nodes.map((n) => {
        const pos = currentPos.get(n.id) ?? dagreLayout[n.id] ?? { x: 0, y: 0 };
        return { id: n.id, x: pos.x, y: pos.y, vx: 0, vy: 0 };
      });
      const simLinks: SimLink[] = graphData.edges.map((e) => ({
        source: e.source,
        target: e.target,
      }));

      const sim = new ForceSimulation(simNodes, simLinks);
      sim.on('tick', () => {
        const nodeMap = new Map(sim.nodes.map((sn) => [sn.id, sn]));
        reactFlowInstance.setNodes((nds) =>
          nds.map((n) => {
            const s = nodeMap.get(n.id);
            if (s) return { ...n, position: { x: s.x, y: s.y } };
            return n;
          })
        );
      });
      sim.on('end', () => setSimRunning(false));
      sim.start();
      simRef.current = sim;
      setSimRunning(true);

      return () => {
        sim.stop();
        simRef.current = null;
        setSimRunning(false);
      };
    } else {
      simRef.current?.stop();
      simRef.current = null;
      setSimRunning(false);
    }
  }, [layoutMode, graphData.nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps — reactFlowInstance/setSimRunning/simRef are stable; graphData is covered via .nodes.length

  prevNodeCount.current = graphData.nodes.length;

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={NODE_TYPES}
      onNodeClick={
        ((_e: unknown, node: Node) => onNodeClick((node.data as { raw?: GraphNodeData })?.raw ?? null)) as unknown as (
          e: unknown,
          node: Node
        ) => void
      }
      onNodeDoubleClick={
        onExpandNode
          ? (_e: unknown, node: Node) => {
              const raw = (node.data as { raw?: GraphNodeData })?.raw;
              if (raw) onExpandNode(raw);
            }
          : undefined
      }
      fitView
      minZoom={0.2}
      maxZoom={2}
      nodesDraggable={layoutMode === 'force'}
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
      {simRunning && (
        <div className="absolute top-2 left-2 text-micro font-mono text-slate-500 bg-white/80 dark:bg-slate-950/80 px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
          force layout · settling…
        </div>
      )}
    </ReactFlow>
  );
}

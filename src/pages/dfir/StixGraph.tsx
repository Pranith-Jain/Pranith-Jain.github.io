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
import '@xyflow/react/dist/style.css';
import { STIX_TYPE_COLOR, type StixObjectType } from '../../lib/dfir/stix-graph';

/**
 * Lazy-loaded ReactFlow render for the STIX bundle graph.
 *
 * The @xyflow/react library is ~133KB and is only useful once a user has
 * pasted a bundle. The parent (StixViewer.tsx) renders this lazily via
 * React.lazy + Suspense so that the initial route chunk only includes the
 * paste-bundle UI and stats panel.
 */

function StixNodeBox({
  data,
  selected,
}: {
  data: { label: string; stixType: StixObjectType };
  selected?: boolean;
}): JSX.Element {
  const color = STIX_TYPE_COLOR[data.stixType] ?? '#94a3b8';
  return (
    <div
      className={`rounded-lg border-2 px-3 py-2 text-xs font-mono shadow-sm bg-white dark:bg-slate-900 ${
        selected ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950' : ''
      }`}
      style={{ borderColor: color, minWidth: 140, maxWidth: 200 }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div className="text-[10px] uppercase tracking-wider font-bold mb-0.5" style={{ color }}>
        {data.stixType}
      </div>
      <div className="text-slate-900 dark:text-slate-100 break-words leading-tight">{data.label}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { stixNode: StixNodeBox };

interface StixGraphProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (e: unknown, node: Node) => void;
}

export default function StixGraph({ nodes, edges, onNodeClick }: StixGraphProps): JSX.Element {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeClick={onNodeClick}
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
        nodeColor={(n) =>
          STIX_TYPE_COLOR[(n.data as { stixType?: StixObjectType })?.stixType ?? 'unknown'] ?? '#94a3b8'
        }
        style={{ height: 80 }}
      />
    </ReactFlow>
  );
}

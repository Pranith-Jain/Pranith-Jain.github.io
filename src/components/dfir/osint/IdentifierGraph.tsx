// src/components/dfir/osint/IdentifierGraph.tsx
import { useMemo } from 'react';
import { ReactFlow, Background, Controls, type Node, type Edge, type NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IdentifierNode } from './IdentifierNode';
import type { Identifier, Link, Pin } from '../../../lib/dfir/osint/osint-schema';
import { getIdentifierType } from '../../../lib/dfir/osint/identifier-types';

const nodeTypes: NodeTypes = { identifier: IdentifierNode };

function primaryValue(id: Identifier): string {
  const def = getIdentifierType(id.type);
  const first = def.fields[0]?.key;
  return (first && id.fields[first]) || id.fields['handle'] || id.fields['fullName'] || '';
}

export interface IdentifierGraphProps {
  identifiers: Identifier[];
  pins: Pin[];
  links: Link[];
  selectedId: string | null;
  customIcons: Record<string, string>; // customIconId -> dataUrl
  positions?: Record<string, { x: number; y: number }>;
  onSelect: (identifierId: string | null) => void;
  onDelete: (identifierId: string) => void;
  onEdit: (identifierId: string) => void;
  onMove: (identifierId: string, pos: { x: number; y: number }) => void;
}

export function IdentifierGraph({
  identifiers,
  pins,
  links,
  selectedId,
  customIcons,
  positions,
  onSelect,
  onDelete,
  onEdit,
  onMove,
}: IdentifierGraphProps): JSX.Element {
  const nodes = useMemo<Node[]>(
    () =>
      identifiers.map((id, i) => ({
        id: id.id,
        type: 'identifier',
        // Saved drag position wins; otherwise fall back to the index grid.
        position: positions?.[id.id] ?? { x: (i % 4) * 220, y: Math.floor(i / 4) * 140 },
        data: {
          type: id.type,
          primary: primaryValue(id),
          selected: id.id === selectedId,
          customIconUrl: id.customIconId ? customIcons[id.customIconId] : undefined,
          onDelete: () => onDelete(id.id),
          onEdit: () => onEdit(id.id),
        },
      })),
    [identifiers, selectedId, customIcons, positions, onDelete, onEdit]
  );

  // Edges connect identifiers that share a pin (co-location), labelled with the pin name.
  const edges = useMemo<Edge[]>(() => {
    const byPin = new Map<string, string[]>();
    for (const l of links) {
      const arr = byPin.get(l.pinId) ?? [];
      arr.push(l.identifierId);
      byPin.set(l.pinId, arr);
    }
    const out: Edge[] = [];
    for (const [pinId, ids] of byPin) {
      const label = pins.find((p) => p.id === pinId)?.label ?? '';
      for (let i = 1; i < ids.length; i++) {
        out.push({ id: `${pinId}-${i}`, source: ids[0], target: ids[i], label, animated: false });
      }
    }
    return out;
  }, [links, pins]);

  return (
    <div className="h-[600px] rounded-xl border border-slate-200 dark:border-slate-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_, n) => onSelect(n.id)}
        onNodeDragStop={(_, n) => onMove(n.id, n.position)}
        onPaneClick={() => onSelect(null)}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

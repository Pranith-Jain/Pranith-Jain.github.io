// src/components/dfir/osint/IdentifierNode.tsx
import { Handle, Position } from '@xyflow/react';
import { getIdentifierType } from '../../../lib/dfir/osint/identifier-types';

export interface IdentifierNodeData {
  type: string;
  primary: string; // primary field value to show as title
  selected?: boolean;
  customIconUrl?: string;
}

export function IdentifierNode({ data }: { data: IdentifierNodeData }): JSX.Element {
  const def = getIdentifierType(data.type);
  const Icon = def.icon;
  return (
    <div
      className={`rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 shadow-sm min-w-[140px] ${
        data.selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-300 dark:border-slate-700'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center gap-2">
        {data.customIconUrl ? (
          <img src={data.customIconUrl} alt="" className="w-4 h-4 rounded object-cover" />
        ) : (
          <Icon size={16} className="text-brand-600 dark:text-brand-400" />
        )}
        <div className="text-xs font-mono text-slate-500">{def.label}</div>
      </div>
      <div className="mt-1 text-sm font-medium truncate max-w-[180px]">{data.primary || '—'}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}

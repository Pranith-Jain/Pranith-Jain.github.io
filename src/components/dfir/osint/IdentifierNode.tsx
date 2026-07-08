// src/components/dfir/osint/IdentifierNode.tsx
import { Handle, Position } from '@xyflow/react';
import { X, Pencil } from 'lucide-react';
import { getIdentifierType } from '../../../lib/dfir/osint/identifier-types';

export interface IdentifierNodeData {
  type: string;
  primary: string; // primary field value to show as title
  selected?: boolean;
  customIconUrl?: string;
  onDelete?: () => void;
  onEdit?: () => void;
}

export function IdentifierNode({ data }: { data: IdentifierNodeData }): JSX.Element {
  const def = getIdentifierType(data.type);
  const Icon = def.icon;
  return (
    <div
      className={`relative rounded-xl border px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 min-w-[140px] ${
        data.selected
          ? 'border-brand-500 ring-2 ring-brand-500/30'
          : 'border-slate-300 dark:border-[rgb(var(--border-400))]'
      }`}
    >
      {data.selected && data.onEdit && (
        <button
          type="button"
          aria-label="Edit identifier"
          title="Edit identifier"
          className="absolute -top-2 -right-7 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-brand-600 text-white shadow hover:bg-brand-700"
          onClick={(e) => {
            e.stopPropagation();
            data.onEdit?.();
          }}
        >
          <Pencil size={11} />
        </button>
      )}
      {data.selected && data.onDelete && (
        <button
          type="button"
          aria-label="Delete identifier"
          title="Delete identifier"
          className="absolute -top-2 -right-2 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-rose-600 text-white shadow hover:bg-rose-700"
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete?.();
          }}
        >
          <X size={12} />
        </button>
      )}
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

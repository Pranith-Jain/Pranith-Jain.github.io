import { useState } from 'react';
import type { Identifier, Pin } from '../../../lib/dfir/osint/osint-schema';

const PIN_COLORS = ['#2c3ee5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

export function PinForm({
  lat,
  lng,
  address,
  identifiers,
  initial,
  onSubmit,
  onCancel,
}: {
  lat: number;
  lng: number;
  address?: string;
  identifiers: Identifier[];
  /** When present, the form edits this pin (keeps id/coords); links are untouched. */
  initial?: Pin;
  onSubmit: (pin: Pin, linkedIds: string[]) => void;
  onCancel: () => void;
}): JSX.Element {
  const isEdit = !!initial;
  const [label, setLabel] = useState(initial?.label ?? address ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [color, setColor] = useState(initial?.color ?? PIN_COLORS[0]);
  const [linked, setLinked] = useState<string[]>([]);
  const coordLat = initial?.lat ?? lat;
  const coordLng = initial?.lng ?? lng;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          {
            id: initial?.id ?? crypto.randomUUID(),
            lat: coordLat,
            lng: coordLng,
            label: label || 'Pin',
            address: initial?.address ?? address ?? '',
            iconKey: 'default',
            color,
            note,
          },
          linked
        );
      }}
    >
      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
        {coordLat.toFixed(5)}, {coordLng.toFixed(5)}
      </div>
      <input
        className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 bg-white dark:bg-[rgb(var(--surface-200))]"
        placeholder="Label"
        aria-label="Pin label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <textarea
        className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 bg-white dark:bg-[rgb(var(--surface-200))]"
        placeholder="Note"
        aria-label="Pin note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-1">
        {PIN_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => setColor(c)}
            aria-label={`color ${c}`}
            aria-pressed={color === c}
            className={`w-6 h-6 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900' : ''}`}
            style={{ background: c }}
          />
        ))}
      </div>
      {!isEdit && identifiers.length > 0 && (
        <fieldset className="text-sm">
          <legend className="text-xs text-slate-500 dark:text-slate-400">Link identifiers</legend>
          {identifiers.map((id) => (
            <label key={id.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={linked.includes(id.id)}
                onChange={(e) => setLinked((p) => (e.target.checked ? [...p, id.id] : p.filter((x) => x !== id.id)))}
              />
              {Object.values(id.fields)[0] || id.type}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm">
          Cancel
        </button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-brand-600 text-white">
          {isEdit ? 'Save pin' : 'Add pin'}
        </button>
      </div>
    </form>
  );
}

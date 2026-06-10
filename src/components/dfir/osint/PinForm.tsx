import { useState } from 'react';
import type { Identifier, Pin } from '../../../lib/dfir/osint/osint-schema';

const PIN_COLORS = ['#2c3ee5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

export function PinForm({
  lat,
  lng,
  address,
  identifiers,
  onSubmit,
  onCancel,
}: {
  lat: number;
  lng: number;
  address?: string;
  identifiers: Identifier[];
  onSubmit: (pin: Pin, linkedIds: string[]) => void;
  onCancel: () => void;
}): JSX.Element {
  const [label, setLabel] = useState(address ?? '');
  const [note, setNote] = useState('');
  const [color, setColor] = useState(PIN_COLORS[0]);
  const [linked, setLinked] = useState<string[]>([]);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          { id: crypto.randomUUID(), lat, lng, label: label || 'Pin', address, iconKey: 'default', color, note },
          linked
        );
      }}
    >
      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </div>
      <input
        className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1 bg-white dark:bg-slate-900"
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <textarea
        className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1 bg-white dark:bg-slate-900"
        placeholder="Note"
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
      {identifiers.length > 0 && (
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
          Add pin
        </button>
      </div>
    </form>
  );
}

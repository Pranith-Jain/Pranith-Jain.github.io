import { useState } from 'react';
import { IDENTIFIER_TYPES, getIdentifierType } from '../../../lib/dfir/osint/identifier-types';
import type { Identifier } from '../../../lib/dfir/osint/osint-schema';
import { CustomIconUpload } from './CustomIconUpload';

export function IdentifierForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (id: Identifier, iconDataUrl?: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [type, setType] = useState(IDENTIFIER_TYPES[0].type);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [iconUrl, setIconUrl] = useState<string | undefined>();
  const def = getIdentifierType(type);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ id: crypto.randomUUID(), type, fields }, iconUrl);
      }}
    >
      <select
        value={type}
        onChange={(e) => {
          setType(e.target.value);
          setFields({});
        }}
        className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1 bg-white dark:bg-slate-900 text-sm"
      >
        {IDENTIFIER_TYPES.map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </select>
      {def.fields.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="text-slate-500 dark:text-slate-400 text-xs">{f.label}</span>
          <input
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1 bg-white dark:bg-slate-900"
            placeholder={f.placeholder}
            value={fields[f.key] ?? ''}
            onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
          />
        </label>
      ))}
      <CustomIconUpload onIcon={setIconUrl} />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm">
          Cancel
        </button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-brand-600 text-white">
          Add
        </button>
      </div>
    </form>
  );
}

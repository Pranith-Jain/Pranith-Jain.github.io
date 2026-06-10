import { useState } from 'react';
import { validateIconFile, readIconAsDataUrl } from '../../../lib/dfir/osint/custom-icon';

export function CustomIconUpload({ onIcon }: { onIcon: (dataUrl: string) => void }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="block text-xs">
      <span className="block mb-1 text-slate-500 dark:text-slate-400">Custom icon (PNG/JPEG/WebP, ≤256KB)</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="text-xs"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const v = validateIconFile(file);
          if (!v.ok) {
            setError(v.error);
            return;
          }
          setError(null);
          onIcon(await readIconAsDataUrl(file));
        }}
      />
      {error && <span className="block mt-1 text-rose-500">{error}</span>}
    </label>
  );
}

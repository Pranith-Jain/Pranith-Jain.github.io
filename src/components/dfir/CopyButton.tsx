import { useState, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Shared "copy to clipboard" controls.
 *
 * Two exports cover the visual variants used across the DFIR tools:
 *   - `<CopyButton value=… />`  — icon-only, low-emphasis (good next to
 *     a piece of inline content where a chip would dominate)
 *   - `<CopyChip value=… label="copy" />` — bordered chip with icon +
 *     short label (good in headers / toolbars where the action needs
 *     to be visible)
 *
 * Both gracefully no-op if `navigator.clipboard.writeText` rejects
 * (older browsers, file:// origins, restricted policies). Visual ack
 * is a checkmark + "copied" for ~1.2s.
 */

const ACK_MS = 1200;

async function copy(
  value: string,
  ack: (b: boolean) => void,
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    /* clipboard write rejected — silent */
  }
  ack(true);
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => ack(false), ACK_MS);
}

function useCopyTimer() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const ref = timerRef;
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);
  return timerRef;
}

interface CopyProps {
  value: string;
  /** A11y label for screen readers + tooltip text. Defaults to "Copy to clipboard". */
  title?: string;
  /** Inline className override appended to the default styles. */
  className?: string;
}

export function CopyButton({ value, title = 'Copy to clipboard', className = '' }: CopyProps): JSX.Element {
  const [done, setDone] = useState(false);
  const timerRef = useCopyTimer();
  return (
    <button
      type="button"
      onClick={() => void copy(value, setDone, timerRef)}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${className}`}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

interface CopyChipProps extends CopyProps {
  /** Text shown next to the icon. Defaults to "copy" / "copied". */
  label?: string;
}

export function CopyChip({
  value,
  label = 'copy',
  title = 'Copy to clipboard',
  className = '',
}: CopyChipProps): JSX.Element {
  const [done, setDone] = useState(false);
  const timerRef = useCopyTimer();
  return (
    <button
      type="button"
      onClick={() => void copy(value, setDone, timerRef)}
      title={title}
      aria-label={title}
      className={`text-xs font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1 ${className}`}
    >
      {done ? <Check size={11} /> : <Copy size={11} />}
      {done ? 'copied' : label}
    </button>
  );
}

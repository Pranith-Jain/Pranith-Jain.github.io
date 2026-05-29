import { Check, Copy } from 'lucide-react';
import { useClipboard } from '../../hooks/useClipboard';

export interface CopyButtonProps {
  /** Text to copy to the clipboard. */
  value: string;
  /** Icon size in px (default 12). */
  size?: number;
  /** Accessible label for the idle state (default "Copy"). */
  label?: string;
  className?: string;
}

/**
 * Icon button that copies `value` and briefly shows a check. Backed by
 * `useClipboard`, which falls back to `execCommand('copy')` on non-HTTPS / older
 * browsers (the hand-rolled `CopyBtn` copies this replaced did not). Consolidates
 * the per-page copies in LiveIocs / IocCorrelation / MyThreatIntel.
 */
export function CopyButton({ value, size = 12, label = 'Copy', className = '' }: CopyButtonProps) {
  const { copied, copy } = useClipboard({ timeout: 1200 });
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      aria-label={copied ? 'Copied' : label}
      className={`inline-flex items-center justify-center min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 text-slate-400 hover:text-brand-500 transition-colors shrink-0 ${className}`}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}

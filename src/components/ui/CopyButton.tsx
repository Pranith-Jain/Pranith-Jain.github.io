import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  /** Text to copy to clipboard */
  text?: string;
  /** @deprecated Use `text` instead */
  value?: string;
  /** Button content (optional, defaults to icon) */
  children?: ReactNode;
  /** Variant style */
  variant?: 'icon' | 'button' | 'ghost';
  /** Size */
  size?: 'sm' | 'md' | number;
  /** Success message duration (ms) */
  successDuration?: number;
  /** Callback on successful copy */
  onCopy?: () => void;
  /** Callback on copy error */
  onError?: (error: Error) => void;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label */
  label?: string;
  /** @deprecated Use `label` instead */
  title?: string;
}

const SIZE_STYLES: Record<string, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
};

const VARIANT_STYLES = {
  icon: 'p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]',
  button:
    'px-3 py-1.5 rounded text-sm font-medium bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
  ghost: 'p-1 rounded text-slate-400 hover:text-brand-600 dark:hover:text-brand-400',
};

/**
 * Copy to clipboard button with visual feedback.
 * Handles clipboard API errors gracefully and provides accessible feedback.
 *
 * @example
 * <CopyButton text="Hello World" />
 * <CopyButton value={apiKey} label="Copy API Key" />
 * <CopyButton text={data} variant="button">Copy</CopyButton>
 */
export function CopyButton({
  text,
  value,
  children,
  variant = 'icon',
  size = 'md',
  successDuration = 2000,
  onCopy,
  onError,
  className = '',
  label = 'Copy to clipboard',
  title,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textToCopy = text ?? value ?? '';
  const ariaLabel = title ?? label;

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      onCopy?.();
    } catch {
      // Fallback for older browsers or non-HTTPS contexts
      try {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopied(true);
        onCopy?.();
      } catch (fallbackError) {
        onError?.(fallbackError instanceof Error ? fallbackError : new Error('Copy failed'));
        return;
      }
    }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), successDuration);
  }, [textToCopy, successDuration, onCopy, onError]);

  const iconSize = typeof size === 'number' ? size : size === 'sm' ? 12 : 14;
  const icon = copied ? <Check size={iconSize} className="text-emerald-500" /> : <Copy size={iconSize} />;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`
        inline-flex items-center justify-center transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${typeof size === 'string' ? SIZE_STYLES[size] : ''}
        ${VARIANT_STYLES[variant]}
        ${className}
      `}
      aria-label={copied ? 'Copied!' : ariaLabel}
    >
      {children ?? icon}
    </button>
  );
}

interface CopyChipProps {
  /** Text to copy */
  value: string;
  /** Text shown next to the icon. Defaults to "copy" / "copied". */
  label?: string;
  /** A11y label for screen readers + tooltip text. */
  title?: string;
  className?: string;
}

/**
 * Bordered chip with icon + short label — for toolbars and headers where
 * the copy action needs to be visible (not icon-only).
 */
export function CopyChip({
  value,
  label = 'copy',
  title = 'Copy to clipboard',
  className = '',
}: CopyChipProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopied(true);
      } catch {
        return;
      }
    }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [value]);

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={title}
      aria-label={copied ? 'Copied!' : title}
      className={`text-xs font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${className}`}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'copied' : label}
    </button>
  );
}

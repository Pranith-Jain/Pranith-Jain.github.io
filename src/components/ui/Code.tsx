import { useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check } from 'lucide-react';

export interface CodeProps {
  children: string;
  className?: string;
}

export function Code({ children, className = '' }: CodeProps) {
  return (
    <code
      className={`rounded bg-slate-100 px-1 py-0.5 font-mono text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200 ${className}`}
    >
      {children}
    </code>
  );
}

export type CodeBlockVariant = 'default' | 'success' | 'error';

export interface CodeBlockProps {
  children: string;
  variant?: CodeBlockVariant;
  showCopy?: boolean;
  maxHeight?: string | number;
  className?: string;
  label?: string;
}

const VARIANT: Record<CodeBlockVariant, string> = {
  default: 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300',
  success: 'bg-emerald-500/5 border-emerald-500/20 text-slate-700 dark:text-slate-300',
  error: 'bg-rose-500/5 border-rose-500/20 text-slate-700 dark:text-slate-300',
};

export function CodeBlock({
  children,
  variant = 'default',
  showCopy = true,
  maxHeight,
  className = '',
  label,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = children;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
    }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className={`group relative ${className}`}>
      {label && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-micro font-mono uppercase tracking-wider text-slate-500">{label}</span>
        </div>
      )}
      <pre
        className={`rounded-lg border p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all ${VARIANT[variant]}`}
        style={
          maxHeight
            ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight, overflow: 'auto' }
            : undefined
        }
      >
        {children}
      </pre>
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className={`absolute right-2 top-2 rounded p-1.5 text-slate-400 opacity-0 transition-all hover:text-slate-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 group-hover:opacity-100 dark:hover:text-slate-300 ${
            copied ? 'opacity-100 text-emerald-500' : ''
          }`}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

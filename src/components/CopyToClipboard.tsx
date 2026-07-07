import { useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyToClipboardProps {
  text: string;
  label?: string;
  className?: string;
  successMessage?: string;
}

export function CopyToClipboard({ text, label, className = '', successMessage = 'Copied!' }: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`
        inline-flex items-center gap-2
        px-3 py-1.5
        rounded-xl
        bg-white/10 text-slate-300
        hover:bg-white/20 hover:text-white
        transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50
        ${className}
      `}
      aria-label={`Copy ${label || text} to clipboard`}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <span className="text-emerald-400">{successMessage}</span>
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" aria-hidden="true" />
          {label && <span>{label}</span>}
        </>
      )}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {copied ? successMessage : ''}
      </span>
    </button>
  );
}

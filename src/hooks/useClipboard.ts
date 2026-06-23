import { useState, useCallback, useRef } from 'react';

export interface UseClipboardOptions {
  timeout?: number;
}

export interface UseClipboardResult {
  copied: boolean;
  copy: (text: string) => Promise<void>;
}

export function useClipboard({ timeout = 2000 }: UseClipboardOptions = {}): UseClipboardResult {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const copy = useCallback(
    async (text: string) => {
      clearTimeout(timerRef.current);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), timeout);
    },
    [timeout]
  );

  return { copied, copy };
}

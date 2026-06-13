/**
 * Compact MCP key + status pill, designed for the TopBar.
 *
 * Two render variants:
 *   - `variant="compact"` (default): a single button with the status
 *     text inline + a popover for the key input. Used in the TopBar.
 *   - `variant="full"`: a wider bar with the status pill, an
 *     always-visible key input, and the deep link. Used at the top
 *     of dedicated pages like /threatintel/ai-report.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Key, Loader2, Plug, PlugZap, RefreshCw } from 'lucide-react';
import { useMcp } from './McpContext';

interface McpKeyBarProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export function McpKeyBar({ variant = 'compact', className = '' }: McpKeyBarProps): JSX.Element {
  const { apiKey, status, statusMsg, saveKey, reprobe } = useMcp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(apiKey);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(apiKey);
  }, [apiKey]);

  // Close on outside click for the compact variant.
  useEffect(() => {
    if (!open || variant !== 'compact') return;
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open, variant]);

  const pillInner = ((): JSX.Element => {
    if (status === 'unconfigured') {
      return (
        <>
          <Plug className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">MCP not configured</span>
          <span className="sm:hidden">MCP</span>
        </>
      );
    }
    if (status === 'probing') {
      return (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="hidden sm:inline">probing MCP…</span>
          <span className="sm:hidden">MCP…</span>
        </>
      );
    }
    if (status === 'connected') {
      return (
        <>
          <PlugZap className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">MCP · 19 tools</span>
          <span className="sm:hidden">MCP</span>
        </>
      );
    }
    if (status === 'error') {
      return (
        <>
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline" title={statusMsg || 'Connection failed'}>
            MCP error
          </span>
          <span className="sm:hidden">MCP</span>
        </>
      );
    }
    return (
      <>
        <Plug className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">MCP idle</span>
        <span className="sm:hidden">MCP</span>
      </>
    );
  })();

  const tone = (() => {
    if (status === 'connected')
      return 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300';
    if (status === 'probing')
      return 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300';
    if (status === 'error')
      return 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300';
    if (status === 'unconfigured')
      return 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300';
    return 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300';
  })();

  if (variant === 'compact') {
    return (
      <div ref={ref} className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded border ${tone} px-2 py-1 text-xs font-mono hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}
          aria-expanded={open}
          aria-label="TI-Mindmap-Hub MCP connection"
          title={status === 'error' ? statusMsg || 'Connection failed' : 'TI-Mindmap-Hub MCP'}
        >
          {pillInner}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute right-0 mt-1.5 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e2 p-3 z-50">
            <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              TI-Mindmap-Hub MCP key
            </p>
            <KeyForm
              draft={draft}
              setDraft={setDraft}
              onSave={(k) => {
                saveKey(k);
                // Keep the popover open so the user can see the
                // probe result (the pill updates in place).
              }}
              onClear={
                apiKey
                  ? () => {
                      saveKey('');
                      setDraft('');
                    }
                  : undefined
              }
            />
            {status === 'error' && statusMsg && (
              <p className="mt-2 text-[10px] text-rose-600 dark:text-rose-400 font-mono break-words">
                last probe: {statusMsg}
              </p>
            )}
            <div className="mt-2 flex items-start justify-between gap-2">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 flex-1">
                Keys stay in your browser (localStorage) and never reach our backend. Get one at{' '}
                <a
                  href="https://ti-mindmap-hub.com/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 dark:text-brand-400 hover:underline"
                >
                  ti-mindmap-hub.com/settings ↗
                </a>
              </p>
              <button
                type="button"
                onClick={() => void reprobe()}
                disabled={status === 'probing' || !apiKey}
                className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300 hover:border-brand-400 disabled:opacity-50 shrink-0"
                title="Re-run the MCP initialize handshake with the stored key"
              >
                <RefreshCw className={`h-3 w-3 ${status === 'probing' ? 'animate-spin' : ''}`} /> re-probe
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // full variant
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-mono ${tone}`}>
        {pillInner}
      </span>
      <KeyForm
        draft={draft}
        setDraft={setDraft}
        onSave={(k) => saveKey(k)}
        onClear={
          apiKey
            ? () => {
                saveKey('');
                setDraft('');
              }
            : undefined
        }
        inline
      />
    </div>
  );
}

function KeyForm(props: {
  draft: string;
  setDraft: (s: string) => void;
  onSave: (k: string) => void;
  onClear?: () => void;
  inline?: boolean;
}): JSX.Element {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave(props.draft.trim());
      }}
      className={props.inline ? 'flex flex-wrap items-center gap-2' : 'flex flex-col gap-2'}
    >
      <input
        type="password"
        value={props.draft}
        onChange={(e) => props.setDraft(e.target.value)}
        placeholder="tim_xxxxxxxxxxxx"
        className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono text-xs text-slate-800 dark:text-slate-200 w-full sm:w-56"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!props.draft.trim()}
          className="rounded border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/40 px-2 py-1 font-mono text-xs text-brand-700 dark:text-brand-300 hover:bg-brand-100 disabled:opacity-50"
        >
          <Key className="inline h-3 w-3 mr-1" /> save &amp; probe
        </button>
        {props.onClear && (
          <button
            type="button"
            onClick={props.onClear}
            className="rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 px-2 py-1 font-mono text-xs text-rose-700 dark:text-rose-300"
          >
            clear
          </button>
        )}
      </div>
    </form>
  );
}

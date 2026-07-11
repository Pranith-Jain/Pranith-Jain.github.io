/**
 * Read-only MCP status banner for the AI Report showcase and MCP Search
 * pages. The API key itself is only ever edited in the TopBar pill
 * (./McpKeyBar.tsx) -- this banner just reflects the current state and
 * nudges the user there if they need to configure or fix the connection.
 *
 * Keeping the key UI in exactly one place (the TopBar) avoids three
 * independent sources of truth: the legacy page-level key forms used to
 * diverge, causing confusing "the key works in the search box but the
 * loader on the showcase still says unconfigured" reports.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plug, Settings2 } from 'lucide-react';
import { useMcp } from './McpContext';

export function McpStatusBanner({
  className = '',
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}): JSX.Element {
  const { apiKey, status, statusMsg, reprobe } = useMcp();
  const [lastChanged, setLastChanged] = useState<number>(Date.now());
  useEffect(() => {
    setLastChanged(Date.now());
  }, [status, statusMsg]);

  const tone = (() => {
    if (status === 'connected')
      return 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200';
    if (status === 'error')
      return 'border-rose-300 dark:border-rose-800/70 bg-rose-50/60 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200';
    if (status === 'probing')
      return 'border-sky-300 dark:border-sky-800/70 bg-sky-50/60 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200';
    return 'border-amber-300 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200';
  })();

  const Icon = (() => {
    if (status === 'connected') return CheckCircle2;
    if (status === 'error') return AlertTriangle;
    if (status === 'probing') return Loader2;
    return Plug;
  })();

  const headline = (() => {
    if (status === 'connected') return 'TI-Mindmap-Hub MCP connected · 25 tools available';
    if (status === 'error') return 'MCP connection error';
    if (status === 'probing') return 'Probing MCP…';
    if (status === 'unconfigured') return 'MCP key not set — search and report loading are disabled';
    return 'MCP idle';
  })();

  const hint = ((): string => {
    if (status === 'connected') return 'Open the MCP pill in the top-right of the header to view the key or re-probe.';
    if (status === 'error')
      return `Open the MCP pill in the top-right of the header to fix the key. Last probe: ${
        statusMsg || 'unknown error'
      }`;
    if (status === 'probing') return 'Open the MCP pill in the top-right of the header to view progress.';
    return 'Open the MCP pill in the top-right of the header to paste your key from ti-mindmap-hub.com/settings.';
  })();

  return (
    <div
      data-mcp-status={status}
      data-mcp-updated={lastChanged}
      className={`flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-xs ${tone} ${className}`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${
          status === 'probing' ? 'animate-spin' : status === 'connected' ? 'text-emerald-600 dark:text-emerald-300' : ''
        }`}
      />
      <p className="font-mono">
        <span className="font-semibold">{headline}</span>
        <span className="ml-2 text-[10px] opacity-80">{hint}</span>
      </p>
      <div className="ml-auto flex items-center gap-2">
        {children}
        {status === 'error' && apiKey && (
          <button
            type="button"
            onClick={() => void reprobe()}
            className="inline-flex items-center gap-1 rounded border border-current/40 px-2 py-0.5 font-mono text-[10px] hover:bg-white/40 dark:hover:bg-black/20"
          >
            <Settings2 className="h-3 w-3" /> retry
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Global TI-Mindmap-Hub MCP context.
 *
 * Provides the connection state (api key, status, status message) and the
 * typed MCP client to every component in the app, via React context +
 * a single probe-and-keep-alive effect at the AppShell level.
 *
 * Why a context?
 *  - The connection survives client-side route changes (no re-probe per
 *    page mount).
 *  - The key bar in the TopBar, the AI Report showcase, and the new
 *    /threatintel/mcp-search page all read from the same source of truth
 *    and trigger the same probe logic.
 *  - The key itself still lives in localStorage (lib/ti-mindmap-mcp.ts
 *    owns that); this context just hydrates the React state and exposes
 *    a setter.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getStoredApiKey,
  setStoredApiKey as persistKey,
  probeConnection,
  McpError,
  type IocSearchResult,
  type CveSearchResult,
  type ListReportsResult,
  type BriefingSummary,
  type PlatformStats,
} from '../../lib/ti-mindmap-mcp';

export type McpStatus = 'idle' | 'probing' | 'connected' | 'error' | 'unconfigured';

export interface McpContextValue {
  apiKey: string;
  status: McpStatus;
  statusMsg: string;
  saveKey: (k: string) => void;
  reprobe: () => Promise<void>;
}

const Ctx = createContext<McpContextValue | null>(null);

export function McpProvider({ children }: { children: ReactNode }): JSX.Element {
  const [apiKey, setApiKey] = useState<string>('');
  const [status, setStatus] = useState<McpStatus>('unconfigured');
  const [statusMsg, setStatusMsg] = useState<string>('');

  const reprobe = useCallback(
    async (keyArg?: string): Promise<void> => {
      const key = keyArg ?? apiKey;
      if (!key) {
        setStatus('unconfigured');
        setStatusMsg('');
        return;
      }
      setStatus('probing');
      setStatusMsg('');
      const r = await probeConnection(key);
      if (r.ok) {
        setStatus('connected');
        setStatusMsg('');
      } else {
        setStatus('error');
        setStatusMsg(r.error ?? 'unknown error');
      }
    },
    [apiKey]
  );

  // Hydrate the key from localStorage on mount, then probe if we have one.
  useEffect(() => {
    const k = getStoredApiKey();
    setApiKey(k);
    if (k) void reprobe(k);
    // Intentionally empty deps -- one-shot mount probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveKey = useCallback(
    (k: string): void => {
      persistKey(k);
      setApiKey(k);
      if (!k) {
        setStatus('unconfigured');
        setStatusMsg('');
        return;
      }
      void reprobe(k);
    },
    [reprobe]
  );

  const value = useMemo<McpContextValue>(
    () => ({ apiKey, status, statusMsg, saveKey, reprobe: () => reprobe() }),
    [apiKey, status, statusMsg, saveKey, reprobe]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMcp(): McpContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMcp must be used inside <McpProvider>');
  return v;
}

// Re-export the result types and the McpError class for convenience.
export type { IocSearchResult, CveSearchResult, ListReportsResult, BriefingSummary, PlatformStats };
export { McpError };

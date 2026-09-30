import type { Env } from './env';

/**
 * Presentation surface — which of the two front doors a request is for.
 *
 *   portfolio  pranithjain.qzz.io           → portfolio nav + Home
 *   tools      tools.pranithjain.qzz.io     → tools nav + ToolsHome
 *
 * Mirrors `src/lib/surface.ts` on the client. The worker resolves it from the
 * request hostname so it can serve the matching prerendered HTML tree
 * (`dist/__prerendered-tools/`) and so the browser — which then resolves the
 * same surface from `location.hostname` — renders identical chrome.
 */
export type Surface = 'portfolio' | 'tools';

/**
 * Route prefixes that render the AppShell chrome — the platform itself, which
 * the tools surface owns. Mirrors the four `location.pathname.startsWith(...)`
 * checks in `src/App.tsx`'s `appMode`, and the copy of this list at the top of
 * `scripts/prerender.mjs` (a .mjs script can't import this .ts module).
 *
 * Used for two decisions: which routes need their own prerendered tree, and
 * which origin owns a path for canonical/og:url purposes.
 */
export const APP_ROUTE_PREFIXES = ['/dfir', '/argus', '/threatintel', '/radar'];

/** True when a path is rendered by AppShell rather than the portfolio shell. */
export function isAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some((prefix) => (pathname || '/').startsWith(prefix));
}

/**
 * Resolve the surface for a request hostname against `env.TOOLS_HOST`.
 *
 * Fails safe: an unset, empty, or whitespace-only `TOOLS_HOST` collapses
 * every request to the portfolio surface, which is exactly today's
 * behaviour — the split can only engage once the var is configured.
 *
 * Comparison is case-insensitive and ignores any port, so local dev on
 * `localhost:8787` and the real `tools.pranithjain.qzz.io` both work.
 */
export function surfaceForHostname(hostname: string, env: Env): Surface {
  const configured = (env.TOOLS_HOST ?? '').trim().toLowerCase();
  if (!configured) return 'portfolio';
  const host = (hostname ?? '').trim().toLowerCase().split(':')[0];
  return host === configured ? 'tools' : 'portfolio';
}

/**
 * Surface resolution — which of the two presentation surfaces a request is on.
 *
 * One repo, one Worker, one build, several front doors:
 *
 *   portfolio   https://pranithjain.qzz.io            portfolio nav + Home
 *   tools       https://crucible.pranithjain.qzz.io    tools nav + ToolsHome
 *               https://panopticon.pranithjain.qzz.io
 *               https://scout.pranithjain.qzz.io
 *
 * Both surfaces serve the SAME route table (`/dfir/*`, `/threatintel/*` work on
 * any host), so a surface only picks chrome and the `/` landing page — never
 * whether a path exists.
 *
 * `TOOL_HOSTS_BY_PATH` is the client mirror of the `TOOLS_HOSTS` var in
 * `wrangler.jsonc` (the Worker resolves the same map from the request Host
 * header); keep them identical or the server and client will disagree about
 * which surface they are on, which shows the wrong nav for the first frame.
 * The shared parser the Worker uses lives in `api/src/lib/surface-hosts.ts`.
 */
import { createContext, useContext } from 'react';

export type Surface = 'portfolio' | 'tools';

/** Apex / portfolio origin. */
export const PORTFOLIO_ORIGIN = 'https://pranithjain.qzz.io';

/**
 * Path prefix → owning hostname (no scheme). Mirror of `TOOLS_HOSTS` in
 * `wrangler.jsonc`. Only hosts that resolve are listed: a prefix mapped to a
 * hostname with no DNS record would make us render tool chrome on a host
 * nobody can reach.
 */
export const TOOL_HOSTS_BY_PATH: Readonly<Record<string, string>> = {};

/** Every configured tools hostname. */
export const TOOL_HOSTS: readonly string[] = Object.values(TOOL_HOSTS_BY_PATH);

/**
 * Resolve the surface for the page currently executing.
 *
 * Reads `location.hostname` because that is the only input that is correct on
 * first paint and matches what the Worker served. During SSR `window` does not
 * exist, so it reports `portfolio` — the prerenderer passes the surface
 * explicitly instead (see `src/entry-server.tsx`).
 */
export function currentSurface(): Surface {
  if (typeof window === 'undefined' || !window.location) return 'portfolio';
  const host = window.location.hostname.toLowerCase();
  return TOOL_HOSTS.includes(host) ? 'tools' : 'portfolio';
}

/**
 * Surface for the current render pass.
 *
 * The prerenderer supplies it explicitly (there is no `window` during SSR, so
 * `currentSurface()` alone would always answer `portfolio` and the tools
 * surface would be served the portfolio's HTML). The browser normally leaves
 * it unset and resolves from `location.hostname` instead.
 */
export const SurfaceContext = createContext<Surface | null>(null);

/** Surface for this component, preferring an explicitly supplied one. */
export function useSurface(): Surface {
  const supplied = useContext(SurfaceContext);
  return supplied ?? currentSurface();
}

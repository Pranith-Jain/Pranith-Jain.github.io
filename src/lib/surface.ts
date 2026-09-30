/**
 * Surface resolution — which of the two presentation surfaces a request is on.
 *
 * One repo, one Worker, one build, two front doors:
 *
 *   portfolio  https://pranithjain.qzz.io            → portfolio nav + Home
 *   tools      https://tools.pranithjain.qzz.io      → tools nav + ToolsHome
 *
 * Both hosts serve the SAME route table (`/dfir/*`, `/threatintel/*` work on
 * either), so a surface only picks chrome and the `/` landing page — never
 * whether a path exists. `TOOLS_HOST` is mirrored in `wrangler.jsonc` (the
 * Worker resolves the same string from the request Host header); keep them
 * identical or the server and client will disagree about which surface they
 * are on, which shows the wrong nav for the first frame.
 */
import { createContext, useContext } from 'react';

export type Surface = 'portfolio' | 'tools';

/** Apex / portfolio origin. */
export const PORTFOLIO_ORIGIN = 'https://pranithjain.qzz.io';

/** Hostname of the tools surface — no scheme. */
export const TOOLS_HOST = 'tools.pranithjain.qzz.io';

/** Full tools origin. */
export const TOOLS_ORIGIN = `https://${TOOLS_HOST}`;

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
  return host === TOOLS_HOST ? 'tools' : 'portfolio';
}

/** Origin the given surface is served from. */
export function originFor(surface: Surface): string {
  return surface === 'tools' ? TOOLS_ORIGIN : PORTFOLIO_ORIGIN;
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

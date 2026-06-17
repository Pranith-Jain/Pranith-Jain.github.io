/**
 * Back-link routing: when you're on a tool page (say
 * `/threatintel/detections`), the "← back" affordance should drop you on
 * the catalog filtered by the relevant category
 * (`/threatintel/catalog?cat=detections`), not the full home. That keeps
 * related sources one click away instead of forcing the user to
 * re-navigate the chip strip.
 *
 * The single source of truth is `data/threatintel-hubs.ts` — a hub is
 * what the catalog filters by (`?cat=<hub-id>`). Pages look up their hub
 * id by slug (last path segment) via `hubIdForSlug()`. We don't
 * duplicate the slug → hub map here so it can't drift from the registry.
 *
 * For 3-segment paths like `/threatintel/<hub>/<tab>` the **hub**
 * segment is used directly (no slug lookup), so a page like
 * `/threatintel/iocs/cross` back-links to the `iocs` category even
 * though the slug `cross` is also a tab under `campaigns`.
 *
 * DFIR's group map is built the same way: `data/dfir/tool-sections.ts`
 * already exports SECTIONS, and we walk it once at module load.
 */
import { hubIdForSlug, isFlatToolPath } from '../data/threatintel-hubs';
import { SECTIONS as DFIR_SECTIONS, type ToolGroup } from '../components/dfir/tool-sections';

/* ------------------------------------------------------------------ */
/*  DFIR: /dfir/<slug> → ToolGroup (rendered at /dfir/tools/<group>)  */
/* ------------------------------------------------------------------ */
const DFIR_TOOL_TO_GROUP: Record<string, ToolGroup> = (() => {
  const map: Record<string, ToolGroup> = {};
  for (const section of DFIR_SECTIONS) {
    for (const t of section.tools) {
      // Strip the leading `/dfir/` so the lookup table keys on the slug only.
      const slug = t.path.replace(/^\/dfir\//, '');
      if (slug && !slug.includes('/')) map[slug] = section.group;
    }
  }
  return map;
})();

/**
 * Given the current pathname, return the URL the "back" link should
 * send the user to. Returns `null` when the page isn't a known tool —
 * callers fall back to the surface's hub root (`/threatintel` or
 * `/dfir`).
 */
export function backCategoryFor(pathname: string): string | null {
  // 2-segment threatintel paths — two cases:
  //   (a) Hub landing page: /threatintel/<hub-id>
  //       (e.g. /threatintel/detections → ?cat=detections)
  //   (b) Flat tool page: /threatintel/<slug>
  //       (e.g. /threatintel/briefings → ?cat=campaigns)
  // We only route a 2-segment path if it is a *registered* page; that
  // way random surface routes like /threatintel/about (which is also a
  // tab slug under `wiki`) don't accidentally back-link to the wiki
  // hub when the user is on a totally different surface.
  const ti = /^\/threatintel\/([^/]+)$/.exec(pathname);
  if (ti) {
    if (!isFlatToolPath(pathname)) return null;
    const hub = hubIdForSlug(ti[1]!);
    return hub ? `/threatintel/catalog?cat=${hub}` : null;
  }

  // 3-segment threatintel tab/detail routes: /threatintel/<hub>/<tab>
  // Use the hub part directly so collisions like `cross` (which is a
  // tab under both `iocs` and `campaigns`) resolve to the correct hub
  // for the path the user is actually on.
  const tiTab = /^\/threatintel\/([^/]+)\/[^/]+$/.exec(pathname);
  if (tiTab) {
    const hub = tiTab[1]!;
    if (hubIdForSlug(hub)) return `/threatintel/catalog?cat=${hub}`;
    return null;
  }

  const df = /^\/dfir\/([^/]+)$/.exec(pathname);
  if (df) {
    const group = DFIR_TOOL_TO_GROUP[df[1]!];
    return group ? `/dfir/tools/${group}` : null;
  }
  return null;
}

// Exposed for the drift test; not part of the public API.
export const __TEST_ONLY = {
  DFIR_TOOL_TO_GROUP,
};

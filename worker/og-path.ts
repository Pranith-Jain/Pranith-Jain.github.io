/**
 * Pure OG-image route parsing — deliberately import-free so it can be unit
 * tested (and imported by data/loader code) WITHOUT pulling in og-raster, which
 * statically imports the resvg wasm module (that import is not loadable in a
 * Node/vitest environment).
 *
 * Two card URL shapes:
 *   - Entity cards:  /api/v1/og-image/(briefing|blog)/<slug>.png
 *                    data-driven from D1 / KV (one card per briefing / post).
 *   - Page cards:    /api/v1/og-image/page.png?p=<encodeURIComponent(path)>
 *                    generated for ANY route so every URL has a unique card.
 *                    The route path is carried in a query param (not a path
 *                    segment) because paths contain slashes that would break a
 *                    single-segment slug regex.
 */
export type OgImageType = 'briefing' | 'blog' | 'page';

const OG_ROUTE_RE = /^\/api\/v1\/og-image\/(briefing|blog)\/([a-z0-9][a-z0-9-]{0,199})\.png$/i;

/** Pathname of the generic per-page card endpoint. */
export const OG_PAGE_PATH = '/api/v1/og-image/page.png';

/** Parse `/api/v1/og-image/:type/:slug.png` into its parts, or null if the
 *  path is not a valid entity-card OG-image request. */
export function matchOgImagePath(pathname: string): { type: 'briefing' | 'blog'; slug: string } | null {
  const m = OG_ROUTE_RE.exec(pathname);
  if (!m) return null;
  return { type: m[1]!.toLowerCase() as 'briefing' | 'blog', slug: m[2]! };
}

/** Parse the generic page-card endpoint. Returns the decoded route path the
 *  card should represent (e.g. "/dfir/cve"), or null when the URL is not a
 *  valid page-card request. Rejects empty paths and anything that isn't a
 *  site-relative path starting with "/". */
export function matchOgPagePath(url: URL): string | null {
  if (url.pathname !== OG_PAGE_PATH) return null;
  const p = url.searchParams.get('p');
  if (!p) return null;
  if (!p.startsWith('/') || p.length > 200) return null;
  return p;
}

/** Build the page-card URL for a route path (used by the meta rewriter to set
 *  og:image / twitter:image to a unique generated card). */
export function pageCardUrl(pathname: string): string {
  return `${OG_PAGE_PATH}?p=${encodeURIComponent(pathname)}`;
}

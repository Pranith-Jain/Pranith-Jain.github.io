/**
 * Pure OG-image route parsing — deliberately import-free so it can be unit
 * tested (and imported by data/loader code) WITHOUT pulling in og-raster, which
 * statically imports the resvg wasm module (that import is not loadable in a
 * Node/vitest environment).
 *
 * Two card URL shapes:
 *   - Entity cards:  /api/v1/og-image/(briefing|blog)/<slug>.png
 *                    data-driven from D1 / KV (one card per briefing / post).
 *   - Page cards:    /api/v1/og-image/page/<encodeURIComponent(path)>.png
 *                    generated for ANY route so every URL has a unique card.
 *                    The route path is embedded in the PATH (percent-encoded),
 *                    NOT a query param — X/Twitter's card parser drops og:image
 *                    URLs that carry a query string (it never fetches them, so
 *                    the card renders without an image or not at all). The
 *                    legacy `?p=` form is still accepted for cached/deployed
 *                    HTML that referenced it.
 */
export type OgImageType = 'briefing' | 'blog' | 'page';

const OG_ROUTE_RE = /^\/api\/v1\/og-image\/(briefing|blog)\/([a-z0-9][a-z0-9-]{0,199})\.png$/i;

/** Pathname of the generic per-page card endpoint (legacy query form). */
export const OG_PAGE_PATH = '/api/v1/og-image/page.png';

/** Path prefix of the query-free per-page card endpoint. */
export const OG_PAGE_PREFIX = '/api/v1/og-image/page/';

const OG_PAGE_PATH_RE = /^\/api\/v1\/og-image\/page\/(.+)\.png$/i;

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
  // Preferred query-free form: /api/v1/og-image/page/<url-encoded-path>.png
  const pm = OG_PAGE_PATH_RE.exec(url.pathname);
  if (pm) {
    try {
      const p = decodeURIComponent(pm[1]!);
      if (p.startsWith('/') && p.length <= 200) return p;
    } catch {
      /* malformed percent-encoding → not a valid page card */
    }
    return null;
  }
  // Legacy `?p=` form — still accepted for previously-emitted meta tags.
  if (url.pathname !== OG_PAGE_PATH) return null;
  const p = url.searchParams.get('p');
  if (!p) return null;
  if (!p.startsWith('/') || p.length > 200) return null;
  return p;
}

/** Build the page-card URL for a route path (used by the meta rewriter to set
 *  og:image / twitter:image to a unique generated card). Query-free: the path
 *  is percent-encoded into the URL path so X's card parser doesn't drop it. */
export function pageCardUrl(pathname: string): string {
  return `${OG_PAGE_PREFIX}${encodeURIComponent(pathname)}.png`;
}

/**
 * Pure OG-image route parsing — deliberately import-free so it can be unit
 * tested (and imported by data/loader code) WITHOUT pulling in og-raster, which
 * statically imports the resvg wasm module (that import is not loadable in a
 * Node/vitest environment).
 */
export type OgImageType = 'briefing' | 'blog';

const OG_ROUTE_RE = /^\/api\/v1\/og-image\/(briefing|blog)\/([a-z0-9][a-z0-9-]{0,199})\.png$/i;

/** Parse `/api/v1/og-image/:type/:slug.png` into its parts, or null if the
 *  path is not a valid OG-image request. */
export function matchOgImagePath(pathname: string): { type: OgImageType; slug: string } | null {
  const m = OG_ROUTE_RE.exec(pathname);
  if (!m) return null;
  return { type: m[1]!.toLowerCase() as OgImageType, slug: m[2]! };
}

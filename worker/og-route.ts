/**
 * Edge handler for `GET /api/v1/og-image/:type/:slug.png`.
 *
 * Served at the WORKER level (before the request is forwarded to the api app)
 * so it bypasses the `/api/v1/*` key-gate — OG crawlers (X, LinkedIn, Slack…)
 * are anonymous and must be able to fetch the card. Pipeline:
 *   load data (D1 / KV) → generate SVG → rasterise to PNG → edge-cache.
 * Any failure falls back to the matching static card so the crawler's image
 * fetch never 500s or returns nothing.
 */
import type { Env } from './env';
import { generateOgSvg } from './og-image';
import { loadOgData } from './og-data';
import { matchOgImagePath, matchOgPagePath, type OgImageType } from './og-path';
import { svgToPng } from './og-raster';
import { workerRateLimit, rateLimitResponse, callerIp } from './lib/worker-rate-limit';

const OG_LIMIT = 20;

const ASSET_ORIGIN = 'https://og-assets.internal';

/** Static fallback card per type (already in /public, 1200×630 PNG). */
const FALLBACK: Record<OgImageType, string> = {
  briefing: '/og-threatintel.png',
  blog: '/og-image.png',
  page: '/og-image.png',
};

/** Global-KV TTL for a rendered card. Cards are slug-stable, so a long TTL
 *  keeps cross-colo reads cheap; 7 days bounds KV storage to recently-shared
 *  posts while covering the window a post is actively circulating. */
const OG_KV_TTL_SECONDS = 7 * 24 * 3600;

function pngResponse(bytes: BodyInit, longLived: boolean): Response {
  return new Response(bytes, {
    headers: {
      'content-type': 'image/png',
      // Generated cards are slug-stable; a static fallback is served short so a
      // transient data miss self-heals on the next crawl rather than sticking.
      'cache-control': longLived ? 'public, max-age=86400, s-maxage=86400' : 'public, max-age=300',
      'cdn-cache-control': longLived ? 'public, max-age=604800' : 'public, max-age=300',
    },
  });
}

async function staticFallback(env: Env, type: OgImageType): Promise<Response> {
  const res = await env.ASSETS.fetch(new Request(`${ASSET_ORIGIN}${FALLBACK[type]}`));
  return pngResponse(res.body ?? new Uint8Array(), false);
}

/**
 * Returns a PNG Response for any path under `/api/v1/og-image/`. The caller
 * gates on that prefix; a malformed type/slug yields a 404 (crawlers simply
 * show no card). Never throws.
 */
export async function handleOgImage(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  // Two card shapes: entity cards (/og-image/(briefing|blog)/<slug>.png) and the
  // generic per-page card (/og-image/page.png?p=<path>). Resolve both to a
  // (type, slug) pair the rest of the pipeline caches + renders uniformly.
  const entity = matchOgImagePath(url.pathname);
  const pagePath = entity ? null : matchOgPagePath(url);
  if (!entity && pagePath === null) return new Response('not found', { status: 404 });
  const type: OgImageType = entity ? entity.type : 'page';
  const slug = entity ? entity.slug : pagePath!;
  // Page slugs are route paths (contain '/'); encode so the cache key stays a
  // single clean segment. No-op for briefing/blog slugs (already url-safe).
  const keySlug = encodeURIComponent(slug);

  const rl = await workerRateLimit('og', callerIp(request), OG_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  // v4: bumped for the richer briefing OG stats strip (IOCs / KEVs /
  // ransomware victims now surface alongside critical/high) so previously
  // cached cards re-render. Bump on any card redesign.
  const cacheKey = new Request(`https://og-png.internal/v4/${type}/${keySlug}.png`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const kvKey = `og:png:v4:${type}:${keySlug}`;
  const pngCacheReq = new Request(`https://og-png-cache.internal/v1/${encodeURIComponent(kvKey)}`);
  const cachedPng = await caches.default.match(pngCacheReq);
  if (cachedPng) return cachedPng;

  try {
    const data = await loadOgData(env, type, slug);
    if (!data) return staticFallback(env, type);
    const png = await svgToPng(env, generateOgSvg(data));
    const res = pngResponse(png, true);
    ctx.waitUntil(caches.default.put(cacheKey, res.clone()).catch((e) => console.warn('og-cache put failed:', e)));
    ctx.waitUntil(
      caches.default
        .put(
          pngCacheReq,
          new Response(png, {
            headers: { 'content-type': 'image/png', 'cache-control': `public, max-age=${OG_KV_TTL_SECONDS}` },
          })
        )
        .catch((e) => console.warn('og-cache put failed:', e))
    );
    return res;
  } catch (err) {
    console.error('og-image render failed:', err instanceof Error ? err.message : String(err));
    return staticFallback(env, type);
  }
}

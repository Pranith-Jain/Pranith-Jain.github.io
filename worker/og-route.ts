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
import { matchOgImagePath, type OgImageType } from './og-path';
import { svgToPng } from './og-raster';
import { workerRateLimit, rateLimitResponse, callerIp } from './lib/worker-rate-limit';

const OG_LIMIT = 20;

const ASSET_ORIGIN = 'https://og-assets.internal';

/** Static fallback card per type (already in /public, 1200×630 PNG). */
const FALLBACK: Record<OgImageType, string> = {
  briefing: '/og-threatintel.png',
  blog: '/og-image.png',
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
  const matched = matchOgImagePath(url.pathname);
  if (!matched) return new Response('not found', { status: 404 });
  const { type, slug } = matched;

  const rl = await workerRateLimit('og', callerIp(request), OG_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  // v2: bumped when the OG card design changed (slate → navy) so previously
  // cached slate cards are not served after deploy. Bump on any card redesign.
  const cacheKey = new Request(`https://og-png.internal/v2/${type}/${slug}.png`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  // Global KV cache. The Cache-API entry above is per-colo, so a crawler in a
  // cold colo would otherwise re-run the resvg-wasm rasterisation — whose
  // cold-start (wasm instantiate + 2 font fetches + render) can exceed the
  // Worker CPU budget and return HTTP 503, which X/LinkedIn read as "no card"
  // (the isolate is killed before the static fallback can run). KV is global,
  // so once ANY colo has rendered the card, every colo serves these bytes with
  // one cheap read and zero rasterisation. Rewritten on every successful render.
  const kvKey = `og:png:v2:${type}:${slug}`;
  if (env.KV_CACHE) {
    const kvPng = (await env.KV_CACHE.get(kvKey, 'arrayBuffer').catch(() => null)) as ArrayBuffer | null;
    if (kvPng && kvPng.byteLength > 0) {
      const res = pngResponse(kvPng, true);
      // Warm the per-colo Cache-API too, so repeat crawls in this colo skip KV.
      ctx.waitUntil(caches.default.put(cacheKey, res.clone()).catch(() => {}));
      return res;
    }
  }

  try {
    const data = await loadOgData(env, type, slug);
    if (!data) return staticFallback(env, type);
    const png = await svgToPng(env, generateOgSvg(data));
    const res = pngResponse(png, true);
    ctx.waitUntil(caches.default.put(cacheKey, res.clone()).catch((e) => console.warn('og-cache put failed:', e)));
    // Publish to global KV so other colos serve it without re-rasterising.
    if (env.KV_CACHE) {
      ctx.waitUntil(
        env.KV_CACHE.put(kvKey, png as unknown as ArrayBuffer, { expirationTtl: OG_KV_TTL_SECONDS }).catch((e) =>
          console.warn('og-kv put failed:', e)
        )
      );
    }
    return res;
  } catch (err) {
    console.error('og-image render failed:', err instanceof Error ? err.message : String(err));
    return staticFallback(env, type);
  }
}

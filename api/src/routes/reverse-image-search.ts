/**
 * /api/v1/reverse-image-search — Generate reverse image search deep-links for
 * multiple engines. Accepts an image URL, validates it, and returns search URLs
 * for Google Lens, Yandex, TinEye, Bing, Baidu, SauceNAO, IQDB, and KarmaDecay.
 *
 * GET ?url=<image-url> → JSON with engine links + optional image metadata.
 */
import type { Context } from 'hono';
import type { Env } from '../env';

const CACHE_TTL = 3600;

interface EngineEntry {
  name: string;
  url: string;
  category: 'general' | 'anime' | 'social';
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildEngineUrls(imageUrl: string): EngineEntry[] {
  const e = encodeURIComponent(imageUrl);
  return [
    { name: 'Google Lens', url: `https://lens.google.com/uploadbyurl?url=${e}`, category: 'general' },
    { name: 'Yandex', url: `https://yandex.com/images/search?rpt=imageview&url=${e}`, category: 'general' },
    { name: 'TinEye', url: `https://tineye.com/search?url=${e}`, category: 'general' },
    {
      name: 'Bing Visual Search',
      url: `https://www.bing.com/images/search?view=detailv2&iss=SBI&form=SBIVSP&q=imgurl:${e}`,
      category: 'general',
    },
    {
      name: 'Baidu',
      url: `https://graph.baidu.com/details?isfromtus498=1&tn=pc&carousel=0&image=${e}`,
      category: 'general',
    },
    { name: 'SauceNAO', url: `https://saucenao.com/search.php?url=${e}`, category: 'anime' },
    { name: 'IQDB', url: `https://iqdb.org/?url=${e}`, category: 'anime' },
    { name: 'KarmaDecay', url: `https://karmadecay.com/search?q=${e}`, category: 'social' },
  ];
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function reverseImageSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const url = c.req.query('url');
  if (!url || !isValidHttpUrl(url)) {
    return c.json({ error: 'A valid HTTP/HTTPS image URL is required (query param: url)' }, 400);
  }

  const key = new Request(`https://ris.internal/v1/${await sha256Hex(url)}`);
  try {
    const cached = await caches.default.match(key);
    if (cached) {
      return c.json(await cached.json(), 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
    }
  } catch {}

  const engines = buildEngineUrls(url);
  const categories: Record<string, string[]> = {};
  for (const eng of engines) {
    (categories[eng.category] ??= []).push(eng.name);
  }

  let reachable = false;
  let contentType: string | undefined;
  let contentLength: number | undefined;

  try {
    const resp = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    reachable = resp.ok;
    contentType = resp.headers.get('content-type') ?? undefined;
    contentLength = resp.headers.get('content-length') ? Number(resp.headers.get('content-length')) : undefined;
  } catch {}

  const result = {
    input: { url, reachable, content_type: contentType, content_length: contentLength },
    engines,
    categories,
  };

  c.executionCtx.waitUntil(
    caches.default.put(
      key,
      new Response(JSON.stringify(result), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_TTL}` },
      })
    )
  );

  return c.json(result, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
}

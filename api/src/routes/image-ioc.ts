/**
 * /api/v1/image-ioc — extract IOCs from an image (URL or raw bytes).
 *
 * POST JSON: { url: string }   — fetches the image server-side
 * POST body:  raw image bytes  — sent as image/* content-type
 *
 * Returns: { text, hits: ImageIocHit[] } or { error }
 *
 * Bounded: 5MB max, 20s timeout. The vision model is best-effort; a
 * failure returns hits=[] with an error string, never throws.
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import { extractIocsFromImageBytes, extractIocsFromImageUrl } from '../lib/image-ioc-extract';
import { assertPublicHost, SsrfError } from '../lib/ssrf-guard';

export async function imageIocHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const contentType = c.req.header('content-type') ?? '';
  try {
    if (contentType.startsWith('image/')) {
      const ab = await c.req.arrayBuffer();
      const r = await extractIocsFromImageBytes(new Uint8Array(ab), c.env);
      return c.json(r, 200, { 'cache-control': 'no-store' });
    }
    // JSON body with a URL.
    let body: { url?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request', message: 'expected JSON {url} or image/* body' }, 400);
    }
    const url = typeof body.url === 'string' ? body.url : '';
    if (!url) return c.json({ error: 'bad_request', message: 'missing url' }, 400);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return c.json({ error: 'bad_request', message: 'invalid url' }, 400);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return c.json({ error: 'bad_request', message: 'only http/https allowed' }, 400);
    }
    // SSRF guard: refuse to fetch from private/reserved ranges or non-http
    // schemes. Defense-in-depth on top of the image-domain extraction.
    try {
      const check = await assertPublicHost(parsed.hostname);
      if (!check.ok) {
        return c.json({ error: 'forbidden', message: check.error ?? 'host rejected' }, 403);
      }
    } catch (e) {
      if (e instanceof SsrfError) {
        return c.json({ error: 'forbidden', message: e.message }, 403);
      }
      throw e;
    }
    const r = await extractIocsFromImageUrl(url, c.env);
    return c.json(r, 200, { 'cache-control': 'no-store' });
  } catch (e) {
    return c.json({ error: 'unhandled', message: e instanceof Error ? e.message : String(e) }, 500);
  }
}

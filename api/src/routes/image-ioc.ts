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
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, unauthorized, forbidden, tooManyRequests } from '../lib/api-error';
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
    } catch (_catchErr) {
      console.error('imageIocHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return badRequest(c, 'expected JSON {url} or image/* body');
    }
    const url = typeof body.url === 'string' ? body.url : '';
    if (!url) return badRequest(c, 'missing url');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (_catchErr) {
      console.error('imageIocHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return badRequest(c, 'invalid url');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return badRequest(c, 'only http/https allowed');
    }
    // SSRF guard: refuse to fetch from private/reserved ranges or non-http
    // schemes. Defense-in-depth on top of the image-domain extraction.
    try {
      const check = await assertPublicHost(parsed.hostname);
      if (!check.ok) {
        return forbidden(c, check.error ?? 'host rejected');
      }
    } catch (e) {
      console.error('handler failed:', e instanceof Error ? e.message : String(e));
      if (e instanceof SsrfError) {
        return forbidden(c, e.message);
      }
      throw e;
    }
    const r = await extractIocsFromImageUrl(url, c.env);
    return c.json(r, 200, { 'cache-control': 'no-store' });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e instanceof Error ? e.message : String(e));
  }
}

import { Context } from 'hono';
import type { Env } from '../env';

const FP_KV_PREFIX = 'phishing-fp:';
const MAX_HTML_BYTES = 512 * 1024;
const MAX_URLS_PER_FP = 20;

interface FingerprintRecord {
  hash: string;
  first_seen: string;
  last_seen: string;
  count: number;
  urls: string[];
}

export async function fetchPageHandler(ctx: Context<{ Bindings: Env }>): Promise<Response> {
  const body = (await ctx.req.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) return ctx.json({ error: 'missing url' }, 400);
  try {
    const res = await fetch(body.url, {
      method: 'GET',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; PhishingFingerprinter/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return ctx.json({ error: `upstream ${res.status}` }, 502);
    const text = await res.text();
    if (text.length > MAX_HTML_BYTES) {
      return ctx.json({ error: 'page too large' }, 413);
    }
    return ctx.json({ html: text, url: body.url, contentType: res.headers.get('content-type') ?? '' });
  } catch (err) {
    return ctx.json({ error: err instanceof Error ? err.message : 'fetch failed' }, 502);
  }
}

export async function fingerprintHandler(ctx: Context<{ Bindings: Env }>): Promise<Response> {
  const body = (await ctx.req.json().catch(() => null)) as { hash?: string; url?: string } | null;
  if (!body?.hash) return ctx.json({ error: 'missing hash' }, 400);

  const key = `${FP_KV_PREFIX}${body.hash}`;
  const existing = await ctx.env.KV_CACHE.get(key, 'json').catch(() => null) as FingerprintRecord | null;

  if (existing) {
    const updated: FingerprintRecord = {
      ...existing,
      last_seen: new Date().toISOString(),
      count: existing.count + 1,
      urls: body.url && !existing.urls.includes(body.url)
        ? [...existing.urls, body.url].slice(-MAX_URLS_PER_FP)
        : existing.urls,
    };
    await ctx.env.KV_CACHE.put(key, JSON.stringify(updated), { expirationTtl: 0 });
    return ctx.json({
      match: true,
      first_seen: existing.first_seen,
      count: updated.count,
      urls: updated.urls.slice(-5),
    });
  }

  const record: FingerprintRecord = {
    hash: body.hash,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    count: 1,
    urls: body.url ? [body.url] : [],
  };
  await ctx.env.KV_CACHE.put(key, JSON.stringify(record), { expirationTtl: 0 });
  return ctx.json({ match: false, count: 1 });
}

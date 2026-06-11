import type { Context } from 'hono';
import type { Env } from '../env';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';
import { safeJsonBody } from '../lib/safe-body';
import { pinnedFetchFollow } from '../lib/ssrf-guard';
import { safeNullLog } from '../lib/safe-catch';

const FP_KV_PREFIX = 'phishing-fp:';
const MAX_HTML_BYTES = 512 * 1024;
const MAX_URLS_PER_FP = 20;
/** 30-day retention ceiling per dfir-improvement-goal.md hard constraint.
 *  Previously expirationTtl=0 (permanent) which violated the policy. */
const FP_TTL_SECONDS = 30 * 86400;

interface FingerprintRecord {
  hash: string;
  first_seen: string;
  last_seen: string;
  count: number;
  urls: string[];
}

export async function fetchPageHandler(ctx: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = await safeJsonBody<{ url?: string }>(ctx, { maxBytes: 4 * 1024, maxDepth: 4 });
  if ('error' in parsed) return parsed.error;
  if (!parsed.value.url) return ctx.json({ error: 'missing url' }, 400);
  const url = parsed.value.url;
  try {
    // pinnedFetchFollow: SSRF guard (rejects private/reserved/metadata IPs, pins the
    // resolved IP against rebinding) — the URL is fully attacker-controlled.
    // Browser-like headers so real targets (phishing kits, CDN/Cloudflare-fronted
    // sites) don't 403/429 a bot UA — the previous PhishingFingerprinter/1.0 UA
    // was why most real pages failed to fetch.
    const res = await pinnedFetchFollow(url, {
      method: 'GET',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return ctx.json({ error: `upstream ${res.status}` }, 502);
    const text = await res.text();
    if (text.length > MAX_HTML_BYTES) {
      return ctx.json({ error: 'page too large' }, 413);
    }
    return ctx.json({ html: text, url, contentType: res.headers.get('content-type') ?? '' });
  } catch (err) {
    return ctx.json({ error: err instanceof Error ? err.message : 'fetch failed' }, 502);
  }
}

export async function fingerprintHandler(ctx: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = await safeJsonBody<{ hash?: string; url?: string }>(ctx, { maxBytes: 4 * 1024, maxDepth: 4 });
  if ('error' in parsed) return parsed.error;
  if (!parsed.value.hash) return ctx.json({ error: 'missing hash' }, 400);
  const hash: string = parsed.value.hash;
  const url: string | undefined = parsed.value.url;

  if (!ctx.env.KV_CACHE) return ctx.json({ error: 'KV not available' }, 503);

  const key = `${FP_KV_PREFIX}${hash}`;
  const existing = (await safeNullLog('kv-get-phishing-fp', ctx.env.KV_CACHE.get(key, 'json'))) as FingerprintRecord | null;

  if (existing) {
    const updated: FingerprintRecord = {
      ...existing,
      last_seen: new Date().toISOString(),
      count: existing.count + 1,
      urls: url && !existing.urls.includes(url) ? [...existing.urls, url].slice(-MAX_URLS_PER_FP) : existing.urls,
    };
    // Debounce: skip KV write if we wrote this fingerprint recently (1h).
    // The in-memory `updated` still reflects the current request for the
    // response, but we avoid burning KV write quota on high-frequency
    // submissions of the same kit.
    if (await shouldWriteLastGood(`phishing-fp:${hash}`, 3600)) {
      await ctx.env.KV_CACHE.put(key, JSON.stringify(updated), { expirationTtl: FP_TTL_SECONDS });
    }
    return ctx.json({
      match: true,
      first_seen: existing.first_seen,
      count: updated.count,
      urls: updated.urls.slice(-5),
    });
  }

  const record: FingerprintRecord = {
    hash,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    count: 1,
    urls: url ? [url] : [],
  };
  await ctx.env.KV_CACHE.put(key, JSON.stringify(record), { expirationTtl: FP_TTL_SECONDS });
  return ctx.json({ match: false, count: 1 });
}

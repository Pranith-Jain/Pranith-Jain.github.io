import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';
import { safeNullLog } from '../lib/safe-catch';

/**
 * Google-Dorks proxy backed by SerpAPI.
 *
 * GET /api/v1/google-dorks?q=<query>&num=<10..50>
 *   → { results: [{ title, link, snippet, displayed_link }], total, query }
 *
 * Why proxy:
 *   - Keeps SERPAPI_API_KEY off the client.
 *   - Edge-caches identical queries for an hour (SerpAPI quota is real money
 *     once past the free 100/mo tier; analyst dorking is bursty + repeat-heavy).
 *   - SSRF / abuse guards: `q` is length-capped and tag-stripped before send.
 *
 * Defensive boundary: the route just relays Google results. It does NOT
 * fetch the result pages or render embedded content — the analyst follows
 * the link themselves. This avoids the proxy becoming a content-laundering
 * surface for whatever the dork happens to hit.
 */

const SERPAPI_URL = 'https://serpapi.com/search.json';
const MAX_QUERY_LEN = 256;
const DEFAULT_NUM = 10;
const MAX_NUM = 50;
const CACHE_TTL_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 8000;

interface SerpOrganicResult {
  position?: number;
  title?: string;
  link?: string;
  displayed_link?: string;
  snippet?: string;
  date?: string;
}

interface SerpResponse {
  organic_results?: SerpOrganicResult[];
  search_information?: {
    total_results?: number;
    query_displayed?: string;
  };
  error?: string;
}

interface DorkResult {
  title: string;
  link: string;
  displayedLink: string;
  snippet: string;
  date?: string;
  position?: number;
}

function jsonResponse<T>(c: Context<{ Bindings: Env }>, body: T, status = 200, cacheSeconds = 0): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (cacheSeconds > 0) headers['cache-control'] = `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`;
  else headers['cache-control'] = 'no-store';
  return new Response(JSON.stringify(body), { status, headers });
}

function sanitizeQuery(raw: string): string {
  // Strip HTML-y characters that could only be there by mistake. Dork
  // operators (`site:`, `inurl:`, `intext:`, `filetype:`, `intitle:`) are
  // plain ASCII so trimming the dangerous symbol set doesn't kill them.
  return raw.replace(/[<>]/g, '').trim();
}

function cacheKeyFor(query: string, num: number): Request {
  return new Request(`https://serpapi-cache.internal/v1?q=${encodeURIComponent(query)}&n=${num}`);
}

export async function googleDorksHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const key = c.env.SERPAPI_API_KEY;
  if (!key) {
    return jsonResponse(
      c,
      {
        error: 'serpapi_not_configured',
        message:
          'Set the SERPAPI_API_KEY worker secret to enable the Google-Dorks tool. Free tier: 100 searches/mo at https://serpapi.com.',
      },
      503
    );
  }

  const raw = (c.req.query('q') ?? '').trim();
  if (!raw) return jsonResponse(c, { error: 'missing_query', hint: 'pass ?q=<query>' }, 400);
  if (raw.length > MAX_QUERY_LEN) {
    return jsonResponse(c, { error: 'query_too_long', limit: MAX_QUERY_LEN }, 413);
  }
  const query = sanitizeQuery(raw);
  if (!query) return jsonResponse(c, { error: 'empty_query_after_sanitize' }, 400);

  const numRaw = Number.parseInt(c.req.query('num') ?? '', 10);
  const num = Number.isFinite(numRaw) ? Math.min(MAX_NUM, Math.max(1, numRaw)) : DEFAULT_NUM;

  // Edge-cache lookup. Identical (query, num) pairs reuse the same response
  // for an hour — analysts dorking the same operator over and over don't
  // burn SerpAPI quota each time.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = cacheKeyFor(query, num);
  const cached = await safeNullLog('cache-match-google-dorks', cache.match(cacheReq));
  if (cached) {
    try {
      const body = await cached.json();
      return jsonResponse(c, body, 200, CACHE_TTL_SECONDS);
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* fall through to fresh fetch */
    }
  }

  const url = new URL(SERPAPI_URL);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(num));
  // Force English-locale Google so result text is stable across runs.
  url.searchParams.set('hl', 'en');
  url.searchParams.set('api_key', key);

  let upstream: SerpResponse;
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'pranithjain.qzz.io DFIR' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 429) {
      return jsonResponse(c, { error: 'rate_limited', message: 'SerpAPI quota exhausted' }, 429);
    }
    if (!res.ok) {
      return jsonResponse(c, { error: `upstream_${res.status}` }, 502);
    }
    upstream = (await res.json()) as SerpResponse;
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return jsonResponse(
      c,
      { error: 'fetch_failed', detail: safeErrorMessage(c.env as unknown as Record<string, unknown>, err) },
      502
    );
  }

  if (upstream.error) {
    return jsonResponse(c, { error: 'serpapi_error', detail: upstream.error }, 502);
  }

  const results: DorkResult[] = (upstream.organic_results ?? []).map((r) => ({
    title: r.title ?? '',
    link: r.link ?? '',
    displayedLink: r.displayed_link ?? '',
    snippet: r.snippet ?? '',
    date: r.date,
    position: r.position,
  }));
  const body = {
    query,
    total: upstream.search_information?.total_results ?? results.length,
    results,
  };

  // Cache only non-empty successes so a transient empty doesn't get pinned.
  if (results.length > 0) {
    const toCache = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    c.executionCtx.waitUntil(safeNullLog('cache-put-google-dorks', cache.put(cacheReq, toCache)));
  }

  return jsonResponse(c, body, 200, CACHE_TTL_SECONDS);
}

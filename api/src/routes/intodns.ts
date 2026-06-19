/**
 * IntoDNS.ai snapshot route — wraps the free, public
 * https://intodns.ai/api/report/everything endpoint.
 *
 *   GET /api/v1/intodns/snapshot?domain=example.com
 *   GET /api/v1/intodns/snapshot?domain=example.com&format=markdown
 *
 * Why a dedicated route (not just another provider in the IOC composite):
 * IntoDNS's Everything Report is a *static-audit-evidence* tool — it
 * returns a single multi-section JSON or Markdown document with DNS
 * records, DNSSEC chain, SPF lookup graph, DKIM, DMARC, BIMI logo/VMC,
 * MTA-STS, SMTP STARTTLS certificate checks, FCrDNS, blacklists, sender
 * requirements, and preferred citation URLs. It's designed to be linked
 * from a ticket, audit, or LLM context — not to be averaged into a
 * composite risk score.
 *
 * Cache strategy: 6h KV TTL on the JSON form, 6h on the Markdown form.
 * Email-auth posture changes slowly; the upstream itself uses 10-minute
 * request deduplication for the expensive `/csp/scan` (we don't call
 * that route — it's POST and crawls up to 20 pages). For the
 * `/report/everything` read path, 6h is the right balance between
 * freshness and abuse-protection budget.
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, badGateway } from '../lib/api-error';

const UPSTREAM_BASE = 'https://intodns.ai/api';
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h
const FETCH_TIMEOUT_MS = 10_000;

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

interface CachedSnapshot {
  fetchedAt: string;
  domain: string;
  format: 'json' | 'markdown';
  body: string;
  source: string;
  upstreamStatus: number;
}

export async function intodnsSnapshotHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = c.req.query('domain')?.trim().toLowerCase();
  if (!raw) return badRequest(c, 'domain is required');
  if (!DOMAIN_RE.test(raw)) return badRequest(c, 'invalid domain');

  const format = c.req.query('format') === 'markdown' ? 'markdown' : 'json';

  const cacheKey = `intodns:snapshot:v1:${format}:${raw}`;
  const kv = c.env.KV_CACHE;
  if (kv) {
    try {
      const cached = (await kv.get(cacheKey, 'json')) as CachedSnapshot | null;
      if (cached && cached.body) {
        const headers = new Headers({
          'Cache-Control': `public, max-age=3600`,
          'X-Intodns-Cache': 'hit',
          'X-Intodns-Domain': cached.domain,
        });
        headers.set(
          'Content-Type',
          format === 'markdown' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8'
        );
        return new Response(cached.body, { status: 200, headers });
      }
    } catch {
      // Cache miss / corruption is non-fatal — fall through to upstream.
    }
  }

  const url =
    format === 'markdown'
      ? `${UPSTREAM_BASE}/report/everything?domain=${encodeURIComponent(raw)}&format=markdown`
      : `${UPSTREAM_BASE}/report/everything?domain=${encodeURIComponent(raw)}`;

  const headers: Record<string, string> = {
    Accept: format === 'markdown' ? 'text/markdown, text/plain;q=0.9, */*;q=0.5' : 'application/json',
    'User-Agent': 'pranithjain.qzz.io DFIR toolkit (+intodns.ai snapshot route)',
  };
  const key = c.env.INTODNS_API_KEY;
  if (key) headers['Authorization'] = `Bearer ${key}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return c.json(
      {
        error: 'intodns upstream fetch failed',
        detail: err instanceof Error ? err.message : String(err),
        domain: raw,
        citation: 'https://intodns.ai/methodology',
      },
      502
    );
  }

  if (res.status === 429) {
    // Honor Retry-After; surface it back to the client and skip caching
    // so a follow-up call retries the upstream instead of seeing a stale 429.
    const retry = res.headers.get('Retry-After') ?? '60';
    return c.json(
      {
        error: 'intodns rate-limited',
        domain: raw,
        retryAfterSeconds: Number(retry) || 60,
        citation: 'https://intodns.ai/api-docs',
      },
      429,
      { 'Retry-After': retry }
    );
  }

  if (!res.ok) {
    return badGateway(c, `intodns upstream returned ${res.status}`);
  }

  const body = await res.text();

  if (kv) {
    try {
      const payload: CachedSnapshot = {
        fetchedAt: new Date().toISOString(),
        domain: raw,
        format,
        body,
        source: 'intodns.ai',
        upstreamStatus: res.status,
      };
      await kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: CACHE_TTL_SECONDS });
    } catch {
      // KV write failure is non-fatal — we still serve the fresh response.
    }
  }

  const responseHeaders = new Headers({
    'Cache-Control': 'public, max-age=3600',
    'X-Intodns-Cache': 'miss',
    'X-Intodns-Domain': raw,
  });
  responseHeaders.set(
    'Content-Type',
    format === 'markdown' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8'
  );
  return new Response(body, { status: 200, headers: responseHeaders });
}

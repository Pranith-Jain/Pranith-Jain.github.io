/**
 * IntoDNS.ai specialist endpoint passthroughs.
 *
 * Each handler is a thin wrapper around a single intodns.ai endpoint that
 * adds: input validation, KV caching, structured error responses, and the
 * canonical citation URLs the LLM doc recommends surfacing.
 *
 * Endpoints wrapped (all public, no key required):
 *   GET /api/v1/intodns/blacklist             -> /api/email/blacklist
 *   GET /api/v1/intodns/sender-requirements   -> /api/email/sender-requirements
 *   GET /api/v1/intodns/smtp-tls              -> /api/email/smtp-tls
 *   GET /api/v1/intodns/fcrdns                -> /api/email/fcrdns
 *   GET /api/v1/intodns/dnssec                -> /api/dns/dnssec
 *   GET /api/v1/intodns/sec-headers           -> /api/security-headers/analyze
 *   GET /api/v1/intodns/badge                 -> /api/badge/{domain}  (SVG)
 *   POST /api/v1/intodns/debug-email          -> /api/debug-email      (raw MIME)
 *
 * Caching strategy: 1h TTL on JSON responses (these are check-result
 * signals, not full reports — shorter freshness than the 6h snapshot
 * is appropriate). The badge SVG is cached 24h (it's an at-a-glance
 * mark, not actionable data). The debug-email response is NOT cached
 * (each paste is one-off and the LLM score for a fixed .eml won't
 * change, but caching by hash would require a second pass; keep it
 * simple for now).
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, badGateway } from '../lib/api-error';

const UPSTREAM_BASE = 'https://intodns.ai/api';
const CACHE_TTL_SECONDS = 60 * 60; // 1h
const BADGE_TTL_SECONDS = 24 * 60 * 60; // 24h
const FETCH_TIMEOUT_MS = 10_000;

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

interface CachedJson {
  fetchedAt: string;
  domain: string;
  endpoint: string;
  body: string;
  upstreamStatus: number;
}

interface CachedBadge {
  fetchedAt: string;
  domain: string;
  body: string; // SVG
  upstreamStatus: number;
}

function authHeaders(env: Env, accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'pranithjain.qzz.io DFIR toolkit (+intodns.ai specialist route)',
  };
  if (env.INTODNS_API_KEY) headers['Authorization'] = `Bearer ${env.INTODNS_API_KEY}`;
  return headers;
}

function handleUpstreamError(c: Context<{ Bindings: Env }>, err: unknown, domain: string): Response {
  return c.json(
    {
      error: 'intodns upstream fetch failed',
      detail: err instanceof Error ? err.message : String(err),
      domain,
      citation: 'https://intodns.ai/methodology',
    },
    502
  );
}

function handleRateLimit(c: Context<{ Bindings: Env }>, res: Response, domain: string): Response {
  const retry = res.headers.get('Retry-After') ?? '60';
  return c.json(
    {
      error: 'intodns rate-limited',
      domain,
      retryAfterSeconds: Number(retry) || 60,
      citation: 'https://intodns.ai/api-docs',
    },
    429,
    { 'Retry-After': retry }
  );
}

async function cachedJsonFetch(
  c: Context<{ Bindings: Env }>,
  cacheKey: string,
  upstreamPath: string,
  domain: string,
  endpointTag: string
): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (kv) {
    try {
      const cached = (await kv.get(cacheKey, 'json')) as CachedJson | null;
      if (cached && cached.body) {
        return c.json(JSON.parse(cached.body), 200, {
          'Cache-Control': 'public, max-age=3600',
          'X-Intodns-Cache': 'hit',
          'X-Intodns-Domain': cached.domain,
          'X-Intodns-Endpoint': endpointTag,
        });
      }
    } catch {
      // fall through
    }
  }

  const url = `${UPSTREAM_BASE}${upstreamPath}${upstreamPath.includes('?') ? '&' : '?'}domain=${encodeURIComponent(domain)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: authHeaders(c.env, 'application/json'),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return handleUpstreamError(c, err, domain);
  }

  if (res.status === 429) return handleRateLimit(c, res, domain);
  if (!res.ok) return badGateway(c, `intodns upstream returned ${res.status}`);

  const body = await res.text();
  if (kv) {
    try {
      const payload: CachedJson = {
        fetchedAt: new Date().toISOString(),
        domain,
        endpoint: endpointTag,
        body,
        upstreamStatus: res.status,
      };
      await kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: CACHE_TTL_SECONDS });
    } catch {
      // non-fatal
    }
  }

  try {
    return c.json(JSON.parse(body), 200, {
      'Cache-Control': 'public, max-age=3600',
      'X-Intodns-Cache': 'miss',
      'X-Intodns-Domain': domain,
      'X-Intodns-Endpoint': endpointTag,
    });
  } catch {
    // Upstream returned non-JSON; pass it through with a content-type set
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Intodns-Cache': 'miss',
        'X-Intodns-Domain': domain,
      },
    });
  }
}

function validateDomain(c: Context<{ Bindings: Env }>): { domain: string } | Response {
  const raw = c.req.query('domain')?.trim().toLowerCase();
  if (!raw) return badRequest(c, 'domain is required');
  if (!DOMAIN_RE.test(raw)) return badRequest(c, 'invalid domain');
  return { domain: raw };
}

// ── Blacklist (DNSBL rollup per mail server) ─────────────────────────────

export async function intodnsBlacklistHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const v = validateDomain(c);
  if (v instanceof Response) return v;
  return cachedJsonFetch(c, `intodns:blacklist:v1:${v.domain}`, '/email/blacklist', v.domain, 'blacklist');
}

// ── Sender requirements (Google/Yahoo/MS compliance) ──────────────────────

export async function intodnsSenderRequirementsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const v = validateDomain(c);
  if (v instanceof Response) return v;
  return cachedJsonFetch(
    c,
    `intodns:sender-requirements:v1:${v.domain}`,
    '/email/sender-requirements',
    v.domain,
    'sender-requirements'
  );
}

// ── SMTP STARTTLS certificate checks ─────────────────────────────────────

export async function intodnsSmtpTlsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const v = validateDomain(c);
  if (v instanceof Response) return v;
  return cachedJsonFetch(c, `intodns:smtp-tls:v1:${v.domain}`, '/email/smtp-tls', v.domain, 'smtp-tls');
}

// ── FCrDNS (PTR + forward-confirmation for mail servers) ─────────────────

export async function intodnsFcrdnsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const v = validateDomain(c);
  if (v instanceof Response) return v;
  return cachedJsonFetch(c, `intodns:fcrdns:v1:${v.domain}`, '/email/fcrdns', v.domain, 'fcrdns');
}

// ── DNSSEC chain validation ──────────────────────────────────────────────

export async function intodnsDnssecHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const v = validateDomain(c);
  if (v instanceof Response) return v;
  return cachedJsonFetch(c, `intodns:dnssec:v1:${v.domain}`, '/dns/dnssec', v.domain, 'dnssec');
}

// ── Security headers (live third-party HSTS/CSP/etc. scan) ──────────────

export async function intodnsSecHeadersHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const v = validateDomain(c);
  if (v instanceof Response) return v;
  return cachedJsonFetch(c, `intodns:sec-headers:v1:${v.domain}`, '/security-headers/analyze', v.domain, 'sec-headers');
}

// ── Badge (SVG inline) ───────────────────────────────────────────────────

export async function intodnsBadgeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const v = validateDomain(c);
  if (v instanceof Response) return v;

  const cacheKey = `intodns:badge:v1:${v.domain}`;
  const kv = c.env.KV_CACHE;
  if (kv) {
    try {
      const cached = (await kv.get(cacheKey, 'json')) as CachedBadge | null;
      if (cached && cached.body) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
            'X-Intodns-Cache': 'hit',
            'X-Intodns-Domain': cached.domain,
          },
        });
      }
    } catch {
      // fall through
    }
  }

  const url = `${UPSTREAM_BASE}/badge/${encodeURIComponent(v.domain)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: authHeaders(c.env, 'image/svg+xml, image/*;q=0.9, */*;q=0.5'),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return handleUpstreamError(c, err, v.domain);
  }
  if (res.status === 429) return handleRateLimit(c, res, v.domain);
  if (!res.ok) return badGateway(c, `intodns upstream returned ${res.status}`);

  const body = await res.text();
  if (kv) {
    try {
      const payload: CachedBadge = {
        fetchedAt: new Date().toISOString(),
        domain: v.domain,
        body,
        upstreamStatus: res.status,
      };
      await kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: BADGE_TTL_SECONDS });
    } catch {
      // non-fatal
    }
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'X-Intodns-Cache': 'miss',
      'X-Intodns-Domain': v.domain,
    },
  });
}

// ── Debug-email (raw MIME → spam score + alignment + suggestions) ────────

const MAX_EMAIL_BYTES = 256 * 1024; // 256 KB raw MIME; intodns has its own limit

export async function intodnsDebugEmailHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // POST with raw_email in JSON body OR text/plain. We support both:
  //   { "raw_email": "..." } JSON
  //   "..."          text/plain
  const contentType = c.req.header('content-type') ?? '';
  let rawEmail = '';

  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return badRequest(c, 'invalid JSON body');
    }
    if (typeof body !== 'object' || body === null) return badRequest(c, 'expected object with raw_email');
    const obj = body as { raw_email?: unknown; rawEmail?: unknown };
    const candidate = (obj.raw_email ?? obj.rawEmail) as unknown;
    if (typeof candidate !== 'string') return badRequest(c, 'raw_email string is required');
    rawEmail = candidate;
  } else {
    rawEmail = (await c.req.text()) ?? '';
  }

  rawEmail = rawEmail.trim();
  if (!rawEmail) return badRequest(c, 'raw email source is required');
  if (rawEmail.length > MAX_EMAIL_BYTES) {
    return badRequest(c, `raw email too large (max ${MAX_EMAIL_BYTES} bytes)`);
  }

  // POST to intodns
  const url = `${UPSTREAM_BASE}/debug-email`;
  const payload = JSON.stringify({ raw_email: rawEmail });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(c.env, 'application/json'), 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(15_000), // longer for the LLM scoring inside intodns
    });
  } catch (err) {
    return c.json(
      {
        error: 'intodns upstream fetch failed',
        detail: err instanceof Error ? err.message : String(err),
        citation: 'https://intodns.ai/api-docs',
      },
      502
    );
  }
  if (res.status === 429) {
    const retry = res.headers.get('Retry-After') ?? '60';
    return c.json(
      {
        error: 'intodns rate-limited',
        retryAfterSeconds: Number(retry) || 60,
        citation: 'https://intodns.ai/api-docs',
      },
      429,
      { 'Retry-After': retry }
    );
  }
  if (!res.ok) return badGateway(c, `intodns upstream returned ${res.status}`);

  const body = await res.text();
  try {
    return c.json(JSON.parse(body), 200, {
      'Cache-Control': 'no-store',
      'X-Intodns-Endpoint': 'debug-email',
    });
  } catch {
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

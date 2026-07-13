import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';
import { safeNullLog } from '../lib/safe-catch';
import { emailrep } from '../providers/emailrep';

/**
 * Lightweight emailrep.io proxy for the /dfir/email-rep page.
 *
 * `/api/v1/ioc?indicator=<email>` already runs emailrep, but it ALSO fans
 * out to ~25 other providers — overkill when the page just wants the one
 * reputation signal. This route calls the emailrep provider directly,
 * caches the result, and returns a slim shape the React component reads.
 *
 * `EMAILREP_API_KEY` is required (the anonymous tier 429s instantly from
 * shared Worker egress IPs — see `api/src/providers/emailrep.ts`). Without
 * the key the provider returns `unsupported` and we surface a 503 with
 * a "key not configured" message so the UI can render an actionable hint
 * rather than silently failing.
 */

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const CACHE_TTL_SECONDS = 1800; // 30 min — reputation is stable but not static

interface EmailRepResponse {
  ok: boolean;
  email?: string;
  cached?: boolean;
  reputation?: 'high' | 'medium' | 'low' | 'unknown';
  verdict?: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  score?: number;
  tags?: string[];
  references?: number;
  details?: Record<string, unknown>;
  error?: string;
}

function jsonResponse<T>(c: Context<{ Bindings: Env }>, body: T, status = 200, cacheSeconds = 0): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (cacheSeconds > 0) headers['cache-control'] = `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`;
  else headers['cache-control'] = 'no-store';
  return new Response(JSON.stringify(body), { status, headers });
}

export async function emailRepHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = (c.req.query('email') ?? '').trim().toLowerCase();
  if (!raw) return jsonResponse(c, { ok: false, error: 'missing_email' }, 400);
  if (raw.length > 254 || !EMAIL_RE.test(raw)) {
    return jsonResponse(c, { ok: false, error: 'invalid_email' }, 400);
  }

  if (!c.env.EMAILREP_API_KEY) {
    return jsonResponse(
      c,
      {
        ok: false,
        error: 'emailrep_not_configured',
        details: {
          message:
            'Set the EMAILREP_API_KEY Worker secret (get a free one at https://emailrep.io). ' +
            "EmailRep's anonymous tier is rate-limited per source IP and Cloudflare's shared egress " +
            'gets 429-blocked within seconds, so the key is effectively required for prod use.',
        },
      },
      503
    );
  }

  // Edge-cache by email — reputation is mostly stable; emailrep itself
  // caches their analysis longer than 30 min internally.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(`https://email-rep-cache.internal/v1?e=${encodeURIComponent(raw)}`);
  const cached = await safeNullLog('cache-match-emailrep', cache.match(cacheReq));
  if (cached) {
    try {
      const body = (await cached.json()) as EmailRepResponse;
      return jsonResponse(c, { ...body, cached: true }, 200, CACHE_TTL_SECONDS);
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* corrupt cache entry — fall through */
    }
  }

  // Provider expects the project-wide ProviderEnv shape; fill missing
  // optional keys with empty strings (same convention as other routes).
  const provEnv = {
    VT_API_KEY: c.env.VT_API_KEY ?? '',
    ABUSEIPDB_API_KEY: c.env.ABUSEIPDB_API_KEY ?? '',
    SHODAN_API_KEY: c.env.SHODAN_API_KEY ?? '',
    CENSYS_PAT: c.env.CENSYS_PAT ?? '',
    CENSYS_ORG_ID: c.env.CENSYS_ORG_ID ?? '',
    NETLAS_API_KEY: c.env.NETLAS_API_KEY ?? '',
    OTX_API_KEY: c.env.OTX_API_KEY ?? '',
    URLSCAN_API_KEY: c.env.URLSCAN_API_KEY ?? '',
    HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY ?? '',
    ABUSECH_AUTH_KEY: c.env.ABUSECH_AUTH_KEY,
    EMAILREP_API_KEY: c.env.EMAILREP_API_KEY,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const result = await emailrep({ type: 'email', value: raw }, provEnv as never, ctrl.signal);
    if (result.status !== 'ok') {
      return jsonResponse(
        c,
        {
          ok: false,
          email: raw,
          error: result.error ?? `emailrep ${result.status}`,
        },
        result.status === 'error' ? 502 : 200
      );
    }
    const summary = result.raw_summary as {
      reputation?: string;
      references?: number;
      domain_exists?: boolean;
      free_provider?: boolean;
      disposable?: boolean;
      deliverable?: boolean;
      first_seen?: string;
      last_seen?: string;
    };
    const body: EmailRepResponse = {
      ok: true,
      email: raw,
      reputation: (summary.reputation ?? 'unknown') as EmailRepResponse['reputation'],
      verdict: result.verdict,
      score: result.score,
      tags: result.tags,
      references: summary.references ?? 0,
      details: summary,
    };

    // Cache only successful calls; failures should be retried on next render.
    const toCache = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    c.executionCtx.waitUntil(safeNullLog('cache-put-emailrep', cache.put(cacheReq, toCache)));
    return jsonResponse(c, body, 200, CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return jsonResponse(
      c,
      {
        ok: false,
        email: raw,
        error: safeErrorMessage(c.env as unknown as Record<string, unknown>, err),
      },
      502
    );
  } finally {
    clearTimeout(timer);
  }
}

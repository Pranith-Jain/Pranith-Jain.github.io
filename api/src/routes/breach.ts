import type { Context } from 'hono';
import type { Env } from '../env';

const HIBP_RANGE = 'https://api.pwnedpasswords.com/range';
const UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';
const PREFIX_RE = /^[A-Fa-f0-9]{5}$/;

/**
 * Pwned Password k-anonymity proxy.
 *
 * Takes a 5-hex-character prefix of a SHA-1 password hash, queries the HIBP
 * Pwned Passwords range endpoint with `Add-Padding: true` so response sizes
 * can't leak whether a specific suffix matched, and returns the upstream
 * text/plain body unchanged.
 *
 * The user's password never reaches this Worker — only the first 5 chars of
 * its SHA-1 hash. Hashing happens in the browser.
 *
 * Free, no auth required by HIBP.
 */
export async function breachRangeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const prefix = c.req.query('prefix');
  if (!prefix) {
    return c.json({ error: 'missing_param' }, 400, { 'Cache-Control': 'no-store' });
  }
  if (!PREFIX_RE.test(prefix)) {
    return c.json({ error: 'invalid_prefix' }, 400, { 'Cache-Control': 'no-store' });
  }

  try {
    const upstream = await fetch(`${HIBP_RANGE}/${prefix.toUpperCase()}`, {
      headers: {
        'user-agent': UA,
        'Add-Padding': 'true',
        accept: 'text/plain',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return c.json({ error: `upstream_${upstream.status}` }, 502, {
        'Cache-Control': 'no-store',
      });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return c.json({ error: 'upstream_error' }, 502, {
      'Cache-Control': 'no-store',
    });
  }
}

import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, unauthorized, conflict, payloadTooLarge } from '../lib/api-error';

export async function identityProxyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const platform = c.req.query('platform');
  const username = c.req.query('username');
  if (!platform || !username)
    return badRequest(c, 'missing platform or username');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(username))
    return badRequest(c, 'invalid username format');

  const TIMEOUT = 8_000;
  const MAX_BODY = 64 * 1024;

  try {
    if (platform === 'lobsters') {
      const res = await fetch(`https://lobste.rs/~${encodeURIComponent(username)}.json`, {
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!res.ok) return c.json(null);
      const text = await res.text();
      if (text.length > MAX_BODY)
        return badGateway(c, 'upstream response too large');
      const data = JSON.parse(text);
      return c.json(data);
    }

    if (platform === 'reddit') {
      const res = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
        headers: { 'User-Agent': 'web_identity_lookup:1.0 (by /u/pranith)' },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!res.ok) return c.json(null);
      const text = await res.text();
      if (text.length > MAX_BODY)
        return badGateway(c, 'upstream response too large');
      const data = JSON.parse(text);
      return c.json(data);
    }

    return c.json(null);
  } catch (e) {
    logError('handler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'upstream fetch failed');
  }
}

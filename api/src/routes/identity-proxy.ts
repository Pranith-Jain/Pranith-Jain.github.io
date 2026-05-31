import type { Context } from 'hono';
import type { Env } from '../env';

export async function identityProxyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const platform = c.req.query('platform');
  const username = c.req.query('username');
  if (!platform || !username) return c.json({ error: 'missing platform or username' }, 400);

  const TIMEOUT = 8_000;

  if (platform === 'lobsters') {
    const res = await fetch(`https://lobste.rs/~${encodeURIComponent(username)}.json`, {
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return c.json(null);
    const data = await res.json();
    return c.json(data);
  }

  if (platform === 'reddit') {
    const res = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
      headers: { 'User-Agent': 'web_identity_lookup:1.0 (by /u/pranith)' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return c.json(null);
    const data = await res.json();
    return c.json(data);
  }

  return c.json(null);
}

import type { Context } from 'hono';
import type { Env } from '../env';

export async function identityProxyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const platform = c.req.query('platform');
  const username = c.req.query('username');
  if (!platform || !username) return c.json({ error: 'missing platform or username' }, 400);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(username)) return c.json({ error: 'invalid username format' }, 400);

  const TIMEOUT = 8_000;
  const MAX_BODY = 64 * 1024;

  try {
    if (platform === 'lobsters') {
      const res = await fetch(`https://lobste.rs/~${encodeURIComponent(username)}.json`, {
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!res.ok) return c.json(null);
      const text = await res.text();
      if (text.length > MAX_BODY) return c.json({ error: 'upstream response too large' }, 502);
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
      if (text.length > MAX_BODY) return c.json({ error: 'upstream response too large' }, 502);
      const data = JSON.parse(text);
      return c.json(data);
    }

    return c.json(null);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'upstream fetch failed' }, 502, {
      'Cache-Control': 'no-store',
    });
  }
}

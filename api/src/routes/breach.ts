import type { Context } from 'hono';
import type { Env } from '../env';

const PREFIX_RE = /^[A-Fa-f0-9]{5}$/;

export async function breachRangeHandler(c: Context<{ Bindings: Env }>) {
  const prefix = c.req.query('prefix');

  if (!prefix) {
    return c.json({ error: 'missing_param', message: 'Provide ?prefix=<5-hex-chars>' }, 400);
  }

  if (!PREFIX_RE.test(prefix)) {
    return c.json({ error: 'invalid_prefix', message: 'prefix must be exactly 5 hexadecimal characters' }, 400);
  }

  const upstream = await fetch(`https://api.pwnedpasswords.com/range/${prefix.toUpperCase()}`, {
    headers: {
      'User-Agent': 'pranithjain-dfir/1.0 (+https://pranithjain.qzz.io)',
      'Add-Padding': 'true',
    },
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return c.json({ error: 'upstream_error', message: 'Could not reach HIBP API' }, 502);
  }

  const text = await upstream.text();

  return c.body(text, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
}

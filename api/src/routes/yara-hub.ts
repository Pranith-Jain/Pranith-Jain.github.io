import type { Context } from 'hono';

interface Env {
  ABUSECH_AUTH_KEY?: string;
}

const YARAIFY_API = 'https://yaraify-api.abuse.ch/api/v1/';

export async function yaraHubListHandler(c: Context<{ Bindings: Env }>) {
  const authKey = c.env.ABUSECH_AUTH_KEY;
  if (!authKey) {
    return c.json({ error: 'ABUSECH_AUTH_KEY not configured on the server' }, 503, { 'Cache-Control': 'no-store' });
  }

  const resultMax = Math.min(Math.max(1, Number(c.req.query('max')) || 100), 300);

  try {
    const res = await fetch(YARAIFY_API, {
      method: 'POST',
      headers: {
        'Auth-Key': authKey,
        'Content-Type': 'application/json',
      },
      // YARAify is community-hosted — be generous on the ceiling. 15s
      // matches the other upstream-bound calls in this file.
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ query: 'recent_yararules', result_max: resultMax }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return c.json({ error: `YARAify API returned ${res.status}: ${text.slice(0, 200)}` }, 502);
    }

    const data = await res.json();
    return c.json(data);
  } catch (err) {
    console.error('yaraHubListHandler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: String(err) }, 500, { 'Cache-Control': 'no-store' });
  }
}

export async function yaraHubRuleHandler(c: Context<{ Bindings: Env }>) {
  const authKey = c.env.ABUSECH_AUTH_KEY;
  if (!authKey) {
    return c.json({ error: 'ABUSECH_AUTH_KEY not configured on the server' }, 503, { 'Cache-Control': 'no-store' });
  }

  const uuid = c.req.param('uuid');
  if (!uuid) {
    return c.json({ error: 'Rule UUID is required' }, 400, { 'Cache-Control': 'no-store' });
  }

  try {
    const res = await fetch(YARAIFY_API, {
      method: 'POST',
      headers: {
        'Auth-Key': authKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        query: 'get_yara_rule',
        uuid,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return c.json({ error: `YARAify rule fetch returned ${res.status}: ${text.slice(0, 200)}` }, 502);
    }

    const text = await res.text();
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) {
      return c.json(JSON.parse(text));
    }
    return c.text(text, 200, { 'content-type': 'text/plain; charset=utf-8' });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: String(err) }, 500, { 'Cache-Control': 'no-store' });
  }
}

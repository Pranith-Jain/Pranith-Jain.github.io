import type { Context } from 'hono';

interface Env {
  ABUSECH_AUTH_KEY?: string;
}

const YARAIFY_API = 'https://yaraify-api.abuse.ch/api/v1/';

export async function yaraHubListHandler(c: Context<{ Bindings: Env }>) {
  const authKey = c.env.ABUSECH_AUTH_KEY;
  if (!authKey) {
    return c.json({ error: 'ABUSECH_AUTH_KEY not configured on the server' }, 503);
  }

  const resultMax = Math.min(Math.max(1, Number(c.req.query('max')) || 100), 300);

  try {
    const res = await fetch(YARAIFY_API, {
      method: 'POST',
      headers: {
        'Auth-Key': authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'get_recent_yara_rules', result_max: resultMax }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return c.json({ error: `YARAify API returned ${res.status}: ${text.slice(0, 200)}` }, 502);
    }

    const data = await res.json();
    return c.json(data);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
}

export async function yaraHubRuleHandler(c: Context<{ Bindings: Env }>) {
  const authKey = c.env.ABUSECH_AUTH_KEY;
  if (!authKey) {
    return c.json({ error: 'ABUSECH_AUTH_KEY not configured on the server' }, 503);
  }

  const ruleName = c.req.param('name');
  if (!ruleName) {
    return c.json({ error: 'Rule name is required' }, 400);
  }

  try {
    const res = await fetch(YARAIFY_API, {
      method: 'POST',
      headers: {
        'Auth-Key': authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'get_yara_rule',
        search_term: ruleName,
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
    return c.json({ error: String(err) }, 500);
  }
}

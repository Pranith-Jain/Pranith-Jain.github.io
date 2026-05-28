import type { Context } from 'hono';
import type { Env } from '../env';

export async function mispProxyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const { baseUrl, apiKey, endpoint, params } = await c.req.json<{
    baseUrl: string;
    apiKey: string;
    endpoint: string;
    params?: Record<string, string>;
  }>();

  if (!baseUrl || !apiKey || !endpoint) {
    return c.json({ error: 'missing baseUrl, apiKey, or endpoint' }, 400);
  }

  let url = `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
      'User-Agent': 'pranithjain-portfolio/1.0',
    },
    signal: AbortSignal.timeout(15000),
  });

  const body = await response.json();
  return c.json(body, response.ok ? 200 : 502, {
    'cache-control': 'no-store',
  });
}

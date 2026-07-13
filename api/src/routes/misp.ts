import type { Context } from 'hono';
import type { Env } from '../env';
import { pinnedFetch, SsrfError } from '../lib/ssrf-guard';
import { safeNull } from '../lib/safe-catch';

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

  // baseUrl is fully user-controlled and the response body is reflected back to
  // the caller — a classic SSRF sink. Force https and route through pinnedFetch,
  // which validates the host (rejecting private/reserved/metadata IPs) and pins
  // the connection to the validated IP to defeat DNS rebinding.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (_catchErr) {
    console.error('mispProxyHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'invalid baseUrl/endpoint' }, 400);
  }
  if (parsed.protocol !== 'https:') {
    return c.json({ error: 'baseUrl must use https' }, 400);
  }

  let response: Response;
  try {
    response = await pinnedFetch(parsed.toString(), {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
        'User-Agent': 'pranithjain-portfolio/1.0',
      },
      // Do NOT follow redirects: this request carries the user's MISP API key,
      // and a redirect (to any host) would both leak the key and reopen the
      // redirect-SSRF path. A MISP REST endpoint returns JSON directly; a 3xx
      // is anomalous and treated as a failure by the caller.
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    if (err instanceof SsrfError) {
      return c.json({ error: err.detail }, err.status as 400 | 403 | 502);
    }
    return c.json({ error: 'upstream fetch failed' }, 502);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    if (response.body) safeNull(response.body.cancel());
    return c.json({ error: 'MISP returned invalid JSON' }, 502, { 'cache-control': 'no-store' });
  }
  return c.json(body, response.ok ? 200 : 502, {
    'cache-control': 'no-store',
  });
}

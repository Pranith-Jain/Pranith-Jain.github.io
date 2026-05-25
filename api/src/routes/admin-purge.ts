/**
 * Admin cache purge endpoint.
 *
 * POST /api/v1/admin/purge — Purge Cloudflare cache by URL pattern.
 *
 * Purges via the Cloudflare API v4 (requires CLOUDFLARE_API_TOKEN secret).
 * Falls back to per-URL Cache API deletion when the API token is unset
 * (less thorough — only purges the colo the request hits).
 *
 * Body:
 *   { urls: ["https://pranithjain.qzz.io/api/v1/feed-status"] }
 *
 * Or with a pattern prefix:
 *   { prefix: "/threatintel" }
 *   → purges everything under /threatintel
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin } from '../lib/admin-auth';
import { badRequest, internalError, serviceUnavailable } from '../lib/api-error';
import { z } from 'zod';

const purgeSchema = z.object({
  urls: z.array(z.string().url()).optional(),
  prefix: z.string().min(1).optional(),
}).refine((d) => d.urls || d.prefix, { message: 'provide either "urls" or "prefix"' });

const CF_API = 'https://api.cloudflare.com/client/v4';

export async function purgeCacheHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const body = await c.req.json().catch(() => null);
  const parsed = purgeSchema.safeParse(body);
  if (!parsed.success) return badRequest(c, parsed.error.issues.map((i) => i.message).join('; '));

  const zoneId = c.env.CF_ZONE_ID;
  const apiToken = c.env.CF_API_TOKEN;

  if (!zoneId || !apiToken) {
    // Fallback: per-URL Cache API delete (colo-local only).
    const cache = (caches as unknown as { default: Cache }).default;
    const urls = parsed.data.urls ?? [];
    if (urls.length === 0) return serviceUnavailable(c, 'CF_API_TOKEN unset — provide explicit urls for colo-level purge');

    let purged = 0;
    for (const url of urls) {
      try {
        await cache.delete(new Request(url));
        purged++;
      } catch { /* skip */ }
    }
    return c.json({ ok: true, method: 'cache-api-colo', purged, total: urls.length });
  }

  // Cloudflare API v4 purge.
  const payload: Record<string, unknown> = {};
  if (parsed.data.urls) {
    payload.files = parsed.data.urls;
  } else if (parsed.data.prefix) {
    payload.prefix = parsed.data.prefix;
  }

  try {
    const res = await fetch(`${CF_API}/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: 'purge_failed', message: `CF API ${res.status}: ${text.slice(0, 200)}` }, 502);
    }

    const cfResult = await res.json() as { success: boolean; errors: unknown[] };
    if (!cfResult.success) {
      return c.json({ error: 'purge_failed', message: JSON.stringify(cfResult.errors) }, 502);
    }

    return c.json({ ok: true, method: 'cf-api-v4', payload });
  } catch (e) {
    return internalError(c, e);
  }
}

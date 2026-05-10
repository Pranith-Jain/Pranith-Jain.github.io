import apiApp from '../api/src/index';
import {
  BRIEFING_MAX_AGE_DAYS,
  buildBriefing,
  writeBriefing,
  sweepOldBriefings,
} from '../api/src/lib/briefing-builder';

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  KV_CACHE?: KVNamespace;
  KV_SHARES?: KVNamespace;
  BRIEFINGS?: KVNamespace;
  R2_FILES?: R2Bucket;
  VT_API_KEY?: string;
  ABUSEIPDB_API_KEY?: string;
  SHODAN_API_KEY?: string;
  OTX_API_KEY?: string;
  URLSCAN_API_KEY?: string;
  HYBRID_ANALYSIS_API_KEY?: string;
  ABUSECH_AUTH_KEY?: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.cloudflare.com",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const response = url.pathname.startsWith('/api/')
      ? await apiApp.fetch(request, env as never, ctx)
      : await env.ASSETS.fetch(request);
    return withSecurityHeaders(response);
  },

  /**
   * Cron-triggered work. Dispatched on cron string:
   * - "5 0 * * *"    → daily briefing for the prior calendar day
   * - "15 0 * * 1"   → weekly briefing for the prior ISO week (Mon → Sun)
   * - "*\/5 * * * *" → warm /api/v1/snapshot + /api/v1/ioc-snapshot so the
   *                   first-of-each-cache-window user request lands warm.
   *                   Re-dispatches each request through the Hono app
   *                   (apiApp.fetch) so the per-route + outer-snapshot
   *                   caches all populate.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;

    if (cron === '*/5 * * * *') {
      ctx.waitUntil(
        (async () => {
          const start = Date.now();
          // Use the production hostname so the cached Response key matches what
          // user requests look up. Cache API is keyed by the full Request URL.
          const baseUrl = 'https://pranithjain.qzz.io';
          const targets = ['/api/v1/snapshot', '/api/v1/ioc-snapshot'];
          const results = await Promise.allSettled(
            targets.map(async (path) => {
              const req = new Request(baseUrl + path, { method: 'GET' });
              const res = await apiApp.fetch(req, env as never, ctx);
              // Drain body so the Response is fully realised in the cache.
              await res.arrayBuffer();
              return { path, status: res.status };
            })
          );
          const summary = results
            .map((r, i) =>
              r.status === 'fulfilled'
                ? `${r.value.path}=${r.value.status}`
                : `${targets[i]}=err(${(r.reason as Error).message})`
            )
            .join(' ');
          console.log(`scheduled: warmed snapshots in ${Date.now() - start}ms — ${summary}`);
        })()
      );
      return;
    }

    // Briefings cron path.
    if (!env.BRIEFINGS) {
      console.warn('scheduled: BRIEFINGS KV not bound, skipping');
      return;
    }
    const isWeekly = cron === '15 0 * * 1';
    const type = isWeekly ? 'weekly' : 'daily';

    ctx.waitUntil(
      (async () => {
        const kv = env.BRIEFINGS as KVNamespace;
        try {
          const briefing = await buildBriefing(type);
          await writeBriefing(kv, briefing);
          console.log(
            `scheduled: wrote ${briefing.slug} (findings=${briefing.stats.findings}, iocs=${briefing.stats.iocs})`
          );
        } catch (err) {
          console.error('scheduled: briefing build failed', err);
        }
        // Always run the sweep, even if the build failed — keeps KV tidy.
        try {
          const result = await sweepOldBriefings(kv, BRIEFING_MAX_AGE_DAYS);
          if (result.deleted.length > 0) {
            console.log(
              `scheduled: swept ${result.deleted.length} old briefings (${result.deleted.join(', ')}); kept ${result.kept}`
            );
          }
        } catch (err) {
          console.error('scheduled: sweep failed', err);
        }
      })()
    );
  },
};

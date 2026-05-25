import type { Context, Next } from 'hono';
import type { Env } from '../env';
import { trackEvent, visitorCountry } from './analytics';

/**
 * Structured request-logging middleware.
 *
 * Logs every /api/v1/* request to Analytics Engine with:
 *   - method + path (blobs)
 *   - status code (double)
 *   - response time in ms (double)
 *   - country code (index)
 *
 * Free-tier AE: 100k writes/day. At ~1k req/min peak this burns ~9k/hr,
 * well within the daily budget at current portfolio traffic. If traffic
 * grows past 50k req/day this should switch to a sampling strategy.
 */
export async function requestLogger(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const start = performance.now();
  await next();
  const elapsed = performance.now() - start;
  const status = c.res.status;
  const path = new URL(c.req.url).pathname;
  const method = c.req.method;

  // Sample 100% of 5xx, 10% of 4xx, 1% of 2xx/3xx
  const sample =
    status >= 500
      ? 1.0
      : status >= 400
        ? 0.1
        : 0.01;

  if (Math.random() > sample) return;

  trackEvent(
    c.env as Pick<Env, 'DFIR_ANALYTICS'>,
    'api_request',
    {
      blobs: [method, path],
      doubles: [status, Math.round(elapsed)],
      indexes: [visitorCountry(c.req.raw)],
    }
  );
}

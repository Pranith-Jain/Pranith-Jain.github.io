import type { Env } from '../env';

/**
 * Cloudflare Analytics Engine wrapper.
 *
 * AE writes are fire-and-forget: never throw, never block the response.
 * Free tier: 100,000 writes/day, 10M reads/month. We deliberately keep the
 * cardinality of `indexes` low (each unique index value costs storage).
 *
 * Schema:
 *   blobs[0]:   event name (e.g. "ioc_check", "threat_map_fetch")
 *   blobs[1+]:  event-specific string dimensions (indicator type, verdict, etc.)
 *   doubles[0]: event-specific numeric (e.g. score, contributing count)
 *   indexes[0]: country code (from cf-ipcountry header) — single shard key
 */
export function trackEvent(
  env: Pick<Env, 'AJ_analytics'>,
  event: string,
  opts: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  } = {}
): void {
  const ae = env.AJ_analytics;
  if (!ae) return; // local dev or binding missing — silently skip
  try {
    ae.writeDataPoint({
      blobs: [event, ...(opts.blobs ?? [])],
      doubles: opts.doubles ?? [],
      indexes: opts.indexes ?? [],
    });
  } catch {
    // Never let analytics failures affect the user response.
  }
}

/**
 * Pull the visitor's country from cf-ipcountry. Used as the AE shard index;
 * gives geographic cuts in the dashboard without needing IP-level fingerprinting.
 */
export function visitorCountry(req: Request): string {
  return req.headers.get('cf-ipcountry') ?? 'XX';
}

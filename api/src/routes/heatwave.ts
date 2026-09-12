import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, badGateway } from '../lib/api-error';
import { safeNullLog } from '../lib/safe-catch';
import { readLastGood, writeLastGood } from '../lib/lastgood';
import { heatwaveLookup, heatwaveVerdict, normalizeHeatwaveDomain, type HeatwaveResult } from '../lib/heatwave';

/**
 * Validity Heatwave Domain Blocklist lookup (lookup.validity.tools).
 *
 * `GET /api/v1/heatwave/lookup?domain=<sending-domain>`
 *
 * Keyless HTML-scrape proxy: Heatwave offers no public API and retired its
 * public DNS resolver (both are partner-only), so we parse the free web
 * Lookup page (100 lookups/day/IP). The 24h edge cache plus the KV
 * last-good fallback keep us inside that budget — repeat checks for the
 * same domain never re-hit upstream.
 *
 * Scope guard (from Heatwave's listing policy): this is SENDING-domain
 * reputation only. A hit means cold-email infrastructure, not phishing or
 * malware; "not listed" is NOT a clean verdict. Consumers must surface
 * those caveats — see heatwaveVerdict() in worker/lib/heatwave.ts.
 */

const CACHE_TTL_SECONDS = 86400; // 24h — listings are permanent observations; score band drifts hourly but is display-only
const LASTGOOD_KV_KEY = 'heatwave:lastgood';
const LASTGOOD_TTL_SECONDS = 7 * 86400;

export interface HeatwaveLookupBody extends HeatwaveResult {
  source: string;
  source_url: string;
  verdict: 'suspicious' | 'unknown';
  score: number;
  tags: string[];
  stale?: boolean;
}

export async function heatwaveLookupHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = (c.req.query('domain') ?? '').trim();
  const domain = normalizeHeatwaveDomain(raw);
  if (!domain) {
    return badRequest(c, 'Provide ?domain=<sending-domain> (bare domain only — no URLs, emails, or IPs)');
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://heatwave-cache.internal/v1?domain=${encodeURIComponent(domain)}`);
  const cached = await safeNullLog('cache-match-heatwave', cache.match(cacheKey));
  if (cached) return new Response(cached.body, cached);

  const upstream = await heatwaveLookup(domain);
  if (upstream) {
    const v = heatwaveVerdict(upstream);
    const body: HeatwaveLookupBody = {
      ...upstream,
      source: 'Validity Heatwave DBL',
      source_url: `https://lookup.validity.tools/?domain=${encodeURIComponent(domain)}`,
      verdict: v.verdict,
      score: v.score,
      tags: v.tags,
    };
    if (c.env.KV_CACHE) {
      void safeNullLog(
        'cache-put-heatwave-lastgood',
        writeLastGood(c.env, `${LASTGOOD_KV_KEY}:${domain}`, body, {
          keyPrefix: '',
          ttlSeconds: LASTGOOD_TTL_SECONDS,
        })
      );
    }
    const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
    c.executionCtx.waitUntil(safeNullLog('cache-put-heatwave', cache.put(cacheKey, response.clone())));
    return response;
  }

  // Upstream flap / rate-limit / redesign — serve the cross-colo last-good.
  if (c.env.KV_CACHE) {
    const lastGood = await safeNullLog(
      'cache-read-heatwave-lastgood',
      readLastGood<HeatwaveLookupBody>(c.env, `${LASTGOOD_KV_KEY}:${domain}`, { keyPrefix: '' })
    );
    if (lastGood && lastGood.domain === domain) {
      return c.json({ ...lastGood, stale: true }, 200, {
        'Cache-Control': 'public, max-age=300',
        'X-Cache': 'LASTGOOD',
      });
    }
  }

  return badGateway(c, 'heatwave lookup unreachable — upstream failed and no cached copy exists');
}

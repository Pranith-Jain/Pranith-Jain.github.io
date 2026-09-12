import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, serviceUnavailable } from '../lib/api-error';
import { safeNullLog } from '../lib/safe-catch';
import { RANSOMWARE_RECENT_CACHE_KEY } from './ransomware-recent';
import { dphish } from '../providers/dphish';
import { destroylist } from '../providers/destroylist';
import type { ProviderEnv } from '../providers/types';
import { heatwaveLookup, normalizeHeatwaveDomain } from '../lib/heatwave';
import { victimMatchesDomain } from '../lib/watch-engine';

/**
 * Unified exposure search (Sinon-style "run one search against your domain").
 *
 * `GET /api/v1/exposure/check?domain=<domain>`
 *
 * Fans out over locally-available + keyless sources in parallel and merges
 * one verdict. No KV/D1 writes; the composed response is edge-cached 15 min.
 * Every section degrades independently — one dead upstream never fails the
 * whole search, and "no exposure found" is reported as unknown, never clean.
 *
 * Sections:
 *   ransomware  — victim-name substring match on the merged leak-site feed
 *   heatwave    — Validity cold-email sender-domain blocklist (live lookup)
 *   destroylist — phishing/scam domain blacklist (local manifest + live API)
 *   dphish      — TAXII phishing indicators (local manifest)
 */

const CACHE_TTL_SECONDS = 900;

type SectionStatus = 'ok' | 'unavailable';

interface RansomwareHit {
  victim: string;
  group: string;
  discovered: string;
}

export async function exposureCheckHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = normalizeHeatwaveDomain((c.req.query('domain') ?? '').trim());
  if (!domain) {
    return badRequest(c, 'Provide ?domain=<domain> (bare domain only — no URLs, emails, or IPs)');
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://exposure-check-cache.internal/v1?domain=${encodeURIComponent(domain)}`);
  const cached = await safeNullLog('cache-match-exposure', cache.match(cacheKey));
  if (cached) return new Response(cached.body, cached);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const assets = c.env.ASSETS;
    if (!assets) return serviceUnavailable(c, 'static asset backend not configured');
    const provEnv = { ASSETS: assets } as ProviderEnv;

    const [ransomRes, heatRes, dlRes, dpRes] = await Promise.all([
      // 1. Ransomware victim names (cron-warmed edge cache read).
      (async (): Promise<{ status: SectionStatus; hits: RansomwareHit[] }> => {
        try {
          const hit = await cache.match(new Request(RANSOMWARE_RECENT_CACHE_KEY));
          if (!hit) return { status: 'unavailable', hits: [] };
          const data = (await hit.json()) as {
            victims?: Array<{ victim: string; group: string; discovered: string }>;
          };
          const hits = (data.victims ?? [])
            .filter((v) => victimMatchesDomain(domain, v.victim))
            .slice(0, 20)
            .map((v) => ({ victim: v.victim, group: v.group, discovered: v.discovered }));
          return { status: 'ok', hits };
        } catch {
          return { status: 'unavailable', hits: [] };
        }
      })(),
      // 2. Heatwave sender-domain blocklist (live, own 24h cache inside lib path).
      (async () => {
        try {
          const r = await heatwaveLookup(domain);
          if (!r) return { status: 'unavailable' as SectionStatus, result: null as typeof r };
          return { status: 'ok' as SectionStatus, result: r };
        } catch {
          return { status: 'unavailable' as SectionStatus, result: null };
        }
      })(),
      // 3+4. Local-manifest providers (zero egress on hit).
      (async () => {
        try {
          return await destroylist({ type: 'domain', value: domain }, provEnv, ctrl.signal);
        } catch (e) {
          logError('exposure destroylist failed', e);
          return null;
        }
      })(),
      (async () => {
        try {
          return await dphish({ type: 'domain', value: domain }, provEnv, ctrl.signal);
        } catch (e) {
          logError('exposure dphish failed', e);
          return null;
        }
      })(),
    ]);

    const dlListed = dlRes?.status === 'ok' && dlRes.verdict === 'malicious';
    const dpListed = dpRes?.status === 'ok' && (dpRes.verdict === 'malicious' || dpRes.verdict === 'suspicious');
    const heatActive = heatRes.result?.listed === true && heatRes.result.status === 'active';
    const heatWarming = heatRes.result?.listed === true && heatRes.result.status !== 'active';

    let verdict: 'critical' | 'high' | 'medium' | 'low' | 'unknown' = 'unknown';
    let score = 0;
    if (ransomRes.hits.length > 0) {
      verdict = 'critical';
      score = 90;
    } else if (dlListed || dpListed) {
      verdict = 'high';
      score = 75;
    } else if (heatActive) {
      verdict = 'medium';
      score = 50;
    } else if (heatWarming) {
      verdict = 'low';
      score = 25;
    }

    const body = {
      domain,
      generated_at: new Date().toISOString(),
      verdict,
      score,
      sections: {
        ransomware: {
          status: ransomRes.status,
          hits: ransomRes.hits,
          note: 'Leak-site victim claims plausibly belonging to the domain (registrable-label match).',
        },
        heatwave: {
          status: heatRes.status,
          listed: heatRes.result?.listed ?? null,
          stage: heatRes.result?.stage ?? null,
          score_band: heatRes.result?.score ?? null,
          observation_age: heatRes.result?.observation_age ?? null,
          dns_answer: heatRes.result?.dns_answer ?? null,
          related: heatRes.result?.related ?? [],
          note: 'Sending-domain reputation only — score is a relative band; not-listed is not clean.',
        },
        destroylist: {
          status:
            !dlRes || dlRes.status === 'unsupported' ? 'unavailable' : dlRes.status === 'ok' ? 'ok' : 'unavailable',
          listed: dlListed,
          tags: dlRes?.tags ?? [],
        },
        dphish: {
          status:
            !dpRes || dpRes.status === 'unsupported' ? 'unavailable' : dpRes.status === 'ok' ? 'ok' : 'unavailable',
          listed: dpListed,
          tags: dpRes?.tags ?? [],
        },
      },
      notes: [
        'Unknown verdict means no exposure found in monitored sources — not a clean bill of health.',
        'Ransomware matching is substring-based; verify hits before acting.',
      ],
    };

    const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
    c.executionCtx.waitUntil(safeNullLog('cache-put-exposure', cache.put(cacheKey, response.clone())));
    return response;
  } finally {
    clearTimeout(timer);
  }
}

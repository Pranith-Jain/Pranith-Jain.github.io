/**
 * Destroylist provider adapter — phishing/scam domain blacklist
 * (phishdestroy/destroylist, MIT).
 *
 * Like dPhish, this is a replicated static vertical: the primary feed ships
 * in public/data/threat-intel/destroylist/ as hash-bucketed sorted domain
 * arrays read through the ASSETS binding via checkDestroylistDomain() — zero
 * network egress, no API key, buckets LRU-cached per isolate. The 1M-line
 * community aggregate is NOT shipped; it stays reachable through the keyless
 * api.destroy.tools live API (best-effort, Cache-API cached 24h) which this
 * adapter consults only when the local manifest misses.
 *
 * Match semantics: exact domain or any parent domain listed → malicious
 * (the feed publishes verified phishing/scam domains). A community-API hit
 * alone (local manifest miss) → suspicious with the upstream risk score.
 */

import type { ProviderAdapter, ProviderEnv, ProviderResult } from './types';
import { checkDestroylistDomain, loadDestroylistIndex } from '../lib/threat-intel-manifest';

function makeErrorResult(source: ProviderResult['source'], err: unknown): ProviderResult {
  return {
    source,
    status: 'error',
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    error: err instanceof Error ? err.message : String(err),
    fetched_at: new Date().toISOString(),
    cached: false,
  };
}

function normalize(v: string): string {
  let d = v.trim().toLowerCase();
  try {
    if (d.includes('://')) d = new URL(d).hostname;
    else if (d.includes('/')) d = new URL(`https://${d}`).hostname;
  } catch {
    /* keep as-is */
  }
  return d.replace(/^www\./i, '').replace(/\.$/, '');
}

/** Keyless live lookup against api.destroy.tools (community + primary). */
async function liveLookup(domain: string): Promise<{ risk: number; severity?: string } | null> {
  const cache = caches as unknown as { default: Cache };
  const cacheReq = new Request(`https://destroylist-live.internal/v1/${encodeURIComponent(domain)}`);
  try {
    const hit = await cache.default.match(cacheReq);
    if (hit) return (await hit.json()) as { risk: number; severity?: string };
  } catch {
    /* fall through to network */
  }
  try {
    const res = await fetch(`https://api.destroy.tools/v1/check?key=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { risk_score?: number; risk?: number; severity?: string };
    const out = { risk: body.risk_score ?? body.risk ?? 0, severity: body.severity };
    void cache.default.put(
      cacheReq,
      new Response(JSON.stringify(out), {
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' },
      })
    );
    return out;
  } catch {
    return null;
  }
}

export const destroylist: ProviderAdapter = async (indicator, env: ProviderEnv): Promise<ProviderResult> => {
  // Domain-shaped indicators only — the feed is a domain blacklist.
  if (indicator.type !== 'domain' && indicator.type !== 'url') {
    return {
      source: 'destroylist',
      status: 'unsupported',
      score: 0,
      verdict: 'unknown',
      raw_summary: {},
      tags: [],
      fetched_at: new Date().toISOString(),
      cached: false,
    };
  }
  if (!env.ASSETS) {
    return {
      source: 'destroylist',
      status: 'unsupported',
      score: 0,
      verdict: 'unknown',
      raw_summary: { note: 'ASSETS binding unavailable — destroylist manifest not loaded' },
      tags: [],
      fetched_at: new Date().toISOString(),
      cached: false,
    };
  }

  try {
    const needle = normalize(indicator.value);
    const local = await checkDestroylistDomain(env.ASSETS, needle);

    if (local === null) {
      return makeErrorResult('destroylist', 'destroylist manifest unavailable — run build-destroylist');
    }

    if (local.listed) {
      const idx = await loadDestroylistIndex(env.ASSETS).catch(() => null);
      return {
        source: 'destroylist',
        status: 'ok',
        score: 90,
        verdict: 'malicious',
        raw_summary: {
          matched: local.matched,
          feed: 'primary',
          counts: idx?.counts,
          syncedAt: idx?.syncedAt,
        },
        tags: ['phishing', 'scam', 'blacklist'],
        fetched_at: new Date().toISOString(),
        cached: false,
      };
    }

    // Local primary miss — try the keyless live API (covers community feed).
    const live = await liveLookup(needle);
    if (live && live.risk >= 60) {
      return {
        source: 'destroylist',
        status: 'ok',
        score: Math.min(85, live.risk),
        verdict: live.risk >= 80 ? 'malicious' : 'suspicious',
        raw_summary: { feed: 'community-live-api', risk_score: live.risk, severity: live.severity },
        tags: ['phishing', 'community-feed'],
        fetched_at: new Date().toISOString(),
        cached: false,
      };
    }

    return {
      source: 'destroylist',
      status: 'ok',
      score: 0,
      verdict: 'clean',
      raw_summary: { note: 'not in destroylist primary/community feeds' },
      tags: [],
      fetched_at: new Date().toISOString(),
      cached: false,
    };
  } catch (err) {
    return makeErrorResult('destroylist', err);
  }
};

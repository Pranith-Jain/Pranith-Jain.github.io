import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['url', 'domain']);
const CACHE_TTL_SECONDS = 1800;

/**
 * Community-vetted phishing URLs from PhishTank (Cisco Talos). Complements OpenPhish.
 *
 * Note (2024-): PhishTank closed its anonymous JSON feed — the bare URL
 * now returns 403 from Cloudflare's bot shield. The new free tier requires
 * a per-account application key registered at phishtank.org. Until a key
 * is provisioned (env var `PHISHTANK_APP_KEY`), this adapter short-circuits
 * to `unsupported` with a clear note rather than spamming 403 errors into
 * every IOC check. OpenPhish covers the same use case in the meantime.
 */
export const phishtank: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'phishtank',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');

  const appKey = (env as unknown as Record<string, string | undefined>).PHISHTANK_APP_KEY;
  // No key → PhishTank's free anonymous feed (403). Report as unsupported
  // with a hint so the UI knows this isn't a transient error.
  if (!appKey) {
    return base('unsupported', {
      raw_summary: {
        note: 'PhishTank requires PHISHTANK_APP_KEY — set via wrangler secret put.',
        covered_by: 'openphish',
      },
    });
  }

  try {
    // PhishTank supplies the app key as a PATH segment, not an Authorization
    // header: http://data.phishtank.com/data/<app_key>/online-valid.json
    const url = `https://data.phishtank.com/data/${encodeURIComponent(appKey)}/online-valid.json`;
    const res = await fetch(url, {
      signal,
      headers: { 'user-agent': 'pranithjain.qzz.io DFIR' },
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    });
    if (res.status === 403 || res.status === 401) {
      return base('unsupported', {
        error: `PhishTank rejected app_key (${res.status}) — provision a new key`,
      });
    }
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));
    const entries = (await res.json()) as Array<{
      url: string;
      phishing_url?: string;
      target?: string;
      verified?: string;
      verification_time?: string;
      ip_address?: string;
    }>;

    const target = indicator.value.toLowerCase();
    const stripSlash = (u: string) => u.replace(/\/+$/, '');

    let hit = false;
    let brand = '';
    for (const e of entries) {
      const feedUrl = (e.url || e.phishing_url || '').toLowerCase();
      if (!feedUrl) continue;
      // Match on host equality (domain) or normalized URL equality (url).
      // The old bidirectional `includes` produced false positives (a short
      // domain matching any feed URL containing it, and vice-versa).
      let match = false;
      if (indicator.type === 'domain') {
        let host = '';
        try {
          host = new URL(feedUrl).hostname;
        } catch {
          host = '';
        }
        match = host === target || host.endsWith(`.${target}`);
      } else {
        match = stripSlash(feedUrl) === stripSlash(target);
      }
      if (match) {
        hit = true;
        brand = e.target ?? '';
        break;
      }
    }

    return base('ok', {
      score: hit ? 90 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['phishing', 'phishtank', brand].filter(Boolean) : [],
      raw_summary: { listed: hit, list_size: entries.length, source: 'phishtank.com' },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

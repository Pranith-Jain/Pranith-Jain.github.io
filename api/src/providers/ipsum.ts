import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4']);
// Level 3 = IPs that appear on at least 3 source blocklists. Strong consensus, low false-positive rate.
const FEED = 'https://raw.githubusercontent.com/stamparm/ipsum/master/levels/3.txt';
const CACHE_TTL_SECONDS = 3600;

/**
 * Ipsum (stamparm) consensus IP blocklist. Aggregates 30+ public blocklists and only
 * lists an IP if at least N sources flagged it. Includes the consensus score per entry.
 */
export const ipsum: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'ipsum',
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

  try {
    const res = await fetch(FEED, { signal, cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true } });
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));
    const text = await res.text();

    // Map IP → consensus score (number of source lists that flagged it)
    const map = new Map<string, number>();
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const parts = t.split(/\s+/);
      const ip = parts[0];
      if (!ip) continue;
      const score = parseInt(parts[1] ?? '0', 10);
      map.set(ip, isNaN(score) ? 0 : score);
    }

    const consensus = map.get(indicator.value);
    const hit = consensus !== undefined;
    // Higher consensus → higher confidence verdict
    const score = hit ? Math.min(95, 60 + (consensus ?? 0) * 5) : 0;
    return base('ok', {
      score,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['ipsum-consensus', `consensus-${consensus}`] : [],
      raw_summary: { listed: hit, consensus_sources: consensus ?? 0, list_size: map.size },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

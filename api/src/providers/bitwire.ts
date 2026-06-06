import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';
import { parseCidrRanges, ipv4InRanges } from '../lib/cidr';

const supports = new Set(['ipv4']);
const FEED = 'https://raw.githubusercontent.com/bitwire-it/ipblocklist/main/outbound.txt';
const CACHE_TTL_SECONDS = 3600;

/**
 * Bitwire outbound IP blocklist. Hosted on GitHub, refreshed every 2 hours.
 * Plain text, one IPv4 or CIDR per line.
 */
export const bitwire: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'bitwire',
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

    // Feed is bare IPs + CIDRs. The old code stored only the CIDR network
    // address and exact-matched, so an IP inside a /31 (etc.) was silently
    // "clean". Expand to integer ranges and test containment.
    const ranges = parseCidrRanges(text);
    const hit = ipv4InRanges(indicator.value, ranges);
    return base('ok', {
      score: hit ? 80 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['bitwire-blocklist', 'outbound-c2'] : [],
      raw_summary: { listed: hit, list_size: ranges.length },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

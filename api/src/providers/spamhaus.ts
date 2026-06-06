import type { ProviderAdapter, ProviderResult } from './types';
import {
  classifyResponseError,
  classifyThrownError,
  toProviderError,
  type ProviderErrorInfo,
} from '../lib/provider-errors';

const supports = new Set(['ipv4']);
const DROP = 'https://www.spamhaus.org/drop/drop.txt';
const EDROP = 'https://www.spamhaus.org/drop/edrop.txt';
const CACHE_TTL_SECONDS = 3600;

export const spamhaus: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'spamhaus',
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
    const [dropRes, edropRes] = await Promise.all([
      fetch(DROP, { signal, cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true } }),
      fetch(EDROP, { signal, cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true } }),
    ]);

    // Partial failure: if one feed is reachable, the composite still
    // gets a meaningful answer (DROP-only is the operational reality
    // more often than total downtime). We surface the dead feed in
    // error_tags so the operator can see the gap.
    const dropError = !dropRes.ok ? classifyResponseError(dropRes) : null;
    const edropError = !edropRes.ok ? classifyResponseError(edropRes) : null;
    if (dropError && edropError) {
      // Both feeds dead — return the more specific one (5xx or 429
      // wins over a generic 4xx).
      const primary = pickPrimaryError(dropError, edropError);
      return base('error', toProviderError(primary));
    }

    const text = `${dropRes.ok ? await dropRes.text() : ''}\n${edropRes.ok ? await edropRes.text() : ''}`;
    const ranges = parseRanges(text);

    const ip = ipv4ToInt(indicator.value);
    if (ip === null) return base('error', { error: 'bad_ipv4', error_code: 'parse', error_tags: ['parse'] });

    const hit = ranges.some(([start, end]) => ip >= start && ip <= end);
    const partialErrorTags = [dropError, edropError]
      .filter((e): e is ProviderErrorInfo => e !== null)
      .flatMap((e) => e.tags);

    return base('ok', {
      score: hit ? 85 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: [...(hit ? ['spamhaus-drop'] : []), ...partialErrorTags],
      raw_summary: {
        listed: hit,
        ranges_checked: ranges.length,
        ...(dropError ? { drop_error: dropError.error } : {}),
        ...(edropError ? { edrop_error: edropError.error } : {}),
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

/**
 * When both Spamhaus feeds fail, pick the more actionable one to surface
 * as the primary error. 5xx and 429 (rate-limited) both mean "the
 * upstream is having a problem" and are more useful to see than a
 * generic 4xx (which is usually a Cloudflare challenge page).
 */
function pickPrimaryError(a: ProviderErrorInfo, b: ProviderErrorInfo): ProviderErrorInfo {
  const rank = (e: ProviderErrorInfo): number => {
    if (e.code === 'rate_limited') return 4;
    if (e.code === 'upstream_5xx') return 3;
    if (e.code === 'upstream_4xx') return 2;
    if (e.code === 'forbidden') return 1;
    return 0;
  };
  return rank(a) >= rank(b) ? a : b;
}

function parseRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith(';') || t.startsWith('#')) continue;
    const cidr = t.split(/[;\s]/)[0];
    if (!cidr) continue;
    const r = cidrRange(cidr);
    if (r) out.push(r);
  }
  return out;
}

function cidrRange(cidr: string): [number, number] | null {
  const [ip, bitsStr] = cidr.split('/');
  if (!ip || !bitsStr) return null;
  const bits = parseInt(bitsStr, 10);
  const start = ipv4ToInt(ip);
  if (start === null || isNaN(bits) || bits < 0 || bits > 32) return null;
  const size = 2 ** (32 - bits);
  return [start, start + size - 1];
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = parseInt(p, 10);
    if (isNaN(x) || x < 0 || x > 255) return null;
    n = n * 256 + x;
  }
  return n;
}

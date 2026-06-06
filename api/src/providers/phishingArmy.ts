import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['domain', 'url']);
const FEED = 'https://phishing.army/download/phishing_army_blocklist.txt';
const CACHE_TTL_SECONDS = 3600;

/**
 * Phishing Army domain blocklist. Hosts(5) format with `0.0.0.0 evil.example.com`
 * lines (or sometimes bare domains). For URL indicators, the host is extracted and
 * checked.
 */
export const phishingArmy: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'phishingArmy',
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

  // Resolve the candidate host: domain indicator is the value; URL needs URL.hostname.
  let candidate: string;
  if (indicator.type === 'url') {
    try {
      candidate = new URL(indicator.value).hostname.toLowerCase();
    } catch {
      return base('error', { error: 'invalid_url' });
    }
  } else {
    candidate = indicator.value.toLowerCase();
  }

  try {
    const res = await fetch(FEED, { signal, cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true } });
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));
    const text = await res.text();

    const set = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('!')) continue;
      // Strip leading "0.0.0.0 " / "127.0.0.1 " from hosts-format lines
      const domain = t
        .replace(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+/, '')
        .trim()
        .toLowerCase();
      if (domain) set.add(domain);
    }

    // Match the candidate, or any parent domain (e.g. login.evil.com hits if evil.com is listed).
    let hit = set.has(candidate);
    if (!hit) {
      const parts = candidate.split('.');
      for (let i = 1; i < parts.length - 1 && !hit; i++) {
        if (set.has(parts.slice(i).join('.'))) hit = true;
      }
    }

    return base('ok', {
      score: hit ? 90 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['phishing-army', 'phishing'] : [],
      raw_summary: { listed: hit, list_size: set.size, checked: candidate },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

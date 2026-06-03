import type { ProviderAdapter, ProviderResult, Verdict } from './types';

/**
 * Digital Side — FREE, NO AUTH.
 *
 * Digital Side provides threat intelligence feeds including:
 *   - URLhaus malware URLs
 *   - Phishing URLs
 *   - Malware hashes
 *   - C2 domains
 *
 * All feeds are free and updated regularly. No authentication required.
 *
 * @see https://github.com/davidonzo/Threat-Intel
 */

const supports = new Set(['url', 'domain', 'hash', 'ipv4']);

/** Cache the feeds for 1 hour */
const feedCache = new Map<string, { data: Set<string>; time: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchFeed(url: string, signal: AbortSignal): Promise<Set<string>> {
  const cached = feedCache.get(url);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'threat-intel-platform/1.0' },
  });

  if (!res.ok) return new Set();

  const text = await res.text();
  const entries = new Set(
    text
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith('#'))
  );

  feedCache.set(url, { data: entries, time: Date.now() });
  return entries;
}

export const digitalside: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'digitalside',
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
    // Check multiple feeds in parallel
    const feedUrls: string[] = [];

    if (indicator.type === 'url' || indicator.type === 'domain') {
      feedUrls.push(
        'https://raw.githubusercontent.com/davidonzo/Threat-Intel/master/lists/latesturls.txt',
        'https://raw.githubusercontent.com/davidonzo/Threat-Intel/master/lists/latestdomains.txt'
      );
    } else if (indicator.type === 'ipv4') {
      feedUrls.push('https://raw.githubusercontent.com/davidonzo/Threat-Intel/master/lists/latestips.txt');
    } else if (indicator.type === 'hash') {
      feedUrls.push('https://raw.githubusercontent.com/davidonzo/Threat-Intel/master/lists/latesthashes.txt');
    }

    const feeds = await Promise.all(feedUrls.map((url) => fetchFeed(url, signal)));

    // Check if indicator appears in any feed
    const value = indicator.value.toLowerCase();
    let found = false;
    let feedSource = '';

    for (let i = 0; i < feeds.length; i++) {
      const feed = feeds[i];
      if (!feed) continue;
      // Exact membership only. Substring matching produced false-positive
      // "malicious" verdicts (e.g. "1.2.3.4" matching "11.2.3.40") and was an
      // O(feed-size) scan on every miss. Feeds are normalized to lowercase.
      if (feed.has(value)) {
        found = true;
        feedSource = feedUrls[i]?.split('/').pop() ?? 'unknown';
        break;
      }
    }

    if (!found) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-listed'],
        raw_summary: { reason: 'Not found in Digital Side threat feeds' },
      });
    }

    // Found in threat feed
    const score = 75;
    const verdict: Verdict = 'malicious';

    const tags: string[] = ['threat-intel-feed'];
    if (feedSource) tags.push(`feed:${feedSource}`);
    tags.push('digitalside');

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 5),
      raw_summary: {
        found_in_feed: feedSource,
        source: 'Digital Side Threat Intel',
        github: 'https://github.com/davidonzo/Threat-Intel',
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};

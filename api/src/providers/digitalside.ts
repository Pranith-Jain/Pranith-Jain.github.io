import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import {
  classifyResponseError,
  classifyThrownError,
  toProviderError,
  type ProviderErrorInfo,
} from '../lib/provider-errors';

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

type FeedResult = { ok: true; data: Set<string> } | { ok: false; error: ProviderErrorInfo };

async function fetchFeed(url: string, signal: AbortSignal): Promise<FeedResult> {
  const cached = feedCache.get(url);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return { ok: true, data: cached.data };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      signal,
      headers: { 'User-Agent': 'threat-intel-platform/1.0' },
    });
  } catch (err) {
    return { ok: false, error: classifyThrownError(err) };
  }

  if (!res.ok) {
    // Don't cache the failure. The next request gets a fresh attempt;
    // a flaky GitHub raw URL doesn't poison an hour of lookups.
    return { ok: false, error: classifyResponseError(res) };
  }

  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    return { ok: false, error: classifyThrownError(err) };
  }
  const entries = new Set(
    text
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith('#'))
  );

  feedCache.set(url, { data: entries, time: Date.now() });
  return { ok: true, data: entries };
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

    const results = await Promise.all(feedUrls.map((url) => fetchFeed(url, signal)));

    // All feeds failed → a hard error: don't claim "clean" when the
    // source is down. Pre-refactor the provider returned an empty Set
    // on !res.ok, which silently turned any upstream failure into
    // "not-listed" → clean verdict. That's a real false-negative risk
    // for an IOC enrichment that the composite score trusts.
    const okResults = results.filter((r): r is { ok: true; data: Set<string> } => r.ok);
    if (okResults.length === 0) {
      const first = results[0];
      const info: ProviderErrorInfo =
        first && !first.ok ? first.error : { error: 'all_feeds_failed', code: 'upstream_5xx', tags: ['upstream-5xx'] };
      return base('error', toProviderError(info));
    }

    // Check if indicator appears in any feed
    const value = indicator.value.toLowerCase();
    let found = false;
    let feedSource = '';

    for (let i = 0; i < results.length; i += 1) {
      const r = results[i];
      if (!r || !r.ok) continue;
      const feed = r.data;
      // Exact membership only. Substring matching produced false-positive
      // "malicious" verdicts (e.g. "1.2.3.4" matching "11.2.3.40") and was an
      // O(feed-size) scan on every miss. Feeds are normalized to lowercase.
      if (feed.has(value)) {
        found = true;
        feedSource = feedUrls[i]?.split('/').pop() ?? 'unknown';
        break;
      }
    }

    // Surface partial failure so the UI can dim the row, but proceed
    // with the feeds we DID get. A real indicator match in the surviving
    // feed is still the right answer; a "not listed" answer with one of
    // two feeds dead is a softer "uncertain" verdict.
    const failedFeeds = results.filter((r): r is { ok: false; error: ProviderErrorInfo } => !r.ok);
    const partialErrorTags = failedFeeds.flatMap((f) => f.error.tags);
    const partialErrorMessage =
      failedFeeds.length > 0
        ? `${failedFeeds.length}/${results.length} feeds failed: ${failedFeeds[0]!.error.error}`
        : undefined;

    if (!found) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-listed', ...partialErrorTags],
        ...(failedFeeds.length > 0 ? { error_tags: [...new Set(partialErrorTags)] } : {}),
        raw_summary: {
          reason: 'Not found in Digital Side threat feeds',
          ...(partialErrorMessage ? { partial_failure: partialErrorMessage } : {}),
        },
      });
    }

    // Found in threat feed
    const score = 75;
    const verdict: Verdict = 'malicious';

    const tags: string[] = ['threat-intel-feed', ...partialErrorTags];
    if (feedSource) tags.push(`feed:${feedSource}`);
    tags.push('digitalside');

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 8),
      ...(failedFeeds.length > 0 ? { error_tags: [...new Set(partialErrorTags)] } : {}),
      raw_summary: {
        found_in_feed: feedSource,
        source: 'Digital Side Threat Intel',
        github: 'https://github.com/davidonzo/Threat-Intel',
        ...(partialErrorMessage ? { partial_failure: partialErrorMessage } : {}),
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

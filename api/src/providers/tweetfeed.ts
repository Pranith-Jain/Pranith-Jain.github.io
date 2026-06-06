import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'domain', 'url', 'hash']);
const FEED = 'https://raw.githubusercontent.com/0xDanielLopez/TweetFeed/master/today.csv';
const CACHE_TTL_SECONDS = 1800;

/**
 * TweetFeed (today). IOCs shared by the infosec community on X/Twitter, harvested
 * into a daily CSV: date,source,type,ioc,tags,info_url
 */
export const tweetfeed: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'tweetfeed',
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

  // Map our indicator type → TweetFeed's `type` column values
  const wantedTypes = new Set<string>();
  if (indicator.type === 'ipv4') wantedTypes.add('ip');
  else if (indicator.type === 'domain') wantedTypes.add('domain');
  else if (indicator.type === 'url') wantedTypes.add('url');
  else if (indicator.type === 'hash') {
    wantedTypes.add('sha256');
    wantedTypes.add('sha1');
    wantedTypes.add('md5');
  }

  try {
    const res = await fetch(FEED, { signal, cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true } });
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));
    const text = await res.text();

    const target = indicator.value.toLowerCase();
    let match: { reporter: string; tags: string; timestamp: string; tweetUrl: string } | null = null;

    for (const line of text.split('\n')) {
      const cols = line.split(',');
      if (cols.length < 4) continue;
      const type = cols[2]?.toLowerCase().trim();
      if (!type || !wantedTypes.has(type)) continue;
      if (cols[3]?.toLowerCase().trim() !== target) continue;
      match = {
        reporter: cols[1] ?? '',
        tags: cols[4] ?? '',
        timestamp: cols[0] ?? '',
        tweetUrl: cols[5] ?? '',
      };
      break;
    }

    if (!match) {
      return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: { listed: false } });
    }

    const tags = ['tweetfeed-listed'];
    for (const t of match.tags.split(/\s+/).filter(Boolean).slice(0, 4)) {
      tags.push(t.replace(/^#/, ''));
    }

    return base('ok', {
      score: 80,
      verdict: 'malicious',
      tags,
      raw_summary: {
        listed: true,
        reporter: match.reporter,
        tags: match.tags,
        first_seen: match.timestamp,
        source_tweet: match.tweetUrl,
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

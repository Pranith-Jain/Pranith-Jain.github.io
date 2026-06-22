import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';
import { parseRssItems } from './rss-util';

const FEEDS = [
  'https://therecord.media/feed/',
  'https://www.securityweek.com/feed/',
  'https://www.darkreading.com/rss.xml',
  'https://www.infosecurity-magazine.com/rss/news/',
  'https://cyberscoop.com/feed/',
  'https://www.csoonline.com/feed/',
  'https://www.zdnet.com/topic/security/rss.xml',
  'https://cybernews.com/feed/',
  'https://portswigger.net/daily-swig/rss',
  'https://www.scmagazine.com/feed',
  'https://www.cyberdaily.au/feed',
  'https://www.helpnetsecurity.com/feed/',
  'https://threatpost.com/feed/',
];
const WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface DiscoverDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export async function discoverCybersecNews(deps: DiscoverDeps): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const cutoff = deps.now.getTime() - WINDOW_MS;
  let feedsOk = 0;
  for (const feed of FEEDS) {
    try {
      const r = await deps.fetch(feed, {
        headers: {
          Accept: 'application/rss+xml, application/xml, */*',
          'User-Agent': 'pranithjain.qzz.io case-study-discovery',
        },
      });
      if (!r.ok) continue;
      feedsOk += 1;
      const xml = await r.text();
      const feedHost = new URL(feed).hostname.replace(/^www\./, '');
      for (const item of parseRssItems(xml, deps.now)) {
        if (item.date.getTime() < cutoff) continue;
        const key = topicKey('news', item.link || item.title);
        const dedup = await deps.getDedup(key);
        const score = finalScore({
          recency: recencyScore(item.date.toISOString(), deps.now),
          severity: severityScore({}),
          novelty: noveltyScore(dedup, deps.now),
          sourceWeight: 0.6,
        });
        out.push({
          key,
          type: 'news',
          title: item.title,
          rationale: `Cybersec news · ${feedHost} · ${item.date.toISOString().slice(0, 10)}`,
          score,
          evidence: { url: item.link, published: item.date.toISOString(), source: feed },
          discoveredAt: deps.now.toISOString(),
          status: 'pending',
        });
      }
    } catch (err) {
      console.warn(`discoverCybersecNews: feed failed ${feed}`, err);
    }
  }
  console.log(
    JSON.stringify({ job: 'discovery', runner: 'news', feedsTotal: FEEDS.length, feedsOk, items: out.length })
  );
  return out;
}

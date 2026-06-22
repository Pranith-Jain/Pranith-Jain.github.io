import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';
import { parseRssItems } from './rss-util';

/** Methodology/thought-leadership content is more evergreen than
 *  breaking news — use a 14-day window so slower-publishing sources
 *  (SANS, Mandiant deep-dives) don't get systematically excluded. */
const FEEDS = [
  'https://www.mandiant.com/resources/blog/rss.xml',
  'https://www.crowdstrike.com/blog/feed/',
  'https://www.recordedfuture.com/blog/rss.xml',
  'https://www.sans.org/security-awareness-training/feed/',
  'https://www.cybereason.com/blog/feed',
  'https://www.sentinelone.com/blog/feed/',
  'https://blogs.cisco.com/security/feed',
  'https://securityboulevard.com/feed/',
  'https://www.digitalshadows.com/blog/feed/',
  'https://www.socradar.io/feed/',
  'https://www.withsecure.com/en/blog/rss.xml',
  'https://www.trellix.com/about/newsroom/feed/',
  'https://blog.virustotal.com/feeds/posts/default',
];
const WINDOW_MS = 14 * 24 * 3600 * 1000;

export interface DiscoverDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export async function discoverMethodology(deps: DiscoverDeps): Promise<Candidate[]> {
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
        const key = topicKey('methodology', item.link || item.title);
        const dedup = await deps.getDedup(key);
        const score = finalScore({
          recency: recencyScore(item.date.toISOString(), deps.now),
          severity: severityScore({}),
          novelty: noveltyScore(dedup, deps.now),
          sourceWeight: 0.6,
        });
        out.push({
          key,
          type: 'methodology',
          title: item.title,
          rationale: `CTI methodology · ${feedHost} · ${item.date.toISOString().slice(0, 10)}`,
          score,
          evidence: { url: item.link, published: item.date.toISOString(), source: feed },
          discoveredAt: deps.now.toISOString(),
          status: 'pending',
        });
      }
    } catch (err) {
      console.warn(`discoverMethodology: feed failed ${feed}`, err);
    }
  }
  console.log(
    JSON.stringify({ job: 'discovery', runner: 'methodology', feedsTotal: FEEDS.length, feedsOk, items: out.length })
  );
  return out;
}

import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';
import { parseRssItems } from './rss-util';

const FEEDS = [
  'https://www.kitploit.com/feeds/posts/default',
  'https://kalilinuxtutorials.com/feed/',
  'https://www.darknet.org.uk/feed/',
  'https://www.hackingarticles.in/feed/',
  'https://pentesttools.net/feed/',
  'https://gbhackers.com/feed/',
  'https://blog.detectify.com/feed/',
  'https://www.blackhillsinfosec.com/feed/',
  'https://blog.holdmybeersecurity.com/feed/',
  'https://www.offsec.com/feed.xml',
  'https://blog.secureideas.com/feed/',
  'https://posts.specterops.io/feed',
  'https://blog.rapid7.com/feed/',
  'https://blog.thinkst.com/feeds/posts/default',
  'https://labs.watchtowr.com/feed/',
];
const WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface DiscoverDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export async function discoverTools(deps: DiscoverDeps): Promise<Candidate[]> {
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
        const key = topicKey('tool', item.link || item.title);
        const dedup = await deps.getDedup(key);
        const score = finalScore({
          recency: recencyScore(item.date.toISOString(), deps.now),
          severity: severityScore({}),
          novelty: noveltyScore(dedup, deps.now),
          sourceWeight: 0.6,
        });
        out.push({
          key,
          type: 'tool',
          title: item.title,
          rationale: `Cybersec tool · ${feedHost} · ${item.date.toISOString().slice(0, 10)}`,
          score,
          evidence: { url: item.link, published: item.date.toISOString(), source: feed },
          discoveredAt: deps.now.toISOString(),
          status: 'pending',
        });
      }
    } catch (err) {
      console.warn(`discoverTools: feed failed ${feed}`, err);
    }
  }
  console.log(
    JSON.stringify({ job: 'discovery', runner: 'tool', feedsTotal: FEEDS.length, feedsOk, items: out.length })
  );
  return out;
}

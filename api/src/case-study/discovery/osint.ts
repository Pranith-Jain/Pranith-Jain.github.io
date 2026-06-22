import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';
import { parseRssItems } from './rss-util';

const FEEDS = [
  'https://www.bellingcat.com/feed/',
  'https://osintteam.blog/feed',
  'https://nixintel.info/feed/',
  'https://hatless1der.com/feed/',
  'https://osintcurio.us/feed/',
  'https://inteltechniques.com/blog/feed/',
  'https://medium.com/feed/@osint-blog',
  'https://sector035.nl/feed/',
  'https://www.secjuice.com/feed/',
  'https://blog.haschek.at/feed/',
  'https://www.alec.fyi/feed/',
  'https://blacklanternsecurity.com/feed/',
  'https://osint.team/feed/',
  'https://osintbureau.com/feed/',
  'https://webbreacher.com/feed/',
];
const WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface DiscoverDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export async function discoverOsint(deps: DiscoverDeps): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const cutoff = deps.now.getTime() - WINDOW_MS;
  for (const feed of FEEDS) {
    try {
      const r = await deps.fetch(feed, {
        headers: {
          Accept: 'application/rss+xml, application/xml, */*',
          'User-Agent': 'pranithjain.qzz.io case-study-discovery',
        },
      });
      if (!r.ok) continue;
      const xml = await r.text();
      const feedHost = new URL(feed).hostname.replace(/^www\./, '');
      for (const item of parseRssItems(xml, deps.now)) {
        if (item.date.getTime() < cutoff) continue;
        const key = topicKey('osint', item.link || item.title);
        const dedup = await deps.getDedup(key);
        const score = finalScore({
          recency: recencyScore(item.date.toISOString(), deps.now),
          severity: severityScore({}),
          novelty: noveltyScore(dedup, deps.now),
          sourceWeight: 0.6,
        });
        out.push({
          key,
          type: 'osint',
          title: item.title,
          rationale: `OSINT tradecraft · ${feedHost} · ${item.date.toISOString().slice(0, 10)}`,
          score,
          evidence: { url: item.link, published: item.date.toISOString(), source: feed },
          discoveredAt: deps.now.toISOString(),
          status: 'pending',
        });
      }
    } catch (err) {
      console.warn(`discoverOsint: feed failed ${feed}`, err);
    }
  }
  return out;
}

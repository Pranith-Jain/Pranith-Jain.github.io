import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';
import { parseRssItems } from './rss-util';

/** Public consumer-fraud / scam alert feeds (no key). */
const FEEDS = ['https://krebsonsecurity.com/feed/', 'https://www.ic3.gov/PSA/RSS'];
const WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface DiscoverDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export async function discoverScams(deps: DiscoverDeps): Promise<Candidate[]> {
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
      for (const item of parseRssItems(xml, deps.now)) {
        if (item.date.getTime() < cutoff) continue;
        const key = topicKey('scam', item.title);
        const dedup = await deps.getDedup(key);
        const score = finalScore({
          recency: recencyScore(item.date.toISOString(), deps.now),
          severity: severityScore({}),
          novelty: noveltyScore(dedup, deps.now),
          sourceWeight: 0.7,
        });
        out.push({
          key,
          type: 'scam',
          title: item.title,
          rationale: `Consumer-fraud alert · ${item.date.toISOString().slice(0, 10)}`,
          score,
          evidence: { url: item.link, published: item.date.toISOString(), source: feed },
          discoveredAt: deps.now.toISOString(),
          status: 'pending',
        });
      }
    } catch (err) {
      console.warn(`discoverScams: feed failed ${feed}`, err);
    }
  }
  return out;
}

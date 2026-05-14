import type { Candidate, DedupRecord } from '../types';
import { actorKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const KNOWN_ACTORS = [
  'FIN7',
  'FIN8',
  'APT28',
  'APT29',
  'APT41',
  'Lazarus',
  'Sandworm',
  'Turla',
  'Volt Typhoon',
  'Salt Typhoon',
  'Scattered Spider',
  'UNC3886',
  'Mustang Panda',
  'Kimsuky',
  'Charming Kitten',
  'TA505',
  'TA577',
  'Cozy Bear',
  'Fancy Bear',
] as const;

const ITEM_RE = /<item[\s\S]*?<\/item>/g;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/;
const LINK_RE = /<link>([\s\S]*?)<\/link>/;
const PUB_RE = /<pubDate>([\s\S]*?)<\/pubDate>/;

export interface DiscoverActorsDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
  feeds: string[];
}

export async function discoverActors(deps: DiscoverActorsDeps): Promise<Candidate[]> {
  const mentions = new Map<string, { count: number; latest: Date; urls: string[]; titles: string[] }>();

  for (const feed of deps.feeds) {
    try {
      const r = await deps.fetch(feed);
      if (!r.ok) continue;
      const xml = await r.text();
      for (const item of xml.match(ITEM_RE) ?? []) {
        const title = (item.match(TITLE_RE)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        const link = (item.match(LINK_RE)?.[1] ?? '').trim();
        const pub = item.match(PUB_RE)?.[1];
        const pubDate = pub ? new Date(pub) : deps.now;
        for (const actor of KNOWN_ACTORS) {
          if (new RegExp(`\\b${actor}\\b`, 'i').test(title)) {
            const k = actorKey(actor);
            const e = mentions.get(k) ?? { count: 0, latest: new Date(0), urls: [], titles: [] };
            e.count += 1;
            if (pubDate > e.latest) e.latest = pubDate;
            e.urls.push(link);
            e.titles.push(title);
            mentions.set(k, e);
          }
        }
      }
    } catch (err) {
      console.warn(`discoverActors: feed failed ${feed}`, err);
    }
  }

  const out: Candidate[] = [];
  for (const [key, info] of mentions.entries()) {
    const dedup = await deps.getDedup(key);
    const score = finalScore({
      recency: recencyScore(info.latest.toISOString(), deps.now),
      severity: severityScore({ victims: info.count }),
      novelty: noveltyScore(dedup, deps.now),
      sourceWeight: 0.8,
    });
    const displayName = key.replace(/^actor-/, '').toUpperCase();
    out.push({
      key,
      type: 'actor',
      title: `${displayName} — recent activity`,
      rationale: `${info.count} mention(s) across vendor blogs in last 7 days`,
      score,
      evidence: { mentions: info.count, latest: info.latest.toISOString(), urls: info.urls, titles: info.titles },
      discoveredAt: deps.now.toISOString(),
      status: 'pending',
    });
  }
  return out;
}

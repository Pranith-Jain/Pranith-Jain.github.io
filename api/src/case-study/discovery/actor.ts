import type { Candidate, DedupRecord } from '../types';
import { actorKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const KNOWN_ACTORS = [
  'APT28',
  'APT29',
  'APT33',
  'APT34',
  'APT38',
  'APT39',
  'APT41',
  'Lazarus',
  'Kimsuky',
  'Scattered Spider',
  'Mustang Panda',
  'Volt Typhoon',
  'Salt Typhoon',
  'MuddyWater',
  'OilRig',
  'Sandworm',
  'Turla',
  'Cozy Bear',
  'Fancy Bear',
  'UNC1151',
  'UNC3886',
  'UNC3944',
  'UNC4990',
  'UNC757',
  'UNC2596',
  'Charming Kitten',
  'TA453',
  'TA444',
  'TA446',
  'TA505',
  'TA577',
  'DarkHotel',
  'Winnti',
  'menuPass',
  'Bitter',
  'Transparent Tribe',
  'Secret Blizzard',
  'ShinyHunters',
  'BlackCat',
  'ALPHV',
  'LockBit',
  'Clop',
  'Cl0p',
  'Play',
  'Black Basta',
  'Akira',
  'BianLian',
  'RansomHub',
  'Rhysida',
  'Qilin',
  'Fog',
  'CORDIAL SPIDER',
  'SILVER SPIDER',
  'FIN7',
  'FIN8',
] as const;

const ACTOR_RE = KNOWN_ACTORS.map((name) => ({ name, re: new RegExp(`\\b${name}\\b`, 'i') }));

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
        for (const { name: actor, re } of ACTOR_RE) {
          if (re.test(title)) {
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

import type { Candidate, DedupRecord } from '../types';
import { ransomKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

export interface Victim {
  group: string;
  victim: string;
  postedAt: string;
  url?: string;
}

export interface DiscoverRansomwareDeps {
  fetchVictims: () => Promise<Victim[]>;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export async function discoverRansomware(deps: DiscoverRansomwareDeps): Promise<Candidate[]> {
  let victims: Victim[] = [];
  try {
    victims = await deps.fetchVictims();
  } catch (err) {
    console.warn('discoverRansomware: fetchVictims failed', err);
    return [];
  }

  const sevenDaysAgo = new Date(deps.now.getTime() - 7 * 24 * 3600 * 1000);
  const groups = new Map<string, { victims: Victim[]; latest: Date }>();
  for (const v of victims) {
    const posted = new Date(v.postedAt);
    if (posted < sevenDaysAgo) continue;
    const k = ransomKey(v.group, deps.now);
    const e = groups.get(k) ?? { victims: [], latest: new Date(0) };
    e.victims.push(v);
    if (posted > e.latest) e.latest = posted;
    groups.set(k, e);
  }

  const out: Candidate[] = [];
  for (const [key, info] of groups.entries()) {
    const dedup = await deps.getDedup(key);
    const score = finalScore({
      recency: recencyScore(info.latest.toISOString(), deps.now),
      severity: severityScore({ victims: info.victims.length }),
      novelty: noveltyScore(dedup, deps.now),
      sourceWeight: 0.9,
    });
    const display = info.victims[0].group;
    out.push({
      key,
      type: 'ransom',
      title: `${display} — ${info.victims.length} new victims this week`,
      rationale: `${info.victims.length} victim post(s) on leak site in last 7 days`,
      score,
      evidence: {
        group: display,
        victimCount: info.victims.length,
        latest: info.latest.toISOString(),
        victims: info.victims.slice(0, 20),
      },
      discoveredAt: deps.now.toISOString(),
      status: 'pending',
    });
  }
  return out;
}

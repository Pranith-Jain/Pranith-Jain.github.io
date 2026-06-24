import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const HIBP_URL = 'https://haveibeenpwned.com/api/v3/breaches';
const WINDOW_MS = 7 * 24 * 3600 * 1000;

interface HibpBreach {
  Name: string;
  Title: string;
  Domain?: string;
  BreachDate?: string;
  AddedDate?: string;
  PwnCount?: number;
  Description?: string;
  DataClasses?: string[];
  IsVerified?: boolean;
  IsRetired?: boolean;
  IsSpamList?: boolean;
}

export interface DiscoverDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

/** Recent public breach disclosures (Have I Been Pwned), AddedDate ≤ 7d. */
export async function discoverBreaches(deps: DiscoverDeps): Promise<Candidate[]> {
  const out: Candidate[] = [];
  try {
    const r = await deps.fetch(HIBP_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'pranithjain.qzz.io case-study-discovery' },
    });
    if (!r.ok) throw new Error(`HIBP fetch ${r.status}`);
    const all = (await r.json()) as HibpBreach[];
    const cutoff = deps.now.getTime() - WINDOW_MS;
    for (const b of all) {
      if (b.IsRetired || b.IsSpamList || !b.AddedDate) continue;
      const added = new Date(b.AddedDate).getTime();
      if (!Number.isFinite(added) || added < cutoff) continue;
      const key = topicKey('breach', b.Name);
      const dedup = await deps.getDedup(key);
      const score = finalScore({
        recency: recencyScore(b.AddedDate, deps.now),
        severity: severityScore({ victims: (b.PwnCount ?? 0) / 1_000_000 }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.85,
      });
      out.push({
        key,
        type: 'breach',
        title: `${b.Title} — ${(b.PwnCount ?? 0).toLocaleString()} accounts breached`,
        rationale: `Disclosed ${b.AddedDate?.slice(0, 10)} · ${(b.DataClasses ?? []).slice(0, 4).join(', ')}`,
        score,
        evidence: {
          name: b.Name,
          domain: b.Domain,
          pwnCount: b.PwnCount,
          breachDate: b.BreachDate,
          addedDate: b.AddedDate,
          dataClasses: b.DataClasses,
          verified: !!b.IsVerified,
          description: b.Description,
          url: `https://haveibeenpwned.com/PwnedWebsites#${encodeURIComponent(b.Name)}`,
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }
  } catch (err) {
    console.warn('discoverBreaches failed', err);
  }
  return out;
}

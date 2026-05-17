/**
 * Shared case-study pipeline runners. One wiring of the discovery /
 * planner / publisher orchestrators, used by BOTH the cron handler
 * (worker/index.ts `scheduled`) and the manual admin trigger endpoints
 * (`POST /api/v1/admin/run/:stage`). Keep the two callers DRY — the cron
 * blocks must not re-implement dep wiring.
 */
import { runDiscovery } from './discovery';
import { discoverCves } from './discovery/cve';
import { discoverActors } from './discovery/actor';
import { discoverMalware } from './discovery/malware';
import { discoverRansomware } from './discovery/ransomware';
import { discoverBreaches } from './discovery/breach';
import { discoverScams } from './discovery/scam';
import { discoverAiSec } from './discovery/aisec';
import { discoverIntel } from './discovery/intel';
import { discoverBriefing } from './discovery/briefing';
import { runPlanner } from './publishing/planner';
import { runPublisher } from './publishing/publisher';
import { putCandidate } from './storage/candidates';
import { listApproved, getApproved, unapprove } from './storage/approved';
import { setSchedule, markSlotStatus, pickDueSlot } from './storage/schedule';
import { loadDedupMap, touchDedup, touchDedupMany } from './storage/dedup';
import { putPost, listPostIndex } from './storage/posts';
import { recordFailure } from './storage/failed';
import { renderRss } from './rendering/rss';
import { generatePost } from './generation';
import { kv as csKvKeys } from './kv-keys';
import { ACTOR_RSS_FEEDS, SITE_URL } from './config';
import { fetchRecentVictims } from './ransom-source';
import type { D1Database } from '@cloudflare/workers-types';

/** The subset of bindings the case-study pipeline needs. */
export interface CaseStudyEnv {
  CASE_STUDIES: KVNamespace;
  AI: unknown;
  ABUSECH_AUTH_KEY?: string;
  BRIEFINGS_DB?: D1Database;
}

export async function runDiscoveryNow(env: CaseStudyEnv, now: Date) {
  // Load the dedup map ONCE. Every runner scores novelty against this
  // in-memory snapshot — 0 KV reads in the runners (was ~1 read per
  // candidate, ~80-150 reads per daily run).
  const dedupMap = await loadDedupMap(env.CASE_STUDIES);
  const memGet = (k: string) => Promise.resolve(dedupMap[k] ?? null);
  return runDiscovery({
    runners: {
      cve: () => discoverCves({ fetch: globalThis.fetch, now, getDedup: memGet }),
      actor: () =>
        discoverActors({
          fetch: globalThis.fetch,
          now,
          getDedup: memGet,
          feeds: ACTOR_RSS_FEEDS,
        }),
      malware: () =>
        discoverMalware({
          fetch: globalThis.fetch,
          now,
          getDedup: memGet,
          abuseChKey: env.ABUSECH_AUTH_KEY ?? '',
        }),
      ransom: () =>
        discoverRansomware({
          fetchVictims: () => fetchRecentVictims(globalThis.fetch),
          now,
          getDedup: memGet,
        }),
      breach: () => discoverBreaches({ fetch: globalThis.fetch, now, getDedup: memGet }),
      scam: () => discoverScams({ fetch: globalThis.fetch, now, getDedup: memGet }),
      aisec: () => discoverAiSec({ fetch: globalThis.fetch, now, getDedup: memGet }),
      intel: () => discoverIntel({ fetch: globalThis.fetch, now, getDedup: memGet }),
      briefing: () =>
        env.BRIEFINGS_DB
          ? discoverBriefing({ briefingsDb: env.BRIEFINGS_DB, now, getDedup: memGet })
          : Promise.resolve([]),
    },
    putCandidate: (c) => putCandidate(env.CASE_STUDIES, c),
    commitDedup: (keys, n) => touchDedupMany(env.CASE_STUDIES, keys, n),
    now,
  });
}

export function runPlannerNow(env: CaseStudyEnv, now: Date) {
  return runPlanner({
    listApproved: () => listApproved(env.CASE_STUDIES),
    setSchedule: (slots) => setSchedule(env.CASE_STUDIES, slots),
    now,
    random: Math.random,
  });
}

export function runPublisherNow(env: CaseStudyEnv, now: Date) {
  return runPublisher({
    pickDueSlot: (n) => pickDueSlot(env.CASE_STUDIES, n),
    markSlotStatus: (cid, status, extras) => markSlotStatus(env.CASE_STUDIES, cid, status, extras),
    getApproved: (k) => getApproved(env.CASE_STUDIES, k),
    unapprove: (k) => unapprove(env.CASE_STUDIES, k),
    generatePost: (cand, n) => generatePost({ candidate: cand, ai: env.AI as never, now: n }),
    putPost: (p) => putPost(env.CASE_STUDIES, p),
    refreshRss: async () => {
      // RSS only needs index-level fields — render straight from the posts
      // index (1 KV read) instead of fan-out-reading every full post.
      const rss = renderRss(await listPostIndex(env.CASE_STUDIES), { siteUrl: SITE_URL });
      await env.CASE_STUDIES.put(csKvKeys.metaRss, rss);
    },
    touchDedup: (k, when, slug) => touchDedup(env.CASE_STUDIES, k, when, slug),
    recordFailure: (rec) => recordFailure(env.CASE_STUDIES, rec),
    now,
  });
}

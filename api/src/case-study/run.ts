/**
 * Shared case-study pipeline runners. One wiring of the discovery /
 * planner / publisher orchestrators, used by BOTH the cron handler
 * (worker/index.ts `scheduled`) and the manual admin trigger endpoints
 * (`POST /api/v1/admin/run/:stage`). Keep the two callers DRY — the cron
 * blocks must not re-implement dep wiring.
 */
import { runDiscovery } from './discovery';
import { mulberry32, dateSeed, weightedSampleByScore } from './discovery/sampling';
import { discoverCves } from './discovery/cve';
import { discoverActors } from './discovery/actor';
import { discoverMalware } from './discovery/malware';
import { discoverRansomware } from './discovery/ransomware';
import { discoverReleaks, type ReleakRow } from './discovery/releak';
import { discoverBreaches } from './discovery/breach';
import { discoverScams } from './discovery/scam';
import { discoverAiSec } from './discovery/aisec';
import { discoverIntel } from './discovery/intel';
import { discoverBriefing } from './discovery/briefing';
import { discoverFromPlatformData } from './discovery/platform-data';
import { runPlanner } from './publishing/planner';
import { runPublisher } from './publishing/publisher';
import { putCandidate } from './storage/candidates';
import { listApproved, getApproved, unapprove } from './storage/approved';
import { setSchedule, markSlotStatus, pickDueSlot } from './storage/schedule';
import { loadDedupMap, touchDedup, touchDedupMany, isKeySuppressed } from './storage/dedup';
import { putPost, listPostIndex } from './storage/posts';
import { putDraft } from './storage/drafts';
import { recordFailure } from './storage/failed';
import { renderRss } from './rendering/rss';
import { generatePost } from './generation';
import { kv as csKvKeys } from './kv-keys';
import { ACTOR_RSS_FEEDS } from './config';
import { getSiteUrl } from '../lib/site-config';
import { fetchRecentVictims } from './ransom-source';
import type { D1Database } from '@cloudflare/workers-types';

/** The subset of bindings the case-study pipeline needs. */
export interface CaseStudyEnv {
  CASE_STUDIES: KVNamespace;
  AI: unknown;
  ABUSECH_AUTH_KEY?: string;
  BRIEFINGS_DB?: D1Database;
  GROQ_API_KEY?: string;
  SITE_URL?: string;
  /**
   * When set to the literal "true" (string from `wrangler secret` or
   * `wrangler.jsonc#vars`), the publisher writes every new post to the
   * `drafts:` namespace instead of publishing. An admin promotes drafts
   * via /api/v1/admin/case-study/drafts/:slug/approve. Anything else
   * (unset, "false", "0") leaves the existing auto-publish behaviour.
   */
  BLOG_APPROVAL_REQUIRED?: string;
  /**
   * Threat-intel provider keys for layer-2 IOC validation at QA time.
   * Each is optional and degrades independently. When ALL are unset
   * the validation step is a no-op (the post-process layer-1 placeholder
   * filter stays the only IOC truth defence).
   */
  VT_API_KEY?: string;
  ABUSEIPDB_API_KEY?: string;
}

export async function runDiscoveryNow(env: CaseStudyEnv, now: Date) {
  // Graceful skip when CASE_STUDIES is unbound (local dev, half-provisioned
  // preview env). Previously a missing binding would surface as a KVNamespace
  // method-on-undefined crash inside loadDedupMap; the cron `.catch` logger
  // would catch it but the failure looks like a code bug rather than a
  // configuration gap. Explicit skip + structured log makes the cause clear.
  if (!env.CASE_STUDIES) {
    console.warn(JSON.stringify({ job: 'discovery', status: 'skipped_no_kv' }));
    return { total: 0, kept: 0, suppressed: 0, ids: [] as string[], byTopic: {} as Record<string, number> };
  }
  // Load the dedup map ONCE. Every runner scores novelty against this
  // in-memory snapshot — 0 KV reads in the runners (was ~1 read per
  // candidate, ~80-150 reads per daily run).
  const dedupMap = await loadDedupMap(env.CASE_STUDIES);
  const memGet = (k: string) => Promise.resolve(dedupMap[k] ?? null);
  // Anti-repetition gate. The earlier version hard-dropped ANY key seen in
  // 21d — but `commitDedup` marks every *kept* candidate seen, so topics
  // with stable keys (cve/actor/malware/briefing) got fully starved within
  // days and discovery collapsed to one topic. Correct model:
  //   - PUBLISHED key  → hard-suppress for 60d (never republish the same
  //     story). `publishedSlug` is set only by the publisher's touchDedup.
  //   - merely surfaced (kept, not published) → NO hard gate. noveltyScore
  //     already soft-deweights it so it won't dominate, but the topic keeps
  //     producing instead of going silent for weeks.
  const REPUBLISH_BLOCK_MS = 60 * 24 * 3600 * 1000;
  const isSuppressed = (key: string): boolean => isKeySuppressed(dedupMap[key] ?? null, now, REPUBLISH_BLOCK_MS);
  // One rand stream per run, seeded by the UTC date: stable within a day,
  // different the next. Weighted by score so high-value items stay likely
  // (and the single top item is guaranteed) without freezing the queue.
  const rand = mulberry32(dateSeed(now));
  const selectPerTopic = (cands: Parameters<typeof weightedSampleByScore>[0], k: number) =>
    weightedSampleByScore(cands, k, rand);
  return runDiscovery({
    selectPerTopic,
    isSuppressed,
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
      releak: () =>
        discoverReleaks({
          // Re-uses the existing /api/v1/victim-releaks surface — same data
          // that powers /threatintel/re-leaks, already 6h edge-cached so
          // the cron fan-out cost is one cheap GET per discovery run.
          fetchReleaks: async () => {
            try {
              const r = await globalThis.fetch(`${getSiteUrl(env)}/api/v1/victim-releaks`);
              if (!r.ok) return [];
              const data = (await r.json()) as { releaks?: ReleakRow[] };
              return data.releaks ?? [];
            } catch {
              return [];
            }
          },
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
      // Platform data: uses the platform's own aggregated intelligence
      // (ransomware.live, Telegram leaks, IOC trending, threat pulse)
      // instead of external RSS feeds. Higher source weight because it's
      // our own curated data.
      platform: () =>
        discoverFromPlatformData({
          apiFetch: async (path) => {
            const url = `${getSiteUrl(env)}${path}`;
            const r = await globalThis.fetch(url);
            if (!r.ok) return null;
            return r.json();
          },
          now,
          getDedup: memGet,
        }),
    },
    putCandidate: (c) => putCandidate(env.CASE_STUDIES, c),
    commitDedup: (keys, n) => touchDedupMany(env.CASE_STUDIES, keys, n),
    now,
  });
}

export function runPlannerNow(env: CaseStudyEnv, now: Date) {
  if (!env.CASE_STUDIES) {
    console.warn(JSON.stringify({ job: 'planner', status: 'skipped_no_kv' }));
    return Promise.resolve({ scheduled: [] as { candidateId: string; slotAt: string }[] });
  }
  return runPlanner({
    listApproved: () => listApproved(env.CASE_STUDIES),
    setSchedule: (slots) => setSchedule(env.CASE_STUDIES, slots),
    now,
    random: Math.random,
  });
}

export function runPublisherNow(env: CaseStudyEnv, now: Date) {
  if (!env.CASE_STUDIES) {
    console.warn(JSON.stringify({ job: 'publisher', status: 'skipped_no_kv' }));
    return Promise.resolve({ published: null as unknown });
  }
  const requireApproval = env.BLOG_APPROVAL_REQUIRED === 'true';
  // Build the optional validation-env once; pass undefined when no
  // provider keys are set so the validator's fast-path short-circuits.
  const validationEnv =
    env.VT_API_KEY || env.ABUSEIPDB_API_KEY || env.ABUSECH_AUTH_KEY
      ? { VT_API_KEY: env.VT_API_KEY, ABUSEIPDB_API_KEY: env.ABUSEIPDB_API_KEY, ABUSECH_AUTH_KEY: env.ABUSECH_AUTH_KEY }
      : undefined;
  return runPublisher({
    pickDueSlot: (n) => pickDueSlot(env.CASE_STUDIES, n),
    markSlotStatus: (cid, status, extras) => markSlotStatus(env.CASE_STUDIES, cid, status, extras),
    getApproved: (k) => getApproved(env.CASE_STUDIES, k),
    unapprove: (k) => unapprove(env.CASE_STUDIES, k),
    generatePost: (cand, n) =>
      generatePost({ candidate: cand, ai: env.AI as never, now: n, groqKey: env.GROQ_API_KEY, validationEnv }),
    putPost: (p) => putPost(env.CASE_STUDIES, p),
    putDraft: (p) => putDraft(env.CASE_STUDIES, p),
    refreshRss: async () => {
      // RSS only needs index-level fields — render straight from the posts
      // index (1 KV read) instead of fan-out-reading every full post.
      const rss = renderRss(await listPostIndex(env.CASE_STUDIES), { siteUrl: getSiteUrl(env) });
      await env.CASE_STUDIES.put(csKvKeys.metaRss, rss);
    },
    touchDedup: (k, when, slug) => touchDedup(env.CASE_STUDIES, k, when, slug),
    recordFailure: (rec) => recordFailure(env.CASE_STUDIES, rec),
    now,
    requireApproval,
  });
}

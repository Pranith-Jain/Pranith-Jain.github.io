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
import { discoverOsint } from './discovery/osint';
import { discoverMethodology } from './discovery/methodology';
import { discoverCybersecNews } from './discovery/cybersec-news';
import { discoverTools } from './discovery/tools';
import { discoverBriefing } from './discovery/briefing';
import {
  discoverFromTelegramLeaks,
  discoverFromTrendingIocs,
  discoverFromThreatPulse,
} from './discovery/platform-data';
import { discoverAdvisories } from './discovery/advisories';
import { discoverVulnCheckKev } from './discovery/vulncheck';
import { discoverEuvd } from './discovery/euvd';
import { discoverAgenticTrends } from './discovery/agentic-trends';
import { discoverPhishuntHunts } from './discovery/phishunt';
import { activeRunnerNames } from './discovery/rotation';
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
import { generateSocialContent } from './generation/social';
import { kv as csKvKeys } from './kv-keys';
import { ACTOR_RSS_FEEDS, ADVISORY_RSS_FEEDS } from './config';
import { getSiteUrl } from '../lib/site-config';
import { fetchRecentVictims } from './ransom-source';
import type { D1Database } from '@cloudflare/workers-types';
import type { Candidate } from './types';

/** The subset of bindings the case-study pipeline needs. */
export interface CaseStudyEnv {
  CASE_STUDIES: KVNamespace;
  AI: unknown;
  ABUSECH_AUTH_KEY?: string;
  BRIEFINGS_DB?: D1Database;
  GROQ_API_KEY?: string;
  /** Free VulnCheck Community token. Absent = VulnCheck KEV runner is a no-op. */
  VULNCHECK_API_TOKEN?: string;
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
  /** Self-referencing service binding — same Worker, in-process.
   *  Used by the platform-data discovery runner to call /api/v1/*
   *  without going through the public URL + API-key gate. */
  SELF?: { fetch: (req: RequestInfo, init?: RequestInit) => Promise<Response> };
}

export async function runDiscoveryNow(env: CaseStudyEnv, now: Date) {
  // Graceful skip when CASE_STUDIES is unbound (local dev, half-provisioned
  // preview env). Previously a missing binding would surface as a KVNamespace
  // method-on-undefined crash inside loadDedupMap; the cron `.catch` logger
  // would catch it but the failure looks like a code bug rather than a
  // configuration gap. Explicit skip + structured log makes the cause clear.
  if (!env.CASE_STUDIES) {
    console.warn(JSON.stringify({ job: 'discovery', status: 'skipped_no_kv' }));
    return {
      total: 0,
      kept: 0,
      suppressed: 0,
      deduped: 0,
      ids: [] as string[],
      byTopic: {} as Record<string, number>,
      byTopicSelected: {} as Record<string, number>,
    };
  }
  // Load the dedup map ONCE. Every runner scores novelty against this
  // in-memory snapshot — 0 KV reads in the runners (was ~1 read per
  // candidate, ~80-150 reads per daily run).
  const dedupMap = await loadDedupMap(env.CASE_STUDIES);
  const memGet = (k: string) => Promise.resolve(dedupMap[k] ?? null);
  // Anti-repetition gate. Two suppression windows:
  //   - PUBLISHED key  → hard-suppress for 30d (never republish the same story)
  //   - Surfaced (kept, not published) → hard-suppress for 7d to prevent the
  //     same candidates from appearing in every daily run. Without this,
  //     high-severity items (CVE 0.99, ransomware groups) keep dominating
  //     because noveltyScore only soft-deweights them.
  //   - alreadyCoveredTopics: dedup keys surfaced in the last 14 days, fed
  //     into the agentic-trends prompt so the LLM actively avoids them.
  const REPUBLISH_BLOCK_MS = 30 * 24 * 3600 * 1000;
  const SURFACED_BLOCK_MS = 14 * 24 * 3600 * 1000;
  const isSuppressed = (key: string): boolean =>
    isKeySuppressed(dedupMap[key] ?? null, now, REPUBLISH_BLOCK_MS, SURFACED_BLOCK_MS);
  // Build a list of recently-covered topic keys so the agentic-trends LLM
  // can avoid repeating them. Extract keys surfaced in the last 14 days.
  const alreadyCoveredTopics: string[] = [];
  const coveredCutoff = now.getTime() - SURFACED_BLOCK_MS;
  for (const [key, rec] of Object.entries(dedupMap)) {
    const t = Date.parse(rec.lastSeenAt);
    if (!Number.isNaN(t) && t >= coveredCutoff) alreadyCoveredTopics.push(key);
  }
  // One rand stream per run, seeded by the UTC date: stable within a day,
  // different the next. Weighted by score so high-value items stay likely
  // (and the single top item is guaranteed) without freezing the queue.
  const rand = mulberry32(dateSeed(now));
  const selectPerTopic = (cands: Parameters<typeof weightedSampleByScore>[0], k: number) =>
    weightedSampleByScore(cands, k, rand);

  // Fetch real trending context from the platform to ground the agentic-trends
  // LLM prompt. Without this, the LLM hallucinates from training data and
  // produces similar output every day. Gracefully degrades to empty string
  // when the fetch fails or SELF binding is unavailable.
  const trendingContext = await (async (): Promise<string> => {
    try {
      const fetcher = env.SELF ?? { fetch: globalThis.fetch };
      const endpoints = [
        '/api/v1/cisa-kev',
        '/api/v1/ransomware-recent?limit=7',
        '/api/v1/global-pulse',
        '/api/v1/breach-disclosures?limit=5',
        '/api/v1/writeups?limit=5',
        '/api/v1/x-claims?limit=5',
        '/api/v1/reddit-feed?limit=5',
      ];
      const results = await Promise.allSettled(
        endpoints.map((path) =>
          fetcher.fetch(new Request(`https://pranithjain.qzz.io${path}`)).then((r) => (r.ok ? r.json() : null))
        )
      );
      const parts: string[] = [];
      const kevData = results[0]?.status === 'fulfilled' ? results[0].value : null;
      if (kevData && typeof kevData === 'object' && 'vulnerabilities' in (kevData as Record<string, unknown>)) {
        const vulns = (kevData as Record<string, unknown>).vulnerabilities;
        if (Array.isArray(vulns) && vulns.length > 0) {
          parts.push(
            'KEV: ' + JSON.stringify(vulns.slice(0, 5).map((v: Record<string, unknown>) => v.cveId ?? v.id ?? v))
          );
        }
      }
      const ransomData = results[1]?.status === 'fulfilled' ? results[1].value : null;
      if (ransomData && typeof ransomData === 'object' && 'victims' in (ransomData as Record<string, unknown>)) {
        const victims = (ransomData as Record<string, unknown>).victims;
        if (Array.isArray(victims) && victims.length > 0) {
          const top = victims.slice(0, 5).map((v: Record<string, unknown>) => `${v.group ?? '?'}:${v.victim ?? '?'}`);
          parts.push('Ransom: ' + top.join('; '));
        }
      }
      const pulseData = results[2]?.status === 'fulfilled' ? results[2].value : null;
      if (pulseData && typeof pulseData === 'object') {
        const pd = pulseData as Record<string, unknown>;
        const s: string[] = [];
        if (typeof pd.totalEvents === 'number') s.push(`ev:${pd.totalEvents}`);
        if (typeof pd.ransomwareCount === 'number') s.push(`ransom:${pd.ransomwareCount}`);
        if (typeof pd.iocCount === 'number') s.push(`iocs:${pd.iocCount}`);
        if (s.length > 0) parts.push('Pulse: ' + s.join(' '));
      }
      const breachData = results[3]?.status === 'fulfilled' ? results[3].value : null;
      if (breachData && typeof breachData === 'object') {
        const items = (breachData as Record<string, unknown>).items ?? (breachData as Record<string, unknown>).breaches;
        if (Array.isArray(items) && items.length > 0) {
          parts.push('Breaches: ' + JSON.stringify(items.slice(0, 3)));
        }
      }
      const writeupData = results[4]?.status === 'fulfilled' ? results[4].value : null;
      if (writeupData && typeof writeupData === 'object') {
        const items =
          (writeupData as Record<string, unknown>).items ?? (writeupData as Record<string, unknown>).writeups;
        if (Array.isArray(items) && items.length > 0) {
          const titles = (items as Array<Record<string, unknown>>)
            .slice(0, 3)
            .map((w) => w.title ?? w)
            .filter(Boolean);
          if (titles.length > 0) parts.push('Writeups: ' + titles.join(' | '));
        }
      }
      const xData = results[5]?.status === 'fulfilled' ? results[5].value : null;
      if (xData && typeof xData === 'object') {
        const items = (xData as Record<string, unknown>).items ?? (xData as Record<string, unknown>).claims;
        if (Array.isArray(items) && items.length > 0) {
          parts.push('X: ' + JSON.stringify(items.slice(0, 3)));
        }
      }
      const redditData = results[6]?.status === 'fulfilled' ? results[6].value : null;
      if (redditData && typeof redditData === 'object') {
        const items = (redditData as Record<string, unknown>).items ?? (redditData as Record<string, unknown>).posts;
        if (Array.isArray(items) && items.length > 0 && (items[0] as Record<string, unknown>)?.title) {
          parts.push(
            'Reddit: ' +
              (items as Array<Record<string, unknown>>)
                .slice(0, 3)
                .map((p) => p.title)
                .join(' | ')
          );
        }
      }
      return parts.join('\n');
    } catch {
      return '';
    }
  })();

  // Shared platform API fetch — uses SELF service binding for in-process
  // calls so /api/v1/* endpoints don't hit the public API-key gate.
  const apiFetch: (path: string) => Promise<unknown> = async (path) => {
    try {
      const url = `https://pranithjain.qzz.io${path}`;
      const r = env.SELF ? await env.SELF.fetch(new Request(url)) : await globalThis.fetch(new Request(url));
      if (!r.ok) return null;
      return r.json();
    } catch {
      return null;
    }
  };

  const allRunners: Record<string, () => Promise<Candidate[]>> = {
    vulncheck: () =>
      discoverVulnCheckKev({ fetch: globalThis.fetch, now, getDedup: memGet, token: env.VULNCHECK_API_TOKEN ?? '' }),
    cve: () => discoverCves({ fetch: globalThis.fetch, now, getDedup: memGet }),
    actor: () => discoverActors({ fetch: globalThis.fetch, now, getDedup: memGet, feeds: ACTOR_RSS_FEEDS }),
    malware: () =>
      discoverMalware({ fetch: globalThis.fetch, now, getDedup: memGet, abuseChKey: env.ABUSECH_AUTH_KEY ?? '' }),
    ransom: () =>
      discoverRansomware({ fetchVictims: () => fetchRecentVictims(globalThis.fetch), now, getDedup: memGet }),
    releak: () =>
      discoverReleaks({
        // Re-uses the existing /api/v1/victim-releaks surface — same data
        // that powers /threatintel/re-leaks, already 6h edge-cached so
        // the cron fan-out cost is one cheap GET per discovery run.
        // Uses SELF service binding to bypass the public API-key gate.
        fetchReleaks: async () => {
          try {
            const url = `/api/v1/victim-releaks`;
            const r = env.SELF
              ? await env.SELF.fetch(new Request(`https://pranithjain.qzz.io${url}`))
              : await globalThis.fetch(new Request(`https://pranithjain.qzz.io${url}`));
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
    advisories: () => discoverAdvisories({ fetch: globalThis.fetch, now, getDedup: memGet, feeds: ADVISORY_RSS_FEEDS }),
    osint: () => discoverOsint({ fetch: globalThis.fetch, now, getDedup: memGet }),
    methodology: () => discoverMethodology({ fetch: globalThis.fetch, now, getDedup: memGet }),
    news: () => discoverCybersecNews({ fetch: globalThis.fetch, now, getDedup: memGet }),
    tool: () => discoverTools({ fetch: globalThis.fetch, now, getDedup: memGet }),
    euvd: () => discoverEuvd({ fetch: globalThis.fetch, now, getDedup: memGet }),
    briefing: () =>
      env.BRIEFINGS_DB
        ? discoverBriefing({ briefingsDb: env.BRIEFINGS_DB, now, getDedup: memGet })
        : Promise.resolve([]),
    // Platform data runners (split by source so each gets its own
    // perTopic budget instead of sharing 3 slots total).
    platformTelegram: () => discoverFromTelegramLeaks({ apiFetch, now, getDedup: memGet }),
    platformIocs: () => discoverFromTrendingIocs({ apiFetch, now, getDedup: memGet }),
    platformPulse: () => discoverFromThreatPulse({ apiFetch, now, getDedup: memGet }),
    // Agentic trends: uses LLM to discover trending cybersecurity content
    // beyond the configured RSS/API sources. Produces high-quality candidates
    // with hooks, angles, and trending signals. Falls back gracefully when
    // the LLM call fails (returns empty array).
    // trendingContext feeds real platform data into the prompt so the LLM
    // has actual current events to work with instead of hallucinating.
    // alreadyCoveredTopics tells the LLM what topics were recently surfaced
    // so it actively avoids repeating them.
    // Phishunt: free, no-auth phishing feed with enriched data (IP, ASN, TLS,
    // detection sources). Surfaces brand impersonation campaigns and critical
    // phishing sites flagged by multiple detection engines.
    phish: () =>
      discoverPhishuntHunts({
        fetchPhishunt: async () => {
          try {
            const r = await fetch('https://phishunt.io/api/v1/domains?limit=100');
            if (!r.ok) return [];
            const data = (await r.json()) as { results?: Array<Record<string, unknown>> };
            return (data.results ?? []).map((item) => ({
              url: String(item.url ?? ''),
              domain: String(item.domain ?? ''),
              company: String(item.company ?? 'unknown'),
              date: String(item.date ?? item.first_seen ?? new Date().toISOString()),
              first_seen: String(item.first_seen ?? item.date ?? new Date().toISOString()),
              ip: String(item.ip ?? ''),
              country: String(item.country ?? ''),
              asn: String(item.asn ?? ''),
              org: String(item.org ?? ''),
              cert: String(item.cert ?? ''),
              malicious_google: Boolean(item.malicious_google),
              malicious_openphish: Boolean(item.malicious_openphish),
              malicious_phishtank: Boolean(item.malicious_phishtank),
              malicious_tweetfeed: Boolean(item.malicious_tweetfeed),
              malicious_urlscan: Boolean(item.malicious_urlscan),
            }));
          } catch {
            return [];
          }
        },
        now,
        getDedup: memGet,
      }),
    trends: () =>
      discoverAgenticTrends({
        now,
        getDedup: memGet,
        groqKey: env.GROQ_API_KEY,
        trendingContext,
        alreadyCoveredTopics,
      }),
  };
  // Discovery diversity model (2026-06-22 — platform split into 3):
  //   - 8 high-value "always-on" topics: `cve`, `actor`, `ransom`,
  //     `phish`, `trends`, and 3 platform sub-runners (telegram, iocs,
  //     pulse). Platform split gives each source its own perTopic budget.
  //   - The remaining ~14 optional topics partition into 6 day-buckets
  //     (rotation.ts), so each day surfaces ~2 of them.
  //   - Total per day: 8 always + 2 rotating = ~10 topics.
  //   - perTopic=2: each topic contributes up to 2 candidates, ensuring
  //     at least 10 different categories per run.
  //   - trends=3: fewer LLM candidates, higher quality bar enforced by
  //     dedup-avoidance list fed into the prompt.
  const ALWAYS_ON = new Set([
    'cve',
    'actor',
    'ransom',
    'platformTelegram',
    'platformIocs',
    'platformPulse',
    'phish',
    'trends',
  ]);
  // 6 rotation groups: with ~10 optional runners, each runs once every 6 days
  // This ensures variety while keeping daily subrequest count manageable
  const active = new Set(activeRunnerNames(Object.keys(allRunners), ALWAYS_ON, now, 6));
  const runners = Object.fromEntries(Object.entries(allRunners).filter(([name]) => active.has(name)));

  return runDiscovery({
    selectPerTopic,
    isSuppressed,
    runners,
    putCandidate: (c) => putCandidate(env.CASE_STUDIES, c),
    commitDedup: (keys, n) => touchDedupMany(env.CASE_STUDIES, keys, n),
    now,
    // Diversity controls (2026-06-11):
    //   - perTopic=2: each topic contributes up to 2. With 10 topics running
    //     per day (8 always-on + ~2 rotating), this ensures at least 10
    //     different categories surface in every discovery run.
    //   - limit=24: comfortable for ~10 active topics × 2, with headroom for
    //     trending context items.
    //   - trends=3: fewer LLM candidates; quality enforced via dedup-
    //     avoidance, category rotation, and real trending data injection.
    perTopic: 2,
    limit: 24,
    perTopicOverride: { trends: 3 },
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

/**
 * Fire-and-forget social copy generation for a published post.
 * Reads the post from KV, generates Twitter + LinkedIn content,
 * and stores it in KV. Safe to call on any publish path.
 */
export async function generateSocialForPost(slug: string, env: CaseStudyEnv, now: Date): Promise<void> {
  try {
    const post = await env.CASE_STUDIES.get<import('./types').Post>(csKvKeys.post(slug), 'json');
    if (!post) {
      console.warn(JSON.stringify({ job: 'auto-social', slug, status: 'post_not_found' }));
      return;
    }
    const social = await generateSocialContent(post, env.AI as never, now, env.GROQ_API_KEY);
    await env.CASE_STUDIES.put(csKvKeys.social(slug), JSON.stringify(social));
    console.log(JSON.stringify({ job: 'auto-social', slug, status: 'generated' }));
  } catch (err) {
    console.error(
      JSON.stringify({ job: 'auto-social', slug, error: err instanceof Error ? err.message : String(err) })
    );
  }
}

export async function runPublisherNow(env: CaseStudyEnv, now: Date) {
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
  const result = await runPublisher({
    pickDueSlot: (n) => pickDueSlot(env.CASE_STUDIES, n),
    markSlotStatus: (cid, status, extras) => markSlotStatus(env.CASE_STUDIES, cid, status, extras),
    getApproved: (k) => getApproved(env.CASE_STUDIES, k),
    unapprove: (k) => unapprove(env.CASE_STUDIES, k),
    generatePost: (cand, n) =>
      generatePost({ candidate: cand, ai: env.AI as never, now: n, groqKey: env.GROQ_API_KEY, validationEnv }),
    putPost: (p) => putPost(env.CASE_STUDIES, p),
    putDraft: (p) => putDraft(env.CASE_STUDIES, p),
    refreshRss: async (index) => {
      const list = index ?? (await listPostIndex(env.CASE_STUDIES));
      const rss = renderRss(list, { siteUrl: getSiteUrl(env) });
      await env.CASE_STUDIES.put(csKvKeys.metaRss, rss);
    },
    touchDedup: (k, when, slug) => touchDedup(env.CASE_STUDIES, k, when, slug),
    recordFailure: (rec) => recordFailure(env.CASE_STUDIES, rec),
    now,
    requireApproval,
  });

  // Fire-and-forget auto-generation of social copy when a post was published
  if (result.published === 1 && result.slug) {
    generateSocialForPost(result.slug, env as unknown as CaseStudyEnv, now).catch((err) =>
      console.error('auto-social generation failed:', err)
    );
  }

  return result;
}

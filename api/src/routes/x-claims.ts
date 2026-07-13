import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchAuthedTimeline } from '../lib/twitter-auth-graphql';
import { classifySocialClaim } from '../lib/social-claim-parser';
import { classifySector } from '../lib/sector-classifier';
import type { RansomwareVictim } from './ransomware-recent';

/**
 * Structured ransomware + breach claims extracted from threat-intel X channels.
 *
 *   GET /api/v1/x-claims
 *
 * FalconFeeds.io / Dark Web Intelligence (@DailyDarkWeb) and similar CTI feeds
 * post leak-site listings and breach/DB-for-sale claims as free text. This
 * route fetches a small curated handle set via the authed X timeline path,
 * runs each post through the conservative `classifySocialClaim` parser, and
 * splits the result into:
 *   - `ransomware`: victim claims naming a ransomware group → merged into the
 *     ransomware-live feed (origin 'x') by ransomware-recent.ts, which reads
 *     THIS endpoint's cache (never re-fetching X itself, so the core feed
 *     carries no extra X rate-limit risk).
 *   - `breach`: generic data-leak / DB-for-sale claims → a separate surface.
 *
 * The aggregated result is cached so repeat reads (and the ransomware-feed
 * cache-read) are free.
 */

// v2: evict v1 entries that held pre-parser-fix noisy extractions
// (verb-as-group "has", count-phrase victims) for the cache TTL.
export const X_CLAIMS_CACHE_KEY = 'https://x-claims-cache.internal/v2';
// 1h — matches the hourly cron warm so the ransomware-recent cache-only read
// stays populated between fires (a shorter TTL left a dead window each hour).
const CACHE_TTL_SECONDS = 3600;

/** Curated handles that report ransomware leak-site listings + breach claims. */
const CLAIM_HANDLES = [
  'FalconFeedsio',
  'DailyDarkWeb',
  'ransomnews',
  'LeakRadario',
  'MonThreat',
  'VivekIntel',
  'DarkForumss',
  'VulnCheckAI',
  'etugenio',
  'drb_ra',
  '3xp0rtblog',
  'alphahunt_io',
  'CTI__Updates',
  'spchainattack',
];

export interface BreachClaim {
  victim?: string;
  country?: string;
  /** Original post text (trimmed) — the UI shows it for context. */
  text: string;
  source_url: string;
  discovered: string;
  /** X handle the claim came from. */
  handle: string;
}

export interface XClaimsResponse {
  generated_at: string;
  handles: string[];
  ransomware: RansomwareVictim[];
  breach: BreachClaim[];
}

function isoFromTweet(ms: number, fallback: string): string {
  const t = Number.isFinite(ms) ? ms : Date.parse(fallback);
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

/**
 * Pure-data extractor. Fetches each handle's recent timeline, classifies every
 * post, and returns deduped ransomware + breach claims. Resilient: a failed
 * handle fetch (rate-limit, auth) contributes nothing rather than throwing.
 */
export async function fetchXClaims(env: Env): Promise<XClaimsResponse> {
  const timelines = await Promise.all(
    CLAIM_HANDLES.map((h) =>
      fetchAuthedTimeline(env, h, { count: 40, sinceDays: 7, includeReplies: false, includePinned: false }).catch(
        () => null
      )
    )
  );

  const ransByKey = new Map<string, RansomwareVictim>();
  const breachByKey = new Map<string, BreachClaim>();

  for (const tl of timelines) {
    if (!tl) continue;
    for (const item of tl.items) {
      // Skip retweets/replies — claims should originate from the channel.
      if (item.is_retweet || item.is_reply) continue;
      const claim = classifySocialClaim(item.text);
      if (claim.kind === 'other') continue;
      const discovered = isoFromTweet(item.created_at_ms, item.created_at);
      const day = discovered.slice(0, 10);

      if (claim.kind === 'ransomware' && claim.victim && claim.group) {
        const group = claim.group.toLowerCase();
        const key = `${group}|${claim.victim.toLowerCase()}|${day}`;
        if (!ransByKey.has(key)) {
          ransByKey.set(key, {
            victim: claim.victim,
            group,
            discovered,
            source_url: item.url,
            sector: classifySector(claim.victim, undefined),
            origin: 'x',
            ...(claim.country ? { country: claim.country } : {}),
          });
        }
      } else if (claim.kind === 'breach') {
        const key = `${(claim.victim ?? item.id).toLowerCase()}|${day}`;
        if (!breachByKey.has(key)) {
          breachByKey.set(key, {
            ...(claim.victim ? { victim: claim.victim } : {}),
            ...(claim.country ? { country: claim.country } : {}),
            text: item.text.length > 400 ? `${item.text.slice(0, 397)}…` : item.text,
            source_url: item.url,
            discovered,
            handle: tl.handle,
          });
        }
      }
    }
  }

  const byNewest = <T extends { discovered: string }>(a: T, b: T) => b.discovered.localeCompare(a.discovered);
  return {
    generated_at: new Date().toISOString(),
    handles: CLAIM_HANDLES,
    ransomware: [...ransByKey.values()].sort(byNewest),
    breach: [...breachByKey.values()].sort(byNewest),
  };
}

/**
 * Read the cached x-claims payload WITHOUT triggering a fetch. Used by
 * ransomware-recent so the core feed never adds X load — it enriches only
 * when this endpoint (page view or cron warm) has already populated the cache.
 */
export async function readXClaimsCache(): Promise<XClaimsResponse | null> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(new Request(X_CLAIMS_CACHE_KEY));
    if (!hit) return null;
    return (await hit.json()) as XClaimsResponse;
  } catch (_catchErr) {
    console.error('readXClaimsCache failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

export async function xClaimsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(X_CLAIMS_CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const body = await fetchXClaims(c.env);
  const response = c.json(body, 200, {
    'Cache-Control': `public, max-age=300, s-maxage=${CACHE_TTL_SECONDS}`,
  });
  // Only cache a payload that actually carried claims — an all-empty result
  // (every handle rate-limited) must not pin "0 claims" for the whole TTL.
  if (body.ransomware.length > 0 || body.breach.length > 0) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

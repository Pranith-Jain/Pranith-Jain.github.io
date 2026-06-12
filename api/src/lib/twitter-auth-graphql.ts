import type { Env } from '../env';

/**
 * Authenticated X (Twitter) GraphQL via a personal account's cookies.
 *
 * The anonymous guest-token path (twitter-graphql.ts) returns
 * `profile_best_highlights` — Twitter's curated "best of" set, not the
 * chronological timeline. The real recent-tweet feed is gated behind
 * authentication.
 *
 * This module hits the same GraphQL endpoints but as a *logged-in user*,
 * using the `auth_token` + `ct0` cookies from a real X account. This is
 * the same path twscrape / twikit / Scweet all use; ported to a Cloudflare
 * Worker so it runs without Python or a VPS.
 *
 * Setup (one-time, by the operator):
 *   1. Create or use an X account (a throwaway is fine).
 *   2. Log in via x.com in a browser. Open DevTools → Application →
 *      Cookies → x.com. Copy `auth_token` and `ct0` values.
 *   3. Set them as Worker secrets:
 *        wrangler secret put X_AUTH_TOKEN   # paste auth_token cookie
 *        wrangler secret put X_CT0          # paste ct0 cookie
 *   4. (Optional) Set X_BEARER if you want to override the public web
 *      bearer that ships embedded in x.com's bundle.
 *
 * Risks (worth being upfront about):
 *   - **Account-flag risk.** X may flag the account for "automation."
 *     For analyst-level read traffic (~100 calls/day) accounts typically
 *     survive months; for higher volumes, use a pool. Read-only scraping
 *     via the official web GraphQL endpoints is a lower-risk pattern
 *     than POSTing or following at scale.
 *   - **Cookie rotation.** `auth_token` expires every ~30 days. When
 *     calls start returning 401, re-extract the cookies and re-`wrangler
 *     secret put` them.
 *   - **Worker shared IPs.** Cloudflare egress IPs are shared; X may
 *     rate-limit the IP. The 30-min per-handle edge cache absorbs most
 *     of this; surface a 429 with retry-after when it can't.
 */

// Same anonymous web bearer Twitter's own bundle uses. NOT a secret —
// visible in every x.com page load. Operators can override via X_BEARER
// if Twitter rotates the public token (rare).
const DEFAULT_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const USER_BY_SN_QID = 'G3KGOASz96M-Qu0nwmGXNg';
const USER_TWEETS_QID = 'V7H0Ap3_Hh2FyS75OCDO3Q';
const USER_TWEETS_AND_REPLIES_QID = 'E4wA5vo2sjVyvpliUffSCw';
const SEARCH_TIMELINE_QID = 'nK1dw4oV3k4w5TdtcAdSww';

// user_id lookup TTL — cached in caches.default (no KV quota), 7 days.
const USERID_TTL = 7 * 24 * 3600;
const CACHE_TWEETS_TTL = 30 * 60;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_TWEETS_PER_CALL = 40;

const SCREEN_NAME_RE = /^[A-Za-z0-9_]{1,15}$/;
// X rotated the cookie formats in 2024 — `ct0` is now ~160 hex chars
// (previously 40), and `auth_token` can be up to 80. Validators were
// too strict and rejected real session cookies; bumped the ranges to
// accept both legacy and current formats.
const CT0_RE = /^[a-f0-9]{32,256}$/i;
const AUTH_TOKEN_RE = /^[a-f0-9]{32,200}$/i;

const FEATURES_USER_BY_SN = {
  hidden_profile_likes_enabled: true,
  hidden_profile_subscriptions_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
};

// Authenticated callers get the full feature set — more keys, more
// fields. These match what x.com's own web app sends, so the GraphQL
// returns the proper chronological timeline.
const FEATURES_USER_TWEETS_AUTHED = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
};

// Search-specific features — matches what x.com sends for the "Latest" tab.
const FEATURES_SEARCH_TIMELINE = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
};

export interface AuthCookies {
  authToken: string;
  ct0: string;
  bearer: string;
}

export interface AuthedTimelineItem {
  id: string;
  url: string;
  text: string;
  created_at: string;
  created_at_ms: number;
  author: { screen_name: string; name: string; avatar_url?: string; verified?: boolean };
  reply_count?: number;
  retweet_count?: number;
  favorite_count?: number;
  quote_count?: number;
  view_count?: number;
  media: Array<{ type: 'photo' | 'video' | 'gif'; url: string }>;
  is_retweet: boolean;
  is_reply: boolean;
  is_quote: boolean;
  is_pinned: boolean;
}

export interface AuthedTimelineResponse {
  handle: string;
  user_id: string;
  display_name: string;
  bio?: string;
  followers_count?: number;
  items: AuthedTimelineItem[];
  generated_at: string;
  cached: boolean;
  auth_used: true;
}

export class XAuthMissingError extends Error {
  constructor() {
    super('X_AUTH_TOKEN / X_CT0 secrets not configured — see api/src/lib/twitter-auth-graphql.ts for setup');
    this.name = 'XAuthMissingError';
  }
}

export class XAuthInvalidError extends Error {
  constructor(public status: number) {
    super(
      `X auth rejected (HTTP ${status}) — cookies may have expired; re-extract and \`wrangler secret put X_AUTH_TOKEN\``
    );
    this.name = 'XAuthInvalidError';
  }
}

export class XAuthRateLimitedError extends Error {
  constructor(public retryAfter?: string) {
    super(`X rate-limited the auth'd request${retryAfter ? ` (retry-after ${retryAfter})` : ''}`);
    this.name = 'XAuthRateLimitedError';
  }
}

/** Pull cookies from env. Throws XAuthMissingError if not set — caller
 *  surfaces a clear "set these secrets" message to the user. */
export function readAuthCookies(env: Env): AuthCookies {
  const raw = env as unknown as Record<string, string | undefined>;
  const authToken = (raw.X_AUTH_TOKEN ?? '').trim();
  const ct0 = (raw.X_CT0 ?? '').trim();
  if (!authToken || !ct0) throw new XAuthMissingError();
  // Sanity-check shape so a paste mistake (e.g. extra quotes, trimmed
  // partial cookies) surfaces immediately instead of as a 401 mystery.
  if (!AUTH_TOKEN_RE.test(authToken)) {
    throw new Error(`X_AUTH_TOKEN looks malformed (expected ~40-80 hex chars, got ${authToken.length})`);
  }
  if (!CT0_RE.test(ct0)) {
    throw new Error(`X_CT0 looks malformed (expected ~40-64 hex chars, got ${ct0.length})`);
  }
  const bearer = (raw.X_BEARER ?? DEFAULT_BEARER).trim();
  return { authToken, ct0, bearer };
}

/** Build the cookie header X expects for an authenticated session. */
function buildCookieHeader(creds: AuthCookies): string {
  return `auth_token=${creds.authToken}; ct0=${creds.ct0}; lang=en`;
}

function graphqlHeaders(creds: AuthCookies): Record<string, string> {
  return {
    Authorization: `Bearer ${creds.bearer}`,
    'x-csrf-token': creds.ct0,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Cookie: buildCookieHeader(creds),
    Accept: 'application/json',
  };
}

async function graphqlGet<T>(url: string, creds: AuthCookies): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const res = await fetch(url, { headers: graphqlHeaders(creds), signal: ctrl.signal });
  clearTimeout(timer);
  if (res.status === 429) {
    throw new XAuthRateLimitedError(res.headers.get('retry-after') ?? undefined);
  }
  if (res.status === 401 || res.status === 403) {
    throw new XAuthInvalidError(res.status);
  }
  if (!res.ok) throw new Error(`graphql HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function resolveUserIdAuthed(
  _env: Env,
  creds: AuthCookies,
  screenName: string
): Promise<{ id: string; name: string; bio: string; followers: number; verified: boolean; avatar?: string }> {
  // user_id never changes per Twitter user → safe to cache in
  // caches.default (no KV quota). Was KV; switched 2026-05-24 to drop
  // the ~70 KV reads/visit the probe-and-hide on /x-watch was firing.
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(`https://x-auth-userid-cache.internal/v1?h=${screenName.toLowerCase()}`);
  try {
    const hit = await edgeCache.match(cacheReq);
    if (hit) {
      return (await hit.json()) as Awaited<ReturnType<typeof resolveUserIdAuthed>>;
    }
  } catch {
    /* fall through */
  }
  const variables = encodeURIComponent(JSON.stringify({ screen_name: screenName, withSafetyModeUserFields: true }));
  const features = encodeURIComponent(JSON.stringify(FEATURES_USER_BY_SN));
  const url = `https://api.twitter.com/graphql/${USER_BY_SN_QID}/UserByScreenName?variables=${variables}&features=${features}`;
  const data = await graphqlGet<{ data?: { user?: { result?: Record<string, unknown> } } }>(url, creds);
  const result = data.data?.user?.result;
  if (!result) throw new Error('UserByScreenName returned no result');
  const rest = result as Record<string, unknown>;
  let userId = typeof rest.rest_id === 'string' ? rest.rest_id : '';
  if (!userId && typeof rest.id === 'string') {
    try {
      const decoded = atob(rest.id);
      const m = decoded.match(/User:(\d+)/);
      if (m) userId = m[1]!;
    } catch {
      /* fall through */
    }
  }
  if (!userId) throw new Error('UserByScreenName could not resolve rest_id');
  const legacy = (rest.legacy ?? {}) as Record<string, unknown>;
  const record = {
    id: userId,
    name: typeof legacy.name === 'string' ? legacy.name : screenName,
    bio: typeof legacy.description === 'string' ? legacy.description : '',
    followers: typeof legacy.followers_count === 'number' ? legacy.followers_count : 0,
    verified: rest.is_blue_verified === true || legacy.verified === true,
    avatar: typeof legacy.profile_image_url_https === 'string' ? legacy.profile_image_url_https : undefined,
  };
  // Cache the resolved user_id in caches.default (free, no KV quota).
  try {
    const cacheable = new Response(JSON.stringify(record), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${USERID_TTL}, s-maxage=${USERID_TTL}`,
      },
    });
    await edgeCache.put(cacheReq, cacheable);
  } catch {
    /* swallow */
  }
  return record;
}

/** Parse the authed GraphQL timeline — the structure is identical to
 *  the anonymous one, except `clientEventInfo.component` is now
 *  `home_latest_timeline` / `profile_tweets` instead of
 *  `profile_best_highlights`, and the entries are chronological. */
function parseAuthedTimeline(raw: unknown, screenName: string): AuthedTimelineItem[] {
  const root = raw as Record<string, unknown>;
  const timelineRoot = ((root.data as Record<string, unknown>)?.user as Record<string, unknown>)?.result as
    | Record<string, unknown>
    | undefined;
  const v2 = (timelineRoot?.timeline_v2 as Record<string, unknown>)?.timeline as Record<string, unknown> | undefined;
  const fallback = (timelineRoot?.timeline as Record<string, unknown>)?.timeline as Record<string, unknown> | undefined;
  const instructions = ((v2 ?? fallback)?.instructions as unknown[]) ?? [];
  return parseTimelineInstructions(instructions, screenName);
}

/** Parse a SearchTimeline GraphQL response. Same entry structure as
 *  UserTweets but reached via `search_by_raw_query.search_timeline`. */
function parseSearchTimeline(raw: unknown): AuthedTimelineItem[] {
  const root = raw as Record<string, unknown>;
  const searchTimeline = (
    (root.data as Record<string, unknown>)?.search_by_raw_query as Record<string, unknown> | undefined
  )?.search_timeline as Record<string, unknown> | undefined;
  const timeline = searchTimeline?.timeline as Record<string, unknown> | undefined;
  const instructions = (timeline?.instructions as unknown[]) ?? [];
  return parseTimelineInstructions(instructions, '');
}

/** Shared instruction walker — extracts tweets from TimelineAddEntries
 *  and pinned-tweet instructions. Used by both user timelines and search. */
function parseTimelineInstructions(instructions: unknown[], screenName: string): AuthedTimelineItem[] {
  const items: AuthedTimelineItem[] = [];

  function pushFromTweetResult(tr: unknown, isRetweet: boolean, isPinned: boolean): void {
    if (!tr || typeof tr !== 'object') return;
    const res = (tr as Record<string, unknown>).result as Record<string, unknown> | undefined;
    if (!res) return;
    const core = res.core as Record<string, unknown> | undefined;
    const author = ((core?.user_results as Record<string, unknown>)?.result as Record<string, unknown>)?.legacy as
      | Record<string, unknown>
      | undefined;
    const legacy = res.legacy as Record<string, unknown> | undefined;
    if (!legacy) return;
    const id = typeof legacy.id_str === 'string' ? legacy.id_str : '';
    const text = typeof legacy.full_text === 'string' ? legacy.full_text : '';
    const createdAt = typeof legacy.created_at === 'string' ? legacy.created_at : '';
    const createdMs = createdAt ? Date.parse(createdAt) : NaN;
    const isReply = !!legacy.in_reply_to_screen_name && legacy.in_reply_to_screen_name !== screenName;
    const isQuote = legacy.is_quote_status === true;
    const authorSn = typeof author?.screen_name === 'string' ? author.screen_name : screenName;
    const authorName = typeof author?.name === 'string' ? author.name : authorSn;
    const authorAvatar =
      typeof author?.profile_image_url_https === 'string' ? author.profile_image_url_https : undefined;
    const authorVerified = author?.verified === true;
    const entities = (legacy.entities ?? {}) as Record<string, unknown>;
    const extEntities = (legacy.extended_entities ?? entities) as Record<string, unknown>;
    const mediaRaw = ((extEntities.media as unknown[]) ?? []).filter(
      (m): m is Record<string, unknown> => !!m && typeof m === 'object'
    );
    const media: AuthedTimelineItem['media'] = mediaRaw
      .map((m): AuthedTimelineItem['media'][number] => {
        const t = m.type as string | undefined;
        const type: 'photo' | 'video' | 'gif' = t === 'video' ? 'video' : t === 'animated_gif' ? 'gif' : 'photo';
        return {
          type,
          url: typeof m.media_url_https === 'string' ? (m.media_url_https as string) : '',
        };
      })
      .filter((m) => m.url);

    items.push({
      id,
      url: `https://x.com/${authorSn}/status/${id}`,
      text,
      created_at: createdAt,
      created_at_ms: Number.isFinite(createdMs) ? createdMs : 0,
      author: { screen_name: authorSn, name: authorName, avatar_url: authorAvatar, verified: authorVerified },
      reply_count: typeof legacy.reply_count === 'number' ? legacy.reply_count : undefined,
      retweet_count: typeof legacy.retweet_count === 'number' ? legacy.retweet_count : undefined,
      favorite_count: typeof legacy.favorite_count === 'number' ? legacy.favorite_count : undefined,
      quote_count: typeof legacy.quote_count === 'number' ? legacy.quote_count : undefined,
      view_count: undefined,
      media,
      is_retweet: isRetweet,
      is_reply: isReply,
      is_quote: isQuote,
      is_pinned: isPinned,
    });
  }

  function isPinned(itemContent: Record<string, unknown> | undefined): boolean {
    if (!itemContent) return false;
    const ctx = itemContent.socialContext as Record<string, unknown> | undefined;
    return ctx?.contextType === 'Pin' || ctx?.text === 'Pinned';
  }

  for (const ins of instructions) {
    if (!ins || typeof ins !== 'object') continue;
    const insRec = ins as Record<string, unknown>;
    if (insRec.entry) {
      const entry = insRec.entry as Record<string, unknown>;
      const content = entry.content as Record<string, unknown> | undefined;
      const itemContent = content?.itemContent as Record<string, unknown> | undefined;
      if (itemContent && itemContent.itemType === 'TimelineTweet') {
        pushFromTweetResult(itemContent.tweet_results, false, true);
      }
    }
    if (insRec.type === 'TimelineAddEntries' && Array.isArray(insRec.entries)) {
      for (const entry of insRec.entries as unknown[]) {
        if (!entry || typeof entry !== 'object') continue;
        const entryRec = entry as Record<string, unknown>;
        if (typeof entryRec.entryId === 'string' && entryRec.entryId.startsWith('cursor-')) continue;
        const content = entryRec.content as Record<string, unknown> | undefined;
        if (!content) continue;
        const itemContent = content.itemContent as Record<string, unknown> | undefined;
        if (itemContent && itemContent.itemType === 'TimelineTweet') {
          const tweetResults = itemContent.tweet_results as Record<string, unknown> | undefined;
          const result = tweetResults?.result as Record<string, unknown> | undefined;
          const legacy = result?.legacy as Record<string, unknown> | undefined;
          const isRt = !!legacy?.retweeted_status_result;
          pushFromTweetResult(tweetResults, isRt, isPinned(itemContent));
        }
        // Threaded modules (conversation, replies). Walk one level deeper.
        if (content && (content as Record<string, unknown>).entryType === 'TimelineTimelineModule') {
          const moduleItems = (content as Record<string, unknown>).items as unknown[] | undefined;
          if (Array.isArray(moduleItems)) {
            for (const mi of moduleItems) {
              if (!mi || typeof mi !== 'object') continue;
              const miRec = (mi as Record<string, unknown>).item as Record<string, unknown> | undefined;
              const ic = miRec?.itemContent as Record<string, unknown> | undefined;
              if (ic?.itemType === 'TimelineTweet') {
                pushFromTweetResult(ic.tweet_results, false, false);
              }
            }
          }
        }
      }
    }
  }

  // Dedupe by ID; pins sometimes appear twice.
  const seen = new Set<string>();
  return items.filter((it) => {
    if (!it.id || seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
}

export async function fetchAuthedTimeline(
  env: Env,
  screenName: string,
  options: { count?: number; sinceDays?: number; includePinned?: boolean; includeReplies?: boolean } = {}
): Promise<AuthedTimelineResponse> {
  if (!SCREEN_NAME_RE.test(screenName)) throw new Error(`invalid screen_name: ${screenName}`);
  const lower = screenName.toLowerCase();
  const creds = readAuthCookies(env);

  const sinceDays = options.sinceDays ?? 7;
  const includePinned = options.includePinned === true;
  const includeReplies = options.includeReplies === true;
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://tw-authed-cache.internal/v1?h=${lower}&d=${sinceDays}&p=${includePinned ? 1 : 0}&r=${includeReplies ? 1 : 0}`
  );
  const cached = await edgeCache.match(cacheKey);
  if (cached) {
    try {
      const body = (await cached.json()) as AuthedTimelineResponse;
      return { ...body, cached: true };
    } catch {
      /* fall through */
    }
  }

  const userInfo = await resolveUserIdAuthed(env, creds, lower);

  const qid = includeReplies ? USER_TWEETS_AND_REPLIES_QID : USER_TWEETS_QID;
  const endpoint = includeReplies ? 'UserTweetsAndReplies' : 'UserTweets';
  const variables = encodeURIComponent(
    JSON.stringify({
      userId: userInfo.id,
      count: Math.min(options.count ?? 25, MAX_TWEETS_PER_CALL),
      includePromotedContent: false,
      withQuickPromoteEligibilityTweetFields: false,
      withVoice: true,
      withV2Timeline: true,
    })
  );
  const features = encodeURIComponent(JSON.stringify(FEATURES_USER_TWEETS_AUTHED));
  const url = `https://api.twitter.com/graphql/${qid}/${endpoint}?variables=${variables}&features=${features}`;
  const data = await graphqlGet<unknown>(url, creds);
  const allItems = parseAuthedTimeline(data, lower);

  const cutoffMs = Date.now() - sinceDays * 86_400_000;
  const items = allItems
    .filter((it) => {
      if (it.created_at_ms === 0) return false;
      if (it.created_at_ms >= cutoffMs) return true;
      return includePinned && it.is_pinned;
    })
    .sort((a, b) => b.created_at_ms - a.created_at_ms);

  const body: AuthedTimelineResponse = {
    handle: lower,
    user_id: userInfo.id,
    display_name: userInfo.name,
    bio: userInfo.bio,
    followers_count: userInfo.followers,
    items,
    generated_at: new Date().toISOString(),
    cached: false,
    auth_used: true,
  };

  try {
    const cacheable = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TWEETS_TTL}, s-maxage=${CACHE_TWEETS_TTL}`,
      },
    });
    await edgeCache.put(cacheKey, cacheable);
  } catch {
    /* swallow */
  }
  return body;
}

export interface SearchTimelineResponse {
  query: string;
  items: AuthedTimelineItem[];
  generated_at: string;
  cached: boolean;
  auth_used: true;
}

/** Search X/Twitter via the SearchTimeline GraphQL endpoint. Returns
 *  chronological results for the given query string. The end-user never
 *  authenticates — the operator's cookies are used server-side.
 *
 *  `product` controls the search tab:
 *    - 'Latest' (default) — reverse-chronological
 *    - 'Top' — Twitter's relevance-ranked
 *    - 'Media' — photos and videos only
 */
export async function fetchSearchTimeline(
  env: Env,
  query: string,
  options: { count?: number; product?: 'Latest' | 'Top' | 'Media' } = {}
): Promise<SearchTimelineResponse> {
  if (!query || query.trim().length === 0) throw new Error('search query cannot be empty');
  if (query.length > 500) throw new Error('search query too long (max 500 chars)');
  const creds = readAuthCookies(env);
  const count = Math.min(options.count ?? 20, 40);
  const product = options.product ?? 'Latest';

  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://x-search-cache.internal/v1?q=${encodeURIComponent(query.toLowerCase())}&p=${product}&n=${count}`
  );
  const cached = await edgeCache.match(cacheKey);
  if (cached) {
    try {
      const body = (await cached.json()) as SearchTimelineResponse;
      return { ...body, cached: true };
    } catch {
      /* fall through */
    }
  }

  const rawQuery = query.trim();
  const variables = encodeURIComponent(
    JSON.stringify({
      rawQuery: rawQuery,
      count,
      querySource: 'typed_query',
      product,
    })
  );
  const features = encodeURIComponent(JSON.stringify(FEATURES_SEARCH_TIMELINE));
  const url = `https://api.twitter.com/graphql/${SEARCH_TIMELINE_QID}/SearchTimeline?variables=${variables}&features=${features}`;
  const data = await graphqlGet<unknown>(url, creds);
  const items = parseSearchTimeline(data);

  const body: SearchTimelineResponse = {
    query: rawQuery,
    items,
    generated_at: new Date().toISOString(),
    cached: false,
    auth_used: true,
  };

  try {
    const cacheable = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TWEETS_TTL}, s-maxage=${CACHE_TWEETS_TTL}`,
      },
    });
    await edgeCache.put(cacheKey, cacheable);
  } catch {
    /* swallow */
  }
  return body;
}

import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  KV_CACHE?: KVNamespace;
  KV_SHARES?: KVNamespace;
  BRIEFINGS_DB?: D1Database;
  CASE_STUDIES: KVNamespace;
  R2_FILES?: R2Bucket;
  AI: Ai;
  /** Optional NVD API key (Worker secret) — raises NVD rate limit ~10x. */
  NVD_API_KEY?: string;
  // Optional Worker secrets — unset in dev/preview and consumed with a
  // `?? ''` fallback. Declaring them required was a type lie that would
  // hide a genuine `undefined` if any caller forgot the fallback.
  VT_API_KEY?: string;
  ABUSEIPDB_API_KEY?: string;
  SHODAN_API_KEY?: string;
  CENSYS_PAT?: string;
  CENSYS_ORG_ID?: string;
  NETLAS_API_KEY?: string;
  OTX_API_KEY?: string;
  URLSCAN_API_KEY?: string;
  HYBRID_ANALYSIS_API_KEY?: string;
  ABUSECH_AUTH_KEY?: string;
  /** MalShare API key (free registration at malshare.com). Optional —
   *  hash lookups degrade gracefully when unset. */
  MALSHARE_API_KEY?: string;
  /** EmailRep.io API key. Optional — the free anonymous tier (~100 req/hr per IP)
   *  works without; setting a key lifts the rate ceiling. */
  EMAILREP_API_KEY?: string;
  /** SerpAPI key for the Google-Dorks tool (`/dfir/google-dorks`). Required —
   *  the tool route returns 503 when unset. */
  SERPAPI_API_KEY?: string;
  DFIR_DEV_ERRORS?: string;
  AJ_analytics?: AnalyticsEngineDataset;
  ADMIN_TOKEN: string;
  /** ransomware.live PRO API key (set via `wrangler secret put`). Optional —
   *  the /api/v1/rl/* proxy degrades to 503 when unset. */
  RANSOMWARELIVE_API_KEY?: string;
  /** Groq free-tier API key (set via `wrangler secret put GROQ_API_KEY`).
   *  Optional — case-study generation uses Groq as the quality primary when
   *  set, and falls back to Workers AI when unset/unavailable. */
  GROQ_API_KEY?: string;
  /** X (Twitter) auth cookies for the cookie-authenticated firehose at
   *  /api/v1/x-firehose. Set via `wrangler secret put X_AUTH_TOKEN` and
   *  `wrangler secret put X_CT0` (values are the `auth_token` and `ct0`
   *  cookies from a logged-in x.com session). Optional — when unset, the
   *  firehose endpoint returns 503 with setup instructions and the x-live
   *  / x-watch surfaces continue to work via the anonymous paths. */
  X_AUTH_TOKEN?: string;
  X_CT0?: string;
  /** Override for the public web bearer that ships in every x.com bundle.
   *  Rarely needed — only if Twitter rotates the default. */
  X_BEARER?: string;
  /** MyThreatIntel REST API bearer token (set via
   *  `wrangler secret put MYTHREATINTEL_API_TOKEN`). Optional — the
   *  /api/v1/mti proxy degrades to 503 when unset, and the in-process
   *  consumers (live-iocs, ransomware-recent) fall back to the existing
   *  t.me/s/mythreatintel scraper so nothing that works today breaks. */
  MYTHREATINTEL_API_TOKEN?: string;
  /** Telegram CTI-archive bot token + target chat(s). TELEGRAM_CHANNEL_ID
   *  may be a single @channel / -100… id OR a comma/space-separated list of
   *  several channels/groups — every digest is broadcast to all of them.
   *  Set via `wrangler secret put`. Optional — the hourly archive cron is a
   *  no-op when either is unset. */
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHANNEL_ID?: string;
  /** When the literal string "true", the case-study publisher writes new
   *  posts to the `drafts:` namespace instead of `posts:` — promoting a
   *  draft requires an admin click via /api/v1/admin/case-study/drafts/
   *  <slug>/approve. Unset (or any other value) keeps the existing
   *  auto-publish flow. Set via `wrangler.jsonc#vars.BLOG_APPROVAL_REQUIRED`
   *  or `wrangler secret put`. */
  BLOG_APPROVAL_REQUIRED?: string;
  /** Cloudflare zone ID for cache purge operations. */
  CF_ZONE_ID?: string;
  /** Cloudflare API token with Cache Purge permission. */
  CF_API_TOKEN?: string;
  /** Triage (tria.ge) API key. Set via `wrangler secret put TRIAGE_API_KEY`. */
  TRIAGE_API_KEY?: string;
  /** CrowdSec CTI API key (free registration at crowdsec.net). Optional —
   *  the /api/v1/ioc/check CrowdSec provider degrades to 'unsupported'
   *  when unset. Free tier: 1000 lookups/month. */
  CROWDSEC_API_KEY?: string;
  /** IPinfo.io access token (free registration at ipinfo.io). Optional —
   *  improves rate limits from ~50/day to 50k/month. */
  IPINFO_TOKEN?: string;
  /** CriminalIP API key (free registration at criminalip.io). Optional —
   *  the /api/v1/ioc/check CriminalIP provider degrades to 'unsupported'
   *  when unset. Free tier: 100 lookups/month. */
  CRIMINALIP_API_KEY?: string;

}

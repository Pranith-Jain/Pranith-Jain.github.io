import type { D1Database, Queue } from '@cloudflare/workers-types';
import type { FeedQueueMessage } from './lib/live-iocs-slices';

export interface Env {
  KV_CACHE?: KVNamespace;
  /** Producer binding for the live-IOC per-source feed fan-out (PR2/PR3). */
  FEEDS_QUEUE?: Queue<FeedQueueMessage>;
  /** Durable Object used as a globally-consistent single-flight lease AND, via
   *  its `incr` op, an atomic windowed counter for the admin rate-limit bucket
   *  (so a parallel burst can't bypass the brute-force cap). Optional — the
   *  rate limiter degrades to the per-colo Cache/KV path when it is unbound. */
  CRON_LOCK_DO?: DurableObjectNamespace;
  /** Report-generation pipeline DO (Copilot full-report builder). */
  REPORT_BUILDER?: DurableObjectNamespace;
  /** Autonomous investigator agent DO. */
  INVESTIGATOR_AGENT?: DurableObjectNamespace;
  BRIEFINGS_DB?: D1Database;
  /** Emergency valve for the external-read API-key gate. When set to the string
   *  `'true'` (a Worker secret, so it can be toggled without a redeploy),
   *  external GET/HEAD `/api/v1/*` reads are allowed WITHOUT an API key again —
   *  restoring the fully-public behavior. Unset/anything-else keeps reads gated. */
  OPEN_PUBLIC_READS?: string;
  CASE_STUDIES: KVNamespace;
  AI: Ai;
  VECTORIZE?: VectorizeIndex;
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
  /** Spur.us API token for VPN/proxy/tor detection. Optional — the
   *  IOC check degrades to 'unsupported' when unset. */
  SPUR_API_KEY?: string;
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
  /** Increment to invalidate all existing admin session cookies without
   *  rotating the ADMIN_TOKEN secret itself. The session cookie endpoint
   *  stamps this value into the cookie; the auth gate rejects stale versions.
   *  Set via `wrangler secret put ADMIN_TOKEN_VERSION`. Optional — when
   *  unset, version checking is disabled (all cookies are valid). */
  ADMIN_TOKEN_VERSION?: string;
  /** Bearer token for briefings admin endpoints (build, backfill, sweep).
   *  Set via `wrangler secret put BRIEFINGS_ADMIN_TOKEN`. Optional — when
   *  unset, the briefings admin handlers return 404. */
  BRIEFINGS_ADMIN_TOKEN?: string;
  /** ransomware.live PRO API key (set via `wrangler secret put`). Optional —
   *  the /api/v1/rl/* proxy degrades to 503 when unset. */
  RANSOMWARELIVE_API_KEY?: string;
  /** Etherscan V2 API key (set via `wrangler secret put ETHERSCAN_API_KEY`).
   *  Optional — upgrades the tracer's EVM native-ETH source to Etherscan; when
   *  unset, native ETH transfers come from Blockscout's keyless endpoint. */
  ETHERSCAN_API_KEY?: string;
  /** Groq free-tier API key (set via `wrangler secret put GROQ_API_KEY`).
   *  Optional — case-study generation uses Groq as the quality primary when
   *  set, and falls back to Workers AI when unset/unavailable. */
  GROQ_API_KEY?: string;
  /** Free VulnCheck Community token (`wrangler secret put VULNCHECK_API_TOKEN`).
   *  Powers the `vulncheck` IP-intel provider, CVE-lookup exploitation enrichment,
   *  and the report engine's VulnCheck source. Optional — those degrade cleanly
   *  when unset. */
  VULNCHECK_API_TOKEN?: string;
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
  /** ProjectDiscovery Cloud Platform API key (free tier; set via
   *  `wrangler secret put PDCP_API_KEY`). Used as the Chaos `Authorization`
   *  header for free public-domain subdomain recon. Optional — the
   *  /api/v1/pd/subdomains endpoint returns 503 when unset; the credentials
   *  (leaks stats) and CVE-catalog endpoints need no key and work regardless. */
  PDCP_API_KEY?: string;
  /** Telegram bot token for CTI-archive posting + leak-monitor bot.
   *  TELEGRAM_CHANNEL_ID can be a comma-separated list of target chats
   *  for the archive. Optional — both features skip gracefully when unset. */
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHANNEL_ID?: string;
  /** Secret token validated on every Telegram webhook request. Set via
   *  `wrangler secret put TELEGRAM_WEBHOOK_SECRET`. Must match the
   *  `secret_token` passed to Telegram's `setWebhook` API. */
  TELEGRAM_WEBHOOK_SECRET?: string;
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
  /** Kaspersky OpenTip API key. Set via `wrangler secret put KASPERSKY_API_KEY`.
   *  Free tier: 1000 lookups/day. Used for hash, URL, IP, and domain reputation. */
  KASPERSKY_API_KEY?: string;
  /** GitHub personal access token for the malicious-packages API.
   *  Set via `wrangler secret put GITHUB_TOKEN`. Optional — the free
   *  anonymous GitHub API tier (60 req/hr) is the default. */
  GITHUB_TOKEN?: string;
  /** Canonical site URL. Set via
   *  `wrangler.jsonc#vars.SITE_URL` — used for CORS, RSS links, and
   *  canonical URLs. Falls back to the hardcoded default. */
  SITE_URL?: string;
  /** BuiltWith Domain API key (paid). Optional — when unset, the
   *  /api/v1/builtwith tech-stack lookup falls back to a free, self-contained
   *  heuristic that fingerprints the target's live HTTP headers + HTML body.
   *  There is no free BuiltWith JSON API, so the heuristic is the default. */
  BUILTWITH_API_KEY?: string;
  /** Base URL of the self-hosted file2txt bridge (e.g. `https://file2txt.example`).
   *  When set, PDF/docx extraction is offloaded to this service instead of
   *  attempting in-Worker parsing (which is blocked by the 10ms CPU cap). */
  FILE2TXT_BRIDGE_URL?: string;
  /** Optional bearer token sent as `Authorization: Bearer <token>` to the
   *  file2txt bridge. Set via `wrangler secret put FILE2TXT_BRIDGE_TOKEN`. */
  FILE2TXT_BRIDGE_TOKEN?: string;
}

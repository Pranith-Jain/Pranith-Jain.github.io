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
  BRIEFINGS_DB?: D1Database;
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
  /** Bearer token for briefings admin endpoints (build, backfill, sweep).
   *  Set via `wrangler secret put BRIEFINGS_ADMIN_TOKEN`. Optional — when
   *  unset, the briefings admin handlers return 404. */
  BRIEFINGS_ADMIN_TOKEN?: string;
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
  /** Base URL of a self-hosted CAPEv2 sandbox reached through a Cloudflare
   *  Tunnel (e.g. `https://cape.example.com`). The client appends `/apiv2/...`.
   *  Optional — the /api/v1/cape/* routes return 503 (and the bridge reports
   *  itself unconfigured) when unset, so nothing breaks until an operator
   *  stands up CAPE. See docs/self-hosted/cape-bridge.md. */
  CAPE_BRIDGE_URL?: string;
  /** CAPEv2 API token, sent as `Authorization: Token <token>`. Set via
   *  `wrangler secret put CAPE_BRIDGE_TOKEN`. Optional — omit if the CAPE
   *  instance has API auth disabled (only safe behind a locked-down tunnel). */
  CAPE_BRIDGE_TOKEN?: string;
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
  /** Base URL of a self-hosted recon bridge (Subfinder/Amass/theHarvester/
   *  SpiderFoot behind a small HTTP wrapper + Cloudflare Tunnel). The client
   *  appends `/recon`. Optional — the /api/v1/recon/* routes return 503 until
   *  set, so nothing breaks. See docs/self-hosted/recon-bridge.md. */
  RECON_BRIDGE_URL?: string;
  /** Bearer token for the recon bridge. Set via
   *  `wrangler secret put RECON_BRIDGE_TOKEN`. Optional — omit if the bridge
   *  is only reachable through a locked-down tunnel. */
  RECON_BRIDGE_TOKEN?: string;
}

import type { D1Database, Fetcher, Queue } from '@cloudflare/workers-types';
import type { FeedQueueMessage } from './lib/live-iocs-slices';

export interface Env {
  /** Service binding to self (in-process loopback-safe fetch). */
  SELF: Fetcher;
  KV_CACHE?: KVNamespace;
  /** Producer binding for the live-IOC per-source feed fan-out (PR2/PR3). */
  FEEDS_QUEUE?: Queue<FeedQueueMessage>;
  /** Durable Object used as a globally-consistent single-flight lease AND, via
   *  its `incr` op, an atomic windowed counter for the admin rate-limit bucket
   *  (so a parallel burst can't bypass the brute-force cap). Optional — the
   *  rate limiter degrades to the per-colos Cache/KV path when it is unbound. */
  CRON_LOCK_DO: DurableObjectNamespace;
  /** Report-generation pipeline DO (Copilot full-report builder). */
  REPORT_BUILDER: DurableObjectNamespace;
  /** Autonomous investigator agent DO. */
  INVESTIGATOR_AGENT: DurableObjectNamespace;
  /** Live-feed WebSocket fan-out DO. */
  LIVE_FEED_DO: DurableObjectNamespace;
  /** DFIR MCP server DO. */
  DFIR_MCP: DurableObjectNamespace;
  /** Radar deep-crawl DO. */
  RADAR_CRAWLER?: DurableObjectNamespace;
  /** Global Pulse real-time DO. */
  GLOBAL_PULSE_DO?: DurableObjectNamespace;
  BRIEFINGS_DB?: D1Database;
  /** Emergency valve for the external-read API-key gate. When set to the string
   *  `'true'` (a Worker secret, so it can be toggled without a redeploy),
   *  external GET/HEAD `/api/v1/*` reads are allowed WITHOUT an API key again —
   *  restoring the fully-public behavior. Unset/anything-else keeps reads gated. */
  OPEN_PUBLIC_READS?: string;
  CASE_STUDIES: KVNamespace;
  AI: Ai;
  VECTORIZE?: VectorizeIndex;
  /** Browser Run (Puppeteer) for JS-rendered page extraction. */
  BROWSER: Fetcher;
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
  /** NumVerify API key (free at apilayer.net) for phone number validation and
   *  carrier lookup. Optional — the phone-osint route degrades gracefully when unset. */
  NUMVERIFY_API_KEY?: string;
  /** OpenSourceMalware API token (free at opensourcemalware.com → Settings → API Tokens).
   *  Optional — the provider degrades to 'unsupported' when unset. */
  OSM_API_KEY?: string;
  OTX_API_KEY?: string;
  URLSCAN_API_KEY?: string;
  HYBRID_ANALYSIS_API_KEY?: string;
  ABUSECH_AUTH_KEY?: string;
  /** ChainAbuse API key (free key at chainabuse.com) for BTC abuse lookups.
   *  Optional — /api/v1/darknet/btc-abuse-check degrades gracefully when unset. */
  CHAINABUSE_API_KEY?: string;
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
  /** Google AI Studio (Gemini) API key (set via `wrangler secret put GOOGLE_AI_STUDIO_API_KEY`).
   *  Free tier: gemini-2.0-flash (1000 RPM), gemini-1.5-pro (50 RPM). When
   *  set, Gemini is tried first before Groq/Workers AI. */
  GOOGLE_AI_STUDIO_API_KEY?: string;
  /** Groq free-tier API key (set via `wrangler secret put GROQ_API_KEY`).
   *  Optional — case-study generation uses Groq as the quality primary when
   *  set, and falls back to Workers AI when unset/unavailable. */
  GROQ_API_KEY?: string;
  /** Free VulnCheck Community token (`wrangler secret put VULNCHECK_API_TOKEN`).
   *  Powers the `vulncheck` IP-intel provider, CVE-lookup exploitation enrichment,
   *  and the report engine's VulnCheck source. Optional — those degrade cleanly
   *  when unset. */
  VULNCHECK_API_TOKEN?: string;
  /** Google Safe Browsing v4 API key (`wrangler secret put GOOGLE_SAFE_BROWSING_API_KEY`).
   *  Free tier: 10K req/day. Enriches url-rep and phishing tools with
   *  Google's threat database (malware, social engineering, unwanted software). */
  GOOGLE_SAFE_BROWSING_API_KEY?: string;
  /** ZoomEye API key (`wrangler secret put ZOOMEYE_API_KEY`).
   *  Free tier: 10K req/month. Host/port search + web fingerprinting. */
  ZOOMEYE_API_KEY?: string;
  /** IntoDNS.ai API key (`wrangler secret put INTODNS_API_KEY`).
   *  Optional — public diagnostic endpoints work without a key; setting
   *  one raises the upstream abuse-protection ceiling for `/scan/quick`,
   *  `/report/everything`, and snapshot creation. */
  INTODNS_API_KEY?: string;
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
  /** X (Twitter) API OAuth 2.0 Bearer token for posting tweets via API v2.
   *  Set via `wrangler secret put X_API_BEARER_TOKEN`. Optional — the
   *  automated posting routes return 503 when unset. */
  X_API_BEARER_TOKEN?: string;
  /** X (Twitter) API OAuth 1.0a credentials for user-authenticated posting.
   *  Required alongside X_API_BEARER_TOKEN to post as a user. Set via
   *  `wrangler secret put X_API_KEY`, `X_API_KEY_SECRET`,
   *  `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`. All optional — posting
   *  routes return 503 when incomplete. */
  X_API_KEY?: string;
  X_API_KEY_SECRET?: string;
  X_ACCESS_TOKEN?: string;
  X_ACCESS_TOKEN_SECRET?: string;
  /** LinkedIn API access token for posting (OAuth 2.0, `w_member_social`
   *  scope). Set via `wrangler secret put LINKEDIN_ACCESS_TOKEN`. Optional
   *  — the automated posting routes return 503 when unset. */
  LINKEDIN_ACCESS_TOKEN?: string;
  /** LinkedIn API client credentials for refreshing the access token.
   *  Set via `wrangler secret put LINKEDIN_CLIENT_ID` and
   *  `LINKEDIN_CLIENT_SECRET`. Optional — without them, the token
   *  cannot be auto-refreshed when it expires. */
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  /** Master switch for social auto-posting. The drip cron only posts when
   *  this is the literal "true". Off by default — set via
   *  `wrangler secret put SOCIAL_AUTOPOST_ENABLED` (or vars). */
  SOCIAL_AUTOPOST_ENABLED?: string;
  /** Max auto-posts PER PLATFORM per cron tick (drip rate). Default 1. */
  SOCIAL_DRIP_PER_TICK?: string;
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
  /** Optional self-hosted file2txt bridge for CPU-heavy PDF/DOCX extraction.
   *  Unset → /api/v1/report/ingest returns 503 for PDF/DOCX (the free-plan
   *  10ms CPU cap blocks in-Worker parsing); text/HTML/image still work. */
  FILE2TXT_BRIDGE_URL?: string;
  FILE2TXT_BRIDGE_TOKEN?: string;
  /** CrowdSec CTI API key (free registration at crowdsec.net). Optional —
   *  the /api/v1/ioc/check CrowdSec provider degrades to 'unsupported'
   *  when unset. Free tier: 1000 lookups/month. */
  CROWDSEC_API_KEY?: string;
  /** IPinfo.io access token (free registration at ipinfo.io). Optional —
   *  improves rate limits from ~50/day to 50k/month. */
  IPINFO_TOKEN?: string;
  /** IP Quality Score API key (free at ipqualityscore.com). Optional — the
   *  IP enrichment provider degrades to 'unsupported' when unset. Provides
   *  proxy/VPN/TOR detection, fraud scoring, and abuse velocity. */
  IPQS_API_KEY?: string;
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
  /** PhishTank API key (free registration at phishtank.org/developer_info.php).
   *  Set via `wrangler secret put PHISHTANK_API_KEY`. Optional — the phish
   *  feed works without it using OpenPhish + brand detection; setting a key
   *  adds PhishTank's verified + target metadata. */
  PHISHTANK_API_KEY?: string;
  /** Hudson Rock Cavalier API v3 key (free at hudsonrock.com/free-api-key).
   *  Set via `wrangler secret put HUDSONROCK_API_KEY`. Optional — when unset,
   *  the infostealer intelligence routes and MCP tools degrade to the legacy
   *  v2 free endpoints (no key required, limited fields). */
  HUDSONROCK_API_KEY?: string;
  /** Canonical site URL. Set via
   *  `wrangler.jsonc#vars.SITE_URL` — used for CORS, RSS links, and
   *  canonical URLs. Falls back to the hardcoded default. */
  SITE_URL?: string;
  /** Secret for signing internal tokens (HMAC-SHA256). When set, replaces the
   *  deterministic fallback. Set via `wrangler secret put INTERNAL_TOKEN_SECRET`. */
  INTERNAL_TOKEN_SECRET?: string;
  /** When set to "true", allows localhost dev origins in CORS and auth checks.
   *  Unset in production to prevent local dev servers from authenticating. */
  ALLOW_DEV_ORIGINS?: string;
  /** PhantomCandle threat intel API credentials. Set via wrangler secrets.
   *  Required for si_enrich_ip / si_enrich_ip_batch to query
   *  phantomcandle.net for port-level threat attribution. */
  PHANTOMCANDLE_USER?: string;
  PHANTOMCANDLE_TOKEN?: string;
  /** Set "true" to disable AI blog illustrations (cost control). Default: on. */
  BLOG_AI_IMAGES_DISABLED?: string;
  /** BuiltWith Domain API key (paid). Optional — when unset, the
   *  /api/v1/builtwith tech-stack lookup falls back to a free, self-contained
   *  heuristic that fingerprints the target's live HTTP headers + HTML body.
   *  There is no free BuiltWith JSON API, so the heuristic is the default. */
  BUILTWITH_API_KEY?: string;
  /**
   * ASSETS binding — the SVG-PNG renderer (si-svg-png.ts) loads its fonts
   * from the static asset bucket at runtime. The binding is plumbed in by
   * the worker (worker/index.ts) which mounts apiApp with the full Env
   * (including ASSETS). Marked optional so the type stays usable from
   * contexts (api-only unit tests, vitest) that don't have the binding.
   */
  /** Traceix.com (PCEF) API key for SHA-256 hash AV/reputation lookups.
   *  Set via `wrangler secret put TRACEIX_API_KEY`. Free at perkinsfund.org. */
  TRACEIX_API_KEY?: string;
  /** Static asset bucket binding. Type matches `Fetcher` from
   *  @cloudflare/workers-types so the SVG-PNG renderer's `env.ASSETS.fetch(...)`
   *  call is fully typed end-to-end. Optional so api-only unit tests still
   *  compile when the binding is unbound. */
  ASSETS: Fetcher;
}

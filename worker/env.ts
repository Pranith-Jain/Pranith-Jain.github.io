import type { Ai, D1Database, Fetcher, Queue } from '@cloudflare/workers-types';
import type { DfirMcpServer } from './mcp-server';
import type { FeedQueueMessage } from '../api/src/lib/live-iocs-slices';

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  KV_CACHE?: KVNamespace;
  BRIEFINGS_DB?: D1Database;
  CASE_STUDIES: KVNamespace;
  AI: Ai;
  /** Self-referencing service binding — same Worker, in-process. Lets the
   *  case-study discovery runner (and cron) call /api/v1/* endpoints
   *  without going through the public URL + API-key gate. */
  SELF: Fetcher;
  // Fetch-interface DOs (no RPC) — the plain LiveFeedDO/CronLockDO classes
  // aren't DurableObjectBranded, so bind them as the untyped namespace; calls
  // go through .get(id).fetch(). DfirMcpServer (McpAgent) keeps its generic.
  LIVE_FEED_DO: DurableObjectNamespace;
  DFIR_MCP: DurableObjectNamespace<DfirMcpServer>;
  CRON_LOCK_DO: DurableObjectNamespace;
  /** Report-generation pipeline DO (alarm-driven Copilot full-report builder). */
  REPORT_BUILDER: DurableObjectNamespace;
  /** Autonomous investigator agent DO. */
  INVESTIGATOR_AGENT: DurableObjectNamespace;
  /** Radar deep-crawl DO. */
  RADAR_CRAWLER?: DurableObjectNamespace;
  /** Producer binding for the live-IOC per-source feed fan-out (PR2). */
  FEEDS_QUEUE?: Queue<FeedQueueMessage>;
  NVD_API_KEY?: string;
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
  RANSOMWARELIVE_API_KEY?: string;
  /** ChainAbuse API key (free key at chainabuse.com) for BTC abuse lookups.
   *  Optional — btc-abuse-check degrades gracefully when unset. */
  CHAINABUSE_API_KEY?: string;
  // Case-study generation pipeline. These were previously only declared
  // on the api/ env type and accessed via `env as unknown as CaseStudyEnv`
  // casts inside the pipeline orchestrators — a missing secret would
  // silently degrade generation (Groq quota-exhausted → 429, missing
  // GROQ_API_KEY → Workers AI fallback, missing VULNCHECK_API_TOKEN →
  // optional runner no-op) without any startup-time warning. Surfacing
  // them here lets `logStartupValidation` and the /health endpoint
  // report their presence, and gives the type system something to
  // check when run.ts and the admin routes read these via the
  // structured CaseStudyEnv cast.
  GOOGLE_AI_STUDIO_API_KEY?: string;
  GROQ_API_KEY?: string;
  VULNCHECK_API_TOKEN?: string;
  GOOGLE_SAFE_BROWSING_API_KEY?: string;
  ZOOMEYE_API_KEY?: string;
  /** IntoDNS.ai — optional. Public diagnostic endpoints work without a
   *  key; setting one raises the upstream abuse-protection ceiling. */
  INTODNS_API_KEY?: string;
  HUDSONROCK_API_KEY?: string;
  /** Set to literal "true" to route every new post to drafts:<slug> for
   *  human approval; anything else (unset, "false", "0") auto-publishes. */
  BLOG_APPROVAL_REQUIRED?: string;
  /** Master switch for social auto-posting (drip cron). Only "true" enables
   *  posting; off by default. Mirrors BLOG_APPROVAL_REQUIRED's flag style. */
  SOCIAL_AUTOPOST_ENABLED?: string;
  /** Max auto-posts per platform per cron tick (drip rate). Default 1. */
  SOCIAL_DRIP_PER_TICK?: string;
  /** Set "true" to disable AI blog illustrations (cost control). Default: on. */
  BLOG_AI_IMAGES_DISABLED?: string;
  /** Public site origin, used for WS origin allow-listing and absolute URLs in
   *  the cron/scheduled paths. Optional — falls back to the canonical origin. */
  SITE_URL?: string;
}

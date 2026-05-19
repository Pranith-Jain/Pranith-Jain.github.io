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
  DFIR_DEV_ERRORS?: string;
  DFIR_ANALYTICS?: AnalyticsEngineDataset;
  ADMIN_TOKEN: string;
  /** ransomware.live PRO API key (set via `wrangler secret put`). Optional —
   *  the /api/v1/rl/* proxy degrades to 503 when unset. */
  RANSOMWARELIVE_API_KEY?: string;
  /** Groq free-tier API key (set via `wrangler secret put GROQ_API_KEY`).
   *  Optional — case-study generation uses Groq as the quality primary when
   *  set, and falls back to Workers AI when unset/unavailable. */
  GROQ_API_KEY?: string;
  /** MyThreatIntel REST API bearer token (set via
   *  `wrangler secret put MYTHREATINTEL_API_TOKEN`). Optional — the
   *  /api/v1/mti proxy degrades to 503 when unset, and the in-process
   *  consumers (live-iocs, ransomware-recent) fall back to the existing
   *  t.me/s/mythreatintel scraper so nothing that works today breaks. */
  MYTHREATINTEL_API_TOKEN?: string;
  /** Telegram CTI-archive bot token + channel id (set via
   *  `wrangler secret put TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHANNEL_ID`).
   *  Optional — the hourly archive cron is a no-op when either is unset. */
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHANNEL_ID?: string;
}

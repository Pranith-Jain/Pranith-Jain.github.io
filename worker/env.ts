import type { Ai, D1Database } from '@cloudflare/workers-types';
import type { LiveFeedDO } from './durable-objects/live-feed';
import type { CronLockDO } from './durable-objects/cron-lock';
import type { DfirMcpServer } from './mcp-server';

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  KV_CACHE?: KVNamespace;
  BRIEFINGS_DB?: D1Database;
  CASE_STUDIES: KVNamespace;
  AI: Ai;
  LIVE_FEED_DO: DurableObjectNamespace<LiveFeedDO>;
  DFIR_MCP: DurableObjectNamespace<DfirMcpServer>;
  CRON_LOCK_DO: DurableObjectNamespace<CronLockDO>;
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
}

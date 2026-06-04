import type { Ai, D1Database, Queue } from '@cloudflare/workers-types';
import type { DfirMcpServer } from './mcp-server';
import type { FeedQueueMessage } from '../api/src/lib/live-iocs-slices';

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  KV_CACHE?: KVNamespace;
  BRIEFINGS_DB?: D1Database;
  CASE_STUDIES: KVNamespace;
  AI: Ai;
  // Fetch-interface DOs (no RPC) — the plain LiveFeedDO/CronLockDO classes
  // aren't DurableObjectBranded, so bind them as the untyped namespace; calls
  // go through .get(id).fetch(). DfirMcpServer (McpAgent) keeps its generic.
  LIVE_FEED_DO: DurableObjectNamespace;
  DFIR_MCP: DurableObjectNamespace<DfirMcpServer>;
  CRON_LOCK_DO: DurableObjectNamespace;
  /** Report-generation pipeline DO (alarm-driven Copilot full-report builder). */
  REPORT_BUILDER: DurableObjectNamespace;
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
}

export interface Env {
  KV_CACHE?: KVNamespace;
  KV_SHARES?: KVNamespace;
  BRIEFINGS?: KVNamespace;
  CASE_STUDIES: KVNamespace;
  R2_FILES?: R2Bucket;
  AI: Ai;
  VT_API_KEY: string;
  ABUSEIPDB_API_KEY: string;
  SHODAN_API_KEY: string;
  CENSYS_PAT: string;
  CENSYS_ORG_ID: string;
  NETLAS_API_KEY: string;
  OTX_API_KEY: string;
  URLSCAN_API_KEY: string;
  HYBRID_ANALYSIS_API_KEY: string;
  ABUSECH_AUTH_KEY?: string;
  DFIR_DEV_ERRORS?: string;
  DFIR_ANALYTICS?: AnalyticsEngineDataset;
  ADMIN_TOKEN: string;
  /** ransomware.live PRO API key (set via `wrangler secret put`). Optional —
   *  the /api/v1/rl/* proxy degrades to 503 when unset. */
  RANSOMWARELIVE_API_KEY?: string;
}

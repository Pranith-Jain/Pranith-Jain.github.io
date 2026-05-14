export interface Env {
  KV_CACHE?: KVNamespace;
  KV_SHARES?: KVNamespace;
  BRIEFINGS?: KVNamespace;
  R2_FILES?: R2Bucket;
  VT_API_KEY: string;
  ABUSEIPDB_API_KEY: string;
  SHODAN_API_KEY: string;
  CENSYS_API_ID: string;
  CENSYS_API_SECRET: string;
  OTX_API_KEY: string;
  URLSCAN_API_KEY: string;
  HYBRID_ANALYSIS_API_KEY: string;
  ABUSECH_AUTH_KEY?: string;
  DFIR_DEV_ERRORS?: string;
  DFIR_ANALYTICS?: AnalyticsEngineDataset;
}

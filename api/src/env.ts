export interface Env {
  KV_CACHE?: KVNamespace;
  KV_SHARES?: KVNamespace;
  R2_FILES?: R2Bucket;
  VT_API_KEY: string;
  ABUSEIPDB_API_KEY: string;
  SHODAN_API_KEY: string;
  GREYNOISE_API_KEY: string;
  OTX_API_KEY: string;
  URLSCAN_API_KEY: string;
  HYBRID_ANALYSIS_API_KEY: string;
  PULSEDIVE_API_KEY: string;
  DFIR_DEV_ERRORS?: string;
}

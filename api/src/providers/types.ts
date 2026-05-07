import type { IndicatorType } from '../lib/indicator';

export type ProviderId =
  | 'virustotal'
  | 'abuseipdb'
  | 'shodan'
  | 'greynoise'
  | 'otx'
  | 'urlscan'
  | 'hybridanalysis'
  | 'pulsedive';

export type Verdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';

export interface ProviderResult {
  source: ProviderId;
  status: 'ok' | 'error' | 'unsupported';
  score: number; // 0-100, higher = more malicious
  verdict: Verdict;
  raw_summary: Record<string, unknown>;
  tags: string[];
  error?: string;
  fetched_at: string; // ISO
  cached: boolean;
}

export interface Indicator {
  type: IndicatorType;
  value: string;
}

export interface ProviderEnv {
  VT_API_KEY: string;
  ABUSEIPDB_API_KEY: string;
  SHODAN_API_KEY: string;
  GREYNOISE_API_KEY: string;
  OTX_API_KEY: string;
  URLSCAN_API_KEY: string;
  HYBRID_ANALYSIS_API_KEY: string;
  PULSEDIVE_API_KEY: string;
}

export type ProviderAdapter = (indicator: Indicator, env: ProviderEnv, signal: AbortSignal) => Promise<ProviderResult>;

export const PROVIDER_TIMEOUT_MS = 5000;

/** Which indicator types each provider supports. Used by the route to skip unsupported. */
export const PROVIDER_SUPPORT: Record<ProviderId, IndicatorType[]> = {
  virustotal: ['ipv4', 'ipv6', 'domain', 'url', 'hash'],
  abuseipdb: ['ipv4', 'ipv6'],
  shodan: ['ipv4', 'ipv6', 'domain'],
  greynoise: ['ipv4', 'ipv6'],
  otx: ['ipv4', 'ipv6', 'domain', 'url', 'hash'],
  urlscan: ['url', 'domain'],
  hybridanalysis: ['hash'],
  pulsedive: ['ipv4', 'ipv6', 'domain', 'url', 'hash'],
};

export type Verdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';

export type ProviderId =
  | 'virustotal'
  | 'abuseipdb'
  | 'shodan'
  | 'greynoise'
  | 'otx'
  | 'urlscan'
  | 'hybridanalysis'
  | 'pulsedive';

export interface ProviderResultWire {
  source: ProviderId;
  status: 'ok' | 'error' | 'unsupported';
  score: number;
  verdict: Verdict;
  raw_summary: Record<string, unknown>;
  tags: string[];
  error?: string;
  fetched_at: string;
  cached: boolean;
}

export interface MetaEvent {
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'unknown';
  value: string;
  providers: ProviderId[];
}

export interface DoneEvent {
  score: number;
  verdict: Verdict;
  confidence: 'low' | 'medium' | 'high';
  contributing: number;
}

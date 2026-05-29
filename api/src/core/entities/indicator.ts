export type IndicatorType = 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'unknown';
export type Verdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';
export type ProviderId = string;

export interface Indicator {
  type: IndicatorType;
  value: string;
}

export interface ProviderResult {
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

export interface CompositeScore {
  score: number;
  verdict: Verdict;
  confidence: 'low' | 'medium' | 'high';
  providerCount: number;
}

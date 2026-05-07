export type Verdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';

export interface PhishingAnalysisResponse {
  headers: Record<string, string | number | undefined>;
  auth: {
    spf: string;
    dkim: string;
    dmarc: string;
    raw?: string;
  };
  urls: string[];
  score: number;
  verdict: 'clean' | 'suspicious' | 'malicious';
  flags: string[];
}

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

export interface DomainLookupResponse {
  domain: string;
  score: number;
  verdict: 'strong' | 'partial' | 'weak';
  dns: Record<'A' | 'AAAA' | 'NS' | 'CNAME' | 'SOA' | 'MX' | 'TXT' | 'CAA', { records: string[]; error?: string }>;
  rdap: {
    registrar?: string;
    created?: string;
    expires?: string;
    updated?: string;
    nameservers: string[];
    status: string[];
    error?: string;
  };
  email_auth: {
    spf: { present: boolean; policy?: string; record?: string };
    dmarc: { present: boolean; policy?: string; pct?: number; record?: string };
    dkim: { selectors_found: string[] };
    bimi: { present: boolean; logo?: string };
    mta_sts: { present: boolean; mode?: string; maxAge?: number };
    tls_rpt: { present: boolean; rua?: string };
    evaluation: {
      score: number;
      verdict: 'strong' | 'partial' | 'weak';
      weaknesses: string[];
    };
  };
  certificates: Array<{
    id: number;
    issuer: string;
    not_before: string;
    not_after: string;
    subjects: string[];
  }>;
}

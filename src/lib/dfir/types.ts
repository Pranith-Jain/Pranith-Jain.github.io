export type { ThreatActor, ActorStatus, Sophistication } from '../../data/dfir/threat-actors';

export interface StixParseResponse {
  actors: Array<{ id: string; name: string; aliases: string[]; motivation?: string }>;
  campaigns: Array<{ id: string; name: string; description?: string; first_seen?: string; actor_id?: string }>;
  attack_patterns: Array<{ id: string; name: string; mitre_id?: string }>;
  indicators: Array<{ id: string; pattern: string; type: string; value: string; labels: string[] }>;
}

export type Verdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';

export interface ExposureScanResponse {
  domain: string;
  subdomains: Array<{
    name: string;
    ips: string[];
    shodan?: {
      source: string;
      status: string;
      score: number;
      verdict: string;
      raw_summary: { ports?: number[]; country?: string; org?: string; vulns?: string[] };
      tags: string[];
      error?: string;
    };
  }>;
  total_subdomains_seen: number;
  score: number;
  verdict: 'low' | 'medium' | 'high';
  shodan_enabled: boolean;
}

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
  | 'censys'
  | 'netlas'
  | 'otx'
  | 'urlscan'
  | 'hybridanalysis'
  | 'spamhaus'
  | 'tor'
  | 'doh'
  | 'openphish'
  | 'threatfox'
  | 'urlhaus'
  | 'malwarebazaar'
  | 'malshare'
  | 'hashlookup'
  | 'cinsarmy'
  | 'bitwire'
  | 'blocklistde'
  | 'binarydefense'
  | 'ipsum'
  | 'phishingArmy'
  | 'tweetfeed'
  | 'greynoise'
  | 'c2tracker'
  | 'sslbl'
  | 'yaraify'
  | 'phishtank'
  | 'malwareworld'
  | 'emailrep'
  | 'malpedia'
  | 'pulsedive'
  | 'shodan-internetdb'
  | 'spur'
  | 'crowdsec'
  | 'ipinfo'
  | 'phishstats'
  | 'digitalside'
  | 'criminalip'
  | 'certpl'
  | 'x4bnet'
  | 'kaspersky'
  | 'vulncheck'
  | 'maltiverse'
  | 'secrets';

export type ProviderErrorCode =
  | 'rate_limited'
  | 'upstream_5xx'
  | 'upstream_4xx'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'timeout'
  | 'network'
  | 'parse'
  | 'unsupported_indicator'
  | 'no_api_key'
  | 'unknown';

export interface ProviderResultWire {
  source: ProviderId;
  status: 'ok' | 'error' | 'unsupported';
  score: number;
  verdict: Verdict;
  raw_summary: Record<string, unknown>;
  tags: string[];
  error?: string;
  error_code?: ProviderErrorCode;
  error_status?: number;
  error_tags?: string[];
  fetched_at: string;
  cached: boolean;
}

/**
 * One secret finding emitted by the `secrets` provider, surfaced via
 * `raw_summary.findings` (the server redacts the matched value, so
 * `redacted` is safe to render directly).
 */
export interface SecretFindingWire {
  type: string;
  redacted: string;
  source: 'url_string' | 'response_body';
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
  total?: number;
  admiralty?: {
    reliability: string;
    credibility: number;
    label: string;
  };
}

export interface FileAnalysisResponse {
  hash: string;
  hash_type: 'md5' | 'sha1' | 'sha256';
  providers: ProviderResultWire[];
  score: number;
  verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
}

export interface DomainLookupResponse {
  domain: string;
  score: number;
  verdict: 'strong' | 'partial' | 'weak';
  dns: Record<'A' | 'AAAA' | 'NS' | 'CNAME' | 'SOA' | 'MX' | 'TXT' | 'CAA', { records: string[]; error?: string }>;
  rdap: {
    registrar?: string;
    registrar_url?: string;
    registrar_iana_id?: string;
    registrar_abuse_email?: string;
    registrar_abuse_phone?: string;
    registry_domain_id?: string;
    created?: string;
    expires?: string;
    updated?: string;
    nameservers: string[];
    status: string[];
    dnssec?: string;
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

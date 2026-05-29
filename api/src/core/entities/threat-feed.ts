export interface ThreatFeedEntry {
  id: string;
  source: string;
  type: 'ip' | 'domain' | 'url' | 'hash' | 'email';
  value: string;
  firstSeen: string;
  lastSeen: string;
  tags: string[];
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  reference?: string;
}

export interface ThreatFeedSource {
  id: string;
  name: string;
  url: string;
  type: 'rss' | 'api' | 'scrape' | 'taxii';
  status: 'active' | 'degraded' | 'down' | 'deprecated';
  category: string;
  refreshInterval: number;
  lastFetch?: string;
  entryCount?: number;
}

export interface RansomwareIncident {
  groupName: string;
  victim: string;
  country?: string;
  sector?: string;
  date: string;
  status: 'leaked' | 'negotiating' | 'unknown';
  url?: string;
  description?: string;
  revenue?: string;
}

export interface C2Server {
  ip: string;
  port: number;
  protocol: string;
  firstSeen: string;
  lastSeen: string;
  tags: string[];
  asn?: string;
  country?: string;
  malware?: string;
}

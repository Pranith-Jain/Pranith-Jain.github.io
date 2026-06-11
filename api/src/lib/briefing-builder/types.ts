import type { IocEntry } from '../ioc-feed-parsers';

export type BriefingType = 'daily' | 'weekly' | 'landscape';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export interface BriefingFinding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  cvss?: number;
  cwes?: string[];
  source: string;
  source_url?: string;
  mitre_techniques: string[];
  added?: string;
  vendor?: string;
  product?: string;
  tags?: {
    cves: string[];
    actors: Array<{ slug: string; mitre_id?: string }>;
    sectors: string[];
  };
}

export interface BriefingSection {
  id: string;
  title: string;
  count: number;
  blurb: string;
  findings: BriefingFinding[];
}

export interface BriefingIocBuckets {
  urls: IocEntry[];
  domains: IocEntry[];
  ipv4s: IocEntry[];
  hashes: IocEntry[];
}

export interface BriefingStats {
  findings: number;
  sections: number;
  cves: number;
  kevs: number;
  iocs: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface Briefing {
  slug: string;
  type: BriefingType;
  title: string;
  date: string;
  date_range: string;
  range_start: string;
  range_end: string;
  generated_at: string;
  executive_summary: string;
  stats: BriefingStats;
  sections: BriefingSection[];
  iocs: BriefingIocBuckets;
  mitre_techniques: string[];
  sources: string[];
  degraded?: boolean;
}

export interface KevEntry {
  cveID: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  dateAdded: string;
  shortDescription?: string;
  requiredAction?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
  notes?: string;
}

export interface KevDoc {
  vulnerabilities: KevEntry[];
}

export interface NvdCvssMetric {
  cvssData: { baseScore: number; baseSeverity?: string };
}

export interface NvdCve {
  id: string;
  descriptions?: Array<{ lang: string; value: string }>;
  metrics?: {
    cvssMetricV31?: NvdCvssMetric[];
    cvssMetricV30?: NvdCvssMetric[];
    cvssMetricV2?: NvdCvssMetric[];
  };
  weaknesses?: Array<{
    description?: Array<{ lang: string; value: string }>;
  }>;
}

export interface NvdResponse {
  vulnerabilities?: Array<{ cve: NvdCve }>;
}

export interface CategoryRule {
  id: string;
  title: string;
  blurb: string;
  cwes?: string[];
  match?: RegExp;
}

export interface WeeklyDailyRollup {
  findings: BriefingFinding[];
  ransomwareFindings: BriefingFinding[];
  iocsTotal: number;
  iocBuckets: BriefingIocBuckets;
  sources: string[];
  dailyCount: number;
}

export interface WeeklyMergeInput {
  findings: BriefingFinding[];
  ransomwareFindings: BriefingFinding[];
  iocsRawTotal: number;
  iocBuckets: BriefingIocBuckets;
  sources: string[];
}

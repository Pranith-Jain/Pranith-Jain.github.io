import type { IocEntry } from '../ioc-feed-parsers';

export type BriefingType = 'daily' | 'weekly' | 'landscape';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

/** Reference to a related briefing (case-triage linkage — see related.ts). */
export interface RelatedBriefingRef {
  slug: string;
  type: BriefingType;
  title: string;
  date_range: string;
  range_end: string;
  severity: Severity;
  /** Number of shared normalized IOCs (0 when matched via keywords only). */
  match_count: number;
  /** True when the link came from the shared-tactic-keyword fallback. */
  keyword_match: boolean;
}

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
  /** In-window ransomware victim claims (counted from the ransomware-activity
   *  section — uncapped; the section findings are only trimmed by
   *  capBriefingForStorage if the body would exceed D1's 2 MB row limit).
   *  Surfaced as a stat pill and as a count badge on the JumpNav 'Ransomware'
   *  pill. */
  ransomware_victims: number;
}

export interface BriefingIocDump {
  /** Number of IOCs included in the txt dump. Uncapped by default; equals
   *  rawTotal unless capBriefingForStorage trimmed it to fit D1's 2 MB limit
   *  (see `truncated`). */
  count: number;
  /** Total unique IOCs observed in-window before any storage trim. */
  rawTotal: number;
  /** Newline-separated list, one IOC per line. */
  content: string;
  /** Set when the dump was trimmed to keep the briefing body under D1's 2 MB
   *  per-row limit. `count` then reflects the stored (trimmed) line count while
   *  `rawTotal` still carries the true observed total. */
  truncated?: boolean;
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
  /**
   * Plain-text dump of every IOC after cross-source dedup (uncapped; only
   * trimmed by capBriefingForStorage when the body would exceed D1's 2 MB row
   * limit). Surface this as a download or paste-friendly <pre> block; the
   * inline IocTable on the brief page is just a quick-look summary now.
   */
  ioc_dump?: BriefingIocDump;
  mitre_techniques: string[];
  sources: string[];
  /**
   * Case-triage linkage (port of the CTI case queue's related-case matching):
   * prior briefings sharing normalized IOCs or tactic keywords. Stamped at
   * write time; served inline with the body and via /api/v1/briefings/related.
   */
  related_briefings?: RelatedBriefingRef[];
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

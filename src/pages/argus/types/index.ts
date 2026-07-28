// Actor, malware, CVE, TTP, and campaign types — based on threatnexus's
// contributing schema with our own additions (data_source, review_status,
// sector_scores) so the build is structurally richer.

export type Motivation = 'espionage' | 'financial' | 'destructive' | 'mixed' | 'surveillance';
export type GroupType = 'nation-state' | 'criminal' | 'collective';
export type Confidence = 'high' | 'medium' | 'low';
export type Region = 'NA' | 'EU' | 'EA' | 'SA' | 'AF' | 'OC' | 'ME';
export type ViewKey = 'globe' | 'cluster' | 'diamond' | 'landscape' | 'feed' | 'hunt';

export interface Country {
  code: string;        // ISO-3166-1 alpha-2
  name: string;
  region: Region;
  lat: number;
  lng: number;
  // nation-state attribution colour (for globe/cluster)
  nation: string;      // key in NATION_PALETTE
}

export interface Ttp {
  id: string;          // MITRE ATT&CK technique id, e.g. T1566.001
  name: string;
  tactic: string;      // tactic slug, e.g. initial-access
}

export interface Malware {
  name: string;
  type: string;        // backdoor, stealer, wiper, ...
  platform: string;    // windows, linux, macos, multi
}

export interface CVE {
  id: string;          // CVE-YYYY-NNNNN
  cvss: number;
  product: string;
  year: number;
}

export interface Campaign {
  name: string;
  start: string;       // freeform: "Jan 2024" or "2024"
  end: string;         // "ongoing" or date
  sectors: string[];
  targets: string[];   // country names
  cves_used?: string[];
  source: string;      // attribution source
  summary: string;
}

export interface HuntQuery {
  platform: 'KQL' | 'CQL' | 'Sigma' | 'Splunk' | 'Elastic';
  title: string;
  url: string;         // repo link
  description: string;
}

export interface Detection {
  source: string;      // "SigmaHQ" | "Elastic" | "Splunk" | ...
  title: string;
  url: string;
}

export interface Member {
  name: string;
  role: string;
  status: 'indicted' | 'sanctioned' | 'identified';
}

export interface SectorScore {
  sector: string;
  score: number;       // 0..100 — how often this group hits the sector
  evidence: string[];  // campaign names that back the score
}

export interface Actor {
  id: string;          // slug, unique
  name: string;        // display name
  apt?: string;        // APT-XX designation
  mitre_id?: string;   // G00XX
  aka: string[];       // aliases
  country: string;     // ISO code of attributed nation
  agency: string;      // "GRU Unit 26165" etc
  group_type: GroupType; // nation-state, criminal, collective
  motivation: Motivation;
  active_since: number;
  last_seen: number;
  confidence: Confidence;
  description: string;
  sectors: string[];
  targets: string[];   // country names
  ttps: Ttp[];
  malware: Malware[];
  cves: CVE[];
  campaigns: Campaign[];
  hunt_queries: HuntQuery[];
  detections: Detection[];
  members: Member[];
  infra_patterns: string[];
  sector_scores: SectorScore[];
  sources: { label: string; url: string }[];
  archived?: boolean;
}

export interface Edge {
  source: string;      // actor id
  target: string;      // actor id
  weight: number;      // 1..N
  shared: {
    malware?: string[];
    cves?: string[];
    ttps?: string[];
  };
}

export interface FeedItem {
  id: string;
  title: string;
  source: string;
  url: string;
  published: string;  // ISO
  category: 'vendor' | 'news' | 'gov' | 'cve' | 'ransomware' | 'research' | 'alert';
  related_actors?: string[];   // actor ids matched
}

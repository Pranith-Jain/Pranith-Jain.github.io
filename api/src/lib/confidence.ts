import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * NATO Admiralty Code — source reliability (A–F) and information credibility (1–6).
 * Standard in defence/national-security CTI; increasingly used in commercial TIPs.
 */
export type SourceReliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type InfoCredibility = 1 | 2 | 3 | 4 | 5 | 6;

export interface AdmiraltyGrade {
  reliability: SourceReliability;
  credibility: InfoCredibility;
  label: string; // human-readable summary e.g. "B-2: Usually reliable / Probably True"
}

export type Confidence = 'very_high' | 'high' | 'moderate' | 'low' | 'very_low' | 'unassessed';

export interface ConfidenceScore {
  level: Confidence;
  score: number; // 0–100
  admiralty?: AdmiraltyGrade;
  sources_contributing: number;
  contradictory_sources: number;
  reasoning: string; // why this level was assigned
}

/**
 * Per-source reliability grading. Every collector/provider in the platform
 * gets a fixed Admiralty reliability ceiling based on track record, access,
 * and whether the source is primary/secondary/tertiary.
 */
export interface SourceReliabilityEntry {
  id: string;
  name: string;
  reliability: SourceReliability;
  category: 'primary' | 'secondary' | 'tertiary' | 'ai_generated' | 'inferred';
  description: string;
  known_bias?: string;
}

export const SOURCE_RELIABILITY_REGISTRY: Record<string, SourceReliabilityEntry> = {
  // ── Primary sources ─────────────────────────────────────────────────────
  ransomlook: {
    id: 'ransomlook',
    name: 'Ransomlook',
    reliability: 'B',
    category: 'primary',
    description: 'Direct leak-site scraping — posts from ransomware group onion sites',
    known_bias: 'Only claims posted to leak sites; misses private/extortion-only victims',
  },
  ransomwarelive: {
    id: 'ransomwarelive',
    name: 'ransomware.live PRO',
    reliability: 'B',
    category: 'primary',
    description: 'Authenticated API — ransom notes, negotiation logs, victim claims',
  },
  'cisa-kev': {
    id: 'cisa-kev',
    name: 'CISA KEV',
    reliability: 'A',
    category: 'primary',
    description: 'Known Exploited Vulnerabilities catalog — authoritative US govt source',
    known_bias: 'Only includes confirmed in-the-wild exploitation',
  },
  nvd: {
    id: 'nvd',
    name: 'NVD',
    reliability: 'A',
    category: 'primary',
    description: 'National Vulnerability Database — official CVE repository',
  },
  malpedia: {
    id: 'malpedia',
    name: 'Malpedia',
    reliability: 'B',
    category: 'primary',
    description: 'Curated malware family reference by Fraunhofer FKIE',
  },
  'abusech-urlhaus': {
    id: 'abusech-urlhaus',
    name: 'URLhaus',
    reliability: 'A',
    category: 'primary',
    description: 'abuse.ch URLhaus — confirmed malicious URLs',
    known_bias: 'URLs only, not host-level attribution',
  },
  'abusech-threatfox': {
    id: 'abusech-threatfox',
    name: 'ThreatFox',
    reliability: 'A',
    category: 'primary',
    description: 'abuse.ch ThreatFox — confirmed malicious IOCs with context',
  },
  'abusech-malwarebazaar': {
    id: 'abusech-malwarebazaar',
    name: 'MalwareBazaar',
    reliability: 'A',
    category: 'primary',
    description: 'abuse.ch MalwareBazaar — confirmed malware samples with hashes',
  },
  'phish-tank': {
    id: 'phish-tank',
    name: 'PhishTank',
    reliability: 'B',
    category: 'primary',
    description: 'Crowdsourced phishing verification — community-vetted URLs',
  },
  openphish: {
    id: 'openphish',
    name: 'OpenPhish',
    reliability: 'B',
    category: 'primary',
    description: 'Curated commercial phishing feed',
  },
  'hudson-rock': {
    id: 'hudson-rock',
    name: 'Hudson Rock',
    reliability: 'C',
    category: 'secondary',
    description: 'Infostealer victim data — caveat emptor on completeness',
    known_bias: 'Only infostealer-compromised machines; not representative of all breaches',
  },
  'leak-check': {
    id: 'leak-check',
    name: 'LeakCheck',
    reliability: 'C',
    category: 'secondary',
    description: 'Breach database aggregator — aggregated from multiple dumps',
  },
  xposedornot: {
    id: 'xposedornot',
    name: 'XposedOrNot',
    reliability: 'C',
    category: 'secondary',
    description: 'Breach aggregation service — community-sourced corpus',
  },

  // ── Secondary sources ───────────────────────────────────────────────────
  'telegram-feed': {
    id: 'telegram-feed',
    name: 'Telegram Channel Feed',
    reliability: 'D',
    category: 'secondary',
    description: 'Public cybersec Telegram channels — IOC drops, leak announcements',
    known_bias: 'Self-selected channels; quality varies by channel',
  },
  'telegram-leak-monitor': {
    id: 'telegram-leak-monitor',
    name: 'Telegram Leak Monitor',
    reliability: 'D',
    category: 'secondary',
    description: 'Auto-scanned Telegram channels for credential/paste/file leaks',
    known_bias: 'Scanner heuristics produce false positives',
  },
  reddit: {
    id: 'reddit',
    name: 'Reddit Cybersec',
    reliability: 'D',
    category: 'secondary',
    description: '16 cybersec subreddits — discussion and link sharing',
    known_bias: 'Not verified; discussion may include unsubstantiated claims',
  },
  'x-twitter': {
    id: 'x-twitter',
    name: 'X/Twitter Cybersec',
    reliability: 'D',
    category: 'secondary',
    description: 'Cybersec researcher tweets — IOC drops, analysis threads',
  },
  bluesky: {
    id: 'bluesky',
    name: 'Bluesky Cybersec',
    reliability: 'D',
    category: 'secondary',
    description: 'Cybersec researcher posts — similar to X but smaller community',
  },
  ipsum: {
    id: 'ipsum',
    name: 'IPsum',
    reliability: 'C',
    category: 'secondary',
    description: 'Consensus-scored malicious IPs from 3+ source lists',
    known_bias: 'Consensus method reduces FPs but misses targeted/threshold attacks',
  },
  cinsarmy: {
    id: 'cinsarmy',
    name: 'CINS Army',
    reliability: 'C',
    category: 'secondary',
    description: 'Active malicious IP list — aggressive but high signal',
  },
  bitwire: {
    id: 'bitwire',
    name: 'Bitwire IP Blocklist',
    reliability: 'C',
    category: 'secondary',
    description: 'IP blocklist with moderate coverage',
  },
  mythreatintel: {
    id: 'mythreatintel',
    name: 'MyThreatIntel',
    reliability: 'C',
    category: 'secondary',
    description: 'Commercial CTI platform — IOCs, malware, CVEs, ransomware victims',
  },
  certspotter: {
    id: 'certspotter',
    name: 'Cert Spotter / crt.sh',
    reliability: 'B',
    category: 'primary',
    description: 'Certificate Transparency log search — authoritative for issued certs',
  },
  abuseipdb: {
    id: 'abuseipdb',
    name: 'AbuseIPDB',
    reliability: 'C',
    category: 'secondary',
    description: 'Crowdsourced IP reputation — community reports',
    known_bias: 'Community-vetted; can be gamed',
  },
  otx: {
    id: 'otx',
    name: 'AlienVault OTX',
    reliability: 'C',
    category: 'secondary',
    description: 'Open Threat Exchange — community pulses with IOCs',
  },
  virustotal: {
    id: 'virustotal',
    name: 'VirusTotal',
    reliability: 'B',
    category: 'secondary',
    description: 'Multi-engine file scanner — industry standard but opaque methodology',
  },

  // ── Tertiary / AI-generated / Inferred ──────────────────────────────────
  'ai-copilot': {
    id: 'ai-copilot',
    name: 'AI Copilot Analysis',
    reliability: 'F',
    category: 'ai_generated',
    description: 'LLM-generated assessment — must be verified by human analyst',
    known_bias: 'LLM may hallucinate attribution, IOCs, or citations',
  },
  'actor-dna': {
    id: 'actor-dna',
    name: 'Actor DNA Analysis',
    reliability: 'E',
    category: 'ai_generated',
    description: 'AI-driven actor profiling from TTP patterns',
    known_bias: 'Pattern-matching may produce false associations',
  },
  'heuristic-cve-link': {
    id: 'heuristic-cve-link',
    name: 'Heuristic CVE→Actor Link',
    reliability: 'E',
    category: 'inferred',
    description: 'Keyword-based matching between CVE descriptions and actor profiles',
    known_bias: 'Keyword matches may be coincidental',
  },
  predictive: {
    id: 'predictive',
    name: 'Predictive Intel',
    reliability: 'F',
    category: 'inferred',
    description: 'Forward-looking assessments based on historical patterns',
    known_bias: 'Extrapolation from past behaviour; novel TTPs not covered',
  },
  // ── New sources from repo analysis (2026-05-30) ─────────────────────────
  misp: {
    id: 'misp',
    name: 'MISP Feed System',
    reliability: 'B',
    category: 'secondary',
    description: 'Malware Information Sharing Platform — 200+ community-contributed feeds with STIX/TAXII output',
    known_bias: 'Quality varies by community feed; vetted by MISP instance admins',
  },
  'critical-path-feeds': {
    id: 'critical-path-feeds',
    name: 'CriticalPathSecurity Public Intelligence Feeds',
    reliability: 'B',
    category: 'secondary',
    description:
      'Curated, deduplicated aggregated feeds from Abuse.CH, AlienVault, Emerging Threats, SANS, ThreatFox, Tor, and others',
    known_bias: 'Aggregated source — inherits upstream biases; occasional false positives from community submissions',
  },
  'bert-jan-feed-catalog': {
    id: 'bert-jan-feed-catalog',
    name: 'Open-Source Threat-Intel-Feeds Catalog',
    reliability: 'C',
    category: 'secondary',
    description: 'CSV catalog of 145+ free threat intelligence feeds with vendor and type metadata',
    known_bias: 'Meta-catalog — accuracy depends on upstream feed maintenance',
  },
  yara_rules: {
    id: 'yara_rules',
    name: 'Community YARA Rules',
    reliability: 'C',
    category: 'secondary',
    description: 'Detection rules from YARAHub, InQuest/awesome-yara, and community YARA repositories',
    known_bias: 'Variable quality; some rules may produce false positives across different malware variants',
  },
  'gendigital-ioc': {
    id: 'gendigital-ioc',
    name: 'gendigitalinc IOC Repository',
    reliability: 'C',
    category: 'secondary',
    description:
      'Per-malware-family IoC directories with YARA rules — organized by family name with IP, domain, and hash indicators',
    known_bias: 'Limited to families tracked by the repository maintainer',
  },
  intelmq: {
    id: 'intelmq',
    name: 'INTELMQ Feed Processor',
    reliability: 'C',
    category: 'secondary',
    description: 'CERT Austria feed processing framework — normalized output from 200+ upstream feed collectors',
    known_bias:
      'Processing-level transformations are neutral; downstream accuracy depends on original feed reliability',
  },
  'jstrosch-samples': {
    id: 'jstrosch-samples',
    name: 'jstrosch Malware Samples',
    reliability: 'C',
    category: 'secondary',
    description: 'Curated malware sample collection organized by family with analysis notes and config extractors',
    known_bias: 'Sample selection bias toward families of interest to the researcher',
  },
  'mthcht-rules': {
    id: 'mthcht-rules',
    name: 'Awesome Rules Detection Collection',
    reliability: 'C',
    category: 'secondary',
    description: 'Multiformat detection rules (YARA, SIGMA, KQL, SPL, EQL) categorized by MITRE ATT&CK technique',
    known_bias: 'Curated from diverse sources — quality and freshness vary by rule origin',
  },
  // ── New sources from feed catalog CSV (2026-05-30) ───────────────────────
  greensnow: {
    id: 'greensnow',
    name: 'GreenSnow IP Blocklist',
    reliability: 'B',
    category: 'secondary',
    description: 'GreenSnow IP reputation blocklist — actively updated malicious IPs from honeypot network',
    known_bias: 'Automated honeypot detection; may include legitimate scanners',
  },
  'blocklist-de': {
    id: 'blocklist-de',
    name: 'Blocklist.de',
    reliability: 'B',
    category: 'secondary',
    description: 'Blocklist.de IP reputation — attack sources reported by distributed server network',
    known_bias: 'Attack-source aggregation; may include false positives from NAT/Shared IPs',
  },
  cinsscore: {
    id: 'cinsscore',
    name: 'CINSscore Bad IP List',
    reliability: 'B',
    category: 'secondary',
    description: 'CINS Army malicious IP list — actively maintained blocklist from distributed honeypot sensors',
    known_bias: 'Automated collection; some false positives from dynamic IP ranges',
  },
};

/**
 * Compute a confidence score for a finding based on source reliabilities,
 * number of corroborating sources, and whether contradictory sources exist.
 */
export function computeConfidence(params: {
  sourceIds: string[];
  contradictorySourceIds?: string[];
  findingType: 'ioc' | 'attribution' | 'vulnerability' | 'campaign' | 'apt_activity' | 'ransomware_claim' | 'general';
}): ConfidenceScore {
  const { sourceIds, contradictorySourceIds = [], findingType } = params;

  // Map source IDs to reliability scores (A=5, B=4, C=3, D=2, E=1, F=0)
  const reliabilityScore = (r: SourceReliability): number => ({ A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 })[r] ?? 0;
  const entryFor = (id: string): SourceReliabilityEntry | undefined => SOURCE_RELIABILITY_REGISTRY[id];

  // Reliability-weighted count
  let weightedCredibility = 0;
  for (const id of sourceIds) {
    const e = entryFor(id);
    if (e) {
      const w = reliabilityScore(e.reliability);
      weightedCredibility += w;
      // Primary sources get extra weight
      if (e.category === 'primary') weightedCredibility += 2;
    } else {
      weightedCredibility += 1; // unknown source = minimal weight
    }
  }

  // Contradictory sources reduce confidence
  let contradictionPenalty = 0;
  for (const id of contradictorySourceIds) {
    const e = entryFor(id);
    if (e) {
      const w = reliabilityScore(e.reliability);
      contradictionPenalty += w > 0 ? w + 1 : 1;
    } else {
      contradictionPenalty += 1;
    }
  }

  const sourceCount = sourceIds.length;
  const contradictoryCount = contradictorySourceIds.length;

  // Base score from source reliability and corroboration
  let score = Math.min(100, weightedCredibility * 8 + sourceCount * 5);
  // Penalty for contradictions
  score = Math.max(0, score - contradictionPenalty * 10);

  // Finding-type adjustments
  const typeAdjustments: Record<string, number> = {
    ioc: 5, // IOCs are generally more reliable
    vulnerability: 5, // CVEs are well-documented
    ransomware_claim: 0, // Neutral
    attribution: -10, // Attribution is inherently uncertain
    campaign: -5, // Campaigns are analyst constructs
    apt_activity: -10, // APT tracking is uncertain
    general: 0,
  };
  score += typeAdjustments[findingType] ?? 0;
  score = Math.max(0, Math.min(100, score));

  // Admiralty grade
  let bestReliability: SourceReliability = 'F';
  for (const id of sourceIds) {
    const e = entryFor(id);
    if (e && reliabilityScore(e.reliability) > reliabilityScore(bestReliability)) {
      bestReliability = e.reliability;
    }
  }
  // Best credibility based on source count and contradictions
  let credibility: InfoCredibility = 6;
  if (sourceCount >= 3 && contradictoryCount === 0) credibility = 1;
  else if (sourceCount >= 2 && contradictoryCount === 0) credibility = 2;
  else if (sourceCount >= 1 && contradictoryCount === 0) credibility = 3;
  else if (contradictoryCount > 0 && sourceCount > contradictoryCount) credibility = 4;
  else if (contradictoryCount >= sourceCount) credibility = 5;
  else credibility = 6;

  const admiralty: AdmiraltyGrade = {
    reliability: bestReliability,
    credibility,
    label: `${bestReliability}-${credibility}: ${reliabilityLabel(bestReliability)} / ${credibilityLabel(credibility)}`,
  };

  // Confidence level
  let level: Confidence;
  if (score >= 85) level = 'very_high';
  else if (score >= 70) level = 'high';
  else if (score >= 45) level = 'moderate';
  else if (score >= 20) level = 'low';
  else level = 'very_low';

  // Reasoning
  const parts: string[] = [];
  parts.push(`${sourceCount} source(s), ${contradictoryCount} contradictory`);
  if (sourceCount >= 2) parts.push('corroborated');
  if (contradictoryCount > 0) parts.push(`conflict from ${contradictoryCount} source(s)`);
  if (bestReliability <= 'B') parts.push('authoritative primary source');
  else if (bestReliability === 'C' || bestReliability === 'D') parts.push('secondary/aggregated source');
  else parts.push('low-reliability source');

  return {
    level,
    score,
    admiralty,
    sources_contributing: sourceCount,
    contradictory_sources: contradictoryCount,
    reasoning: parts.join('; ') || 'unassessed',
  };
}

function reliabilityLabel(r: SourceReliability): string {
  const labels: Record<SourceReliability, string> = {
    A: 'Reliable',
    B: 'Usually reliable',
    C: 'Fairly reliable',
    D: 'Not usually reliable',
    E: 'Unreliable',
    F: 'Unassessed',
  };
  return labels[r];
}

function credibilityLabel(c: InfoCredibility): string {
  const labels: Record<InfoCredibility, string> = {
    1: 'Confirmed',
    2: 'Probably True',
    3: 'Possibly True',
    4: 'Doubtful',
    5: 'Improbable',
    6: 'Cannot be judged',
  };
  return labels[c];
}

/**
 * Findings tagged with confidence — used across the platform for consistent
 * display. Every intel object that reaches the UI should carry this.
 */
export interface ConfidenceTagged {
  confidence: ConfidenceScore;
}

// ─── API handler ──────────────────────────────────────────────────────────

export async function sourceReliabilityHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json(
    {
      generated_at: new Date().toISOString(),
      total_sources: Object.keys(SOURCE_RELIABILITY_REGISTRY).length,
      sources: Object.values(SOURCE_RELIABILITY_REGISTRY).sort((a, b) => a.id.localeCompare(b.id)),
    },
    200,
    { 'Cache-Control': 'public, max-age=86400' }
  );
}

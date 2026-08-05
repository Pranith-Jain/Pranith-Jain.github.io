// ─────────────────────────────────────────────────────────────────────────
// Types - mirror api/src/lib/agent/types.ts. Kept inline so this component
// can be embedded in any client bundle without re-importing the agent types.
// ─────────────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Stakeholder =
  'cti' | 'soc' | 'ir' | 'vuln' | 'redteam' | 'appsec' | 'awareness' | 'exec' | 'legal' | 'tprm';

export interface ReportActionItem {
  severity: Severity;
  action: string;
  target?: string;
  source?: string;
  category: 'contain' | 'eradicate' | 'recover' | 'detect' | 'hunt' | 'inform';
  stakeholders?: Stakeholder[];
}

export interface ReportMitre {
  id: string;
  name?: string;
  tactic?: string;
  evidence?: string;
  detection?: 'yara' | 'sigma' | 'kql' | 'splunk' | 'none';
}

export interface ReportIoc {
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'cve' | 'actor' | 'malware';
  value: string;
  confidence: 'Confirmed' | 'Probable' | 'Possible';
  source?: string;
}

export interface ReportDiamond {
  adversary?: string;
  capability?: string[];
  infrastructure?: string[];
  victim?: string;
}

export interface ReportPir {
  pir: string;
  relevant: boolean;
  bluf?: string;
  businessOutcome?: string;
}

export interface ReportActionCard {
  verdict: {
    headline: string;
    confidence: 'high' | 'medium' | 'low';
    confidence_rationale?: string;
    posture: 'active' | 'reconnaissance' | 'post-exploit' | 'informational' | 'unknown';
    tlp: 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';
  };
  severity: Severity;
  actions: ReportActionItem[];
  mitre: ReportMitre[];
  iocs: ReportIoc[];
  kev: boolean;
  kev_date?: string | null;
  cvss?: { score: number | null; vector: string | null; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null };
  epss?: { score: number | null; percentile: number | null };
  ransomware_use?: 'Known' | 'Suspected' | null;
  threat_actors?: string[];
  exploit_status?: 'poc-public' | 'weaponized' | 'in-the-wild' | null;
  patch_url?: string | null;
  ransomware: boolean;
  attributed: boolean;
  timeline?: Array<{ date?: string; event: string; source?: string }>;
  navigatorLayer?: {
    name: string;
    description: string;
    techniques: Array<{ id: string; score: number; comment?: string }>;
  };
  diamond?: ReportDiamond;
  pirs?: ReportPir[];
  /** IOC/actor/CVE/MITRE relationship graph derived from tool results. */
  graph?: {
    nodes: Array<{ id: string; label: string; type: string; severity?: string }>;
    edges: Array<{ source: string; target: string; relationship: string; confidence: 'high' | 'medium' | 'low' }>;
  };
  /** Internal - populated by synthesizer when it parses the :::handoff block. */
  handoff?: { next_stages: string[]; analyst_approval_required: boolean };
  /** Internal - populated by synthesizer when it parses the
   *  \`\`\`report-header block. Drives the BLUF hero card. */
  reportHeader?: {
    headline: string;
    bluf: string;
    key_takeaway: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    posture: 'active' | 'reconnaissance' | 'post-exploit' | 'informational' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
    tlp: 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';
    tlp_rationale?: string;
    actor?: string | null;
    campaign?: string | null;
    primary_indicator?: { type: string; value: string } | null;
    time_to_act?: string | null;
  };
}

/** Build a self-contained Markdown version of the report for sharing in
 *  Slack, email, or a ticketing system. Includes the BLUF, action checklist,
 *  IOC table, MITRE summary, and the full prose body. */
export const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; ring: string; pill: string }> = {
  critical: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-300 dark:ring-rose-800',
    pill: 'bg-rose-600 text-white',
  },
  high: {
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    text: 'text-orange-700 dark:text-orange-300',
    ring: 'ring-orange-300 dark:ring-orange-800',
    pill: 'bg-orange-500 text-white',
  },
  medium: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-300 dark:ring-amber-800',
    pill: 'bg-amber-500 text-white',
  },
  low: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-brand-700 dark:text-brand-300',
    ring: 'ring-blue-300 dark:ring-blue-800',
    pill: 'bg-brand-500 text-white',
  },
  info: {
    bg: 'bg-slate-50 dark:bg-[rgb(var(--surface-200))]',
    text: 'text-slate-700 dark:text-slate-300',
    ring: 'ring-slate-300 dark:ring-slate-700',
    pill: 'bg-slate-500 text-white',
  },
};

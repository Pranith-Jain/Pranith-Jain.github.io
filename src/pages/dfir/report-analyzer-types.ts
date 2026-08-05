// ── Response types (mirrors api/src/lib/report-analyzer.ts) ──────────

export type IocKind = 'ip' | 'ipv6' | 'url' | 'domain' | 'hash' | 'cve' | 'email' | 'file-path' | 'directory';
export interface ExtractedIoc {
  value: string;
  kind: IocKind;
  confidence: number;
  confidence_band: 'high' | 'medium' | 'low';
  evidence: string;
  source: 'report-text' | 'image-ocr';
  maltiverse?: {
    score: number;
    verdict: string;
    classification?: string;
    tags?: string[];
  };
}
export interface TtpHit {
  id: string;
  name: string;
  tactic: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}
export interface ExtractedCve {
  id: string;
  context: string;
  cvss_v3?: number;
  cvss_severity?: string;
  epss?: number;
  epss_percentile?: number;
  exploited_in_wild?: boolean;
  in_kev?: boolean;
  description?: string;
  products?: string[];
  references?: Array<{ url: string; tags?: string[] }>;
}
export interface FiveW {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  how?: string;
  so_what?: string;
  what_next?: string;
  attribution_basis?: string;
  confidence: number;
}
export interface MindmapNode {
  id: string;
  label: string;
  kind: 'actor' | 'malware' | 'ttp' | 'ioc' | 'cve' | 'finding';
}
export interface MindmapEdge {
  source: string;
  target: string;
  label: string;
}

/** Diamond Model - 4-axis view of an intrusion. */
export interface DiamondModel {
  adversary: string[];
  capability: { id: string; name: string; tactic: string; evidence: string }[];
  infrastructure: string[];
  victim: { sector: string; geography: string; asset: string };
}

/** Attack Flow - kill-chain phases, each holding the TTPs observed in that phase. */
export interface AttackFlowPhase {
  phase: string;
  techniques: { id: string; name: string; evidence: string }[];
}

export interface AnalyzerOutput {
  title: string;
  source?: string;
  sourceText: string;
  textLength: number;
  generatedAt: string;
  summary: { text: string; model: string } | null;
  fiveW: FiveW | null;
  iocs: ExtractedIoc[];
  ttp: TtpHit[];
  cves: ExtractedCve[];
  mindmap: { nodes: MindmapNode[]; edges: MindmapEdge[] };
  diamond: DiamondModel | null;
  attackFlow: AttackFlowPhase[];
  detection: {
    siemRules: {
      title: string;
      description: string;
      severity: string;
      mitreId?: string;
      query?: string;
      platform?: string;
    }[];
    monitoringGuidance: { category: string; items: string[] }[];
    cliCommands: { purpose: string; command: string; platform?: string }[];
    detectionLimitations: string[];
    model?: string;
  } | null;
  conclusion: {
    keyTakeaways: string[];
    recommendedActions: { priority: string; action: string; rationale?: string }[];
    riskAssessment: string;
    model?: string;
  } | null;
  stix: { bundle: { type: string; id: string; objects: unknown[] }; view: unknown } | null;
  errors: { branch: string; message: string }[];
  elapsed_ms: number;
}

// ── Mindmap renderer (light-mode + dark: tokens, in-page xyflow) ─────

export const NODE_STYLES: Record<MindmapNode['kind'], { light: string; dark: string; ring: string }> = {
  finding: {
    light: 'border-slate-400 bg-slate-50 text-slate-900',
    dark: 'dark:border-slate-500 dark:bg-[rgb(var(--surface-200))] dark:text-slate-100',
    ring: '#64748b',
  },
  actor: {
    light: 'border-rose-300 bg-rose-50 text-rose-900',
    dark: 'dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-100',
    ring: '#e11d48',
  },
  malware: {
    light: 'border-orange-300 bg-orange-50 text-orange-900',
    dark: 'dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-100',
    ring: '#ea580c',
  },
  ttp: {
    light: 'border-violet-300 bg-violet-50 text-violet-900',
    dark: 'dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100',
    ring: '#7c3aed',
  },
  ioc: {
    light: 'border-sky-300 bg-sky-50 text-sky-900',
    dark: 'dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-100',
    ring: '#0284c7',
  },
  cve: {
    light: 'border-amber-300 bg-amber-50 text-amber-900',
    dark: 'dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100',
    ring: '#d97706',
  },
};


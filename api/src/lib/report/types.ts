// api/src/lib/report/types.ts
import type { ConfidenceScore, SourceReliability, InfoCredibility } from '../confidence';

/** The four v1 report templates. */
export type TemplateId = 'ransomware-group' | 'threat-actor' | 'cve' | 'ioc';

/** Entity class of the report subject (mirrors copilot's QueryType). */
export type SubjectType = 'cve' | 'ip' | 'domain' | 'hash' | 'actor' | 'ransomware' | 'generic';

/** TLP marking shown on the report cover. */
export type Tlp = 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';

/** Output of subject-resolver: a normalized, classified subject. */
export interface ResolvedSubject {
  raw: string;
  type: SubjectType;
  canonical: string;
  identifiers: {
    cve?: string;
    iocType?: 'ipv4' | 'domain' | 'hash';
    group?: string;
    aliases?: string[];
  };
  suggestedTemplate: TemplateId;
}

/** Where a source's data comes from and how expensive it is to fetch. */
export type SourceKind = 'cache' | 'live' | 'rag';

/** A single planned source, before it is fetched. */
export interface SourceDescriptor {
  id: string;
  name: string;
  kind: SourceKind;
  authority: SourceReliability;
  /** Estimated subrequest cost (cache=0, rag=1, live=1+). */
  cost: number;
}

/** A descriptor assigned to an execution phase. */
export interface PlannedSource extends SourceDescriptor {
  phase: number;
}

/** Budget that bounds each execution phase. */
export interface Budget {
  maxPhaseSubrequests: number;
}

/** Result of planning: descriptors grouped into budget-bounded phases. */
export interface SourcePlan {
  template: TemplateId;
  phases: PlannedSource[][];
}

/** A normalized item from a fetched source (populated by the gatherer in Plan B). */
export interface SourceItem {
  text: string;
  url?: string;
  observed_at?: string;
  fields?: Record<string, unknown>;
}

/** A fetched source's results (Plan B). */
export interface SourceResult {
  id: string;
  name: string;
  authority: SourceReliability;
  fetched_at: string;
  status: 'ok' | 'timeout' | 'error' | 'empty';
  items: SourceItem[];
  total: number;
}

/** A single citation: a numbered reference back to an exact source fragment. */
export interface CitationEntry {
  ref: number;
  sourceId: string;
  name: string;
  authority: SourceReliability;
  url?: string;
  fragment: string;
  fetched_at?: string;
}

/** The persisted, structured report. */
export interface Report {
  meta: {
    id: string;
    subject: string;
    subject_type: SubjectType;
    template: TemplateId;
    tlp: Tlp;
    status: 'queued' | 'building' | 'done' | 'error';
    phase: string;
    model_used?: string;
    generated_at: string;
    timings?: Record<string, number>;
  };
  cover: {
    title: string;
    subtitle: string;
    tlp: Tlp;
    subject_badges: string[];
    generated_at: string;
  };
  executive_summary: string;
  key_findings: { text: string; confidence: 'High' | 'Medium' | 'Low'; refs: number[] }[];
  sections: { id: string; heading: string; body_md: string; refs: number[] }[];
  appendices: {
    iocs: { type: string; value: string; verdict?: string; first_seen?: string; refs: number[] }[];
    mitre: { tactic: string; technique_id: string; technique_name: string; refs: number[] }[];
    cves: { id: string; cvss?: number; epss?: number; kev?: boolean; refs: number[] }[];
    sources: {
      ref: number;
      name: string;
      authority: SourceReliability;
      credibility: InfoCredibility;
      url?: string;
      fetched_at?: string;
      freshness?: string;
    }[];
    conflicts: { claim: string; positions: string[]; note: string }[];
  };
  confidence: ConfidenceScore;
}

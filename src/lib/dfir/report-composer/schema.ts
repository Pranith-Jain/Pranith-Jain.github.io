// src/lib/dfir/report-composer/schema.ts
//
// Data model for the client-side Report Composer. Pure data — no
// React, no DOM, no jsPDF — so this file can be unit-tested with
// vitest and the same shape can be exported to PDF and DOCX.

export type Tlp = 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';

export interface Finding {
  text: string;
  confidence: 'High' | 'Medium' | 'Low';
  refs: number[];
}

export interface IocEntry {
  type: 'ip' | 'domain' | 'url' | 'hash-md5' | 'hash-sha1' | 'hash-sha256' | 'email' | 'cve' | 'btc' | 'other';
  value: string;
  context: string;
  refs: number[];
}

export interface Section {
  id: string;
  heading: string;
  body: string;
  refs: number[];
}

export interface Source {
  ref: number;
  name: string;
  url: string;
  retrieved: string;
}

export interface ReportDoc {
  meta: {
    title: string;
    subject: string;
    author: string;
    tlp: Tlp;
    caseId: string;
    classification: string;
    generatedAt: string;
  };
  executiveSummary: string;
  findings: Finding[];
  sections: Section[];
  iocs: IocEntry[];
  sources: Source[];
}

export const TLP_OPTIONS: Array<{ value: Tlp; label: string; color: string; description: string }> = [
  { value: 'CLEAR', label: 'TLP:CLEAR', color: 'slate',
    description: 'Public — may be distributed without restriction.' },
  { value: 'GREEN', label: 'TLP:GREEN', color: 'emerald',
    description: 'Community-wide — limited disclosure to the community.' },
  { value: 'AMBER', label: 'TLP:AMBER', color: 'amber',
    description: 'Limited disclosure — participants only.' },
  { value: 'RED', label: 'TLP:RED', color: 'rose',
    description: 'Restricted — named recipients only.' },
];

export const IOC_TYPES: Array<{ value: IocEntry['type']; label: string }> = [
  { value: 'ip', label: 'IP' },
  { value: 'domain', label: 'Domain' },
  { value: 'url', label: 'URL' },
  { value: 'hash-md5', label: 'MD5' },
  { value: 'hash-sha1', label: 'SHA1' },
  { value: 'hash-sha256', label: 'SHA256' },
  { value: 'email', label: 'Email' },
  { value: 'cve', label: 'CVE' },
  { value: 'btc', label: 'BTC' },
  { value: 'other', label: 'Other' },
];

export function emptyReport(): ReportDoc {
  return {
    meta: {
      title: 'Investigation Report',
      subject: '',
      author: '',
      tlp: 'AMBER',
      caseId: '',
      classification: 'Internal',
      generatedAt: new Date().toISOString(),
    },
    executiveSummary: '',
    findings: [],
    sections: [],
    iocs: [],
    sources: [],
  };
}

import type { TemplateId } from './types';

export interface SectionDef {
  id: string;
  heading: string;
  guidance: string;
}
export interface TemplateDef {
  title: (subject: string) => string;
  sections: SectionDef[];
}

export const REPORT_TEMPLATES: Record<TemplateId, TemplateDef> = {
  'ransomware-group': {
    title: (s) => `Ransomware Group Report: ${s}`,
    sections: [
      {
        id: 'overview',
        heading: 'Group Overview',
        guidance: 'Who the group is, RaaS model, first observed, current status — grounded only in cited evidence.',
      },
      {
        id: 'ttps',
        heading: 'Tactics, Techniques & Procedures',
        guidance: 'MITRE ATT&CK techniques (validated IDs only) with how the group uses them.',
      },
      {
        id: 'victimology',
        heading: 'Victimology',
        guidance: 'Targeted sectors/regions and notable victims from the leak-site evidence.',
      },
      {
        id: 'cves',
        heading: 'Exploited Vulnerabilities',
        guidance: 'CVEs the group is reported to exploit; note KEV status where present.',
      },
      {
        id: 'negotiations',
        heading: 'Negotiation & Economics',
        guidance: 'Ransom demands, settlements, discounts where evidence exists.',
      },
      {
        id: 'recommendations',
        heading: 'Defensive Recommendations',
        guidance: 'Concrete detections/mitigations mapped to the TTPs above.',
      },
    ],
  },
  'threat-actor': {
    title: (s) => `Threat Actor Profile: ${s}`,
    sections: [
      {
        id: 'overview',
        heading: 'Actor Overview',
        guidance: 'Identity, aliases, suspected origin/motivation — cited only.',
      },
      { id: 'ttps', heading: 'TTPs', guidance: 'Validated MITRE techniques and tradecraft.' },
      {
        id: 'targeting',
        heading: 'Targeting & Campaigns',
        guidance: 'Sectors, regions, notable campaigns from evidence.',
      },
      { id: 'tooling', heading: 'Malware & Tooling', guidance: 'Associated malware families and tools.' },
      { id: 'recommendations', heading: 'Recommendations', guidance: 'Detection and hardening guidance.' },
    ],
  },
  cve: {
    title: (s) => `Vulnerability Brief: ${s}`,
    sections: [
      {
        id: 'summary',
        heading: 'Vulnerability Summary',
        guidance: 'What the flaw is, affected products, CVSS — from validated CVE data only.',
      },
      {
        id: 'exploitation',
        heading: 'Exploitation Status',
        guidance: 'KEV listing, EPSS, in-the-wild/ransomware use where evidenced.',
      },
      { id: 'impact', heading: 'Impact & Exposure', guidance: 'Exposure signals and blast radius from evidence.' },
      {
        id: 'remediation',
        heading: 'Remediation & Detection',
        guidance: 'Patch guidance and detection opportunities.',
      },
    ],
  },
  ioc: {
    title: (s) => `Indicator Dossier: ${s}`,
    sections: [
      {
        id: 'verdict',
        heading: 'Reputation Verdict',
        guidance: 'Synthesize provider verdicts (cited) into an overall assessment.',
      },
      {
        id: 'context',
        heading: 'Threat Context',
        guidance: 'Associated campaigns/actors/malware from correlation + feeds.',
      },
      {
        id: 'pivots',
        heading: 'Pivots & Related Indicators',
        guidance: 'Correlated indicators and suggested next pivots.',
      },
      {
        id: 'recommendations',
        heading: 'Recommended Actions',
        guidance: 'Blocklisting, hunting, and monitoring guidance.',
      },
    ],
  },
};

/**
 * GRC framework data layer.
 *
 * Five frameworks side-by-side, with the structure (functions / categories /
 * controls) plus cross-references where official mappings exist:
 *
 *   - NIST CSF 2.0    (full 6 functions × 22 categories, representative subcats)
 *   - ISO 27001:2022  (4 themes, top controls)
 *   - CIS Controls v8 (18 controls)
 *   - SOC 2 TSC       (5 trust services criteria)
 *   - SOC-CMM         (5 domains × 5 maturity levels)
 *
 * Sources:
 *   - https://www.nist.gov/cyberframework
 *   - https://www.iso.org/standard/27001
 *   - https://www.cisecurity.org/controls
 *   - https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2
 *   - https://www.soc-cmm.com/
 *
 * Cross-mappings are illustrative - for audit work, validate against the
 * official mapping documents (NIST has published OSCAL mappings for CSF↔CIS
 * and CSF↔ISO that are the canonical source).
 */

export type FrameworkId = 'nist-csf' | 'iso-27001' | 'iso-42001' | 'cis' | 'soc2' | 'soc-cmm';

export const FRAMEWORK_META: Record<FrameworkId, { label: string; short: string; year: string }> = {
  'nist-csf': { label: 'NIST CSF 2.0', short: 'NIST Cybersecurity Framework 2.0', year: '2024' },
  'iso-27001': { label: 'ISO 27001:2022', short: 'ISO/IEC 27001 Annex A', year: '2022' },
  'iso-42001': { label: 'ISO 42001:2023', short: 'ISO/IEC 42001 - AI Management System', year: '2023' },
  cis: { label: 'CIS Controls v8', short: 'Center for Internet Security Controls', year: '2021' },
  soc2: { label: 'SOC 2 TSC', short: 'AICPA Trust Services Criteria', year: '2017' },
  'soc-cmm': { label: 'SOC-CMM', short: 'SOC Capability Maturity Model', year: '2023' },
};

export type CoverageStatus = 'unset' | 'covered' | 'partial' | 'gap' | 'na';

export interface ControlMapping {
  /** Cross-reference to another framework - frameworkId : controlId */
  to: string;
  /** Optional display label override. */
  label?: string;
}

export interface Control {
  /** Stable id (used as storage key, e.g. "nist-csf:GV.OC-01"). */
  id: string;
  /** Short id shown in the UI (e.g. "GV.OC-01"). */
  shortId: string;
  /** Title. */
  title: string;
  /** Body - what the control requires. */
  body: string;
  /** Cross-mappings to other frameworks. */
  mappings?: ControlMapping[];
}

export interface Category {
  id: string;
  shortId: string;
  title: string;
  description: string;
  controls: Control[];
}

export interface Function_ {
  id: string;
  shortId: string;
  title: string;
  description: string;
  categories: Category[];
}

// ─────────────────────────────────────────────────────────────────────────
// NIST CSF 2.0
// ─────────────────────────────────────────────────────────────────────────

export const NIST_CSF: Function_[] = [
  {
    id: 'GV',
    shortId: 'GV',
    title: 'Govern',
    description:
      "New top-level function in CSF 2.0. Establish, communicate, and monitor the organisation's cybersecurity risk-management strategy, expectations, and policy.",
    categories: [
      {
        id: 'GV.OC',
        shortId: 'GV.OC',
        title: 'Organizational Context',
        description: 'Mission, stakeholders, legal obligations, dependencies are understood and inform risk decisions.',
        controls: [
          {
            id: 'nist-csf:GV.OC-01',
            shortId: 'GV.OC-01',
            title: 'Organisational mission is understood',
            body: 'The organisational mission is understood and informs cybersecurity risk management.',
            mappings: [{ to: 'iso-27001:A.5.1', label: 'A.5.1 Policies' }],
          },
          {
            id: 'nist-csf:GV.OC-03',
            shortId: 'GV.OC-03',
            title: 'Legal, regulatory, contractual requirements',
            body: 'Legal, regulatory, and contractual requirements are understood and managed.',
            mappings: [{ to: 'iso-27001:A.5.31', label: 'A.5.31 Legal/regulatory' }, { to: 'soc2:CC2.3' }],
          },
        ],
      },
      {
        id: 'GV.RM',
        shortId: 'GV.RM',
        title: 'Risk Management Strategy',
        description: 'Priorities, constraints, risk tolerances and assumptions are established.',
        controls: [
          {
            id: 'nist-csf:GV.RM-01',
            shortId: 'GV.RM-01',
            title: 'Risk management objectives',
            body: 'Risk-management objectives are established and agreed by stakeholders.',
            mappings: [{ to: 'iso-27001:A.5.1' }, { to: 'soc2:CC3.1' }],
          },
          {
            id: 'nist-csf:GV.RM-03',
            shortId: 'GV.RM-03',
            title: 'Risk-tolerance statements',
            body: 'Cybersecurity risk-tolerance statements are determined and communicated.',
            mappings: [{ to: 'soc2:CC3.2' }],
          },
        ],
      },
      {
        id: 'GV.RR',
        shortId: 'GV.RR',
        title: 'Roles, Responsibilities & Authorities',
        description: 'Cybersecurity roles and responsibilities are formalised and communicated.',
        controls: [
          {
            id: 'nist-csf:GV.RR-01',
            shortId: 'GV.RR-01',
            title: 'Leadership accountability',
            body: 'Organisational leadership is accountable for cybersecurity risk and fosters a risk-aware culture.',
            mappings: [{ to: 'iso-27001:A.5.2' }, { to: 'cis:14' }],
          },
          {
            id: 'nist-csf:GV.RR-04',
            shortId: 'GV.RR-04',
            title: 'Responsibilities for cybersecurity activities',
            body: 'Cybersecurity activities are integrated into roles and responsibilities across the workforce.',
            mappings: [{ to: 'iso-27001:A.6.2' }],
          },
        ],
      },
      {
        id: 'GV.PO',
        shortId: 'GV.PO',
        title: 'Policy',
        description: 'Organisational cybersecurity policy is established, communicated and enforced.',
        controls: [
          {
            id: 'nist-csf:GV.PO-01',
            shortId: 'GV.PO-01',
            title: 'Policy is established',
            body: 'Policy for managing cybersecurity risks is established based on the organisational context, risk-management strategy, priorities, and approved by leadership.',
            mappings: [{ to: 'iso-27001:A.5.1' }, { to: 'soc2:CC1.1' }, { to: 'cis:14' }],
          },
        ],
      },
      {
        id: 'GV.SC',
        shortId: 'GV.SC',
        title: 'Cybersecurity Supply Chain Risk Management',
        description: 'Supply-chain risks identified, assessed, prioritised, and managed.',
        controls: [
          {
            id: 'nist-csf:GV.SC-01',
            shortId: 'GV.SC-01',
            title: 'Supply-chain risk-management programme',
            body: 'A supply-chain risk-management programme is established, agreed by stakeholders, and supported by resources.',
            mappings: [{ to: 'iso-27001:A.5.19' }, { to: 'cis:15' }],
          },
        ],
      },
    ],
  },
  {
    id: 'ID',
    shortId: 'ID',
    title: 'Identify',
    description:
      'Develop organisational understanding to manage cybersecurity risk to systems, people, assets, data and capabilities.',
    categories: [
      {
        id: 'ID.AM',
        shortId: 'ID.AM',
        title: 'Asset Management',
        description: 'Assets that enable the organisation to achieve business purposes are identified and managed.',
        controls: [
          {
            id: 'nist-csf:ID.AM-01',
            shortId: 'ID.AM-01',
            title: 'Hardware inventory',
            body: 'Inventories of hardware managed by the organisation are maintained.',
            mappings: [{ to: 'iso-27001:A.5.9' }, { to: 'cis:1' }],
          },
          {
            id: 'nist-csf:ID.AM-02',
            shortId: 'ID.AM-02',
            title: 'Software inventory',
            body: 'Inventories of software, services and systems managed by the organisation are maintained.',
            mappings: [{ to: 'iso-27001:A.5.9' }, { to: 'cis:2' }],
          },
        ],
      },
      {
        id: 'ID.RA',
        shortId: 'ID.RA',
        title: 'Risk Assessment',
        description: 'Cybersecurity risk to organisational assets, individuals and operations is understood.',
        controls: [
          {
            id: 'nist-csf:ID.RA-01',
            shortId: 'ID.RA-01',
            title: 'Vulnerabilities identified',
            body: 'Vulnerabilities in assets are identified, validated, and recorded.',
            mappings: [{ to: 'iso-27001:A.8.8' }, { to: 'cis:7' }, { to: 'soc2:CC7.1' }],
          },
          {
            id: 'nist-csf:ID.RA-05',
            shortId: 'ID.RA-05',
            title: 'Risk prioritisation',
            body: 'Threats, vulnerabilities, likelihoods, and impacts are used to determine risks and inform prioritisation.',
            mappings: [{ to: 'soc2:CC3.2' }],
          },
        ],
      },
    ],
  },
  {
    id: 'PR',
    shortId: 'PR',
    title: 'Protect',
    description: 'Develop and implement appropriate safeguards to ensure delivery of critical services.',
    categories: [
      {
        id: 'PR.AA',
        shortId: 'PR.AA',
        title: 'Identity Management, Authentication & Access Control',
        description: 'Access to physical and logical assets is limited to authorised users, services and hardware.',
        controls: [
          {
            id: 'nist-csf:PR.AA-01',
            shortId: 'PR.AA-01',
            title: 'Identities and credentials issued',
            body: 'Identities and credentials for authorised users, services and hardware are managed.',
            mappings: [{ to: 'iso-27001:A.5.16' }, { to: 'cis:5' }, { to: 'cis:6' }],
          },
          {
            id: 'nist-csf:PR.AA-03',
            shortId: 'PR.AA-03',
            title: 'Users authenticated',
            body: 'Users, services and hardware are authenticated.',
            mappings: [{ to: 'iso-27001:A.5.17' }, { to: 'cis:6' }, { to: 'soc2:CC6.1' }],
          },
          {
            id: 'nist-csf:PR.AA-05',
            shortId: 'PR.AA-05',
            title: 'Least privilege',
            body: 'Access permissions, entitlements, and authorisations are defined in policy, managed, enforced and reviewed.',
            mappings: [{ to: 'iso-27001:A.5.18' }, { to: 'cis:6' }, { to: 'soc2:CC6.3' }],
          },
        ],
      },
      {
        id: 'PR.AT',
        shortId: 'PR.AT',
        title: 'Awareness & Training',
        description: 'Personnel are provided with cybersecurity awareness and training.',
        controls: [
          {
            id: 'nist-csf:PR.AT-01',
            shortId: 'PR.AT-01',
            title: 'Personnel awareness',
            body: 'Personnel are provided with awareness and training to perform their cybersecurity-related duties.',
            mappings: [{ to: 'iso-27001:A.6.3' }, { to: 'cis:14' }, { to: 'soc2:CC1.4' }],
          },
        ],
      },
      {
        id: 'PR.DS',
        shortId: 'PR.DS',
        title: 'Data Security',
        description: "Data is managed consistent with the organisation's risk strategy.",
        controls: [
          {
            id: 'nist-csf:PR.DS-01',
            shortId: 'PR.DS-01',
            title: 'Confidentiality, integrity, availability of data',
            body: 'The confidentiality, integrity, and availability of data-at-rest are protected.',
            mappings: [{ to: 'iso-27001:A.8.10' }, { to: 'cis:3' }, { to: 'soc2:CC6.7' }],
          },
          {
            id: 'nist-csf:PR.DS-02',
            shortId: 'PR.DS-02',
            title: 'Data-in-transit protected',
            body: 'The confidentiality, integrity, and availability of data-in-transit are protected.',
            mappings: [{ to: 'iso-27001:A.8.20' }, { to: 'cis:3' }, { to: 'soc2:CC6.7' }],
          },
        ],
      },
      {
        id: 'PR.PS',
        shortId: 'PR.PS',
        title: 'Platform Security',
        description: 'Hardware, software, and services are managed consistent with risk.',
        controls: [
          {
            id: 'nist-csf:PR.PS-02',
            shortId: 'PR.PS-02',
            title: 'Software hardening / patching',
            body: 'Software is maintained, replaced, and removed in a way that minimises the introduction of vulnerabilities.',
            mappings: [{ to: 'iso-27001:A.8.8' }, { to: 'cis:7' }],
          },
          {
            id: 'nist-csf:PR.PS-04',
            shortId: 'PR.PS-04',
            title: 'Logs generated',
            body: 'Log records are generated and made available for continuous monitoring.',
            mappings: [{ to: 'iso-27001:A.8.15' }, { to: 'cis:8' }, { to: 'soc2:CC7.2' }],
          },
        ],
      },
    ],
  },
  {
    id: 'DE',
    shortId: 'DE',
    title: 'Detect',
    description: 'Develop and implement appropriate activities to identify the occurrence of a cybersecurity event.',
    categories: [
      {
        id: 'DE.CM',
        shortId: 'DE.CM',
        title: 'Continuous Monitoring',
        description: 'Assets are monitored to find anomalies, indicators of compromise, and events.',
        controls: [
          {
            id: 'nist-csf:DE.CM-01',
            shortId: 'DE.CM-01',
            title: 'Network monitored',
            body: 'Networks and network services are monitored to find potentially adverse events.',
            mappings: [{ to: 'iso-27001:A.8.16' }, { to: 'cis:13' }, { to: 'soc2:CC7.2' }],
          },
          {
            id: 'nist-csf:DE.CM-09',
            shortId: 'DE.CM-09',
            title: 'Computing hardware/software monitored',
            body: 'Computing hardware and software, runtime environments and their data are monitored.',
            mappings: [{ to: 'cis:8' }],
          },
        ],
      },
      {
        id: 'DE.AE',
        shortId: 'DE.AE',
        title: 'Adverse Event Analysis',
        description: 'Events are analysed to characterise them and detect cybersecurity incidents.',
        controls: [
          {
            id: 'nist-csf:DE.AE-02',
            shortId: 'DE.AE-02',
            title: 'Adverse events analysed',
            body: 'Potentially adverse events are analysed to better understand activities.',
            mappings: [{ to: 'iso-27001:A.5.25' }, { to: 'cis:13' }],
          },
          {
            id: 'nist-csf:DE.AE-08',
            shortId: 'DE.AE-08',
            title: 'Incident declaration thresholds',
            body: 'Incidents are declared when adverse events meet defined criteria.',
            mappings: [{ to: 'iso-27001:A.5.26' }, { to: 'soc2:CC7.3' }],
          },
        ],
      },
    ],
  },
  {
    id: 'RS',
    shortId: 'RS',
    title: 'Respond',
    description: 'Take action regarding a detected cybersecurity incident.',
    categories: [
      {
        id: 'RS.MA',
        shortId: 'RS.MA',
        title: 'Incident Management',
        description: 'Responses to detected incidents are managed.',
        controls: [
          {
            id: 'nist-csf:RS.MA-01',
            shortId: 'RS.MA-01',
            title: 'Response plan executed',
            body: 'The incident-response plan is executed in coordination with relevant third parties once an incident is declared.',
            mappings: [{ to: 'iso-27001:A.5.24' }, { to: 'cis:17' }, { to: 'soc2:CC7.4' }],
          },
        ],
      },
      {
        id: 'RS.AN',
        shortId: 'RS.AN',
        title: 'Incident Analysis',
        description: 'Investigations are conducted to ensure effective response and support forensic / recovery.',
        controls: [
          {
            id: 'nist-csf:RS.AN-03',
            shortId: 'RS.AN-03',
            title: 'Forensics performed',
            body: 'Analysis is performed to establish what has taken place during an incident and the root cause.',
            mappings: [{ to: 'iso-27001:A.5.28' }, { to: 'cis:17' }],
          },
        ],
      },
      {
        id: 'RS.CO',
        shortId: 'RS.CO',
        title: 'Incident Response Reporting & Communication',
        description: 'Stakeholders are informed during and after an incident.',
        controls: [
          {
            id: 'nist-csf:RS.CO-02',
            shortId: 'RS.CO-02',
            title: 'Internal & external stakeholders',
            body: 'Internal and external stakeholders (including regulators, customers, and partners) are notified of incidents.',
            mappings: [{ to: 'iso-27001:A.5.5' }, { to: 'cis:17' }],
          },
        ],
      },
    ],
  },
  {
    id: 'RC',
    shortId: 'RC',
    title: 'Recover',
    description: 'Maintain plans for resilience and to restore any capabilities or services impaired by an incident.',
    categories: [
      {
        id: 'RC.RP',
        shortId: 'RC.RP',
        title: 'Recovery Plan Execution',
        description: 'Restoration activities are coordinated.',
        controls: [
          {
            id: 'nist-csf:RC.RP-01',
            shortId: 'RC.RP-01',
            title: 'Recovery plan executed',
            body: 'The recovery portion of the incident-response plan is executed once initiated from the incident-response process.',
            mappings: [{ to: 'iso-27001:A.5.29' }, { to: 'cis:11' }, { to: 'soc2:A1.3' }],
          },
        ],
      },
      {
        id: 'RC.CO',
        shortId: 'RC.CO',
        title: 'Recovery Communication',
        description: 'Restoration activities are communicated.',
        controls: [
          {
            id: 'nist-csf:RC.CO-03',
            shortId: 'RC.CO-03',
            title: 'Recovery communication',
            body: 'Recovery activities and progress in restoring operational capabilities are communicated.',
            mappings: [{ to: 'iso-27001:A.5.5' }],
          },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// ISO 27001:2022 Annex A - 4 themes, top controls
// ─────────────────────────────────────────────────────────────────────────

export interface IsoTheme {
  id: string;
  number: string;
  title: string;
  description: string;
  controlCount: number;
  controls: Control[];
}

export const ISO_27001: IsoTheme[] = [
  {
    id: 'iso27001-org',
    number: '5',
    title: 'Organizational controls',
    description:
      '37 controls covering policies, roles, supplier relationships, threat intelligence, incident management.',
    controlCount: 37,
    controls: [
      {
        id: 'iso-27001:A.5.1',
        shortId: 'A.5.1',
        title: 'Policies for information security',
        body: 'Information-security policies and topic-specific policies are defined, approved by management, published, and reviewed at planned intervals or when significant changes occur.',
        mappings: [{ to: 'nist-csf:GV.PO-01' }],
      },
      {
        id: 'iso-27001:A.5.7',
        shortId: 'A.5.7',
        title: 'Threat intelligence',
        body: 'Information relating to information-security threats is collected and analysed to produce threat intelligence.',
        mappings: [{ to: 'nist-csf:DE.AE-02' }],
      },
      {
        id: 'iso-27001:A.5.19',
        shortId: 'A.5.19',
        title: 'Information security in supplier relationships',
        body: 'Processes and procedures are defined and implemented to manage information-security risks associated with the use of supplier products or services.',
        mappings: [{ to: 'nist-csf:GV.SC-01' }, { to: 'cis:15' }],
      },
      {
        id: 'iso-27001:A.5.24',
        shortId: 'A.5.24',
        title: 'Incident management planning and preparation',
        body: 'Information-security incident management is planned and prepared by defining processes, roles, and responsibilities.',
        mappings: [{ to: 'nist-csf:RS.MA-01' }],
      },
      {
        id: 'iso-27001:A.5.25',
        shortId: 'A.5.25',
        title: 'Assessment and decision on information security events',
        body: 'Information-security events are assessed and decisions made on whether to classify them as incidents.',
        mappings: [{ to: 'nist-csf:DE.AE-02' }],
      },
    ],
  },
  {
    id: 'iso27001-people',
    number: '6',
    title: 'People controls',
    description: '8 controls covering screening, terms of employment, awareness, disciplinary process.',
    controlCount: 8,
    controls: [
      {
        id: 'iso-27001:A.6.3',
        shortId: 'A.6.3',
        title: 'Information security awareness, education and training',
        body: 'Personnel and relevant interested parties receive appropriate awareness, education and training and regular updates of organisational policies.',
        mappings: [{ to: 'nist-csf:PR.AT-01' }, { to: 'cis:14' }],
      },
    ],
  },
  {
    id: 'iso27001-physical',
    number: '7',
    title: 'Physical controls',
    description: '14 controls covering perimeter, entry, equipment, secure areas.',
    controlCount: 14,
    controls: [],
  },
  {
    id: 'iso27001-tech',
    number: '8',
    title: 'Technological controls',
    description:
      '34 controls covering authentication, cryptography, logging, vulnerability management, secure development.',
    controlCount: 34,
    controls: [
      {
        id: 'iso-27001:A.8.8',
        shortId: 'A.8.8',
        title: 'Management of technical vulnerabilities',
        body: 'Information about technical vulnerabilities of information systems in use is obtained, exposure evaluated, and appropriate measures taken.',
        mappings: [{ to: 'nist-csf:ID.RA-01' }, { to: 'cis:7' }],
      },
      {
        id: 'iso-27001:A.8.15',
        shortId: 'A.8.15',
        title: 'Logging',
        body: 'Logs that record activities, exceptions, faults, and other relevant events are produced, stored, protected, and analysed.',
        mappings: [{ to: 'nist-csf:PR.PS-04' }, { to: 'cis:8' }],
      },
      {
        id: 'iso-27001:A.8.16',
        shortId: 'A.8.16',
        title: 'Monitoring activities',
        body: 'Networks, systems, and applications are monitored for anomalous behaviour and appropriate actions are taken to evaluate potential information-security incidents.',
        mappings: [{ to: 'nist-csf:DE.CM-01' }, { to: 'cis:13' }],
      },
      {
        id: 'iso-27001:A.8.20',
        shortId: 'A.8.20',
        title: 'Network security',
        body: 'Networks and network devices are secured, managed and controlled to protect information in systems and applications.',
        mappings: [{ to: 'nist-csf:PR.DS-02' }, { to: 'cis:12' }],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// ISO/IEC 42001:2023 - AI Management System (AIMS)
// ─────────────────────────────────────────────────────────────────────────
// First international standard for AI management systems. Annex A defines
// 9 control domains (A.2-A.10). Domain A.1 is intentionally not used (it
// describes the structure of the annex itself).

export interface AiDomain {
  id: string;
  shortId: string;
  title: string;
  description: string;
  controls: Control[];
}

export const ISO_42001: AiDomain[] = [
  {
    id: 'iso-42001-A2',
    shortId: 'A.2',
    title: 'Policies related to AI',
    description: 'Define and maintain policies that govern the development, use, and oversight of AI systems.',
    controls: [
      {
        id: 'iso-42001:A.2.2',
        shortId: 'A.2.2',
        title: 'AI policy',
        body: "An AI policy is established that aligns with business objectives, applicable law, and the organisation's risk-management strategy. Reviewed at planned intervals.",
        mappings: [{ to: 'nist-csf:GV.PO-01' }, { to: 'iso-27001:A.5.1' }],
      },
      {
        id: 'iso-42001:A.2.3',
        shortId: 'A.2.3',
        title: 'Alignment with other organisational policies',
        body: 'AI policy is consistent with broader policies - security, privacy, ethics, HR, vendor management.',
        mappings: [{ to: 'nist-csf:GV.OC-03' }],
      },
    ],
  },
  {
    id: 'iso-42001-A3',
    shortId: 'A.3',
    title: 'Internal organization',
    description: 'Roles, responsibilities, and authorities for AI development and use are defined and communicated.',
    controls: [
      {
        id: 'iso-42001:A.3.2',
        shortId: 'A.3.2',
        title: 'AI roles and responsibilities',
        body: 'Roles and responsibilities for AI systems are defined and assigned, including ownership of AI risk.',
        mappings: [{ to: 'nist-csf:GV.RR-01' }, { to: 'nist-csf:GV.RR-04' }],
      },
      {
        id: 'iso-42001:A.3.3',
        shortId: 'A.3.3',
        title: 'AI reporting and accountability',
        body: 'Reporting lines and accountability mechanisms for AI-system performance and incidents are established.',
        mappings: [{ to: 'soc2:CC1.1' }],
      },
    ],
  },
  {
    id: 'iso-42001-A4',
    shortId: 'A.4',
    title: 'Resources for AI systems',
    description: 'People, infrastructure, data and tooling required to operate AI systems safely.',
    controls: [
      {
        id: 'iso-42001:A.4.2',
        shortId: 'A.4.2',
        title: 'Resource documentation',
        body: 'Resources used by AI systems (compute, data, models, tooling) are documented and managed.',
        mappings: [{ to: 'nist-csf:ID.AM-02' }],
      },
      {
        id: 'iso-42001:A.4.3',
        shortId: 'A.4.3',
        title: 'Tooling for AI lifecycle',
        body: 'Tools used across the AI lifecycle (training, evaluation, deployment, monitoring) are selected and maintained appropriate to risk.',
      },
      {
        id: 'iso-42001:A.4.4',
        shortId: 'A.4.4',
        title: 'AI competence',
        body: 'Personnel involved with AI systems possess and maintain appropriate competence (training, certifications, hands-on experience).',
        mappings: [{ to: 'iso-27001:A.6.3' }, { to: 'nist-csf:PR.AT-01' }],
      },
      {
        id: 'iso-42001:A.4.5',
        shortId: 'A.4.5',
        title: 'Data resources',
        body: 'Data resources used by AI systems are appropriate, governed, and traceable.',
        mappings: [{ to: 'iso-27001:A.5.12' }],
      },
    ],
  },
  {
    id: 'iso-42001-A5',
    shortId: 'A.5',
    title: 'Assessing impacts of AI systems',
    description:
      'Identify and assess potential impacts (intended and unintended) of AI systems on individuals, groups, and society.',
    controls: [
      {
        id: 'iso-42001:A.5.2',
        shortId: 'A.5.2',
        title: 'AI system impact assessment process',
        body: 'A documented process exists to assess the potential impacts of AI systems, including risks to individuals and groups.',
      },
      {
        id: 'iso-42001:A.5.3',
        shortId: 'A.5.3',
        title: 'Documentation of impact assessments',
        body: 'Impact assessments are documented, reviewed, and updated when AI systems materially change.',
        mappings: [{ to: 'nist-csf:ID.RA-05' }],
      },
      {
        id: 'iso-42001:A.5.4',
        shortId: 'A.5.4',
        title: 'Assessing AI system impact on individuals',
        body: 'The impact on individuals (privacy, autonomy, fundamental rights) is assessed and addressed.',
      },
      {
        id: 'iso-42001:A.5.5',
        shortId: 'A.5.5',
        title: 'Assessing societal impacts',
        body: 'Broader societal impacts (groups, communities, the environment) are assessed where relevant.',
      },
    ],
  },
  {
    id: 'iso-42001-A6',
    shortId: 'A.6',
    title: 'AI system life cycle',
    description:
      'Manage AI systems through their lifecycle: requirements, design, development, verification, deployment, operation, monitoring, retirement.',
    controls: [
      {
        id: 'iso-42001:A.6.1.2',
        shortId: 'A.6.1.2',
        title: 'AI lifecycle objectives',
        body: 'Objectives for managing the AI lifecycle are defined, including security, safety, fairness, transparency, accountability.',
      },
      {
        id: 'iso-42001:A.6.2.2',
        shortId: 'A.6.2.2',
        title: 'AI system requirements and specification',
        body: 'Requirements (functional, security, safety, ethical) are defined and traceable to design and verification.',
      },
      {
        id: 'iso-42001:A.6.2.3',
        shortId: 'A.6.2.3',
        title: 'AI system design and development',
        body: 'AI systems are designed and developed against the documented requirements with risks addressed at each stage.',
      },
      {
        id: 'iso-42001:A.6.2.4',
        shortId: 'A.6.2.4',
        title: 'Verification and validation of AI systems',
        body: 'AI systems are verified (does it meet requirements?) and validated (does it meet stakeholder needs?) before deployment.',
      },
      {
        id: 'iso-42001:A.6.2.5',
        shortId: 'A.6.2.5',
        title: 'AI system deployment',
        body: 'Deployment is planned and controlled - staging, rollback, gradual rollout, user training.',
        mappings: [{ to: 'nist-csf:PR.PS-02' }],
      },
      {
        id: 'iso-42001:A.6.2.6',
        shortId: 'A.6.2.6',
        title: 'AI system operation and monitoring',
        body: 'Operation and monitoring covers performance, drift, fairness, security incidents, model degradation.',
        mappings: [{ to: 'nist-csf:DE.CM-09' }, { to: 'soc2:CC7.2' }],
      },
      {
        id: 'iso-42001:A.6.2.7',
        shortId: 'A.6.2.7',
        title: 'AI system technical documentation',
        body: 'Technical documentation (model cards, datasets, evaluation results, known limitations) is produced and maintained.',
      },
      {
        id: 'iso-42001:A.6.2.8',
        shortId: 'A.6.2.8',
        title: 'AI system event logging',
        body: 'Events relevant to AI-system operation are logged for accountability, audit, and incident investigation.',
        mappings: [{ to: 'iso-27001:A.8.15' }, { to: 'nist-csf:PR.PS-04' }],
      },
    ],
  },
  {
    id: 'iso-42001-A7',
    shortId: 'A.7',
    title: 'Data for AI systems',
    description: 'Manage the data used to train, evaluate, and operate AI systems - quality, provenance, governance.',
    controls: [
      {
        id: 'iso-42001:A.7.2',
        shortId: 'A.7.2',
        title: 'Data for development and enhancement',
        body: 'Data used for development and enhancement is identified, sourced lawfully, and quality-managed.',
      },
      {
        id: 'iso-42001:A.7.3',
        shortId: 'A.7.3',
        title: 'Acquisition of data',
        body: 'Acquisition of data follows defined processes (contracts, consent, licensing).',
      },
      {
        id: 'iso-42001:A.7.4',
        shortId: 'A.7.4',
        title: 'Quality of data for AI systems',
        body: "Data quality is assessed against criteria appropriate to the AI system's purpose (representativeness, accuracy, relevance, freshness).",
      },
      {
        id: 'iso-42001:A.7.5',
        shortId: 'A.7.5',
        title: 'Data provenance',
        body: 'Provenance of data (origin, transformations, ownership) is recorded and traceable.',
      },
      {
        id: 'iso-42001:A.7.6',
        shortId: 'A.7.6',
        title: 'Data preparation',
        body: 'Data preparation activities (cleaning, labelling, augmentation) are documented and repeatable.',
      },
    ],
  },
  {
    id: 'iso-42001-A8',
    shortId: 'A.8',
    title: 'Information for interested parties of AI systems',
    description: 'Information provided to users, deployers, regulators, and other affected parties about an AI system.',
    controls: [
      {
        id: 'iso-42001:A.8.2',
        shortId: 'A.8.2',
        title: 'System documentation and information for users',
        body: 'Users receive information sufficient to use the AI system appropriately - capabilities, limitations, intended use.',
      },
      {
        id: 'iso-42001:A.8.3',
        shortId: 'A.8.3',
        title: 'External reporting',
        body: 'External reporting (incidents, performance, regulatory disclosure) is performed as required.',
        mappings: [{ to: 'nist-csf:RS.CO-02' }],
      },
      {
        id: 'iso-42001:A.8.4',
        shortId: 'A.8.4',
        title: 'Communication of incidents',
        body: 'AI-related incidents are communicated to affected parties and to relevant authorities where required.',
        mappings: [{ to: 'nist-csf:RS.MA-01' }],
      },
      {
        id: 'iso-42001:A.8.5',
        shortId: 'A.8.5',
        title: 'Information for interested parties',
        body: 'Information requirements of interested parties (regulators, customers, partners) are identified and addressed.',
      },
    ],
  },
  {
    id: 'iso-42001-A9',
    shortId: 'A.9',
    title: 'Use of AI systems',
    description: 'Govern the actual use of AI systems - intended-use boundaries, monitoring of misuse.',
    controls: [
      {
        id: 'iso-42001:A.9.2',
        shortId: 'A.9.2',
        title: 'Processes for responsible use',
        body: 'Processes for the responsible use of AI systems are established (acceptable-use, override, human review).',
      },
      {
        id: 'iso-42001:A.9.3',
        shortId: 'A.9.3',
        title: 'Objectives for responsible use',
        body: 'Objectives for the responsible use of AI systems are documented and communicated to users.',
      },
      {
        id: 'iso-42001:A.9.4',
        shortId: 'A.9.4',
        title: 'Intended use of the AI system',
        body: 'The intended use of each AI system is defined and the boundaries of acceptable use are made explicit.',
      },
    ],
  },
  {
    id: 'iso-42001-A10',
    shortId: 'A.10',
    title: 'Third-party and customer relationships',
    description: 'Manage AI-system risks introduced by third-party providers, suppliers, and customers.',
    controls: [
      {
        id: 'iso-42001:A.10.2',
        shortId: 'A.10.2',
        title: 'Allocation of responsibilities',
        body: 'Responsibilities along the AI supply chain (provider, integrator, deployer, user) are defined and contractually allocated.',
        mappings: [{ to: 'nist-csf:GV.SC-01' }, { to: 'iso-27001:A.5.19' }],
      },
      {
        id: 'iso-42001:A.10.3',
        shortId: 'A.10.3',
        title: 'Suppliers',
        body: 'AI suppliers (model vendors, MCP servers, third-party APIs) are evaluated against AI-specific risks before engagement.',
        mappings: [{ to: 'cis:15' }],
      },
      {
        id: 'iso-42001:A.10.4',
        shortId: 'A.10.4',
        title: 'Customers',
        body: 'Information and obligations passed on to customers using the AI system are defined (e.g. acceptable-use, data-handling).',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// CIS Controls v8 - 18 top-level controls
// ─────────────────────────────────────────────────────────────────────────

export interface CisControl {
  id: string;
  number: number;
  title: string;
  description: string;
  /** IG1 / IG2 / IG3 - Implementation Group thresholds. */
  igLevel: 1 | 2 | 3;
}

export const CIS_CONTROLS: CisControl[] = [
  {
    id: 'cis:1',
    number: 1,
    title: 'Inventory and Control of Enterprise Assets',
    description: 'Maintain accurate, detailed, and up-to-date inventory of all enterprise assets.',
    igLevel: 1,
  },
  {
    id: 'cis:2',
    number: 2,
    title: 'Inventory and Control of Software Assets',
    description:
      'Manage software (operating systems and applications) on the network so only authorised software is installed and can execute.',
    igLevel: 1,
  },
  {
    id: 'cis:3',
    number: 3,
    title: 'Data Protection',
    description:
      'Develop processes and technical controls to identify, classify, securely handle, retain, and dispose of data.',
    igLevel: 1,
  },
  {
    id: 'cis:4',
    number: 4,
    title: 'Secure Configuration of Enterprise Assets and Software',
    description:
      'Establish and maintain secure configurations of assets and software (end-user devices, servers, network devices, etc.).',
    igLevel: 1,
  },
  {
    id: 'cis:5',
    number: 5,
    title: 'Account Management',
    description:
      'Use processes and tools to assign and manage authorisation to credentials for user, admin, and service accounts.',
    igLevel: 1,
  },
  {
    id: 'cis:6',
    number: 6,
    title: 'Access Control Management',
    description: 'Use processes and tools to create, assign, manage, and revoke access credentials and privileges.',
    igLevel: 1,
  },
  {
    id: 'cis:7',
    number: 7,
    title: 'Continuous Vulnerability Management',
    description:
      'Develop a plan to continuously assess and track vulnerabilities to remediate and minimise the window of opportunity.',
    igLevel: 1,
  },
  {
    id: 'cis:8',
    number: 8,
    title: 'Audit Log Management',
    description:
      'Collect, alert, review, and retain audit logs to help detect, understand, and recover from an attack.',
    igLevel: 1,
  },
  {
    id: 'cis:9',
    number: 9,
    title: 'Email and Web Browser Protections',
    description:
      'Reduce attack surface and opportunities for attackers to manipulate human behaviour through email and web access.',
    igLevel: 1,
  },
  {
    id: 'cis:10',
    number: 10,
    title: 'Malware Defenses',
    description:
      'Prevent or control the installation, spread, and execution of malicious applications, code, or scripts on enterprise assets.',
    igLevel: 1,
  },
  {
    id: 'cis:11',
    number: 11,
    title: 'Data Recovery',
    description:
      'Establish and maintain data-recovery practices sufficient to restore in-scope assets to a pre-incident state.',
    igLevel: 1,
  },
  {
    id: 'cis:12',
    number: 12,
    title: 'Network Infrastructure Management',
    description:
      'Establish, implement, and actively manage network devices to prevent attackers from exploiting vulnerable network services.',
    igLevel: 2,
  },
  {
    id: 'cis:13',
    number: 13,
    title: 'Network Monitoring and Defense',
    description:
      'Operate processes and tooling to establish and maintain comprehensive network monitoring and defense.',
    igLevel: 2,
  },
  {
    id: 'cis:14',
    number: 14,
    title: 'Security Awareness and Skills Training',
    description:
      'Establish a security-awareness program to influence behaviour among the workforce and skills training for technical roles.',
    igLevel: 1,
  },
  {
    id: 'cis:15',
    number: 15,
    title: 'Service Provider Management',
    description:
      'Develop a process to evaluate service providers who hold sensitive data or are responsible for critical platforms.',
    igLevel: 1,
  },
  {
    id: 'cis:16',
    number: 16,
    title: 'Application Software Security',
    description:
      'Manage the security life cycle of in-house developed, hosted, or acquired software to prevent, detect, and remediate security weaknesses.',
    igLevel: 2,
  },
  {
    id: 'cis:17',
    number: 17,
    title: 'Incident Response Management',
    description:
      'Establish a programme to develop and maintain incident-response capability (policies, plans, procedures, training).',
    igLevel: 1,
  },
  {
    id: 'cis:18',
    number: 18,
    title: 'Penetration Testing',
    description:
      'Test effectiveness and resiliency of enterprise assets through identifying and exploiting weaknesses in the controls.',
    igLevel: 2,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// SOC 2 Trust Services Criteria
// ─────────────────────────────────────────────────────────────────────────

export interface Soc2Criterion {
  id: string;
  category: 'Common Criteria' | 'Availability' | 'Confidentiality' | 'Processing Integrity' | 'Privacy';
  shortId: string;
  title: string;
  description: string;
}

export const SOC2_TSC: Soc2Criterion[] = [
  // Common Criteria (security)
  {
    id: 'soc2:CC1.1',
    category: 'Common Criteria',
    shortId: 'CC1.1',
    title: 'Integrity and ethical values',
    description: 'The entity demonstrates a commitment to integrity and ethical values.',
  },
  {
    id: 'soc2:CC1.4',
    category: 'Common Criteria',
    shortId: 'CC1.4',
    title: 'Competence - security training',
    description: 'The entity demonstrates a commitment to attract, develop, and retain competent individuals.',
  },
  {
    id: 'soc2:CC2.3',
    category: 'Common Criteria',
    shortId: 'CC2.3',
    title: 'Communication of regulatory requirements',
    description: 'The entity communicates with external parties regarding matters affecting internal control.',
  },
  {
    id: 'soc2:CC3.1',
    category: 'Common Criteria',
    shortId: 'CC3.1',
    title: 'Risk identification',
    description:
      'The entity specifies objectives with sufficient clarity to enable risk identification and assessment.',
  },
  {
    id: 'soc2:CC3.2',
    category: 'Common Criteria',
    shortId: 'CC3.2',
    title: 'Risk analysis',
    description: 'The entity identifies and analyses risk to the achievement of objectives.',
  },
  {
    id: 'soc2:CC6.1',
    category: 'Common Criteria',
    shortId: 'CC6.1',
    title: 'Logical access controls',
    description:
      'The entity implements logical access security software, infrastructure, and architectures over protected information assets.',
  },
  {
    id: 'soc2:CC6.3',
    category: 'Common Criteria',
    shortId: 'CC6.3',
    title: 'Authorisation',
    description:
      'The entity authorises, modifies, or removes access to information assets based on roles, responsibilities, or system design.',
  },
  {
    id: 'soc2:CC6.7',
    category: 'Common Criteria',
    shortId: 'CC6.7',
    title: 'Encryption / data protection',
    description:
      'The entity restricts the transmission, movement, and removal of information to authorised internal and external users.',
  },
  {
    id: 'soc2:CC7.1',
    category: 'Common Criteria',
    shortId: 'CC7.1',
    title: 'Vulnerability management',
    description: 'The entity uses detection and monitoring procedures to identify changes to configurations.',
  },
  {
    id: 'soc2:CC7.2',
    category: 'Common Criteria',
    shortId: 'CC7.2',
    title: 'Continuous monitoring',
    description:
      'The entity monitors system components and the operation of those components for anomalies indicative of malicious acts.',
  },
  {
    id: 'soc2:CC7.3',
    category: 'Common Criteria',
    shortId: 'CC7.3',
    title: 'Incident evaluation',
    description:
      'The entity evaluates security events to determine whether they could or have resulted in a failure to meet objectives.',
  },
  {
    id: 'soc2:CC7.4',
    category: 'Common Criteria',
    shortId: 'CC7.4',
    title: 'Incident response',
    description: 'The entity responds to identified security incidents.',
  },
  // Availability
  {
    id: 'soc2:A1.3',
    category: 'Availability',
    shortId: 'A1.3',
    title: 'Recovery procedures tested',
    description: 'The entity tests recovery-plan procedures to support achievement of availability objectives.',
  },
  // Confidentiality
  {
    id: 'soc2:C1.1',
    category: 'Confidentiality',
    shortId: 'C1.1',
    title: 'Confidentiality data identified',
    description: 'The entity identifies and maintains confidential information to meet objectives.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// SOC-CMM - 5 domains × 5 maturity levels
// ─────────────────────────────────────────────────────────────────────────

export type MaturityLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface SocCmmDomain {
  id: string;
  title: string;
  description: string;
  /** What it looks like at each maturity level. */
  levels: Record<MaturityLevel, string>;
}

export const SOC_CMM: SocCmmDomain[] = [
  {
    id: 'business',
    title: 'Business',
    description: 'Mission, vision, governance, and stakeholder management of the SOC.',
    levels: {
      0: 'No defined SOC mission. Activity is reactive and ad-hoc.',
      1: 'SOC exists but mission is informal. Stakeholder communication is reactive.',
      2: 'SOC mission documented. Annual stakeholder reviews. Basic KPIs.',
      3: 'SOC mission integrated with business goals. Quarterly reviews. Risk-aligned KPIs.',
      4: 'SOC measurably contributes to business outcomes. Stakeholder satisfaction tracked.',
      5: 'SOC drives business decisions. Continuously improves alignment with strategy.',
    },
  },
  {
    id: 'people',
    title: 'People',
    description: 'Staffing, skills, training, and career paths for SOC personnel.',
    levels: {
      0: 'Ad-hoc staffing. No defined roles. No training programme.',
      1: 'Defined roles but skills gaps unmeasured. Training is reactive.',
      2: 'Skills matrix maintained. Annual training plans per role. Some certifications.',
      3: 'Career paths defined. Hands-on lab time scheduled. Recognised certifications across the team.',
      4: 'Senior staff teach internally. Cross-training rotation. Industry contributions (talks, blogs).',
      5: 'SOC produces industry talent and tooling. Sustained low attrition with deep bench.',
    },
  },
  {
    id: 'process',
    title: 'Process',
    description: 'Defined and measured SOC processes - alert handling, IR, hunting, intel, vulnerability management.',
    levels: {
      0: 'Processes are ad-hoc. Tribal knowledge dominates.',
      1: 'Some processes documented. Inconsistent execution.',
      2: 'Core processes documented and trained. Basic metrics (TTD, TTR).',
      3: 'Processes measured and reviewed quarterly. Playbooks for common scenarios.',
      4: 'Processes optimised against metrics. Threat-informed tuning. Tabletop exercises run.',
      5: 'Processes continuously refined; improvements measured and re-baselined.',
    },
  },
  {
    id: 'technology',
    title: 'Technology',
    description: 'SIEM, EDR, SOAR, threat-intel platforms, network monitoring, integrations.',
    levels: {
      0: 'Disparate tools, manual correlation. Limited visibility.',
      1: 'SIEM in place but coverage is patchy. Basic EDR. No SOAR.',
      2: 'SIEM with curated detections. EDR everywhere. Basic SOAR for triage.',
      3: 'Cross-tool integrations. Detection-as-code. SOAR for IR steps.',
      4: 'Engineered detection pipeline. CI/CD for content. Hunt platform.',
      5: 'Custom tooling, OSS contributions, internal AI/ML augmentation. Tech is a competitive advantage.',
    },
  },
  {
    id: 'services',
    title: 'Services',
    description:
      'Services the SOC offers - monitoring, IR, threat hunting, vulnerability management, threat intel, training.',
    levels: {
      0: 'Monitoring only, with limited follow-through.',
      1: 'Monitoring + reactive IR. No proactive services.',
      2: 'Monitoring + IR + ad-hoc hunting. Basic threat-intel consumption.',
      3: 'Hunting on a cadence. Threat-intel programme. VM and patch oversight.',
      4: 'Purple-team exercises. Embedded security partners with engineering. Awareness programme.',
      5: 'Adversary emulation, deception, security-engineering services to the broader org.',
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'dfir.grc.assessment.v1';

export interface GrcAssessment {
  /** Per-control coverage, keyed by full id (frameworkId:shortId). */
  controls: Record<string, CoverageStatus>;
  /** SOC-CMM target level per domain. */
  socCmm: Record<string, MaturityLevel>;
}

export function emptyAssessment(): GrcAssessment {
  return { controls: {}, socCmm: {} };
}

export function loadAssessment(): GrcAssessment {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAssessment();
    const parsed = JSON.parse(raw) as Partial<GrcAssessment>;
    return { controls: parsed.controls ?? {}, socCmm: parsed.socCmm ?? {} };
  } catch {
    return emptyAssessment();
  }
}

export const STATUS_CYCLE: Record<CoverageStatus, CoverageStatus> = {
  unset: 'covered',
  covered: 'partial',
  partial: 'gap',
  gap: 'na',
  na: 'unset',
};

/** Compute coverage % for a list of control ids. covered = 100%, partial = 50%, gap/unset/na = 0%. */
export function coverage(ids: string[], a: GrcAssessment): { score: number; covered: number; total: number } {
  if (ids.length === 0) return { score: 0, covered: 0, total: 0 };
  let weight = 0;
  for (const id of ids) {
    const s = a.controls[id] ?? 'unset';
    if (s === 'covered') weight += 1;
    else if (s === 'partial') weight += 0.5;
  }
  const score = Math.round((weight / ids.length) * 100);
  return { score, covered: Math.round(weight), total: ids.length };
}

/** Flatten all NIST CSF control ids. */
export function nistCsfControlIds(): string[] {
  const out: string[] = [];
  for (const f of NIST_CSF) for (const c of f.categories) for (const ctl of c.controls) out.push(ctl.id);
  return out;
}

export function isoControlIds(): string[] {
  return ISO_27001.flatMap((t) => t.controls.map((c) => c.id));
}

export function iso42001ControlIds(): string[] {
  return ISO_42001.flatMap((d) => d.controls.map((c) => c.id));
}

export function cisControlIds(): string[] {
  return CIS_CONTROLS.map((c) => c.id);
}

export function soc2ControlIds(): string[] {
  return SOC2_TSC.map((c) => c.id);
}

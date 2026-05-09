/**
 * Privacy & Data-Protection regulation hub.
 *
 * Five regimes side by side: GDPR, CCPA/CPRA, DPDP (India), HIPAA Privacy
 * Rule, PCI DSS data-protection rules. Each regime is decomposed into:
 *   - territorial / sector scope
 *   - data subjects / individual rights
 *   - controller / processor (or equivalent) obligations
 *   - breach / incident notification timelines
 *   - enforcement & penalties
 *   - cross-mappings to NIST CSF / ISO 27001 / GRC controls.
 *
 * This is not legal advice. Every regime evolves; check the linked source
 * document for the current text.
 */

export type RegimeId = 'gdpr' | 'ccpa' | 'dpdp' | 'hipaa-privacy' | 'pci-dss';

export interface Regime {
  id: RegimeId;
  short: string;
  longTitle: string;
  jurisdiction: string;
  effectiveDate: string;
  scope: string;
  /** Free-form summary of who must comply. */
  appliesTo: string;
  rights: Article[];
  obligations: Article[];
  breachNotification: BreachNotification;
  enforcement: string;
  links: Array<{ label: string; href: string }>;
  /** Cross-references to NIST CSF / ISO 27001 / GRC ids where useful. */
  crossRef: string[];
}

export interface Article {
  id: string;
  title: string;
  body: string;
  /** Optional citation (article / section / paragraph). */
  citation?: string;
}

export interface BreachNotification {
  /** Short label — e.g. "72 h to authority". */
  summary: string;
  /** Body text expanded. */
  detail: string;
  /** Trigger that starts the clock. */
  trigger: string;
  /** Whether individuals (data subjects) also need notification, and on what trigger. */
  toIndividuals?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// GDPR
// ─────────────────────────────────────────────────────────────────────────
const GDPR: Regime = {
  id: 'gdpr',
  short: 'GDPR',
  longTitle: 'EU General Data Protection Regulation 2016/679',
  jurisdiction: 'European Union (and EEA)',
  effectiveDate: '2018-05-25',
  scope:
    'Any processing of personal data of individuals in the EU/EEA, regardless of where the controller / processor is established. Extra-territorial via Article 3.',
  appliesTo:
    'Controllers and processors handling personal data of EU/EEA data subjects, including non-EU companies offering goods/services or monitoring behaviour in the EU.',
  rights: [
    {
      id: 'gdpr-art15',
      title: 'Right of access',
      body: 'Right to a copy of personal data and information on processing — purposes, categories, recipients, retention, sources.',
      citation: 'Art. 15',
    },
    {
      id: 'gdpr-art16',
      title: 'Right to rectification',
      body: 'Right to correct inaccurate or complete incomplete personal data.',
      citation: 'Art. 16',
    },
    {
      id: 'gdpr-art17',
      title: 'Right to erasure ("right to be forgotten")',
      body: 'Right to deletion when data is no longer needed, consent withdrawn, processing unlawful, or other Art. 17(1) grounds.',
      citation: 'Art. 17',
    },
    {
      id: 'gdpr-art18',
      title: 'Right to restriction of processing',
      body: 'Right to restrict processing while accuracy is contested, processing is unlawful but data is needed, or pending objection.',
      citation: 'Art. 18',
    },
    {
      id: 'gdpr-art20',
      title: 'Right to data portability',
      body: 'Right to receive a structured, commonly-used, machine-readable copy of data and to transmit it to another controller.',
      citation: 'Art. 20',
    },
    {
      id: 'gdpr-art21',
      title: 'Right to object',
      body: 'Right to object to processing based on legitimate interests, direct marketing (always wins), profiling, or research.',
      citation: 'Art. 21',
    },
    {
      id: 'gdpr-art22',
      title: 'Rights re: automated decisions / profiling',
      body: 'Right not to be subject to a decision based solely on automated processing (incl. profiling) producing legal or similarly significant effects.',
      citation: 'Art. 22',
    },
  ],
  obligations: [
    {
      id: 'gdpr-art5',
      title: 'Principles of processing (Art. 5)',
      body: 'Lawfulness, fairness, transparency · purpose limitation · data minimisation · accuracy · storage limitation · integrity & confidentiality · accountability.',
      citation: 'Art. 5',
    },
    {
      id: 'gdpr-art6',
      title: 'Lawful basis for processing',
      body: 'One of: consent, contract, legal obligation, vital interests, public task, legitimate interests. Document the basis up front.',
      citation: 'Art. 6',
    },
    {
      id: 'gdpr-art25',
      title: 'Privacy by design & default',
      body: 'Implement appropriate technical & organisational measures to embed privacy from system design through to operation.',
      citation: 'Art. 25',
    },
    {
      id: 'gdpr-art28',
      title: 'Processor obligations & DPA contracts',
      body: 'Controllers must use only processors providing sufficient guarantees; mandatory DPA contract with prescribed clauses.',
      citation: 'Art. 28',
    },
    {
      id: 'gdpr-art30',
      title: 'Records of processing activities (RoPA)',
      body: 'Maintain a written record of categories of processing, purposes, data flows, retention. Required at scale (>250 employees or risky processing).',
      citation: 'Art. 30',
    },
    {
      id: 'gdpr-art32',
      title: 'Security of processing',
      body: 'Appropriate technical and organisational measures including pseudonymisation, encryption, integrity, availability, regular testing.',
      citation: 'Art. 32',
    },
    {
      id: 'gdpr-art35',
      title: 'Data Protection Impact Assessment (DPIA)',
      body: 'Required before high-risk processing — large-scale automated decisions, sensitive data at scale, systematic monitoring of public areas.',
      citation: 'Art. 35',
    },
    {
      id: 'gdpr-art37',
      title: 'Data Protection Officer (DPO)',
      body: 'Mandatory DPO when core activities involve large-scale regular monitoring or special-category data.',
      citation: 'Art. 37',
    },
    {
      id: 'gdpr-art44',
      title: 'International transfers',
      body: 'Transfers outside EEA require adequacy decision, Standard Contractual Clauses + transfer impact assessment, BCRs, or other Art. 46 safeguards.',
      citation: 'Art. 44-49',
    },
  ],
  breachNotification: {
    summary: '72 hours to supervisory authority',
    detail:
      'Notify the competent supervisory authority "without undue delay and, where feasible, not later than 72 hours after having become aware" of the breach (Art. 33). Notification can be in stages if all facts aren\'t yet known.',
    trigger: 'Awareness of a breach by the controller (regardless of severity assessment).',
    toIndividuals:
      'Notify affected individuals "without undue delay" if the breach is likely to result in a high risk to their rights and freedoms (Art. 34).',
  },
  enforcement:
    'Up to €20M or 4% of annual global turnover — whichever is higher (Art. 83). Supervisory authorities (lead authority via one-stop-shop) issue fines, corrective orders, processing bans.',
  links: [
    { label: 'Regulation text (EUR-Lex)', href: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj' },
    {
      label: 'EDPB guidelines',
      href: 'https://edpb.europa.eu/our-work-tools/general-guidance/guidelines-recommendations-best-practices_en',
    },
  ],
  crossRef: ['nist-csf:GV.OC-03', 'nist-csf:PR.DS-01', 'iso-27001:A.5.31', 'iso-27001:A.8.10'],
};

// ─────────────────────────────────────────────────────────────────────────
// CCPA / CPRA
// ─────────────────────────────────────────────────────────────────────────
const CCPA: Regime = {
  id: 'ccpa',
  short: 'CCPA / CPRA',
  longTitle: 'California Consumer Privacy Act (as amended by the CPRA)',
  jurisdiction: 'California, USA',
  effectiveDate: '2020-01-01 (CCPA) · 2023-01-01 (CPRA amendments)',
  scope:
    'Applies to for-profit businesses processing personal info of California residents that meet a threshold ($25M revenue · 100k consumers/devices · or 50% revenue from selling/sharing PI).',
  appliesTo:
    'Businesses that collect personal information from California residents and meet at least one revenue / volume / sale-share threshold. Service providers and contractors have derivative obligations.',
  rights: [
    {
      id: 'ccpa-right-know',
      title: 'Right to know',
      body: 'Right to know what categories and specific pieces of personal information are collected, sold, or shared.',
    },
    {
      id: 'ccpa-right-delete',
      title: 'Right to delete',
      body: 'Right to deletion of personal information collected from the consumer (with exceptions for fraud detection, security, legal obligations).',
    },
    {
      id: 'ccpa-right-correct',
      title: 'Right to correct',
      body: 'CPRA addition — right to correct inaccurate personal information.',
    },
    {
      id: 'ccpa-right-opt-out',
      title: 'Right to opt out of sale / sharing',
      body: 'Right to opt out of the sale of personal information; CPRA extends to "sharing" (cross-context behavioural advertising).',
    },
    {
      id: 'ccpa-right-limit-spi',
      title: 'Right to limit use of sensitive PI',
      body: 'CPRA addition — right to limit use and disclosure of sensitive personal information to what is necessary to provide the service.',
    },
    {
      id: 'ccpa-right-non-discrim',
      title: 'Right to non-discrimination',
      body: 'A business cannot deny goods/services, charge different prices, or provide a different quality because the consumer exercised a CCPA right.',
    },
    {
      id: 'ccpa-right-portability',
      title: 'Right to data portability',
      body: 'When responding to a request to know, provide data in a portable, readily-usable format.',
    },
  ],
  obligations: [
    {
      id: 'ccpa-notice',
      title: 'Notice at collection',
      body: 'Inform consumers at or before collection of categories of PI collected and the purposes.',
    },
    {
      id: 'ccpa-privacy-policy',
      title: 'Privacy policy',
      body: 'Maintain an updated privacy policy describing collection, use, sale/sharing, retention, and consumer rights.',
    },
    {
      id: 'ccpa-do-not-sell-link',
      title: '"Do Not Sell or Share My Personal Information"',
      body: 'Conspicuous link on the homepage allowing consumers to opt out. Honour Global Privacy Control (GPC) signals.',
    },
    {
      id: 'ccpa-vendors',
      title: 'Service-provider / contractor agreements',
      body: 'Written contract requiring vendors to use PI only for limited, specified purposes with prescribed flow-down terms.',
    },
    {
      id: 'ccpa-spi',
      title: 'Sensitive PI handling',
      body: 'Sensitive PI (SSN, geolocation, ethnicity, biometrics, health, sexual orientation, etc.) requires limited-use treatment and a separate opt-out / limitation right.',
    },
    {
      id: 'ccpa-risk-assessments',
      title: 'Risk assessments (CPPA regulations)',
      body: 'Annual risk assessment for processing that "presents significant risk" — cross-contextual behavioural advertising, sensitive PI use, profiling, automated decision-making.',
    },
  ],
  breachNotification: {
    summary: 'No fixed-hour clock — "in the most expedient time possible and without unreasonable delay"',
    detail:
      'California Civil Code § 1798.82 requires notification "in the most expedient time possible and without unreasonable delay" once the breach is discovered or notified. AG must also be notified if > 500 California residents are affected.',
    trigger: 'Discovery / notification of a breach involving unencrypted personal information.',
    toIndividuals:
      'Direct notice to affected California residents (substitute notice if cost > $250k or > 500k people).',
  },
  enforcement:
    "California Privacy Protection Agency (CPPA) and California AG. Civil penalties up to $7,500 per intentional violation / violation involving minors' PI, $2,500 otherwise. CPRA removed the original 30-day cure period for most violations.",
  links: [
    { label: 'CCPA + CPRA text (CPPA)', href: 'https://cppa.ca.gov/regulations/' },
    { label: 'AG CCPA enforcement', href: 'https://oag.ca.gov/privacy/ccpa' },
  ],
  crossRef: ['nist-csf:GV.OC-03', 'nist-csf:PR.DS-01'],
};

// ─────────────────────────────────────────────────────────────────────────
// DPDP (India)
// ─────────────────────────────────────────────────────────────────────────
const DPDP: Regime = {
  id: 'dpdp',
  short: 'DPDP Act',
  longTitle: 'Digital Personal Data Protection Act, 2023 (India)',
  jurisdiction: 'India',
  effectiveDate: 'Enacted 2023; rules + phased commencement under MeitY 2025',
  scope:
    'Processing of digital personal data within India, and processing outside India that is in connection with offering goods/services to data principals in India.',
  appliesTo:
    'Data Fiduciaries (analogue of controllers) and Data Processors handling digital personal data of Data Principals (data subjects) in India. Significant Data Fiduciaries face additional obligations.',
  rights: [
    {
      id: 'dpdp-s11',
      title: 'Right to access',
      body: 'Right to obtain a summary of personal data processed, processing activities, and identities of fiduciaries with whom data has been shared.',
      citation: 'S. 11',
    },
    {
      id: 'dpdp-s12',
      title: 'Right to correction & erasure',
      body: 'Right to correction, completion, updating, and erasure of personal data no longer necessary or if consent withdrawn.',
      citation: 'S. 12',
    },
    {
      id: 'dpdp-s13',
      title: 'Right of grievance redressal',
      body: 'Right to readily-available grievance redressal mechanism via the Data Fiduciary, escalating to the Data Protection Board.',
      citation: 'S. 13',
    },
    {
      id: 'dpdp-s14',
      title: 'Right to nominate',
      body: 'Right to nominate another individual to exercise rights in the event of death or incapacity.',
      citation: 'S. 14',
    },
  ],
  obligations: [
    {
      id: 'dpdp-s5',
      title: 'Notice',
      body: 'Itemised notice in clear and plain language at or before consent — purposes, manner of exercising rights, complaint mechanism.',
      citation: 'S. 5',
    },
    {
      id: 'dpdp-s6',
      title: 'Consent',
      body: 'Free, specific, informed, unconditional, unambiguous consent with clear affirmative action. Consent can be withdrawn as easily as it was given.',
      citation: 'S. 6',
    },
    {
      id: 'dpdp-s8',
      title: 'General obligations of Data Fiduciary',
      body: 'Accuracy, completeness, security safeguards, retention only as long as necessary, deletion on consent withdrawal / purpose fulfilment.',
      citation: 'S. 8',
    },
    {
      id: 'dpdp-s9',
      title: "Children's data",
      body: 'Verifiable parental consent before processing personal data of children (< 18); ban on tracking, behavioural monitoring, targeted advertising.',
      citation: 'S. 9',
    },
    {
      id: 'dpdp-s10',
      title: 'Significant Data Fiduciary (SDF)',
      body: 'Designated SDFs must appoint a Data Protection Officer (DPO based in India), undertake DPIA, and conduct independent data audits.',
      citation: 'S. 10',
    },
    {
      id: 'dpdp-s16',
      title: 'Cross-border transfer',
      body: 'Permitted to all jurisdictions except those expressly restricted by the Central Government. Sector-specific stricter laws prevail.',
      citation: 'S. 16',
    },
  ],
  breachNotification: {
    summary: 'Notify Board and affected Data Principals (timeline per rules)',
    detail:
      'Section 8(6) requires Data Fiduciaries to intimate the Data Protection Board of India and each affected Data Principal of any personal data breach. The exact timeline and form will be specified in subordinate rules under the Act.',
    trigger: 'Becoming aware of a personal data breach.',
    toIndividuals: 'Yes — each affected Data Principal must be intimated.',
  },
  enforcement:
    "Data Protection Board of India. Financial penalties up to ₹250 crore (~$30M USD) per breach class — unlawful processing, breach of children's data obligations, failure to notify a breach. Schedule of penalties in the Act.",
  links: [
    {
      label: 'DPDP Act 2023 (PDF)',
      href: 'https://www.meity.gov.in/writereaddata/files/Digital%20Personal%20Data%20Protection%20Act%202023.pdf',
    },
    { label: 'MeitY portal', href: 'https://www.meity.gov.in/data-protection-framework' },
  ],
  crossRef: ['nist-csf:GV.OC-03', 'nist-csf:RS.CO-02'],
};

// ─────────────────────────────────────────────────────────────────────────
// HIPAA Privacy Rule
// ─────────────────────────────────────────────────────────────────────────
const HIPAA: Regime = {
  id: 'hipaa-privacy',
  short: 'HIPAA Privacy Rule',
  longTitle: 'HIPAA Privacy Rule (45 CFR Part 160 & Subparts A and E of Part 164)',
  jurisdiction: 'United States',
  effectiveDate: '2003-04-14 (compliance) · ongoing amendments via the Omnibus Rule and proposed 2024 updates',
  scope:
    'Applies to Covered Entities (health plans, healthcare clearinghouses, healthcare providers that conduct HIPAA standard transactions electronically) and their Business Associates.',
  appliesTo:
    'Covered Entities and Business Associates handling Protected Health Information (PHI) — health information that is identifiable.',
  rights: [
    {
      id: 'hipaa-right-access',
      title: 'Right of access',
      body: 'Right to inspect and obtain a copy of PHI in a designated record set; in electronic form if maintained electronically.',
      citation: '§ 164.524',
    },
    {
      id: 'hipaa-right-amendment',
      title: 'Right to amend',
      body: 'Right to request amendment of PHI for as long as the information is maintained.',
      citation: '§ 164.526',
    },
    {
      id: 'hipaa-right-accounting',
      title: 'Right to accounting of disclosures',
      body: 'Right to a list of certain disclosures of PHI in the prior six years.',
      citation: '§ 164.528',
    },
    {
      id: 'hipaa-right-restriction',
      title: 'Right to request restrictions',
      body: 'Right to request restrictions on uses/disclosures; CE must accommodate certain restrictions involving services paid out-of-pocket in full.',
      citation: '§ 164.522',
    },
    {
      id: 'hipaa-right-confidential-comm',
      title: 'Right to confidential communications',
      body: 'Right to receive communications by alternative means or at alternative locations.',
      citation: '§ 164.522(b)',
    },
  ],
  obligations: [
    {
      id: 'hipaa-minimum-necessary',
      title: 'Minimum necessary',
      body: 'Use and disclose only the minimum PHI necessary to accomplish the purpose. Treatment, payment, and certain other uses are excepted.',
      citation: '§ 164.502(b)',
    },
    {
      id: 'hipaa-baa',
      title: 'Business Associate Agreements (BAA)',
      body: 'Mandatory contract with each Business Associate including specified safeguards, breach reporting, and subcontractor flow-down.',
      citation: '§ 164.504(e)',
    },
    {
      id: 'hipaa-npp',
      title: 'Notice of Privacy Practices (NPP)',
      body: 'Provide an NPP to individuals describing uses/disclosures, individual rights, and Covered Entity obligations.',
      citation: '§ 164.520',
    },
    {
      id: 'hipaa-administrative',
      title: 'Administrative requirements',
      body: 'Designate a Privacy Officer, train workforce, implement policies, accept complaints, and maintain documentation for 6 years.',
      citation: '§ 164.530',
    },
    {
      id: 'hipaa-marketing',
      title: 'Marketing & sale of PHI',
      body: 'Authorisation required for marketing communications and any sale of PHI; narrow exceptions for face-to-face communications and promotional gifts of nominal value.',
    },
  ],
  breachNotification: {
    summary: 'Individuals: 60 days · HHS: 60 days (large) / annual (small)',
    detail:
      'The HIPAA Breach Notification Rule (§§ 164.400-414) requires notification of affected individuals without unreasonable delay and within 60 calendar days of discovery. HHS is notified within 60 days for breaches affecting 500+ individuals; smaller breaches are logged and reported annually. Major media notification is required for breaches affecting 500+ residents of a state.',
    trigger: 'Discovery of an unauthorised acquisition, access, use, or disclosure of unsecured PHI.',
    toIndividuals:
      'Direct written notice within 60 days of discovery; substitute notice if contact info is insufficient.',
  },
  enforcement:
    'Office for Civil Rights (HHS-OCR). Tiered civil penalties from ~$140 to ~$2.1M per violation per year (annually inflation-adjusted), plus criminal penalties under § 1320d-6 for knowing violations. State AGs can also enforce.',
  links: [
    { label: 'HIPAA Privacy Rule (HHS)', href: 'https://www.hhs.gov/hipaa/for-professionals/privacy/index.html' },
    {
      label: 'Breach Notification Rule',
      href: 'https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html',
    },
  ],
  crossRef: ['nist-csf:GV.OC-03', 'nist-csf:PR.DS-01', 'iso-27001:A.5.31'],
};

// ─────────────────────────────────────────────────────────────────────────
// PCI DSS — data-protection aspects
// ─────────────────────────────────────────────────────────────────────────
const PCI: Regime = {
  id: 'pci-dss',
  short: 'PCI DSS 4.0',
  longTitle: 'Payment Card Industry Data Security Standard 4.0',
  jurisdiction: 'Contractual — global; enforced by acquirers / card brands',
  effectiveDate: 'PCI DSS 4.0 effective March 2024; v4.0.1 active',
  scope:
    'All entities that store, process, or transmit cardholder data (CHD) or sensitive authentication data (SAD), and entities that could affect the security of CHD.',
  appliesTo:
    'Merchants (Levels 1–4) and service providers (Levels 1–2) handling payment card data — directly or indirectly.',
  rights: [
    {
      id: 'pci-cardholder-protection',
      title: 'Cardholder data protection rights (contractual)',
      body: 'Cardholders rely on contractual obligations between issuer / acquirer / merchant; chargeback rights under card-network rules. PCI DSS itself is a technical standard, not a consumer-rights regime.',
    },
  ],
  obligations: [
    {
      id: 'pci-r3',
      title: 'Requirement 3 — Protect stored account data',
      body: 'Encrypt stored PAN; truncate / mask in display; never store SAD (full track, CVV, PIN) post-authorisation; key management.',
      citation: 'Req. 3',
    },
    {
      id: 'pci-r4',
      title: 'Requirement 4 — Protect cardholder data with strong cryptography during transmission',
      body: 'TLS 1.2+ with strong ciphers across open / public networks; trusted keys & certificates.',
      citation: 'Req. 4',
    },
    {
      id: 'pci-r6',
      title: 'Requirement 6 — Develop and maintain secure systems and software',
      body: 'Patch within defined SLAs, secure SDLC, threat modelling, code review, software inventory.',
      citation: 'Req. 6',
    },
    {
      id: 'pci-r7-8',
      title: 'Requirements 7-8 — Restrict access; identify and authenticate',
      body: 'Need-to-know access; unique IDs; MFA; password / passphrase policy; service-account governance.',
      citation: 'Req. 7-8',
    },
    {
      id: 'pci-r10',
      title: 'Requirement 10 — Log and monitor access',
      body: 'Audit logs covering all access to CHD; daily review (or correlation/alerting that achieves equivalent); 1 year retention with 3 months readily available.',
      citation: 'Req. 10',
    },
    {
      id: 'pci-r11',
      title: 'Requirement 11 — Test security regularly',
      body: 'Quarterly external ASV scans, internal vulnerability scans, annual penetration tests + after significant change, file-integrity monitoring.',
      citation: 'Req. 11',
    },
    {
      id: 'pci-r12',
      title: 'Requirement 12 — Information security policy',
      body: 'Maintain an information-security programme, run risk assessments, manage service-provider risk, train workforce.',
      citation: 'Req. 12',
    },
  ],
  breachNotification: {
    summary: 'Card brand notification + forensic investigation (PFI)',
    detail:
      "PCI DSS itself does not set a fixed notification window; notification obligations come from card-brand operating regulations and the merchant's acquirer contract. Actual or suspected compromise typically triggers immediate notification of acquirer + Forensic Investigation by a PCI Forensic Investigator (PFI). Statutory breach laws (state laws, GDPR, HIPAA, CCPA) may apply in parallel.",
    trigger: 'Suspected or confirmed compromise of cardholder data.',
    toIndividuals: 'Per applicable state breach-notification laws / contract — not a PCI DSS requirement directly.',
  },
  enforcement:
    'Contractual fines (typically passed from acquirer to merchant), increased transaction fees, possible loss of merchant status. Compliance levels validated annually via Self-Assessment Questionnaire (SAQ) or Report on Compliance (ROC).',
  links: [
    { label: 'PCI DSS 4.0 standard (PCI SSC)', href: 'https://www.pcisecuritystandards.org/document_library/' },
    { label: 'PCI SSC site', href: 'https://www.pcisecuritystandards.org/' },
  ],
  crossRef: ['nist-csf:PR.DS-01', 'nist-csf:PR.DS-02', 'nist-csf:PR.PS-04', 'iso-27001:A.8.10', 'iso-27001:A.8.20'],
};

export const REGIMES: Regime[] = [GDPR, CCPA, DPDP, HIPAA, PCI];

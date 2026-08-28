/**
 * TID-CMM + UTIOM framework data — replicated from tid-cmm.com and utiom.de
 *
 * Sources:
 *  - TID-CMM model 1.5.0 (ATT&CK Enterprise v19.2, 697 techniques)
 *    https://tid-cmm.com/api/model.json  CC-BY-4.0 (Reza Adineh)
 *    Static copy at /data/frameworks/tid-cmm/model.json (sync via scripts/sync-frameworks.mjs)
 *  - UTIOM v1.3  https://utiom.de  CC BY-SA 4.0 (Reza Adineh)
 *    Lifecycle, pillars, doctrine, maturity/capability model — codified from
 *    the published site (no machine-readable JSON endpoint exists; structure
 *    is derived from the HTML assessment tools).
 *
 * Licensed per upstream CC-BY / CC-BY-SA with attribution.
 */

export type MaturityLevel = 0 | 1 | 2 | 3 | 4 | 5;

// ─────────────────────────────────────────────────────────────────────────────
// TID-CMM
// ─────────────────────────────────────────────────────────────────────────────

export interface TidCmmLevelMeta {
  value: MaturityLevel;
  key: string;
  name: string;
  summary: string;
  evidenceBar: string;
}

export const TID_CMM_LEVELS: TidCmmLevelMeta[] = [
  {
    value: 0,
    key: 'absent',
    name: 'Absent',
    summary: 'The capability does not exist in any recognisable form.',
    evidenceBar: 'Nothing to show.',
  },
  {
    value: 1,
    key: 'ad_hoc',
    name: 'Ad hoc',
    summary:
      'Happens occasionally, driven by individual initiative or an incident. Undocumented, unrepeatable, lost when the individual leaves.',
    evidenceBar: 'Anecdote, a person who "knows how".',
  },
  {
    value: 2,
    key: 'repeatable',
    name: 'Repeatable',
    summary:
      'Documented and consistently performed, but driven by compliance, tooling defaults or vendor content rather than by adversary behaviour.',
    evidenceBar: 'A written procedure and proof it was followed more than once.',
  },
  {
    value: 3,
    key: 'threat_informed',
    name: 'Threat-Informed',
    summary:
      'Driven by a prioritised adversary profile. Work is explicitly mapped to ATT&CK techniques and traceable back to an intelligence requirement or a threat model.',
    evidenceBar: 'ATT&CK-mapped artefacts with traceability to a threat driver.',
  },
  {
    value: 4,
    key: 'validated',
    name: 'Measured & Validated',
    summary:
      'Quantitatively managed and independently proven. Claims are tested by emulation, results are measured over time, and gaps enter a managed backlog.',
    evidenceBar: 'Test results, trended metrics, closed-loop backlog records.',
  },
  {
    value: 5,
    key: 'adaptive',
    name: 'Adaptive',
    summary:
      'A self-correcting closed loop. Change in the threat landscape automatically produces changes in telemetry, detection and validation, with measured cycle time. The organisation contributes findings back to the community.',
    evidenceBar: 'Automated pipeline metrics, cycle-time trends, external contributions.',
  },
];

export const TID_CMM_META = {
  id: 'TID-CMM',
  name: 'Threat-Informed Detection Capability Maturity Model',
  short: 'TID-CMM',
  version: '1.5.0',
  attack: { framework: 'MITRE ATT&CK Enterprise', version: '19.2', techniques: 697, snapshot: '2026-08-05' },
  homepage: 'https://tid-cmm.com',
  repo: 'https://github.com/ReZaAdineH/tid-cmm',
  licence: 'CC-BY-4.0',
  author: 'Reza Adineh',
} as const;

export interface TidCmmSubcap {
  id: string;
  name: string;
  weight: number;
  profile: 'essential' | 'standard' | 'comprehensive';
  question: string;
  levels: Record<string, string>;
  evidence: string[];
  crosswalk: Record<string, string[]>;
  domainId: string;
}

export interface TidCmmDomain {
  id: string;
  name: string;
  weight: number;
  question: string;
  subcaps: TidCmmSubcap[];
}

export const TID_CMM_DOMAINS: TidCmmDomain[] = [
  {
    id: 'TI',
    name: 'Threat Intelligence & Adversary Prioritisation',
    weight: 12.0,
    question: 'Who are we defending against, and how do we know?',
    subcaps: [
      {
        id: 'TI.1',
        name: 'Intelligence requirements and PIRs',
        weight: 18.0,
        profile: 'standard',
        question:
          'Are there documented, prioritised intelligence requirements that state what the organisation needs to know, tied to business risk and to named decisions?',
        levels: {
          '0': 'No intelligence requirements exist. Collection is undirected.',
          '1': 'Informal requirements held by one analyst; expressed as topics of interest rather than questions.',
          '2': 'A written PIR list exists and is reviewed annually, but is generic and not tied to specific decisions.',
          '3': 'PIRs are decomposed into specific intelligence requirements (SIRs) and essential elements of information (EEIs), each tied to a named decision-maker and a business risk.',
          '4': 'PIR satisfaction is measured — each requirement has a coverage and confidence rating, gaps are tracked, and collection is retasked on a defined cadence.',
          '5': 'PIRs are dynamically re-prioritised from operational signal (incidents, hunts, emulation results, sector reporting) with measured time-to-retask.',
        },
        evidence: [
          'Signed PIR/SIR register with named decision owners',
          'Requirement satisfaction and collection-gap tracker',
          'Retasking log with dates',
        ],
        crosswalk: { nist_csf_2: ['ID.RA-03', 'ID.RA-04', 'GV.RM-01'] },
        domainId: 'TI',
      },
      {
        id: 'TI.2',
        name: 'Threat profile and adversary prioritisation',
        weight: 20.0,
        profile: 'essential',
        question:
          'Is there a maintained, evidenced threat profile that names the actors, campaigns and behaviours most relevant to this organisation, and ranks them?',
        levels: {
          '0': 'No threat profile. "Everyone is a target" is the operating assumption.',
          '1': 'An informal list of headline actors, largely drawn from vendor marketing and news cycles.',
          '2': 'A documented threat profile exists, refreshed annually, based mainly on sector reporting.',
          '3': 'Threat profile is built from sector, geography, technology stack, crown-jewel exposure and observed activity; actors are ranked by a documented relevance methodology and mapped to ATT&CK Groups and Campaigns.',
          '4': 'Profile is re-scored at least quarterly against new reporting and internal telemetry; changes in ranking produce recorded downstream tasking to threat modeling, detection engineering and emulation.',
          '5': 'Profile is continuously maintained, includes emerging and unattributed behaviour clusters, incorporates supply-chain and insider actors, and drives automated re-prioritisation of the detection backlog.',
        },
        evidence: [
          'Threat profile document with ranking methodology and ATT&CK Group/Campaign IDs',
          'Quarterly re-score records',
          'Tasking records showing profile change to backlog change',
        ],
        crosswalk: { nist_csf_2: ['ID.RA-03', 'ID.RA-05'] },
        domainId: 'TI',
      },
      {
        id: 'TI.3',
        name: 'Technical CTI ingestion and indicator lifecycle',
        weight: 14.0,
        profile: 'essential',
        question:
          'Are technical indicators ingested, scored, deployed, aged and retired under a defined lifecycle, with measured operational value?',
        levels: {
          '0': 'No indicator ingestion, or manual copy-paste from emails.',
          '1': 'Indicators are loaded ad hoc during incidents; nothing is retired.',
          '2': 'A TIP or equivalent ingests feeds automatically; deduplication and basic scoring exist; retirement is manual and inconsistent.',
          '3': 'Indicators carry confidence, source, ATT&CK context and expiry; deployment target (block, alert, enrich, hunt) is decided by score, not by default.',
          '4': 'Indicator hit rates, false-positive rates and feed value are measured per source; low-value feeds are cancelled on the evidence.',
          '5': 'Lifecycle is fully automated including sunset, with feedback from detection outcomes re-scoring source reliability, and internally derived indicators promoted back to the TIP.',
        },
        evidence: ['TIP configuration and lifecycle policy', 'Per-feed hit-rate/FP report', 'Feed decommissioning decision record'],
        crosswalk: { nist_csf_2: ['ID.RA-02', 'DE.AE-07'] },
        domainId: 'TI',
      },
      {
        id: 'TI.4',
        name: 'TTP extraction and ATT&CK mapping discipline',
        weight: 18.0,
        profile: 'standard',
        question:
          'Is finished reporting systematically decomposed into ATT&CK-mapped adversary behaviours with enough procedural detail to build a detection from?',
        levels: {
          '0': 'Reports are read and filed. No structured extraction.',
          '1': 'Analysts occasionally note technique IDs in prose.',
          '2': 'Reports are tagged with ATT&CK technique IDs, mostly at parent-technique level, stored in a searchable repository.',
          '3': 'Extraction reaches sub-technique and procedure level — the specific command line, API call, registry path or protocol behaviour — recorded in a structured schema with source citation and confidence.',
          '4': 'Extraction quality is reviewed; coverage of the prioritised threat profile by extracted procedures is measured; ambiguous mappings are arbitrated and the rationale recorded.',
          '5': 'Extraction is partly automated (NLP-assisted with human validation), feeds a behaviour library reused by threat modeling, detection engineering and emulation, and is contributed to community knowledge bases.',
        },
        evidence: ['Structured TTP/procedure library with citations', 'Mapping quality-review records', 'Behaviour library referenced by detection tickets'],
        crosswalk: { nist_csf_2: ['ID.RA-03', 'ID.IM-02'] },
        domainId: 'TI',
      },
      {
        id: 'TI.5',
        name: 'Intelligence-to-detection tasking',
        weight: 18.0,
        profile: 'essential',
        question: 'Does intelligence reliably and measurably produce detection, hunting and emulation work — and can you prove the linkage?',
        levels: {
          '0': 'No route from intelligence to engineering. The two functions do not interact.',
          '1': 'Occasional informal requests, typically during a live incident.',
          '2': 'A defined handoff exists (ticket or email) but is used inconsistently and without SLA.',
          '3': 'Every prioritised behaviour produces a tracked work item routed to detection engineering, hunting or emulation, with a documented disposition even when the answer is "no action".',
          '4': 'Time from publication to deployed-and-validated detection is measured per priority tier, trended, and reported; the backlog is triaged against the threat profile ranking.',
          '5': 'Tasking is automated from the behaviour library, with measured cycle time under an agreed target and automatic escalation when a top-tier behaviour has no validated detection.',
        },
        evidence: [
          'Intel-to-detection ticket trail with dispositions',
          'Publication-to-validated-detection cycle-time trend',
          'Escalation records for uncovered top-tier behaviours',
        ],
        crosswalk: { nist_csf_2: ['ID.RA-06', 'ID.IM-01', 'DE.AE-08'] },
        domainId: 'TI',
      },
      {
        id: 'TI.6',
        name: 'Dissemination, sharing and community contribution',
        weight: 12.0,
        profile: 'comprehensive',
        question: 'Is intelligence delivered in the form each consumer can act on, and does the organisation contribute back to sector and community sharing?',
        levels: {
          '0': 'No dissemination. Intelligence stays with the person who produced it.',
          '1': 'Ad hoc emails and chat messages, one format for all audiences.',
          '2': 'Regular scheduled reporting exists, but is a single product pushed to everyone.',
          '3': 'Differentiated products by audience — executive risk narrative, SOC-actionable behaviour briefs, engineering-ready procedure detail — with a defined cadence.',
          '4': 'Consumer feedback is collected and acted on; usefulness is measured; participation in ISAC/ISAO or sector sharing is active and reciprocal.',
          '5': 'Bidirectional automated sharing (STIX/TAXII or equivalent), original research published, and community detection content contributed under an agreed disclosure policy.',
        },
        evidence: [
          'Product catalogue by audience with cadence',
          'Consumer feedback and usefulness scores',
          'Sharing-community membership and contribution records',
        ],
        crosswalk: { nist_csf_2: ['ID.RA-03', 'GV.OC-02', 'RS.CO-02'] },
        domainId: 'TI',
      },
    ],
  },
  {
    id: 'TM',
    name: 'Threat Modeling & Attack Path Analysis',
    weight: 12.0,
    question: 'What do their behaviours look like against our architecture?',
    subcaps: [
      {
        id: 'TM.1',
        name: 'Asset, identity and crown-jewel identification',
        weight: 13.0,
        profile: 'essential',
        question: 'Do you know what you are actually protecting — the systems, data, identities and business processes whose compromise would matter most?',
        levels: {
          '0': 'No asset inventory beyond what infrastructure teams happen to hold.',
          '1': 'Partial inventories in spreadsheets, stale, no criticality rating.',
          '2': 'A CMDB or asset inventory exists with ownership and basic criticality, refreshed periodically; identities and cloud resources are covered inconsistently.',
          '3': 'Crown jewels are formally identified through business impact analysis and include data stores, privileged identity paths, build/CI systems and trust relationships; each has a named owner and an impact statement.',
          '4': 'Inventory completeness is measured against independent discovery (network, cloud API, identity provider, EDR) and the delta is tracked and closed; criticality is reviewed on change.',
          '5': 'Asset, identity and exposure inventories are continuously reconciled and automatically feed threat modeling, detection scoping and validation targeting.',
        },
        evidence: [
          'Crown-jewel register with business impact statements',
          'Discovery-versus-inventory reconciliation report',
          'Owner attestation records',
        ],
        crosswalk: { nist_csf_2: ['ID.AM-01', 'ID.AM-02', 'ID.AM-05', 'ID.AM-07'] },
        domainId: 'TM',
      },
      {
        id: 'TM.2',
        name: 'System and data-flow threat modeling',
        weight: 16.0,
        profile: 'standard',
        question: 'Are systems threat-modelled using a recognised structured method, and does that modelling happen at the right point in the delivery lifecycle?',
        levels: {
          '0': 'No threat modeling.',
          '1': 'Occasional whiteboard sessions for high-profile projects, no method, no record.',
          '2': 'A method is nominated (STRIDE, PASTA, LINDDUN, or equivalent) and used for major projects at design review; outputs are documents.',
          '3': 'Threat modeling is mandatory for crown-jewel systems and material changes, uses data-flow diagrams with trust boundaries, and outputs are recorded as structured, queryable threats rather than prose.',
          '4': 'Coverage of the crown-jewel estate by current threat models is measured; model quality is peer-reviewed; findings are tracked to closure with owners and dates.',
          '5': 'Threat modeling is embedded in the delivery pipeline (threat-model-as-code, diagrams generated from IaC), automatically re-triggered by architectural change, and its output is machine-consumable by the detection backlog.',
        },
        evidence: [
          'Threat model repository with trust-boundary DFDs',
          'Crown-jewel threat-model coverage metric',
          'Threat-model-as-code artefacts and pipeline hooks',
        ],
        crosswalk: { nist_csf_2: ['ID.RA-01', 'ID.RA-04', 'PR.PS-06'] },
        domainId: 'TM',
      },
      {
        id: 'TM.7',
        name: 'Attack surface enumeration',
        weight: 14.0,
        profile: 'essential',
        question:
          'Do you continuously know every way in — external exposure, APIs, SaaS tenants, cloud services, identity federation, shadow IT and third-party ingress — so attack trees are rooted in reality rather than in the architecture diagram?',
        levels: {
          '0': 'No attack surface enumeration. Exposure is whatever the last audit happened to notice.',
          '1': 'An informal, partial picture held by individuals; discovered assets surprise the team regularly.',
          '2': 'Periodic external scanning of known ranges and domains; cloud, SaaS and API exposure tracked inconsistently; shadow IT invisible.',
          '3': 'Enumeration is continuous and deliberate across external services, APIs, cloud resources and identity federation, reconciled against the asset inventory; deltas are triaged and every internet-reachable path to a crown jewel is known and appears as an attack tree root.',
          '4': 'Independent discovery (external ASM, cloud API inventory, certificate and DNS monitoring, SaaS discovery) is diffed against the declared surface; unknown-asset rate is measured and trended; new exposure automatically triggers threat model review and telemetry onboarding.',
          '5': 'Attack surface change is handled as a live event — new exposure raises detection and modeling work items in near real time, pre-approved telemetry and baseline detections deploy with the asset, and surface reduction is a reported, incentivised metric.',
        },
        evidence: [
          'Attack surface register reconciled against independent discovery',
          'Unknown-asset rate metric and trend',
          'Change-triggered modeling and onboarding records',
        ],
        crosswalk: { nist_csf_2: ['ID.AM-01', 'ID.AM-02', 'ID.AM-04', 'ID.RA-01', 'DE.CM-06'] },
        domainId: 'TM',
      },
      {
        id: 'TM.3',
        name: 'Attack tree construction',
        weight: 16.0,
        profile: 'standard',
        question:
          'Are attack trees built for the objectives that matter — decomposing an adversary goal into the alternative branches by which it can be achieved — and are all branches carried through to a detection decision?',
        levels: {
          '0': 'No attack trees. Threats are described as single-step statements.',
          '1': 'Occasional informal "how would I break in" discussions, not recorded.',
          '2': 'Attack trees are drawn for selected scenarios but stay as diagrams; leaves are not mapped to techniques or to controls.',
          '3': 'Trees are built for prioritised adversary objectives (e.g. "obtain domain dominance", "exfiltrate the customer database", "tamper with the payment file"); every node is mapped to ATT&CK techniques, and every leaf carries a prevent/detect/accept decision.',
          '4': 'Trees are annotated with feasibility and cost-to-adversary, are reviewed against real incident and emulation outcomes, and drive an explicitly prioritised choke-point strategy — nodes that appear in many trees are treated as high-value detection targets.',
          '5': 'Attack trees are maintained as structured data (not pictures), versioned, automatically re-evaluated when the estate or the threat profile changes, and used to compute residual risk per objective.',
        },
        evidence: [
          'Attack tree library in structured form (YAML/JSON/graph DB)',
          'Node-to-ATT&CK mapping and per-leaf control decisions',
          'Choke-point analysis showing nodes shared across trees',
        ],
        crosswalk: { nist_csf_2: ['ID.RA-01', 'ID.RA-04', 'ID.IM-02'] },
        domainId: 'TM',
      },
      {
        id: 'TM.4',
        name: 'Attack path and exposure analysis',
        weight: 15.0,
        profile: 'comprehensive',
        question: 'Do you analyse real, computed attack paths through identity, network and cloud relationships in the live estate — not only hypothetical ones?',
        levels: {
          '0': 'No attack path analysis. Exposure is understood only as a vulnerability list.',
          '1': 'Path thinking happens only after a red team or pentest report describes one.',
          '2': 'Point-in-time path analysis is run occasionally with a tool (identity graph, cloud permission analysis, AD path tooling) for specific reviews.',
          '3': 'Path analysis runs on a defined cadence across identity, cloud entitlement, network reachability and trust relationships; results are ranked by proximity to crown jewels and issued as remediation and detection work.',
          '4': 'Path exposure is trended as a metric (number and shortest length of viable paths to each crown jewel); choke points are instrumented for detection where remediation is not feasible; reduction is reported.',
          '5': 'Continuous path computation is integrated with change management and CTEM cycles; new paths raise alerts in near real time and automatically create both a remediation and a detection work item.',
        },
        evidence: ['Attack path analysis output with paths to crown jewels', 'Trend of viable path count and shortest path length', 'Choke-point instrumentation records'],
        crosswalk: { nist_csf_2: ['ID.RA-01', 'ID.RA-05', 'ID.IM-02', 'PR.AA-05'] },
        domainId: 'TM',
      },
      {
        id: 'TM.5',
        name: 'Abuse cases to detection requirements traceability',
        weight: 14.0,
        profile: 'standard',
        question: 'Can you trace a specific detection rule back to the threat model or attack tree node that justified it — and identify model nodes with no detection?',
        levels: {
          '0': 'No traceability. Detections exist for reasons nobody records.',
          '1': 'Traceability exists in individuals\' memory only.',
          '2': 'Some detection tickets reference a threat model informally in free text.',
          '3': 'A maintained traceability matrix links threat model / attack tree nodes to detection requirements, to deployed detections, and to validation results, with a unique identifier at each step.',
          '4': 'Orphaned nodes (modelled but undetected and un-prevented) and orphaned detections (deployed but justified by nothing) are both reported as defects and worked down; coverage of model nodes is a reported metric.',
          '5': 'Traceability is automated end to end — model node, requirement, rule, test, validation outcome and incident are linked in one queryable graph used for assurance reporting.',
        },
        evidence: [
          'Traceability matrix or graph query output',
          'Orphaned-node and orphaned-detection reports',
          'Assurance report tracing an incident back to a model node',
        ],
        crosswalk: { nist_csf_2: ['ID.IM-01', 'ID.IM-02', 'DE.CM-09'] },
        domainId: 'TM',
      },
      {
        id: 'TM.6',
        name: 'Model maintenance and change triggers',
        weight: 12.0,
        profile: 'comprehensive',
        question: 'Are threat models, attack trees and path analyses kept alive by defined triggers, or do they decay silently after first publication?',
        levels: {
          '0': 'Models, where they exist, are never updated.',
          '1': 'Updated only when someone remembers or an auditor asks.',
          '2': 'A calendar-based review cycle exists (typically annual) and is partially honoured.',
          '3': 'Defined triggers force review — architecture change, new crown jewel, new prioritised actor, significant incident, major ATT&CK release — and review completion is tracked.',
          '4': 'Model freshness is measured (age distribution, percentage overdue), overdue models are escalated to owners, and drift between model and reality is sampled and reported.',
          '5': 'Change detection is automated from CI/CD, cloud control plane and identity change events; affected models are flagged and re-validated with measured turnaround.',
        },
        evidence: [
          'Documented change triggers and review completion log',
          'Model freshness metric and overdue escalations',
          'Automated change-trigger integration',
        ],
        crosswalk: { nist_csf_2: ['ID.IM-03', 'ID.RA-07', 'GV.OV-03'] },
        domainId: 'TM',
      },
    ],
  },
  {
    id: 'DC',
    name: 'Telemetry & Detection Coverage',
    weight: 14.0,
    question: 'Can we see the activity at all?',
    subcaps: [
      {
        id: 'DC.1',
        name: 'Log source inventory and ownership',
        weight: 14.0,
        profile: 'essential',
        question: 'Is there a complete, owned inventory of telemetry sources with their scope, coverage percentage and criticality?',
        levels: {
          '0': 'No inventory. Nobody can list what is being collected.',
          '1': 'A partial list held by the platform team, out of date.',
          '2': 'An inventory exists with source names and destinations, reviewed periodically; deployment coverage per source is estimated.',
          '3': 'Each source has a named business and technical owner, defined scope (which estate it covers), measured deployment coverage, criticality rating and mapping to ATT&CK data components.',
          '4': 'Inventory completeness is validated against independent asset discovery; unmonitored assets are reported as a defect class with an owner and a target date.',
          '5': 'Inventory is continuously reconciled and automatically drives onboarding, alerting on unmonitored crown-jewel assets within a defined time window.',
        },
        evidence: [
          'Log source inventory with owners, coverage % and data-component mapping',
          'Unmonitored asset report and closure trend',
        ],
        crosswalk: { nist_csf_2: ['ID.AM-01', 'DE.CM-01', 'DE.CM-09'] },
        domainId: 'DC',
      },
      {
        id: 'DC.2',
        name: 'Telemetry quality, completeness and timeliness',
        weight: 18.0,
        profile: 'essential',
        question: 'Do you measure whether the data arriving is complete, correctly parsed, timely and unaltered — and do you alert when it is not?',
        levels: {
          '0': 'Data quality is unknown. Gaps are discovered during investigations.',
          '1': 'Occasional manual checks; problems found reactively when a search returns nothing.',
          '2': 'Basic volume monitoring exists with static thresholds; parsing errors are noticed when someone reports them.',
          '3': 'Quality is measured on defined dimensions — completeness, field-level fill rate, parsing success, ingestion latency, time-source accuracy, retention conformance — per source, with alerting on deviation.',
          '4': 'Quality SLOs are agreed with source owners, breaches are ticketed and trended, and known-gap periods are recorded so investigations and coverage claims are adjusted for them.',
          '5': 'Quality is enforced automatically — schema validation at ingest, synthetic canary events per source to prove the path end to end, self-healing pipelines, and measured mean time to detect a telemetry outage.',
        },
        evidence: [
          'Per-source data quality dashboard with SLOs',
          'Canary event configuration and results',
          'Telemetry outage MTTD metric',
        ],
        crosswalk: { nist_csf_2: ['DE.CM-09', 'DE.AE-03', 'PR.PS-04'] },
        domainId: 'DC',
      },
      {
        id: 'DC.3',
        name: 'Normalisation and data model discipline',
        weight: 14.0,
        profile: 'standard',
        question: 'Is telemetry normalised to a documented, versioned data model so detections are portable and analysts are not re-learning field names per source?',
        levels: {
          '0': 'Raw, source-specific fields only. Every search is bespoke.',
          '1': 'Inconsistent ad hoc field extractions built by whoever needed them.',
          '2': 'A data model is used for the main sources (OCSF, ECS, CIM, ASIM or in-house) but coverage is partial and undocumented.',
          '3': 'A documented, versioned schema is mandated for onboarding; conformance is checked at onboarding; entity resolution (user, host, process, identity) is defined.',
          '4': 'Schema conformance is measured continuously across all sources; non-conformant sources are tracked as debt; schema changes go through change control with impact analysis on affected detections.',
          '5': 'Normalisation is automated and tested, detections are written against the model rather than the source, and the same detection content runs across multiple platforms with proven equivalence.',
        },
        evidence: [
          'Versioned schema document and onboarding conformance gate',
          'Schema conformance metric per source',
          'Cross-platform detection portability proof',
        ],
        crosswalk: { nist_csf_2: ['DE.AE-03', 'PR.DS-01'] },
        domainId: 'DC',
      },
      {
        id: 'DC.4',
        name: 'ATT&CK technique coverage measurement',
        weight: 20.0,
        profile: 'standard',
        question: 'Is coverage measured honestly at technique and sub-technique level, grounded in data-component availability and detection validity — not in rule counts?',
        levels: {
          '0': 'Coverage is not measured.',
          '1': 'A hand-drawn Navigator layer produced once, based on opinion.',
          '2': 'Coverage is mapped by tagging existing rules with technique IDs; parent-technique level only; no distinction between "we have a rule" and "it works".',
          '3': 'Coverage is scored on a defined scale that separates telemetry availability, detection logic presence and detection quality; measured at sub-technique level for the in-scope set defined by the threat profile and platform mix.',
          '4': 'Coverage scoring requires evidence from validation (see AV domain); the Validated Coverage Score is trended over time; regressions are investigated.',
          '5': 'Coverage is computed automatically from the detection repository, telemetry health and the latest validation results, refreshed on every ATT&CK release, with automated diff reporting on new and deprecated techniques.',
        },
        evidence: [
          'Coverage model definition and scoring scale',
          'Navigator layer generated from the detection repository',
          'Validated Coverage Score trend and ATT&CK release diff report',
        ],
        crosswalk: { nist_csf_2: ['DE.CM-09', 'ID.IM-02'] },
        domainId: 'DC',
      },
      {
        id: 'DC.5',
        name: 'Coverage breadth across attack surfaces',
        weight: 20.0,
        profile: 'essential',
        question:
          'Does visibility extend across every surface the prioritised adversaries use — endpoint, identity, cloud control plane, SaaS, network, email, application, container, OT/IoT and third-party — rather than concentrating on endpoint?',
        levels: {
          '0': 'One or two surfaces instrumented, typically endpoint and perimeter.',
          '1': 'Additional sources exist but are unmonitored or only searched during incidents.',
          '2': 'Most traditional surfaces are covered; cloud control plane, SaaS and identity are partial; OT/IoT and CI/CD are absent.',
          '3': 'Coverage is deliberately scoped per surface against the threat profile, with documented decisions on surfaces deliberately not covered and the risk accepted.',
          '4': 'Per-surface coverage is measured and reported separately, preventing a strong endpoint programme from masking a blind cloud or identity plane; gaps carry owners and dates.',
          '5': 'New surfaces are onboarded as part of technology adoption governance — no material new platform reaches production without a telemetry plan and baseline detections.',
        },
        evidence: ['Per-surface coverage report', 'Accepted-risk records for uncovered surfaces', 'Technology-adoption gate requiring a telemetry plan'],
        crosswalk: { nist_csf_2: ['DE.CM-01', 'DE.CM-02', 'DE.CM-03', 'DE.CM-06', 'ID.AM-04'] },
        domainId: 'DC',
      },
      {
        id: 'DC.6',
        name: 'Visibility gap management',
        weight: 14.0,
        profile: 'essential',
        question: 'Are known blind spots recorded, prioritised, costed and driven to closure — or quietly tolerated?',
        levels: {
          '0': 'Blind spots are not recorded.',
          '1': 'Known informally; raised in conversation, not tracked.',
          '2': 'A gap list exists but has no owners, priorities or dates.',
          '3': 'Gaps are registered with the technique(s) they blind, the crown jewels affected, an owner, a priority derived from the threat profile, and a target date.',
          '4': 'Gap closure rate and ageing are reported; gaps that cannot be closed are compensated with alternative detection or explicit risk acceptance at the right level.',
          '5': 'Gaps are generated automatically from coverage and validation results, costed, and fed into budget planning with demonstrated closure of the highest-risk items each cycle.',
        },
        evidence: ['Visibility gap register with owners and dates', 'Gap ageing and closure-rate trend', 'Risk acceptance records for tolerated gaps'],
        crosswalk: { nist_csf_2: ['ID.RA-06', 'ID.IM-01', 'ID.IM-03'] },
        domainId: 'DC',
      },
    ],
  },
  {
    id: 'DE',
    name: 'Detection Engineering',
    weight: 16.0,
    question: 'Do we build, test and maintain detection like engineers?',
    subcaps: [
      {
        id: 'DE.1',
        name: 'Detection lifecycle and intake',
        weight: 10.0,
        profile: 'essential',
        question: 'Is there a defined lifecycle from requirement through design, build, test, release, monitor and retire — with a controlled intake?',
        levels: {
          '0': 'No lifecycle. Rules appear when someone has an idea or a vendor ships content.',
          '1': 'Informal build-and-deploy by individuals; no stages, no record.',
          '2': 'A documented process exists covering build and deploy; test and retire stages are weak or skipped under pressure.',
          '3': 'A full lifecycle is defined and enforced, with a single intake queue accepting requests from intelligence, threat modeling, hunting, incidents, emulation and audit — each item carrying a source and a priority.',
          '4': 'Stage transition criteria are explicit and gated; lifecycle metrics (queue depth, lead time, stage ageing, rejection reasons) are measured and reviewed.',
          '5': 'The lifecycle is automated end to end with policy-as-code gates; lead time from intake to validated production is measured against a target and continuously reduced.',
        },
        evidence: ['Documented lifecycle with stage gates', 'Intake queue showing source attribution per item', 'Lead-time and queue-depth trends'],
        crosswalk: { nist_csf_2: ['DE.CM-09', 'ID.IM-01'] },
        domainId: 'DE',
      },
      {
        id: 'DE.2',
        name: 'Detection-as-code',
        weight: 12.0,
        profile: 'standard',
        question: 'Is detection content managed as code — versioned, peer-reviewed, and deployed through an automated pipeline?',
        levels: {
          '0': 'Rules are edited directly in the console. No history beyond the tool\'s audit log.',
          '1': 'Occasional manual exports kept in a shared folder as backup.',
          '2': 'Content is stored in version control but deployed manually; commits are not reviewed.',
          '3': 'All detection content lives in version control with mandatory peer review, branch protection, meaningful commit history and a documented release process.',
          '4': 'CI validates syntax, schema, metadata completeness and test results before merge; deployment is automated with rollback; production drift from the repository is detected and alerted.',
          '5': 'Full GitOps — the repository is the single source of truth, environments are reproducible, deployments are automated with progressive rollout, and drift is auto-remediated.',
        },
        evidence: ['Repository with branch protection and review history', 'CI pipeline definition and passing runs', 'Drift detection alerts and rollback records'],
        crosswalk: { nist_csf_2: ['PR.PS-01', 'PR.PS-06', 'DE.CM-09'] },
        domainId: 'DE',
      },
      {
        id: 'DE.3',
        name: 'Detection standards, metadata and documentation',
        weight: 10.0,
        profile: 'essential',
        question: 'Does every detection carry the metadata needed to operate, audit and improve it — and is a shared standard enforced?',
        levels: {
          '0': 'No standard. Rule names are the only documentation.',
          '1': 'Some rules have descriptions; quality varies by author.',
          '2': 'A template exists; completion is voluntary and partial.',
          '3': 'A mandatory schema is enforced — unique ID, author, owner, ATT&CK technique and sub-technique, data sources required, logic rationale, known false positives, severity and risk score, triage guidance, response playbook link, validation reference, and version.',
          '4': 'Metadata completeness and accuracy are measured; incomplete content cannot pass CI; analyst-facing triage guidance is reviewed for usability by the people who use it at 3am.',
          '5': 'Metadata is machine-consumable and powers automated coverage reporting, response routing, validation targeting and impact analysis when a log source degrades.',
        },
        evidence: [
          'Enforced detection schema (e.g. Sigma-compatible) and CI validation rule',
          'Metadata completeness metric',
          'Automated report built from detection metadata',
        ],
        crosswalk: { nist_csf_2: ['DE.AE-02', 'DE.CM-09', 'RS.MA-02'] },
        domainId: 'DE',
      },
      {
        id: 'DE.4',
        name: 'Testing and pre-deployment validation',
        weight: 13.0,
        profile: 'standard',
        question: 'Is every detection proven to fire on true positive input and stay quiet on benign input, before it reaches production?',
        levels: {
          '0': 'No testing. Rules are enabled and observed.',
          '1': 'Author eyeballs a historical search and calls it tested.',
          '2': 'Manual testing against sample events for some rules; results not retained.',
          '3': 'Every detection has a positive test (a reproducible execution or synthetic event that must trigger it) and a negative test set of benign activity that must not; results are recorded against the rule version.',
          '4': 'Tests run automatically in CI against a representative dataset or lab range; regression tests re-run on every change and on data model changes; test coverage of the detection portfolio is measured.',
          '5': 'Tests are generated from the emulation library, run continuously against production-like telemetry, and any detection without a passing test in the current period is automatically flagged as unverified in coverage reporting.',
        },
        evidence: ['Test definitions stored with the detection content', 'CI test run history and coverage-of-portfolio metric', 'Unverified-detection report'],
        crosswalk: { nist_csf_2: ['ID.IM-02', 'DE.CM-09', 'PR.PS-06'] },
        domainId: 'DE',
      },
      {
        id: 'DE.5',
        name: 'Tuning, precision and false-positive management',
        weight: 10.0,
        profile: 'essential',
        question: 'Is alert precision measured per detection and improved deliberately, rather than by disabling noisy rules?',
        levels: {
          '0': 'No feedback loop. Noisy rules are muted or ignored by analysts.',
          '1': 'Tuning happens reactively when analysts complain loudly enough.',
          '2': 'Tuning requests are logged and actioned; changes are made in the console without a record of rationale.',
          '3': 'Every detection has measured true-positive/false-positive outcomes captured at case closure; precision is calculated per rule; tuning changes are version-controlled with a stated rationale and expected effect.',
          '4': 'Precision and volume thresholds are agreed; rules breaching them enter a formal remediation path with a deadline, ending in fix, demote-to-hunt, or retire; the effect of each change is measured after the fact.',
          '5': 'Tuning is partly automated with statistical baselining and allow-list governance; suppression is time-boxed and expires by default; precision is trended per rule and per domain with alerting on degradation.',
        },
        evidence: ['Per-rule precision and volume report', 'Tuning change records with rationale and post-change effect', 'Expiring suppression policy and audit'],
        crosswalk: { nist_csf_2: ['DE.AE-08', 'ID.IM-01', 'RS.AN-08'] },
        domainId: 'DE',
      },
      {
        id: 'DE.6',
        name: 'Detection health and silent-failure monitoring',
        weight: 10.0,
        profile: 'essential',
        question: 'Would you know if a detection stopped working — not because it was deleted, but because its data stopped arriving or its schema changed?',
        levels: {
          '0': 'No health monitoring. Silent failure is discovered during an incident, or never.',
          '1': 'Occasional manual review of whether rules have fired recently.',
          '2': 'Basic "rule has not fired in N days" reporting exists, treated as informational.',
          '3': 'Health is monitored on multiple signals — data source availability for each rule\'s required components, execution errors, schema drift, scheduling failures, and unexpected volume change — with defined thresholds.',
          '4': 'Health failures raise operational tickets with SLAs; the percentage of the portfolio in a healthy state is a reported KPI; dependency mapping shows which detections a given log source outage disables.',
          '5': 'Health monitoring is closed-loop with canary events proving the full path from generation to alert; failures auto-open incidents, and coverage reporting automatically discounts unhealthy detections.',
        },
        evidence: ['Detection health dashboard with dependency mapping', 'Portfolio-health KPI trend', 'Canary-to-alert proof and auto-ticketing configuration'],
        crosswalk: { nist_csf_2: ['DE.CM-09', 'PR.PS-04', 'DE.AE-03'] },
        domainId: 'DE',
      },
      {
        id: 'DE.7',
        name: 'Versioning, deprecation and retirement',
        weight: 8.0,
        profile: 'standard',
        question: 'Is content retired deliberately when it no longer earns its place, with a record of why?',
        levels: {
          '0': 'Nothing is ever retired. The rule set only grows.',
          '1': 'Rules are occasionally disabled without record.',
          '2': 'Retirement happens during periodic clean-ups, driven by performance not by value.',
          '3': 'Retirement criteria are defined (superseded, permanently unsupported telemetry, technique no longer relevant, unfixable precision) and each retirement is recorded with rationale and approval.',
          '4': 'The portfolio is reviewed on a cadence against the threat profile; retirement volume and reasons are reported; retired content is archived and recoverable with its history.',
          '5': 'Deprecation is automated against ATT&CK changes, telemetry decommissioning and threat profile shifts, with impact analysis run before removal and coverage recomputed after.',
        },
        evidence: ['Retirement criteria and decision log', 'Portfolio review records and retirement statistics', 'Automated deprecation impact analysis'],
        crosswalk: { nist_csf_2: ['ID.IM-03', 'PR.PS-06'] },
        domainId: 'DE',
      },
      {
        id: 'DE.8',
        name: 'Portfolio composition and detection strategy',
        weight: 12.0,
        profile: 'standard',
        question: 'Is the detection portfolio deliberately balanced across the pyramid of pain — or is it a pile of indicator matches with a few behavioural rules on top?',
        levels: {
          '0': 'No concept of portfolio. Content is whatever the tool shipped with.',
          '1': 'Predominantly signature and indicator matching; behavioural detection is incidental.',
          '2': 'A mix exists but is unplanned; nobody can state the balance or defend it.',
          '3': 'The portfolio is explicitly classified — atomic indicator, tool artefact, behavioural/TTP, anomaly, correlation, deception — with a documented target mix, and behavioural detection is prioritised for the top-tier threat profile.',
          '4': 'Composition is measured and reported against target; resilience to adversary evasion is assessed; brittle detections are identified and reworked.',
          '5': 'Detection strategy is derived from attack-tree choke points and cost-to-adversary analysis; the portfolio is optimised to raise adversary cost, and this is demonstrated through emulation results rather than asserted.',
        },
        evidence: [
          'Portfolio classification with target and actual mix',
          'Evasion-resilience assessment',
          'Choke-point-driven detection strategy document',
        ],
        crosswalk: { nist_csf_2: ['DE.CM-09', 'ID.IM-02', 'PR.IR-01'] },
        domainId: 'DE',
      },
      {
        id: 'DE.9',
        name: 'Detection content sourcing and provenance',
        weight: 8.0,
        profile: 'essential',
        question: 'Do you have a deliberate strategy for where detection ideas come from, and is the provenance of every deployed detection recorded?',
        levels: {
          '0': 'Detection content is whatever the platform shipped with.',
          '1': 'Content is copied ad hoc from blog posts and vendor reports when someone happens to read one.',
          '2': 'Named sources are used routinely — vendor content subscriptions, community rule repositories — but adoption is uncritical and provenance is not recorded.',
          '3': 'A documented sourcing strategy spans annual threat reports, vendor and government advisories, community rule repositories and intelligence platforms; every deployed detection records its source, licence and adoption date.',
          '4': 'Content is evaluated before adoption against the organisation\'s own threat profile and telemetry — not enabled wholesale — and the value of each source is measured by the true positives and validated coverage it actually produced.',
          '5': 'Sourcing is automated and bidirectional: upstream repositories are tracked for updates and deprecations with impact analysis, sector campaign reporting triggers targeted content review within a defined window, and internally developed detections are contributed back.',
        },
        evidence: [
          'Documented sourcing strategy',
          'Provenance, licence and adoption date recorded per detection',
          'Per-source value report',
        ],
        crosswalk: { nist_csf_2: ['ID.RA-02', 'ID.RA-03', 'GV.SC-07', 'DE.CM-09'] },
        domainId: 'DE',
      },
      {
        id: 'DE.10',
        name: 'Detection modality breadth',
        weight: 7.0,
        profile: 'standard',
        question: 'Does detection span the modalities the adversary can be caught in — event analytics, file and memory content, network, identity behaviour, integrity and deception — rather than relying on one?',
        levels: {
          '0': 'A single modality, almost always log or event analytics in a SIEM.',
          '1': 'A second modality exists incidentally because a product provides it, but nobody plans across them.',
          '2': 'Two or three modalities are in use and configured, but chosen by tooling rather than by what the prioritised behaviours require.',
          '3': 'Modalities are selected deliberately per behaviour — event and process analytics, file and memory content matching, network signature and protocol analysis, identity and entitlement behaviour, configuration and integrity drift, and deception — with the choice recorded and justified against the threat profile.',
          '4': 'Modality coverage is measured per prioritised scenario, and gaps are closed with the modality that fits rather than the tool already owned; where commercial endpoint tooling is absent, open-source equivalents are deliberately deployed to reach the same behaviours.',
          '5': 'Modalities are composed rather than parallel — a single scenario is detected across several modalities that corroborate each other, raising both confidence and the cost of evasion, and the composition is validated end to end.',
        },
        evidence: ['Modality map per prioritised scenario with justification', 'Deployed content in more than one modality', 'Evidence of corroboration across modalities'],
        crosswalk: { nist_csf_2: ['DE.CM-01', 'DE.CM-02', 'DE.CM-04', 'DE.CM-09', 'PR.DS-06'] },
        domainId: 'DE',
      },
    ],
  },
  {
    id: 'AV',
    name: 'Adversarial Validation & Emulation',
    weight: 14.0,
    question: 'Have we proven any of it works?',
    subcaps: [
      {
        id: 'AV.1',
        name: 'Atomic testing and control verification',
        weight: 13.0,
        profile: 'essential',
        question: 'Are individual techniques executed safely and repeatably to verify that telemetry, detection and alerting actually fire?',
        levels: {
          '0': 'No technique-level testing.',
          '1': 'Occasional manual tests by a curious engineer, undocumented.',
          '2': 'A test library (e.g. Atomic Red Team or in-house) is used sporadically against a lab; results are informal.',
          '3': 'Atomic tests are run on a defined cadence against a representative production-like environment, mapped to ATT&CK sub-techniques, with recorded outcomes at each stage — telemetry generated, event ingested, detection fired, alert raised.',
          '4': 'Test coverage of the in-scope technique set is measured; failures create tracked defects; re-test after fix is mandatory; results feed coverage scoring directly.',
          '5': 'Atomic testing is continuous and automated with safe-execution guardrails and change control, results stream into coverage dashboards in near real time, and untested techniques are automatically reported as unproven.',
        },
        evidence: ['Test library mapped to sub-technique IDs', 'Per-stage outcome records', 'Defect and re-test records'],
        crosswalk: { nist_csf_2: ['ID.IM-02', 'DE.CM-09', 'PR.PS-06'] },
        domainId: 'AV',
      },
      {
        id: 'AV.2',
        name: 'Breach and attack simulation automation',
        weight: 12.0,
        profile: 'standard',
        question: 'Is there automated, scheduled simulation providing continuous assurance across prevention and detection layers?',
        levels: {
          '0': 'No automated simulation capability.',
          '1': 'A trial or proof of concept was run once.',
          '2': 'A BAS tool is deployed against a limited scope, run manually and irregularly.',
          '3': 'Simulation runs on a defined schedule across representative segments, covering prevention, detection and alerting layers, with scenarios selected from the prioritised threat profile rather than the vendor default set.',
          '4': 'Results are trended, control drift (a previously passing test that now fails) is alerted on, and simulation scope covers all critical segments and cloud/identity planes as well as endpoint.',
          '5': 'Simulation is integrated into change management — infrastructure or control changes trigger targeted re-simulation — and results are an input to control investment decisions.',
        },
        evidence: ['Simulation schedule, scope and scenario provenance', 'Control drift alerts and trend', 'Change-triggered simulation records'],
        crosswalk: { nist_csf_2: ['ID.IM-02', 'PR.PS-06', 'DE.CM-09'] },
        domainId: 'AV',
      },
      {
        id: 'AV.3',
        name: 'Threat-actor emulation plans',
        weight: 15.0,
        profile: 'comprehensive',
        question: 'Do you emulate the full behaviour chains of the specific adversaries in your threat profile, in sequence, rather than isolated techniques?',
        levels: {
          '0': 'No emulation. Testing, where it exists, is technique-by-technique only.',
          '1': 'A single generic scenario borrowed from a public plan, run once.',
          '2': 'Public emulation plans are executed occasionally with limited tailoring to the environment.',
          '3': 'Emulation plans are authored for the top-ranked actors in the threat profile, sequencing techniques into realistic operations against realistic objectives, tailored to the organisation\'s platforms and crown jewels.',
          '4': 'Plans are refreshed as actor tradecraft evolves; coverage of the prioritised actor set by current emulation plans is measured; detection outcomes are recorded per step in the chain, showing where in the kill chain detection actually occurs.',
          '5': 'Emulation is derived automatically from the behaviour library and attack trees, includes evasion variants of previously detected behaviours to test resilience, and produces a measured "adversary dwell time before detection" per scenario.',
        },
        evidence: [
          'Emulation plan library referencing ATT&CK Group/Campaign IDs',
          'Per-step detection outcome records showing earliest detection point',
          'Evasion-variant test results',
        ],
        crosswalk: { nist_csf_2: ['ID.IM-02', 'ID.RA-03', 'DE.CM-09'] },
        domainId: 'AV',
      },
      {
        id: 'AV.4',
        name: 'Purple team programme',
        weight: 13.0,
        profile: 'comprehensive',
        question: 'Is there a structured, recurring collaboration in which offensive execution and defensive engineering work the same exercise together and fix gaps live?',
        levels: {
          '0': 'No purple teaming. Offence and defence do not work together.',
          '1': 'Occasional informal collaboration after a red team engagement.',
          '2': 'Purple team exercises happen once or twice a year, ad hoc in scope, with a report at the end.',
          '3': 'A defined programme with a regular cadence, scenarios drawn from the threat profile, agreed rules of engagement, and detection engineers present during execution making fixes in the session.',
          '4': 'Every exercise produces measured outcomes per technique (prevented / detected-and-alerted / detected-not-alerted / logged-only / invisible), a tracked backlog, and a mandatory re-test that confirms closure.',
          '5': 'Purple teaming is continuous rather than episodic, integrated with the detection pipeline so improvements are shipped within the exercise window, and its findings measurably improve time-to-detect over successive cycles.',
        },
        evidence: ['Programme charter, cadence and rules of engagement', 'Per-technique outcome matrix and re-test confirmations', 'Time-to-detect improvement trend across cycles'],
        crosswalk: { nist_csf_2: ['ID.IM-02', 'ID.IM-01', 'RS.MA-01'] },
        domainId: 'AV',
      },
      {
        id: 'AV.5',
        name: 'Penetration testing integration',
        weight: 12.0,
        profile: 'standard',
        question: 'Are penetration test findings systematically converted into detection requirements — not only into vulnerability remediation tickets?',
        levels: {
          '0': 'Penetration testing is not performed, or reports never reach the detection team.',
          '1': 'Tests are run for compliance; the detection team occasionally hears about the results.',
          '2': 'Reports are shared with the SOC after the fact; a few detections may be built informally.',
          '3': 'Every engagement has a defined detection-feedback stage — the tester\'s activity timeline is reconciled against SOC telemetry and alerts to determine what was seen, and each unseen action becomes a detection requirement.',
          '4': 'The "detection rate" of each engagement is measured (percentage of tester actions that produced telemetry, a detection, and an alert), trended across engagements, and improvement is a stated objective of the testing programme.',
          '5': 'Testers deliver machine-readable activity timelines that are automatically diffed against SIEM data; detection gaps are auto-created; scoping of subsequent tests deliberately targets previously blind areas.',
        },
        evidence: ['Tester activity timeline reconciled against SOC telemetry', 'Engagement detection-rate metric and trend', 'Detection requirements traced to specific test actions'],
        crosswalk: { nist_csf_2: ['ID.IM-02', 'ID.RA-01', 'PR.PS-06'] },
        domainId: 'AV',
      },
      {
        id: 'AV.6',
        name: 'Red teaming and independent assurance',
        weight: 12.0,
        profile: 'comprehensive',
        question: 'Is the detection and response capability tested by objective-based, intelligence-led adversarial engagements under realistic constraints?',
        levels: {
          '0': 'No red teaming.',
          '1': 'A one-off engagement, scoped as an extended penetration test.',
          '2': 'Periodic red team engagements with limited objectives and heavy scope restrictions; the blue team is usually informed.',
          '3': 'Objective-based, intelligence-led engagements against crown-jewel objectives, with a genuinely uninformed blue team, control group, and formal rules of engagement and legal cover.',
          '4': 'Engagements follow a recognised framework where applicable (TIBER-EU, CBEST, CORIE, AASE, iCAST) or an equivalent internal standard; detection and response performance is measured against defined objectives; findings drive a tracked remediation plan with executive visibility.',
          '5': 'A continuous or high-frequency adversarial assurance capability exists; results are compared across cycles to demonstrate improving detection depth and reducing adversary freedom of movement; findings feed threat models and attack trees, not only detections.',
        },
        evidence: [
          'Intelligence-led engagement scope and rules of engagement',
          'Objective-by-objective detection and response performance record',
          'Cross-cycle comparison showing improvement',
        ],
        crosswalk: { nist_csf_2: ['ID.IM-02', 'GV.OV-02', 'RS.MA-01'] },
        domainId: 'AV',
      },
      {
        id: 'AV.7',
        name: 'Findings-to-closure loop',
        weight: 13.0,
        profile: 'standard',
        question: 'Do validation findings reliably become closed detection or control changes, confirmed by re-test — and is the loop\'s speed measured?',
        levels: {
          '0': 'Findings sit in reports. No reliable route to remediation.',
          '1': 'Some findings produce informal requests; many are lost.',
          '2': 'Findings are logged as tickets but tracking is inconsistent; re-test is rare.',
          '3': 'Every finding enters a tracked backlog with an owner and a due date; closure requires a recorded change plus a re-test confirming the detection now fires.',
          '4': 'Time from finding to closed-and-re-tested is measured and trended; ageing is reported; overdue findings are escalated.',
          '5': 'The loop is partly automated — findings create detection backlog entries directly, and re-test is automatically scheduled and reported with measured cycle time.',
        },
        evidence: ['Validation backlog with owners and due dates', 'Closure records with re-test confirmations', 'Finding-to-closure cycle-time trend'],
        crosswalk: { nist_csf_2: ['ID.IM-01', 'ID.IM-02'] },
        domainId: 'AV',
      },
      {
        id: 'AV.8',
        name: 'Control efficacy scoring',
        weight: 10.0,
        profile: 'comprehensive',
        question: 'Is the effectiveness of controls scored honestly and used to drive investment — not only to describe current posture?',
        levels: {
          '0': 'No efficacy scoring. Controls are assumed effective because they exist.',
          '1': 'Occasional subjective ratings in slide decks.',
          '2': 'A scoring model exists and is applied periodically, mostly based on opinion.',
          '3': 'Efficacy is scored from validation results — per-technique, per-stage outcomes (prevented / detected-and-alerted / logged-only / invisible) — and trended over time.',
          '4': 'Scores are aggregated to domain-level efficacy and used to prioritise investment; regression is investigated and reported.',
          '5': 'Efficacy scoring is automated from validation outcomes, feeds the risk register and budget process, and is independently assured.',
        },
        evidence: ['Per-technique efficacy scores with evidence mapping', 'Domain-level efficacy trend', 'Investment decisions traced to efficacy scores'],
        crosswalk: { nist_csf_2: ['ID.IM-02'] },
        domainId: 'AV',
      },
    ],
  },
  {
    id: 'AA',
    name: 'Analytics, Automation & Hunting',
    weight: 12.0,
    question: 'Does detection output become a decision at operational tempo?',
    subcaps: [
      {
        id: 'AA.1',
        name: 'Triage enrichment and context automation',
        weight: 13.0,
        profile: 'essential',
        question: 'Are alerts automatically enriched with the context an analyst needs to decide in minutes rather than after a manual pivot marathon?',
        levels: {
          '0': 'No enrichment. Every alert is a manual pivot chain.',
          '1': 'Occasional manual enrichment by senior analysts.',
          '2': 'Basic automated enrichment (geo, reputation, asset owner) for some alerts; coverage is partial.',
          '3': 'Every alert carries automated enrichment — entity context, related alerts, asset criticality, prior findings on the same entity — produced within the triage window.',
          '4': 'Enrichment completeness and accuracy are measured; gaps are closed; enrichment data is reconciled against authoritative sources.',
          '5': 'Enrichment is continuously validated, versioned, and used to auto-prioritise the queue — high-context alerts surface first with measured improvement in time-to-triage.',
        },
        evidence: ['Enrichment automation with per-alert completeness metric', 'Time-to-triage trend with enrichment coverage', 'Reconciliation against asset/identity sources'],
        crosswalk: { nist_csf_2: ['DE.AE-02', 'DE.AE-08'] },
        domainId: 'AA',
      },
      {
        id: 'AA.2',
        name: 'Correlation and attack-chain assembly',
        weight: 14.0,
        profile: 'standard',
        question: 'Are related events assembled into a single attack narrative rather than presented as a scatter of individual alerts?',
        levels: {
          '0': 'Alerts are isolated events. No correlation.',
          '1': 'Analysts mentally correlate by searching neighbouring time windows.',
          '2': 'Rule-based grouping (same host, same user) merges alerts into cases; logic is static.',
          '3': 'Correlation reconstructs tactic progression — it links events into a chain showing initial access, execution, persistence, and so on — and suppresses constituent alerts in favour of the case.',
          '4': 'Correlation accuracy is measured (grouped vs. should-have-been-grouped); false grouping and missed grouping are tracked; logic is tuned against validation outcomes.',
          '5': 'Correlation uses behavioural graph analysis or equivalent, automatically links across identity, endpoint, network and cloud planes, and its accuracy is continuously validated.',
        },
        evidence: ['Correlation rules producing cases with tactic progression', 'Grouping-accuracy metric', 'Validation of correlation with emulation chains'],
        crosswalk: { nist_csf_2: ['DE.AE-02'] },
        domainId: 'AA',
      },
      {
        id: 'AA.3',
        name: 'Response automation and orchestration',
        weight: 12.0,
        profile: 'standard',
        question: 'Are routine response actions automated with human oversight where judgment is needed — and are playbooks tested rather than hoped to work?',
        levels: {
          '0': 'All response is manual.',
          '1': 'A few scripts exist for enrichment or notification.',
          '2': 'SOAR playbooks exist for common alert types but are run manually and untested.',
          '3': 'Playbooks are automated for triage, enrichment, containment prerequisites and notification, with human approval gates on consequential actions; every playbook is tested at least annually.',
          '4': 'Playbook execution success, time-to-containment and override rates are measured; playbooks are rehearsed against live or simulated incidents.',
          '5': 'Response orchestration is rehearsed continuously, handles compound incidents, and automatically invokes the right playbook from the case context with measured time-to-action.',
        },
        evidence: ['SOAR playbooks with approval gates and execution history', 'Time-to-containment metric with playbook vs. manual split', 'Playbook rehearsal records'],
        crosswalk: { nist_csf_2: ['RS.MA-01', 'RS.AN-03'] },
        domainId: 'AA',
      },
      {
        id: 'AA.4',
        name: 'Advanced analytics governance',
        weight: 11.0,
        profile: 'comprehensive',
        question: 'Are advanced analytics (ML, UEBA, anomaly detection) governed as detection — with documented training data, measured precision, and an analyst-override path?',
        levels: {
          '0': 'No advanced analytics beyond threshold rules.',
          '1': 'Anomaly features are enabled with default vendor tuning.',
          '2': 'Analytics are tuned per environment but governance is informal.',
          '3': 'Every analytic has a documented model, training window, retraining cadence, and measured precision/recall reported to the same standard as rule-based detections.',
          '4': 'Model drift, feature stability, and analyst-override rates are measured; retraining is triggered on drift and validated before promotion.',
          '5': 'Analytics are part of the closed loop — validation outcomes retrain models, and model contribution to case detection is measured separately from rule contribution.',
        },
        evidence: ['Model cards with training window and retraining cadence', 'Precision/recall per analytic with drift monitoring', 'Analyst-override log and re-tuning records'],
        crosswalk: { nist_csf_2: ['DE.AE-02'] },
        domainId: 'AA',
      },
      {
        id: 'AA.5',
        name: 'Threat hunting programme',
        weight: 15.0,
        profile: 'standard',
        question: 'Is hunting hypothesis-driven, measured, and deliberately targeted at the gaps emulation and detection leave?',
        levels: {
          '0': 'No hunting. The SOC is purely reactive.',
          '1': 'Occasional ad hoc hunts during quiet shifts.',
          '2': 'A hunting capability exists on a cadence; hypotheses are informal; results are documented inconsistently.',
          '3': 'Hunts are explicitly hypothesis-driven (written hypothesis, required telemetry, expected outcome, falsification criteria), prioritised against the threat profile and coverage gaps, and every hunt produces a recorded find or an explicit "no evidence".',
          '4': 'Hunt hypotheses come from emulation gaps and intelligence; mean time from hypothesis to finding is measured; findings become detection requirements; hunt coverage of the technique set is reported.',
          '5': 'Hunting is continuously fed by validation outcomes and CTI; hypotheses are partly generated from the behaviour library; findings measurably close coverage gaps within a defined window and are published where appropriate.',
        },
        evidence: ['Hunt hypothesis library with falsification criteria', 'Hypothesis-to-finding cycle-time trend', 'Hunt-to-detection requirement linkage'],
        crosswalk: { nist_csf_2: ['ID.RA-03', 'DE.AE-02'] },
        domainId: 'AA',
      },
      {
        id: 'AA.6',
        name: 'Case management and knowledge capture',
        weight: 11.0,
        profile: 'essential',
        question: 'Does every case leave a record that teaches the next shift — not only a closed ticket?',
        levels: {
          '0': 'No case management system. Findings live in chat history.',
          '1': 'Tickets exist but are inconsistently structured; knowledge is tribal.',
          '2': 'A case system exists with a defined template; completion is voluntary and partial.',
          '3': 'Every case is recorded against a consistent schema — initial alert, pivots, evidence collected, disposition with rationale, and resulting detection or process change — searchable by technique, entity and campaign.',
          '4': 'Case data is analysed for patterns (repeat techniques, repeat entities, mean time per stage); lessons become detection, hunting or emulation work; case quality is reviewed.',
          '5': 'Case knowledge is automatically linked to the traceability graph (attack tree node → detection → case); analysts query prior cases by context and receive ranked relevant history at triage.',
        },
        evidence: ['Case schema with technique/entity/campaign tagging', 'Case-pattern analysis and resulting work items', 'Prior-case ranking at triage'],
        crosswalk: { nist_csf_2: ['RS.AN-03', 'ID.IM-01'] },
        domainId: 'AA',
      },
      {
        id: 'AA.7',
        name: 'Deception and adversary engagement',
        weight: 13.0,
        profile: 'standard',
        question: 'Is deception deliberately placed at attack-tree choke points and operated as a high-precision detection layer?',
        levels: {
          '0': 'No deception.',
          '1': 'A honeypot exists as a technology demo, unmonitored.',
          '2': 'Decoys exist (honey accounts, canary tokens) but placement is ad hoc and alerting is not integrated with the SOC workflow.',
          '3': 'Deception is placed at modelled choke points across identity, credential, network and data layers; every interaction is an alert; false positives are near zero by design; placement is mapped to ATT&CK.',
          '4': 'Deception coverage of choke points is measured; engagement is used to collect adversary tradecraft that feeds the behaviour library; placement is refreshed against evolving paths.',
          '5': 'Deception is orchestrated and repositioned automatically as attack paths shift; interactions feed real-time threat intel and trigger containment with measured time-to-action.',
        },
        evidence: ['Deception placement map with ATT&CK mapping and choke-point justification', 'Decoy interaction → alert → case trail', 'Tradecraft collection and behaviour library linkage'],
        crosswalk: { nist_csf_2: ['DE.CM-01', 'PR.AC-05'] },
        domainId: 'AA',
      },
      {
        id: 'AA.8',
        name: 'Agentic and AI-assisted operations',
        weight: 11.0,
        profile: 'standard',
        question: 'Are agentic or AI-assisted capabilities governed as SOC tooling — with bounded autonomy, human override, and measured contribution to detection and triage?',
        levels: {
          '0': 'No AI-assisted operations. All analysis is human-only.',
          '1': 'Analysts use unmanaged AI tools ad hoc for queries or summaries.',
          '2': 'AI assistance is approved for defined tasks (summarisation, log parsing, query generation) with human review before action.',
          '3': 'AI-assisted capabilities are formally bounded — defined tasks, human-in-the-loop on consequential decisions, measured precision, and an explicit policy covering data handling and hallucination response.',
          '4': 'AI contribution to triage and classification is measured separately from human contribution; override rates and error modes are trended; models are tuned against operational outcomes.',
          '5': 'AI assistance is part of the closed loop — case outcomes retrain triage models, agentic investigation is orchestrated with audit trails, and automation level is raised only when measured accuracy supports it.',
        },
        evidence: ['AI-assistance policy with bounded tasks and human-in-the-loop gates', 'Measured precision and override-rate trends', 'Retraining records tied to case outcomes'],
        crosswalk: { nist_csf_2: ['DE.AE-02', 'GV.RM-01'] },
        domainId: 'AA',
      },
    ],
  },
  {
    id: 'IR',
    name: 'Incident Response & Recovery',
    weight: 10.0,
    question: 'Can we act on what we detect?',
    subcaps: [
      {
        id: 'IR.1',
        name: 'Response plan, playbooks and readiness',
        weight: 18.0,
        profile: 'essential',
        question: 'Do response plans and playbooks exist, are they current, and can they be executed at 03:00 by whoever is on shift?',
        levels: {
          '0': 'No plans or playbooks. Response is improvisation.',
          '1': 'A generic incident response plan exists from a template; not tailored, not practised.',
          '2': 'Playbooks exist for common scenarios; they mention tools and people by name but are reviewed infrequently.',
          '3': 'Crown-jewel-specific playbooks with named owners, decision gates, containment prerequisites, communication templates, and links to detection and forensics procedures; reviewed on a defined cadence and after every significant incident.',
          '4': 'Playbook completeness and freshness are measured; tabletop exercises per crown-jewel scenario occur at least annually; findings become tracked work.',
          '5': 'Playbooks are rehearsed against live or emulated incidents on a cadence that produces measurable improvement; playbook time-to-containment is trended and used to resource decisions.',
        },
        evidence: ['Crown-jewel playbooks with owners and decision gates', 'Review cadence and tabletop exercise records', 'Time-to-containment per playbook trend'],
        crosswalk: { nist_csf_2: ['RS.MA-01', 'RS.AN-03'] },
        domainId: 'IR',
      },
      {
        id: 'IR.2',
        name: 'Detection-to-response handoff and SLAs',
        weight: 17.0,
        profile: 'essential',
        question: 'Does a detection reliably reach a responder with enough context to act — and are the thresholds between alert, case, and incident declared in advance?',
        levels: {
          '0': 'No defined handoff. Alerts may or may not reach anyone at night.',
          '1': 'Alerts page someone; what happens next depends on who answers.',
          '2': 'A handoff exists (queue, on-call rotation) but SLA is informal; alert-to-case and case-to-incident thresholds are unwritten.',
          '3': 'Declared tiers with entry criteria, SLAs per severity, on-call rotation with named individuals per crown-jewel scenario, and automatic escalation on SLA breach; detection output carries triage context into the case.',
          '4': 'SLA compliance and alert-to-case/case-to-incident times are measured, trended, and reviewed; handoff failures are classified and corrected; coverage during leave/rotation gaps is explicitly assigned.',
          '5': 'Handoff is orchestrated with automatic context assembly; SLA compliance is monitored in real time; improvement in time-to-acknowledge and time-to-triage is demonstrated.',
        },
        evidence: [
          'Tiered handoff with SLAs, rotation and escalation thresholds',
          'Alert-to-case and SLA compliance trends',
          'Handoff failure classification and corrections',
        ],
        crosswalk: { nist_csf_2: ['RS.MA-01', 'DE.AE-08'] },
        domainId: 'IR',
      },
      {
        id: 'IR.3',
        name: 'Forensic readiness and evidence handling',
        weight: 15.0,
        profile: 'standard',
        question: 'Can evidence be collected, preserved and presented to the standard it will be judged by — and is that readiness tested before the incident?',
        levels: {
          '0': 'No forensic capability. Evidence handling is improvised.',
          '1': 'Tools exist on laptops but no defined process; legal admissibility is unconsidered.',
          '2': 'A forensic toolkit and chain-of-custody procedure exist; artefacts are collected but not systematically retained.',
          '3': 'Defined evidence collection standards per artefact type, chain-of-custody documentation, forensic retention policy, legal hold process, and pre-positioned collection tooling on crown-jewel systems.',
          '4': 'Forensic readiness is tested (tabletop collections against a time limit); chain-of-custody compliance is audited; retention conformance is measured.',
          '5': 'Forensic collection is automated and orchestrated per playbook; evidence is automatically preserved at containment time; collection success is measured and rehearsed.',
        },
        evidence: ['Evidence collection standards with chain-of-custody procedure', 'Retention policy with compliance measurement', 'Tabletop collection test records'],
        crosswalk: { nist_csf_2: ['RS.AN-03', 'RC.RP-01'] },
        domainId: 'IR',
      },
      {
        id: 'IR.4',
        name: 'Containment, eradication and recovery',
        weight: 17.0,
        profile: 'standard',
        question: 'Are containment options pre-authorised, tested, and measured against the adversary clock — and does recovery include verification that the adversary is actually gone?',
        levels: {
          '0': 'Containment authority is unclear. Recovery is rebuilding and hoping.',
          '1': 'Containment happens ad hoc via helpdesk or sysadmin intervention; recovery is manual.',
          '2': 'Containment procedures exist for common scenarios; approval is required in real time; recovery includes basic verification.',
          '3': 'Pre-authorised containment per crown-jewel scenario with named individuals empowered to act; eradication and recovery playbooks with explicit "adversary gone" verification such as hunt queries, integrity checks, or re-validation.',
          '4': 'Containment time is measured against adversary breakout estimates; containment decisions are audited; recovery verification is tested and measured.',
          '5': 'Containment is orchestrated and rehearsed with measured time-to-containment demonstrated against an adversary-time benchmark; recovery verification is automated and continuously validated.',
        },
        evidence: ['Pre-authorised containment matrix with empowered individuals', 'Time-to-containment trend vs. breakout benchmark', 'Eradication verification artefacts'],
        crosswalk: { nist_csf_2: ['RS.MA-01', 'RC.RP-01'] },
        domainId: 'IR',
      },
      {
        id: 'IR.5',
        name: 'Exercising and crisis management',
        weight: 16.0,
        profile: 'standard',
        question: 'Has the response capability been rehearsed under pressure — and does rehearsal include the decisions that cannot be made for the first time during the crisis?',
        levels: {
          '0': 'No exercises.',
          '1': 'A single tabletop was run years ago; findings were not tracked.',
          '2': 'Annual tabletop exercises occur but are facilitated talks rather than simulations with a clock.',
          '3': 'Exercises are scenario-driven, map to crown-jewel impact, include communication, legal, executive and technical decision-makers, and inject containment authority and resource-contention decisions that cannot be deferred.',
          '4': 'Exercises are measured — time to decide, time to contain, communication timeliness — and trended; findings become tracked work with owners and dates.',
          '5': 'Exercises are frequent enough to show improvement across cycles; crisis communication is tested with real stakeholders under a clock; exercises incorporate lessons from real incidents.',
        },
        evidence: [
          'Exercise programme with crown-jewel scenarios and decision injects',
          'Measured exercise outcomes and trend',
          'Corrective-action tracking and cross-cycle comparison',
        ],
        crosswalk: { nist_csf_2: ['RS.MA-01', 'RS.CO-02'] },
        domainId: 'IR',
      },
      {
        id: 'IR.6',
        name: 'Post-incident review to detection backlog',
        weight: 17.0,
        profile: 'essential',
        question: 'Does every incident make the detection capability harder to surprise next time — and is that feedback measured?',
        levels: {
          '0': 'No post-incident review. Lessons are tribal and lost.',
          '1': 'A write-up is produced for major incidents but rarely reviewed by engineering.',
          '2': 'Post-incident reviews occur for declared incidents with a template; learnings become tickets inconsistently.',
          '3': 'Every declared incident produces a reviewed report that answers what was detected, what was missed, why it was missed, and what detection, telemetry or process change will prevent recurrence — each with an owner and a due date.',
          '4': 'Time from incident to closed detection or telemetry change is measured; detection gaps identified by incidents are treated as the highest-priority backlog items; recurrence of the same technique is tracked.',
          '5': 'Incident learnings are automatically ingested into the behaviour library and detection backlog; scenario coverage is recomputed after every significant incident; recurrence rate is trended and reported.',
        },
        evidence: [
          'Post-incident reports with detected/missed/why/next structure and owners',
          'Incident-to-closed-detection cycle-time trend',
          'Technique recurrence metric',
        ],
        crosswalk: { nist_csf_2: ['ID.IM-01', 'RC.CO-03'] },
        domainId: 'IR',
      },
    ],
  },
  {
    id: 'GV',
    name: 'Governance, Metrics & Continuous Improvement',
    weight: 10.0,
    question: 'Is this directed, measured and sustainable?',
    subcaps: [
      {
        id: 'GV.1',
        name: 'Strategy, mandate and funding',
        weight: 15.0,
        profile: 'essential',
        question: 'Is there a detection strategy with a declared scope, a named owner empowered to fund it, and a link back to business risk?',
        levels: {
          '0': 'No strategy. Detection is whatever the tooling vendor ships.',
          '1': 'An informal intent exists; funding is annual and opportunistic.',
          '2': 'A documented strategy exists but lives with one team; funding is project-based.',
          '3': 'A published strategy with a defined scope, named owner, threat-driver, capability roadmap, and ring-fenced funding tied to business impact.',
          '4': 'Strategy execution is measured — milestones, spend, capability uplift — and re-baselined at least annually; variance is reported.',
          '5': 'Strategy is a rolling, threat-driven plan with automated re-prioritisation as the landscape shifts; funding tracks demonstrated risk reduction.',
        },
        evidence: ['Published detection strategy with named owner and capability roadmap', 'Ring-fenced funding and milestone tracking', 'Annual re-baselining record'],
        crosswalk: { nist_csf_2: ['GV.OC-01', 'GV.RM-01', 'GV.PO-01'] },
        domainId: 'GV',
      },
      {
        id: 'GV.2',
        name: 'Roles, skills and capability development',
        weight: 15.0,
        profile: 'standard',
        question: 'Are detection, engineering and validation roles staffed, skilled, and developed — or dependent on one person who could leave tomorrow?',
        levels: {
          '0': 'No defined roles. Whoever is free handles detection.',
          '1': 'Informal roles; skills are whatever the current staff bring.',
          '2': 'Roles and skills matrix exist; training is available but ad hoc.',
          '3': 'Defined roles with required skills per sub-capability; training plans per role; key-person dependencies are recorded and mitigated.',
          '4': 'Skills coverage is measured and trended; bench strength is tracked; succession is explicitly planned for critical roles.',
          '5': 'Skills development is tied to the capability roadmap; internal mentoring, external contributions, and rotation produce measurable improvement in coverage.',
        },
        evidence: ['Roles and skills matrix with key-person dependency map', 'Training plans and completion trends', 'Succession plans for critical roles'],
        crosswalk: { nist_csf_2: ['GV.RR-01', 'GV.RR-04', 'PR.AT-01'] },
        domainId: 'GV',
      },
      {
        id: 'GV.3',
        name: 'Metrics and performance measurement',
        weight: 18.0,
        profile: 'essential',
        question: 'Are detection metrics defined, measured honestly, and used to decide what to do next — or are they vanity counters?',
        levels: {
          '0': 'No metrics. Activity is counted as success.',
          '1': 'Basic volume metrics (alerts, rules enabled) reported in slide decks.',
          '2': 'Metrics exist and are reported periodically but are not tied to decisions.',
          '3': 'Metrics are defined against the detection strategy — Validated Coverage Score, per-rule precision, time-to-detect, finding-to-closure cycle time, gap ageing — each with a defined formula, data source, and review cadence.',
          '4': 'Metrics are trended, baselined, and used to prioritise investment; metric definitions are independently reviewed; gaming is explicitly guarded against.',
          '5': 'Metrics drive automated re-prioritisation of the detection backlog; improvement is demonstrated with statistical significance; metrics are published as assurance artefacts.',
        },
        evidence: [
          'Metric definitions with formulae and data sources',
          'Trended metrics with baselines and investment decisions',
          'Independent review of metric integrity',
        ],
        crosswalk: { nist_csf_2: ['GV.OC-01', 'DE.AE-08'] },
        domainId: 'GV',
      },
      {
        id: 'GV.4',
        name: 'Risk and compliance alignment',
        weight: 14.0,
        profile: 'standard',
        question: 'Is detection explicitly aligned to the risk and compliance frameworks it is claimed to support — with evidence rather than assertion?',
        levels: {
          '0': 'No alignment. Compliance is asserted without evidence.',
          '1': 'Regulatory requirements are known informally.',
          '2': 'Control mappings exist to NIST CSF 2.0 and other frameworks but are unvalidated.',
          '3': 'Every in-scope regulatory control (NIST CSF 2.0, ISO 27001, SOC-CMM, sector-specific mandates) is mapped to a dataset of detection evidence — validated coverage, backlog status, gap register — with traceability.',
          '4': 'Compliance evidence is independently reviewed and sampled; control failures are tracked as risks; audit findings become detection work.',
          '5': 'Compliance evidence is continuously validated and automatically assembled; control drift triggers immediate re-validation with measured turnaround.',
        },
        evidence: ['Control-to-evidence traceability matrix', 'Independent review of compliance evidence', 'Audit-finding-to-detection-work linkage'],
        crosswalk: { nist_csf_2: ['GV.OC-03', 'GV.RM-01'] },
        domainId: 'GV',
      },
      {
        id: 'GV.5',
        name: 'Executive and board reporting',
        weight: 13.0,
        profile: 'standard',
        question: 'Do boards receive an honest, evidence-backed detection narrative — or a green RAG status with a rule count?',
        levels: {
          '0': 'No reporting. Detection is invisible to management.',
          '1': 'Slide-deck reporting with activity counts.',
          '2': 'Regular reporting exists but is descriptive rather than evaluative.',
          '3': 'Reporting distinguishes validated coverage, known gaps, posture trend, and investment impact — each claim citeable to a dataset rather than to an opinion.',
          '4': 'Reporting is independently assured; gaps and risks are presented with costed closure plans; board decisions are recorded and tracked.',
          '5': 'Reporting is a continuous assurance dashboard with statistical significance; board-level risk appetite explicitly bounds detection investment.',
        },
        evidence: ['Evidence-backed board pack with validated coverage and gap cost', 'Independent assurance of board reporting', 'Board decision tracker'],
        crosswalk: { nist_csf_2: ['GV.OV-02', 'GV.OV-03'] },
        domainId: 'GV',
      },
      {
        id: 'GV.6',
        name: 'Continuous improvement cadence',
        weight: 13.0,
        profile: 'standard',
        question: 'Is improvement a managed cadence — not a burst after an incident that fades until the next?',
        levels: {
          '0': 'No improvement cycle. Lessons are lost.',
          '1': 'Improvement happens sporadically after major incidents.',
          '2': 'A review cycle exists (typically quarterly) but is inconsistently honoured.',
          '3': 'A defined improvement cadence with scheduled reviews, prioritised backlog, and measured progression against the capability roadmap; lessons from incidents, hunts, validation and audits feed the same backlog.',
          '4': 'Progression is measured — capability uplift per cycle, backlog burn-down, recurrence rate — and reported; the cadence is independently reviewed.',
          '5': 'Improvement is continuous and largely automated; cycle time from lesson to shipped change is measured and trended; improvement itself is retrospectively improved.',
        },
        evidence: ['Improvement backlog with prioritisation and progression metrics', 'Cross-cycle capability uplift trend', 'Independent review of improvement effectiveness'],
        crosswalk: { nist_csf_2: ['ID.IM-03', 'GV.OV-03'] },
        domainId: 'GV',
      },
      {
        id: 'GV.7',
        name: 'Third-party and supply-chain detection',
        weight: 12.0,
        profile: 'comprehensive',
        question: 'Are the detections that protect third-party and supply-chain ingress as mature as those that protect first-party estate — or are supplier connections an unmonitored bypass?',
        levels: {
          '0': 'No visibility into third-party/supply-chain activity.',
          '1': 'Some third-party logs are collected incidentally.',
          '2': 'Third-party and supply-chain telemetry is collected but detection is undeveloped.',
          '3': 'Attack trees and detection requirements explicitly cover supply-chain ingress per crown-jewel objective; third-party telemetry is onboarded with the same standards as first-party; detection parity is measured.',
          '4': 'Supply-chain detection outcomes are validated; supplier security posture feeds detection prioritisation; third-party incidents become attack-tree branches.',
          '5': 'Supply-chain detection is continuously validated and automatically adapts to supplier change; third-party risk is managed as a live input to the detection backlog.',
        },
        evidence: [
          'Supply-chain attack trees and detection requirements',
          'Third-party telemetry onboarding records',
          'Detection parity measurement and validation outcomes',
        ],
        crosswalk: { nist_csf_2: ['GV.SC-01', 'GV.SC-07'] },
        domainId: 'GV',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// UTIOM
// ─────────────────────────────────────────────────────────────────────────────

export const UTIOM_META = {
  id: 'UTIOM',
  name: 'Unified Threat-Informed Operations Model',
  version: '1.3',
  released: '2026-08',
  licence: 'CC BY-SA 4.0',
  homepage: 'https://utiom.de',
  book: 'https://utiom.de/utiom-framework-v1.1.pdf',
  workbook: 'https://utiom.de/utiom-assessment-workbook.xlsx',
  author: 'Reza Adineh',
} as const;

export interface UtiomPillar {
  id: string;
  name: string;
  blurb: string;
  phases: UtiomPhase[];
}

export interface UtiomPhase {
  id: string;
  name: string;
  pillar: string;
  legend: string;
  mapsTo: string[];
}

export const UTIOM_PILLARS: UtiomPillar[] = [
  {
    id: 'leadership',
    name: 'Leadership and Governance',
    blurb: 'The why and what — intent, priorities, and the asset that matters.',
    phases: [
      {
        id: 'vision',
        name: 'Vision',
        pillar: 'Leadership and Governance',
        legend: 'Why the SOC exists and how success is measured.',
        mapsTo: ['GV.OC', 'GV.PO — Clause 5'],
      },
      {
        id: 'strategy',
        name: 'Strategy',
        pillar: 'Leadership and Governance',
        legend: 'The SecOps strategy: threat profiling, risk prioritisation, capability roadmap.',
        mapsTo: ['GV.RM — Clauses 6–8', 'ID.RA'],
      },
      {
        id: 'crown-jewels',
        name: 'Crown Jewels',
        pillar: 'Leadership and Governance',
        legend: 'Critical asset mapping, threat modelling, attack paths.',
        mapsTo: ['ID.AM', 'A.5.9 / A.5.12'],
      },
    ],
  },
  {
    id: 'engineering',
    name: 'Engineering and Enablement',
    blurb: 'The how — building visibility and detection before the incident.',
    phases: [
      {
        id: 'visibility',
        name: 'Threat Visibility',
        pillar: 'Engineering and Enablement',
        legend: 'Telemetry engineered outward from crown jewels.',
        mapsTo: ['DeTT&CT', 'TID-CMM', 'DE.CM / A.8.15 / A.8.16'],
      },
      {
        id: 'detection',
        name: 'Threat Detection',
        pillar: 'Engineering and Enablement',
        legend: 'Detection-as-code, versioned, tested, traceable.',
        mapsTo: ['ATT&CK', 'Sigma', 'TID-CMM', 'DE.AE / A.8.16 / A.5.7'],
      },
    ],
  },
  {
    id: 'operations',
    name: 'Operations and Analysis',
    blurb: 'The now — containing, recovering, and learning.',
    phases: [
      {
        id: 'response',
        name: 'Response',
        pillar: 'Operations and Analysis',
        legend: 'Pre-engineered playbooks, tiered containment, automation.',
        mapsTo: ['RS.MA', 'A.5.24–A.5.28'],
      },
      {
        id: 'improvement',
        name: 'Continuous Improvement',
        pillar: 'Operations and Analysis',
        legend: 'Kaizen, PDCA — feeding lessons back into the whole lifecycle.',
        mapsTo: ['ID.IM', 'RC.CO — Clause 10'],
      },
    ],
  },
];

export const UTIOM_PHASES: UtiomPhase[] = UTIOM_PILLARS.flatMap((p) => p.phases);

export interface UtiomDoctrineLaw {
  n: number;
  title: string;
  blurb: string;
}

export const UTIOM_DOCTRINE: UtiomDoctrineLaw[] = [
  {
    n: 1,
    title: 'Business survival defines security',
    blurb:
      'Every material capability must be justified by business consequence, relevant threat or operational resilience. Crown jewels are the primary consequence anchor — together with dependencies, identities, shared infrastructure and realistic attack paths.',
  },
  { n: 2, title: 'Strategy before sensors', blurb: 'Telemetry and tools must follow strategy. Architecture is driven by intent, not by vendor capability.' },
  {
    n: 3,
    title: 'Crown jewels drive prioritisation',
    blurb: 'Security resources are finite. Crown jewels determine where visibility, detection and response must be strongest.',
  },
  { n: 4, title: 'Threats shape architecture', blurb: 'Detection engineering must be informed by real adversary behaviour, designed around realistic attack paths.' },
  { n: 5, title: 'Visibility is a design decision', blurb: 'Blind spots are not accidents. They are architectural choices.' },
  { n: 6, title: 'Operations is continuous response', blurb: 'Incident response is not a phase. It is the operating state of modern security operations.' },
  { n: 7, title: 'Improvement is mandatory', blurb: 'Every incident must refine the system, through measurable feedback loops.' },
];

export interface UtiomPrinciple {
  n: number;
  title: string;
  blurb: string;
}
export const UTIOM_PRINCIPLES: UtiomPrinciple[] = [
  { n: 1, title: 'Unified operating model', blurb: 'Governance, engineering and operations on one lifecycle — board decision and detection rule are two ends of the same thread.' },
  { n: 2, title: 'Threat-informed by default', blurb: 'MITRE ATT&CK is a capability language anchored to crown jewels, not a technique checklist.' },
  { n: 3, title: 'Validation as a rail', blurb: 'Every design decision on the left has a matching validation activity on the right (V-model). Remove the right arm and the left is opinion.' },
  { n: 4, title: 'Measurable over aspirational', blurb: '70 explicit metrics (MTTD / MTTC / MTTR / validation rate / crown-jewel coverage) with formulas, split into leading and lagging.' },
  { n: 5, title: 'Open and vendor-neutral', blurb: 'CC BY-SA 4.0, no products to buy, nothing to install — assessments run entirely in your browser.' },
];

export const UTIOM_FAMILY = [
  { id: 'utiom', name: 'UTIOM', label: 'The operating model', version: 'v1.3', blurb: '7 phases, 3 pillars, 4 assessment tools & dashboard. Defines how the whole operation should be run.' },
  { id: 'tid-cmm', name: 'TID-CMM', label: 'The detection module', version: 'v1.5', blurb: '8 domains, 58 sub-capabilities, ATT&CK v19.2. Measures whether detection is genuinely driven by adversary behaviour and proven to work.' },
  { id: 'tir-cmm', name: 'TIR-CMM', label: 'The response module', version: 'v1.0', blurb: '58 sub-capabilities, 3 tiers. Measures containment authority, tempo against breakout time, and whether any of it was rehearsed.' },
  { id: 'rsmm', name: 'RSMM', label: 'The platform module', version: '5 levels', blurb: 'Realistic SIEM Maturity Model — anti-aspirational; the top is a platform that reliably serves the operation.' },
  { id: 'kevmapp', name: 'KEVMAP', label: 'Exploitation context', version: 'enrichment', blurb: 'Not a maturity model — CISA KEV and exposure context that sharpens prioritisation in Strategy / Crown Jewels / Visibility / Detection.' },
] as const;

export const UTIOM_ASSESSMENT_TOOLS = [
  { id: 'maturity', name: 'Maturity assessment', meta: '50 criteria · staged', url: 'https://utiom.de/maturity.html', question: 'Where are we, honestly?' },
  { id: 'capability', name: 'Capability assessment', meta: '105 indicators', url: 'https://utiom.de/capability.html', question: 'What should we fix first?' },
  { id: 'metrics', name: 'Metrics calculator', meta: '70 metrics', url: 'https://utiom.de/metrics.html', question: 'Did the fix work?' },
  { id: 'roadmap', name: 'Improvement roadmap', meta: 'combines all three', url: 'https://utiom.de/roadmap.html', question: 'So what do we actually do about it?' },
  { id: 'dashboard', name: 'Capability dashboard', meta: 'derived view', url: 'https://utiom.de/dashboard.html', question: 'Why is it where it is?' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Scoring helpers — mirror the official TID-CMM scoring engine
// ─────────────────────────────────────────────────────────────────────────────

export interface TidScoreInput {
  /** Per-sub-capability raw score 0–5, or null/undefined for unrated. Use "NA" for formally scoped-out sub-cap. */
  scores: Record<string, number | 'NA' | null>;
  /** Whether a named artefact was recorded for sub-caps claiming 4/5 (C3 strict mode). */
  evidenced?: Record<string, boolean>;
  /** Whether the inherited threat profile was modified (C5 lift). True lifts the TI.2 ceiling. */
  ti2Lifted?: boolean;
}

export interface TidDomainResult {
  domainId: string;
  raw: number;
  adjusted: number;
  subcaps: { id: string; raw: number | null; adjusted: number | null; na: boolean; cappedBy: string | null }[];
  capNotes: string[];
}

export interface TidOverallResult {
  overall: number;
  band: string;
  domains: TidDomainResult[];
  constraintsApplied: string[];
}

function bandFor(score: number): string {
  if (score >= 5) return 'Level 5 — Adaptive';
  if (score >= 4) return 'Level 4 — Measured & Validated';
  if (score >= 3) return 'Level 3 — Threat-Informed';
  if (score >= 2) return 'Level 2 — Repeatable';
  if (score >= 1) return 'Level 1 — Ad hoc';
  return 'Level 0 — Absent';
}

function weightedMean(
  entries: Array<{ id: string; raw: number | null; weight: number; na: boolean }>,
  cap?: (id: string) => number | null,
): number | null {
  let wSum = 0;
  let vSum = 0;
  for (const e of entries) {
    if (e.na || e.raw === null) continue;
    let v = e.raw;
    if (cap) {
      const ceiling = cap(e.id);
      if (ceiling !== null) v = Math.min(v, ceiling);
    }
    vSum += v * e.weight;
    wSum += e.weight;
  }
  if (wSum === 0) return null;
  return vSum / wSum;
}

export function scoreTidCmm(input: TidScoreInput): TidOverallResult {
  const { scores, evidenced, ti2Lifted } = input;

  // 1) Apply C3 (evidence rule) + C5 (TI.2 inherited intent) per-sub-cap before domain rollups
  const adjustedSub: Record<string, { v: number | null; na: boolean; cappedBy: string | null }> = {};
  for (const d of TID_CMM_DOMAINS) {
    for (const s of d.subcaps) {
      const raw = scores[s.id];
      if (raw === 'NA') {
        adjustedSub[s.id] = { v: null, na: true, cappedBy: null };
        continue;
      }
      if (raw === null || raw === undefined) {
        adjustedSub[s.id] = { v: null, na: false, cappedBy: null };
        continue;
      }
      let v = raw as number;
      let cap: string | null = null;
      if ((v >= 4) && evidenced && evidenced[s.id] === false) {
        v = 3;
        cap = 'C3';
      }
      if (s.id === 'TI.2' && !ti2Lifted && v > 2) {
        v = Math.min(v, 2);
        cap = cap ? `${cap}+C5` : 'C5';
      }
      adjustedSub[s.id] = { v, na: false, cappedBy: cap };
    }
  }

  // 2) Domain raw + domain adjusted (same at this stage, but keep structure for ceilings)
  const domainRaw: Record<string, number | null> = {};
  const domainAdjusted: Record<string, number | null> = {};
  const domainDetails: TidDomainResult[] = [];

  for (const d of TID_CMM_DOMAINS) {
    const entries = d.subcaps.map((s) => ({
      id: s.id,
      raw: (scores[s.id] === 'NA' ? null : (scores[s.id] as number | null)) ?? null,
      weight: s.weight,
      na: scores[s.id] === 'NA',
    }));
    const adjEntries = d.subcaps.map((s) => {
      const adj = adjustedSub[s.id]!;
      return { id: s.id, raw: adj.na ? null : adj.v, weight: s.weight, na: adj.na };
    });

    const raw = weightedMean(entries);
    const adj = weightedMean(adjEntries);
    domainRaw[d.id] = raw;
    domainAdjusted[d.id] = adj;

    domainDetails.push({
      domainId: d.id,
      raw: raw ?? 0,
      adjusted: adj ?? 0,
      subcaps: d.subcaps.map((s) => {
        const adjS = adjustedSub[s.id]!;
        const rawS = scores[s.id] === 'NA' ? null : (scores[s.id] as number | null) ?? null;
        return { id: s.id, raw: rawS, adjusted: adjS.na ? null : adjS.v, na: adjS.na, cappedBy: adjS.cappedBy };
      }),
      capNotes: [],
    });
  }

  // 3) C4 — intent ceiling: DC and DE capped to max(TI, TM) + 1 (using adjusted TI/TM)
  const tiAdj = domainAdjusted['TI'];
  const tmAdj = domainAdjusted['TM'];
  let c4Ceiling: number | null = null;
  if (tiAdj !== null || tmAdj !== null) {
    const base = Math.max(tiAdj ?? 0, tmAdj ?? 0);
    c4Ceiling = base + 1;
  }

  // 4) C2 — visibility ceiling: DE capped to DC + 1 (using adjusted DC after C4)
  // Order per official scoring: C3, C4, C2, C1 — C2 sees DC already capped by C4
  const c4Apply = (did: string, v: number | null, ceiling: number | null): number | null => {
    if (v === null || ceiling === null) return v;
    if (['DC', 'DE'].includes(did)) return Math.min(v, ceiling);
    return v;
  };

  let dcAfterC4: number | null = domainAdjusted['DC'] ?? null;
  if (dcAfterC4 !== null && c4Ceiling !== null) {
    const capped = Math.min(dcAfterC4, c4Ceiling);
    if (capped !== dcAfterC4) {
      const det = domainDetails.find((x) => x.domainId === 'DC')!;
      det.capNotes.push(`C4 intent ceiling: ${dcAfterC4.toFixed(2)} → ${capped.toFixed(2)} (max(TI,TM)+1 = ${c4Ceiling.toFixed(2)})`);
      det.adjusted = capped;
    }
    dcAfterC4 = capped;
  }
  let deAfterC4: number | null = domainAdjusted['DE'] ?? null;
  if (deAfterC4 !== null && c4Ceiling !== null) {
    const capped = c4Apply('DE', deAfterC4, c4Ceiling);
    if (capped !== null && capped !== deAfterC4) {
      const det = domainDetails.find((x) => x.domainId === 'DE')!;
      det.capNotes.push(`C4 intent ceiling: ${(deAfterC4 as number).toFixed(2)} → ${capped.toFixed(2)}`);
      det.adjusted = capped!;
    }
    deAfterC4 = capped as number | null;
  }

  // Now C2 after DC has absorbed C4
  if (deAfterC4 !== null && dcAfterC4 !== null) {
    const c2Ceiling = dcAfterC4 + 1;
    if (deAfterC4 > c2Ceiling) {
      const det = domainDetails.find((x) => x.domainId === 'DE')!;
      const prev = det.adjusted;
      det.adjusted = c2Ceiling;
      det.capNotes.push(`C2 visibility ceiling: ${prev.toFixed(2)} → ${c2Ceiling.toFixed(2)} (DC+1)`);
    }
  }

  // 5) C1 — validation ceiling: every domain except AV itself capped to AV+1
  const avAdj = domainDetails.find((x) => x.domainId === 'AV')?.adjusted ?? domainAdjusted['AV'] ?? null;
  if (avAdj !== null) {
    const c1Ceiling = avAdj + 1;
    for (const det of domainDetails) {
      if (det.domainId === 'AV') continue;
      if (det.adjusted > c1Ceiling) {
        const prev = det.adjusted;
        det.adjusted = c1Ceiling;
        det.capNotes.push(`C1 validation ceiling: ${prev.toFixed(2)} → ${c1Ceiling.toFixed(2)} (AV+1 = ${avAdj.toFixed(2)}+1)`);
      }
    }
  }

  // 6) Overall = weighted mean of adjusted domain scores
  const overallEntries = TID_CMM_DOMAINS.map((d) => {
    const det = domainDetails.find((x) => x.domainId === d.id)!;
    const hasData = d.subcaps.some((s) => scores[s.id] !== null && scores[s.id] !== undefined && scores[s.id] !== 'NA');
    return { id: d.id, raw: det.adjusted, weight: d.weight, na: !hasData && det.adjusted === 0 ? false : det.adjusted === 0 && !hasData ? true : false };
  });

  // Count domains with no data as not contributing (weight excluded)
  let wSum = 0;
  let vSum = 0;
  for (const e of overallEntries) {
    const d = TID_CMM_DOMAINS.find((x) => x.id === e.id)!;
    const rated = d.subcaps.some((s) => {
      const v = scores[s.id];
      return v !== null && v !== undefined && v !== 'NA';
    });
    if (!rated) continue;
    // Use the (already capped) adjusted domain score; if somehow null, skip
    const det = domainDetails.find((x) => x.domainId === e.id)!;
    // det.adjusted may be 0 for a legit 0 score; still counts if rated
    vSum += det.adjusted * d.weight;
    wSum += d.weight;
  }
  const overall = wSum > 0 ? vSum / wSum : 0;

  const constraintsApplied: string[] = [];
  const sawC3 = domainDetails.some((d) => d.subcaps.some((s) => s.cappedBy?.includes('C3')));
  const sawC5 = domainDetails.some((d) => d.subcaps.some((s) => s.cappedBy?.includes('C5')));
  if (sawC3) constraintsApplied.push('C3 evidence rule');
  if (sawC5) constraintsApplied.push('C5 inherited intent ceiling (TI.2)');
  if (c4Ceiling !== null) constraintsApplied.push('C4 intent ceiling');
  // C2/C1 capNotes presence indicates they fired
  const sawC2 = domainDetails.some((d) => d.capNotes.some((n) => n.includes('C2')));
  const sawC1 = domainDetails.some((d) => d.capNotes.some((n) => n.includes('C1')));
  if (sawC2) constraintsApplied.push('C2 visibility ceiling');
  if (sawC1) constraintsApplied.push('C1 validation ceiling');

  return { overall, band: bandFor(overall), domains: domainDetails, constraintsApplied };
}

export function tidCmmDomainScore(
  subcaps: TidCmmSubcap[],
  _scores: Record<string, number | 'NA' | null>,
  adjustedSub: Record<string, { v: number | null; na: boolean; cappedBy: string | null }>,
): number | null {
  const entries = subcaps.map((s) => {
    const adj = adjustedSub[s.id];
    if (!adj || adj.na) return { id: s.id, raw: null as number | null, weight: s.weight, na: true };
    return { id: s.id, raw: adj.v, weight: s.weight, na: false };
  });
  return weightedMean(entries);
}

export const TID_STORAGE_KEY = 'dfir.frameworks.tid-cmm.v1';
export const UTIOM_STORAGE_KEY = 'dfir.frameworks.utiom.v1';

export function loadTidAssessment(): Record<string, number | 'NA' | null> {
  try {
    const raw = localStorage.getItem(TID_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number | 'NA' | null>;
  } catch {
    return {};
  }
}

export function saveTidAssessment(scores: Record<string, number | 'NA' | null>): void {
  try {
    localStorage.setItem(TID_STORAGE_KEY, JSON.stringify(scores));
  } catch {
    /* quota */
  }
}

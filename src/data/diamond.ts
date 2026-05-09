/**
 * The Diamond Model of Intrusion Analysis (Caltagirone, Pendergast, Betz, 2013).
 *
 * Every intrusion event is a connected diamond of four "core features":
 * Adversary, Capability, Infrastructure, Victim. The model also defines
 * "meta-features" describing the event itself (time, phase, result, …),
 * and an "extended" socio-political layer covering motivation and
 * relationships.
 */

export type VertexId = 'adversary' | 'capability' | 'infrastructure' | 'victim';

export interface DiamondVertex {
  id: VertexId;
  name: string;
  short: string;
  description: string;
  pivots: string[];
  examples: string[];
  /** External tools the analyst typically reaches for. */
  tools: string[];
}

export const DIAMOND_VERTICES: DiamondVertex[] = [
  {
    id: 'adversary',
    name: 'Adversary',
    short: 'Who is behind the activity.',
    description:
      'The actor (group, individual, or organisation) responsible for the intrusion. In practice you rarely have a hard attribution — most analysts work with "adversary persona" identifiers (cluster names like UNC2452, FIN7) until evidence converges.',
    pivots: [
      'Operator handle / persona observed in C2 strings or jabber/Slack leaks.',
      'TTP overlap with previously catalogued clusters.',
      'Spoken/written-language fingerprints in payloads, ransom notes, comments.',
      'Working hours / timezone inferred from beacon activity.',
    ],
    examples: [
      'Tracked cluster: APT29 / Cozy Bear (SolarWinds, 2020).',
      'Persona: ShinyHunters operator on BreachForums.',
      'Insider: privileged contractor with elevated production access.',
    ],
    tools: ['Mandiant Advantage', 'Recorded Future', 'CrowdStrike Falcon Adversary', 'public APT trackers'],
  },
  {
    id: 'capability',
    name: 'Capability',
    short: 'What tools and TTPs they use.',
    description:
      'The set of skills, malware, exploits, and techniques the adversary deploys. Capability includes both purpose-built tooling and "living off the land". A capability can be unique enough to act as a fingerprint — Cobalt Strike beacon configs, custom loaders, JA3 / JA4 hashes.',
    pivots: [
      'Malware family lineage (shared code / config schema).',
      'Toolmark patterns: PDB strings, mutex names, Cobalt Strike watermarks.',
      'Exploit kits, n-day vs 0-day usage cadence.',
      'Behavioural patterns mapped to MITRE ATT&CK techniques.',
    ],
    examples: [
      'Cobalt Strike with leaked watermark 0xdeadc0de.',
      'Custom .NET loader sharing an XOR routine with prior cluster.',
      'Phishing kit reused across BEC campaigns (same JS asset hashes).',
      'Exploit chain: ProxyShell → web shell → Cobalt Strike beacon.',
    ],
    tools: ['MalwareBazaar', 'YARA-Forge', 'capa', 'VirusTotal Intelligence', 'Sigma rules'],
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    short: 'What systems carry their traffic.',
    description:
      'The hosts, domains, IPs, certificates, mail relays, and CDNs the adversary uses. Infrastructure is the most pivotable feature in active intrusions — registration metadata, certificate fingerprints, and provider reuse leak across operations.',
    pivots: [
      'WHOIS reuse, registrant email, registrar choice, name-servers.',
      'JARM / JA3S server fingerprints.',
      'TLS certificate SAN / issuer / serial reuse.',
      'Hosting ASN preference; bulletproof providers.',
      'Passive DNS history / co-resolution.',
    ],
    examples: [
      'Two phishing sites sharing a self-signed cert with identical CN.',
      'Cobalt Strike profile fronted by Cloudflare with identical X-Bot header.',
      'Bulletproof ASN reused across three campaigns.',
      'Mail relay with broken SPF reused for subsequent BEC waves.',
    ],
    tools: ['Censys', 'Shodan', 'urlscan.io', 'PassiveTotal / RiskIQ', 'crt.sh', 'DomainTools'],
  },
  {
    id: 'victim',
    name: 'Victim',
    short: 'The target — people, assets, business processes.',
    description:
      'Who or what was targeted. Important to model both the target persona (CFO, finance team, dev with prod creds) and the target asset (Outlook mailbox, GitHub PAT, payroll system). Victimology is what reveals motive when adversary attribution is weak.',
    pivots: [
      'Industry / region distribution across observed targets.',
      'Roles targeted (finance, IT, R&D, exec assistants).',
      'Specific assets: cloud tenants, code-signing certs, payment systems.',
      'Initial-access channel (email address harvested where).',
    ],
    examples: [
      'Manufacturing OT engineer with VPN access to production network.',
      'CFO mailbox at a 200-person SaaS company — BEC target.',
      'Maintainer of an npm package with > 1M weekly downloads.',
      'Service account for SSO connector with admin scope.',
    ],
    tools: ['internal asset inventory', 'identity-graph (Okta, Entra)', 'data-loss-prevention telemetry'],
  },
];

export interface MetaFeature {
  id: string;
  name: string;
  description: string;
}

export const META_FEATURES: MetaFeature[] = [
  {
    id: 'timestamp',
    name: 'Timestamp',
    description: 'When the event was observed and the time-window of attacker activity (start, end, duration).',
  },
  {
    id: 'phase',
    name: 'Phase',
    description: 'Where the event sits on the kill chain — Reconnaissance, Delivery, Exploitation, etc.',
  },
  {
    id: 'result',
    name: 'Result',
    description: 'Success / failure / unknown. A failed exploit attempt is still a signal worth tracking.',
  },
  {
    id: 'direction',
    name: 'Direction',
    description: 'Direction of the activity relative to the asset (Adversary→Victim, Adversary→Infrastructure, etc.).',
  },
  {
    id: 'methodology',
    name: 'Methodology',
    description: 'High-level class — phishing, credential theft, ransomware, supply-chain, BEC, etc.',
  },
  {
    id: 'resources',
    name: 'Resources',
    description:
      'External resources the adversary used or required — leaked credentials, infostealer logs, paid 0-days, insiders.',
  },
];

export interface SocioPoliticalAxis {
  id: 'social-political' | 'technology';
  name: string;
  description: string;
  questions: string[];
}

export const EXTENDED_AXES: SocioPoliticalAxis[] = [
  {
    id: 'social-political',
    name: 'Socio-political',
    description:
      'Why the adversary picked this victim. Captures the relationship — espionage tasking, financial targeting, hacktivism, insider grievance, supply-chain stepping-stone.',
    questions: [
      'What does the adversary gain from a successful operation?',
      'Is the victim the goal, or a stepping stone?',
      'Does the timing align with a geopolitical event, earnings cycle, or holiday?',
      'What relationship pre-existed (vendor, customer, partner)?',
    ],
  },
  {
    id: 'technology',
    name: 'Technology',
    description:
      'The intersection of capability and infrastructure — protocols, frameworks, and platforms that connect them in this specific event.',
    questions: [
      'What protocol carries the C2 traffic?',
      'What software stack does the capability rely on?',
      'What identity providers / SaaS were leveraged for delivery?',
    ],
  },
];

/** Sample event that will be the default in the page form. */
export const SAMPLE_EVENT = {
  adversary: 'UNC-internal-001 (cluster) — operator persona "andy_h" seen in beacon strings',
  capability: 'Cobalt Strike beacon (watermark 0xfeed) + ProxyShell exploit chain',
  infrastructure: 'CDN-fronted C2 cdn.example-svc[.]com (Cloudflare); staging at 185.220.101[.]23 (Tor exit)',
  victim: 'Mailbox of CFO@acme.example, plus on-prem Exchange CAS server',
  timestamp: '2026-04-12 02:14 UTC → 2026-04-15 18:00 UTC',
  phase: 'Exploitation → C2',
  result: 'Partial — beacon active 73h, contained before exfil',
  direction: 'Adversary → Infrastructure → Victim',
  methodology: 'Edge-appliance exploitation + interactive beacon',
  resources: 'Public ProxyShell PoC; leaked Cobalt Strike crackpipe; bulletproof CDN fronting',
  socioPolitical: 'Financially motivated — pre-quarter close, target picked for wire-fraud window.',
  technology: 'Cobalt Strike over HTTPS; OWA WebShell as fallback channel.',
};

export type EventForm = typeof SAMPLE_EVENT;

/**
 * Tabletop / IR-exercise scenario archetypes.
 *
 * Each archetype is a templated incident with timed injects and role-specific
 * discussion prompts. Actor / malware / industry are slotted in at generation
 * time from src/data/dfir/threat-actors.ts so the same archetype produces
 * a different-feeling scenario each run.
 */

export type Archetype = 'ransomware' | 'bec' | 'supply-chain' | 'espionage' | 'edge-exploit' | 'insider';

export type Role = 'ir-lead' | 'tech-lead' | 'comms' | 'legal' | 'exec';

export const ROLE_LABELS: Record<Role, string> = {
  'ir-lead': 'IR Lead',
  'tech-lead': 'Tech Lead',
  comms: 'Communications',
  legal: 'Legal',
  exec: 'Executive Sponsor',
};

export interface Inject {
  /** Time offset from T+0 - e.g. "T+0", "T+30 min", "T+4 h", "T+24 h". */
  t: string;
  /** Headline of the development. */
  headline: string;
  /** Body the facilitator reads to the room. */
  body: string;
  /** Discussion prompts per role. Empty array means everyone discusses. */
  prompts: Array<{ role: Role; question: string }>;
}

export interface ScenarioArchetype {
  id: Archetype;
  name: string;
  /** When this archetype should be picked - match actor.motivation. */
  motivationMatch: RegExp;
  /** Default day-of-week / hour cue. */
  timingCue: string;
  /** One-paragraph narrative scaffold. {{ACTOR}}, {{INDUSTRY}}, {{MALWARE}} placeholders. */
  setup: string;
  injects: Inject[];
}

const RANSOMWARE: ScenarioArchetype = {
  id: 'ransomware',
  name: 'Ransomware deployment',
  motivationMatch: /financial|crime|ransom/i,
  timingCue: 'Friday 16:30 local - most of the team is starting weekend plans.',
  setup:
    'Your SOC has just received a wave of EDR alerts from across the {{INDUSTRY}} business unit. File-rename + encryption activity is spreading fast across endpoints and a network share. Initial telemetry suggests {{ACTOR}} TTPs and the {{MALWARE}} family. A ransom note has been found on three workstations.',
  injects: [
    {
      t: 'T+0',
      headline: 'EDR encryption-burst alert',
      body: 'Hundreds of file-rename events on a single domain-joined workstation, spreading to two file servers within minutes. Sysmon shows a parent process spawned from a scheduled task created 6 minutes ago.',
      prompts: [
        { role: 'ir-lead', question: 'Who has authority to take the affected hosts off the network right now?' },
        {
          role: 'tech-lead',
          question: 'What is the immediate isolation playbook? Is EDR-quarantine sufficient or do we pull cables?',
        },
        { role: 'exec', question: 'Who is on the call-tree for an after-hours material event?' },
      ],
    },
    {
      t: 'T+30 min',
      headline: 'Domain controller exhibits unusual RPC traffic',
      body: 'A spike of SMB / RPC traffic from one of the file servers to the primary DC. AD audit shows new GPO objects linked to several OUs in the last 10 minutes.',
      prompts: [
        { role: 'tech-lead', question: 'How fast can we lock GPO modification? Do we have GPO snapshot baselines?' },
        { role: 'ir-lead', question: 'Are we ready to declare a major incident and engage retained IR?' },
        {
          role: 'legal',
          question: 'What is the trigger for cyber-insurance notification? Have we confirmed our policy obligations?',
        },
      ],
    },
    {
      t: 'T+2 h',
      headline: 'Ransom note + leak-site listing',
      body: 'A specific ransom note appears on every newly-encrypted host with a Tor URL and a 72-hour deadline. Within an hour, the actor publishes a "naming and shaming" entry on their leak site referencing your company name and the {{INDUSTRY}} sector.',
      prompts: [
        { role: 'comms', question: 'What is the holding statement for employees? For customers? For media?' },
        {
          role: 'legal',
          question: 'What jurisdictions are notified, and on what timeline (GDPR 72-hour, SEC 4-day, state laws)?',
        },
        { role: 'exec', question: 'Are we prepared to publicly confirm the incident? Who speaks?' },
        { role: 'ir-lead', question: 'Who is the single source of truth for the timeline? Where is it kept?' },
      ],
    },
    {
      t: 'T+4 h',
      headline: 'Backup integrity question',
      body: 'Backups for the affected file servers were taken last night, but the backup repository is on the same domain. The last off-network backup is 9 days old. Restore tests have not been performed in 4 months.',
      prompts: [
        {
          role: 'tech-lead',
          question: 'Confirm: are immutable / off-network backups intact? How long is full restore?',
        },
        { role: 'exec', question: 'What is the business impact of a 9-day data loss in {{INDUSTRY}}?' },
        { role: 'legal', question: 'Does the data-loss window change our regulatory disclosure?' },
      ],
    },
    {
      t: 'T+24 h',
      headline: 'Customer / partner inquiries begin',
      body: 'A reporter from a trade publication contacts the press inbox citing the leak-site post. Two enterprise customers email asking whether their data is affected.',
      prompts: [
        { role: 'comms', question: 'Did our holding statement hold up? What needs updating now?' },
        { role: 'legal', question: 'Are there contractual notification clauses with these customers? Timelines?' },
        {
          role: 'ir-lead',
          question: 'Do we have a defensible scope statement? What data was actually accessed vs. encrypted?',
        },
      ],
    },
  ],
};

const BEC: ScenarioArchetype = {
  id: 'bec',
  name: 'Business Email Compromise / wire fraud',
  motivationMatch: /financial|crime|fraud|business email/i,
  timingCue: 'Tuesday 11:00 - the AP team is processing month-end invoices.',
  setup:
    'AP receives an email from what appears to be the CFO\'s mailbox approving a $480k wire to a new beneficiary account "for the Q-end vendor consolidation". The CFO is travelling and reachable only by phone. The thread has earlier benign messages from the same address. {{ACTOR}} TTPs are consistent with the email metadata.',
  injects: [
    {
      t: 'T+0',
      headline: 'AP forwards "urgent CFO request" for wire approval',
      body: "The email originates from cfo@yourcompany via Outlook. The CFO's travel calendar is shared internally; the attacker timed the request perfectly. Reply-to header subtly differs (cfo@yourcompany.tld vs cfo@yourcompany.com).",
      prompts: [
        { role: 'tech-lead', question: 'What does the message header analysis show? SPF / DKIM / DMARC alignment?' },
        {
          role: 'ir-lead',
          question: 'What is our "second factor" verification policy for wire changes? Is it being followed today?',
        },
        {
          role: 'comms',
          question: "Has the CFO's travel schedule been disclosed publicly (LinkedIn, conference, press)?",
        },
      ],
    },
    {
      t: 'T+30 min',
      headline: 'Mailbox rule discovered',
      body: 'Quick triage of the CFO\'s mailbox finds a recently-created inbox rule that auto-deletes messages containing the words "wire" or "transfer" or the AP team\'s display names.',
      prompts: [
        {
          role: 'tech-lead',
          question: 'Is MFA enabled on this account? Was a session-cookie theft observed (AiTM proxy)?',
        },
        { role: 'ir-lead', question: 'How many other privileged mailboxes need an inbox-rule audit right now?' },
        {
          role: 'legal',
          question: 'If the wire goes through, when does the bank need to be notified to attempt recall?',
        },
      ],
    },
    {
      t: 'T+2 h',
      headline: 'Wire was sent before discovery',
      body: 'AP team confirms the wire was processed before the rule was discovered. The bank confirms funds moved to a correspondent bank in another jurisdiction.',
      prompts: [
        { role: 'legal', question: 'What is the recall window? Who is the bank counsel contact?' },
        { role: 'exec', question: 'What is our policy on reimbursing AP team members for honest-mistake fraud?' },
        { role: 'comms', question: 'Internal-only or broader disclosure?' },
      ],
    },
    {
      t: 'T+4 h',
      headline: 'OAuth grant discovered',
      body: 'Audit log shows the attacker also granted a third-party OAuth app "Mail.ReadWrite + offline_access" to the CFO\'s mailbox 6 days ago. The app is unfamiliar.',
      prompts: [
        {
          role: 'tech-lead',
          question: 'How do we revoke the OAuth grant? Are there other accounts with grants to the same app?',
        },
        { role: 'ir-lead', question: 'What is the dwell-time? What other mailbox content was accessed?' },
        { role: 'legal', question: 'Does the dwell-time change our disclosure obligations?' },
      ],
    },
  ],
};

const SUPPLY_CHAIN: ScenarioArchetype = {
  id: 'supply-chain',
  name: 'Supply-chain compromise',
  motivationMatch: /espionage|nation-state|state-sponsored/i,
  timingCue: 'Wednesday 09:00 - a vendor publishes a security advisory.',
  setup:
    "A widely-used IT-management vendor publishes an advisory: their software-update channel was compromised. Customers who took updates between two specific dates received a backdoored binary. Your team's update history is within that window. {{ACTOR}} is the attributed actor. The {{INDUSTRY}} sector is mentioned as a target.",
  injects: [
    {
      t: 'T+0',
      headline: 'Vendor advisory + IoC pack',
      body: 'Vendor publishes an advisory with hashes, C2 domains, and a YARA rule. Public attribution names {{ACTOR}}.',
      prompts: [
        {
          role: 'tech-lead',
          question: 'How fast can we sweep our environment for the IoCs? Do we have 90-day retention?',
        },
        {
          role: 'ir-lead',
          question: 'Who owns the vendor relationship? When was the last vulnerability assessment of their access?',
        },
        { role: 'legal', question: 'Contractual obligations - does the vendor owe us forensic detail?' },
      ],
    },
    {
      t: 'T+2 h',
      headline: 'Beacon traffic confirmed',
      body: 'EDR retro-hunt finds outbound TLS to one of the C2 domains from a server that received the backdoored update.',
      prompts: [
        {
          role: 'tech-lead',
          question: 'What did this server have access to? Crown-jewel data? Lateral-movement potential?',
        },
        { role: 'comms', question: 'Are we telling customers anything yet? When?' },
        { role: 'exec', question: 'What is the worst-case scope? Who needs to know now?' },
      ],
    },
    {
      t: 'T+4 h',
      headline: 'Lateral movement evidence',
      body: 'Endpoint forensics shows the implant ran for 14 days and likely accessed credentials for service accounts that interact with cloud production.',
      prompts: [
        {
          role: 'tech-lead',
          question: 'Mass credential rotation - what is the order of operations? What breaks first?',
        },
        { role: 'legal', question: 'When does this become a notifiable event?' },
        {
          role: 'ir-lead',
          question: 'Do we keep operating, partial-shutdown, or full-shutdown? What does the BIA say?',
        },
      ],
    },
  ],
};

const ESPIONAGE: ScenarioArchetype = {
  id: 'espionage',
  name: 'Long-dwell espionage',
  motivationMatch: /espionage|nation-state|state-sponsored|intelligence/i,
  timingCue: 'Monday 14:00 - a hunting team finds something old but live.',
  setup:
    "A threat-hunting query returns matches for {{ACTOR}}'s known {{MALWARE}} loader on a single jump-host. The artifact is dated 11 months ago. The host is on a Tier-1 administrative segment. Network telemetry shows recent C2 callbacks.",
  injects: [
    {
      t: 'T+0',
      headline: 'Hunt match - 11-month-old implant, recent activity',
      body: 'Implant runs as a service. C2 over HTTPS to a CDN-fronted endpoint. JA4 fingerprint matches public IoCs.',
      prompts: [
        {
          role: 'tech-lead',
          question: 'Containment posture - do we cut C2 immediately or watch for a defined window?',
        },
        { role: 'ir-lead', question: 'What is the legal authority to perform host forensics on this jump-host?' },
        { role: 'exec', question: 'Government / law-enforcement engagement - when and who?' },
      ],
    },
    {
      t: 'T+2 h',
      headline: 'Credentials in memory',
      body: 'LSASS dump from the jump-host shows hashes for two domain admin accounts. Keystroke / clipboard plugin found in the implant config.',
      prompts: [
        {
          role: 'tech-lead',
          question:
            'Domain-wide credential reset - sequence and timing? What about Kerberos golden-ticket risk (krbtgt rotation x2)?',
        },
        { role: 'legal', question: 'What jurisdiction governs the data this jump-host accessed?' },
        { role: 'comms', question: 'Internal-only for now? Vendor / partner disclosure?' },
      ],
    },
    {
      t: 'T+24 h',
      headline: 'Second implant location',
      body: 'Hunting confirms the same implant on three more hosts in different segments. Dwell time on each: 4-13 months.',
      prompts: [
        { role: 'ir-lead', question: 'Do we still have the data we need? 90-day log retention is now a problem.' },
        { role: 'tech-lead', question: 'Engagement scope - is this an open-ended IR or do we set a containment date?' },
        { role: 'exec', question: 'External IR firm - engage now? Which one is on retainer?' },
      ],
    },
  ],
};

const EDGE_EXPLOIT: ScenarioArchetype = {
  id: 'edge-exploit',
  name: 'Edge-appliance exploitation',
  motivationMatch: /financial|espionage|nation-state|crime/i,
  timingCue: 'Sunday 22:00 - a public PoC for a 0-day drops.',
  setup:
    'A 0-day in your edge VPN appliance is publicly disclosed with a working PoC. Vendor patch is delayed 48 hours. Your appliance is internet-facing. {{ACTOR}} has historically weaponised similar bugs within hours.',
  injects: [
    {
      t: 'T+0',
      headline: 'Public PoC + Shodan target list circulating',
      body: 'Security Twitter is posting Shodan dorks that match your appliance fingerprint. CISA emergency directive expected.',
      prompts: [
        {
          role: 'ir-lead',
          question: 'Mitigation options before patch - IP allow-listing, MFA-only access, full shutdown?',
        },
        { role: 'tech-lead', question: 'What is the business impact of taking the VPN offline for 48 hours?' },
        { role: 'exec', question: 'Authority to declare emergency change-management?' },
      ],
    },
    {
      t: 'T+4 h',
      headline: 'Suspicious authentication burst',
      body: 'Telemetry shows a burst of authentication attempts against the appliance from a small set of IPs, with sessions established but no downstream activity yet.',
      prompts: [
        { role: 'tech-lead', question: 'Are we already compromised? What does session validation show?' },
        { role: 'ir-lead', question: 'IR escalation - declare incident now or wait for confirmed exploitation?' },
        { role: 'legal', question: 'Disclosure timing if we discover post-exploitation activity?' },
      ],
    },
    {
      t: 'T+12 h',
      headline: 'Vendor patch available - risk assessment',
      body: 'Vendor releases patch with caveats - known-issue reboot loop on certain configurations. Your config is in the affected list.',
      prompts: [
        {
          role: 'tech-lead',
          question: 'Patch now and risk reboot loop, or wait for fixed patch with known compromise window?',
        },
        { role: 'exec', question: 'Risk-acceptance decision - who signs?' },
      ],
    },
  ],
};

const INSIDER: ScenarioArchetype = {
  id: 'insider',
  name: 'Insider threat / privileged misuse',
  motivationMatch: /insider|.*/i,
  timingCue: 'Thursday 17:00 - a manager flags concerning behaviour from an employee.',
  setup:
    'A manager reports that an engineer who was given a poor performance review yesterday has spent the day accessing repositories outside their normal scope and downloading large amounts of data. The employee has admin on a customer-data system.',
  injects: [
    {
      t: 'T+0',
      headline: 'HR + manager report',
      body: 'Manager observed the employee photographing a screen with personal phone. Audit log shows abnormal repo cloning and database query patterns starting today at 09:00.',
      prompts: [
        { role: 'legal', question: 'What employment-law constraints apply to revoking access pre-emptively?' },
        { role: 'ir-lead', question: 'Who has authority to disable the account? HR vs. security?' },
        {
          role: 'exec',
          question: 'How do we handle this without provoking the employee or creating wrongful-termination exposure?',
        },
      ],
    },
    {
      t: 'T+1 h',
      headline: 'Personal cloud upload detected',
      body: 'DLP alert on uploads to a personal Google Drive over the last 6 hours. ~3 GB of data including a customer-list export.',
      prompts: [
        {
          role: 'tech-lead',
          question: 'How do we preserve evidence - endpoint imaging, log preservation, account snapshot?',
        },
        { role: 'legal', question: 'When is law-enforcement / external counsel engaged?' },
        { role: 'comms', question: 'Customer notification - what triggers it?' },
      ],
    },
    {
      t: 'T+24 h',
      headline: 'Employee resigns by email',
      body: 'Employee submits a resignation effective immediately and offers to "return any company property". They request a final-pay statement.',
      prompts: [
        { role: 'legal', question: 'Acceptance of resignation vs termination - implications for our claim?' },
        {
          role: 'ir-lead',
          question: 'Forensic acquisition timeline - do we still have access to the personal device?',
        },
        { role: 'exec', question: 'Public stance if this becomes a regulatory or media event?' },
      ],
    },
  ],
};

export const ARCHETYPES: ScenarioArchetype[] = [RANSOMWARE, BEC, SUPPLY_CHAIN, ESPIONAGE, EDGE_EXPLOIT, INSIDER];

/** Render a template by replacing the actor / industry / malware placeholders. */
export function renderTemplate(t: string, vars: { actor: string; industry: string; malware: string }): string {
  return t
    .replace(/\{\{ACTOR\}\}/g, vars.actor)
    .replace(/\{\{INDUSTRY\}\}/g, vars.industry)
    .replace(/\{\{MALWARE\}\}/g, vars.malware);
}

/** Pick the archetype that best matches the actor's motivation. */
export function pickArchetype(motivation: string): ScenarioArchetype {
  for (const a of ARCHETYPES) {
    if (a.motivationMatch.test(motivation)) return a;
  }
  return RANSOMWARE; // sensible default
}

/**
 * Lockheed Martin Cyber Kill Chain (2011).
 *
 * Seven sequential phases describing an intrusion. Each phase lists example
 * techniques (mapped to MITRE ATT&CK where practical), detection guidance,
 * and the controls that typically break the chain.
 *
 * The chain itself is criticised for being too linear for modern intrusions
 * (ransomware, BEC, supply-chain) — it pairs well with the Diamond Model,
 * which describes the *who* and *what* per intrusion event.
 */

export interface KillChainTechnique {
  /** Short label shown on the matrix card. */
  label: string;
  /** Optional MITRE ATT&CK ID — links into /threatintel/mitre. */
  attack?: string;
  /** One-sentence example. */
  example: string;
}

export interface KillChainPhase {
  id: string;
  number: number;
  name: string;
  short: string;
  description: string;
  attackerGoal: string;
  defenderGoal: string;
  techniques: KillChainTechnique[];
  detection: string[];
  controls: string[];
}

export const KILL_CHAIN: KillChainPhase[] = [
  {
    id: 'reconnaissance',
    number: 1,
    name: 'Reconnaissance',
    short: 'Research, identify, select targets.',
    description:
      'The attacker harvests information about the target — people, technology, infrastructure, partner networks, certificates, exposed services. Most of this is passive (OSINT) and indistinguishable from legitimate research.',
    attackerGoal: 'Build a profile rich enough to pick the right initial-access vector.',
    defenderGoal: 'Reduce attack surface and detect targeted scanning that crosses into active recon.',
    techniques: [
      {
        label: 'OSINT on employees',
        attack: 'T1589.003',
        example: 'LinkedIn / GitHub harvesting to identify high-value users, sysadmins, IR responders.',
      },
      {
        label: 'Subdomain & port discovery',
        attack: 'T1590.001',
        example: 'crt.sh / Censys / Shodan to enumerate exposed services and forgotten hosts.',
      },
      {
        label: 'Email format harvesting',
        attack: 'T1589.002',
        example: 'Confirmed name patterns from data brokers, breach corpora, hunter.io-style services.',
      },
      {
        label: 'Brand-impersonation prep',
        attack: 'T1583.001',
        example: 'Lookalike domain registration, IDN homograph staging, MX setup.',
      },
    ],
    detection: [
      'External attack-surface monitoring (subdomain takeovers, exposed admin panels).',
      'Brand-monitoring feeds for newly registered lookalike domains.',
      'Honeytokens in code repos and recruiter pipelines.',
    ],
    controls: [
      'Minimise public org chart / metadata exposure.',
      'CT-log monitoring (issuance alerts).',
      'Disable directory-enumeration responses (e.g. SMTP RCPT TO probing).',
    ],
  },
  {
    id: 'weaponization',
    number: 2,
    name: 'Weaponization',
    short: 'Couple a payload with a deliverable.',
    description:
      'Attacker pairs an exploit / capability with a deliverable artifact — a maldoc, an HTML smuggling page, a malicious LNK, a poisoned package, an ISO. This phase is mostly invisible to the defender; it happens on attacker infrastructure.',
    attackerGoal: 'Create an artifact that survives mail filters and EDR static checks.',
    defenderGoal: 'Make weaponized artifacts ineffective by hardening the runtime they target.',
    techniques: [
      {
        label: 'HTML smuggling / ISO container',
        attack: 'T1027.006',
        example: 'Encode payload in JS blob; assemble file in browser to evade gateway scanning.',
      },
      {
        label: 'Maldoc with macro / template injection',
        attack: 'T1221',
        example: 'Office doc with remote-template fetch from staging C2.',
      },
      {
        label: 'Trojanized installer',
        attack: 'T1195.002',
        example: 'Malicious npm/pip/Go package, signed installer with extra payload.',
      },
      {
        label: 'LOLBin loader',
        attack: 'T1218',
        example: 'Living-off-the-land binary that swaps the payload at runtime.',
      },
    ],
    detection: [
      'Sandbox detonation of unknown attachments.',
      'YARA against known crypter / packer signatures.',
      'Fingerprinting freshly registered TLDs / cert-issuance bursts.',
    ],
    controls: [
      'Disable Office macros from internet, block VBA project model access.',
      'Application allowlisting (WDAC, AppLocker, Carbon Black).',
      'Mark-of-the-web preservation across mail / browser flows.',
    ],
  },
  {
    id: 'delivery',
    number: 3,
    name: 'Delivery',
    short: 'Transmit the weapon to the target.',
    description:
      'The artifact crosses the perimeter — usually by email, less often by web download, removable media, supply-chain update, or trusted partner network. This is the first phase the defender can normally observe.',
    attackerGoal: 'Place the artifact in front of a human or process that will execute it.',
    defenderGoal: 'Block at the boundary; if it reaches a user, give them the right cues to refuse it.',
    techniques: [
      {
        label: 'Phishing — link or attachment',
        attack: 'T1566',
        example: 'BEC-style invoice swap, MFA fatigue link, OAuth consent phish.',
      },
      {
        label: 'Drive-by compromise',
        attack: 'T1189',
        example: 'Watering hole on industry forum, malvertising.',
      },
      {
        label: 'Supply-chain delivery',
        attack: 'T1195',
        example: 'Compromised software update, poisoned dependency, malicious VS Code extension.',
      },
      {
        label: 'External remote services',
        attack: 'T1133',
        example: 'Citrix / VPN / RDP abuse — credentials sourced from infostealer logs.',
      },
    ],
    detection: [
      'Mail-flow telemetry — DMARC alignment, header anomalies, look-alike sender.',
      'Outbound DNS for newly registered domains in click-time.',
      'Endpoint download provenance + MOTW preservation.',
    ],
    controls: [
      'DMARC reject + BIMI; ARC chain validation for forwarders.',
      'Browser isolation for high-risk users.',
      'Hardware-bound MFA (FIDO2) to neutralise OAuth/AiTM phishing.',
    ],
  },
  {
    id: 'exploitation',
    number: 4,
    name: 'Exploitation',
    short: 'Trigger the weapon to run code on the target.',
    description:
      'A vulnerability — software CVE, configuration weakness, or human decision — is triggered. The artifact transitions from "data" to "running code" inside the victim environment.',
    attackerGoal: 'Achieve code execution with the privileges of the entry point.',
    defenderGoal: 'Detect the moment-of-execution; minimise blast radius via sandboxing.',
    techniques: [
      {
        label: 'User execution',
        attack: 'T1204',
        example: 'User opens maldoc / clicks LNK; macro or scriptlet kicks off.',
      },
      {
        label: 'Exploit public-facing app',
        attack: 'T1190',
        example: 'Webshell after pre-auth RCE on edge appliance (Citrix Bleed, MOVEit, Confluence).',
      },
      {
        label: 'Browser exploit',
        attack: 'T1203',
        example: 'V8/JIT bug chained with sandbox escape.',
      },
      {
        label: 'OAuth consent abuse',
        attack: 'T1528',
        example: 'User grants "illicit consent" to attacker app, no malware needed.',
      },
    ],
    detection: [
      'EDR process-tree anomalies (Office spawning cmd / wscript).',
      'Web-server processes spawning shells.',
      'OAuth grant logs — unusual app, unusual scopes.',
    ],
    controls: [
      'Patching with KEV / EPSS prioritisation.',
      'ASR rules + Office macro hardening.',
      'OAuth admin consent + risky-app detection.',
    ],
  },
  {
    id: 'installation',
    number: 5,
    name: 'Installation',
    short: 'Establish persistence on the target.',
    description:
      'Attacker installs persistence so they survive reboots, password resets, and short attention spans. Often the first phase that creates clearly forensic artifacts on disk / in identity stores.',
    attackerGoal: 'Survive and stay invisible long enough to operate.',
    defenderGoal: 'Catch persistence creation in real time; detect anomalies on next boot/login.',
    techniques: [
      {
        label: 'Scheduled task / service',
        attack: 'T1053',
        example: 'New svchost-style service that calls back every 15 minutes.',
      },
      {
        label: 'Boot / logon autostart',
        attack: 'T1547',
        example: 'Run / RunOnce key, login items, LSASS DLL load order.',
      },
      {
        label: 'Account creation',
        attack: 'T1136',
        example: 'New local admin or cloud service principal with broad roles.',
      },
      {
        label: 'Web shell',
        attack: 'T1505.003',
        example: 'aspx / jsp drop into web root; survives even after exploit is patched.',
      },
    ],
    detection: [
      'Sysmon Event ID 1/11/13/22, registry-autorun deltas.',
      'Cloud audit log: new role assignments, new app credentials.',
      'Asset baseline diffs (file integrity monitoring).',
    ],
    controls: [
      'LAPS / centralised local-admin password rotation.',
      'Tier-0 isolation; just-in-time / just-enough access.',
      'Block writable web roots; immutable golden images.',
    ],
  },
  {
    id: 'c2',
    number: 6,
    name: 'Command & Control (C2)',
    short: 'Open a channel back to attacker infrastructure.',
    description:
      'The implant calls home for instructions. Modern C2 hides in HTTPS to popular CDNs, DNS, MQTT, or trusted SaaS (Slack, Discord, Telegram bots). This is the longest-duration phase of an intrusion.',
    attackerGoal: 'Maintain a reliable, low-noise channel for hands-on-keyboard work.',
    defenderGoal: 'Detect beaconing patterns and unusual cloud traffic; sever the channel.',
    techniques: [
      {
        label: 'HTTPS to legit-looking CDN',
        attack: 'T1071.001',
        example: 'Cobalt Strike / Sliver beacons fronted by Cloudflare or Fastly.',
      },
      {
        label: 'DNS tunnelling',
        attack: 'T1071.004',
        example: 'TXT-record exfil; long subdomains encoding C2 traffic.',
      },
      {
        label: 'Web service C2',
        attack: 'T1102',
        example: 'GitHub Gist / pastebin / Notion / Discord webhooks as a dead-drop.',
      },
      {
        label: 'Encrypted protocol via TOR / Cloud',
        attack: 'T1573',
        example: 'TLS-pinning aside, JARM / JA4 still fingerprints the framework.',
      },
    ],
    detection: [
      'Beacon-jitter analysis on egress flows; Zeek connection logs.',
      'JA3/JA4 fingerprints against known C2 frameworks.',
      'Newly-observed domain proximity (NOD) and high-entropy DNS.',
    ],
    controls: [
      'Egress allowlisting from Tier-0 / sensitive segments.',
      'TLS inspection where legally permitted.',
      'Sinkholing / DNS RPZ for known C2 domains.',
    ],
  },
  {
    id: 'actions',
    number: 7,
    name: 'Actions on Objectives',
    short: 'Achieve the goal — exfil, ransom, sabotage, fraud.',
    description:
      'The attacker pursues the actual mission — data theft, ransomware deployment, fraudulent wire transfers, sabotage, or staging for the next victim. Detection here is too late but containment still matters.',
    attackerGoal: 'Realise the mission with the lowest chance of being stopped mid-flight.',
    defenderGoal: 'Detect mass-staging / encryption / exfil bursts; rapid isolation.',
    techniques: [
      {
        label: 'Data exfiltration',
        attack: 'T1041',
        example: 'rclone / mega.nz / cloud bucket sync to attacker-controlled storage.',
      },
      {
        label: 'Ransomware deployment',
        attack: 'T1486',
        example: 'GPO push / PsExec mass-encryption across domain after staging.',
      },
      {
        label: 'Financial fraud (BEC)',
        attack: 'T1534',
        example: 'Mailbox-rule swap on CFO; rerouted invoices, wire-fraud play.',
      },
      {
        label: 'Destructive impact',
        attack: 'T1485',
        example: 'Wiper malware, snapshot deletion, account-lockout amplification.',
      },
    ],
    detection: [
      'Mass-rename / mass-write spikes per host.',
      'Outbound bandwidth anomalies; data-loss prevention triggers.',
      'Inbox-rule auditing for high-risk mailboxes (CFO, AP, IT admins).',
    ],
    controls: [
      'Immutable / off-network backups; rapid-restore drills.',
      'Network-quarantine playbooks integrated with SIEM.',
      'Out-of-band verification for any wire-instruction change.',
    ],
  },
];

export const KILL_CHAIN_TECHNIQUE_COUNT = KILL_CHAIN.reduce((n, p) => n + p.techniques.length, 0);

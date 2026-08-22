/**
 * /threatintel/unified-kill-chain -- Unified Kill Chain (UKC).
 *
 * Paul Pols' 2017 meta-framework (thesis, TU Delft / University of
 * Twente) that synthesizes the Lockheed Martin Cyber Kill Chain and
 * MITRE ATT&CK into 18 phases across three strategic cycles:
 * In (initial foothold), Through (network propagation), Out (action
 * on objectives). Non-linear: phases loop, repeat, and run in
 * parallel -- attacks are campaigns, not chains.
 *
 * This page is static (no backend roundtrip) -- the value is the
 * structured doctrine, the platform cross-links, and the concrete
 * incident walkthrough that makes the cycles visible. It follows the
 * same pattern as F3ead.tsx, F2t2ea.tsx, Ooda.tsx, KillChainV2.tsx,
 * and the other framework pages in the `frameworks` catalog group.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Crosshair,
  Search,
  FlaskConical,
  Users,
  Send,
  Bug,
  Wrench,
  EyeOff,
  Radio,
  Route,
  Map,
  TrendingUp,
  Terminal,
  KeyRound,
  MoveHorizontal,
  Database,
  Upload,
  AlertTriangle,
  Flag,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowRight,
  CircleDot,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';

// ---------------------------------------------------------------------------
// Phase model
// ---------------------------------------------------------------------------

type CycleId = 'in' | 'through' | 'out';

type PhaseId =
  | 'recon'
  | 'weaponize'
  | 'social'
  | 'delivery'
  | 'exploitation'
  | 'persistence'
  | 'evasion'
  | 'c2'
  | 'pivoting'
  | 'discovery'
  | 'privesc'
  | 'execution'
  | 'credential'
  | 'lateral'
  | 'collection'
  | 'exfiltration'
  | 'impact'
  | 'objectives';

interface Phase {
  id: PhaseId;
  number: number;
  cycle: CycleId;
  name: string;
  /** Short label for the walkthrough pills. */
  tab: string;
  short: string;
  icon: typeof Search;
  /** Hex tailwind accents per phase -- used on the loop diagram cards. */
  accent: string;
  ringClass: string;
  who: string;
  defenderGoal: string;
  description: string;
  deliverables: string[];
  pitfalls: string[];
  attackMapping: string;
  /** Optional in-platform tool the analyst can jump to from this phase. */
  platformTool?: { to: string; label: string };
}

const CYCLE_META: Record<CycleId, { label: string; blurb: string }> = {
  in: {
    label: 'In — gaining access & establishing a foothold',
    blurb: 'Phases 1–8: from recon to a working beachhead. Roughly the scope of the original Cyber Kill Chain.',
  },
  through: {
    label: 'Through — network propagation & positioning',
    blurb:
      'Phases 9–14: where modern intrusions actually live. The post-compromise activity the original chain ignored.',
  },
  out: {
    label: 'Out — achieving strategic objectives',
    blurb: 'Phases 15–18: collection, exfiltration, impact, and the strategic "why".',
  },
};

const PHASES: Phase[] = [
  // ── In cycle ────────────────────────────────────────────────────────
  {
    id: 'recon',
    number: 1,
    cycle: 'in',
    name: 'Reconnaissance',
    tab: 'Recon',
    short: 'Gathering information about the target',
    icon: Search,
    accent: 'bg-sky-500/10',
    ringClass: 'ring-sky-400/60 dark:ring-sky-500/40',
    who: 'Intel + SOC (detection is mostly passive here)',
    defenderGoal: 'Reduce attack surface and detect targeted scanning that crosses into active recon.',
    description:
      'The attacker harvests information about the target — people, technology, infrastructure, partners. In the UKC this phase also covers internal reconnaissance after a foothold, so it can repeat at any point in the campaign.',
    deliverables: ['Target profile', 'Exposed-service inventory', 'Likely access vectors'],
    pitfalls: [
      'Treating passive OSINT as undetectable — the planning it feeds is not.',
      'Forgetting recon repeats inside the network after initial access.',
    ],
    attackMapping: 'Maps to ATT&CK Reconnaissance (TA0043) + Resource Development (TA0042).',
    platformTool: { to: '/threatintel/external/awesome', label: 'OSINT / recon resources' },
  },
  {
    id: 'weaponize',
    number: 2,
    cycle: 'in',
    name: 'Weaponization',
    tab: 'Weaponize',
    short: 'Preparing attack tools and payloads',
    icon: FlaskConical,
    accent: 'bg-amber-500/10',
    ringClass: 'ring-amber-400/60 dark:ring-amber-500/40',
    who: 'Intel (mostly invisible to the defender)',
    defenderGoal: 'Make weaponized artifacts ineffective by hardening the runtime they target.',
    description:
      'Attacker pairs an exploit / capability with a deliverable artifact — maldoc, HTML-smuggling page, malicious LNK, poisoned package, ISO. Happens almost entirely on attacker infrastructure.',
    deliverables: ['Weaponized artifact inventory', 'YARA / static signatures', 'Runtime hardening checklist'],
    pitfalls: [
      'Skipping sandbox detonation of unknown attachments.',
      'Assuming application allowlisting covers everything — LOLBins slip through.',
    ],
    attackMapping: 'Maps to ATT&CK Execution (TA0002) + Defense Evasion (TA0005) technique prep.',
    platformTool: { to: '/dfir/sandbox', label: 'Malware sandbox' },
  },
  {
    id: 'social',
    number: 3,
    cycle: 'in',
    name: 'Social Engineering',
    tab: 'Social',
    short: 'Manipulating human targets',
    icon: Users,
    accent: 'bg-amber-500/10',
    ringClass: 'ring-amber-400/60 dark:ring-amber-500/40',
    who: 'SOC + awareness + email security',
    defenderGoal: 'Give users the cues and tools to refuse manipulation.',
    description:
      'An explicit phase the original chain lacks: phishing, pretexting, BEC, OAuth consent abuse, and other human-centric attacks. Separating it from Exploitation forces defenders to treat people as a distinct control surface.',
    deliverables: [
      'Phishing-adjacent telemetry (DMARC, lookalikes)',
      'Awareness cue inventory',
      'BEC / OAuth protections',
    ],
    pitfalls: [
      'Relying on the user as the only control.',
      'Missing OAuth consent abuse — no malware involved, so EDR is blind.',
    ],
    attackMapping:
      'Maps to ATT&CK Initial Access (TA0001): Phishing (T1566), Valid Accounts (T1078), OAuth abuse (T1528).',
    platformTool: { to: '/dfir/phishing', label: 'Phishing analyzer' },
  },
  {
    id: 'delivery',
    number: 4,
    cycle: 'in',
    name: 'Delivery',
    tab: 'Deliver',
    short: 'Transmitting the weaponized payload',
    icon: Send,
    accent: 'bg-cyan-500/10',
    ringClass: 'ring-cyan-400/60 dark:ring-cyan-500/40',
    who: 'SOC + mail/web security (first observable phase)',
    defenderGoal: 'Block at the boundary; if it reaches a user, give them the cues to refuse it.',
    description:
      'The artifact crosses the perimeter — email, web download, removable media, supply-chain update, or trusted partner network. This is the first phase the defender can normally observe.',
    deliverables: [
      'Blocked / allowed delivery events',
      'Phishing-adjacent telemetry',
      'User-facing cues (MOTW, browser isolation)',
    ],
    pitfalls: [
      'Blocking the known-bad but missing the novel — the attacker just changes the TLD.',
      'Relying on the user to catch it; delivery is where humans are the control.',
    ],
    attackMapping:
      'Maps to ATT&CK Initial Access (TA0001): Phishing, Drive-by, Supply Chain, External Remote Services.',
    platformTool: { to: '/dfir/phishing', label: 'Phishing analyzer' },
  },
  {
    id: 'exploitation',
    number: 5,
    cycle: 'in',
    name: 'Exploitation',
    tab: 'Exploit',
    short: 'Triggering vulnerabilities to gain execution',
    icon: Bug,
    accent: 'bg-violet-500/10',
    ringClass: 'ring-violet-400/60 dark:ring-violet-500/40',
    who: 'SOC + EDR + IR',
    defenderGoal: 'Detect the moment-of-execution; minimise blast radius via sandboxing.',
    description:
      'A vulnerability — software CVE, configuration weakness, or human decision — is triggered. The artifact transitions from "data" to "running code" inside the victim environment.',
    deliverables: ['Execution event (process tree)', 'CVE / KEV / EPSS context', 'Blast-radius assessment'],
    pitfalls: [
      'Missing the child-process anomaly (Office spawning cmd).',
      'Stopping at the alert without reconstructing the full process tree.',
    ],
    attackMapping: 'Maps to ATT&CK Execution (TA0002) incl. T1204, T1190, T1203, T1528.',
    platformTool: { to: '/dfir/cve', label: 'CVE lookup (KEV + EPSS)' },
  },
  {
    id: 'persistence',
    number: 6,
    cycle: 'in',
    name: 'Persistence',
    tab: 'Persist',
    short: 'Maintaining access across reboots and credential changes',
    icon: Wrench,
    accent: 'bg-emerald-500/10',
    ringClass: 'ring-emerald-400/60 dark:ring-emerald-500/40',
    who: 'IR + DFIR (first clearly forensic phase)',
    defenderGoal: 'Catch persistence creation in real time; detect anomalies on next boot/login.',
    description:
      'The attacker installs persistence so they survive reboots, password resets, and short attention spans. Often the first phase that creates clearly forensic artifacts on disk / in identity stores.',
    deliverables: [
      'Persistence mechanisms (services, autoruns, accounts, webshells)',
      'Sysmon / audit-log deltas',
      'Forensic artifacts',
    ],
    pitfalls: [
      'Missing the new account or scheduled task until it is too late.',
      'Assuming patching the entry vector removes the persistence.',
    ],
    attackMapping: 'Maps to ATT&CK Persistence (TA0003) + Privilege Escalation (TA0004) techniques.',
    platformTool: { to: '/dfir/winreg', label: 'Windows registry artifacts' },
  },
  {
    id: 'evasion',
    number: 7,
    cycle: 'in',
    name: 'Defense Evasion',
    tab: 'Evasion',
    short: 'Avoiding detection by security controls',
    icon: EyeOff,
    accent: 'bg-violet-500/10',
    ringClass: 'ring-violet-400/60 dark:ring-violet-500/40',
    who: 'SOC + EDR tuning',
    defenderGoal: 'Close the evasion gaps in detection coverage; tune out noise so alerts stay meaningful.',
    description:
      'The attacker actively works to stay hidden — disabling logs, tampering with EDR, obfuscating payloads, using living-off-the-land binaries. Evasion is continuous across the whole campaign, not a single step.',
    deliverables: ['Evasion-technique inventory observed', 'Detection-gap list', 'Log-integrity assessment'],
    pitfalls: [
      'Assuming EDR sees everything — evasion is the norm, not the exception.',
      'Over-tuning detections until they only catch the previous campaign.',
    ],
    attackMapping: 'Maps to ATT&CK Defense Evasion (TA0005) incl. T1070, T1562, T1027.',
    platformTool: { to: '/dfir/yara', label: 'YARA manager' },
  },
  {
    id: 'c2',
    number: 8,
    cycle: 'in',
    name: 'Command & Control',
    tab: 'C2',
    short: 'Establishing communication channels',
    icon: Radio,
    accent: 'bg-cyan-500/10',
    ringClass: 'ring-cyan-400/60 dark:ring-cyan-500/40',
    who: 'SOC + network monitoring',
    defenderGoal: 'Detect beaconing patterns and unusual cloud traffic; sever the channel.',
    description:
      'The implant calls home for instructions. Modern C2 hides in HTTPS to popular CDNs, DNS, MQTT, or trusted SaaS (Slack, Discord, Telegram bots). The longest-duration phase of an intrusion.',
    deliverables: [
      'Beaconing timeline (jitter, JA3/JA4)',
      'C2 domain / IP inventory',
      'Egress-block / sinkhole candidates',
    ],
    pitfalls: [
      'Missing low-and-slow beacons in the noise of legit CDN traffic.',
      'Blocking the beacon but not the actor — they rotate infrastructure.',
    ],
    attackMapping: 'Maps to ATT&CK Command and Control (TA0011) incl. T1071, T1102, T1573.',
    platformTool: { to: '/threatintel/iocs/c2', label: 'C2 tracker' },
  },

  // ── Through cycle ───────────────────────────────────────────────────
  {
    id: 'pivoting',
    number: 9,
    cycle: 'through',
    name: 'Pivoting',
    tab: 'Pivot',
    short: 'Using compromised systems as a launching point',
    icon: Route,
    accent: 'bg-emerald-500/10',
    ringClass: 'ring-emerald-400/60 dark:ring-emerald-500/40',
    who: 'SOC + threat hunting',
    defenderGoal: 'Detect tunnel-through-host traffic — the chokepoint between network segments.',
    description:
      'The act of tunneling traffic through a compromised system to reach systems not directly accessible. UKC makes Pivoting a distinct, critical phase: pivot points are forced by network segmentation and highly observable.',
    deliverables: [
      'Pivot-path map (host-to-host tunnels)',
      'Segment-crossing detection points',
      'Containment candidates',
    ],
    pitfalls: [
      'Not segmenting — with flat networks there is no pivot to detect.',
      'Only watching north-south traffic while the actor tunnels east-west.',
    ],
    attackMapping: 'Maps to ATT&CK Lateral Movement (TA0008) infra, e.g. T1090 proxy / T1572 protocol tunneling.',
    platformTool: { to: '/dfir/threat-hunt', label: 'Threat hunt workbench' },
  },
  {
    id: 'discovery',
    number: 10,
    cycle: 'through',
    name: 'Discovery',
    tab: 'Discover',
    short: 'Mapping the internal network',
    icon: Map,
    accent: 'bg-emerald-500/10',
    ringClass: 'ring-emerald-400/60 dark:ring-emerald-500/40',
    who: 'SOC + threat hunting',
    defenderGoal: 'Detect internal enumeration before the actor finds the crown jewels.',
    description:
      'Internal recon: mapping the network, identifying assets, users, and data locations. Adversaries typically cycle Discovery → Credential Access → Lateral Movement → Discovery repeatedly.',
    deliverables: [
      'Enumeration events (AD queries, scans)',
      'Asset + data-location map',
      'Detection coverage for internal queries',
    ],
    pitfalls: [
      'No baseline of normal internal enumeration — so abnormal queries are invisible.',
      'Missing AD query logging (LDAP, PowerShell).',
    ],
    attackMapping: 'Maps to ATT&CK Discovery (TA0007) incl. T1087, T1069, T1018.',
    platformTool: { to: '/dfir/threat-hunt', label: 'Threat hunt workbench' },
  },
  {
    id: 'privesc',
    number: 11,
    cycle: 'through',
    name: 'Privilege Escalation',
    tab: 'Privesc',
    short: 'Obtaining higher-level access rights',
    icon: TrendingUp,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'IR + SOC',
    defenderGoal: 'Detect privilege escalation (UAC bypass, token theft, misconfigs) in real time.',
    description:
      'The attacker raises their access — UAC bypass, token manipulation, vulnerable drivers, misconfigured services. Each escalation widens the blast radius and unlocks more of the network.',
    deliverables: [
      'Privilege-escalation events (UAC bypass, token ops)',
      'Misconfiguration inventory',
      'Tier-0 exposure assessment',
    ],
    pitfalls: [
      'Missing the UAC bypass or service-misconfig escalation.',
      'Not treating Tier-0 accounts as the crown jewels they are.',
    ],
    attackMapping: 'Maps to ATT&CK Privilege Escalation (TA0004) incl. T1548, T1134, T1068.',
    platformTool: { to: '/dfir/iam-hub', label: 'IAM & RBAC hub' },
  },
  {
    id: 'execution',
    number: 12,
    cycle: 'through',
    name: 'Execution',
    tab: 'Execute',
    short: 'Running malicious code on additional systems',
    icon: Terminal,
    accent: 'bg-emerald-500/10',
    ringClass: 'ring-emerald-400/60 dark:ring-emerald-500/40',
    who: 'SOC + EDR',
    defenderGoal: 'Correlate execution events across hosts into a single campaign timeline.',
    description:
      'Running malicious code on systems beyond the beachhead — scheduled tasks, WMI, PsExec, service creation. In the UKC this is a distinct post-compromise phase, not just the initial exploit.',
    deliverables: ['Cross-host execution timeline', 'Process-tree correlation', 'Living-off-the-land usage inventory'],
    pitfalls: [
      'Treating each host\u2019s execution as an isolated alert instead of one campaign.',
      'Missing scheduled-task and WMI-based execution entirely.',
    ],
    attackMapping: 'Maps to ATT&CK Execution (TA0002) incl. T1053, T1047, T1569.',
    platformTool: { to: '/dfir/evtx', label: 'EVTX parser' },
  },
  {
    id: 'credential',
    number: 13,
    cycle: 'through',
    name: 'Credential Access',
    tab: 'Creds',
    short: 'Harvesting passwords and authentication materials',
    icon: KeyRound,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'IR + SOC + identity teams',
    defenderGoal: 'Detect credential dumping and replay before accounts are abused at scale.',
    description:
      'Harvesting passwords, hashes, tokens, and Kerberos tickets — LSASS dumping, NTDS extraction, SAM/SECURITY hives, browser credential stores, cloud token theft.',
    deliverables: ['Credential-theft events (LSASS, NTDS, token)', 'Exposed-account list', 'Credential-rotation plan'],
    pitfalls: [
      'Missing LSASS access (Mimikatz, comsvcs) without the right EDR rules.',
      'Leaving service accounts unmonitored — the favourite credential target.',
    ],
    attackMapping: 'Maps to ATT&CK Credential Access (TA0006) incl. T1003, T1555, T1528.',
    platformTool: { to: '/dfir/iam-hub', label: 'IAM & RBAC hub' },
  },
  {
    id: 'lateral',
    number: 14,
    cycle: 'through',
    name: 'Lateral Movement',
    tab: 'Lateral',
    short: 'Spreading across the network to reach targets',
    icon: MoveHorizontal,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'SOC + threat hunting + IR',
    defenderGoal: 'Detect and sever east-west movement before the actor reaches the objective.',
    description:
      'The pivot from the beachhead to other hosts — pass-the-hash, remote services, scheduled-task hijacking. Most ransomware intrusions are lateral-movement-first.',
    deliverables: [
      'Movement timeline (host-to-host, account-to-account)',
      'Containment decision (segment, isolate, rotate)',
    ],
    pitfalls: [
      'Only hunting north-south traffic while the actor moves east-west.',
      'Not correlating the reused credential across hosts.',
    ],
    attackMapping: 'Maps to ATT&CK Lateral Movement (TA0008) + Credential Access (TA0006) techniques.',
    platformTool: { to: '/dfir/threat-hunt', label: 'Threat hunt workbench' },
  },

  // ── Out cycle ───────────────────────────────────────────────────────
  {
    id: 'collection',
    number: 15,
    cycle: 'out',
    name: 'Collection',
    tab: 'Collect',
    short: 'Gathering target data from compromised systems',
    icon: Database,
    accent: 'bg-amber-500/10',
    ringClass: 'ring-amber-400/60 dark:ring-amber-500/40',
    who: 'SOC + DLP + IR',
    defenderGoal: 'Detect mass-staging and sensitive-data access before it leaves.',
    description:
      'The attacker gathers data of interest — archives of file shares, mailboxes, databases, source repos. Collection breaks confidentiality and is usually a precursor to exfiltration.',
    deliverables: ['Mass-access / staging events', 'Sensitive-data exposure assessment', 'DLP trigger review'],
    pitfalls: [
      'No visibility into who is reading what (no data-access baselines).',
      'Treating collection as benign — it is the objective in espionage.',
    ],
    attackMapping: 'Maps to ATT&CK Collection (TA0009) incl. T1005, T1039, T1560.',
    platformTool: { to: '/dfir/dlp-scan', label: 'DLP scan' },
  },
  {
    id: 'exfiltration',
    number: 16,
    cycle: 'out',
    name: 'Exfiltration',
    tab: 'Exfil',
    short: 'Moving collected data out of the environment',
    icon: Upload,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'SOC + DLP + network monitoring',
    defenderGoal: 'Detect unusual outbound data movement and sever it.',
    description:
      'Moving collected data out — rclone to cloud storage, DNS tunneling, HTTPS to attacker infrastructure, mail forwarding. Often the phase where the defender gets the last clean chance to stop the mission.',
    deliverables: ['Outbound data-movement events', 'Exfil-channel assessment', 'Egress-block candidates'],
    pitfalls: [
      'Not monitoring egress volume / unusual destinations.',
      'Missing slow-and-low exfil in normal-looking HTTPS.',
    ],
    attackMapping: 'Maps to ATT&CK Exfiltration (TA0010) incl. T1041, T1567, T1048.',
    platformTool: { to: '/dfir/blocklists', label: 'Blocklists (exportable)' },
  },
  {
    id: 'impact',
    number: 17,
    cycle: 'out',
    name: 'Impact',
    tab: 'Impact',
    short: 'Disrupting operations, destroying data, or deploying ransomware',
    icon: AlertTriangle,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'IR + SecOps + leadership',
    defenderGoal: 'Detect mass-encryption / destruction bursts; rapid isolation.',
    description:
      'Disrupting operations, destroying data, or deploying ransomware. Impact breaks integrity (data manipulation) or availability (encryption, wiping) — the CIA-triad counterpart to Collection/Exfiltration.',
    deliverables: ['Mass-rename / encryption event', 'Isolation / containment executed', 'Backup-restore assessment'],
    pitfalls: [
      'No immutable backups — recovery becomes negotiation.',
      'Waiting to isolate while the encryptor spreads.',
    ],
    attackMapping: 'Maps to ATT&CK Impact (TA0040) incl. T1486, T1485, T1490.',
    platformTool: { to: '/dfir/ir-playbooks', label: 'IR playbooks' },
  },
  {
    id: 'objectives',
    number: 18,
    cycle: 'out',
    name: 'Objectives',
    tab: 'Objectives',
    short: 'Achieving the overarching strategic goal',
    icon: Flag,
    accent: 'bg-emerald-500/10',
    ringClass: 'ring-emerald-400/60 dark:ring-emerald-500/40',
    who: 'CTI + leadership',
    defenderGoal: 'Understand the "why" to predict the next move and prioritise defences.',
    description:
      "The strategic 'why' behind the attack. If the objective is espionage, expect targeting of databases and file shares; if sabotage, industrial control systems. Understanding the objective lets you predict the attack path.",
    deliverables: [
      'Objective assessment (espionage / fraud / sabotage)',
      'Strategic-intelligence report',
      'Predictive defence priorities',
    ],
    pitfalls: [
      'Stopping at the technical timeline without asking why.',
      'Treating the incident as isolated when it is one campaign of many.',
    ],
    attackMapping: 'The strategic layer above ATT&CK — objectives drive the techniques chosen.',
    platformTool: { to: '/threatintel/ach', label: 'ACH (analyze competing hypotheses)' },
  },
];

// ---------------------------------------------------------------------------
// Lazarus / Copperhedge walkthrough (drawn from the existing
// src/data/threatintel/sample-reports.ts so the example is real and
// already part of the codebase -- no fabricated CTI).
// ---------------------------------------------------------------------------

interface WalkStep {
  phase: PhaseId;
  title: string;
  prompt: string;
  artifacts: string[];
}

const WALK: WalkStep[] = [
  {
    phase: 'recon',
    title: 'Scanning the React/Next.js surface',
    prompt:
      'A partner feed + a CTF IoC report named Lazarus exploiting CVE-2025-55182. The WAF + load balancer logs show the list.txt scanning pattern hitting our Next.js 15.x prod apps.',
    artifacts: ['Target profile: 3 prod apps + 1 staging', 'Access vectors: RSC deserialization RCE'],
  },
  {
    phase: 'delivery',
    title: 'The inbound POST',
    prompt:
      'A follow-up POST to the Next.js app triggers the RSC deserialization RCE. It looks like normal app traffic to WAF rules — it is the delivery of the weapon.',
    artifacts: ['POST captured in app logs', 'WAF rule gap noted'],
  },
  {
    phase: 'persistence',
    title: 'Persistence via MsSecurityObj mutex + registry',
    prompt:
      'The loader installs persistence: the MsSecurityObj mutex, a registry Run key, and the Akagi64 UAC-bypass binary. Sysmon Event ID 13 (registry) fires.',
    artifacts: ['Persistence inventory (mutex, registry key)', 'Sysmon delta for the host'],
  },
  {
    phase: 'c2',
    title: 'ChaCha20/HTTP beaconing',
    prompt:
      'The implant checks in over ChaCha20/HTTP to a rotating set of C2 domains. Egress telemetry shows the beacon jitter and JA3 fingerprint.',
    artifacts: ['C2 rotation timeline + JA3', 'Egress-block candidates'],
  },
  {
    phase: 'pivoting',
    title: 'MultiRelay pivot through a jump host',
    prompt:
      'The actor tunnels through a compromised app host to reach internal segments — the pivot chokepoint between DMZ and internal network.',
    artifacts: ['Pivot-path map', 'Segment-crossing detection point identified'],
  },
  {
    phase: 'privesc',
    title: 'Akagi64 UAC bypass',
    prompt: 'The Akagi64 binary runs the UAC bypass to elevate the implant from user to admin on the beachhead host.',
    artifacts: ['UAC-bypass event', 'Elevated-process inventory'],
  },
  {
    phase: 'lateral',
    title: 'SMB relay across 3 prod hosts',
    prompt:
      'The actor uses the MultiRelay lateral-movement tool: SMB relay to 3 other hosts using harvested credentials. This is where the intrusion becomes an incident.',
    artifacts: ['Movement timeline: beachhead -> 3 prod hosts', 'Credential-exposure assessment'],
  },
  {
    phase: 'exfiltration',
    title: 'Staging + exfil prep',
    prompt:
      'The actor stages corporate data for exfiltration. We isolate the 3 prod apps, rotate secrets, and deploy the patch. The campaign question: is the staging app next? (It is — 12h later.)',
    artifacts: ['Containment + eradication evidence', 'Campaign hypothesis: staging surface re-targeted'],
  },
];

// ---------------------------------------------------------------------------
// Comparison table: UKC vs. the other frameworks on the platform
// ---------------------------------------------------------------------------

interface FrameworkRow {
  name: string;
  kind: 'process' | 'content';
  question: string;
  primaryUser: string;
  /** Optional -- frameworks without a dedicated platform page render as "—". */
  platformPage?: string;
  note: string;
}

const COMPARISON: FrameworkRow[] = [
  {
    name: 'Unified Kill Chain',
    kind: 'content',
    question: 'What phases did the campaign pass through, across all three cycles?',
    primaryUser: 'CTI + DFIR + SOC',
    platformPage: '/threatintel/unified-kill-chain',
    note: 'The meta-framework: 18 phases in In / Through / Out cycles, non-linear.',
  },
  {
    name: 'Cyber Kill Chain v2',
    kind: 'content',
    question: 'How do multiple intrusions and lateral movement fit the chain?',
    primaryUser: 'DFIR + SOC',
    platformPage: '/threatintel/kill-chain-v2',
    note: 'The Lockheed extension UKC supersedes — UKC adds the Through cycle and social engineering.',
  },
  {
    name: 'Lockheed Kill Chain',
    kind: 'content',
    question: 'What phases did the intrusion pass through?',
    primaryUser: 'DFIR + SOC',
    platformPage: '/dfir/kill-chain',
    note: 'The original 7-phase chain — the UKC\u2019s In cycle roughly matches its scope.',
  },
  {
    name: 'MITRE ATT&CK',
    kind: 'content',
    question: 'Which specific techniques did the adversary use?',
    primaryUser: 'Detection eng + CTI',
    platformPage: '/threatintel/mitre',
    note: 'The technique vocabulary — each UKC phase maps onto ATT&CK tactics.',
  },
  {
    name: 'F3EAD',
    kind: 'process',
    question: 'How does the team operate end-to-end on a target?',
    primaryUser: 'CTI + SOC + IR',
    platformPage: '/threatintel/f3ead',
    note: 'The workflow the team runs; the UKC describes what the actor did.',
  },
  {
    name: 'F2T2EA',
    kind: 'process',
    question: 'How do we locate, track, and act on a target?',
    primaryUser: 'Ops + IR (targeting)',
    platformPage: '/threatintel/f2t2ea',
    note: 'Joint targeting cycle — the ops side of the same fight.',
  },
  {
    name: 'OODA Loop',
    kind: 'process',
    question: 'How fast can we decide and act?',
    primaryUser: 'IR + SOC (tempo)',
    platformPage: '/threatintel/ooda',
    note: "Boyd's decision cycle — the tempo at which the team responds to the campaign.",
  },
  {
    name: 'Diamond Model',
    kind: 'content',
    question: 'Who did what to whom, and how?',
    primaryUser: 'CTI + IR',
    platformPage: '/dfir/diamond',
    note: 'Per-event reconstruction that fills in the who behind the campaign.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UnifiedKillChain(): JSX.Element {
  const [openPhase, setOpenPhase] = useState<PhaseId | null>('recon');
  const [walkStep, setWalkStep] = useState<number>(0);

  const currentWalk = WALK[walkStep]!;
  const currentPhase = PHASES.find((p) => p.id === currentWalk.phase)!;
  const WalkIcon = currentPhase.icon;

  const cycles: CycleId[] = ['in', 'through', 'out'];

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Crosshair size={28} />}
      title="Unified Kill Chain: In → Through → Out (18 phases)"
      description={
        <>
          Paul Pols' 2017 meta-framework that synthesizes the Lockheed Cyber Kill Chain and MITRE ATT&CK into{' '}
          <strong>18 phases</strong> across three strategic cycles — <strong>In</strong> (gaining access),{' '}
          <strong>Through</strong> (network propagation), <strong>Out</strong> (achieving objectives). The key insight:{' '}
          attacks are <em>campaigns, not chains</em> — phases loop, repeat, and run in parallel, and half the model
          covers the post-compromise activity the original chain ignored.
        </>
      }
      maxWidthClass="max-w-7xl"
    >
      {/* ── The cycle diagram ─────────────────────────────────────────── */}
      <section className="mb-12">
        <header className="flex items-end justify-between mb-4">
          <h2 className="text-xl font-display font-semibold text-heading">The three UKC cycles</h2>
          <p className="text-xs font-mono text-muted hidden sm:block">
            in &rarr; through &rarr; out &middot; non-linear, loops allowed
          </p>
        </header>

        {cycles.map((cycle) => (
          <div key={cycle} className="mb-6">
            <div className="mb-2">
              <h3 className="text-sm font-display font-semibold text-body">{CYCLE_META[cycle].label}</h3>
              <p className="text-xs text-muted">{CYCLE_META[cycle].blurb}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 relative">
              {PHASES.filter((p) => p.cycle === cycle).map((p) => {
                const Icon = p.icon;
                return (
                  <div key={p.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenPhase(openPhase === p.id ? null : p.id)}
                      className={`w-full text-left surface-card p-4 ring-1 ${p.ringClass} hover:shadow-e1 transition-shadow`}
                    >
                      <div className={`absolute inset-0 rounded-xl ${p.accent} pointer-events-none opacity-60`} />
                      <div className="relative flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-xs font-mono text-body">
                            {p.number}
                          </span>
                          <Icon className="h-4 w-4 text-body" />
                        </div>
                        {openPhase === p.id ? (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        )}
                      </div>
                      <div className="relative mt-2">
                        <h3 className="text-base font-semibold text-heading">{p.name}</h3>
                        <p className="text-xs text-muted mt-0.5">{p.short}</p>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Expanded phase detail */}
        {openPhase &&
          (() => {
            const p = PHASES.find((x) => x.id === openPhase)!;
            const PIcon = p.icon;
            return (
              <div className="mt-4 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className={`rounded p-2 ring-1 ${p.ringClass} bg-white dark:bg-[rgb(var(--surface-200))]`}>
                    <PIcon className="h-5 w-5 text-body" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-heading">
                      {p.number}. {p.name} &mdash; {p.short}
                    </h3>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted mt-0.5">
                      {CYCLE_META[p.cycle].label}
                    </p>
                    <p className="text-sm text-muted mt-1">{p.description}</p>
                    <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <dt className="font-mono uppercase tracking-wider text-muted">Who</dt>
                        <dd className="text-heading">{p.who}</dd>
                      </div>
                      <div>
                        <dt className="font-mono uppercase tracking-wider text-muted">Defender goal</dt>
                        <dd className="text-heading">{p.defenderGoal}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-mono uppercase tracking-wider text-muted">Primary deliverables</dt>
                        <dd>
                          <ul className="mt-1 space-y-0.5">
                            {p.deliverables.map((d) => (
                              <li key={d} className="flex items-start gap-1.5 text-heading">
                                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-mono uppercase tracking-wider text-muted">Common pitfalls</dt>
                        <dd>
                          <ul className="mt-1 space-y-0.5">
                            {p.pitfalls.map((d) => (
                              <li key={d} className="flex items-start gap-1.5 text-heading">
                                <CircleDot className="h-3.5 w-3.5 mt-0.5 text-rose-600 dark:text-rose-300 shrink-0" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-mono uppercase tracking-wider text-muted">Framework mapping</dt>
                        <dd className="text-heading">{p.attackMapping}</dd>
                      </div>
                    </dl>
                    {p.platformTool && (
                      <div className="mt-4">
                        <Link
                          to={p.platformTool.to}
                          className="inline-flex items-center gap-1.5 rounded border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-mono text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60"
                        >
                          <Wrench className="h-3.5 w-3.5" /> Use platform tool: {p.platformTool.label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
      </section>

      {/* ── Incident walkthrough ─────────────────────────────────────── */}
      <section className="mb-12">
        <header className="mb-4">
          <h2 className="text-xl font-display font-semibold text-heading">Walk an incident through the UKC</h2>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            An 8-step click-through using the Lazarus / Copperhedge sample already in the platform's
            <Link to="/threatintel/research-hub/ai" className="text-rose-600 dark:text-rose-400 hover:underline mx-1">
              AI Report showcase
            </Link>
            as the running example — covering all three cycles. Click a step to jump to that phase.
          </p>
        </header>

        <div className="surface-card p-5">
          <div className="flex flex-wrap gap-1.5 mb-4">
            {WALK.map((w, i) => {
              const phase = PHASES.find((p) => p.id === w.phase)!;
              const PIcon = phase.icon;
              const active = i === walkStep;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setWalkStep(i)}
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-mini font-mono transition-colors ${
                    active
                      ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                      : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] text-muted hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
                  }`}
                >
                  <span className="opacity-70">{phase.number}</span>
                  <PIcon className="h-3 w-3" />
                  {phase.tab}
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-3 mb-3">
            <div className={`rounded p-2 ring-1 ${currentPhase.ringClass} bg-slate-50 dark:bg-[rgb(var(--input-200))]`}>
              <WalkIcon className="h-5 w-5 text-body" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-micro font-mono uppercase tracking-wider text-muted">
                Step {walkStep + 1} of {WALK.length} &middot; {currentPhase.name} &middot;{' '}
                {CYCLE_META[currentPhase.cycle].label.split('—')[0]!.trim()}
              </p>
              <h3 className="text-base font-semibold text-heading mt-0.5">{currentWalk.title}</h3>
              <p className="text-sm text-muted mt-1">{currentWalk.prompt}</p>
            </div>
          </div>

          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3">
            <p className="text-micro font-mono uppercase tracking-wider text-muted mb-1.5">
              Artifacts produced at this step
            </p>
            <ul className="space-y-1">
              {currentWalk.artifacts.map((a) => (
                <li key={a} className="flex items-start gap-1.5 text-xs text-heading">
                  <CircleDot className="h-3 w-3 mt-0.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setWalkStep((s) => Math.max(0, s - 1))}
              disabled={walkStep === 0}
              className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-3 py-1 text-xs font-mono text-body hover:border-rose-400 disabled:opacity-40 disabled:hover:border-slate-300 dark:disabled:hover:border-[rgb(var(--border-400))]"
            >
              &larr; previous
            </button>
            <p className="text-micro font-mono uppercase tracking-wider text-muted">
              {walkStep < WALK.length - 1
                ? `next: ${PHASES.find((p) => p.id === WALK[walkStep + 1]!.phase)!.tab}`
                : 'campaign complete -- the cycle loops: Out feeds the next In'}
            </p>
            <button
              type="button"
              onClick={() => setWalkStep((s) => Math.min(WALK.length - 1, s + 1))}
              disabled={walkStep === WALK.length - 1}
              className="rounded border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 px-3 py-1 text-xs font-mono text-rose-700 dark:text-rose-300 hover:bg-rose-100 disabled:opacity-40"
            >
              next &rarr;
            </button>
          </div>
        </div>
      </section>

      {/* ── Comparison table ─────────────────────────────────────────── */}
      <section className="mb-12">
        <header className="mb-4">
          <h2 className="text-xl font-display font-semibold text-heading">
            UKC vs. the other frameworks on the platform
          </h2>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            The UKC is a <strong>content</strong> meta-framework — it describes the campaign at 18-phase granularity. It
            does not replace ATT&CK (the technique vocabulary) or the process frameworks (F3EAD, F2T2EA, OODA); it feeds
            them with a complete picture of the adversary's lifecycle.
          </p>
        </header>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
          <DataTable
            columns={
              [
                {
                  key: 'name',
                  header: 'Framework',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.name,
                  render: (row) => <span className="font-semibold text-heading whitespace-nowrap">{row.name}</span>,
                },
                {
                  key: 'kind',
                  header: 'Kind',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.kind,
                  render: (row) => (
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-micro font-mono uppercase tracking-wider ${row.kind === 'process' ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-body'}`}
                    >
                      {row.kind}
                    </span>
                  ),
                },
                {
                  key: 'question',
                  header: 'What it answers',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.question,
                  render: (row) => <span className="text-body">{row.question}</span>,
                },
                {
                  key: 'primaryUser',
                  header: 'Primary user',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.primaryUser,
                  render: (row) => <span className="text-body whitespace-nowrap">{row.primaryUser}</span>,
                },
                {
                  key: 'platformPage',
                  header: 'On the platform',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.platformPage,
                  render: (row) =>
                    row.platformPage ? (
                      <Link
                        to={row.platformPage}
                        className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:underline font-mono text-xs"
                      >
                        {row.platformPage.replace('/threatintel/', '/ti/').replace('/dfir/', '/d/')}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">&mdash;</span>
                    ),
                },
                {
                  key: 'note',
                  header: 'Note',
                  render: (row) => <span className="text-muted text-xs">{row.note}</span>,
                },
              ] as DataTableColumn<(typeof COMPARISON)[number]>[]
            }
            rows={COMPARISON}
            rowKey={(row) => row.name}
            rowClassName={() =>
              '[&:nth-child(even)]:bg-slate-50/50 dark:[&:nth-child(even)]:bg-[rgb(var(--input-200)/0.5)]'
            }
          />
        </div>
      </section>

      {/* ── References ──────────────────────────────────────────────── */}
      <section>
        <header className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold text-heading">References</h2>
        </header>
        <ul className="space-y-1.5 text-xs text-muted">
          <li>
            <strong className="text-heading">Paul Pols — "The Unified Kill Chain" (2017)</strong> &mdash; the thesis (TU
            Delft / University of Twente) that defined the 18-phase model. See also{' '}
            <Link to="/threatintel/kill-chain-v2" className="text-rose-600 dark:text-rose-400 hover:underline">
              Cyber Kill Chain v2
            </Link>{' '}
            for the Lockheed-side lineage.
          </li>
          <li>
            <strong className="text-heading">
              Hutchins, Cloppert, Amin — "Intelligence-Driven Computer Network Defense..." (2011)
            </strong>{' '}
            &mdash; the original Cyber Kill Chain the UKC builds on.
          </li>
          <li>
            <strong className="text-heading">MITRE ATT&CK</strong> &mdash; the technique vocabulary the UKC's phases map
            onto.
          </li>
          <li>
            <strong className="text-heading">
              NIST SP 800-61 rev 2 &mdash; Computer Security Incident Handling Guide
            </strong>{' '}
            &mdash; the IR phases aligned with the Through and Out cycles.
          </li>
          <li>
            <strong className="text-heading">
              MITRE ATT&CK Blog: "F3EAD: Operationalizing Cyber Threat Intelligence" (2018)
            </strong>{' '}
            &mdash; connects campaign-level content to the F3EAD process workflow on this platform.
          </li>
        </ul>
      </section>
    </DataPageLayout>
  );
}

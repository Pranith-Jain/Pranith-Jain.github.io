import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  ExternalLink,
  Shield,
  Target,
  ArrowRight,
  Link2,
  AlertTriangle,
  TrendingUp,
  CheckCircle,
  Zap,
  Layers,
} from 'lucide-react';
import { sanitizeUrl } from '../../lib/sanitize-url';

type Tab = 'chokepoints' | 'framework' | 'chains' | 'cross-chain' | 'trends';
type Priority = 'CRITICAL' | 'HIGH';
type FPLevel = 'Pre-Exec' | 'High FP' | 'Medium FP' | 'Low FP';
type Maturity = 'Research' | 'Hunt' | 'Analyst';
type ChainId = 'ransomware' | 'infostealer' | 'aitm' | 'hypervisor' | 'identity';
type TrendId = 'clickfix' | 'edge-exploits' | 'masq-infra';

const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
  { id: 'chokepoints', label: 'Chokepoints', icon: Shield },
  { id: 'framework', label: 'Framework', icon: Layers },
  { id: 'chains', label: 'Attack Chains', icon: Zap },
  { id: 'cross-chain', label: 'Cross-Chain', icon: Link2 },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
];

// ═══════════════════════════════════════════════════════════════════
// CHOKEPOINTS DATA
// ═══════════════════════════════════════════════════════════════════

interface Chokepoint {
  name: string;
  priority: Priority;
  techniques: string[];
  fpLevel: FPLevel;
  maturity: Maturity;
  description: string;
  tags: string[];
}

const CHOKEPOINTS: Chokepoint[] = [
  {
    name: 'AiTM WebSocket Kit Relay',
    priority: 'CRITICAL',
    techniques: ['T1539', 'T1078.004'],
    fpLevel: 'Pre-Exec',
    maturity: 'Hunt',
    description:
      'Adversary-in-the-Middle proxy relay via WebSocket-based phishing kits. Intercepts session tokens and MFA codes in real time, bypassing push-based MFA.',
    tags: ['aitm', 'mfa-bypass', 'phishing', 'session-theft'],
  },
  {
    name: 'Infostealer Browser Credential Theft',
    priority: 'CRITICAL',
    techniques: ['T1555.003', 'T1539', 'T1041'],
    fpLevel: 'Pre-Exec',
    maturity: 'Analyst',
    description:
      'Browser credential and cookie exfiltration by commodity infostealers (Lumma, Raccoon, RedLine). Targets cookie stores, saved passwords, and session tokens.',
    tags: ['infostealer', 'credentials', 'cookies', 'browser'],
  },
  {
    name: 'LSASS Credential Dumping',
    priority: 'CRITICAL',
    techniques: ['T1003.001', 'T1003', 'T1547.005'],
    fpLevel: 'High FP',
    maturity: 'Analyst',
    description:
      'LSASS process memory access for credential extraction. 24 documented variations across tools (Mimikatz, ProcDump, comsvcs.dll, direct syscalls).',
    tags: ['lsass', 'credentials', 'mimikatz', 'credential-dumping'],
  },
  {
    name: 'EDR Bypass Techniques',
    priority: 'CRITICAL',
    techniques: ['T1562.001', 'T1562.006', 'T1055.001'],
    fpLevel: 'Medium FP',
    maturity: 'Research',
    description:
      'Defense evasion via EDR sensor tampering — process termination, driver unloading, callback removal, and direct kernel calls.',
    tags: ['edr', 'defense-evasion', 'tampering', 'kernel'],
  },
  {
    name: 'Ransomware Service Manipulation',
    priority: 'CRITICAL',
    techniques: ['T1562.001', 'T1489'],
    fpLevel: 'Medium FP',
    maturity: 'Hunt',
    description:
      'Pre-encryption service disruption — stopping backup agents, databases, and AV services via sc.exe, net stop, or PsExec.',
    tags: ['ransomware', 'service-stop', 'backup-disable', 'pre-encryption'],
  },
  {
    name: 'Web Shell Persistence',
    priority: 'CRITICAL',
    techniques: ['T1505.003', 'T1190', 'T1059.004'],
    fpLevel: 'Medium FP',
    maturity: 'Analyst',
    description:
      'Post-exploitation web shell deployment on IIS, Apache, and Nginx. Server-side scripting persistence with command execution capability.',
    tags: ['web-shell', 'persistence', 'iis', 'server-side'],
  },
  {
    name: 'BYOSI Scripting Interpreters',
    priority: 'HIGH',
    techniques: ['T1059.006', 'T1059.007', 'T1059'],
    fpLevel: 'High FP',
    maturity: 'Analyst',
    description:
      'Bring-your-own scripting interpreters — Python, Node.js, PowerShell downloaded to disk and used for execution. Bypasses application whitelisting.',
    tags: ['scripting', 'interpreter', 'python', 'node', 'powershell'],
  },
  {
    name: 'OAuth Device Code Phishing',
    priority: 'HIGH',
    techniques: ['T1550.001'],
    fpLevel: 'Pre-Exec',
    maturity: 'Research',
    description:
      'OAuth device code flow abuse — attacker tricks user into approving a device code, granting persistent token access without password compromise.',
    tags: ['oauth', 'device-code', 'cloud', 'identity'],
  },
  {
    name: 'Graph API Reconnaissance Burst',
    priority: 'HIGH',
    techniques: ['T1087.004', 'T1069.003', 'T1526'],
    fpLevel: 'Pre-Exec',
    maturity: 'Hunt',
    description:
      'Azure/M365 Graph API enumeration — bulk user, group, and role queries from a single token. Detectable via query velocity.',
    tags: ['graph-api', 'reconnaissance', 'azure', 'entra-id'],
  },
  {
    name: 'ClickFix Techniques',
    priority: 'HIGH',
    techniques: ['T1204.004'],
    fpLevel: 'Pre-Exec',
    maturity: 'Research',
    description:
      'Social engineering via fake CAPTCHA, browser update prompts, or "copy-paste" instructions that lead to PowerShell/terminal execution.',
    tags: ['clickfix', 'social-engineering', 'captcha', 'terminal'],
  },
  {
    name: 'Renamed RMM Tools',
    priority: 'HIGH',
    techniques: ['T1219.002'],
    fpLevel: 'High FP',
    maturity: 'Analyst',
    description:
      'Remote Monitoring & Management tools (AnyDesk, ScreenConnect, TeamViewer) renamed or installed in non-standard paths.',
    tags: ['rmm', 'remote-access', 'persistence', 'renamed'],
  },
  {
    name: 'Remote Execution Tools',
    priority: 'HIGH',
    techniques: ['T1021.002', 'T1021.003', 'T1021.006'],
    fpLevel: 'Medium FP',
    maturity: 'Hunt',
    description:
      'Lateral movement via SMB/SSH/WinRM execution. PsExec, wmic, ssh.exe, and native cmdlets used for remote command execution.',
    tags: ['lateral-movement', 'smb', 'ssh', 'winrm', 'psexec'],
  },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  CRITICAL: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  HIGH: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
};
const FP_STYLES: Record<FPLevel, string> = {
  'Pre-Exec': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'Low FP': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'Medium FP': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'High FP': 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};
const MATURITY_STYLES: Record<Maturity, string> = {
  Research: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  Hunt: 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300',
  Analyst: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

// ═══════════════════════════════════════════════════════════════════
// FRAMEWORK DATA
// ═══════════════════════════════════════════════════════════════════

const STEPS = [
  {
    n: 1,
    title: 'What is this technique?',
    desc: 'Define the exact mechanism — process injection, credential theft, lateral movement protocol.',
  },
  {
    n: 2,
    title: 'What must be true?',
    desc: 'List every precondition: permissions, access, software state, network position. Candidate chokepoints.',
  },
  {
    n: 3,
    title: 'What does the attacker control?',
    desc: 'Tool choice, timing, encoding, target selection, exfil channel. Anything rotatable.',
  },
  {
    n: 4,
    title: "What can't the attacker control?",
    desc: 'The intersection of attacker goals and forced prerequisites. THIS IS THE CHOKEPOINT.',
    highlight: true,
  },
  {
    n: 5,
    title: 'Can we observe it?',
    desc: 'Map to log sources and telemetry. Sysmon event IDs, ETW providers, network artifacts, EDR hooks.',
  },
  {
    n: 6,
    title: 'What are all the variations?',
    desc: 'Map every known variant, tool, and implementation. The chokepoint must hold across families.',
  },
];

const MATURITY_LEVELS = [
  {
    level: 'Research',
    desc: 'Broad baseline, high FP, not for alerting',
    fp: 'High',
    use: 'Threat research, baselining',
    color: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
  },
  {
    level: 'Hunt',
    desc: 'Behavioral context, moderate FP, analyst triage',
    fp: 'Medium',
    use: 'Active hunting, campaign tracking',
    color: 'text-brand-700 dark:text-brand-300',
    border: 'border-brand-500/40',
    bg: 'bg-brand-500/10',
  },
  {
    level: 'Analyst',
    desc: 'Production SOC alerting, minimal FP',
    fp: 'Low',
    use: 'SOC alerting, automated IR',
    color: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/40',
    bg: 'bg-sky-500/10',
  },
];

const VALIDATION = [
  {
    q: 'Can the attacker avoid it?',
    d: 'If the attacker can achieve their objective without triggering the chokepoint, it is not durable.',
  },
  {
    q: 'Does it survive tool rotation?',
    d: 'The chokepoint must hold across tool families, not just one specific implementation.',
  },
  {
    q: 'Does it cover multiple families?',
    d: 'If multiple threat groups share the same forced prerequisite, the chokepoint has broad coverage.',
  },
  {
    q: 'Will it work in 6–12 months?',
    d: 'The chokepoint must be grounded in fundamental constraints, not implementation quirks.',
  },
];

const CONTRAST = [
  { dim: 'Durability', cp: 'Months to years', tool: 'Days to weeks' },
  { dim: 'Coverage', cp: 'Broad — all families', tool: 'Narrow — one tool' },
  { dim: 'Maintenance', cp: 'Low — rarely update', tool: 'High — constant updates' },
  { dim: 'FP Rate', cp: 'Low — attacker constraints', tool: 'Variable — often high' },
  { dim: 'Evasion', cp: 'Hard — fundamental change', tool: 'Easy — tool swap' },
];

// ═══════════════════════════════════════════════════════════════════
// ATTACK CHAINS DATA
// ═══════════════════════════════════════════════════════════════════

interface ChainStage {
  label: string;
  mitre?: string;
}
interface ThreatActor {
  name: string;
  notes?: string;
}
interface AttackChain {
  id: ChainId;
  name: string;
  color: string;
  badge: string;
  stages: ChainStage[];
  actors: ThreatActor[];
  chokepoints: number;
  avgTTR: string;
  description: string;
}

const CHAINS: AttackChain[] = [
  {
    id: 'ransomware',
    name: 'Ransomware Chain',
    color: 'rose',
    badge: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    stages: [
      { label: 'Initial Access', mitre: 'T1566' },
      { label: 'Credential Access', mitre: 'T1003' },
      { label: 'Lateral Movement', mitre: 'T1021' },
      { label: 'Defense Evasion', mitre: 'T1562' },
      { label: 'Impact', mitre: 'T1486' },
    ],
    actors: [
      { name: 'BlackBasta', notes: 'QakBot pipeline' },
      { name: 'LockBit 3.0', notes: 'RaaS affiliate' },
      { name: 'Akira', notes: 'Cisco VPN exploit' },
      { name: 'Alphv/BlackCat', notes: 'Rust-based' },
      { name: 'Play', notes: 'N-able exploit' },
    ],
    chokepoints: 5,
    avgTTR: '<24 hrs',
    description: 'End-to-end ransomware intrusion from foothold through exfiltration to encryption.',
  },
  {
    id: 'infostealer',
    name: 'Infostealer Chain',
    color: 'amber',
    badge: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    stages: [
      { label: 'Distribution', mitre: 'T1566' },
      { label: 'Execution', mitre: 'T1204' },
      { label: 'Collection', mitre: 'T1005' },
      { label: 'Exfiltration', mitre: 'T1041' },
      { label: 'Monetization', mitre: 'T1657' },
    ],
    actors: [
      { name: 'RedLine', notes: '2020-2024 dominant' },
      { name: 'LummaC2', notes: '51% market share' },
      { name: 'Vidar', notes: 'C2 + stealer' },
      { name: 'StealC', notes: 'Lightweight MaaS' },
      { name: 'Raccoon', notes: 'Long-running' },
    ],
    chokepoints: 5,
    avgTTR: 'Hours',
    description: 'Distribution → execution → credential theft → exfiltration → sale on IAB markets.',
  },
  {
    id: 'aitm',
    name: 'AiTM / Phishing Chain',
    color: 'violet',
    badge: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    stages: [
      { label: 'Lure Delivery', mitre: 'T1566' },
      { label: 'Proxy Interception', mitre: 'T1557' },
      { label: 'Token Harvest', mitre: 'T1539' },
      { label: 'Account Takeover', mitre: 'T1078' },
      { label: 'Persistence', mitre: 'T1098' },
    ],
    actors: [
      { name: 'Tycoon 2FA', notes: '62% of AiTM' },
      { name: 'Evilginx', notes: 'Open-source' },
      { name: 'EvilProxy', notes: 'Commercial' },
      { name: 'Sneaky 2FA', notes: 'Dark-themed' },
      { name: 'Device Code', notes: 'No proxy needed' },
    ],
    chokepoints: 5,
    avgTTR: 'Minutes',
    description: 'Session token theft bypassing MFA. Every kit steals the session, not the password.',
  },
  {
    id: 'hypervisor',
    name: 'Hypervisor Chain',
    color: 'sky',
    badge: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    stages: [
      { label: 'Initial Access', mitre: 'T1190' },
      { label: 'Mgmt Takeover', mitre: 'T1059' },
      { label: 'Credential Theft', mitre: 'T1552' },
      { label: 'Persistence', mitre: 'T1543' },
      { label: 'Lateral Movement', mitre: 'T1021' },
      { label: 'Impact', mitre: 'T1486' },
    ],
    actors: [
      { name: 'BRICKSTORM', notes: 'Espionage' },
      { name: 'UNC3886', notes: 'Zero-days' },
      { name: 'Scattered Spider', notes: 'Social eng' },
      { name: 'Play', notes: 'Ransomware' },
      { name: 'Alphv/BlackCat', notes: 'Rust encryptor' },
    ],
    chokepoints: 6,
    avgTTR: '393 days dwell',
    description: 'VMware vSphere compromise operating beneath guest OS where EDR cannot see.',
  },
  {
    id: 'identity',
    name: 'Identity Chain',
    color: 'emerald',
    badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    stages: [
      { label: 'Initial Access', mitre: 'T1078' },
      { label: 'Credential Access', mitre: 'T1558' },
      { label: 'Priv Escalation', mitre: 'T1484' },
      { label: 'Lateral Movement', mitre: 'T1021' },
      { label: 'Persistence', mitre: 'T1098' },
      { label: 'Impact', mitre: 'T1486' },
    ],
    actors: [
      { name: 'APT29', notes: 'SolarWinds' },
      { name: 'Storm-0501', notes: 'Hybrid pivot' },
      { name: 'Storm-2372', notes: 'Device code' },
      { name: 'Scattered Spider', notes: 'Social eng' },
      { name: 'Ransomware Ops', notes: 'IAB buyers' },
    ],
    chokepoints: 6,
    avgTTR: 'Hours',
    description: "Protocol-level invariants in Kerberos, LDAP, SAML, OAuth 2.0 that haven't changed since design.",
  },
];

// ═══════════════════════════════════════════════════════════════════
// CROSS-CHAIN DATA
// ═══════════════════════════════════════════════════════════════════

const ECOSYSTEM_LINKS = [
  {
    from: 'Infostealers',
    to: 'Ransomware',
    label: 'Credential Pipeline',
    color: 'rose',
    desc: 'Infostealer-harvested credentials sold on IAB marketplaces used as initial access for ransomware. Snowflake breach: 165+ orgs.',
  },
  {
    from: 'AiTM Kits',
    to: 'BEC / Double Extortion',
    label: 'Session Hijacking',
    color: 'amber',
    desc: 'AiTM-compromised accounts used for BEC, internal phishing, lateral movement. Session tokens bypass MFA entirely.',
  },
  {
    from: 'AiTM Kits',
    to: 'Ransomware',
    label: 'IAB Supply Chain',
    color: 'orange',
    desc: 'Scattered Spider: AiTM → Okta session → lateral movement → ransomware. Stolen accounts sold to IABs.',
  },
  {
    from: 'ClickFix',
    to: 'Infostealers',
    label: 'Delivery Vector',
    color: 'violet',
    desc: 'ClickFix is primary delivery for LummaC2 (51% surge). Clipboard paste → LOLBin chain → stealer deployment.',
  },
  {
    from: 'Renamed RMM',
    to: 'Ransomware',
    label: 'Persistence Layer',
    color: 'sky',
    desc: 'RMM tools provide persistent C2 post-compromise. Used by Akira, Scattered Spider, commodity operators.',
  },
  {
    from: 'EDR Bypass',
    to: 'Ransomware',
    label: 'Pre-Encryption',
    color: 'red',
    desc: 'BYOVD EDR killers deployed as pre-ransomware step. 54% of ransomware chains include EDR bypass.',
  },
];

const ECOSYSTEM_NODES = [
  { name: 'Infostealers', color: 'violet' },
  { name: 'Ransomware', color: 'rose' },
  { name: 'AiTM Kits', color: 'amber' },
  { name: 'ClickFix', color: 'emerald' },
  { name: 'Renamed RMM', color: 'sky' },
  { name: 'EDR Bypass', color: 'red' },
  { name: 'BEC / Double Extortion', color: 'orange' },
];

const NODE_TONE: Record<string, string> = {
  rose: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  orange: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  violet: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  sky: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  red: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const EXAMPLES = [
  {
    title: 'Snowflake Breach (2024)',
    chains: 'Infostealer → Ransomware',
    detail: 'UNC5537 used infostealer-harvested credentials for initial access to 160+ organizations via Snowflake.',
  },
  {
    title: 'RansomHub Campaign',
    chains: 'ClickFix → Stealer → IAB → Ransomware',
    detail: 'ClickFix clipboard delivery → LummaC2 stealer → credential sale → RansomHub affiliate deployment.',
  },
  {
    title: 'Scattered Spider',
    chains: 'AiTM → Okta → Lateral → Ransomware',
    detail: 'AiTM session theft → Okta admin escalation → lateral movement → Alphv/BlackCat ransomware.',
  },
  {
    title: 'MuddyWater',
    chains: 'Renamed RMM → Persistence → Espionage',
    detail: 'Atera RMM via social engineering → persistent C2 → Iranian state-sponsored espionage.',
  },
];

// ═══════════════════════════════════════════════════════════════════
// TRENDS DATA
// ═══════════════════════════════════════════════════════════════════

interface Trend {
  id: TrendId;
  title: string;
  stat: string;
  dateRange: string;
  source: string;
  findings: { title: string; detail: string }[];
  variants?: { name: string; mitre: string; signals: string[] }[];
}

const TRENDS: Trend[] = [
  {
    id: 'clickfix',
    title: 'ClickFix Delivery Chain',
    stat: '25,607 sites crawled · 22,214 malicious · 534 daily reports',
    dateRange: '2025-04-17 to 2026-06-29',
    source: 'MHaggis ClickGrab crawl data',
    findings: [
      {
        title: 'Cradle Family Evolution',
        detail: 'IWR → Curl pivot. Attackers adapting to avoid IWR-specific detections.',
      },
      {
        title: 'Evasion Acceleration',
        detail: 'Base64 encoding 18× increase. Layered obfuscation, string concatenation.',
      },
      {
        title: 'Self-Delete Emergence',
        detail: 'Commands deleting their own execution artifacts to evade forensic analysis.',
      },
      {
        title: 'CDN Staging',
        detail: 'Legitimate CDN services used for payload delivery. Blending with legitimate traffic.',
      },
    ],
    variants: [
      {
        name: 'ClickFix',
        mitre: 'T1204.002',
        signals: ['Fake browser dialog', 'Clipboard injection', 'PowerShell execution'],
      },
      {
        name: 'FileFix',
        mitre: 'T1204.002',
        signals: ['Malicious file opens', 'LNK/ISO/HTA abuse', 'Social engineering'],
      },
      {
        name: 'TerminalFix',
        mitre: 'T1059.001',
        signals: ['Clipboard paste into terminal', 'Base64 cradle chain', 'Self-deleting artifacts'],
      },
      {
        name: 'DownloadFix',
        mitre: 'T1105',
        signals: ['CDN-staged payloads', 'URL shortener redirects', 'Cloudflare Workers staging'],
      },
      {
        name: 'JackFix/GlitchFix',
        mitre: 'T1204.002',
        signals: ['Browser consent abuse', 'Fake permission dialogs', 'OAuth token theft'],
      },
      {
        name: 'WebDAV ClickFix',
        mitre: 'T1204.002',
        signals: ['WebDAV share mount', 'UNC path paste', 'Fileless execution'],
      },
      {
        name: 'InstallFix',
        mitre: 'T1204.002',
        signals: ['Cloned install pages', 'AI tool lures', 'curl|bash substitution'],
      },
      {
        name: 'Windows Terminal',
        mitre: 'T1204.004',
        signals: ['Win+X→I shortcut', 'wt.exe parent', 'Bypasses Run dialog'],
      },
      {
        name: 'DNS-based',
        mitre: 'T1204.004',
        signals: ['nslookup payload delivery', 'DNS Name field response', 'Bypasses URL filtering'],
      },
    ],
  },
  {
    id: 'edge-exploits',
    title: 'Edge Device Exploit Trends',
    stat: '15,001 exploit attempts · 25 decoy types · 40+ CVEs',
    dateRange: 'Mar 14 – Apr 13, 2026',
    source: 'Defused Cyber honeypot telemetry',
    findings: [
      {
        title: 'CitrixBleed 2 Toolkit (54%)',
        detail: 'CVE-2023-4966, CVE-2023-3519 and variants. Persistent exploitation despite patches.',
      },
      {
        title: 'CVE-2022-22536 SAP Burst',
        detail: 'Rapid-fire exploitation of SAP Internet Communication Manager. Resurgence of older CVEs.',
      },
      {
        title: 'CVE-2026-20127 Cisco SD-WAN',
        detail: 'Authentication bypass in Cisco SD-WAN vManage. Full kill chain documented.',
      },
      {
        title: 'Self-Replicating Worms',
        detail: 'Exploits chained with worm propagation. Automated lateral movement post-exploitation.',
      },
    ],
  },
  {
    id: 'masq-infra',
    title: 'Software Impersonation Infrastructure',
    stat: '5 validated hunts · 5 brands · 1,569 pipeline records',
    dateRange: '2026-02-15 to 2026-05-17',
    source: 'de-intel-pipeline + aggregate IOC pipeline',
    findings: [
      {
        title: 'Favicon-Pivot Discovery',
        detail: 'Attackers use favicon hashes to identify cloned sites and infrastructure.',
      },
      {
        title: 'JS-Gated EXE Delivery',
        detail: 'MROScanner OU cert — JavaScript gates executable downloads behind browser validation.',
      },
      {
        title: 'AI Tool Targeting',
        detail: 'ClickFix install modals targeting Claude Code CLI, NotebookLM, LM Studio via malvertising.',
      },
      {
        title: 'Post-Launch Domain Squatting',
        detail: 'Domains registered after Codex CLI and LM Studio launches for credential harvesting.',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

const CARD =
  'rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1';

export default function DetectionChokepointsHub() {
  const [tab, setTab] = useState<Tab>('chokepoints');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<Priority | 'all'>('all');
  const [fpFilter, setFpFilter] = useState<FPLevel | 'all'>('all');
  const [expandedChain, setExpandedChain] = useState<ChainId | null>(null);
  const [expandedTrend, setExpandedTrend] = useState<TrendId | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHOKEPOINTS.filter((c) => {
      if (priority !== 'all' && c.priority !== priority) return false;
      if (fpFilter !== 'all' && c.fpLevel !== fpFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.techniques.some((t) => t.toLowerCase().includes(q)) ||
        c.tags.some((t) => t.includes(q))
      );
    });
  }, [query, priority, fpFilter]);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Shield size={28} />}
      title="Detection Chokepoints"
      description="Invariant detection points in attack chains — prerequisites that attackers cannot bypass. Each chokepoint targets a forced action that generates reliable telemetry regardless of tool choice or variant."
      headerExtra={
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Source:{' '}
          <a
            href={sanitizeUrl('https://github.com/iimp0ster/detection-chokepoints') || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            iimp0ster/detection-chokepoints <ExternalLink size={11} />
          </a>{' '}
          · 13 chokepoints · 5 attack chains · 3 trend analyses
        </p>
      }
      maxWidthClass="max-w-6xl"
    >
      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap border transition-colors ${tab === t.id ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'}`}
          >
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── CHOKEPOINTS TAB ── */}
      {tab === 'chokepoints' && (
        <div className="space-y-3">
          <div className="relative">
            <Target size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chokepoint, technique, or tag…"
              className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] font-mono text-sm focus:border-brand-500/60 focus:outline-none"
              aria-label="Filter chokepoints"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 self-center mr-1">
              Priority
            </span>
            <button
              onClick={() => setPriority('all')}
              className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${priority === 'all' ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'}`}
            >
              All
            </button>
            {(['CRITICAL', 'HIGH'] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${priority === p ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'}`}
              >
                {p} <span className="opacity-60">· {CHOKEPOINTS.filter((c) => c.priority === p).length}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 self-center mr-1">
              Detection
            </span>
            {(['Pre-Exec', 'Low FP', 'Medium FP', 'High FP'] as FPLevel[]).map((f) => (
              <button
                key={f}
                onClick={() => setFpFilter(fpFilter === f ? 'all' : f)}
                className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${fpFilter === f ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {filtered.map((c) => (
              <div key={c.name} className={`${CARD} p-4`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{c.name}</h3>
                  <div className="flex gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[c.priority]}`}
                    >
                      {c.priority}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${MATURITY_STYLES[c.maturity]}`}
                    >
                      {c.maturity}
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${FP_STYLES[c.fpLevel]}`}>
                      {c.fpLevel}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{c.description}</p>
                <div className="flex flex-wrap gap-1">
                  {c.techniques.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-600 dark:text-slate-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted py-8">No chokepoints match your filters.</p>
            )}
          </div>
        </div>
      )}

      {/* ── FRAMEWORK TAB ── */}
      {tab === 'framework' && (
        <div className="space-y-8">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4">
              6-Step Chokepoint Identification
            </h2>
            <div className="space-y-2">
              {STEPS.map((s) => (
                <div key={s.n} className={`${CARD} p-4 ${s.highlight ? 'ring-2 ring-brand-500/40' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${s.highlight ? 'bg-brand-500 text-white' : 'bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-slate-600 dark:text-slate-400'}`}
                    >
                      {s.n}
                    </span>
                    <div>
                      <h3
                        className={`font-mono text-sm font-semibold ${s.highlight ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-white'}`}
                      >
                        {s.title}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Detection Maturity Model
            </h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {MATURITY_LEVELS.map((m) => (
                <div key={m.level} className={`${CARD} p-4 border-l-4 ${m.border}`}>
                  <h3 className={`font-mono text-sm font-semibold ${m.color} mb-1`}>{m.level}</h3>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">{m.desc}</p>
                  <p className="text-xs text-muted">
                    FP Rate: {m.fp} · {m.use}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4">
              4-Question Validation Test
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {VALIDATION.map((v) => (
                <div key={v.q} className={`${CARD} p-4 flex gap-3`}>
                  <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{v.q}</h3>
                    <p className="text-xs text-muted mt-0.5">{v.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Chokepoint vs Tool Detection
            </h2>
            <div className={`${CARD} overflow-hidden`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                    <th className="text-left p-3 font-mono text-xs text-muted">Dimension</th>
                    <th className="text-left p-3 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      Chokepoint
                    </th>
                    <th className="text-left p-3 font-mono text-xs text-rose-600 dark:text-rose-400">Tool</th>
                  </tr>
                </thead>
                <tbody>
                  {CONTRAST.map((r) => (
                    <tr
                      key={r.dim}
                      className="border-b border-slate-100 dark:border-[rgb(var(--surface-300))] last:border-0"
                    >
                      <td className="p-3 font-mono text-xs text-slate-900 dark:text-white">{r.dim}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">{r.cp}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">{r.tool}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ATTACK CHAINS TAB ── */}
      {tab === 'chains' && (
        <div className="space-y-3">
          <p className="text-sm text-muted mb-4">
            Same stages, different tools. Each stage is an unavoidable prerequisite — detect the prerequisite, catch any
            actor.
          </p>
          {CHAINS.map((ch) => (
            <div key={ch.id} className={`${CARD} overflow-hidden`}>
              <button
                onClick={() => setExpandedChain(expandedChain === ch.id ? null : ch.id)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-100))] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded border ${ch.badge}`}>
                    {ch.stages.length} stages
                  </span>
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{ch.name}</span>
                  <span className="text-xs text-muted font-mono">{ch.avgTTR}</span>
                </div>
                <span
                  className={`text-xs font-mono ${expandedChain === ch.id ? 'rotate-90' : ''} transition-transform`}
                >
                  ▸
                </span>
              </button>
              {expandedChain === ch.id && (
                <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] p-4 space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">{ch.description}</p>
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-wider text-muted mb-2">Kill Chain Stages</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {ch.stages.map((s, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-700 dark:text-slate-300">
                            {s.label}
                          </span>
                          {i < ch.stages.length - 1 && <ArrowRight size={10} className="text-slate-400" />}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-wider text-muted mb-2">
                      Tracked Actors ({ch.actors.length})
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {ch.actors.map((a) => (
                        <div key={a.name} className="flex items-center gap-2 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span className="font-mono text-slate-900 dark:text-white">{a.name}</span>
                          {a.notes && <span className="text-xs text-muted">— {a.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── CROSS-CHAIN TAB ── */}
      {tab === 'cross-chain' && (
        <div className="space-y-8">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4">Chain Ecosystem</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {ECOSYSTEM_NODES.map((n) => (
                <div key={n.name} className={`${CARD} p-3`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">{n.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4">Connections</h2>
            <div className="space-y-3">
              {ECOSYSTEM_LINKS.map((l, i) => (
                <div key={i} className={`${CARD} p-4`}>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${NODE_TONE[l.color]}`}>
                      {l.from}
                    </span>
                    <ArrowRight size={14} className="text-slate-400" />
                    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${NODE_TONE[l.color]}`}>{l.to}</span>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">· {l.label}</span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{l.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <AlertTriangle size={18} /> Real-World Examples
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {EXAMPLES.map((e) => (
                <div key={e.title} className={`${CARD} p-4`}>
                  <h3 className="font-mono text-sm font-semibold text-slate-900 dark:text-white mb-1">{e.title}</h3>
                  <p className="text-xs font-mono text-brand-600 dark:text-brand-400 mb-2">{e.chains}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{e.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TRENDS TAB ── */}
      {tab === 'trends' && (
        <div className="space-y-4">
          {TRENDS.map((tr) => (
            <div key={tr.id} className={`${CARD} overflow-hidden`}>
              <button
                onClick={() => setExpandedTrend(expandedTrend === tr.id ? null : tr.id)}
                className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-100))] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{tr.title}</h3>
                    <p className="text-xs text-muted font-mono mt-0.5">{tr.stat}</p>
                  </div>
                  <span
                    className={`text-xs font-mono ${expandedTrend === tr.id ? 'rotate-90' : ''} transition-transform`}
                  >
                    ▸
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">
                  {tr.dateRange} · {tr.source}
                </p>
              </button>
              {expandedTrend === tr.id && (
                <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] p-4 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {tr.findings.map((f) => (
                      <div key={f.title} className="p-3 rounded bg-slate-50 dark:bg-[rgb(var(--surface-100))]">
                        <h4 className="font-mono text-xs font-semibold text-slate-900 dark:text-white mb-1">
                          {f.title}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{f.detail}</p>
                      </div>
                    ))}
                  </div>
                  {tr.variants && (
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-muted mb-2">
                        Variants ({tr.variants.length})
                      </h4>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {tr.variants.map((v) => (
                          <div key={v.name} className="p-2 rounded bg-slate-50 dark:bg-[rgb(var(--surface-100))]">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                                {v.name}
                              </span>
                              <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-slate-600 dark:text-slate-400">
                                {v.mitre}
                              </span>
                            </div>
                            <ul className="text-[10px] text-muted space-y-0.5">
                              {v.signals.map((s) => (
                                <li key={s}>· {s}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DataPageLayout>
  );
}

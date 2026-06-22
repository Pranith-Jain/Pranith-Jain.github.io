import { useState, useMemo } from 'react';
import { BackLink } from '../../components/BackLink';
import { CopyButton } from '../../components/dfir/CopyButton';
import { SEVERITY_TONE } from '../../components/severity';
import { ArrowLeft, Search, AlertTriangle, Shield, Tag, Calendar, User, FileCode } from 'lucide-react';

type Severity = 'critical' | 'high' | 'medium';
type TabId = 'all' | 'cves' | 'campaigns' | 'actors';
type QueryLang = 'kql' | 'sigma' | 'xql' | 'spl';

interface DetectionQuery {
  lang: QueryLang;
  code: string;
}

interface QueryPack {
  id: string;
  name: string;
  severity: Severity;
  cveId?: string;
  campaignName?: string;
  actorName?: string;
  affectedProducts: string[];
  techniques: string[];
  queries: DetectionQuery[];
  datePublished: string;
  summary: string;
}

const QUERY_PACKS: QueryPack[] = [
  {
    id: 'cve-2026-41940',
    name: 'CVE-2026-41940 — cPanel Harvester Toolkit',
    severity: 'high',
    cveId: 'CVE-2026-41940',
    affectedProducts: ['cPanel', 'WHM', 'Apache httpd'],
    techniques: ['T1190', 'T1505', 'T1059'],
    datePublished: '2026-04-12',
    summary:
      'Harvester toolkit targeting cPanel admin panels via unauthenticated API injection. Deploys web shell and exfiltrates hosting credentials.',
    queries: [
      {
        lang: 'kql',
        code: `// CVE-2026-41940 — cPanel Harvester Toolkit
// Detect web shell deployment via cPanel API abuse
DeviceProcessEvents
| where Timestamp > ago(7d)
| where FileName in~ ("cmd.php", "harvest.php", "cpapi.py")
| where ProcessCommandLine has_any ("/cpsess", "whostmgrd", "cpapi2")
| project Timestamp, DeviceName, FileName, ProcessCommandLine, AccountName`,
      },
      {
        lang: 'sigma',
        code: `title: cPanel Harvester Web Shell Deployment
id: cve-2026-41940
status: experimental
description: Detects web shell files dropped via cPanel API abuse
logsource:
  category: process_creation
  product: linux
detection:
  selection:
    Image|endswith:
      - '/cmd.php'
      - '/harvest.php'
    CommandLine|contains:
      - '/cpsess'
      - 'whostmgrd'
  condition: selection
level: high`,
      },
      {
        lang: 'xql',
        code: `// CVE-2026-41940 — cPanel Harvester
// XQL: Hunt web shell deployment on cPanel servers
dataset = process_creation
| filter event_type = "PROCESS" and TIMESTAMP > NOW() - 7d
| filter process_path regex ".*(cmd\\.php|harvest\\.php|cpapi\\.py)$"
| filter process_cmdline contains any ("/cpsess", "whostmgrd", "cpapi2")
| fields TIMESTAMP, hostname, process_path, process_cmdline, user`,
      },
      {
        lang: 'spl',
        code: `index=linux sourcetype=secure_log
"cmd.php" OR "harvest.php" OR "cpapi.py"
| eval threat="cPanel Harvester (CVE-2026-41940)"
| table _time, host, process, command
| sort - _time`,
      },
    ],
  },
  {
    id: 'cve-2026-41823',
    name: 'CVE-2026-41823 — Exchange RCE',
    severity: 'critical',
    cveId: 'CVE-2026-41823',
    affectedProducts: ['Microsoft Exchange Server 2019', 'Exchange Online'],
    techniques: ['T1190', 'T1210', 'T1505'],
    datePublished: '2026-02-18',
    summary:
      'Pre-auth remote code execution in Exchange Server OWA component. Chained SSRF to deserialisation in ECP endpoint.',
    queries: [
      {
        lang: 'kql',
        code: `// CVE-2026-41823 — Exchange RCE
// Detect post-exploit webshell deployment on Exchange
DeviceProcessEvents
| where Timestamp > ago(14d)
| where ProcessCommandLine has_any ("powershell", "cmd.exe", "wscript", "cscript")
| where ProcessCommandLine contains "/owa/" or ProcessCommandLine contains "/ecp/"
| summarize ShellCount = count() by DeviceName, bin(Timestamp, 1h)
| where ShellCount > 3`,
      },
      {
        lang: 'sigma',
        code: `title: Exchange OWA-RCE Webshell Indicator
id: cve-2026-41823
status: experimental
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    ParentImage|endswith: 'w3wp.exe'
    CommandLine|contains:
      - 'powershell'
      - '-enc'
      - 'IEX'
  condition: selection
level: critical`,
      },
      {
        lang: 'xql',
        code: `// CVE-2026-41823 — Exchange RCE
// Find suspicious child processes of w3wp.exe
dataset = process_creation
| filter event_type = "PROCESS" and TIMESTAMP > NOW() - 14d
| filter parent_process_path contains "w3wp.exe"
| filter process_cmdline contains any ("powershell", "cmd.exe", "IEX", "-enc")
| fields TIMESTAMP, hostname, user, process_path, process_cmdline`,
      },
      {
        lang: 'spl',
        code: `index=windows sourcetype=WinEventLog:Security
EventCode=4688 ParentProcessName=*w3wp.exe
NewProcessName=*powershell.exe
| eval alert="Exchange RCE Post-Exploit (CVE-2026-41823)"
| table _time, host, user, NewProcessName, CommandLine`,
      },
    ],
  },
  {
    id: 'cve-2026-41290',
    name: 'CVE-2026-41290 — Log4Shell Variants',
    severity: 'critical',
    cveId: 'CVE-2026-41290',
    affectedProducts: ['Apache Log4j 2.x', 'Multiple vendor appliances'],
    techniques: ['T1190', 'T1211', 'T1068'],
    datePublished: '2026-01-05',
    summary:
      'New Log4Shell bypass variants targeting patched 2.17.1+ installations. JNDI LDAP injection via message lookup conversion pattern.',
    queries: [
      {
        lang: 'kql',
        code: `// CVE-2026-41290 — Log4Shell Variants
// Detect JNDI LDAP outbound connections
DeviceNetworkEvents
| where Timestamp > ago(30d)
| where RemotePort == 389 or RemotePort == 1389 or RemotePort == 636
| where RemoteIPType == "Public"
| project Timestamp, DeviceName, RemoteIP, RemotePort, InitiatingProcessFileName`,
      },
      {
        lang: 'sigma',
        code: `title: Log4Shell Variant LDAP Outbound
id: cve-2026-41290
status: experimental
logsource:
  category: network_connection
  product: windows
detection:
  selection:
    DestinationPort:
      - 389
      - 1389
      - 636
    Initiated: true
  filter:
    DestinationIp:
      - 10.*
      - 172.16.*
      - 192.168.*
  condition: selection and not filter
level: critical`,
      },
      {
        lang: 'xql',
        code: `// CVE-2026-41290 — Log4Shell JNDI Variant
// Hunt LDAP outbound from Java processes
dataset = network_connection
| filter event_type = "NETWORK" and TIMESTAMP > NOW() - 30d
| filter dest_port in (389, 1389, 636) and initiated = true
| filter process_path contains "java"
| fields TIMESTAMP, hostname, process_path, dest_ip, dest_port`,
      },
      {
        lang: 'spl',
        code: `index=network sourcetype=flow
dest_port IN (389,1389,636) dest_ip!="10.0.0.0/8" dest_ip!="172.16.0.0/12" dest_ip!="192.168.0.0/16"
| eval threat="Log4Shell Variant (CVE-2026-41290)"
| table _time, src_ip, dest_ip, dest_port, app`,
      },
    ],
  },
  {
    id: 'lockbit-3',
    name: 'LockBit 3.0 Ransomware — Active Campaign',
    severity: 'high',
    campaignName: 'LockBit 3.0 Ransomware',
    actorName: 'LockBit',
    affectedProducts: ['Windows Server', 'VMware ESXi', 'SMB shares'],
    techniques: ['T1486', 'T1490', 'T1047', 'T1021'],
    datePublished: '2026-03-01',
    summary:
      'Active LockBit 3.0 campaign leveraging PsExec lateral movement and custom encryptor. Targets Windows + ESXi environments.',
    queries: [
      {
        lang: 'kql',
        code: `// LockBit 3.0 — Ransomware Deployment
// Detect LockBit named pipe + service creation
DeviceProcessEvents
| where Timestamp > ago(7d)
| where ProcessCommandLine contains "\\\\.\\pipe\\" or ProcessCommandLine contains "LockBit\\"
| project Timestamp, DeviceName, FileName, ProcessCommandLine`,
      },
      {
        lang: 'sigma',
        code: `title: LockBit 3.0 Named Pipe + Service
id: lockbit-3-001
status: experimental
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains:
      - '\\\\.\\pipe\\lockbit'
      - 'LockBit\\'
  condition: selection
level: high`,
      },
      {
        lang: 'xql',
        code: `// LockBit 3.0 — Named Pipe + Service Install
dataset = process_creation
| filter event_type = "PROCESS" and TIMESTAMP > NOW() - 7d
| filter process_cmdline contains any ("\\\\.\\pipe\\lockbit", "LockBit\\")
| fields TIMESTAMP, hostname, process_path, process_cmdline, user`,
      },
      {
        lang: 'spl',
        code: `index=windows sourcetype=WinEventLog:Security
CommandLine="*\\\\.\\pipe\\lockbit*" OR CommandLine="*LockBit\\*"
| eval threat="LockBit 3.0 Deployment"
| table _time, host, user, CommandLine`,
      },
    ],
  },
  {
    id: 'clop-moveit',
    name: 'CLOP MOVEit Exploitation — Ongoing',
    severity: 'critical',
    campaignName: 'CLOP MOVEit Exploitation',
    actorName: 'TA-584 (CLOP)',
    affectedProducts: ['Progress MOVEit Transfer', 'MOVEit Cloud'],
    techniques: ['T1190', 'T1211', 'T1489'],
    datePublished: '2026-02-25',
    summary:
      'Ongoing CLOP ransomware exploitation of MOVEit Transfer SQLi vulnerability. Data exfiltration via HTTPS to known CLOP infrastructure.',
    queries: [
      {
        lang: 'kql',
        code: `// CLOP — MOVEit Exploitation
// Detect MOVEit human.txt webshell access
DeviceNetworkEvents
| where Timestamp > ago(14d)
| where RemoteUrl contains "/human.txt" or RemoteUrl contains "/moveitapi/"
| project Timestamp, DeviceName, RemoteIP, RemoteUrl, InitiatingProcessFileName`,
      },
      {
        lang: 'sigma',
        code: `title: MOVEit Webshell Access (CLOP)
id: clop-moveit-001
status: experimental
logsource:
  category: webserver
  product: iis
detection:
  selection:
    cs-uri-stem|contains:
      - '/human.txt'
      - '/moveitapi'
    sc-status: 200
  condition: selection
level: critical`,
      },
      {
        lang: 'xql',
        code: `// CLOP — MOVEit Webshell
dataset = http_request
| filter event_type = "HTTP" and TIMESTAMP > NOW() - 14d
| filter url contains any ("/human.txt", "/moveitapi")
| filter status_code = 200
| fields TIMESTAMP, src_ip, url, user_agent`,
      },
      {
        lang: 'spl',
        code: `index=proxy sourcetype=access_combined
uri="*/human.txt*" OR uri="*/moveitapi*"
| eval threat="CLOP MOVEit Webshell"
| table _time, src_ip, uri, status`,
      },
    ],
  },
  {
    id: 'apt29-solarwinds',
    name: 'APT29 — SolarWinds Post-Exploit',
    severity: 'critical',
    campaignName: 'SolarWinds Post-Exploit',
    actorName: 'APT29 (Cozy Bear)',
    affectedProducts: ['SolarWinds Orion', 'Microsoft 365', 'Azure AD'],
    techniques: ['T1195', 'T1550', 'T1526', 'T1098'],
    datePublished: '2026-01-20',
    summary:
      'APT29 post-compromise activity on SolarWinds Orion deployments. SAML token forging, Azure AD persistence, and mailbox exfiltration.',
    queries: [
      {
        lang: 'kql',
        code: `// APT29 — SolarWinds Post-Exploit
// Detect suspicious Azure AD app registration + SAML token
AuditLogs
| where Timestamp > ago(30d)
| where OperationName has_any ("Add application", "Update application", "Add service principal")
| where ResultStatus == "success"
| extend AppId = tostring(TargetResources[0].id)
| project Timestamp, OperationName, InitiatedBy.user.userPrincipalName, AppId`,
      },
      {
        lang: 'sigma',
        code: `title: Azure AD Suspicious App Registration (APT29)
id: apt29-solarwinds-001
status: experimental
logsource:
  product: azure
  service: auditlogs
detection:
  selection:
    OperationName:
      - 'Add application'
      - 'Add service principal'
    ResultStatus: 'success'
  condition: selection
level: critical`,
      },
      {
        lang: 'xql',
        code: `// APT29 — Azure AD App Registration
dataset = cloud_audit
| filter event_type = "AZURE_AUDIT" and TIMESTAMP > NOW() - 30d
| filter operation_name in ("Add application", "Add service principal", "Update application")
| filter result = "SUCCESS"
| fields TIMESTAMP, user, operation_name, target_resource`,
      },
      {
        lang: 'spl',
        code: `index=azure sourcetype=audit
operation IN ("Add application", "Add service principal")
result=success
| eval threat="Suspicious Azure AD App Reg (APT29)"
| table _time, user, operation, result`,
      },
    ],
  },
  {
    id: 'blackcat-alphv',
    name: 'BlackCat/ALPHV — Encryptor Deployment',
    severity: 'high',
    campaignName: 'BlackCat/ALPHV Ransomware',
    actorName: 'ALPHV (BlackCat)',
    affectedProducts: ['Windows', 'Linux', 'VMware ESXi', 'NAS appliances'],
    techniques: ['T1486', 'T1059', 'T1047', 'T1021'],
    datePublished: '2026-03-30',
    summary:
      'ALPHV ransomware encryptor deployment via Rust-based binary. Uses intermittent encryption for speed and AppLocker bypass.',
    queries: [
      {
        lang: 'kql',
        code: `// BlackCat/ALPHV — Encryptor Deployment
// Rust-compiled binary with known ALPHV hashes
DeviceProcessEvents
| where Timestamp > ago(7d)
| where FileName endswith ".exe" or FileName endswith ".bin"
| where ProcessCommandLine has_any ("-encrypt", "--decrypt", "-vss")
| project Timestamp, DeviceName, FileName, SHA256, ProcessCommandLine`,
      },
      {
        lang: 'sigma',
        code: `title: BlackCat ALPHV Encryptor Execution
id: blackcat-001
status: experimental
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains:
      - '-encrypt'
      - '--decrypt'
      - '-vss'
  condition: selection
level: high`,
      },
      {
        lang: 'xql',
        code: `// BlackCat/ALPHV — Rust Encryptor
dataset = process_creation
| filter event_type = "PROCESS" and TIMESTAMP > NOW() - 7d
| filter process_cmdline contains any ("-encrypt", "--decrypt", "-vss")
| fields TIMESTAMP, hostname, process_path, process_cmdline, sha256`,
      },
      {
        lang: 'spl',
        code: `index=windows sourcetype=WinEventLog:Security
CommandLine="*-encrypt*" OR CommandLine="*--decrypt*" OR CommandLine="*-vss*"
| eval threat="BlackCat ALPHV Encryptor"
| table _time, host, user, ProcessName, CommandLine`,
      },
    ],
  },
  {
    id: 'lazarus-crypto',
    name: 'Lazarus — Crypto Bridge Heists',
    severity: 'high',
    campaignName: 'Crypto Bridge Heists',
    actorName: 'Lazarus Group (HIDDEN COBRA)',
    affectedProducts: ['Web3 bridge contracts', 'Node.js', 'Linux servers'],
    techniques: ['T1190', 'T1204', 'T1059', 'T1071'],
    datePublished: '2026-04-05',
    summary:
      'Lazarus targeting cryptocurrency bridge smart contracts. Social engineering of developers followed by malicious npm packages for persistent access.',
    queries: [
      {
        lang: 'kql',
        code: `// Lazarus — Crypto Bridge Heist
// Detect malicious npm package installs from known typosquatting
DeviceProcessEvents
| where Timestamp > ago(14d)
| where ProcessCommandLine contains "npm install"
| where ProcessCommandLine has_any ("web3-bridge", "ethers-bridge", "sol-tools")
| project Timestamp, DeviceName, FileName, ProcessCommandLine`,
      },
      {
        lang: 'sigma',
        code: `title: Malicious npm Package Install (Lazarus)
id: lazarus-crypto-001
status: experimental
logsource:
  category: process_creation
  product: linux
detection:
  selection:
    CommandLine|contains:
      - 'npm install'
    CommandLine|contains:
      - 'web3-bridge'
      - 'ethers-bridge'
      - 'sol-tools'
  condition: selection
level: high`,
      },
      {
        lang: 'xql',
        code: `// Lazarus — Suspicious npm Packages
dataset = process_creation
| filter event_type = "PROCESS" and TIMESTAMP > NOW() - 14d
| filter process_cmdline contains "npm install"
| filter process_cmdline contains any ("web3-bridge", "ethers-bridge", "sol-tools")
| fields TIMESTAMP, hostname, user, process_cmdline`,
      },
      {
        lang: 'spl',
        code: `index=linux sourcetype=shell_history
command="*npm install*web3-bridge*" OR command="*npm install*ethers-bridge*"
| eval threat="Suspicious npm Install (Lazarus)"
| table _time, host, user, command`,
      },
    ],
  },
  {
    id: 'scattered-spider',
    name: 'Scattered Spider — SaaS TTPs',
    severity: 'medium',
    campaignName: 'Scattered Spider SaaS Attacks',
    actorName: 'Scattered Spider (UNC3944)',
    affectedProducts: ['Okta', 'Microsoft 365', 'AWS', 'Salesforce', 'Slack'],
    techniques: ['T1078', 'T1556', 'T1528', 'T1566'],
    datePublished: '2026-03-15',
    summary:
      'Scattered Spider social-engineering campaigns targeting SaaS help desks. SIM swapping, MFA fatigue, and impersonation of IT staff.',
    queries: [
      {
        lang: 'kql',
        code: `// Scattered Spider — MFA Fatigue + Help Desk Takeover
// Detect mass MFA denial prompts
SigninLogs
| where Timestamp > ago(7d)
| where ResultType == "500121"  // MFA denied
| summarize DenialCount = count() by UserPrincipalName, bin(Timestamp, 15m)
| where DenialCount > 5`,
      },
      {
        lang: 'sigma',
        code: `title: MFA Fatigue Attack (Scattered Spider)
id: scattered-spider-001
status: experimental
logsource:
  product: azure
  service: signinlogs
detection:
  selection:
    ResultType: '500121'
  timeframe: 15m
  condition: selection | count() by UserPrincipalName > 5
level: medium`,
      },
      {
        lang: 'xql',
        code: `// Scattered Spider — MFA Fatigue
dataset = authentication
| filter event_type = "AZURE_SIGNIN" and TIMESTAMP > NOW() - 7d
| filter result_code = "500121"
| bucket span = 15m
| aggregation count() BY user
| filter count > 5`,
      },
      {
        lang: 'spl',
        code: `index=azure sourcetype=signinlogs
ResultType=500121
| bin span=15m _time
| stats dc(_time) as attempts by user
| where attempts > 5
| eval threat="MFA Fatigue (Scattered Spider)"`,
      },
    ],
  },
  {
    id: 'cve-2026-40123',
    name: 'CVE-2026-40123 — CitrixBleed',
    severity: 'critical',
    cveId: 'CVE-2026-40123',
    affectedProducts: ['Citrix ADC', 'Citrix Gateway', 'NetScaler'],
    techniques: ['T1190', 'T1211', 'T1021'],
    datePublished: '2026-02-01',
    summary:
      'Citrix ADC/Gateway buffer overflow allowing unauthenticated RCE. Mass exploitation by multiple ransomware groups for initial access.',
    queries: [
      {
        lang: 'kql',
        code: `// CVE-2026-40123 — CitrixBleed
// Detect exploitation via URI pattern + post-exploit webshell
DeviceNetworkEvents
| where Timestamp > ago(30d)
| where RemoteUrl contains "/vpn/../" or RemoteUrl contains "/gwserver/"
| project Timestamp, DeviceName, RemoteIP, RemoteUrl, InitiatingProcessFileName`,
      },
      {
        lang: 'sigma',
        code: `title: Citrix ADC URI Traversal Exploitation
id: cve-2026-40123
status: experimental
logsource:
  category: webserver
  product: citrix
detection:
  selection:
    cs-uri-stem|contains:
      - '/vpn/../'
      - '/gwserver/'
  condition: selection
level: critical`,
      },
      {
        lang: 'xql',
        code: `// CVE-2026-40123 — CitrixBleed
dataset = http_request
| filter event_type = "HTTP" and TIMESTAMP > NOW() - 30d
| filter url contains any ("/vpn/../", "/gwserver/")
| fields TIMESTAMP, src_ip, url, status_code, user_agent`,
      },
      {
        lang: 'spl',
        code: `index=proxy sourcetype=access_combined
uri="*/vpn/../*" OR uri="*/gwserver/*"
| eval threat="CitrixBleed Exploit (CVE-2026-40123)"
| table _time, src_ip, uri, status`,
      },
    ],
  },
];

type FilteredPack = QueryPack & { matchType: TabId };

const LANG_LABELS: Record<QueryLang, string> = {
  kql: 'KQL',
  sigma: 'Sigma',
  xql: 'XQL',
  spl: 'SPL',
};

const LANG_COLORS: Record<QueryLang, string> = {
  kql: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  sigma: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  xql: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  spl: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

export default function Tracepulse(): JSX.Element {
  const [tab, setTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [expandedPack, setExpandedPack] = useState<string | null>(null);
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null);

  const filteredPacks = useMemo(() => {
    const all: FilteredPack[] = QUERY_PACKS.map((p) => ({
      ...p,
      matchType: p.cveId ? 'cves' : p.campaignName ? 'campaigns' : 'actors',
    }));
    const tabFiltered = tab === 'all' ? all : all.filter((p) => p.matchType === tab);
    if (!search.trim()) return tabFiltered;
    const q = search.toLowerCase();
    return tabFiltered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.cveId?.toLowerCase().includes(q) ||
        p.campaignName?.toLowerCase().includes(q) ||
        p.actorName?.toLowerCase().includes(q) ||
        p.techniques.some((t) => t.toLowerCase().includes(q)) ||
        p.affectedProducts.some((a) => a.toLowerCase().includes(q))
    );
  }, [tab, search]);

  const allQueriesCount = filteredPacks.reduce((sum, p) => sum + p.queries.length, 0);

  const TABS: { id: TabId; label: string }[] = [
    { id: 'all', label: `All (${QUERY_PACKS.length})` },
    { id: 'cves', label: `Recent CVEs (${QUERY_PACKS.filter((p) => p.cveId).length})` },
    { id: 'campaigns', label: `Active Campaigns (${QUERY_PACKS.filter((p) => p.campaignName).length})` },
    { id: 'actors', label: `Threat Actors (${QUERY_PACKS.filter((p) => p.actorName).length})` },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <FileCode size={28} className="text-brand-600 dark:text-brand-400" /> TRACEPULSE
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          CVE and campaign-tied detection query packs — deploy as soon as a new CVE drops or campaign goes active.
          <span className="text-slate-500">
            {' '}
            {QUERY_PACKS.length} query packs · {QUERY_PACKS.reduce((s, p) => s + p.queries.length, 0)} queries across
            KQL · Sigma · XQL · SPL
          </span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5 border-b border-slate-200 dark:border-[rgb(var(--border-400))] pb-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-mono font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by CVE, campaign, actor, technique…"
          className="w-full pl-9 pr-3 h-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
      </div>

      {/* Stats */}
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-mono">
        {filteredPacks.length} query packs · {allQueriesCount} queries across KQL · Sigma · XQL · SPL
      </div>

      {/* Packs */}
      {filteredPacks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-8 text-center">
          <AlertTriangle size={24} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-500">No query packs match your filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPacks.map((pack) => (
            <div
              key={pack.id}
              className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-semibold">{pack.name}</h3>
                      <span
                        className={`text-micro font-mono px-1.5 py-0.5 rounded border ${SEVERITY_TONE[pack.severity]}`}
                      >
                        {pack.severity.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-muted mb-2">{pack.summary}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-micro font-mono text-slate-400">
                      {pack.cveId && (
                        <span className="flex items-center gap-1">
                          <Shield size={10} /> {pack.cveId}
                        </span>
                      )}
                      {pack.campaignName && (
                        <span className="flex items-center gap-1">
                          <Tag size={10} /> {pack.campaignName}
                        </span>
                      )}
                      {pack.actorName && (
                        <span className="flex items-center gap-1">
                          <User size={10} /> {pack.actorName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar size={10} /> {pack.datePublished}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandedPack(expandedPack === pack.id ? null : pack.id)}
                      className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-brand-500/30 transition-colors"
                    >
                      {expandedPack === pack.id ? 'Collapse' : 'Expand'}
                    </button>
                    <CopyButton
                      value={pack.queries.map((q) => `// ${q.lang.toUpperCase()}\n${q.code}`).join('\n\n')}
                      title="Copy all queries"
                    />
                  </div>
                </div>
                {/* Products + Techniques */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {pack.affectedProducts.map((p) => (
                    <span
                      key={p}
                      className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    >
                      {p}
                    </span>
                  ))}
                  {pack.techniques.map((t) => (
                    <a
                      key={t}
                      href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-micro font-mono px-1.5 py-0.5 rounded border border-amber-300/50 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 hover:border-amber-500/60 transition-colors"
                    >
                      {t}
                    </a>
                  ))}
                </div>
              </div>

              {/* Queries (expandable) */}
              {expandedPack === pack.id && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pack.queries.map((q, i) => (
                    <div key={i}>
                      <button
                        onClick={() => setExpandedQuery(expandedQuery === `${pack.id}-${i}` ? null : `${pack.id}-${i}`)}
                        className="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-micro font-mono px-1.5 py-0.5 rounded ${LANG_COLORS[q.lang]}`}>
                            {LANG_LABELS[q.lang]}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Query {i + 1}</span>
                        </div>
                        <CopyButton value={q.code} />
                      </button>
                      {expandedQuery === `${pack.id}-${i}` && (
                        <pre className="bg-slate-50 dark:bg-slate-950 px-5 py-4 overflow-x-auto text-xs text-slate-700 dark:text-slate-300 font-mono border-t border-slate-100 dark:border-[rgb(var(--border-400))] whitespace-pre-wrap">
                          {q.code}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

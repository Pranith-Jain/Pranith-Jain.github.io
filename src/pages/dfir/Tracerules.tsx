import { useState, useMemo } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Shield, Copy, Check, FileCode, Terminal, Code2 } from 'lucide-react';

type QueryFormat = 'KQL' | 'Sigma' | 'XQL';
type Platform = 'MDE' | 'Sentinel' | 'Splunk' | 'Elastic' | 'CrowdStrike' | 'Palo Alto';

interface DetectionQuery {
  id: string;
  title: string;
  description: string;
  format: QueryFormat;
  platform: Platform[];
  tactic: string;
  techniqueId: string;
  technique: string;
  query: string;
  coverage: string[];
}

const QUERIES: DetectionQuery[] = [
  {
    id: 'kql-001',
    title: 'Suspicious PowerShell Execution',
    description:
      'Detects PowerShell processes launched with encoded commands or suspicious parameters, common in initial access and execution phases.',
    format: 'KQL',
    platform: ['MDE', 'Sentinel'],
    tactic: 'Execution',
    techniqueId: 'T1059.001',
    technique: 'PowerShell',
    query: `DeviceProcessEvents\n| where FileName =~ "powershell.exe"\n| where ProcessCommandLine has_any ("-EncodedCommand", "-e ", "-WindowStyle Hidden", "-ExecutionPolicy Bypass")\n| project Timestamp, DeviceName, AccountName, FileName, ProcessCommandLine`,
    coverage: ['Execution', 'Defense Evasion'],
  },
  {
    id: 'kql-002',
    title: 'Suspicious Network Connection by Office App',
    description:
      'Detects Microsoft Office applications making unexpected outbound network connections, often indicative of macro-based C2 callbacks.',
    format: 'KQL',
    platform: ['MDE', 'Sentinel'],
    tactic: 'Command and Control',
    techniqueId: 'T1071.001',
    technique: 'Web Protocols',
    query: `DeviceNetworkEvents\n| where InitiatingProcessFileName in~ ("winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe")\n| where RemotePort in (80, 443) and RemoteIPType =~ "IPv4"\n| project Timestamp, DeviceName, InitiatingProcessFileName, RemoteIP, RemotePort`,
    coverage: ['Command and Control', 'Initial Access'],
  },
  {
    id: 'kql-003',
    title: 'Registry Persistence via Run Keys',
    description:
      'Detects modifications to registry Run keys, a common persistence mechanism used by malware to establish foothold.',
    format: 'KQL',
    platform: ['MDE', 'Sentinel'],
    tactic: 'Persistence',
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    query: `DeviceRegistryEvents\n| where RegistryKey has_any (\n  @"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",\n  @"HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"\n)\n| where ActionType =~ "SetValue"\n| project Timestamp, DeviceName, AccountName, RegistryKey, RegistryValueName, RegistryValueData`,
    coverage: ['Persistence', 'Privilege Escalation'],
  },
  {
    id: 'sigma-001',
    title: 'Suspicious LSASS Access',
    description:
      'Detects processes attempting to access LSASS memory for credential dumping via tools like Mimikatz or ProcDump.',
    format: 'Sigma',
    platform: ['Splunk', 'Elastic'],
    tactic: 'Credential Access',
    techniqueId: 'T1003.001',
    technique: 'LSASS Memory',
    query: `title: Suspicious LSASS Access\nstatus: experimental\ndescription: Detects processes accessing LSASS.exe memory\nlogsource:\n  product: windows\n  category: process_access\ndetection:\n  selection:\n    TargetImage|endswith: '\\lsass.exe'\n    SourceImage|endswith:\n      - '\\procdump.exe'\n      - '\\mimikatz.exe'\n      - '\\taskmgr.exe'\n    GrantedAccess|contains:\n      - '0x1FFFFF'\n      - '0x1410'\n  condition: selection\nfalsepositives:\n  - Legitimate administrative tools\nlevel: high`,
    coverage: ['Credential Access'],
  },
  {
    id: 'sigma-002',
    title: 'Scheduled Task Creation on Remote Host',
    description:
      'Detects creation of scheduled tasks on remote hosts, commonly used for lateral movement and persistence.',
    format: 'Sigma',
    platform: ['Splunk', 'Elastic'],
    tactic: 'Lateral Movement',
    techniqueId: 'T1053.005',
    technique: 'Scheduled Task',
    query: `title: Remote Scheduled Task Creation\nstatus: experimental\ndescription: Detects remote scheduled task creation via schtasks\nlogsource:\n  product: windows\n  service: security\n  definition: 'Advanced Audit Policy: Object Access > Audit Detailed File Share'\ndetection:\n  selection:\n    EventID: 4698\n    TaskContent|contains:\n      - 'SYSTEM'\n      - 'cmd.exe'\n      - 'powershell.exe'\n  condition: selection\nlevel: medium`,
    coverage: ['Execution', 'Persistence'],
  },
  {
    id: 'xql-001',
    title: 'Process Terminating Security Tools',
    description:
      'Detects processes attempting to terminate or disable security software, a common defense evasion technique.',
    format: 'XQL',
    platform: ['CrowdStrike', 'Palo Alto'],
    tactic: 'Defense Evasion',
    techniqueId: 'T1562.001',
    technique: 'Disable or Modify Tools',
    query: `config eventLimit = 1000\n| dataset = falcon_process\n| filter event_simpleName =~ "ProcessRollup2"\n  AND (CommandLine contains "taskkill" OR CommandLine contains "net stop")\n  AND (CommandLine contains "defender" OR CommandLine contains "winlogbeat" OR CommandLine contains "falcon" OR CommandLine contains "sentinel")\n| modify _time as Timestamp\n| fields Timestamp, ComputerName, UserName, CommandLine\n| sort -Timestamp`,
    coverage: ['Defense Evasion'],
  },
  {
    id: 'xql-002',
    title: 'DLL Injection via CreateRemoteThread',
    description: 'Detects processes creating remote threads in another process, a common code injection technique.',
    format: 'XQL',
    platform: ['CrowdStrike', 'Palo Alto'],
    tactic: 'Defense Evasion',
    techniqueId: 'T1055.001',
    technique: 'Process Injection: DLL Injection',
    query: `config eventLimit = 1000\n| dataset = falcon_process\n| filter event_simpleName =~ "ProcessRollup2"\n  AND EventType =~ "CreateRemoteThread"\n  AND SourceProcessId != TargetProcessId\n| modify _time as Timestamp\n| fields Timestamp, ComputerName, SourceProcessName, TargetProcessName, CallersApi\n| sort -Timestamp`,
    coverage: ['Defense Evasion', 'Execution'],
  },
  {
    id: 'kql-004',
    title: 'Anomalous RDP Connection',
    description:
      'Detects RDP connections from unusual source IPs or geographies, indicative of lateral movement or external compromise.',
    format: 'KQL',
    platform: ['MDE', 'Sentinel'],
    tactic: 'Lateral Movement',
    techniqueId: 'T1021.001',
    technique: 'Remote Desktop Protocol',
    query: `DeviceNetworkEvents\n| where LocalPort == 3389 and RemotePort == 3389\n| where RemoteIP !in (local_rdp_gateways)\n| project Timestamp, DeviceName, AccountName, RemoteIP, RemotePort\n| lookup kind=leftouter GeoIP on RemoteIP\n| project Timestamp, DeviceName, AccountName, RemoteIP, Country`,
    coverage: ['Lateral Movement', 'Initial Access'],
  },
  {
    id: 'kql-005',
    title: 'Data Staging to Archive Files',
    description: 'Detects creation of archive files in unusual locations or volumes, often preceding exfiltration.',
    format: 'KQL',
    platform: ['MDE', 'Sentinel'],
    tactic: 'Collection',
    techniqueId: 'T1074.001',
    technique: 'Data Staged: Local',
    query: `DeviceFileEvents\n| where FileName endswith ".zip" or FileName endswith ".rar" or FileName endswith ".7z"\n| where FolderPath startswith "C:\\Users\\"\n| where InitiatingProcessFileName in~ ("powershell.exe", "cmd.exe", "7z.exe", "winrar.exe")\n| summarize ArchivedFiles = count() by bin(Timestamp, 5m), DeviceName, AccountName, InitiatingProcessFileName\n| where ArchivedFiles > 5`,
    coverage: ['Collection', 'Exfiltration'],
  },
  {
    id: 'sigma-003',
    title: 'Service Installation from Non-Standard Location',
    description:
      'Detects services installed from non-system32 paths, a common evasion technique for establishing persistence.',
    format: 'Sigma',
    platform: ['Splunk', 'Elastic'],
    tactic: 'Persistence',
    techniqueId: 'T1543.003',
    technique: 'Create or Modify System Process: Windows Service',
    query: `title: Service Installed from Non-Standard Path\nstatus: experimental\ndescription: Detects services installed from non-system32 paths\nlogsource:\n  product: windows\n  service: system\n  definition: 'Requires Audit Object Access'\ndetection:\n  selection:\n    EventID: 4697\n    ServiceFileName|startswith:\n      - 'C:\\Users\\'\n      - 'C:\\Windows\\Temp'\n      - 'C:\\PerfLogs'\n      - '\\\\*\\*'\n  condition: selection\nfalsepositives:\n  - Software installers with bundled services\nlevel: high`,
    coverage: ['Persistence', 'Execution'],
  },
];

const FORMATS: QueryFormat[] = ['KQL', 'Sigma', 'XQL'];

const FORMAT_ICONS: Record<QueryFormat, typeof Code2> = {
  KQL: FileCode,
  Sigma: Code2,
  XQL: Terminal,
};

const FORMAT_COLORS: Record<QueryFormat, string> = {
  KQL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-800',
  Sigma:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-300 dark:border-purple-800',
  XQL: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-300 dark:border-green-800',
};

export default function Tracerules(): JSX.Element {
  const [query, setQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<QueryFormat | 'all'>('all');
  const [tacticFilter, setTacticFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const tactics = useMemo(() => [...new Set(QUERIES.map((q) => q.tactic))], []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return QUERIES.filter(
      (r) =>
        (formatFilter === 'all' || r.format === formatFilter) &&
        (tacticFilter === 'all' || r.tactic === tacticFilter) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.techniqueId.toLowerCase().includes(q) ||
          r.technique.toLowerCase().includes(q))
    );
  }, [query, formatFilter, tacticFilter]);

  const copyQuery = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Shield size={28} className="text-brand-600 dark:text-brand-400" /> TRACERULES
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Curated detection query library across KQL, Sigma, and XQL. Filter by format, tactic, or technique. Copy
          queries directly for use in your SIEM.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search queries by title, technique, or keyword…"
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormatFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                formatFilter === 'all'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              All
            </button>
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormatFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                  formatFilter === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <select
            value={tacticFilter}
            onChange={(e) => setTacticFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
          >
            <option value="all">All Tactics</option>
            {tactics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {filtered.length} {filtered.length === 1 ? 'query' : 'queries'} loaded
      </p>

      <div className="space-y-4">
        {filtered.map((rule) => {
          const FIcon = FORMAT_ICONS[rule.format];
          const isOpen = expanded === rule.id;
          return (
            <div
              key={rule.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : rule.id)}
                className="w-full text-left p-5 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FIcon size={14} className="text-slate-400" />
                      <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {rule.title}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{rule.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span
                        className={`text-micro font-mono px-1.5 py-0.5 rounded border ${FORMAT_COLORS[rule.format]}`}
                      >
                        {rule.format}
                      </span>
                      <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {rule.tactic}
                      </span>
                      <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30">
                        {rule.techniqueId}
                      </span>
                      {rule.platform.map((p) => (
                        <span
                          key={p}
                          className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-200 dark:border-slate-800 p-5 bg-slate-50 dark:bg-slate-950/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Query</span>
                    <button
                      type="button"
                      onClick={() => copyQuery(rule.id, rule.query)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      {copiedId === rule.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === rule.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {rule.query}
                  </pre>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="text-micro font-mono text-slate-400">Coverage:</span>
                    {rule.coverage.map((c) => (
                      <span
                        key={c}
                        className="text-micro font-mono px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12 font-mono">
          No detection queries match your filter.
        </p>
      )}

      <p className="mt-8 text-micro font-mono text-slate-400 text-center">
        H3AD-DETECT / TRACERULES · {QUERIES.length} rules · KQL · Sigma · XQL
      </p>
    </div>
  );
}

import { FileCode, Code2, Terminal, type LucideIcon } from 'lucide-react';

export type QueryFormat = 'KQL' | 'Sigma' | 'XQL';
export type Platform = 'MDE' | 'Sentinel' | 'Splunk' | 'Elastic' | 'CrowdStrike' | 'Palo Alto';

export interface DetectionQuery {
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

export const QUERIES: DetectionQuery[] = [
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

export const FORMATS: QueryFormat[] = ['KQL', 'Sigma', 'XQL'];

export const FORMAT_ICONS: Record<QueryFormat, LucideIcon> = {
  KQL: FileCode,
  Sigma: Code2,
  XQL: Terminal,
};

export const FORMAT_COLORS: Record<QueryFormat, string> = {
  KQL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-800',
  Sigma:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-300 dark:border-purple-800',
  XQL: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-300 dark:border-green-800',
};

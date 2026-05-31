/**
 * Hunting Query Library
 *
 * Curated threat hunting queries for multiple SIEM platforms.
 * Each query is mapped to MITRE ATT&CK techniques and includes
 * context about what it detects and how to interpret results.
 *
 * Platforms supported:
 *   - Splunk SPL
 *   - Microsoft KQL (Sentinel/Defender)
 *   - Elastic EQL/KQL
 *   - Sigma (universal)
 *   - YARA (file-based)
 */

export type QueryPlatform = 'splunk' | 'kql' | 'elastic' | 'sigma' | 'yara';
export type ThreatCategory = 'ransomware' | 'lateral-movement' | 'credential-access' | 'exfiltration' | 'persistence' | 'initial-access' | 'defense-evasion' | 'discovery' | 'c2' | 'data-theft';

export interface HuntingQuery {
  id: string;
  name: string;
  description: string;
  category: ThreatCategory;
  mitreTechniques: string[];  // ATT&CK technique IDs
  severity: 'critical' | 'high' | 'medium' | 'low';
  platforms: Record<QueryPlatform, string>;
  falsePositives: string[];
  references: string[];
  tags: string[];
}

export const HUNTING_QUERIES: HuntingQuery[] = [
  // ── Ransomware ─────────────────────────────────────────────────
  {
    id: 'ransom-001',
    name: 'Mass File Renaming Activity',
    description: 'Detects rapid file renaming with common ransomware extensions (.encrypted, .locked, .crypto). Indicates active ransomware encryption.',
    category: 'ransomware',
    mitreTechniques: ['T1486'],
    severity: 'critical',
    platforms: {
      splunk: `index=sysmon EventCode=11 TargetFilename IN ("*.encrypted", "*.locked", "*.crypto", "*.ransom", "*.wnry", "*.wcry")
| stats count as rename_count by Computer, TargetFilename
| where rename_count > 10
| stats values(TargetFilename) as files, sum(rename_count) as total by Computer
| where total > 50`,
      kql: `DeviceFileEvents
| where ActionType == "FileCreated"
| where FileName endswith ".encrypted" or FileName endswith ".locked" or FileName endswith ".crypto"
| summarize FileCount = dcount(FileName), Files = make_set(FileName, 10) by DeviceName, bin(Timestamp, 5m)
| where FileCount > 10`,
      elastic: `file where event.action == "creation" and (
  file.name like "*.encrypted" or
  file.name like "*.locked" or
  file.name like "*.crypto"
) | stats count by host.name, file.name | where count > 10`,
      sigma: `title: Mass File Renaming with Ransomware Extensions
detection:
  selection:
    EventID: 11
    TargetFilename|endswith:
      - '.encrypted'
      - '.locked'
      - '.crypto'
  condition: selection | count(TargetFilename) by Computer > 50`,
      yara: `rule Ransomware_Extension_Pattern {
  strings:
    $ext1 = ".encrypted" ascii
    $ext2 = ".locked" ascii
    $ext3 = ".crypto" ascii
    $ransom_note = "README" ascii
  condition:
    any of ($ext*) and $ransom_note
}`,
    },
    falsePositives: [
      'Backup software renaming files',
      'Encryption tools (VeraCrypt, BitLocker)',
      'Development environments with .encrypted test files',
    ],
    references: [
      'https://attack.mitre.org/techniques/T1486/',
    ],
    tags: ['ransomware', 'encryption', 'file-system'],
  },
  {
    id: 'ransom-002',
    name: 'Shadow Copy Deletion',
    description: 'Detects deletion of Windows shadow copies, a common ransomware pre-encryption step to prevent recovery.',
    category: 'ransomware',
    mitreTechniques: ['T1490'],
    severity: 'critical',
    platforms: {
      splunk: `index=sysmon (EventCode=1 AND (CommandLine="*vssadmin*delete*shadow*" OR CommandLine="*wmic*shadowcopy*delete*"))
| stats count by Computer, CommandLine, User
| where count >= 1`,
      kql: `DeviceProcessEvents
| where FileName == "vssadmin.exe" and ProcessCommandLine has "delete" and ProcessCommandLine has "shadow"
   or FileName == "wmic.exe" and ProcessCommandLine has "shadowcopy" and ProcessCommandLine has "delete"
| project Timestamp, DeviceName, InitiatingProcessCommandLine, ProcessCommandLine`,
      elastic: `process where (
  (process.name == "vssadmin.exe" and process.args == "delete" and process.args == "shadows") or
  (process.name == "wmic.exe" and process.args == "shadowcopy" and process.args == "delete")
)`,
      sigma: `title: Shadow Copy Deletion
detection:
  selection_vss:
    EventID: 1
    Image|endswith: '\\vssadmin.exe'
    CommandLine|contains|all:
      - 'delete'
      - 'shadow'
  selection_wmic:
    EventID: 1
    Image|endswith: '\\wmic.exe'
    CommandLine|contains|all:
      - 'shadowcopy'
      - 'delete'
  condition: selection_vss or selection_wmic`,
      yara: `rule Shadow_Copy_Deletion {
  strings:
    $s1 = "vssadmin delete shadows" ascii nocase
    $s2 = "wmic shadowcopy delete" ascii nocase
    $s3 = "bcdedit /set {default} recoveryenabled No" ascii nocase
  condition:
    any of them
}`,
    },
    falsePositives: [
      'Legitimate backup software cleanup',
      'System administrators managing disk space',
    ],
    references: [
      'https://attack.mitre.org/techniques/T1490/',
    ],
    tags: ['ransomware', 'recovery-inhibition', 'windows'],
  },

  // ── Lateral Movement ───────────────────────────────────────────
  {
    id: 'latmov-001',
    name: 'PsExec Lateral Movement',
    description: 'Detects PsExec-style lateral movement via service creation with suspicious binary paths.',
    category: 'lateral-movement',
    mitreTechniques: ['T1021.002', 'T1569.002'],
    severity: 'high',
    platforms: {
      splunk: `index=sysmon EventCode=7045 OR (EventCode=1 Image="*\\PSEXESVC.exe")
| stats count by Computer, ServiceName, ImagePath
| where ServiceName="PSEXESVC" OR ImagePath="*PSEXESVC*" OR ImagePath="*PsExec*"`,
      kql: `DeviceEvents
| where ActionType == "ServiceInstalled"
| where AdditionalFields.ServiceName == "PSEXESVC"
   or AdditionalFields.ServiceFileName contains "PSEXESVC"
| project Timestamp, DeviceName, ActionType, AdditionalFields`,
      elastic: `event.code == "7045" and (
  winlog.event_data.ServiceName == "PSEXESVC" or
  winlog.event_data.ImagePath like "*PSEXESVC*"
)`,
      sigma: `title: PsExec Service Installation
detection:
  selection:
    EventID: 7045
    ServiceName: 'PSEXESVC'
  condition: selection`,
      yara: `rule PsExec_Binary {
  strings:
    $s1 = "PSEXESVC" ascii wide
    $s2 = "PsExec" ascii wide
    $mutex = "PSEXESVC" ascii wide
  condition:
    uint16(0) == 0x5A4D and any of them
}`,
    },
    falsePositives: [
      'IT administrators using PsExec for legitimate remote management',
      'System Center Configuration Manager (SCCM)',
    ],
    references: [
      'https://attack.mitre.org/techniques/T1021.002/',
      'https://attack.mitre.org/techniques/T1569.002/',
    ],
    tags: ['lateral-movement', 'remote-execution', 'windows'],
  },

  // ── Credential Access ──────────────────────────────────────────
  {
    id: 'cred-001',
    name: 'LSASS Memory Access',
    description: 'Detects processes accessing LSASS memory for credential dumping (Mimikatz-style attacks).',
    category: 'credential-access',
    mitreTechniques: ['T1003.001'],
    severity: 'critical',
    platforms: {
      splunk: `index=sysmon EventCode=10 TargetImage="*\\lsass.exe" SourceImage!="*\\svchost.exe" SourceImage!="*\\csrss.exe"
| stats count by Computer, SourceImage, GrantedAccess
| where GrantedAccess IN ("0x1010", "0x1410", "0x1fffff")`,
      kql: `DeviceEvents
| where ActionType == "OpenProcessApiCall"
| where AdditionalFields.TargetProcessFileName == "lsass.exe"
| where not(InitiatingProcessFileName in~ ("svchost.exe", "csrss.exe", "services.exe"))
| where AdditionalFields.GrantedAccess in ("0x1010", "0x1410", "0x1fffff")
| project Timestamp, DeviceName, InitiatingProcessFileName, AdditionalFields`,
      elastic: `event.code == "10" and
  winlog.event_data.TargetImage like "*\\lsass.exe" and
  not winlog.event_data.SourceImage like "*\\svchost.exe" and
  winlog.event_data.GrantedAccess in ("0x1010", "0x1410", "0x1fffff")`,
      sigma: `title: LSASS Memory Access
detection:
  selection:
    EventID: 10
    TargetImage|endswith: '\\lsass.exe'
    GrantedAccess|endswith:
      - '0x1010'
      - '0x1410'
      - '0x1fffff'
  filter:
    SourceImage|endswith:
      - '\\svchost.exe'
      - '\\csrss.exe'
      - '\\services.exe'
  condition: selection and not filter`,
      yara: `rule Mimikatz_Strings {
  strings:
    $s1 = "sekurlsa::logonpasswords" ascii wide
    $s2 = "kerberos::list" ascii wide
    $s3 = "lsadump::dcsync" ascii wide
    $s4 = "privilege::debug" ascii wide
  condition:
    uint16(0) == 0x5A4D and 2 of them
}`,
    },
    falsePositives: [
      'Antivirus/EDR scanning LSASS',
      'Windows Defender real-time protection',
      'Legitimate security tools (CrowdStrike, SentinelOne)',
    ],
    references: [
      'https://attack.mitre.org/techniques/T1003.001/',
    ],
    tags: ['credential-access', 'memory-dumping', 'windows'],
  },

  // ── C2 Communication ───────────────────────────────────────────
  {
    id: 'c2-001',
    name: 'DNS Beaconing Pattern',
    description: 'Detects periodic DNS queries to suspicious domains indicating C2 beaconing behavior.',
    category: 'c2',
    mitreTechniques: ['T1071.004'],
    severity: 'high',
    platforms: {
      splunk: `index=dns NOT (query="*.microsoft.com" OR query="*.google.com" OR query="*.akamai*")
| bin _time span=5m
| stats count as query_count, dc(query) as unique_queries, values(query) as queries by src_ip, _time
| where query_count > 10 AND unique_queries = 1
| eventstats avg(query_count) as avg_count by src_ip
| where query_count > avg_count * 2`,
      kql: `DnsEvents
| where !DomainName endswith ".microsoft.com" and !DomainName endswith ".google.com"
| summarize QueryCount = count(), UniqueDomains = dcount(DomainName) by ClientIP, bin(TimeGenerated, 5m)
| where QueryCount > 10 and UniqueDomains == 1
| join kind=inner (
    DnsEvents
    | summarize AvgQuery = count() by ClientIP, bin(TimeGenerated, 1h)
) on ClientIP
| where QueryCount > AvgQuery * 2`,
      elastic: `dns where not dns.question.name like "*.microsoft.com" and not dns.question.name like "*.google.com"
| stats count by source.ip, dns.question.name, window=5m
| where count > 10`,
      sigma: `title: DNS Beaconing Detection
detection:
  selection:
    EventCode: 22
  filter:
    QueryName|endswith:
      - '.microsoft.com'
      - '.google.com'
      - '.akamai.net'
  condition: selection and not filter | count(QueryName) by Computer, QueryName > 10`,
      yara: `rule DNS_Beacon_Pattern {
  strings:
    $dns = "dns" ascii nocase
    $beacon_pattern = /[a-z0-9]{8,16}.[a-z]{2,6}/ ascii
  condition:
    $dns and #beacon_pattern > 5
}`,
    },
    falsePositives: [
      'CDN services with high query rates',
      'IoT devices with aggressive DNS polling',
      'Load balancer health checks',
    ],
    references: [
      'https://attack.mitre.org/techniques/T1071.004/',
    ],
    tags: ['c2', 'dns', 'beaconing', 'network'],
  },

  // ── Initial Access ─────────────────────────────────────────────
  {
    id: 'init-001',
    name: 'Suspicious Macro Execution',
    description: 'Detects Office applications spawning suspicious child processes (macro execution indicator).',
    category: 'initial-access',
    mitreTechniques: ['T1566.001', 'T1204.002'],
    severity: 'high',
    platforms: {
      splunk: `index=sysmon EventCode=1 ParentImage IN ("*\\WINWORD.EXE", "*\\EXCEL.EXE", "*\\POWERPNT.EXE", "*\\OUTLOOK.EXE")
  Image IN ("*\\cmd.exe", "*\\powershell.exe", "*\\pwsh.exe", "*\\wscript.exe", "*\\cscript.exe", "*\\mshta.exe", "*\\certutil.exe")
| stats count by Computer, ParentImage, Image, CommandLine
| where count >= 1`,
      kql: `DeviceProcessEvents
| where InitiatingProcessFileName in~ ("WINWORD.EXE", "EXCEL.EXE", "POWERPNT.EXE", "OUTLOOK.EXE")
| where FileName in~ ("cmd.exe", "powershell.exe", "pwsh.exe", "wscript.exe", "cscript.exe", "mshta.exe", "certutil.exe")
| project Timestamp, DeviceName, InitiatingProcessFileName, FileName, ProcessCommandLine`,
      elastic: `process where (
  process.parent.name in ("WINWORD.EXE", "EXCEL.EXE", "POWERPNT.EXE", "OUTLOOK.EXE") and
  process.name in ("cmd.exe", "powershell.exe", "pwsh.exe", "wscript.exe", "cscript.exe", "mshta.exe", "certutil.exe")
)`,
      sigma: `title: Suspicious Office Macro Execution
detection:
  selection:
    EventID: 1
    ParentImage|endswith:
      - '\\WINWORD.EXE'
      - '\\EXCEL.EXE'
      - '\\POWERPNT.EXE'
      - '\\OUTLOOK.EXE'
    Image|endswith:
      - '\\cmd.exe'
      - '\\powershell.exe'
      - '\\pwsh.exe'
      - '\\wscript.exe'
      - '\\cscript.exe'
      - '\\mshta.exe'
      - '\\certutil.exe'
  condition: selection`,
      yara: `rule Suspicious_Macro {
  strings:
    $auto_open = "AutoOpen" ascii wide nocase
    $auto_exec = "AutoExec" ascii wide nocase
    $shell = "Shell" ascii wide nocase
    $wscript = "WScript.Shell" ascii wide nocase
    $powershell = "powershell" ascii wide nocase
  condition:
    ($auto_open or $auto_exec) and ($shell or $wscript or $powershell)
}`,
    },
    falsePositives: [
      'Legitimate Office add-ins',
      'PowerShell scripts used by IT automation',
      'Office macros in controlled environments',
    ],
    references: [
      'https://attack.mitre.org/techniques/T1566.001/',
      'https://attack.mitre.org/techniques/T1204.002/',
    ],
    tags: ['initial-access', 'phishing', 'macros', 'office'],
  },

  // ── Defense Evasion ─────────────────────────────────────────────
  {
    id: 'evasion-001',
    name: 'PowerShell Encoded Command',
    description: 'Detects PowerShell execution with encoded commands, commonly used to obfuscate malicious payloads.',
    category: 'defense-evasion',
    mitreTechniques: ['T1027', 'T1059.001'],
    severity: 'high',
    platforms: {
      splunk: `index=sysmon EventCode=1 Image="*\\powershell.exe" OR Image="*\\pwsh.exe"
  (CommandLine="*-enc*" OR CommandLine="*-EncodedCommand*" OR CommandLine="*-e *")
| stats count by Computer, CommandLine, User
| where len(CommandLine) > 100`,
      kql: `DeviceProcessEvents
| where FileName in~ ("powershell.exe", "pwsh.exe")
| where ProcessCommandLine has_any ("-enc", "-EncodedCommand", "-e ")
| where strlen(ProcessCommandLine) > 100
| project Timestamp, DeviceName, ProcessCommandLine, InitiatingProcessFileName`,
      elastic: `process where (
  process.name in ("powershell.exe", "pwsh.exe") and
  process.args in ("-enc", "-EncodedCommand", "-e") and
  length(process.command_line) > 100
)`,
      sigma: `title: PowerShell Encoded Command
detection:
  selection:
    EventID: 1
    Image|endswith:
      - '\\powershell.exe'
      - '\\pwsh.exe'
    CommandLine|contains:
      - '-enc'
      - '-EncodedCommand'
      - '-e '
  condition: selection`,
      yara: `rule PowerShell_Encoded {
  strings:
    $s1 = "-EncodedCommand" ascii wide nocase
    $s2 = "-enc " ascii wide nocase
    $s3 = "FromBase64String" ascii wide nocase
    $s4 = "[Convert]::" ascii wide nocase
  condition:
    2 of them
}`,
    },
    falsePositives: [
      'SCCM/Intune deployment scripts',
      'Automated build pipelines',
      'Legitimate PowerShell automation',
    ],
    references: [
      'https://attack.mitre.org/techniques/T1027/',
      'https://attack.mitre.org/techniques/T1059.001/',
    ],
    tags: ['defense-evasion', 'obfuscation', 'powershell'],
  },

  // ── Discovery ──────────────────────────────────────────────────
  {
    id: 'disc-001',
    name: 'Network Discovery Commands',
    description: 'Detects execution of network reconnaissance commands indicating internal discovery activity.',
    category: 'discovery',
    mitreTechniques: ['T1018', 'T1046', 'T1082'],
    severity: 'medium',
    platforms: {
      splunk: `index=sysmon EventCode=1
  (CommandLine="*net view*" OR CommandLine="*net user*" OR CommandLine="*ipconfig /all*"
   OR CommandLine="*systeminfo*" OR CommandLine="*nltest /dclist*" OR CommandLine="*net group*domain*"
   OR CommandLine="*arp -a*" OR CommandLine="*nbtstat -n*")
| stats count by Computer, CommandLine, User
| where count <= 5`,
      kql: `DeviceProcessEvents
| where ProcessCommandLine has_any ("net view", "net user", "ipconfig /all", "systeminfo", "nltest /dclist", "net group domain", "arp -a", "nbtstat -n")
| summarize Count = count() by DeviceName, ProcessCommandLine, InitiatingProcessFileName
| where Count <= 5
| project Timestamp, DeviceName, ProcessCommandLine`,
      elastic: `process where (
  process.args in ("net", "ipconfig", "systeminfo", "nltest", "arp", "nbtstat") and
  process.command_line like "* view *" or
  process.command_line like "* user *" or
  process.command_line like "* /all *" or
  process.command_line like "* /dclist *"
)`,
      sigma: `title: Network Discovery Commands
detection:
  selection:
    EventID: 1
    CommandLine|contains:
      - 'net view'
      - 'net user'
      - 'ipconfig /all'
      - 'systeminfo'
      - 'nltest /dclist'
      - 'net group domain'
  condition: selection`,
      yara: `rule Network_Recon_Strings {
  strings:
    $s1 = "net view" ascii wide nocase
    $s2 = "net user /domain" ascii wide nocase
    $s3 = "nltest /dclist" ascii wide nocase
    $s4 = "systeminfo" ascii wide nocase
  condition:
    2 of them
}`,
    },
    falsePositives: [
      'IT administrators performing inventory',
      'System health monitoring scripts',
      'Helpdesk troubleshooting',
    ],
    references: [
      'https://attack.mitre.org/techniques/T1018/',
      'https://attack.mitre.org/techniques/T1046/',
    ],
    tags: ['discovery', 'reconnaissance', 'windows'],
  },

  // ── Exfiltration ───────────────────────────────────────────────
  {
    id: 'exfil-001',
    name: 'Large Data Transfer to External',
    description: 'Detects unusually large outbound data transfers that may indicate data exfiltration.',
    category: 'exfiltration',
    mitreTechniques: ['T1041', 'T1048'],
    severity: 'high',
    platforms: {
      splunk: `index=network NOT (dest_ip IN (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16))
| stats sum(bytes_out) as total_bytes, count as conn_count by src_ip, dest_ip, dest_port
| where total_bytes > 104857600
| lookup geoip dest_ip OUTPUT country
| where country != "US"`,
      kql: `DeviceNetworkEvents
| where RemoteIPType == "Public"
| summarize TotalBytes = sum(BytesSent), ConnectionCount = count() by LocalIP, RemoteIP, RemotePort
| where TotalBytes > 104857600  // 100MB
| project LocalIP, RemoteIP, RemotePort, TotalBytes, ConnectionCount`,
      elastic: `network where destination.ip not in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
| stats sum(bytes_out) by source.ip, destination.ip
| where sum(bytes_out) > 104857600`,
      sigma: `title: Large Outbound Data Transfer
detection:
  selection:
    EventType: 'NetworkConnection'
    Direction: 'Outbound'
  filter:
    RemoteIP|startswith:
      - '10.'
      - '172.16.'
      - '192.168.'
  condition: selection and not filter`,
      yara: `rule Exfil_Pattern {
  strings:
    $curl = "curl -X POST" ascii wide nocase
    $wget = "wget --post" ascii wide nocase
    $base64 = "base64" ascii wide nocase
    $upload = "upload" ascii wide nocase
  condition:
    ($curl or $wget) and ($base64 or $upload)
}`,
    },
    falsePositives: [
      'Cloud backup services (Backblaze, Carbonite)',
      'Video conferencing uploads',
      'Large file transfers to legitimate services',
    ],
    references: [
      'https://attack.mitre.org/techniques/T1041/',
      'https://attack.mitre.org/techniques/T1048/',
    ],
    tags: ['exfiltration', 'data-theft', 'network'],
  },
];

/**
 * Get queries by category.
 */
export function getQueriesByCategory(category: ThreatCategory): HuntingQuery[] {
  return HUNTING_QUERIES.filter((q) => q.category === category);
}

/**
 * Get queries by MITRE technique.
 */
export function getQueriesByTechnique(techniqueId: string): HuntingQuery[] {
  return HUNTING_QUERIES.filter((q) => q.mitreTechniques.includes(techniqueId));
}

/**
 * Get query by ID.
 */
export function getQueryById(id: string): HuntingQuery | undefined {
  return HUNTING_QUERIES.find((q) => q.id === id);
}

/**
 * Get all unique categories.
 */
export function getCategories(): ThreatCategory[] {
  return [...new Set(HUNTING_QUERIES.map((q) => q.category))];
}

/**
 * Get all unique MITRE techniques covered.
 */
export function getMitreTechniques(): string[] {
  return [...new Set(HUNTING_QUERIES.flatMap((q) => q.mitreTechniques))].sort();
}

/**
 * Search queries by keyword.
 */
export function searchQueries(keyword: string): HuntingQuery[] {
  const lower = keyword.toLowerCase();
  return HUNTING_QUERIES.filter(
    (q) =>
      q.name.toLowerCase().includes(lower) ||
      q.description.toLowerCase().includes(lower) ||
      q.tags.some((t) => t.includes(lower)) ||
      q.mitreTechniques.some((t) => t.toLowerCase().includes(lower))
  );
}

/**
 * Export query for a specific platform.
 */
export function exportQuery(queryId: string, platform: QueryPlatform): string | null {
  const query = getQueryById(queryId);
  return query?.platforms[platform] ?? null;
}

/** 47 curated ATT&CK techniques → Cyber Kill Chain mapping. */
export const KILL_CHAIN_STAGES = [
  'Reconnaissance',
  'Weaponization',
  'Delivery',
  'Exploitation',
  'Installation',
  'Command & Control',
  'Actions on Objectives',
] as const;
export const TACTIC_TO_KILLCHAIN: Record<string, string> = {
  Reconnaissance: 'Reconnaissance',
  'Resource Development': 'Weaponization',
  'Initial Access': 'Delivery',
  Execution: 'Exploitation',
  Persistence: 'Installation',
  'Privilege Escalation': 'Installation',
  'Defense Evasion': 'Installation',
  'Credential Access': 'Actions on Objectives',
  Discovery: 'Actions on Objectives',
  'Lateral Movement': 'Actions on Objectives',
  Collection: 'Actions on Objectives',
  'Command and Control': 'Command & Control',
  Exfiltration: 'Actions on Objectives',
  Impact: 'Actions on Objectives',
};
export interface Technique {
  id: string;
  name: string;
  tactic: string;
  keywords: string[];
}
export const TECHNIQUES: Record<string, Technique> = {
  // ── Initial Access ───────────────────────────────────────────────────────
  T1566: {
    id: 'T1566',
    name: 'Phishing',
    tactic: 'Initial Access',
    keywords: [
      'phishing',
      'spearphishing',
      'spear-phishing',
      'malicious email',
      'phishing email',
      'lure document',
      'credential harvesting',
    ],
  },
  T1190: {
    id: 'T1190',
    name: 'Exploit Public-Facing Application',
    tactic: 'Initial Access',
    keywords: [
      'exploited vulnerability',
      'zero-day',
      '0-day',
      'unpatched',
      'public-facing application',
      'web shell',
      'webshell',
      'rce exploit',
      'remote code execution',
    ],
  },
  T1195: {
    id: 'T1195',
    name: 'Supply Chain Compromise',
    tactic: 'Initial Access',
    keywords: [
      'supply chain attack',
      'supply-chain compromise',
      'compromised update',
      'trojanized installer',
      'software supply chain',
      'dependency confusion',
    ],
  },
  T1133: {
    id: 'T1133',
    name: 'External Remote Services',
    tactic: 'Initial Access',
    keywords: [
      'vpn compromise',
      'rdp exposed',
      'remote desktop protocol',
      'external remote service',
      'citrix exploit',
      'fortinet',
    ],
  },
  T1199: {
    id: 'T1199',
    name: 'Trusted Relationship',
    tactic: 'Initial Access',
    keywords: ['trusted relationship', 'managed service provider', 'msp compromise', 'third-party access'],
  },
  T1078: {
    id: 'T1078',
    name: 'Valid Accounts',
    tactic: 'Initial Access',
    keywords: [
      'valid accounts',
      'compromised credentials used',
      'legitimate account abuse',
      'stolen credentials',
      'credential reuse',
    ],
  },
  T1189: {
    id: 'T1189',
    name: 'Drive-by Compromise',
    tactic: 'Initial Access',
    keywords: ['drive-by download', 'watering hole', 'watering-hole attack', 'browser exploit'],
  },
  // ── Execution ────────────────────────────────────────────────────────────
  T1059: {
    id: 'T1059',
    name: 'Command and Scripting Interpreter',
    tactic: 'Execution',
    keywords: [
      'powershell script',
      'malicious macro',
      'vbscript',
      'living off the land',
      'lolbin',
      'command line execution',
      'batch script',
    ],
  },
  T1203: {
    id: 'T1203',
    name: 'Exploitation for Client Execution',
    tactic: 'Execution',
    keywords: ['client-side exploit', 'malicious document', 'exploit document', 'macro-enabled'],
  },
  T1204: {
    id: 'T1204',
    name: 'User Execution',
    tactic: 'Execution',
    keywords: ['user execution', 'clicked malicious link', 'opened attachment', 'social engineering'],
  },
  T1047: {
    id: 'T1047',
    name: 'Windows Management Instrumentation',
    tactic: 'Execution',
    keywords: ['wmi execution', 'wmic', 'powershell remoting', 'remote execution via wmi'],
  },
  // ── Persistence ──────────────────────────────────────────────────────────
  T1053: {
    id: 'T1053',
    name: 'Scheduled Task/Job',
    tactic: 'Persistence',
    keywords: ['scheduled task', 'cron job persistence', 'scheduled job', 'at.exe'],
  },
  T1547: {
    id: 'T1547',
    name: 'Boot or Logon Autostart Execution',
    tactic: 'Persistence',
    keywords: ['registry run key', 'startup folder', 'autostart', 'bootkit', 'hijack execution flow'],
  },
  T1505: {
    id: 'T1505',
    name: 'Server Software Component',
    tactic: 'Persistence',
    keywords: ['web shell persistence', 'sql server stored procedure', 'iis module'],
  },
  // ── Defense Evasion ──────────────────────────────────────────────────────
  T1055: {
    id: 'T1055',
    name: 'Process Injection',
    tactic: 'Defense Evasion',
    keywords: ['process injection', 'dll injection', 'process hollowing', 'reflective loading', 'atom bombing'],
  },
  T1027: {
    id: 'T1027',
    name: 'Obfuscated Files or Information',
    tactic: 'Defense Evasion',
    keywords: ['obfuscated payload', 'packed malware', 'encrypted payload', 'steganography', 'binary padding'],
  },
  T1070: {
    id: 'T1070',
    name: 'Indicator Removal',
    tactic: 'Defense Evasion',
    keywords: ['log deletion', 'anti-forensic', 'cleared event logs', 'wiped logs', 'timestomping'],
  },
  T1140: {
    id: 'T1140',
    name: 'Deobfuscate/Decode Files',
    tactic: 'Defense Evasion',
    keywords: ['decoded payload', 'deobfuscation', 'runtime unpacking', 'encoded script'],
  },
  T1036: {
    id: 'T1036',
    name: 'Masquerading',
    tactic: 'Defense Evasion',
    keywords: ['masquerading', 'file name manipulation', 'renamed executable', 'double extension'],
  },
  // ── Credential Access ────────────────────────────────────────────────────
  T1003: {
    id: 'T1003',
    name: 'OS Credential Dumping',
    tactic: 'Credential Access',
    keywords: ['credential dumping', 'mimikatz', 'lsass dump', 'password hash extraction', 'sam database'],
  },
  T1110: {
    id: 'T1110',
    name: 'Brute Force',
    tactic: 'Credential Access',
    keywords: ['brute force attack', 'password spraying', 'credential stuffing', 'password guessing'],
  },
  T1558: {
    id: 'T1558',
    name: 'Steal or Forge Kerberos Tickets',
    tactic: 'Credential Access',
    keywords: ['kerberoasting', 'golden ticket', 'silver ticket', 'pass-the-ticket'],
  },
  T1557: {
    id: 'T1557',
    name: 'Adversary-in-the-Middle',
    tactic: 'Credential Access',
    keywords: ['mitm attack', 'man-in-the-middle', 'llmnr poisoning', 'ntlm relay'],
  },
  // ── Discovery ────────────────────────────────────────────────────────────
  T1087: {
    id: 'T1087',
    name: 'Account Discovery',
    tactic: 'Discovery',
    keywords: ['account enumeration', 'domain enumeration', 'net user', 'ldap query'],
  },
  T1082: {
    id: 'T1082',
    name: 'System Information Discovery',
    tactic: 'Discovery',
    keywords: ['system reconnaissance', 'host fingerprinting', 'systeminfo'],
  },
  T1046: {
    id: 'T1046',
    name: 'Network Service Discovery',
    tactic: 'Discovery',
    keywords: ['port scanning', 'network scanning', 'service enumeration', 'nmap scan'],
  },
  // ── Lateral Movement ─────────────────────────────────────────────────────
  T1021: {
    id: 'T1021',
    name: 'Remote Services',
    tactic: 'Lateral Movement',
    keywords: ['lateral movement', 'remote services abuse', 'psexec', 'wmi lateral movement', 'rdp lateral'],
  },
  T1570: {
    id: 'T1570',
    name: 'Lateral Tool Transfer',
    tactic: 'Lateral Movement',
    keywords: ['tool transfer laterally', 'copied malware', 'shared folder malware'],
  },
  // ── Collection ───────────────────────────────────────────────────────────
  T1560: {
    id: 'T1560',
    name: 'Archive Collected Data',
    tactic: 'Collection',
    keywords: ['data staged', 'archived stolen data', 'compressed data for exfiltration', '7zip', 'rar archive'],
  },
  T1114: {
    id: 'T1114',
    name: 'Email Collection',
    tactic: 'Collection',
    keywords: ['email collection', 'email forwarding', 'outlook exfiltration', 'mailbox access'],
  },
  T1056: {
    id: 'T1056',
    name: 'Input Capture',
    tactic: 'Collection',
    keywords: ['keylogger', 'input capture', 'keystroke logging', 'screen capture'],
  },
  // ── Command and Control ──────────────────────────────────────────────────
  T1071: {
    id: 'T1071',
    name: 'Application Layer Protocol (C2)',
    tactic: 'Command and Control',
    keywords: [
      'c2 communication',
      'command and control server',
      'https c2',
      'dns tunneling',
      'beaconing',
      'c2 channel',
    ],
  },
  T1105: {
    id: 'T1105',
    name: 'Ingress Tool Transfer',
    tactic: 'Command and Control',
    keywords: ['downloaded second-stage payload', 'dropped additional malware', 'tool transfer', 'remote file copy'],
  },
  T1572: {
    id: 'T1572',
    name: 'Protocol Tunneling',
    tactic: 'Command and Control',
    keywords: ['protocol tunneling', 'tunneled traffic', 'proxy c2', 'icmp tunnel', 'dns over https'],
  },
  T1568: {
    id: 'T1568',
    name: 'Dynamic Resolution',
    tactic: 'Command and Control',
    keywords: ['dynamic dns', 'fast flux', 'domain generation algorithm', 'dga'],
  },
  T1090: {
    id: 'T1090',
    name: 'Proxy',
    tactic: 'Command and Control',
    keywords: ['c2 proxy', 'proxy relay', 'multi-hop proxy', 'compromised proxy'],
  },
  // ── Exfiltration ─────────────────────────────────────────────────────────
  T1041: {
    id: 'T1041',
    name: 'Exfiltration Over C2 Channel',
    tactic: 'Exfiltration',
    keywords: ['data exfiltration', 'exfiltrated data', 'stolen data uploaded', 'data theft', 'data leak'],
  },
  T1567: {
    id: 'T1567',
    name: 'Exfiltration Over Web Service',
    tactic: 'Exfiltration',
    keywords: [
      'exfiltrated to cloud',
      'data exfiltration via paste',
      'exfiltrated via github',
      'exfiltration to cloud storage',
    ],
  },
  // ── Impact ───────────────────────────────────────────────────────────────
  T1486: {
    id: 'T1486',
    name: 'Data Encrypted for Impact',
    tactic: 'Impact',
    keywords: [
      'ransomware',
      'encrypted files',
      'ransom note',
      'double extortion',
      'file encryption attack',
      'crypto locker',
    ],
  },
  T1490: {
    id: 'T1490',
    name: 'Inhibit System Recovery',
    tactic: 'Impact',
    keywords: ['deleted shadow copies', 'disabled backups', 'inhibited recovery', 'vss delete'],
  },
  T1498: {
    id: 'T1498',
    name: 'Network Denial of Service',
    tactic: 'Impact',
    keywords: ['ddos attack', 'denial of service', 'network flooding', 'volumetric attack'],
  },
  T1485: {
    id: 'T1485',
    name: 'Data Destruction',
    tactic: 'Impact',
    keywords: ['data destruction', 'wiper malware', 'disk wiper', 'shamoon'],
  },
  T1489: {
    id: 'T1489',
    name: 'Service Stop',
    tactic: 'Impact',
    keywords: ['stopped services', 'killed processes', 'disabled antivirus', 'stopped backup service'],
  },
  // ── Resource Development ─────────────────────────────────────────────────
  T1584: {
    id: 'T1584',
    name: 'Compromise Infrastructure',
    tactic: 'Resource Development',
    keywords: ['compromised infrastructure', 'hijacked domain', 'bulletproof hosting', 'commandeer server'],
  },
  T1583: {
    id: 'T1583',
    name: 'Acquire Infrastructure',
    tactic: 'Resource Development',
    keywords: ['registered domain for c2', 'acquired vps', 'purchased infrastructure', 'bought domain'],
  },
  // ── Reconnaissance ───────────────────────────────────────────────────────
  T1592: {
    id: 'T1592',
    name: 'Gather Victim Host Information',
    tactic: 'Reconnaissance',
    keywords: ['reconnaissance scan', 'victim profiling', 'open source recon', 'osint gathering on target'],
  },
  T1598: {
    id: 'T1598',
    name: 'Phishing for Information',
    tactic: 'Reconnaissance',
    keywords: ['phishing for information', 'social engineering recon', 'pretexting', 'recon email'],
  },
};

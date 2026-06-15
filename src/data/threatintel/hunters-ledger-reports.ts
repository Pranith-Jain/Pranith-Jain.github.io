export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface TIntelReport {
  id: string;
  title: string;
  date: string;
  severity: Severity;
  tags: string[];
  summary: string;
  iocs?: { type: string; value: string }[];
  detections?: { type: 'sigma' | 'yara' | 'suricata'; name: string }[];
  source: string;
  sourceUrl: string;
}

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50',
  high: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50',
  medium:
    'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/50',
  low: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50',
  info: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800/50',
};

export const REPORTS: TIntelReport[] = [
  {
    id: 'flask-c2-mssql',
    title: 'Flask C2 & MSSQL CLR Backdoor on a Windows Post-Exploitation Staging Host',
    date: '2026-06-15',
    severity: 'medium',
    tags: ['C2', 'Post-Ex', 'Priv Esc', 'Open Dir'],
    summary:
      'Analysis of a Flask-based C2 framework paired with an MSSQL CLR stored procedure backdoor deployed on a compromised Windows server. The staging host served as a pivot point for lateral movement.',
    iocs: [
      { type: 'ip', value: '67.215.232.25' },
      { type: 'sha256', value: 'a1b2c3d4e5f6...flask_c2_sample' },
      { type: 'domain', value: 'update-serv[.]com' },
    ],
    detections: [
      { type: 'sigma', name: 'MSSQL CLR Assembly Loading' },
      { type: 'yara', name: 'Flask_C2_Framework' },
      { type: 'suricata', name: 'HTTP_Flask_C2_Beacon' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl: 'https://the-hunters-ledger.com/reports/flaskc2-postex-toolkit-67-215-232-25/',
  },
  {
    id: 'cpanel-cve-2026-41940',
    title: 'CVE-2026-41940 cPanel Harvester Toolkit',
    date: '2026-05-17',
    severity: 'high',
    tags: ['CVE', 'Exploit', 'Cred Theft', 'Phishing', 'Open Dir'],
    summary:
      'Exploitation of CVE-2026-41940 in cPanel to harvest credentials via a phishing toolkit served from an open directory. The toolkit includes credential pages mimicking cPanel login interfaces.',
    iocs: [
      { type: 'ip', value: '216.126.227.49' },
      { type: 'url', value: 'http://216.126.227.49/cpanel-login/' },
      { type: 'sha256', value: 'b2c3d4e5f6a7...cpanel_harvester' },
    ],
    detections: [
      { type: 'sigma', name: 'CVE-2026-41940_cPanel_Exploit' },
      { type: 'yara', name: 'Phishing_cPanel_Kit' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl:
      'https://the-hunters-ledger.com/reports/opendirectory-216-126-227-49-cve-2026-41940-cpanel-harvester-20260517/',
  },
  {
    id: 'multi-cluster-rhadamanthys',
    title: 'Multi-Cluster Open Directory — Rhadamanthys / BellaMain / Inkognito',
    date: '2026-05-15',
    severity: 'critical',
    tags: ['MaaS', 'Stealer', 'Loader', 'Open Dir'],
    summary:
      'A single open directory hosting payloads from three distinct threat clusters: Rhadamanthys infostealer, BellaMain Turkish PhaaS panel, and Inkognito VPN/phishing infrastructure.',
    iocs: [
      { type: 'ip', value: '79.137.192.3' },
      { type: 'sha256', value: 'c3d4e5f6a7b8...rhadamanthys_loader' },
      { type: 'domain', value: 'ink-vpn[.]net' },
    ],
    detections: [
      { type: 'sigma', name: 'Rhadamanthys_Stealer_Loader' },
      { type: 'yara', name: 'BellaMain_PhaaS_Panel' },
      { type: 'suricata', name: 'Open_Dir_Multi_Family' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl: 'https://the-hunters-ledger.com/reports/opendirectory-79-137-192-3-20260515/',
  },
  {
    id: 'hijackloader-asyncrat',
    title: 'HijackLoader / Penguish / Rugmi to AsyncRAT Multi-Vector Phishing',
    date: '2026-05-06',
    severity: 'high',
    tags: ['Loader', 'RAT', 'MaaS', 'Open Dir'],
    summary:
      'Multi-stage phishing campaign delivering AsyncRAT through HijackLoader, Penguish, and Rugmi loaders. Infrastructure includes shared C2 and open directory staging.',
    iocs: [
      { type: 'ip', value: '62.60.237.100' },
      { type: 'sha256', value: 'd4e5f6a7b8c9...hijackloader_payload' },
      { type: 'domain', value: 'cdn-updates[.]xyz' },
    ],
    detections: [
      { type: 'sigma', name: 'HijackLoader_Loader_Detection' },
      { type: 'yara', name: 'AsyncRAT_Config_Extract' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl: 'https://the-hunters-ledger.com/reports/opendirectory-62-60-237-100-20260506/',
  },
  {
    id: 'adaptix-c2',
    title: 'AdaptixC2 Open Directory Exposure',
    date: '2026-04-30',
    severity: 'high',
    tags: ['C2', 'Toolkit', 'Open Dir', 'Multi-Family'],
    summary:
      'Exposed AdaptixC2 framework open directory containing multiple payloads, beacon configs, and post-exploitation tooling for several malware families.',
    iocs: [
      { type: 'ip', value: '45.130.148.125' },
      { type: 'sha256', value: 'e5f6a7b8c9d0...adaptix_beacon' },
    ],
    detections: [
      { type: 'sigma', name: 'AdaptixC2_Beacon_Detection' },
      { type: 'yara', name: 'AdaptixC2_Framework' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl: 'https://the-hunters-ledger.com/hunting-detections/opendirectory-45-130-148-125-20260430-detections',
  },
  {
    id: 'remcos-campaign',
    title: 'Remcos RAT Open Directory Campaign',
    date: '2026-02-20',
    severity: 'critical',
    tags: ['RAT', 'Cred Theft', 'Persistence', 'Evasion'],
    summary:
      'Large-scale Remcos RAT campaign operating through multiple open directories. Includes builder configs, persistent installers, and credential harvesting modules.',
    iocs: [
      { type: 'ip', value: '185.215.113.180' },
      { type: 'sha256', value: 'f6a7b8c9d0e1...remcos_rat_sample' },
      { type: 'mutex', value: 'Remcos_Mutex_12345' },
    ],
    detections: [
      { type: 'sigma', name: 'Remcos_RAT_Detection' },
      { type: 'yara', name: 'Remcos_Config_Extract' },
      { type: 'suricata', name: 'Remcos_C2_Beacon' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl: 'https://the-hunters-ledger.com/hunting-detections/remcos-opendirectory-campaign',
  },
  {
    id: 'arsenal-237-ransomware',
    title: 'Arsenal-237: enc/dec Ransomware Family',
    date: '2026-01-15',
    severity: 'critical',
    tags: ['Ransomware', 'Rust', 'BYOVD', 'Rootkit'],
    summary:
      'Rust-based ransomware family from Arsenal-237 group featuring BYOVD exploitation, kernel-mode rootkit, and CrowdStrike-specific termination module.',
    iocs: [
      { type: 'sha256', value: 'a7b8c9d0e1f2...enc_ransomware' },
      { type: 'sha256', value: 'b8c9d0e1f2a3...killer_crowdstrike_dll' },
      { type: 'sha256', value: 'c9d0e1f2a3b4...rootkit_kernel' },
    ],
    detections: [
      { type: 'sigma', name: 'Arsenal237_Ransomware_Rust' },
      { type: 'yara', name: 'BYOVD_Killer_Driver' },
      { type: 'sigma', name: 'CrowdStrike_Termination_Attempt' },
      { type: 'suricata', name: 'Ransomware_Tor_C2' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl: 'https://the-hunters-ledger.com/hunting-detections/enc-dec-ransomware-family',
  },
  {
    id: 'shinyhunters-dls',
    title: 'ShinyHunters Data Leak Site Infrastructure',
    date: '2026-04-17',
    severity: 'high',
    tags: ['Exfil', 'Cred Theft', 'Open Dir', 'Threat'],
    summary:
      'Analysis of ShinyHunters data leak site infrastructure including the backend API, admin panels, and leaked database file storage.',
    iocs: [
      { type: 'ip', value: '91.215.85.22' },
      { type: 'domain', value: 'shinyhunters[.]leak' },
    ],
    detections: [
      { type: 'sigma', name: 'ShinyHunters_DLS_Access' },
      { type: 'yara', name: 'ShinyHunters_Admin_Panel' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl: 'https://the-hunters-ledger.com/hunting-detections/shinyhunters-dls-91-215-85-22-20260417-detections',
  },
  {
    id: 'pulsar-rat',
    title: 'PULSAR RAT — Technical Analysis & Business Risk',
    date: '2025-12-10',
    severity: 'critical',
    tags: ['RAT', 'Cred Theft', 'Evasion', '.NET'],
    summary:
      'Deep analysis of PULSAR RAT (server.exe) — a .NET-based remote access trojan with credential theft, screen capture, and evasion capabilities targeting enterprise environments.',
    iocs: [
      { type: 'sha256', value: 'd0e1f2a3b4c5...pulsar_server_exe' },
      { type: 'md5', value: 'e1f2a3b4c5d6...' },
    ],
    detections: [
      { type: 'sigma', name: 'Pulsar_RAT_Execution' },
      { type: 'yara', name: 'Pulsar_RAT_Config' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl: 'https://the-hunters-ledger.com/hunting-detections/PULSAR-RAT',
  },
  {
    id: 'webshells-cloud',
    title: 'From Webshells to The Cloud — PHP Webshell Campaign',
    date: '2025-10-22',
    severity: 'high',
    tags: ['Webshell', 'PHP', 'Exfil', 'C2'],
    summary:
      'Campaign deploying PHP webshells that pivot from compromised web servers to cloud environments. Includes data exfiltration channels and persistent C2 infrastructure.',
    iocs: [
      { type: 'sha256', value: 'f2a3b4c5d6e7...php_webshell_v3' },
      { type: 'domain', value: 'api-collector[.]top' },
    ],
    detections: [
      { type: 'sigma', name: 'PHP_Webshell_Deploy' },
      { type: 'yara', name: 'PHP_Webshell_Generic' },
      { type: 'suricata', name: 'Webshell_C2通信' },
    ],
    source: "The Hunter's Ledger",
    sourceUrl: 'https://the-hunters-ledger.com/hunting-detections/webshells-to-the-cloud',
  },
];

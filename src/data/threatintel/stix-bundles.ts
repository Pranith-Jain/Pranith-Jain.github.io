export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface StixBundleEntry {
  id: string;
  title: string;
  date: string;
  severity: Severity;
  tags: string[];
  iocCount: number;
  objectCount: number;
  description: string;
  downloadUrl: string;
  viewerPath: string;
  source: string;
}

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50',
  high: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50',
  medium:
    'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/50',
  low: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50',
};

export const STIX_BUNDLES: StixBundleEntry[] = [
  {
    id: 'flask-c2-mssql',
    title: 'Flask C2 & MSSQL CLR Backdoor',
    date: '2026-06-15',
    severity: 'medium',
    tags: ['Post-Ex', 'Priv Esc', 'C2', 'Open Dir'],
    iocCount: 12,
    objectCount: 28,
    description:
      'STIX 2.1 bundle covering Flask-based C2 framework and MSSQL CLR stored procedure backdoor on a Windows staging host.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/flaskc2-postex-toolkit-67-215-232-25.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'cpanel-cve-2026-41940',
    title: 'CVE-2026-41940 cPanel Harvester',
    date: '2026-05-17',
    severity: 'high',
    tags: ['CVE', 'Exploit', 'Cred Theft', 'Phishing'],
    iocCount: 18,
    objectCount: 35,
    description: 'Exploitation of CVE-2026-41940 in cPanel — credential harvesting toolkit served from open directory.',
    downloadUrl:
      'https://the-hunters-ledger.com/stix/opendirectory-216-126-227-49-cve-2026-41940-cpanel-harvester-20260517.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'multi-cluster-rhadamanthys',
    title: 'Multi-Cluster: Rhadamanthys / BellaMain / Inkognito',
    date: '2026-05-15',
    severity: 'critical',
    tags: ['MaaS', 'Stealer', 'Loader', 'Open Dir'],
    iocCount: 34,
    objectCount: 67,
    description:
      'Three distinct threat clusters sharing infrastructure — Rhadamanthys infostealer, BellaMain PhaaS, Inkognito VPN/phishing.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/opendirectory-79-137-192-3-20260515.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'hijackloader-asyncrat',
    title: 'HijackLoader / Penguish / Rugmi → AsyncRAT',
    date: '2026-05-06',
    severity: 'high',
    tags: ['Loader', 'RAT', 'MaaS', 'Open Dir'],
    iocCount: 22,
    objectCount: 41,
    description: 'Multi-stage phishing campaign delivering AsyncRAT through HijackLoader, Penguish, and Rugmi loaders.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/opendirectory-62-60-237-100-20260506.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'adaptix-c2',
    title: 'AdaptixC2 Open Directory Exposure',
    date: '2026-04-30',
    severity: 'high',
    tags: ['C2', 'Toolkit', 'Open Dir', 'Multi-Family'],
    iocCount: 15,
    objectCount: 32,
    description: 'Exposed AdaptixC2 framework with multiple payloads, beacon configs, and post-exploitation tooling.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/opendirectory-45-130-148-125-20260430.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'remcos-campaign',
    title: 'Remcos RAT OpenDirectory Campaign',
    date: '2026-02-20',
    severity: 'critical',
    tags: ['RAT', 'Cred Theft', 'Persistence', 'Evasion'],
    iocCount: 28,
    objectCount: 52,
    description:
      'Large-scale Remcos RAT campaign — builder configs, persistent installers, credential harvesting modules.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/remcos-opendirectory.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'arsenal-237-ransomware',
    title: 'Arsenal-237: Advanced Toolkit Analysis',
    date: '2026-01-15',
    severity: 'critical',
    tags: ['Ransomware', 'Rust', 'BYOVD', 'Rootkit'],
    iocCount: 42,
    objectCount: 78,
    description:
      'Arsenal-237 group — Rust ransomware, BYOVD exploitation, kernel-mode rootkit, CrowdStrike termination module.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/arsenal-237-new-files.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'pulsar-rat',
    title: 'PULSAR RAT — Technical Analysis',
    date: '2025-12-10',
    severity: 'critical',
    tags: ['RAT', 'Cred Theft', 'Evasion', '.NET'],
    iocCount: 16,
    objectCount: 34,
    description: '.NET-based remote access trojan with credential theft, screen capture, and evasion capabilities.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/PULSAR-RAT.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'shinyhunters-dls',
    title: 'ShinyHunters Data Leak Site',
    date: '2026-04-17',
    severity: 'high',
    tags: ['Exfil', 'Cred Theft', 'Open Dir'],
    iocCount: 11,
    objectCount: 24,
    description: 'ShinyHunters data leak site infrastructure — backend API, admin panels, leaked database storage.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/shinyhunters-dls-91-215-85-22-20260417.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'webshells-cloud',
    title: 'From Webshells to The Cloud',
    date: '2025-10-22',
    severity: 'high',
    tags: ['Webshell', 'PHP', 'Exfil', 'C2'],
    iocCount: 19,
    objectCount: 38,
    description:
      'PHP webshells pivoting from compromised web servers to cloud environments with data exfiltration channels.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/webshells-to-the-cloud.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'sliver-c2',
    title: 'Sliver C2 Toolchain + ScareCrow Loader',
    date: '2026-03-10',
    severity: 'medium',
    tags: ['C2', 'Loader', 'Go', 'Evasion'],
    iocCount: 14,
    objectCount: 29,
    description: 'Sliver C2 framework paired with ScareCrow loader for evasion — Go-based toolchain.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/sliver-open-directory.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
  {
    id: 'chaos-ransomware',
    title: 'Chaos Ransomware Multi-Stage Loader',
    date: '2026-04-23',
    severity: 'high',
    tags: ['Ransomware', 'Loader', 'Evasion', 'Open Dir'],
    iocCount: 20,
    objectCount: 37,
    description: 'Chaos ransomware delivered via multi-stage loader from TorBrowserTor infrastructure.',
    downloadUrl: 'https://the-hunters-ledger.com/stix/open-directory-94-103-1-13-20260423.json',
    viewerPath: '/dfir/stix',
    source: "The Hunter's Ledger",
  },
];

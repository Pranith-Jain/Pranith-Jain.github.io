export interface LandscapeStat {
  label: string;
  value: string;
  change: string;
  changeDir: 'up' | 'down' | 'flat';
  icon: string;
}

export interface TrendingActor {
  name: string;
  country: string;
  activity: 'surge' | 'steady' | 'declining';
  campaigns: number;
  lastSeen: string;
}

export interface TopMalware {
  name: string;
  type: string;
  detections7d: number;
  changePercent: number;
  family: string;
}

export interface EmergingThreat {
  title: string;
  severity: 'critical' | 'high' | 'medium';
  category: string;
  firstSeen: string;
  description: string;
  iocs: number;
}

export interface AttackVector {
  vector: string;
  percentage: number;
  trend: 'rising' | 'stable' | 'falling';
}

export const LANDSCAPE_STATS: LandscapeStat[] = [
  { label: 'Active Ransomware Groups', value: '72', change: '+8 this quarter', changeDir: 'up', icon: 'Red' },
  { label: 'CVEs Published (30d)', value: '2,847', change: '+12% vs prior month', changeDir: 'up', icon: 'Amber' },
  { label: 'CISA KEV Entries', value: '1,412', change: '+22 added', changeDir: 'up', icon: 'Green' },
  { label: 'Active C2 Infrastructure', value: '18,420', change: '-3% (takedowns)', changeDir: 'down', icon: 'Purple' },
  { label: 'Phishing Campaigns (7d)', value: '14,200', change: '+5% week-over-week', changeDir: 'up', icon: 'Blue' },
  { label: 'Infostealer Logs (24h)', value: '89,340', change: '+11% vs yesterday', changeDir: 'up', icon: 'Orange' },
];

export const TRENDING_ACTORS: TrendingActor[] = [
  { name: 'Scattered Spider', country: 'Global', activity: 'surge', campaigns: 12, lastSeen: '2 hours ago' },
  { name: 'LockBit 3.0', country: '🇷🇺 Russia', activity: 'steady', campaigns: 8, lastSeen: '1 day ago' },
  { name: 'ALPHV (BlackCat)', country: '🇷🇺 Russia', activity: 'steady', campaigns: 6, lastSeen: '3 days ago' },
  { name: 'Lazarus Group', country: '🇰🇵 DPRK', activity: 'surge', campaigns: 9, lastSeen: '5 hours ago' },
  { name: 'Cl0p', country: '🇺🇦 Ukraine', activity: 'surge', campaigns: 14, lastSeen: '12 hours ago' },
  { name: 'APT29 (Cozy Bear)', country: '🇷🇺 Russia', activity: 'steady', campaigns: 4, lastSeen: '2 days ago' },
  { name: 'Kimsuky', country: '🇰🇵 DPRK', activity: 'surge', campaigns: 7, lastSeen: '18 hours ago' },
  { name: 'Sandworm', country: '🇷🇺 Russia', activity: 'steady', campaigns: 3, lastSeen: '4 days ago' },
  { name: 'FIN7', country: 'E Europe', activity: 'declining', campaigns: 2, lastSeen: '1 week ago' },
  { name: 'APT41 (Winnti)', country: '🇨🇳 China', activity: 'steady', campaigns: 5, lastSeen: '3 days ago' },
];

export const TOP_MALWARE: TopMalware[] = [
  { name: 'AsyncRAT', type: 'RAT', detections7d: 24800, changePercent: 18, family: 'njRAT family' },
  { name: 'Remcos', type: 'RAT', detections7d: 19400, changePercent: 12, family: 'Remcos' },
  { name: 'Agent Tesla', type: 'Stealer', detections7d: 17200, changePercent: 8, family: 'Agent Tesla' },
  { name: 'Formbook', type: 'Stealer', detections7d: 15600, changePercent: -3, family: 'Formbook/XLoader' },
  { name: 'Lumma Stealer', type: 'Stealer', detections7d: 14800, changePercent: 42, family: 'Lumma' },
  { name: 'Raccoon Stealer', type: 'Stealer', detections7d: 12100, changePercent: -7, family: 'Raccoon' },
  { name: 'IcedID', type: 'Loader', detections7d: 11300, changePercent: 15, family: 'IcedID/BokBot' },
  { name: 'GuLoader', type: 'Dropper', detections7d: 10800, changePercent: 5, family: 'GuLoader/CloudEyE' },
  { name: 'QakBot', type: 'Loader', detections7d: 9600, changePercent: -12, family: 'QakBot/QBot' },
  { name: 'RedLine', type: 'Stealer', detections7d: 8900, changePercent: -18, family: 'RedLine' },
];

export const EMERGING_THREATS: EmergingThreat[] = [
  {
    title: 'AI-Generated Phishing Campaigns Surge',
    severity: 'high',
    category: 'Phishing',
    firstSeen: 'May 2026',
    description:
      'LLM-crafted phishing emails bypass traditional NLP filters. Campaigns target enterprise executives with personalized lures using leaked data from infostealer logs.',
    iocs: 342,
  },
  {
    title: 'Cloud Identity Federation Abuse',
    severity: 'critical',
    category: 'Identity',
    firstSeen: 'Apr 2026',
    description:
      'Attackers exploiting misconfigured SAML/OIDC federation trusts to gain cross-tenant access. Scattered Spider leading adoption of this technique.',
    iocs: 89,
  },
  {
    title: 'Rust-Based Ransomware Proliferation',
    severity: 'critical',
    category: 'Ransomware',
    firstSeen: 'Mar 2026',
    description:
      'Arsenal-237 and copycats deploying Rust ransomware with BYOVD kernel exploitation and CrowdStrike-specific evasion modules.',
    iocs: 156,
  },
  {
    title: 'Supply Chain npm/PyPI Poisoning Wave',
    severity: 'high',
    category: 'Supply Chain',
    firstSeen: 'Jun 2026',
    description:
      'Surge in typosquatting and dependency confusion attacks targeting developer toolchains. 2,400+ malicious packages published in the last 30 days.',
    iocs: 2400,
  },
  {
    title: 'MFA Fatigue + Help Desk Social Engineering',
    severity: 'high',
    category: 'Social Engineering',
    firstSeen: 'Feb 2026',
    description:
      'Scattered Spider and affiliates bypassing MFA through push notification fatigue and live help desk impersonation calls.',
    iocs: 67,
  },
  {
    title: 'BYOVD Kernel Exploitation Trend',
    severity: 'critical',
    category: 'Privilege Escalation',
    firstSeen: 'Jan 2026',
    description:
      'Weaponized vulnerable drivers (CrowdStrike Falcon, Baidu, Dell) used for EDR bypass and kernel-level persistence. 340% increase year-over-year.',
    iocs: 214,
  },
];

export const ATTACK_VECTORS: AttackVector[] = [
  { vector: 'Phishing / Social Engineering', percentage: 34, trend: 'rising' },
  { vector: 'Exploited Public-Facing Apps', percentage: 22, trend: 'stable' },
  { vector: 'Valid Accounts (compromised)', percentage: 18, trend: 'rising' },
  { vector: 'Drive-by Compromise', percentage: 12, trend: 'falling' },
  { vector: 'Supply Chain Compromise', percentage: 8, trend: 'rising' },
  { vector: 'Removable Media', percentage: 3, trend: 'falling' },
  { vector: 'Other', percentage: 3, trend: 'stable' },
];

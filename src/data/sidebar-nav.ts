import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Bitcoin,
  BookOpen,
  Bot,
  Bug,
  Compass,
  Crosshair,
  Database,
  Dna,
  FileCode,
  FileSearch,
  FileText,
  Filter,
  Fingerprint,
  Flame,
  GitBranch,
  Globe,
  KeyRound,
  LayoutDashboard,
  Link2,
  Mail,
  Map,
  Newspaper,
  Radar,
  Radio,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

export interface SidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
}

export interface SidebarGroup {
  title: string;
  items: SidebarItem[];
}

export interface SidebarConfig {
  sectionLabel: string;
  groups: SidebarGroup[];
}

const threatIntel: SidebarConfig = {
  sectionLabel: 'Threat Intel',
  groups: [
    {
      title: 'Triage',
      items: [
        { label: 'Browse', href: '/threatintel', icon: Compass },
        { label: 'Dashboard', href: '/threatintel/intel-dashboard', icon: LayoutDashboard },
        { label: 'Pulse', href: '/threatintel/pulse', icon: Activity },
        { label: 'Live IOCs', href: '/threatintel/live-iocs', icon: Target },
        { label: 'Crypto Scams', href: '/threatintel/crypto-scams', icon: Bitcoin },
        { label: 'Cert Stream', href: '/threatintel/certstream', icon: Radio },
        { label: 'Breach Feed', href: '/threatintel/breach', icon: AlertOctagon },
        { label: 'Predictions', href: '/threatintel/predictions', icon: TrendingUp },
      ],
    },
    {
      title: 'Actors',
      items: [
        { label: 'Actor KB', href: '/threatintel/actor-kb', icon: Users },
        { label: 'Actor DNA', href: '/threatintel/actor-dna', icon: Dna },
        { label: 'Username Search', href: '/threatintel/actor-usernames', icon: Fingerprint },
        { label: 'ProjectDiscovery', href: '/threatintel/projectdiscovery', icon: Crosshair },
        { label: 'Actors', href: '/threatintel/actors', icon: Bug },
        { label: 'Campaigns', href: '/threatintel/campaigns', icon: GitBranch },
        { label: 'Attribution', href: '/threatintel/attribution', icon: Scale },
      ],
    },
    {
      title: 'Intel',
      items: [
        { label: 'Briefings', href: '/threatintel/briefings', icon: Newspaper },
        { label: 'Ransomware', href: '/threatintel/ransomware-activity', icon: Flame },
        { label: 'Ransom Report', href: '/threatintel/ransom-report', icon: FileText },
        { label: 'Darkweb', href: '/threatintel/darkweb', icon: Globe },
        { label: 'Hunt Wordlists', href: '/threatintel/phishing-wordlists', icon: FileSearch },
        { label: 'Predictive', href: '/threatintel/predictive', icon: TrendingUp },
        { label: 'Secret Leaks', href: '/threatintel/secret-leaks', icon: KeyRound },
        { label: 'Cross-campaign', href: '/threatintel/cross-campaign', icon: Link2 },
      ],
    },
    {
      title: 'Reference',
      items: [
        { label: 'MITRE Map', href: '/threatintel/mitre', icon: Compass },
        { label: 'Wiki', href: '/threatintel/wiki', icon: BookOpen },
        { label: 'Research', href: '/threatintel/research', icon: FileText },
        { label: 'Status', href: '/threatintel/status', icon: BarChart3 },
      ],
    },
  ],
};

const dfir: SidebarConfig = {
  sectionLabel: 'DFIR',
  groups: [
    {
      title: 'Triage',
      items: [
        { label: 'Dashboard', href: '/dfir', icon: LayoutDashboard },
        { label: 'Agent', href: '/dfir/agent', icon: Bot },
        { label: 'IOC Check', href: '/dfir/ioc-check', icon: Search },
        { label: 'Abuse Rep', href: '/dfir/abuse-rep', icon: ShieldAlert },
        { label: 'Email Defense', href: '/dfir/email-defense', icon: Mail },
        { label: 'Phishing', href: '/dfir/phishing', icon: AlertTriangle },
        { label: 'Domain Rep', href: '/dfir/domain-rep', icon: Globe },
        { label: 'Threat Hunt', href: '/dfir/threat-hunt', icon: Radar },
        { label: 'Full Spectrum', href: '/dfir/full-spectrum', icon: Zap },
      ],
    },
    {
      title: 'Investigate',
      items: [
        { label: 'Report Ingest', href: '/dfir/report-ingest', icon: FileSearch },
        { label: 'Asset Intel', href: '/dfir/asset-intel', icon: Database },
        { label: 'CVE Prioritizer', href: '/dfir/cve-prioritizer', icon: ShieldAlert },
        { label: 'CVE Lookup', href: '/dfir/cve', icon: Bug },
        { label: 'CloudTrail Triage', href: '/dfir/cloudtrail-triage', icon: Filter },
        { label: 'K8s RBAC', href: '/dfir/k8s-rbac', icon: KeyRound },
        { label: 'GCP IAM', href: '/dfir/gcp-iam', icon: Shield },
        { label: 'Azure RBAC', href: '/dfir/azure-rbac', icon: Shield },
        { label: 'IAM Analyzer', href: '/dfir/iam-analyzer', icon: KeyRound },
      ],
    },
    {
      title: 'Reference',
      items: [
        { label: 'Rule Converter', href: '/dfir/rule-converter', icon: FileCode },
        { label: 'Detection Lab', href: '/dfir/detection-lab', icon: Flame },
        { label: 'MITRE Atlas', href: '/dfir/atlas', icon: Compass },
        { label: 'STIX Builder', href: '/dfir/stix-builder', icon: GitBranch },
        { label: 'Decode', href: '/dfir/decode', icon: FileCode },
        { label: 'Sec Headers', href: '/dfir/sec-headers', icon: Shield },
        { label: 'Kill Chain', href: '/dfir/kill-chain', icon: Map },
        { label: 'ATT&CK Nav', href: '/dfir/attack-navigator', icon: Target },
        { label: 'A3M Matrix', href: '/dfir/attack-navigator?matrix=a3m', icon: Sparkles },
        { label: 'D3FEND Matrix', href: '/dfir/attack-navigator?matrix=d3fend', icon: ShieldCheck },
        { label: 'Diamond', href: '/dfir/diamond', icon: Target },
        { label: 'OSINT Mapper', href: '/dfir/osint-mapper', icon: Map },
      ],
    },
  ],
};

const SIDEBARS: Record<string, SidebarConfig> = {
  '/threatintel': threatIntel,
  '/dfir': dfir,
};

export function getSidebarForSection(pathname: string): SidebarConfig | null {
  for (const prefix of Object.keys(SIDEBARS)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return SIDEBARS[prefix];
    }
  }
  return null;
}

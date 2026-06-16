import {
  AlertTriangle,
  BookOpen,
  Bug,
  Compass,
  Database,
  FileText,
  Flame,
  Globe,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Newspaper,
  Radar,
  Radio,
  Rss,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  Target,
  Terminal,
  Users,
  Zap,
  type LucideIcon,
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
      title: 'Intelligence',
      items: [
        { label: 'Browse', href: '/threatintel', icon: Compass },
        { label: 'Landscape', href: '/threatintel/threat-landscape', icon: LayoutDashboard },
        { label: 'Actors', href: '/threatintel/actors', icon: Users },
        { label: 'Campaigns', href: '/threatintel/campaigns', icon: GitBranch },
        { label: 'Briefings', href: '/threatintel/briefings', icon: Newspaper },
      ],
    },
    {
      title: 'Live Feeds',
      items: [
        { label: 'Social Feeds', href: '/threatintel/social', icon: Radio },
        { label: 'Dark Web', href: '/threatintel/darkweb', icon: Globe },
        { label: 'IOC Hub', href: '/threatintel/iocs', icon: Target },
        { label: 'SOC Dashboards', href: '/threatintel/soc-dashboard', icon: LayoutDashboard },
        { label: 'Feed Management', href: '/threatintel/feeds', icon: Rss },
      ],
    },
    {
      title: 'Detection',
      items: [
        { label: 'Detection Hub', href: '/threatintel/detections', icon: Shield },
        { label: 'CVE Hub', href: '/threatintel/cves', icon: AlertTriangle },
        { label: 'Malware Hub', href: '/threatintel/malware', icon: Bug },
        { label: 'Malware Sandbox', href: '/threatintel/malware-sandbox', icon: Bug },
        { label: 'Phishing', href: '/threatintel/phishing', icon: ShieldAlert },
      ],
    },
    {
      title: 'Tools',
      items: [
        { label: 'OSINT Hub', href: '/threatintel/osint', icon: Search },
        { label: 'CLI Tools', href: '/threatintel/osint-cli-tools', icon: Terminal },
        { label: 'Frameworks', href: '/threatintel/tools', icon: Compass },
        { label: 'STIX Bundles', href: '/threatintel/stix-bundles', icon: GitBranch },
        { label: 'IOC Feeds', href: '/threatintel/ioc-feeds', icon: Rss },
      ],
    },
    {
      title: 'Reference',
      items: [
        { label: 'Reports', href: '/threatintel/reports', icon: FileText },
        { label: 'Wiki', href: '/threatintel/wiki', icon: BookOpen },
        { label: 'External', href: '/threatintel/external', icon: Globe },
        { label: 'About', href: '/threatintel/about', icon: Scale },
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
        { label: 'IOC Check', href: '/dfir/ioc-check', icon: Search },
        { label: 'Abuse Rep', href: '/dfir/abuse-rep', icon: ShieldAlert },
        { label: 'Email Defense', href: '/dfir/email-defense', icon: Zap },
        { label: 'Phishing', href: '/dfir/phishing', icon: ShieldAlert },
        { label: 'Domain Rep', href: '/dfir/domain-rep', icon: Globe },
        { label: 'Exposed Host', href: '/dfir/exposed-host', icon: ShieldAlert },
        { label: 'Threat Hunt', href: '/dfir/threat-hunt', icon: Radar },
        { label: 'Full Spectrum', href: '/dfir/full-spectrum', icon: Zap },
      ],
    },
    {
      title: 'Investigate',
      items: [
        { label: 'Copilot', href: '/dfir/copilot', icon: Zap },
        { label: 'Report Ingest', href: '/dfir/report-ingest', icon: FileText },
        { label: 'Asset Intel', href: '/dfir/asset-intel', icon: Database },
        { label: 'CVE Prioritizer', href: '/dfir/cve-prioritizer', icon: ShieldAlert },
        { label: 'CVE Lookup', href: '/dfir/cve', icon: Bug },
        { label: 'CloudTrail Triage', href: '/dfir/cloudtrail-triage', icon: Compass },
        { label: 'K8s RBAC', href: '/dfir/k8s-rbac', icon: KeyRound },
        { label: 'GCP IAM', href: '/dfir/gcp-iam', icon: Shield },
        { label: 'Azure RBAC', href: '/dfir/azure-rbac', icon: Shield },
        { label: 'IAM Analyzer', href: '/dfir/iam-analyzer', icon: KeyRound },
      ],
    },
    {
      title: 'Reference',
      items: [
        { label: 'Rule Converter', href: '/dfir/rule-converter', icon: FileText },
        { label: 'Detection Lab', href: '/dfir/detection-lab', icon: Flame },
        { label: 'MITRE Atlas', href: '/dfir/atlas', icon: Compass },
        { label: 'STIX Builder', href: '/dfir/stix-builder', icon: GitBranch },
        { label: 'Decode', href: '/dfir/decode', icon: FileText },
        { label: 'Sec Headers', href: '/dfir/sec-headers', icon: Shield },
        { label: 'Kill Chain', href: '/dfir/kill-chain', icon: Target },
        { label: 'ATT&CK Nav', href: '/dfir/attack-navigator', icon: Target },
        { label: 'Diamond', href: '/dfir/diamond', icon: Target },
        { label: 'Multi-Search', href: '/dfir/multi-search', icon: Search },
        { label: 'Report Composer', href: '/dfir/report-composer', icon: FileText },
      ],
    },
  ],
};

const SIDEBARS: Record<string, SidebarConfig> = {
  '/threatintel': threatIntel,
  '/dfir': dfir,
};

export function getSidebarForSection(pathname: string): SidebarConfig | null {
  for (const [prefix, config] of Object.entries(SIDEBARS)) {
    if (pathname.startsWith(prefix)) return config;
  }
  return null;
}

export const PAGE_TITLES: Record<string, string> = {
  '/threatintel': 'Threat Intel',
  '/threatintel/threat-landscape': 'Threat Landscape',
  '/threatintel/threat-actor-catalog': 'Threat Actor Catalog',
  '/threatintel/actors': 'Actor Directory',
  '/threatintel/campaigns': 'Campaigns',
  '/threatintel/iocs': 'IOC Hub',
  '/threatintel/soc-dashboard': 'SOC Dashboards',
  '/threatintel/darkweb': 'Dark Web',
  '/threatintel/social': 'Social Feeds',
  '/threatintel/detections': 'Detection Hub',
  '/threatintel/cves': 'CVE Hub',
  '/threatintel/malware': 'Malware Hub',
  '/threatintel/malware-sandbox': 'Malware Sandbox',
  '/threatintel/phishing': 'Phishing',
  '/threatintel/tools': 'Frameworks & Tools',
  '/threatintel/osint': 'OSINT Hub',
  '/threatintel/osint-cli-tools': 'OSINT CLI Tools',
  '/threatintel/stix-bundles': 'STIX Bundles',
  '/threatintel/ioc-feeds': 'IOC Feeds',
  '/threatintel/briefings': 'Briefings',
  '/threatintel/reports': 'Threat Intel Reports',
  '/threatintel/feeds': 'Feed Hub',
  '/threatintel/external': 'External Resources',
  '/threatintel/wiki': 'Knowledge Base',
  '/threatintel/about': 'About',
  '/threatintel/research-hub': 'Research Hub',
  '/threatintel/predictive': 'Predictive Intel',
  '/threatintel/metrics': 'Metrics',
};

import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bug,
  Bot,
  Compass,
  Crosshair,
  Database,
  Dna,
  FileCode,
  FileSearch,
  FileText,
  Flame,
  FlaskConical,
  Fingerprint,
  GitBranch,
  Globe,
  Info,
  KeyRound,
  LayoutDashboard,
  Link2,
  Mail,
  Map,
  Newspaper,
  Radar,
  Radio,
  Rss,
  Scale,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

interface SidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
}

interface SidebarGroup {
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
      title: 'Overview',
      items: [
        { label: 'Browse', href: '/threatintel', icon: Compass },
        { label: 'Landscape', href: '/threatintel/threat-landscape', icon: LayoutDashboard },
        { label: 'Threat Actors', href: '/threatintel/threat-actor-catalog', icon: Skull },
        { label: 'Campaigns', href: '/threatintel/campaigns', icon: GitBranch },
      ],
    },
    {
      title: 'Intelligence',
      items: [
        { label: 'IOC Hub', href: '/threatintel/iocs', icon: Target },
        { label: 'SOC Dashboards', href: '/threatintel/soc-dashboard', icon: LayoutDashboard },
        { label: 'Dark Web', href: '/threatintel/darkweb', icon: Globe },
        { label: 'Breach & Leaks', href: '/threatintel/iocs', icon: ShieldAlert },
        { label: 'Social Feeds', href: '/threatintel/social', icon: Radio },
        { label: 'Ransomware', href: '/threatintel/iocs', icon: Flame },
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
      title: 'Tools & Reference',
      items: [
        { label: 'Frameworks', href: '/threatintel/tools', icon: Compass },
        { label: 'OSINT Hub', href: '/threatintel/osint', icon: Search },
        { label: 'STIX Bundles', href: '/threatintel/stix-bundles', icon: GitBranch },
        { label: 'IOC Feeds', href: '/threatintel/ioc-feeds', icon: Rss },
        { label: 'Briefings', href: '/threatintel/briefings', icon: Newspaper },
        { label: 'External', href: '/threatintel/external', icon: Globe },
        { label: 'Wiki', href: '/threatintel/wiki', icon: BookOpen },
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
        { label: 'Email Defense', href: '/dfir/email-defense', icon: Mail },
        { label: 'Phishing', href: '/dfir/phishing', icon: AlertTriangle },
        { label: 'Domain Rep', href: '/dfir/domain-rep', icon: Globe },
        { label: 'Exposed Host', href: '/dfir/exposed-host', icon: ShieldAlert },
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
        { label: 'Rule Converter', href: '/dfir/rule-converter', icon: FileCode },
        { label: 'Detection Lab', href: '/dfir/detection-lab', icon: Flame },
        { label: 'MITRE Atlas', href: '/dfir/atlas', icon: Compass },
        { label: 'STIX Builder', href: '/dfir/stix-builder', icon: GitBranch },
        { label: 'Decode', href: '/dfir/decode', icon: FileCode },
        { label: 'Sec Headers', href: '/dfir/sec-headers', icon: Shield },
        { label: 'Personal Security', href: '/dfir/personal-security', icon: ShieldCheck },
        { label: 'Kill Chain', href: '/dfir/kill-chain', icon: Map },
        { label: 'ATT&CK Nav', href: '/dfir/attack-navigator', icon: Target },
        { label: 'Diamond', href: '/dfir/diamond', icon: Target },
        { label: 'OSINT Mapper', href: '/dfir/osint-mapper', icon: Map },
        { label: 'Multi-Search', href: '/dfir/multi-search', icon: Send },
        { label: 'Report Composer', href: '/dfir/report-composer', icon: FileText },
      ],
    },
  ],
};

const SIDEBARS: Record<string, SidebarConfig> = {
  '/threatintel': threatIntel,
  '/dfir': dfir,
};

export function getSidebarForPath(pathname: string): SidebarConfig | null {
  for (const [prefix, config] of Object.entries(SIDEBARS)) {
    if (pathname.startsWith(prefix)) return config;
  }
  return null;
}

/** Alias for backward compatibility. */
export const getSidebarForSection = getSidebarForPath;

/** Page titles for breadcrumb labels. */
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
};

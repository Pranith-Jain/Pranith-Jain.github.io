/**
 * Sidebar navigation for the threat-intel area.
 *
 * Auto-generated from `data/threatintel-hubs.ts` so every page in the
 * catalog has a sidebar entry. Adding a new page to the registry
 * automatically adds a sidebar item — no manual upkeep.
 *
 * The sidebar is the primary wayfinding surface for /threatintel/* pages.
 * It's grouped by hub and shows all direct page URLs (no nested tabs).
 */

import {
  AlertOctagon,
  AlertTriangle,
  Compass,
  BookOpen,
  Brain,
  Activity,
  Bug,
  Cloud,
  Database,
  ExternalLink,
  Eye,
  FileSearch,
  FileText,
  Flame,
  FolderTree,
  GitBranch,
  Globe,
  KeyRound,
  Layers,
  LayoutDashboard,
  LineChart,
  List,
  Map,
  MessageSquare,
  Newspaper,
  Package,
  Radar,
  Radio,
  Repeat2,
  Rss,
  Scale,
  ScrollText,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Telescope,
  Terminal,
  TrendingUp,
  UserSearch,
  Users,
  Wallet,
  Wifi,
  Award,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { HUB_META } from './threatintel-hubs';
import { HUB_META as DFIR_HUB_META } from './dfir-hubs';

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
  /** Accent tone for active states. Defaults to "brand" (blue, for DFIR).
   *  Pass "rose" for threat-intel so the active sidebar item matches the
   *  page accent. */
  tone?: 'brand' | 'rose';
}

/* ------------------------------------------------------------------ */
/*  Per-page icon override                                            */
/* ------------------------------------------------------------------ */

/**
 * Map page path -> custom icon. Pages not in this map fall back to the
 * hub's icon. The override is needed because not every page has a
 * distinct visual from its hub.
 */
const PAGE_ICON_OVERRIDES: Record<string, LucideIcon> = {
  // Actors
  '/threatintel/actors/directory': Users,
  '/threatintel/actors/timeline': ScrollText,
  '/threatintel/actors/dna': Share2,
  '/threatintel/actors/usernames': UserSearch,
  '/threatintel/actors/attribution': Telescope,
  '/threatintel/actors/catalog': BookOpen,
  '/threatintel/actors/kb': BookOpen,
  '/threatintel/actors/graph': Share2,
  // Campaigns
  '/threatintel/campaigns/active': GitBranch,
  '/threatintel/campaigns/lifecycle': Repeat2,
  '/threatintel/campaigns/generator': Sparkles,
  '/threatintel/campaigns/cross': LinkIcon,
  // IOCs
  '/threatintel/iocs/live': Radar,
  '/threatintel/iocs/enrichment': Search,
  '/threatintel/iocs/feeds': Rss,
  '/threatintel/iocs/entity': Layers,
  '/threatintel/iocs/c2': Wifi,
  '/threatintel/iocs/map': Map,
  '/threatintel/iocs/cross': LinkIcon,
  '/threatintel/iocs/correlation': Share2,
  '/threatintel/iocs/aggregated': Database,
  '/threatintel/iocs/soc': MonitorIcon,
  '/threatintel/iocs/observable': Database,
  // CVEs
  '/threatintel/cves/cves': AlertTriangle,
  '/threatintel/cves/advisories': CodeIcon,
  '/threatintel/cves/resources': Wrench,
  '/threatintel/cves/k8s': Package,
  '/threatintel/cves/exploitable': Bug,
  '/threatintel/cves/list': List,
  // Malware
  '/threatintel/malware/iocs': Bug,
  '/threatintel/malware/vault': KeyIcon,
  '/threatintel/malware/sandbox': BeakerIcon,
  '/threatintel/malware/packages': Package,
  '/threatintel/malware/malpedia': BookOpen,
  '/threatintel/malware/maltrail': Map,
  // Feeds
  '/threatintel/feeds/catalog': FileText,
  '/threatintel/feeds/sources': PlugIcon,
  '/threatintel/feeds/quality': ShieldCheck,
  '/threatintel/feeds/scheduler': TimerIcon,
  '/threatintel/feeds/threatfeeds': Rss,
  '/threatintel/feeds/status': ActivityIcon,
  '/threatintel/feeds/reliability': ShieldCheck,
  '/threatintel/feeds/mythreatintel': TagIcon,
  // Social
  '/threatintel/social/firehose': Radio,
  '/threatintel/social/news': Newspaper,
  '/threatintel/social/telegram-leaks': BellIcon,
  '/threatintel/social/telegram-stats': BarChartIcon,
  '/threatintel/social/telegram-channels': Users,
  '/threatintel/social/telegram-settings': Settings,
  '/threatintel/social/crypto-scam': Wallet,
  '/threatintel/social/reddit': MessageSquare,
  '/threatintel/social/x-firehose': MessageSquare,
  '/threatintel/social/x-live': Eye,
  '/threatintel/social/x-watch': Eye,
  '/threatintel/social/scraped-intel': UserSearch,
  // Dark web
  '/threatintel/darkweb/watch': Globe,
  '/threatintel/darkweb/markets': StoreIcon,
  '/threatintel/darkweb/forums': MessageSquare,
  '/threatintel/darkweb/deepdark': NetworkIcon,
  '/threatintel/darkweb/crime': ShoppingBagIcon,
  '/threatintel/darkweb/bitcoin': AlertOctagon,
  '/threatintel/darkweb/infostealer': KeyRound,
  '/threatintel/darkweb/leaks': LockIcon,
  '/threatintel/darkweb/disclosures': FileText,
  '/threatintel/darkweb/ransom-report': FileText,
  '/threatintel/darkweb/ransom-activity': Flame,
  '/threatintel/darkweb/ransom-map': MapPinIcon,
  '/threatintel/darkweb/ransomwhere': Wallet,
  // Phishing
  '/threatintel/phishing/phish': ShieldAlert,
  '/threatintel/phishing/urls': FileText,
  '/threatintel/phishing/scam': Eye,
  // Infra
  '/threatintel/infra/cloud': Cloud,
  '/threatintel/infra/infra': NetworkIcon,
  '/threatintel/infra/webamon': CameraIcon,
  '/threatintel/infra/domain': Globe,
  // Detections
  '/threatintel/detections/detections': Shield,
  '/threatintel/detections/disarm': SwordIcon,
  '/threatintel/detections/yara': FileSearch,
  '/threatintel/detections/signal': Rss,
  // Research
  '/threatintel/research-hub/research': ScrollText,
  '/threatintel/research-hub/reports': FileText,
  '/threatintel/research-hub/ai': Sparkles,
  '/threatintel/research-hub/writeups': BookOpen,
  '/threatintel/research-hub/signal': TrendingUp,
  '/threatintel/research-hub/redhunt': Telescope,
  '/threatintel/research-hub/redhunt-labs': Telescope,
  '/threatintel/research-hub/volexity': Telescope,
  '/threatintel/research-hub/post': FileText,
  '/threatintel/research-hub/attack-flow': NetworkIcon,
  '/threatintel/research-hub/campaign-gen': Sparkles,
  '/threatintel/research-hub/knowledge': Share2,
  '/threatintel/research-hub/ach': Scale,
  // Knowledge
  '/threatintel/wiki/wiki': BookOpen,
  '/threatintel/wiki/mitre': GridIcon,
  '/threatintel/wiki/f3ead': Compass,
  '/threatintel/wiki/insider': UserSearch,
  '/threatintel/wiki/owasp': Sparkles,
  '/threatintel/wiki/llm': Brain,
  // OSINT
  '/threatintel/osint/framework': Search,
  '/threatintel/osint/cli': Terminal,
  '/threatintel/osint/map': Map,
  '/threatintel/osint/toolbox': Wrench,
  '/threatintel/osint/certs': Award,
  '/threatintel/osint/secops': Settings,
  // Tools
  '/threatintel/tools/copilot': Sparkles,
  '/threatintel/tools/copilot-chat': MessageSquare,
  '/threatintel/tools/mcp': Zap,
  '/threatintel/tools/misp': Database,
  '/threatintel/tools/stix': FileText,
  '/threatintel/tools/graph': Share2,
  '/threatintel/tools/investigations': FolderTree,
  '/threatintel/tools/watches': Eye,
  '/threatintel/tools/unified-search': Search,
  // External
  '/threatintel/external/external': ExternalLink,
  '/threatintel/external/supply': Package,
  '/threatintel/external/awesome': StarIcon,
  // Predictive
  '/threatintel/predictive/dashboard': LayoutDashboard,
  '/threatintel/predictive/global-pulse': Globe,
  '/threatintel/predictive/threat-pulse': ActivityIcon,
  '/threatintel/predictive/certstream': ShieldCheck,
  '/threatintel/predictive/pir': List,
  '/threatintel/predictive/metrics': BarChartIcon,
  '/threatintel/predictive/analytics': LineChart,
  '/threatintel/predictive/predictions': TrendingUp,
  '/threatintel/predictive/predictive': Sparkles,
  '/threatintel/predictive/analyze': Search,
  '/threatintel/predictive/assessments': List,
  '/threatintel/predictive/observe': Eye,
  // Actor extras (added with dfir-catalog consolidation)
  '/threatintel/apt-tracker': Map,
  '/threatintel/most-wanted': AlertOctagon,
  '/threatintel/extremists': AlertTriangle,
  '/threatintel/predators': Eye,
  '/threatintel/briefings': Newspaper,
  '/threatintel/telegram': Radio,
  '/threatintel/telegram-monitor': MessageSquare,
  '/threatintel/telegram-iocs': Shield,
  '/threatintel/source-health': Activity,
  '/threatintel/ransomware-live': Flame,

  '/threatintel/about': Scale,
  '/threatintel/tools/settings': Settings,
  '/threatintel/soc-dashboard': LayoutDashboard,
  '/threatintel/live-center': Globe,
};

/* ------------------------------------------------------------------ */
/*  Build the threat-intel sidebar from the registry                  */
/* ------------------------------------------------------------------ */

function buildThreatIntelSidebar(): SidebarConfig {
  // Top-level entry: Home + Catalog + a few key standalone pages
  const home: SidebarGroup = {
    title: 'Overview',
    items: [
      {
        label: 'Home',
        href: '/threatintel',
        icon: Compass,
        description: 'Landing page — quick actions and recent tools',
      },
      {
        label: 'Page Catalog',
        href: '/threatintel/catalog',
        icon: List,
        description: 'Every page in the threat-intel area',
      },
      { label: 'About', href: '/threatintel/about', icon: Scale, description: 'About the platform' },
    ],
  };

  // Per-hub groups — list direct page URLs only (no hub landing page; the
  // catalog at /threatintel/catalog?cat=<id> is the single navigation
  // surface for browsing a category).
  const hubGroups: SidebarGroup[] = HUB_META.map((hub) => ({
    title: hub.label,
    items: hub.pages.map((p) => ({
      label: p.label,
      href: p.path,
      icon: PAGE_ICON_OVERRIDES[p.path] ?? hub.icon,
      description: p.desc,
    })),
  }));

  return {
    sectionLabel: 'Threat Intel',
    groups: [home, ...hubGroups],
    tone: 'rose',
  };
}

/* ------------------------------------------------------------------ */
/*  DFIR sidebar (unchanged, kept for parity)                          */
/* ------------------------------------------------------------------ */

const dfir: SidebarConfig = {
  sectionLabel: 'DFIR',
  tone: 'brand',
  groups: [
    {
      title: 'Triage',
      items: [
        { label: 'Home', href: '/dfir', icon: LayoutDashboard },
        { label: 'Catalog', href: '/dfir/catalog', icon: Compass, description: 'Every DFIR tool, searchable.' },
        { label: 'IOC Investigator', href: '/dfir/ioc-investigate', icon: Search },
        { label: 'X-VERDIKT', href: '/dfir/x-verdikt', icon: Shield },
        { label: 'REGSCOPE', href: '/dfir/regscope', icon: FolderTree },
        { label: 'Abuse Rep', href: '/dfir/abuse-rep', icon: ShieldAlert },
        { label: 'Email Defense', href: '/dfir/email-defense', icon: Zap },
        { label: 'Phishing', href: '/dfir/phishing', icon: ShieldAlert },
        { label: 'Domain Investigator', href: '/dfir/domain-investigator', icon: Globe },
        { label: 'Exposed Host', href: '/dfir/exposed-host', icon: ShieldAlert },
      ],
    },
    {
      title: 'Investigate',
      items: [
        { label: 'Copilot', href: '/dfir/copilot', icon: Zap },
        { label: 'STIX Workbench', href: '/dfir/stix-workbench', icon: FileText },
        { label: 'Asset Intel', href: '/dfir/asset-intel', icon: Database },
        { label: 'DNSCOPE', href: '/dfir/dnscope', icon: Globe },
        { label: 'CVE Prioritizer', href: '/dfir/cve-prioritizer', icon: ShieldAlert },
        { label: 'CVE Lookup', href: '/dfir/cve', icon: Bug },
        { label: 'CloudTrail Triage', href: '/dfir/cloudtrail-triage', icon: Compass },
        {
          label: 'Infostealer Intel',
          href: '/dfir/infostealer-intel',
          icon: KeyRound,
          description: 'Hudson Rock Cavalier — compromised credential search.',
        },
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
        { label: 'TRACERULES', href: '/dfir/tracerules', icon: Shield },
        { label: 'ATTMAP-AI', href: '/dfir/attmap-ai', icon: Target },
        { label: 'Rule Converter', href: '/dfir/rule-converter', icon: Flame },
        { label: 'MITRE Atlas', href: '/threatintel/wiki/llm', icon: Compass },
        { label: 'STIX Workbench', href: '/dfir/stix-workbench', icon: GitBranch },
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
  '/threatintel': buildThreatIntelSidebar(),
  '/dfir': dfir,
  '/radar': {
    sectionLabel: 'Radar',
    groups: [
      {
        title: 'Tools',
        items: [
          { label: 'Scan', href: '/radar', icon: Radar },
          { label: 'Recent Runs', href: '/radar', icon: List },
        ],
      },
    ],
  },
};

export function getSidebarForSection(pathname: string): SidebarConfig | null {
  for (const [prefix, config] of Object.entries(SIDEBARS)) {
    if (pathname.startsWith(prefix)) return config;
  }
  return null;
}

export const PAGE_TITLES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  out['/threatintel'] = 'Threat Intel';
  out['/threatintel/catalog'] = 'Page Catalog';
  out['/threatintel/about'] = 'About';
  // Per-page titles only — no bare hub paths in PAGE_TITLES since
  // hub landing pages are gone. The catalog is the single navigation
  // surface for browsing a category.
  for (const hub of HUB_META) {
    for (const p of hub.pages) {
      out[p.path] = p.label;
    }
  }
  // DFIR catalog + per-page titles (driven by dfir-hubs)
  out['/dfir/catalog'] = 'DFIR Catalog';
  for (const hub of DFIR_HUB_META) {
    for (const p of hub.pages) {
      out[p.path] = p.label;
    }
  }
  return out;
})();

/* ------------------------------------------------------------------ */
/*  Icon imports — all the icons used in the override map above.       */
/*  Kept inline so this file remains the single source of truth.      */
/* ------------------------------------------------------------------ */

// (Icons already imported at the top of the file.)

// Local alias so the import-only icons at the top are referenced —
// keeps the type checker happy about unused-imports while making
// the file self-contained.
const _ = {
  ActivityIcon,
  AlertOctagon,
  BarChartIcon,
  BeakerIcon,
  BellIcon,
  CameraIcon,
  CodeIcon,
  Database,
  FolderTree,
  GridIcon,
  KeyIcon,
  Layers,
  LinkIcon,
  LockIcon,
  MapPinIcon,
  MonitorIcon,
  NetworkIcon,
  Package,
  PlugIcon,
  Repeat2,
  ShoppingBagIcon,
  StarIcon,
  StoreIcon,
  SwordIcon,
  TagIcon,
  TimerIcon,
};
void _;

// Local icon aliases (used in the override map)
import {
  Activity as ActivityIcon,
  BarChart as BarChartIcon,
  Beaker as BeakerIcon,
  Bell as BellIcon,
  Camera as CameraIcon,
  Code as CodeIcon,
  Grid3x3 as GridIcon,
  Key as KeyIcon,
  Link as LinkIcon,
  Lock as LockIcon,
  MapPin as MapPinIcon,
  Monitor as MonitorIcon,
  Network as NetworkIcon,
  Plug as PlugIcon,
  ShoppingBag as ShoppingBagIcon,
  Star as StarIcon,
  Store as StoreIcon,
  Sword as SwordIcon,
  Tag as TagIcon,
  Timer as TimerIcon,
} from 'lucide-react';

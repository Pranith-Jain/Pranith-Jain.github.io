import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bug,
  Cloud,
  Compass,
  Crosshair,
  Database,
  FileText,
  Flame,
  Globe,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Link2,
  Newspaper,
  Radar,
  Radio,
  Rss,
  Scale,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Skull,
  Sparkles,
  Target,
  Terminal,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface Tool {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  badge?: string;
  external?: boolean;
}

export interface Section {
  id: string;
  label: string;
  blurb: string;
  tools: Tool[];
}

export const SECTIONS: Section[] = [
  // ── 1. Threat Landscape ────────────────────────────────────────
  {
    id: 'threat-landscape',
    label: 'Threat Landscape',
    blurb: 'High-level overview of the current threat environment.',
    tools: [
      {
        to: '/threatintel/threat-landscape',
        label: 'Threat Landscape',
        desc: 'Key stats, trending actors, top malware families, emerging threats, and attack vector distribution.',
        icon: LayoutDashboard,
        badge: 'new',
      },
    ],
  },
  // ── 2. Threat Actors ───────────────────────────────────────────
  {
    id: 'threat-actors',
    label: 'Threat Actors',
    blurb: 'Actor profiles, knowledge base, timelines, and behavioral analysis.',
    tools: [
      {
        to: '/threatintel/threat-actor-catalog',
        label: 'Threat Actor Catalog',
        desc: 'Curated profiles of 15 major groups — aliases, countries, malware, TTPs, campaigns, MITRE mapping.',
        icon: Skull,
        badge: 'new',
      },
      {
        to: '/threatintel/actors',
        label: 'Actor Directory',
        desc: 'Unified actor browser — MITRE ATT&CK, MISP Galaxy, and platform database with search.',
        icon: Users,
      },
    ],
  },
  // ── 3. Ransomware ──────────────────────────────────────────────
  {
    id: 'ransomware',
    label: 'Ransomware',
    blurb: 'Leak-site tracking, negotiations, crypto wallets, and victim monitoring.',
    tools: [
      {
        to: '/threatintel/iocs',
        label: 'Ransomware Hub',
        desc: 'Live leak-site claims, group activity, victim geo-heatmap, negotiation logs, and crypto wallet tracking.',
        icon: Flame,
      },
    ],
  },
  // ── 4. Dark Web ────────────────────────────────────────────────
  {
    id: 'dark-web',
    label: 'Dark Web',
    blurb: 'Criminal forums, dark markets, and onion infrastructure.',
    tools: [
      {
        to: '/threatintel/darkweb',
        label: 'Dark Web Watch',
        desc: 'Aggregated leak-site, ransomware, breach activity, keyword watchlist, and per-source separation.',
        icon: Globe,
      },
    ],
  },
  // ── 5. Breach & Leaks ──────────────────────────────────────────
  {
    id: 'breach-leaks',
    label: 'Breach & Leaks',
    blurb: 'Breach disclosures, infostealer logs, and leak monitoring.',
    tools: [
      {
        to: '/threatintel/iocs',
        label: 'Breach & Leak Hub',
        desc: 'Live breach disclosures, infostealer tracker, scam alerts, Telegram leaks, and secret leak dashboard.',
        icon: ShieldAlert,
      },
    ],
  },
  // ── 6. Live Feeds ──────────────────────────────────────────────
  {
    id: 'live-feeds',
    label: 'Live Feeds',
    blurb: 'Streaming social feeds from Telegram, Reddit, Bluesky, and X.',
    tools: [
      {
        to: '/threatintel/social',
        label: 'Social & Telegram Feeds',
        desc: 'Cybersec Telegram firehose, Reddit, X/Bluesky, Mastodon, prediction markets, and scam watch.',
        icon: Radio,
        badge: 'live',
      },
    ],
  },
  // ── 7. IOC Intelligence ────────────────────────────────────────
  {
    id: 'ioc-intelligence',
    label: 'IOC Intelligence',
    blurb: 'Live indicators, C2 tracking, certificate monitoring, and supply chain intel.',
    tools: [
      {
        to: '/threatintel/iocs',
        label: 'IOC Hub',
        desc: 'Live IOC stream, cross-source correlation, C2 tracker, CertStream, supply chain intelligence, and malicious packages.',
        icon: Target,
        badge: 'live',
      },
    ],
  },
  // ── 8. Detection & Rules ───────────────────────────────────────
  {
    id: 'detection-rules',
    label: 'Detection & Rules',
    blurb: 'Sigma, YARA, Suricata rules, CVE feeds, and domain monitoring.',
    tools: [
      {
        to: '/threatintel/detections',
        label: 'Detection Hub',
        desc: 'Detection rules (Sigma/YARA/Suricata), GoXDR KQL library, CVE feeds, KEV catalog, malware IOC browser, and YARA rules.',
        icon: Shield,
      },
    ],
  },
  // ── 9. CVE & Vulnerabilities ───────────────────────────────────
  {
    id: 'cves',
    label: 'CVE & Vulnerabilities',
    blurb: 'NVD feeds, CISA KEV, exploit tracking, and GitHub advisories.',
    tools: [
      {
        to: '/threatintel/cves',
        label: 'CVE Hub',
        desc: 'Live CVE updates, exploitable CVEs, CISA KEV catalog, GitHub advisories, and Kubernetes CVE feed.',
        icon: AlertTriangle,
      },
    ],
  },
  // ── 10. Malware ────────────────────────────────────────────────
  {
    id: 'malware',
    label: 'Malware',
    blurb: 'IOC browser, sandbox analysis, vault, and family attribution.',
    tools: [
      {
        to: '/threatintel/malware',
        label: 'Malware Hub',
        desc: 'Malware IOC browser (50+ families), sandbox analysis, malware vault, Malpedia, and Maltrail APT trails.',
        icon: Bug,
      },
      {
        to: '/threatintel/malware-sandbox',
        label: 'Malware Sandbox',
        desc: 'Hash lookup across 10+ public sandbox platforms — consensus verdict, family attribution, one-click detonation.',
        icon: Bug,
        badge: 'new',
      },
    ],
  },
  // ── 11. Phishing ───────────────────────────────────────────────
  {
    id: 'phishing',
    label: 'Phishing',
    blurb: 'Phishing wordlists, email defense, and domain monitoring.',
    tools: [
      {
        to: '/threatintel/phishing',
        label: 'Phishing Hub',
        desc: 'Phishing hunting wordlists, phish feed, email defense analysis, and domain impersonation monitoring.',
        icon: ShieldAlert,
      },
    ],
  },
  // ── 12. SOC Dashboards ─────────────────────────────────────────
  {
    id: 'soc-dashboards',
    label: 'SOC Dashboards',
    blurb: 'Operational panels for ransomware, vulnerabilities, and IOC streams.',
    tools: [
      {
        to: '/threatintel/soc-dashboard',
        label: 'SOC Dashboards',
        desc: 'Red/cyan/purple panels — ransomware activity, vulnerability index, and IOC stream with consensus scoring.',
        icon: LayoutDashboard,
        badge: 'new',
      },
    ],
  },
  // ── 13. Campaigns & Attribution ────────────────────────────────
  {
    id: 'campaigns',
    label: 'Campaigns & Attribution',
    blurb: 'Campaign lifecycle, cross-campaign correlation, and attribution framework.',
    tools: [
      {
        to: '/threatintel/campaigns',
        label: 'Campaigns Hub',
        desc: 'Campaign lifecycle tracking, cross-campaign correlation, and multi-signal attribution framework.',
        icon: GitBranch,
      },
    ],
  },
  // ── 14. Frameworks & Reference ─────────────────────────────────
  {
    id: 'frameworks',
    label: 'Frameworks & Reference',
    blurb: 'MITRE ATT&CK, ATLAS, insider threat matrix, and analytic tradecraft.',
    tools: [
      {
        to: '/threatintel/tools',
        label: 'Frameworks Hub',
        desc: 'MITRE ATT&CK matrix, ATLAS (AI/ML), LLM Threat Atlas, insider threat matrix, ACH, F3EAD, and attack flow library.',
        icon: Compass,
      },
    ],
  },
  // ── 15. OSINT Tools ────────────────────────────────────────────
  {
    id: 'osint',
    label: 'OSINT Tools',
    blurb: 'Username search, OSINT frameworks, and tool directories.',
    tools: [
      {
        to: '/threatintel/osint',
        label: 'OSINT Hub',
        desc: 'Username search (291k handles), OSINT framework (70+ tools), OSINT country map, and tool directories.',
        icon: Search,
      },
      {
        to: '/threatintel/osint-cli-tools',
        label: 'OSINT CLI Tools',
        desc: '55+ curated CLI tools across 10 categories — username, email, domain, social, dorking, recon.',
        icon: Terminal,
        badge: 'new',
      },
    ],
  },
  // ── 16. AI & Automation ────────────────────────────────────────
  {
    id: 'ai-automation',
    label: 'AI & Automation',
    blurb: 'AI copilot, campaign generator, and analysis orchestration.',
    tools: [
      {
        to: '/threatintel/tools',
        label: 'AI & Automation Hub',
        desc: 'AI Investigation Copilot, AI Chat, campaign generator, analysis orchestration, MCP search, and AI report showcase.',
        icon: Sparkles,
        badge: 'new',
      },
    ],
  },
  // ── 17. Briefings & Reports ────────────────────────────────────
  {
    id: 'briefings',
    label: 'Briefings & Reports',
    blurb: 'Daily digests, threat landscape reports, and intel assessments.',
    tools: [
      {
        to: '/threatintel/briefings',
        label: 'Briefings Hub',
        desc: 'Daily/weekly tactical digests, threat landscape reports, cross-correlate insights, and published assessments.',
        icon: Newspaper,
      },
      {
        to: '/threatintel/reports',
        label: 'Threat Intel Reports',
        desc: 'Original research reports with IOCs, detection rules, and severity scoring.',
        icon: FileText,
        badge: 'new',
      },
    ],
  },
  // ── 18. Feed Management ────────────────────────────────────────
  {
    id: 'feed-management',
    label: 'Feed Management',
    blurb: 'RSS sources, feed scheduler, alert engine, and feed catalog.',
    tools: [
      {
        to: '/threatintel/feeds',
        label: 'Feed Hub',
        desc: 'Feed sources (50+ RSS), feed scheduler, alert engine, feed file catalog, and aggregated feeds.',
        icon: Rss,
      },
    ],
  },
  // ── 19. Data & Search ──────────────────────────────────────────
  {
    id: 'data-search',
    label: 'Data & Search',
    blurb: 'Observable storage, entity resolution, and investigation board.',
    tools: [
      {
        to: '/threatintel/tools',
        label: 'Data & Search Hub',
        desc: 'Observable database, entity resolution, relationship graph, webamon, investigations, and unified search.',
        icon: Database,
      },
    ],
  },
  // ── 20. STIX & Export ──────────────────────────────────────────
  {
    id: 'stix-export',
    label: 'STIX & Export',
    blurb: 'STIX 2.1 bundles, IOC feeds, and export formats.',
    tools: [
      {
        to: '/threatintel/stix-bundles',
        label: 'STIX Bundle Browser',
        desc: 'Browse and download STIX 2.1 bundles — import into OpenCTI, MISP, or any STIX-aware platform.',
        icon: GitBranch,
        badge: 'new',
      },
      {
        to: '/threatintel/ioc-feeds',
        label: 'IOC Feeds',
        desc: 'Structured indicator feeds ready for SIEM, EDR, or CTI platform ingestion.',
        icon: Rss,
        badge: 'new',
      },
    ],
  },
  // ── 21. External Resources ─────────────────────────────────────
  {
    id: 'external',
    label: 'External Resources',
    blurb: 'Off-site tools, catalogs, and reference materials.',
    tools: [
      {
        to: '/threatintel/external',
        label: 'External Resources',
        desc: 'Off-site cross-references — dashboards, OSINT directories, training labs, malware samples, research portfolios.',
        icon: ExternalLink,
      },
    ],
  },
];

// ── Helper functions ──────────────────────────────────────────────

/** Flatten all tools across sections into a single array with section context. */
export function flattenTools(sections: Section[]): Array<Tool & { section: Section }> {
  return sections.flatMap((s) => s.tools.map((t) => ({ ...t, section: s })));
}

/** Simple search match against tool label + description + section label. */
export function matchesQuery(tool: Tool & { section: Section }, query: string): boolean {
  const q = query.toLowerCase();
  return (
    tool.label.toLowerCase().includes(q) ||
    tool.desc.toLowerCase().includes(q) ||
    tool.section.label.toLowerCase().includes(q)
  );
}

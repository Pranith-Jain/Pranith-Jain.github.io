import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  BookText,
  Bot,
  Briefcase,
  Bug,
  Cloud,
  Compass,
  Database,
  Dna,
  ExternalLink,
  FileCode,
  FileText,
  GitBranch,
  GitBranchPlus,
  Globe,
  Globe2,
  Grid3x3,
  Handshake,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  Radar,
  Radio,
  Scale,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  UserCheck,
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
  // ── Ransomware ──────────────────────────────────────────────────
  {
    id: 'ransomware',
    label: 'Ransomware',
    blurb: 'Leak-site claims, negotiation economics, re-victimisation, onion reachability.',
    tools: [
      {
        to: '/threatintel/ransomware-activity',
        label: 'Live ransomware activity',
        desc: 'Recent ransomware leak-site claims aggregated from Ransomlook · per-victim screenshots when available',
        icon: AlertTriangle,
        badge: 'live',
      },
      {
        to: '/threatintel/ransomware-live',
        label: 'ransomware.live PRO',
        desc: 'Authenticated, edge-cached view of the ransomware.live PRO API: stats, recent cyberattacks (HudsonRock infostealer-enriched), leaked negotiation logs, and per-group YARA rules.',
        icon: ShieldAlert,
        badge: 'live',
      },
      {
        to: '/threatintel/ransom-report',
        label: 'Ransomware group report',
        desc: 'Searchable per-group dossier from the ransomware.live PRO API: overview, MITRE ATT&CK TTPs, tooling, exploited CVEs, infrastructure/IOCs, and per-group YARA rules — with print-to-PDF export.',
        icon: FileText,
        badge: 'live',
      },
      {
        to: '/threatintel/ransomware-map',
        label: 'Ransomware victim geo-heatmap',
        desc: 'World choropleth shaded by victim count per country, aggregated from ransomfeed.it, ransomwatch, ransomware.live, and Andrea Fortuna.',
        icon: Globe2,
        badge: 'new',
      },
      {
        to: '/threatintel/negotiations',
        label: 'Ransomware negotiations',
        desc: 'Negotiation chats across every ransomware.live PRO group. Initial demand vs. negotiated figure, discount, settlement flag, with transcript drill-down.',
        icon: Handshake,
        badge: 'live',
      },
      {
        to: '/threatintel/re-leaks',
        label: 'Victim re-leak detection',
        desc: 'Victims claimed by 2+ ransomware groups in the last 12 months. Cross-actor match on normalised victim names.',
        icon: Users,
      },
      {
        to: '/threatintel/onion-watch',
        label: 'Onion Watch',
        desc: 'Live inventory of .onion mirrors for the top ransomware leak sites. Per-group reachability from Ransomlook.',
        icon: Globe,
      },
    ],
  },
  // ── Dark Web ────────────────────────────────────────────────────
  {
    id: 'dark-web',
    label: 'Dark Web',
    blurb: 'Dark-web monitoring, criminal forums, market indexes, and OSINT tools.',
    tools: [
      {
        to: '/threatintel/darkweb',
        label: 'Dark Web Watch',
        desc: 'Aggregated leak-site, ransomware, breach activity · keyword watchlist · per-source separation',
        icon: Bell,
        badge: 'live',
      },
      {
        to: '/threatintel/breach-forums',
        label: 'Breach / leak-forum tracker',
        desc: 'Directory of criminal forums + dark markets (deepdarkCTI) plus a curated set of notable breach/leak forums.',
        icon: Shield,
        badge: 'live',
      },
      {
        to: '/threatintel/deepdarkcti',
        label: 'deepdarkCTI Index',
        desc: 'Parsed mirror of fastfire/deepdarkCTI: ransomware leak sites, dark markets, criminal forums, infostealer & threat-actor Telegram/Twitter channels, dark-web search engines.',
        icon: Globe,
      },
      {
        to: '/threatintel/darkweb-tools',
        label: 'Dark Web OSINT Tools',
        desc: 'Curated directory of dark-web investigation tools across 8 categories — search engines, onion link discovery, scanners, crawlers, intel platforms, and more.',
        icon: Globe,
      },
    ],
  },
  // ── Breach & Leaks ─────────────────────────────────────────────
  {
    id: 'breach-leaks',
    label: 'Breach & Leaks',
    blurb: 'Breach disclosures, infostealer logs, scam alerts, and Telegram leak monitoring.',
    tools: [
      {
        to: '/threatintel/breach',
        label: 'Live breach disclosures',
        desc: 'Public breach disclosures from Have I Been Pwned, with verification flags, sensitivity markers, and the data classes that leaked.',
        icon: Database,
        badge: 'live',
      },
      {
        to: '/threatintel/infostealer',
        label: 'Infostealer live tracker',
        desc: 'Three live infostealer surfaces in one: HudsonRock victim exposure, demonforums ULP / cloud-log market threads, and active stealer-log Telegram channel directory.',
        icon: KeyRound,
        badge: 'live',
      },
      {
        to: '/threatintel/scam-watch',
        label: 'Scam Watch',
        desc: 'Live FTC and FBI IC3 alerts, deepfake-scam news, and Reddit victim reports. Search and filter built in.',
        icon: AlertTriangle,
      },
      {
        to: '/threatintel/telegram-leaks',
        label: 'Telegram Leak Monitor',
        desc: 'Credential leaks, paste dumps, and file leaks detected across monitored Telegram channels.',
        icon: AlertTriangle,
        badge: 'new',
      },
      {
        to: '/threatintel/telegram-leaks/channels',
        label: 'Discovered TG Channels',
        desc: 'Telegram channels auto-discovered from monitored feeds. Review, approve, and add to the leak-scanning watchlist.',
        icon: UserCheck,
        badge: 'new',
      },
      {
        to: '/threatintel/telegram-leaks/stats',
        label: 'Telegram Leak Stats',
        desc: 'KPIs, severity distribution, top channels and domains from the Telegram leak database.',
        icon: BarChart3,
        badge: 'new',
      },
      {
        to: '/threatintel/secret-leaks',
        label: 'Secret Leak Dashboard',
        desc: 'Exposed API keys, tokens, and credentials in public repos. Provider rankings, repo leaderboards, severity mix.',
        icon: KeyRound,
        badge: 'new',
      },
    ],
  },
  // ── Live Feeds ──────────────────────────────────────────────────
  {
    id: 'live-feeds',
    label: 'Live Feeds',
    blurb: 'Streaming social feeds from Telegram, Reddit, Bluesky, Mastodon, and X.',
    tools: [
      {
        to: '/threatintel/cybersec',
        label: 'Cybersec Telegram firehose',
        desc: 'Message stream from curated public cybersec Telegram channels. IOC drops, vendor advisories, leak announcements.',
        icon: Send,
        badge: 'live',
      },
      {
        to: '/threatintel/reddit',
        label: 'Cybersec Reddit firehose',
        desc: '16 cybersec subreddits: r/netsec, r/blueteamsec, r/redteamsec, r/Malware, r/OSINT, r/computerforensics, and scam/fraud coverage.',
        icon: MessageSquare,
        badge: 'live',
      },
      {
        to: '/threatintel/x',
        label: 'Cybersec social firehose',
        desc: '16 cybersec researchers and vendor labs on Bluesky and Mastodon. Krebs, MalwareTech, Talos, Mandiant, Beaumont, Florian Roth, Cimpanu, vxunderground.',
        icon: Cloud,
        badge: 'live',
      },
      {
        to: '/threatintel/x-live',
        label: 'X live (cybersec)',
        desc: 'Chronological recent X tweets from cybersec IOC-posting accounts — TweetFeed permalink stream with fxtwitter enrichment.',
        icon: MessageSquare,
        badge: 'live',
      },
      {
        to: '/threatintel/x-watch',
        label: 'X firehose',
        desc: 'Live chronological tweets from 70 cybersec accounts across researchers, vendor labs, CTI feeds, OSINT, IR/DFIR, and security press.',
        icon: MessageSquare,
        badge: 'live',
      },
    ],
  },
  // ── SOC Dashboards ──────────────────────────────────────────────
  {
    id: 'soc-dashboards',
    label: 'SOC Dashboards',
    blurb:
      'Tactical operational views. Live data, auto-refresh, time-range selector, CSV export, status pill driven by the actual data shape.',
    tools: [
      {
        to: '/threatintel/soc-ransomware',
        label: 'SOC: Ransomware',
        desc: 'Red DEFCON-style panel. Top actors, country + sector distribution, daily claim frequency, recent victims. Status escalates when the dominant actor holds ≥20% of claims.',
        icon: BarChart3,
        badge: 'new',
      },
      {
        to: '/threatintel/soc-vulns',
        label: 'SOC: Vulnerabilities',
        desc: 'Cyan panel. NVD CVE feed merged with CISA KEV + MTI ransomware-use flag. Detection frequency, severity index, top vendors, KEV-flagged table.',
        icon: Activity,
        badge: 'new',
      },
      {
        to: '/threatintel/soc-iocs',
        label: 'SOC: IOC Stream',
        desc: 'Purple panel. Indicator firehose with per-IOC criticality score (source reputation + kind + context richness), kind filter chips, source bars, top-critical list.',
        icon: Radar,
        badge: 'new',
      },
    ],
  },
  // ── News & Press ────────────────────────────────────────────────
  {
    id: 'news-press',
    label: 'News & Press',
    blurb: 'Cyber-crime coverage, tech news, RSS aggregation, and entity pulse.',
    tools: [
      {
        to: '/threatintel/cyber-crime',
        label: 'Cyber crime & fraud feeds',
        desc: 'Live incident coverage: DOJ indictments, Chainalysis crypto-crime tracing, Krebs, BleepingComputer, DataBreaches.net, CISA, The Record.',
        icon: AlertOctagon,
        badge: 'live',
      },
      {
        to: '/threatintel/tech-ai-news',
        label: 'Tech & AI News',
        desc: '16-source feed for AI labs, cyber-vendor funding and M&A, general tech, and HN/YC.',
        icon: Newspaper,
      },
      {
        to: '/threatintel/threat-feeds',
        label: 'Threat Feeds',
        desc: '40-source aggregation: CISA advisories, vendor labs, IR write-ups, Reddit infosec, CVE/Exploit-DB, and security press.',
        icon: Radio,
      },
      {
        to: '/threatintel/pulse',
        label: 'Threat Pulse',
        desc: 'Real-time aggregator of fresh threat entities (actors, malware families, CVEs, IOCs) ranked by cross-source activity over the last 24h',
        icon: Activity,
        badge: 'live',
      },
      {
        to: '/threatintel/aggregated-feeds',
        label: 'Aggregated Feeds',
        desc: 'Browse all 21 CriticalPathSecurity public feed files with search and category filter.',
        icon: Layers,
        badge: 'new',
      },
      {
        to: '/threatintel/crypto-scams',
        label: 'Crypto Scam Feed',
        desc: 'Curated feed of fresh crypto phishing, scam, drainer, and pig-butchering domains (spmedia Crypto-Scam Threat Intel Feed, refreshed daily). Also feeds the live-IOC firehose.',
        icon: AlertOctagon,
        badge: 'new',
      },
    ],
  },
  // ── Platform Overview ───────────────────────────────────────────
  {
    id: 'platform-overview',
    label: 'Platform Overview',
    blurb: 'Threat maps, metrics, feed health, dashboards, and collection SLOs.',
    tools: [
      {
        to: '/threatintel/threat-map',
        label: 'Cyber Threat Map',
        desc: 'Live geolocation of malicious infrastructure. Choropleth map plus country leaderboard.',
        icon: Globe2,
      },
      {
        to: '/threatintel/global-pulse',
        label: 'Global Pulse — Live Intel',
        desc: 'Real-time global intelligence hub: 3D globe with severity arcs, earthquakes, cyber attacks, IOCs, ransomware, dark web, phishing, malware, CVEs, breaches, Reddit, Telegram, X, and tech news. All feeds live.',
        icon: Radio,
        badge: 'live',
      },
      {
        to: '/threatintel/metrics',
        label: 'Threat Intel Metrics',
        desc: 'Ten panels covering the questions CTI teams actually ask. Ransomware groups, CVE severity, KEV cadence, IOC volume, sector targeting.',
        icon: BarChart3,
      },
      {
        to: '/threatintel/status',
        label: 'Feed status',
        desc: 'Health of every upstream-backed feed. When a page looks empty, check here first.',
        icon: Activity,
      },
      {
        to: '/threatintel/intel-dashboard',
        label: 'Intel Dashboard',
        desc: 'Consolidated view across all threat intelligence sources: leak KPIs, breach stats, feed health, source catalog, and a CTI-CMM Program Health scorecard (5 domains, 0–5 bands).',
        icon: LayoutDashboard,
        badge: 'new',
      },
      {
        to: '/threatintel/collection-slo',
        label: 'Collection SLO',
        desc: 'Live health of every intelligence collector — uptime %, staleness, reliability grades.',
        icon: Activity,
      },
      {
        to: '/threatintel/source-reliability',
        label: 'Source Reliability',
        desc: 'NATO Admiralty Code (A–F) grading for all 25+ intelligence sources.',
        icon: Shield,
      },
      {
        to: '/threatintel/pir-dashboard',
        label: 'Intelligence Requirements',
        desc: 'PIR-driven tasking: define what decisions to inform, score collection against requirements, track coverage gaps.',
        icon: Target,
        badge: 'new',
      },
      {
        to: '/threatintel/feed-quality',
        label: 'TIFCE Feed Quality',
        desc: 'Four-pillar scorecard (originality, platform relevance, signal vs noise, freshness) for every IOC feed — re-implementation of the TIFCE framework.',
        icon: BarChart3,
        badge: 'new',
      },
    ],
  },
  // ── AI & Automation ─────────────────────────────────────────────
  {
    id: 'ai-automation',
    label: 'AI & Automation',
    blurb: 'AI-powered copilot, analysis orchestration, and campaign generation.',
    tools: [
      {
        to: '/threatintel/copilot',
        label: 'AI Investigation Copilot',
        desc: 'AI-powered threat investigation. Paste a CVE, IP, domain, hash, or actor name — auto-detects query type, fans out to cache sources.',
        icon: Sparkles,
        badge: 'new',
      },
      {
        to: '/dfir/agent',
        label: 'Autonomous Investigator Agent',
        desc: 'Multi-step autonomous agent. Describe what to investigate — the agent plans, calls 30+ intel tools, analyzes results, and produces a structured report.',
        icon: Bot,
        badge: 'new',
      },
      {
        to: '/threatintel/analyze',
        label: 'Analysis Orchestration',
        desc: 'IntelOwl-inspired observable analysis. Single input fans out to all 45 SSE providers with composite score and verdict chips.',
        icon: Search,
        badge: 'new',
      },
      {
        to: '/threatintel/campaign-generator',
        label: 'AI Campaign Generator',
        desc: 'Turn an analyst brief into a structured campaign hypothesis with kill-chain mapping, ATT&CK techniques, and hunting hypotheses.',
        icon: Sparkles,
        badge: 'new',
      },
      {
        to: '/threatintel/campaigns',
        label: 'Saved campaigns',
        desc: 'Browse persisted campaign hypotheses. Each entry keeps the full kill-chain, MITRE mapping, and hunting hypotheses.',
        icon: Briefcase,
        badge: 'new',
      },
    ],
  },
  // ── Data & Search ───────────────────────────────────────────────
  {
    id: 'data-search',
    label: 'Data & Search',
    blurb: 'Observable storage, unified search, entity resolution, and investigation board.',
    tools: [
      {
        to: '/threatintel/observable-db',
        label: 'Observable Database',
        desc: 'Yeti-inspired persistent IOC storage. Searchable by indicator/type/score/tag with enrichment history.',
        icon: Database,
        badge: 'new',
      },
      {
        to: '/threatintel/search',
        label: 'Unified Search',
        desc: 'Cross-source search across 10+ threat intel sources — CVE, threat actors, ransomware, malware, IoC feeds, Telegram, breach data.',
        icon: Search,
        badge: 'new',
      },
      {
        to: '/threatintel/entity-resolution',
        label: 'Entity Resolution',
        desc: 'Resolve threat actor names, ransomware groups, CVEs, IPs, domains, and hashes against a curated 500+ entry alias index.',
        icon: Search,
        badge: 'new',
      },
      {
        to: '/threatintel/relationship-graph',
        label: 'Relationship Graph',
        desc: 'Interactive graph of cross-source connections between CVEs, threat actors, ransomware groups, IPs, domains, and hashes.',
        icon: Globe2,
        badge: 'new',
      },
      {
        to: '/threatintel/webamon',
        label: 'Webamon',
        desc: 'Search 750M+ scanned domains, submit URLs for sandbox analysis, and explore infrastructure relationships — all in one view.',
        icon: Globe2,
        badge: 'new',
      },
      {
        to: '/threatintel/investigations',
        label: 'Investigation Board',
        desc: 'TheHive-inspired case management. Create investigations with severity/TLP/status, manage observables, track tasks.',
        icon: Shield,
        badge: 'new',
      },
    ],
  },
  // ── IOC Enrichment & Tools ──────────────────────────────────────
  {
    id: 'ioc-enrichment-tools',
    label: 'IOC Enrichment & Tools',
    blurb: 'Provider-based enrichment, API key management, and platform integrations.',
    tools: [
      {
        to: '/threatintel/ioc-enrichment',
        label: 'IOC Enrichment',
        desc: 'Query external free threat intel APIs — Maltiverse, InQuest Labs, CertSpotter, HackerTarget DNS, Cloudflare Radar — from one interface.',
        icon: Search,
        badge: 'new',
      },
      {
        to: '/threatintel/mythreatintel',
        label: 'MyThreatIntel',
        desc: 'Authenticated, edge-cached view of the MyThreatIntel CTI platform REST API: IOCs, malware, CVEs, ransomware victims, leaks, threat groups.',
        icon: Radar,
        badge: 'live',
      },
      {
        to: '/threatintel/misp-browser',
        label: 'MISP Browser',
        desc: 'Connect to any MISP instance to browse events, attributes, objects, galaxies, and tags.',
        icon: Search,
      },
      {
        to: '/threatintel/settings',
        label: 'API Keys & Settings',
        desc: 'Reference table of 21 provider API keys with environment variable names, signup URLs, and free-tier limits.',
        icon: KeyRound,
        badge: 'new',
      },
      {
        to: '/threatintel/telegram-settings',
        label: 'Telegram Settings',
        desc: 'Manage custom Telegram channels for the Cybersec Telegram firehose. Add channels by @handle, view active list.',
        icon: Send,
        badge: 'new',
      },
      {
        to: '/threatintel/projectdiscovery',
        label: 'ProjectDiscovery Intel',
        desc: 'Free ProjectDiscovery intel — combolist/leak exposure for an email or domain, Chaos public-domain subdomain recon, and the Nuclei-template CVE catalogue. No paid PD scan credits used.',
        icon: Target,
        badge: 'new',
      },
    ],
  },
  // ── Feed Management ─────────────────────────────────────────────
  {
    id: 'feed-management',
    label: 'Feed Management',
    blurb: 'RSS source catalog, feed scheduler, alert engine, and feed file browser.',
    tools: [
      {
        to: '/threatintel/feed-sources',
        label: 'Feed Sources',
        desc: 'Browse and manage all 50+ RSS feeds grouped by category — ransomware, APT, malware, CVE, dark-web, press, research.',
        icon: Radio,
        badge: 'new',
      },
      {
        to: '/threatintel/feed-scheduler',
        label: 'Feed Scheduler',
        desc: 'INTELMQ/Yeti-inspired feed collection. Configure external sources, set intervals, manual trigger with live fetch.',
        icon: Radio,
        badge: 'new',
      },
      {
        to: '/threatintel/watches',
        label: 'Alert Engine',
        desc: 'Set up keyword watches on threat feeds. KV-backed event history with per-trigger context and webhook alerts.',
        icon: Bell,
        badge: 'new',
      },
      {
        to: '/threatintel/feed-catalog',
        label: 'Feed File Catalog',
        desc: 'Browse all CriticalPathSecurity public feed files with search, category filter, and sample entries.',
        icon: Layers,
        badge: 'new',
      },
    ],
  },
  // ── Briefings & Assessments ─────────────────────────────────────
  {
    id: 'briefings',
    label: 'Briefings & Assessments',
    blurb: 'Intel briefings, cross-correlation insights, and published assessments.',
    tools: [
      {
        to: '/threatintel/briefings',
        label: 'Intel Briefings',
        desc: 'Daily/weekly tactical digest plus monthly Threat Landscape Reports (top threats, trending actors, key incidents, recommended actions, outlook). Filter by Daily · Weekly · Landscape.',
        icon: Briefcase,
        badge: 'new',
      },
      {
        to: '/threatintel/cross-correlate',
        label: 'Cross-Correlate',
        desc: 'Cross-source intelligence correlation. Identify critical and high-severity insights across actors, sectors, and TTPs.',
        icon: GitBranch,
        badge: 'new',
      },
      {
        to: '/threatintel/assessments',
        label: 'Intel Assessments',
        desc: 'Published threat intelligence assessments with confidence scoring, status tracking, and sector tagging.',
        icon: FileText,
        badge: 'new',
      },
    ],
  },
  // ── IOC Intelligence ────────────────────────────────────────────
  {
    id: 'ioc-intelligence',
    label: 'IOC Intelligence',
    blurb: 'Fresh indicators, cross-source correlation, C2 infra, and certificate monitoring.',
    tools: [
      {
        to: '/threatintel/live-iocs',
        label: 'Live IOC stream',
        desc: 'Chronological firehose with per-IOC reporter handles + timestamps. Sources: TweetFeed, SANS ISC, C2IntelFeeds, URLhaus, ThreatFox, MalwareBazaar.',
        icon: Radio,
        badge: 'live',
      },
      {
        to: '/threatintel/correlation',
        label: 'Cross-source IOC correlation',
        desc: 'Indicators that appear in 2+ independent feeds, ranked by source consensus.',
        icon: GitBranchPlus,
      },
      {
        to: '/threatintel/c2-tracker',
        label: 'C2 Infrastructure Tracker',
        desc: 'Live C2 server IPs from drb-ra/C2IntelFeeds and abuse.ch ThreatFox. Filter by framework: Cobalt Strike, Sliver, Metasploit, etc.',
        icon: Radar,
        badge: 'new',
      },
      {
        to: '/threatintel/certstream',
        label: 'CertStream live feed',
        desc: 'Polls crt.sh every 15s for newly-issued certificates matching a keyword. Built-in suspicion scoring.',
        icon: Radio,
        badge: 'new',
      },
      {
        to: '/threatintel/malicious-packages',
        label: 'Malicious package directory',
        desc: 'Cross-ecosystem malware/typosquat/dependency-confusion IOCs across npm, PyPI, RubyGems, Maven, Go, Rust.',
        icon: KeyRound,
        badge: 'new',
      },
    ],
  },
  // ── Detection & Rules ───────────────────────────────────────────
  {
    id: 'detection-rules',
    label: 'Detection & Rules',
    blurb: 'Detection rules, CVE updates, domain monitoring, malware samples, and YARA.',
    tools: [
      {
        to: '/threatintel/rules',
        label: 'Detection Rules',
        desc: 'Sigma, YARA, Elastic, Splunk, KQL, and Suricata. Live commit feeds from upstream repos.',
        icon: FileCode,
      },
      {
        to: '/threatintel/detections',
        label: 'Detections',
        desc: 'Curated detection-rule pack evaluated hourly against the unified live-IOC stream. Write your own in the Detection Lab.',
        icon: AlertOctagon,
        badge: 'new',
      },
      {
        to: '/threatintel/cve-list',
        label: 'Live CVE updates',
        desc: 'NVD published-CVE feed (last 14 days) merged with CISA KEV catalogue. Severity, KEV flag, ransomware-use flag.',
        icon: Shield,
        badge: 'live',
      },
      {
        to: '/threatintel/exploitable-cves',
        label: 'Exploitable CVEs',
        desc: 'Live feed of CVEs with known exploits and active exploitation. Aggregated from vendor labs, CISA KEV, Lyrie Research, and community sources. Modeled after redteam.community.',
        icon: Zap,
        badge: 'new',
      },
      {
        to: '/threatintel/domain-monitor',
        label: 'Domain Monitor',
        desc: 'Typosquatting and domain impersonation scanner. Generates lookalike variants, TLD swaps, homoglyphs.',
        icon: Search,
      },
      {
        to: '/threatintel/malware-iocs',
        label: 'Malware IOC Browser',
        desc: 'Browse 50+ malware families with IOC lists. Left sidebar family selector, right panel shows IPs/domains/hashes/URLs per family.',
        icon: Bug,
        badge: 'new',
      },
      {
        to: '/threatintel/malware-vault',
        label: 'Malware Vault',
        desc: 'Viper-inspired sample storage. Upload files, auto-hash, detect magic bytes, tag with family, search/download.',
        icon: Shield,
        badge: 'new',
      },
      {
        to: '/threatintel/yara',
        label: 'YARA Rule Browser',
        desc: 'Browse and search YARA rules from YARAify. View rule details, download individual rules, and search by family or author.',
        icon: FileCode,
        badge: 'new',
      },
      {
        to: '/threatintel/phishing-wordlists',
        label: 'Phishing Hunting Wordlists',
        desc: 'Phishing-kit hunting wordlists (spmedia PhishingSecLists) — Gobuster/ffuf fuzzing lists for the filenames threat actors use to stash stolen creds, admin panels, and webshells on phishing infra.',
        icon: FileText,
        badge: 'new',
      },
    ],
  },
  // ── Threat Actors ───────────────────────────────────────────────
  {
    id: 'threat-actors',
    label: 'Threat Actors',
    blurb: 'APT catalogues, actor knowledge base, timelines, DNA profiling, and malware family attribution.',
    tools: [
      {
        to: '/threatintel/actors',
        label: 'Threat Actors',
        desc: 'APT catalogue. STIX-aware, with TTPs, associated tooling, and MITRE technique mapping per actor.',
        icon: Users,
      },
      {
        to: '/threatintel/actor-kb',
        label: 'Threat-Actor Knowledge Base',
        desc: '174 MITRE ATT&CK intrusion-sets. Search by name / alias / Gxxxx / technique / malware.',
        icon: BookText,
      },
      {
        to: '/threatintel/actor-timeline',
        label: 'Actor activity timeline',
        desc: 'Per-actor leak-site cadence Gantt for the most-active ransomware groups.',
        icon: BarChart3,
      },
      {
        to: '/threatintel/actor-dna',
        label: 'Actor Behavioral DNA',
        desc: 'Fingerprint threat actors by behavior. TTP signatures, infrastructure patterns, operational tempo, victimology.',
        icon: Dna,
        badge: 'new',
      },
      {
        to: '/threatintel/malpedia',
        label: 'Malpedia',
        desc: 'Malware family attribution via Fraunhofer FKIE. Search actors and families for descriptions and references.',
        icon: Bug,
        badge: 'new',
      },
      {
        to: '/threatintel/maltrail',
        label: 'Maltrail APT Trails',
        desc: 'Per-actor IOC trail files curated by Miroslav Stampar. Browse 75+ APT trail files.',
        icon: FileCode,
        badge: 'new',
      },
      {
        to: '/threatintel/actor-usernames',
        label: 'Threat-Actor Usernames',
        desc: 'Search ~291k threat-actor handles scraped from ~25 cybercrime/hacking forums (spmedia Threat-Actor-Usernames-Scrape). Shows which forums a handle appears on, active vs. defunct.',
        icon: UserCheck,
        badge: 'new',
      },
    ],
  },
  // ── Frameworks ──────────────────────────────────────────────────
  {
    id: 'frameworks',
    label: 'Frameworks',
    blurb: 'MITRE ATT&CK, ATLAS, insider threat matrix, and analytic tradecraft.',
    tools: [
      {
        to: '/threatintel/mitre',
        label: 'MITRE ATT&CK',
        desc: 'The matrix, plus per-technique deep-dives. Pivot both ways: actor to technique, technique to actor.',
        icon: Grid3x3,
      },
      {
        to: '/threatintel/atlas',
        label: 'MITRE ATLAS (AI/ML)',
        desc: 'Adversarial-ML taxonomy — tactics, techniques, and real-world case studies of attacks on AI and ML systems.',
        icon: Grid3x3,
      },
      {
        to: '/threatintel/insider-threat-matrix',
        label: 'Insider Threat Matrix',
        desc: 'Open framework for insider threat investigations. 140+ techniques across Motive, Means, Preparation, Infringement.',
        icon: UserCheck,
        badge: 'new',
      },
      {
        to: '/threatintel/ach',
        label: 'ACH (Analysis of Competing Hypotheses)',
        desc: 'Structured analytic technique. Define hypotheses, weigh evidence for/against, track diagnostic value.',
        icon: Scale,
        badge: 'new',
      },
    ],
  },
  // ── Attribution & Campaigns ─────────────────────────────────────
  {
    id: 'attribution-campaigns',
    label: 'Attribution & Campaigns',
    blurb: 'Multi-signal attribution, campaign lifecycle, cross-campaign correlation, and forecasting.',
    tools: [
      {
        to: '/threatintel/attribution',
        label: 'Attribution Framework',
        desc: 'Multi-signal attribution with confidence scoring. Technical, behavioral, and infrastructure evidence analysis.',
        icon: Scale,
        badge: 'new',
      },
      {
        to: '/threatintel/campaign-lifecycle',
        label: 'Campaign Lifecycle',
        desc: 'Track campaigns from preparation to monetization. Predictive modeling, kill chain phases, escalation detection.',
        icon: Target,
        badge: 'new',
      },
      {
        to: '/threatintel/cross-campaign',
        label: 'Cross-Campaign Correlation',
        desc: 'Find connections between campaigns: shared infrastructure, tooling, and TTPs.',
        icon: GitBranch,
        badge: 'new',
      },
      {
        to: '/threatintel/predictive',
        label: 'Predictive Intelligence',
        desc: 'AI-driven threat forecasting based on current intelligence trends, actor behavior patterns, and historical data.',
        icon: TrendingUp,
        badge: 'new',
      },
    ],
  },
  // ── Research & Writing ──────────────────────────────────────────
  {
    id: 'research-writing',
    label: 'Research & Writing',
    blurb: 'Authored research, elite vendor analysis, and broad-ecosystem writeups.',
    tools: [
      {
        to: '/threatintel/research',
        label: 'Research (authored)',
        desc: "Original adversary-tracking and methodology pieces by Pranith Jain. Every claim sourced to the platform's data or third-party reporting.",
        icon: FileText,
      },
      {
        to: '/threatintel/signal',
        label: 'Research Signal',
        desc: 'Tight curated set of elite vendor labs + independent research only (DFIR Report, SentinelLabs, Unit 42, Huntress, etc).',
        icon: Radio,
        badge: 'live',
      },
      {
        to: '/threatintel/writeups',
        label: 'Writeups Feed',
        desc: 'Broad ecosystem cut. Krebs, BleepingComputer, CrowdStrike, ESET, Recorded Future, Intezer, and Medium threat-intel feeds.',
        icon: BookText,
        badge: 'live',
      },
    ],
  },
  // ── Knowledge & Reference ───────────────────────────────────────
  {
    id: 'knowledge-reference',
    label: 'Knowledge & Reference',
    blurb: 'Wiki, catalogs, awesome lists, external resources, and Telegram directory.',
    tools: [
      {
        to: '/threatintel/about',
        label: 'About the platform',
        desc: "What's covered, the data-principles that shape it (live-not-cached, verify-first, cross-source, open/portable), and the analyst-first design intent behind the surface.",
        icon: Info,
      },
      {
        to: '/threatintel/wiki',
        label: 'Knowledge Base',
        desc: 'Long-form articles on Telegram OSINT tradecraft, dark-web monitoring, MITRE workflows, and briefing methodology.',
        icon: BookOpen,
      },
      {
        to: '/threatintel/cve-resources',
        label: 'CVE Resources Catalog',
        desc: 'About 70 curated CVE sources. Databases, exploit and PoC repos, vendor PSIRTs, scoring services, research labs.',
        icon: BookText,
      },
      {
        to: '/threatintel/secops-tools',
        label: 'SecOps Tools Catalog',
        desc: 'About 140 hand-picked tools across 14 categories: DFIR, Threat Intel, AI Sec, Malware, Vuln Mgmt, Detection.',
        icon: Layers,
      },
      {
        to: '/threatintel/awesome-lists',
        label: 'Awesome Lists',
        desc: 'GitHub awesome-lists for OSINT, threat intel, IR, and MCP / AI security. Filterable by stars and focus area.',
        icon: Sparkles,
      },
      {
        to: '/threatintel/external-resources',
        label: 'External Resources',
        desc: 'Off-site cross-references: dashboards, OSINT directories, training labs, malware samples, research portfolios.',
        icon: ExternalLink,
      },
      {
        to: '/threatintel/osint-framework',
        label: 'OSINT Framework',
        desc: '70+ curated OSINT tools across 15 categories. Filter by pricing tier and category.',
        icon: Compass,
      },
      {
        to: '/threatintel/telegram-watch',
        label: 'Telegram Catalog',
        desc: 'Curated index of public threat-intel, cybercrime, and OSINT Telegram channels. Category and language filters.',
        icon: Send,
      },
    ],
  },
];

export interface ToolMatch {
  tool: Tool;
  section: Section;
}

export function flattenTools(sections: Section[]): ToolMatch[] {
  return sections.flatMap((s) => s.tools.map((t) => ({ tool: t, section: s })));
}

export function matchesQuery(t: ToolMatch, q: string): boolean {
  if (!q) return true;
  const hay = `${t.tool.label} ${t.tool.desc} ${t.section.label}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

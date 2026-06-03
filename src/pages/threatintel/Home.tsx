import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BookText,
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
  KeyRound,
  Layers,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Newspaper,
  Radio,
  Radar,
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
  X,
  type LucideIcon,
} from 'lucide-react';
import { LiveSnapshotPanel } from '../../components/dfir/LiveSnapshotPanel';
import { WhatsNewBanner } from '../../components/threatintel/WhatsNewBanner';
import { LatestBriefingCard } from '../../components/threatintel/LatestBriefingCard';
import { personalInfo } from '../../data/content';
import { AppHero } from '../../components/AppHero';
import { QuickActions, type QuickAction } from '../../components/QuickActions';
import { LivePulse } from '../../components/threatintel/LivePulse';
import { RecentToolsRow } from '../../components/RecentToolsRow';

/**
 * Threat-Intel landing page — the SOLE entry point for sources, feeds, RSS,
 * news, briefings, and curated catalogues. /dfir keeps the interactive
 * tools; /threatintel keeps everything you READ.
 *
 * The pages themselves now live at /threatintel/<slug>; old /dfir/<slug>
 * URLs redirect via `MovedRedirect` in App.tsx so existing bookmarks keep
 * resolving (query string + hash preserved).
 *
 * If you add a new SOURCE / FEED / CATALOG, add the tile here AND remove
 * any matching tile from src/components/dfir/ToolGrid.tsx so the two
 * landings stay strictly disjoint.
 */

interface Tool {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** Tag hint shown alongside title (e.g. "live", "new"). */
  badge?: string;
  /** Set true when `to` is an off-site URL (renders as <a target=_blank>). */
  external?: boolean;
}

interface Section {
  id: string;
  label: string;
  blurb: string;
  tools: Tool[];
}

const SECTIONS: Section[] = [
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
        icon: ShieldAlert,
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
        icon: ShieldAlert,
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
        to: '/threatintel/analyze',
        label: 'Analysis Orchestration',
        desc: 'IntelOwl-inspired observable analysis. Single input fans out to all 44 SSE providers with composite score and verdict chips.',
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
        icon: ShieldAlert,
        badge: 'live',
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
        icon: ShieldAlert,
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
        badge: 'authored',
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

/** Flat tool + parent-section pair used by the search results view. */
interface ToolMatch {
  tool: Tool;
  section: Section;
}

function flattenTools(sections: Section[]): ToolMatch[] {
  return sections.flatMap((s) => s.tools.map((t) => ({ tool: t, section: s })));
}

/**
 * The 4 most-clicked surfaces on /threatintel, surfaced as Quick
 * actions directly below the AppHero. Solves the "I'm back, just
 * get me to the live intel" problem. The full 90-tool catalog
 * stays accessible via the search input + the section picker
 * below.
 */
const QUICK_ACTIONS: QuickAction[] = [
  {
    to: '/threatintel/live-iocs',
    label: 'Live IOCs',
    description: 'Streaming indicator feed from 12 providers.',
    icon: Activity,
    badge: 'live',
  },
  {
    to: '/threatintel/actor-kb',
    label: 'Actor KB',
    description: 'Threat-actor knowledge base with cross-references.',
    icon: Users,
  },
  {
    to: '/threatintel/cross-campaign',
    label: 'Cross-Campaign',
    description: 'Find connections across campaigns + actors + IOCs.',
    icon: Link2,
  },
  {
    to: '/threatintel/wiki',
    label: 'Knowledge Base',
    description: 'Long-form articles on tradecraft, frameworks, and methodology.',
    icon: BookOpen,
  },
];

function matchesQuery(t: ToolMatch, q: string): boolean {
  if (!q) return true;
  const hay = `${t.tool.label} ${t.tool.desc} ${t.section.label}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

export default function ThreatIntelHome(): JSX.Element {
  const totalTiles = SECTIONS.reduce((sum, s) => sum + s.tools.length, 0);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const allTools = useMemo(() => flattenTools(SECTIONS), []);
  const searchResults = useMemo(
    () => (query.trim() ? allTools.filter((t) => matchesQuery(t, query.trim())) : []),
    [allTools, query]
  );
  const isSearching = query.trim().length > 0;
  const { cat } = useParams<{ cat?: string }>();
  const activeSection = cat ? SECTIONS.find((s) => s.id === cat) : undefined;

  // Keyboard: '/' or 'Cmd/Ctrl+K' focuses the search; 'Esc' clears.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery('');
        return;
      }
      if (inField) return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="w-full py-4 sm:py-8 text-slate-900 dark:text-slate-100 space-y-6 sm:space-y-8">
      {/* The page <h1> is provided by AppHero below ("Threat-intel
          platform") — no separate sr-only h1, which would create a
          second, near-duplicate top-level heading. */}
      {/* "What's new since your last visit" banner — silent on first
          visit / zero deltas. Reuses the localStorage marker key
          'threatintel-home'. */}
      <WhatsNewBanner />
      <LatestBriefingCard />
      <AppHero
        kicker="Privacy-first · Live edge feeds · No login · No tracking"
        title="Threat-intel platform"
        sub="CTI aggregator and DFIR analyst toolkit, both running on Cloudflare Workers. Pulls from ~30 public feeds — ransomware leak sites, CVE/KEV, malware samples, phishing URLs, social and Telegram, MyThreatIntel — plus multi-provider IOC enrichment and STIX 2.1 export. Coverage is a sample, not exhaustive."
        meta={
          <>
            {totalTiles} intel surfaces · by{' '}
            <Link to="/" className="text-brand-600 dark:text-brand-400 hover:underline">
              {personalInfo.name}
            </Link>{' '}
            ·{' '}
            <Link to="/threatintel/about" className="text-brand-600 dark:text-brand-400 hover:underline">
              about
            </Link>{' '}
            · interactive tools:{' '}
            <Link to="/dfir" className="text-brand-600 dark:text-brand-400 hover:underline">
              /dfir
            </Link>
          </>
        }
      />

      {/* Live telemetry band — the page's one genuinely live asset (real
          threat counts) as the hero moment, directly under the headline.
          Replaces the old static StatBar; the surface/section/build meta it
          used to carry moves to the thin caption below. */}
      <div>
        <LivePulse />
        <p className="mt-2 px-1 font-mono text-[11px] text-slate-400">
          {totalTiles} intel surfaces · {SECTIONS.length} sections · build {__BUILD_DATE__}
        </p>
      </div>

      {/* Quick actions — the dock a returning analyst uses 90% of the
          time. Replaces the old "quick:" pill row (which had 6
          link-buttons in a flat row, hard to scan). Each tile now
          carries an icon, badge ("live"), and a one-line description
          so a returning user can self-orient at a glance. */}
      <QuickActions actions={QUICK_ACTIONS} accentClass="text-rose-600 dark:text-rose-400" tone="rose" />

      {/* Recently used — surfaces the last few tools the user actually
          opened (tracked in localStorage by the AppShell on every
          route change). Renders only after 2+ visits, so first-time
          visitors don't see an empty row. */}
      <RecentToolsRow section="threatintel" accentClass="text-rose-600 dark:text-rose-400" tone="rose" />
      {/* Search bar — '/' or Cmd/Ctrl+K to focus, Esc to clear */}
      <div className="relative mb-10">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every intel surface, catalog, feed…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-20 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            aria-label="Search intel surfaces"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Clear search"
            >
              <X size={11} /> clear
            </button>
          ) : (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-1 font-mono text-[10px] text-slate-400 sm:inline-flex">
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] dark:border-slate-700 dark:bg-slate-800">
                /
              </kbd>
              <span>or</span>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] dark:border-slate-700 dark:bg-slate-800">
                ⌘K
              </kbd>
            </span>
          )}
        </div>
        {isSearching && (
          <div className="mt-2 font-mono text-[11px] text-slate-500">
            {searchResults.length} {searchResults.length === 1 ? 'match' : 'matches'} for &ldquo;{query.trim()}&rdquo;
            {searchResults.length === 0 && ' · try fewer or different keywords'}
          </div>
        )}
      </div>

      {!isSearching && !cat && (
        <section
          aria-label="Live across the platform"
          className="animate-fade-in-up rounded-2xl border border-slate-200/70 bg-gradient-to-b from-slate-50/80 to-white p-4 dark:border-slate-800 dark:from-slate-900/50 dark:to-slate-950/20 sm:p-5"
        >
          <LiveSnapshotPanel compact subtitle="live intel pulse across the platform" mbClass="mb-0" />
        </section>
      )}

      {isSearching ? (
        <section className="animate-fade-in-up mb-12">
          <ul className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {searchResults.map(({ tool: t, section }) => {
              const Icon = t.icon;
              const cardClass =
                'group relative block h-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 ' +
                'transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/50 ' +
                'hover:shadow-[0_10px_30px_-12px_rgba(44,62,229,0.35)] focus-visible:outline-none focus-visible:-translate-y-0.5 ' +
                'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40';
              const inner = (
                <>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <Icon size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <span className="mt-0.5 inline-flex items-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
                      {section.label}
                    </span>
                  </div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <h3 className="flex items-center gap-1 font-display font-semibold text-base text-slate-900 transition-colors group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
                      {t.label}
                      {t.external && <ExternalLink size={11} className="opacity-60" aria-hidden="true" />}
                    </h3>
                    {t.badge && (
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                          t.badge === 'live'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{t.desc}</p>
                </>
              );
              if (t.external) {
                return (
                  <li key={`${section.id}:${t.to}`}>
                    <a href={t.to} target="_blank" rel="noopener noreferrer" className={cardClass}>
                      {inner}
                    </a>
                  </li>
                );
              }
              return (
                <li key={`${section.id}:${t.to}`}>
                  <Link to={t.to} className={cardClass}>
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
          {searchResults.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-[13px] text-slate-500 dark:border-slate-700">
              No matches. Searching across {allTools.length} intel surfaces, catalogs, and feeds.
            </div>
          )}
        </section>
      ) : activeSection ? (
        <section className="animate-fade-in-up mb-12">
          <div className="flex flex-wrap items-center gap-2 mb-6 text-[11px] font-mono">
            <span className="text-slate-500">categories:</span>
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                to={`/threatintel/c/${s.id}`}
                className={`px-3 py-1.5 rounded border ${
                  s.id === cat
                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-brand-500/40'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <div className="mb-4">
            <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
              {activeSection.label}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-1">
              {activeSection.blurb} · {activeSection.tools.length}{' '}
              {activeSection.tools.length === 1 ? 'source' : 'sources'}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-2">
              Reference only. Feeds refreshed at the edge each visit; verify indicators in your own environment.
            </p>
          </div>
          <ul className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {activeSection.tools.map((t) => {
              const Icon = t.icon;
              const cardClass =
                'group relative block h-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 ' +
                'transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/50 ' +
                'hover:shadow-[0_10px_30px_-12px_rgba(44,62,229,0.35)] focus-visible:outline-none focus-visible:-translate-y-0.5 ' +
                'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40';
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Icon size={18} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <ArrowRight
                      size={14}
                      className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors flex items-center gap-1">
                      {t.label}
                      {t.external && <ExternalLink size={11} className="opacity-60" aria-hidden="true" />}
                    </h3>
                    {t.badge && (
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                          t.badge === 'live'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{t.desc}</p>
                </>
              );
              return t.external ? (
                <li key={t.to}>
                  <a href={t.to} target="_blank" rel="noopener noreferrer" className={cardClass}>
                    {inner}
                  </a>
                </li>
              ) : (
                <li key={t.to}>
                  <Link to={t.to} className={cardClass}>
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="animate-fade-in-up mb-12">
          <div className="mb-5 border-t border-slate-200/70 pt-6 dark:border-slate-800">
            <h2 className="font-display text-base font-semibold text-slate-700 dark:text-slate-300">
              Browse by category
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                to={`/threatintel/c/${s.id}`}
                className="group rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {s.label}
                  </span>
                  <ArrowRight
                    size={14}
                    className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{s.blurb}</p>
                <p className="mt-2 text-[11px] font-mono text-slate-400">
                  {s.tools.length} {s.tools.length === 1 ? 'source' : 'sources'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Canonical registry of every page in the threat-intel area.
 *
 * Pages are grouped by category ("hub"). Each page has its own direct
 * URL (/threatintel/<hub-id>/<tab-id>) which renders the page
 * component directly — no hub wrapper, no tab bar, no /threatintel/<hub>
 * landing page in between.
 *
 * The /threatintel/catalog page is the single navigation surface for
 * browsing a category. It accepts ?cat=<hub-id> to pre-filter to a
 * single category. The sidebar lists direct page URLs grouped by
 * hub for at-a-glance scanning.
 *
 * Why this exists:
 *   The original design used a tab-bar pattern where /threatintel/<hub>
 *   was a single page that switched between sub-pages via query params
 *   (e.g. ?tab=directory) or path params (e.g. /<hub>/<tab>). The tabs
 *   were real React components but not real URLs — the user couldn't
 *   bookmark them, share them, or use Cmd+K to jump to them.
 *
 *   This file is the single source of truth that drives:
 *     - App.tsx route registration
 *     - Sidebar nav (auto-generated from HUB_META)
 *     - Catalog page (groups + search)
 *     - Prerender manifest (scripts/prerender.mjs)
 *     - Sitemap (public/sitemap.xml)
 *
 *   When you add a new page:
 *     1. Create the .tsx component.
 *     2. Add a HubPage entry to the right hub's `pages` array.
 *     3. Add the route to App.tsx.
 *     4. (Optional) add a redirect for any legacy alias.
 */

import {
  AlertTriangle,
  Bell,
  Brain,
  Bug,
  Cloud,
  ExternalLink,
  FileText,
  GitBranch,
  Globe,
  LineChart,
  type LucideIcon,
  Radio,
  Rss,
  Search,
  Shield,
  ShieldAlert,
  Target,
  Users,
  Wrench,
} from 'lucide-react';

export type HubPageBadge = 'live' | 'new' | 'beta';

export interface HubPage {
  /** Direct URL the page is reachable at. */
  path: string;
  /** The tab id used in the legacy hub-tab URL pattern. */
  tabId: string;
  /** Display label for the tile and sidebar. */
  label: string;
  /** One-line description. */
  desc: string;
  /** Lazily-loaded component variable name (from App.tsx). */
  compVar: string;
  /** Optional live/new badge. */
  badge?: HubPageBadge;
  /** Extra search keywords. */
  keywords?: readonly string[];
  /** Optional per-page icon. Falls back to hub icon when absent. */
  icon?: LucideIcon;
}

export interface HubMeta {
  /** Unique id for the hub. Used in URLs (/threatintel/<id>). */
  id: string;
  /** Display label. */
  label: string;
  /** One-line description for the hub landing page. */
  blurb: string;
  /** Lucide icon name. */
  icon: LucideIcon;
  /** Tailwind tone classes. */
  tone: string;
  /** All pages that belong to this hub. */
  pages: readonly HubPage[];
}

/* ------------------------------------------------------------------ */
/*  Hub definitions                                                   */
/* ------------------------------------------------------------------ */

export const HUB_META: readonly HubMeta[] = [
  {
    id: 'actors',
    label: 'Actors & Threat Groups',
    blurb: 'Threat-actor profiles, attribution, DNA, timelines, and APT tracking.',
    icon: Users,
    tone: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
    pages: [
      {
        path: '/threatintel/actors/directory',
        tabId: 'directory',
        label: 'Actor Directory',
        desc: 'Unified actor browser — MITRE ATT&CK, MISP Galaxy, and platform DB.',
        compVar: 'ActorDirectory',
      },
      {
        path: '/threatintel/actors/timeline',
        tabId: 'timeline',
        label: 'Actor Timeline',
        desc: 'Posting activity and operational tempo per actor.',
        compVar: 'ActorTimeline',
      },
      {
        path: '/threatintel/actors/dna',
        tabId: 'dna',
        label: 'Actor DNA',
        desc: 'TTP signatures and infrastructure fingerprints.',
        compVar: 'ActorDNA',
      },
      {
        path: '/threatintel/actors/usernames',
        tabId: 'usernames',
        label: 'Actor Usernames',
        desc: 'Search forum handles across 2M+ records.',
        compVar: 'ActorUsernameSearch',
      },
      {
        path: '/threatintel/actors/attribution',
        tabId: 'attribution',
        label: 'Attribution Framework',
        desc: 'Attribution framework and analysis.',
        compVar: 'Attribution',
      },
      {
        path: '/threatintel/actors/catalog',
        tabId: 'catalog',
        label: 'Threat Actor Catalog',
        desc: 'Curated profiles — aliases, countries, malware, TTPs.',
        compVar: 'ThreatActorCatalog',
      },
      {
        path: '/threatintel/actors/profiles',
        tabId: 'profiles',
        label: 'Actor Profiles',
        desc: 'Expandable actor cards — aliases, malware, targeted sectors, campaigns, MITRE mapping.',
        compVar: 'ActorProfiles',
        badge: 'new',
      },
      {
        path: '/threatintel/actors/graph',
        tabId: 'graph',
        label: 'Actor Graph',
        desc: 'Visualize actor → actor → IOC connections.',
        compVar: 'RelationshipGraph',
      },
      {
        path: '/threatintel/apt-tracker',
        tabId: 'apt-tracker',
        label: 'APT Tracker',
        desc: 'APT group tracker organised by region — China, Russia, Iran, North Korea, NATO, Middle East, Israel.',
        compVar: 'AptTracker',
      },
      {
        path: '/threatintel/most-wanted',
        tabId: 'most-wanted',
        label: 'Most Wanted Actors',
        desc: 'Top-priority threat actors — LockBit, Cl0p, Scattered Spider, BlackCat, and other high-impact groups.',
        compVar: 'MostWanted',
      },
      {
        path: '/threatintel/extremists',
        tabId: 'extremists',
        label: 'Extremist Groups',
        desc: 'Ideology-driven extremist group tracking with indicators and monitoring sources.',
        compVar: 'Extremists',
      },
      {
        path: '/threatintel/predators',
        tabId: 'predators',
        desc: 'Online predator categories, regional risk, and intervention resources.',
        label: 'Online Predators',
        compVar: 'Predators',
      },
      {
        path: '/threatintel/apt-actors',
        tabId: 'apt-actors',
        label: 'APT Actor Database',
        desc: 'ETDA Threat Group Cards — 416+ threat actors with attribution, tools, sectors, and operations.',
        compVar: 'ETDAActors',
      },
      {
        path: '/threatintel/aptmap',
        tabId: 'aptmap',
        label: 'APTmap Malware Analysis',
        desc: 'Cross-sample malware analysis across 18,000+ samples — file types, PE metadata, DLL imports, certificates, and APT-to-tool relationships.',
        compVar: 'Aptmap',
        badge: 'new',
      },
      {
        path: '/threatintel/actors/directory',
        tabId: 'mitre',
        label: 'Threat Actor Knowledge Base',
        desc: 'Knowledge base of threat actors with profiles, aliases, TTPs, and associated campaigns.',
        compVar: 'ActorKb',
      },
    ],
  },
  {
    id: 'campaigns',
    label: 'Campaigns & Briefings',
    blurb: 'Active and historical campaigns, attribution, briefings, and assessments.',
    icon: GitBranch,
    tone: 'text-orange-700 dark:text-orange-300 border-orange-500/30 bg-orange-500/10',
    pages: [
      {
        path: '/threatintel/campaigns/active',
        tabId: 'active',
        label: 'Active Campaigns',
        desc: 'Active campaign tracker with status, severity, and IOC rollups.',
        compVar: 'Campaigns',
      },
      {
        path: '/threatintel/campaigns/lifecycle',
        tabId: 'lifecycle',
        label: 'Campaign Lifecycle',
        desc: 'Discovery → exploitation → actions on objectives.',
        compVar: 'CampaignLifecycle',
      },
      {
        path: '/threatintel/campaigns/generator',
        tabId: 'generator',
        label: 'Campaign Generator',
        desc: 'AI-powered campaign generation for tabletop exercises.',
        compVar: 'CampaignGenerator',
        badge: 'new',
      },
      {
        path: '/threatintel/campaigns/cross',
        tabId: 'cross',
        label: 'Cross-Campaign',
        desc: 'Find connections across campaigns, actors, and IOCs.',
        compVar: 'CrossCampaignCorrelation',
      },
      {
        path: '/threatintel/campaigns/reference',
        tabId: 'reference',
        label: 'Campaign Reference',
        desc: 'Curated tracker of active/dormant/concluded campaigns with writeup links and TTPs.',
        compVar: 'CampaignsReference',
        badge: 'new',
      },
      {
        path: '/threatintel/briefings',
        tabId: 'briefings',
        label: 'Daily & Weekly Briefings',
        desc: 'Tactical digests with IOCs, severity, and detection guidance.',
        compVar: 'Briefings',
      },
    ],
  },
  {
    id: 'iocs',
    label: 'IOCs & Threat Intel',
    blurb: 'Live indicator streams, enrichment, C2 tracking, and supply-chain intel.',
    icon: Target,
    tone: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
    pages: [
      {
        path: '/threatintel/iocs/live',
        tabId: 'live',
        label: 'Live IOC Stream',
        desc: 'Real-time IOC feed from 12+ providers — IP, domain, hash, URL.',
        compVar: 'LiveIocs',
        badge: 'live',
      },
      {
        path: '/threatintel/iocs/enrichment',
        tabId: 'enrichment',
        label: 'IOC Enrichment',
        desc: 'Pivot and enrich any indicator across VT, AbuseIPDB, Shodan, OTX.',
        compVar: 'IocEnrichment',
      },
      {
        path: '/threatintel/iocs/feeds',
        tabId: 'feeds',
        label: 'IOC Feeds',
        desc: 'Structured indicator feeds ready for SIEM, EDR, or CTI ingestion.',
        compVar: 'IocFeedsPage',
      },
      {
        path: '/threatintel/iocs/entity',
        tabId: 'entity',
        label: 'Entity Resolution',
        desc: 'Resolve entities across intel sources — actor, malware, campaign.',
        compVar: 'EntityResolution',
      },
      {
        path: '/threatintel/iocs/c2',
        tabId: 'c2',
        label: 'C2 Tracker',
        desc: 'Live C2 infrastructure tracker — Cobalt Strike, Sliver, Mythic, 30+ families.',
        compVar: 'C2Tracker',
        badge: 'live',
      },
      {
        path: '/threatintel/iocs/map',
        tabId: 'map',
        label: 'Threat Map',
        desc: 'Geo-visualization of IOCs by country and ASN.',
        compVar: 'ThreatMap',
      },
      {
        path: '/threatintel/iocs/cross',
        tabId: 'cross',
        label: 'Cross-Correlate',
        desc: 'Cross-source IOC correlation — single-feed vs multi-feed confidence.',
        compVar: 'CrossCorrelate',
      },
      {
        path: '/threatintel/iocs/correlation',
        tabId: 'correlation',
        label: 'IOC Correlation',
        desc: 'IOC correlation analysis with timeline.',
        compVar: 'IocCorrelation',
      },
      {
        path: '/threatintel/iocs/aggregated',
        tabId: 'aggregated',
        label: 'Aggregated Feeds',
        desc: 'Aggregated feed browser — what each provider ships.',
        compVar: 'AggregatedFeeds',
      },
      {
        path: '/threatintel/iocs/observable',
        tabId: 'observable',
        label: 'Observable DB',
        desc: 'Every indicator seen, with provenance.',
        compVar: 'ObservableDb',
      },
      {
        path: '/threatintel/soc-dashboard?tab=iocs',
        tabId: 'iocs',
        label: 'SOC IOC View',
        desc: 'SOC-focused IOC dashboard — relevant indicators sorted by priority with enrichment context.',
        compVar: 'SocIocView',
      },
    ],
  },
  {
    id: 'cves',
    label: 'CVEs & Vulnerabilities',
    blurb: 'CVE intel, KEV catalog, GitHub advisories, and exploit tracking.',
    icon: AlertTriangle,
    tone: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
    pages: [
      {
        path: '/threatintel/cves/cves',
        tabId: 'cves',
        label: 'CVE Intel',
        desc: 'Unified CVE intelligence — NVD + KEV + EPSS + exploit availability.',
        compVar: 'CveIntel',
      },
      {
        path: '/threatintel/cves/advisories',
        tabId: 'advisories',
        label: 'GitHub Advisories',
        desc: 'GitHub security advisories with affected versions and patches.',
        compVar: 'GithubAdvisories',
      },
      {
        path: '/threatintel/cves/resources',
        tabId: 'resources',
        label: 'CVE Resources',
        desc: 'CVE resource catalogs — patch priority, exploit DB, vendor bulletins.',
        compVar: 'CveResourcesCatalog',
      },
    ],
  },
  {
    id: 'malware',
    label: 'Malware & Samples',
    blurb: 'Malware IOCs, sandbox, sample vault, malicious packages, and family encyclopedia.',
    icon: Bug,
    tone: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    pages: [
      {
        path: '/threatintel/malware/iocs',
        tabId: 'iocs',
        label: 'Malware IOCs',
        desc: 'Malware IOC feeds across 50+ families.',
        compVar: 'MalwareIocs',
      },
      {
        path: '/threatintel/malware/vault',
        tabId: 'vault',
        label: 'Malware Vault',
        desc: 'Malware sample vault with hashes and metadata.',
        compVar: 'MalwareVault',
      },
      {
        path: '/threatintel/malware/sandbox',
        tabId: 'sandbox',
        label: 'Malware Sandbox',
        desc: 'Hash lookup across 10+ sandbox platforms — consensus verdict.',
        compVar: 'MalwareSandbox',
        badge: 'new',
      },
      {
        path: '/threatintel/malware/packages',
        tabId: 'packages',
        label: 'Malicious Packages',
        desc: 'Malicious package tracking — npm, PyPI, RubyGems, Maven, NuGet.',
        compVar: 'MaliciousPackages',
      },
      {
        path: '/threatintel/malware/supply-chain',
        tabId: 'supply-chain',
        label: 'Supply-Chain Incidents',
        desc: 'Confirmed supply-chain compromise incidents — npm · PyPI · containers · AI agents. Data: supplychainattack.org.',
        compVar: 'SupplyChainAttacks',
      },
      {
        path: '/threatintel/depx',
        tabId: 'depx',
        label: 'Supply-Chain Feed',
        desc: 'Malicious package intelligence from OpenSSF — ecosystem breakdown, package verdicts, and advisory tracking.',
        compVar: 'SupplyChainFeed',
      },
      {
        path: '/threatintel/malware/malpedia',
        tabId: 'malpedia',
        label: 'Malpedia',
        desc: 'Malpedia malware encyclopedia — families, YARA, references.',
        compVar: 'MalpediaPage',
      },
      {
        path: '/threatintel/malware/maltrail',
        tabId: 'maltrail',
        label: 'Maltrail Trails',
        desc: 'Maltrail detection trails for known malware.',
        compVar: 'MaltrailTrails',
      },
    ],
  },
  {
    id: 'feeds',
    label: 'Feeds & Sources',
    blurb: 'Feed catalog, sources, quality, scheduler, and reliability tracking.',
    icon: Rss,
    tone: 'text-sky-700 dark:text-sky-300 border-sky-500/30 bg-sky-500/10',
    pages: [
      {
        path: '/threatintel/feeds/catalog',
        tabId: 'catalog',
        label: 'Feed Catalog',
        desc: 'Feed file browser with format and sample preview.',
        compVar: 'FeedCatalog',
      },
      {
        path: '/threatintel/feeds/sources',
        tabId: 'sources',
        label: 'Feed Sources',
        desc: 'Feed source registry with enabled/disabled state.',
        compVar: 'FeedSources',
      },
      {
        path: '/threatintel/feeds/quality',
        tabId: 'quality',
        label: 'Feed Quality',
        desc: 'Feed quality metrics — freshness, accuracy, FP rate.',
        compVar: 'FeedQuality',
      },
      {
        path: '/threatintel/feeds/scheduler',
        tabId: 'scheduler',
        label: 'Feed Scheduler',
        desc: 'Feed scheduling and orchestration — cron, retry, backoff.',
        compVar: 'FeedScheduler',
      },
      {
        path: '/threatintel/feeds/threatfeeds',
        tabId: 'threatfeeds',
        label: 'Threat Feeds',
        desc: 'Curated threat intelligence feeds from 50+ providers.',
        compVar: 'ThreatFeeds',
        badge: 'live',
      },
      {
        path: '/threatintel/feeds/mythreatintel',
        tabId: 'mythreatintel',
        label: 'My Threat Intel',
        desc: 'My curated threat-intel feed — personal bookmarks and follows.',
        compVar: 'MyThreatIntel',
      },
      {
        path: '/threatintel/source-health',
        tabId: 'grades',
        label: 'Feed Reliability',
        desc: 'Reliability scoring for each feed provider — uptime, freshness, accuracy, and NATO Admiralty trust grades.',
        compVar: 'FeedReliability',
      },
      {
        path: '/threatintel/source-health',
        tabId: 'status',
        label: 'Feed Status',
        desc: 'Real-time operational status of all feed providers — last fetch, errors, rate limits.',
        compVar: 'FeedStatus',
      },
      {
        path: '/threatintel/source-health',
        tabId: 'source-health',
        label: 'Source Health',
        desc: 'Operational status, SLO metrics, and NATO Admiralty trust grades for every upstream feed.',
        compVar: 'SourceHealth',
      },
    ],
  },
  {
    id: 'social',
    label: 'Social & Live Feeds',
    blurb: 'Telegram, X/Bluesky, Reddit, and crypto-scam streams.',
    icon: Radio,
    tone: 'text-violet-700 dark:text-violet-300 border-violet-500/30 bg-violet-500/10',
    pages: [
      {
        path: '/threatintel/social/firehose',
        tabId: 'firehose',
        label: 'Social Firehose',
        desc: 'Multi-platform social media firehose.',
        compVar: 'SocialFirehose',
        badge: 'live',
      },
      {
        path: '/threatintel/social/news',
        tabId: 'news',
        label: 'Tech & AI News',
        desc: 'Tech and AI news aggregation.',
        compVar: 'TechAiNews',
      },
      {
        path: '/threatintel/social/crypto-scam',
        tabId: 'crypto-scam',
        label: 'Crypto Scam Feed',
        desc: 'Crypto scam feed — wallet addresses, drainers, phishing sites.',
        compVar: 'CryptoScamFeed',
        badge: 'live',
      },
      {
        path: '/threatintel/telegram',
        tabId: 'telegram-hub',
        label: 'Telegram Intelligence Hub',
        desc: 'Unified Telegram CTI workspace — free cross-source search, KPIs, and entry points to all Telegram surfaces (leak monitor, IOC pipeline, channel discovery, settings).',
        compVar: 'TelegramHub',
        badge: 'new',
      },
      {
        path: '/threatintel/telegram-monitor',
        tabId: 'telegram-monitor',
        label: 'Telegram Leak Monitor',
        desc: 'Telegram Intelligence Hub — 7 tabs: firehose (merged cross-source stream), leak feed, channel search (tgstat-backed), statistics, channel discovery, linked actors (channel → MITRE pivot), and settings.',
        compVar: 'TelegramMonitor',
        badge: 'live',
      },
      {
        path: '/threatintel/telegram-iocs',
        tabId: 'telegram-iocs',
        label: 'Telegram IOC Pipeline',
        desc: 'Telegram-leaked IOCs flowing into the cross-source consensus — hashes, IPs, domains, CVEs, URLs from monitored channels (7-day window).',
        compVar: 'TelegramIocs',
        badge: 'new',
      },
      {
        path: '/threatintel/social/reddit',
        tabId: 'reddit',
        label: 'Reddit CTI',
        desc: 'Reddit threat intelligence — monitor security-related subreddits for IOCs and discussions.',
        compVar: 'RedditCti',
      },
      {
        path: '/threatintel/social/scraped-intel',
        tabId: 'scraped-intel',
        label: 'Scraped Intel',
        desc: 'Scraped intelligence from web sources — cleaned, deduplicated, and enriched.',
        compVar: 'ScrapedIntel',
      },
      {
        path: '/threatintel/telegram-monitor?tab=channels',
        tabId: 'telegram-channels',
        label: 'Telegram Channel Discovery',
        desc: 'Discover Telegram channels relevant to threat intelligence — search, category, and language filters.',
        compVar: 'TelegramChannels',
      },
      {
        path: '/threatintel/telegram-monitor?tab=leaks',
        tabId: 'telegram-leaks',
        label: 'Telegram Leak Feed',
        desc: 'Dedicated Telegram leak channel feed — credential dumps, data breaches, and exposed databases.',
        compVar: 'TelegramLeaks',
      },
      {
        path: '/threatintel/telegram-monitor?tab=settings',
        tabId: 'telegram-settings',
        label: 'Telegram Settings',
        desc: 'Telegram integration settings — channel subscriptions, API configuration, notification preferences.',
        compVar: 'TelegramSettings',
      },
      {
        path: '/threatintel/telegram-monitor?tab=stats',
        tabId: 'telegram-stats',
        label: 'Telegram Statistics',
        desc: 'Telegram channel analytics — message volume, engagement, IOC yield, and provider reliability.',
        compVar: 'TelegramStats',
      },
      {
        path: '/threatintel/social/x-firehose',
        tabId: 'x-firehose',
        label: 'X/Twitter Firehose',
        desc: 'X/Twitter threat intelligence firehose — real-time posts from monitored security accounts.',
        compVar: 'XFirehose',
        badge: 'live',
      },
      {
        path: '/threatintel/social/x-live',
        tabId: 'x-live',
        label: 'X/Twitter Live Stream',
        desc: 'Live X/Twitter stream — real-time security event and IOC posting monitor.',
        compVar: 'XLiveStream',
        badge: 'live',
      },
      {
        path: '/threatintel/social/x-watch',
        tabId: 'x-watch',
        label: 'X/Twitter Watch',
        desc: 'X/Twitter watchlist — monitor specific accounts, keywords, and hashtags for threat intel.',
        compVar: 'XWatch',
      },
    ],
  },
  {
    id: 'darkweb',
    label: 'Dark Web & Cybercrime',
    blurb: 'Dark-web monitoring, ransomware activity, breach forums, and infostealer logs.',
    icon: Globe,
    tone: 'text-slate-700 dark:text-slate-300 border-slate-500/30 bg-slate-500/10',
    pages: [
      {
        path: '/threatintel/darkweb/watch',
        tabId: 'watch',
        label: 'Dark Web Watch',
        desc: 'Dark-web monitoring dashboard.',
        compVar: 'DarkWeb',
      },
      {
        path: '/threatintel/darkweb/markets',
        tabId: 'markets',
        label: 'Darknet Markets Timeline',
        desc: 'Darknet market timelines — Empire, Genesis, Hydra successors.',
        compVar: 'DarknetMarketsTimeline',
      },
      {
        path: '/threatintel/darkweb/forums',
        tabId: 'forums',
        label: 'Breach Forums',
        desc: 'Breach forum tracker — posts, threads, user activity.',
        compVar: 'BreachForums',
      },
      {
        path: '/threatintel/darkweb/deepdark',
        tabId: 'deepdark',
        label: 'DeepDarkCTI',
        desc: 'DeepDark CTI sources — vetted onion feeds.',
        compVar: 'DeepDarkCTI',
      },
      {
        path: '/threatintel/darkweb/crime',
        tabId: 'crime',
        label: 'Cybercrime',
        desc: 'Cybercrime ecosystem intelligence — actors, services, pricing.',
        compVar: 'CyberCrime',
      },
      {
        path: '/threatintel/darkweb/bitcoin',
        tabId: 'bitcoin',
        label: 'Physical Bitcoin Attacks',
        desc: 'Physical Bitcoin attack tracking — wrench attacks, kidnappings.',
        compVar: 'PhysicalBitcoinAttacks',
      },
      {
        path: '/threatintel/darkweb/infostealer',
        tabId: 'infostealer',
        label: 'Infostealer Logs',
        desc: 'Infostealer log analysis — credentials, cookies, system fingerprints.',
        compVar: 'Infostealer',
        badge: 'live',
      },
      {
        path: '/threatintel/darkweb/leaks',
        tabId: 'leaks',
        label: 'Secret Leaks',
        desc: 'Secret and credential leak monitoring across paste sites.',
        compVar: 'SecretLeaks',
        badge: 'live',
      },
      {
        path: '/threatintel/darkweb/disclosures',
        tabId: 'disclosures',
        label: 'Breach Disclosures',
        desc: 'Breach disclosure feed — official statements and regulatory filings.',
        compVar: 'BreachDisclosures',
      },
      {
        path: '/threatintel/darkweb/breach-watch',
        tabId: 'breach-watch',
        label: 'Breach Watch',
        desc: 'Aggregated breach and leak corpus from 6 public trackers — ransomware leaks, data breaches, combo lists.',
        compVar: 'BreachWatch',
        badge: 'new',
      },
      {
        path: '/threatintel/darkweb/ransom-report',
        tabId: 'ransom-report',
        label: 'Ransom Report',
        desc: 'Per-group ransomware CTI dossier — TTPs, victims, demands.',
        compVar: 'RansomReport',
      },
      {
        path: '/threatintel/darkweb/ransom-activity',
        tabId: 'ransom-activity',
        label: 'Ransomware Activity',
        desc: 'Live ransomware activity feed — new victims, leak posts.',
        compVar: 'RansomwareActivity',
        badge: 'live',
      },
      {
        path: '/threatintel/darkweb/ransom-map',
        tabId: 'ransom-map',
        label: 'Ransomware Map',
        desc: 'Ransomware victim geo map — country, sector, group.',
        compVar: 'RansomwareMap',
      },
      {
        path: '/threatintel/darkweb/ransomwhere',
        tabId: 'ransomwhere',
        label: 'Ransomwhere',
        desc: 'Crypto wallet directory tied to known ransom groups.',
        compVar: 'Ransomwhere',
      },
      {
        path: '/threatintel/darkweb/recon',
        tabId: 'recon',
        label: 'Dark Web Recon',
        desc: 'Search .onion sites, look up hidden service metadata, check BTC addresses for abuse, and scan Tor exit nodes.',
        keywords: [
          'tor',
          'onion',
          'ahmia',
          'dark web search',
          'bitcoin',
          'btc abuse',
          'exit node',
        ] as readonly string[],
        compVar: 'DarkWebRecon',
      },
      {
        path: '/threatintel/ransomware-live',
        tabId: 'ransomware-live',
        label: 'ransomware.live PRO',
        desc: 'Authenticated PRO surface — victim stats, recent cyberattacks, negotiations, and YARA packs.',
        compVar: 'RansomwareLive',
      },
      {
        path: '/threatintel/cyberpulse',
        tabId: 'cyberpulse',
        label: 'CyberPulse',
        desc: 'Breach, leak & cybercrime incident tracker from X/Twitter, Telegram, Reddit, Bluesky & Mastodon firehose.',
        compVar: 'CyberPulse',
      },
      {
        path: '/threatintel/onion-watch',
        tabId: 'onion-watch',
        label: 'Onion Watch',
        desc: 'Dark web .onion service monitoring — uptime, content changes, and new service discovery.',
        compVar: 'OnionWatch',
      },
    ],
  },
  {
    id: 'phishing',
    label: 'Phishing & Email Defense',
    blurb: 'Phish feed, wordlists, scam watch, and email-defense analysis.',
    icon: ShieldAlert,
    tone: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
    pages: [
      {
        path: '/threatintel/phishing/phish',
        tabId: 'phish',
        label: 'Phish Feed',
        desc: 'Phishing feed aggregation — fresh URLs and lure analysis.',
        compVar: 'PhishFeed',
        badge: 'live',
      },
      {
        path: '/threatintel/phishing/urls',
        tabId: 'urls',
        label: 'Phishing Wordlists',
        desc: 'Phishing hunting wordlists — brand, gift-card, sextortion, BEC.',
        compVar: 'PhishingWordlists',
      },
      {
        path: '/threatintel/phishing/scam',
        tabId: 'scam',
        label: 'Scam Watch',
        desc: 'Scam watch and monitoring — pig-butchering, romance, investment.',
        compVar: 'ScamWatch',
      },
    ],
  },
  {
    id: 'infra',
    label: 'Infrastructure & Cloud',
    blurb: 'Cloud threat landscape, infrastructure intel, web assets, and domain monitoring.',
    icon: Cloud,
    tone: 'text-sky-700 dark:text-sky-300 border-cyan-500/30 bg-cyan-500/10',
    pages: [
      {
        path: '/threatintel/infra/cloud',
        tabId: 'cloud',
        label: 'Cloud Threat Landscape',
        desc: 'Cloud threat landscape — AWS, Azure, GCP, Kubernetes, SaaS.',
        compVar: 'CloudThreatLandscape',
      },
      {
        path: '/threatintel/infra/infra',
        tabId: 'infra',
        label: 'Infrastructure Intel',
        desc: 'Infrastructure intelligence — ASN, IP, certificate, hosting pivots.',
        compVar: 'InfraIntel',
      },
      {
        path: '/threatintel/infra/webamon',
        tabId: 'webamon',
        label: 'Webamon',
        desc: 'Web asset monitoring — external footprint, exposed services, drift detection.',
        compVar: 'Webamon',
      },
      {
        path: '/threatintel/infra/domain',
        tabId: 'domain',
        label: 'Domain Monitor',
        desc: 'Domain monitoring — typosquats, lookalikes, certificate transparency.',
        compVar: 'DomainMonitor',
      },
      {
        path: '/threatintel/infra/ai-honeypot',
        tabId: 'ai-honeypot',
        label: 'AI Honeypot Observatory',
        desc: 'LLM/AI endpoint honeypot intelligence — attacker categories, top IPs, and attack volume from ai-honeypots.com.',
        compVar: 'AiHoneypotObservatory',
      },
    ],
  },
  {
    id: 'detections',
    label: 'Detection & Response',
    blurb: 'Detection rules, ATT&CK mapping, YARA, and threat signal feeds.',
    icon: Shield,
    tone: 'text-indigo-700 dark:text-indigo-300 border-indigo-500/30 bg-indigo-500/10',
    pages: [
      {
        path: '/threatintel/detections/detections',
        tabId: 'detections',
        label: 'Detection Rules',
        desc: 'Detection rule catalog — Sigma, YARA, Suricata, KQL.',
        compVar: 'Detections',
      },
      {
        path: '/threatintel/detections/disarm',
        tabId: 'disarm',
        label: 'DISARM Framework',
        desc: 'DISARM red-team framework mapping.',
        compVar: 'DisarmFramework',
      },
      {
        path: '/threatintel/detections/yara',
        tabId: 'yara',
        label: 'YARA Hub',
        desc: 'YARA rule hub — community and curated rules.',
        compVar: 'YaraPage',
      },
      {
        path: '/threatintel/detections/signal',
        tabId: 'signal',
        label: 'Threat Signal RSS',
        desc: 'Threat-signal RSS feed with auto-classified indicators.',
        compVar: 'ThreatSignalRss',
      },
    ],
  },
  {
    id: 'research-hub',
    label: 'Research & Reports',
    blurb: 'Research posts, intelligence reports, write-ups, and external research.',
    icon: FileText,
    tone: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
    pages: [
      {
        path: '/threatintel/research-hub/reports',
        tabId: 'reports',
        label: 'Threat Intel Reports',
        desc: 'Original research reports with IOCs, detections, severity scoring.',
        compVar: 'Reports',
      },
      {
        path: '/threatintel/research-hub/ai',
        tabId: 'ai',
        label: 'AI Reports',
        desc: 'AI-generated research reports from LLM analysis.',
        compVar: 'AIReportShowcase',
        badge: 'new',
      },
      {
        path: '/threatintel/research-hub/writeups',
        tabId: 'writeups',
        label: 'Write-ups',
        desc: 'Security write-ups and post-mortems.',
        compVar: 'Writeups',
      },
      {
        path: '/threatintel/research-hub/signal',
        tabId: 'signal',
        label: 'Research Signal',
        desc: 'Research-signal feed — what changed since last visit.',
        compVar: 'ResearchSignal',
      },
      {
        path: '/threatintel/research-hub/redhunt',
        tabId: 'redhunt',
        label: 'RedHunt Insights',
        desc: 'RedHunt Labs threat-intel insights.',
        compVar: 'RedHuntInsights',
      },
      {
        path: '/threatintel/research-hub/volexity',
        tabId: 'volexity',
        label: 'Volexity Threat Intel',
        desc: 'Volexity threat-intelligence posts.',
        compVar: 'VolexityThreatIntel',
      },
      {
        path: '/threatintel/research-hub/post',
        tabId: 'post',
        label: 'Research Post',
        desc: 'Individual research post (template page).',
        compVar: 'ResearchPost',
      },
      {
        path: '/threatintel/research-hub/attack-flow',
        tabId: 'attack-flow',
        label: 'Attack Flow Library',
        desc: 'ATT&CK attack-flow library with reusable patterns.',
        compVar: 'AttackFlowLibrary',
      },

      {
        path: '/threatintel/research-hub/knowledge',
        tabId: 'knowledge',
        label: 'Knowledge Graph',
        desc: 'Knowledge graph of actors, malware, campaigns, IOCs.',
        compVar: 'KnowledgeGraph',
      },
      {
        path: '/threatintel/research-hub/ach',
        tabId: 'ach',
        label: 'ACH',
        desc: 'Analysis of Competing Hypotheses.',
        compVar: 'ACH',
      },
      {
        path: '/threatintel/research-hub/library',
        tabId: 'library',
        label: 'Reports & Reading Library',
        desc: 'Curated collection of 28 annual reports, frameworks, standards, and learning resources.',
        compVar: 'ReportsLibrary',
        badge: 'new',
      },
      {
        path: '/threatintel/research-hub/agentic',
        tabId: 'agentic',
        label: 'Agentic Research',
        desc: 'AI agent-driven research generation — automated threat intelligence briefs and analysis.',
        compVar: 'AgenticResearch',
      },
      {
        path: '/threatintel/research-hub/redhunt-labs',
        tabId: 'redhunt-labs',
        label: 'RedHunt Labs Research',
        desc: 'RedHunt Labs research publications — vulnerability disclosures, threat reports, and tool releases.',
        compVar: 'RedhuntLabs',
      },
      {
        path: '/threatintel/research-hub/research',
        tabId: 'research',
        label: 'Research Hub Home',
        desc: 'Research hub landing — aggregated research content, reports, and analysis.',
        compVar: 'ResearchHub',
      },
    ],
  },
  {
    id: 'wiki',
    label: 'Knowledge & Frameworks',
    blurb: 'Wiki, MITRE ATT&CK, F3EAD, insider threat, OWASP AI, and LLM atlas.',
    icon: Brain,
    tone: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
    pages: [
      {
        path: '/threatintel/wiki/wiki',
        tabId: 'wiki',
        label: 'Threat Intel Wiki',
        desc: 'Long-form articles on Telegram OSINT, dark-web monitoring.',
        compVar: 'Wiki',
      },
      {
        path: '/threatintel/wiki/mitre',
        tabId: 'mitre',
        label: 'MITRE ATT&CK',
        desc: 'MITRE ATT&CK matrix with technique pivots.',
        compVar: 'MitreMatrix',
      },
      {
        path: '/threatintel/wiki/f3ead',
        tabId: 'f3ead',
        label: 'F3EAD',
        desc: 'F3EAD intelligence workflow framework.',
        compVar: 'F3ead',
      },
      {
        path: '/threatintel/wiki/insider',
        tabId: 'insider',
        label: 'Insider Threat Matrix',
        desc: 'Insider threat matrix and detection guidance.',
        compVar: 'InsiderThreatMatrix',
      },
      {
        path: '/threatintel/wiki/owasp',
        tabId: 'owasp',
        label: 'OWASP AI Landscape',
        desc: 'OWASP AI security landscape and LLM top-10.',
        compVar: 'OwaspAiLandscape',
      },
      {
        path: '/threatintel/wiki/llm',
        tabId: 'llm',
        label: 'LLM Threat Atlas',
        desc: 'MITRE ATLAS — LLM/AI threat atlas.',
        compVar: 'LlmThreatAtlas',
      },
      {
        path: '/threatintel/about',
        tabId: 'about',
        label: 'About the Platform',
        desc: 'What is covered, data principles, and the analyst-first design intent behind the surface.',
        compVar: 'ThreatIntelAbout',
      },
    ],
  },
  {
    id: 'osint',
    label: 'OSINT',
    blurb: 'OSINT frameworks, CLI tools, country map, and curated toolbox.',
    icon: Search,
    tone: 'text-teal-700 dark:text-teal-300 border-teal-500/30 bg-teal-500/10',
    pages: [
      {
        path: '/threatintel/osint/framework',
        tabId: 'framework',
        label: 'OSINT Framework',
        desc: 'OSINT framework browser — 70+ tools organized by category.',
        compVar: 'OsintFramework',
      },
      {
        path: '/threatintel/osint/cli',
        tabId: 'cli',
        label: 'OSINT CLI Tools',
        desc: 'Curated CLI tools — username, email, domain, social, recon.',
        compVar: 'OsintCliTools',
        badge: 'new',
      },
      {
        path: '/threatintel/osint/map',
        tabId: 'map',
        label: 'OSINT Country Map',
        desc: 'Country-based OSINT map — sources by jurisdiction.',
        compVar: 'OsintCountryMap',
      },
      {
        path: '/threatintel/osint/toolbox',
        tabId: 'toolbox',
        label: 'Curated Toolbox',
        desc: 'Curated security toolbox — hand-picked, vetted, well-maintained.',
        compVar: 'CuratedToolbox',
      },
      {
        path: '/threatintel/osint/certs',
        tabId: 'certs',
        label: 'Free Cert Courses',
        desc: 'Syberseeker’s start.me hub of free certification tracks — security, cloud, blue team, OSINT, GRC.',
        compVar: 'CuratedCerts',
        badge: 'new',
      },
      {
        path: '/threatintel/osint/secops',
        tabId: 'secops',
        label: 'SecOps Tools',
        desc: 'SecOps tools catalog — SIEM, EDR, SOAR, log shippers.',
        compVar: 'SecopsCatalog',
      },
      {
        path: '/threatintel/osint/directory',
        tabId: 'directory',
        label: 'OSINT Portal Directory',
        desc: 'Curated directory of 40 OSINT portals and resources filtered by category.',
        compVar: 'OsintDirectory',
        badge: 'new',
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools & Utilities',
    blurb: 'AI copilot, MCP search, MISP, STIX, investigations, and watches.',
    icon: Wrench,
    tone: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
    pages: [
      {
        path: '/threatintel/tools/copilot',
        tabId: 'copilot',
        label: 'Threat Intel Copilot',
        desc: 'AI copilot — ask, pivot, summarize, draft.',
        compVar: 'Copilot',
        badge: 'new',
      },
      {
        path: '/threatintel/entity-graph',
        tabId: 'entity-graph',
        label: 'Entity Graph',
        desc: 'Interactive topology of CVEs, actors, IOCs, sectors, and techniques.',
        compVar: 'EntityGraphPage',
        badge: 'new',
      },
      {
        path: '/threatintel/vera',
        tabId: 'vera',
        label: 'Vera',
        desc: 'Vera — AI-powered investigative assistant for threat intelligence workflows.',
        compVar: 'VeraChat',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/mcp',
        tabId: 'mcp',
        label: 'MCP Search · TI Mindmap Hub',
        desc: 'Search 1,628+ reports, CVEs, IOCs, briefings, STIX bundles, and knowledge graph via 25 MCP tools on ti-mindmap-hub.com.',
        compVar: 'McpSearch',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/misp',
        tabId: 'misp',
        label: 'MISP Browser',
        desc: 'MISP galaxy and event browser.',
        compVar: 'MispBrowser',
      },
      {
        path: '/threatintel/tools/stix',
        tabId: 'stix',
        label: 'STIX Bundle Browser',
        desc: 'Browse and download STIX 2.1 bundles for OpenCTI, MISP, etc.',
        compVar: 'StixBundleBrowser',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/stix-ip-export',
        tabId: 'stix-ip-export',
        label: 'STIX IP Enrichment',
        desc: 'Enrich IPs via IPinfo/AbuseIPDB/Shodan and export as STIX 2.1 bundle.',
        compVar: 'StixIpExport',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/stix-bundles',
        tabId: 'stix-bundles',
        label: 'STIX Bundles API',
        desc: 'PostgREST-style STIX 2.1 bundle query interface.',
        compVar: 'ThreatLandscapeStix',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/actionable-iocs',
        tabId: 'actionable-iocs',
        label: 'Actionable IOCs',
        desc: 'PostgREST-style IOC query interface per type.',
        compVar: 'ThreatLandscapeIocs',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/kev-catalog',
        tabId: 'kev-catalog',
        label: 'CISA KEV Catalog',
        desc: 'Search and filter the CISA Known Exploited Vulnerabilities catalog.',
        compVar: 'CisaKevCatalog',
        badge: 'new',
      },

      {
        path: '/threatintel/tools/investigations',
        tabId: 'investigations',
        label: 'Investigations',
        desc: 'Investigation case manager — open, closed, shared.',
        compVar: 'Investigations',
      },
      {
        path: '/threatintel/tools/watches',
        tabId: 'watches',
        label: 'Watches',
        desc: 'Watch lists — actor, indicator, keyword, and saved searches.',
        compVar: 'Watches',
      },
      {
        path: '/threatintel/tools/workspaces',
        tabId: 'workspaces',
        label: 'Investigation Workspaces',
        desc: 'AEAD lifecycle workspaces — Acquire, Enrich, Assess, Deliver.',
        compVar: 'Workspaces',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/tg-intel-search',
        tabId: 'tg-intel-search',
        label: 'TG Intel Search',
        desc: 'Boolean search across Telegram messages — AND/OR/NOT, field qualifiers, IOC extraction.',
        compVar: 'TgIntelSearch',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/socradar-tools',
        tabId: 'socradar-tools',
        label: 'Tactical Radar Tools',
        desc: 'DDoS intelligence, FortiGate breach check, healthcare breach tracking.',
        compVar: 'SocradarTools',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/unified-search',
        tabId: 'unified-search',
        label: 'Unified Search',
        desc: 'Cross-source search across the entire platform.',
        compVar: 'UnifiedSearch',
      },
      {
        path: '/threatintel/tools/settings',
        tabId: 'settings',
        label: 'Integrations & Settings',
        desc: 'What integrations are wired in and what capability each one unlocks for the platform.',
        compVar: 'Settings',
      },
      {
        path: '/threatintel/tools/directory',
        tabId: 'directory',
        label: 'Security Tools Directory',
        desc: 'Curated catalog of 53 security tools organized by category.',
        compVar: 'ToolsDirectory',
        badge: 'new',
      },
      {
        path: '/threatintel/tools/darknet-intel',
        tabId: 'darknet-intel',
        label: 'Darknet Intel',
        desc: '42 tools across 13 providers — IP reputation, malware analysis, vulnerability lookup, ransomware tracking, breach intelligence.',
        compVar: 'DarknetIntel',
        badge: 'new',
      },
    ],
  },
  {
    id: 'external',
    label: 'External Resources',
    blurb: 'External directories, supply-chain intel, and awesome lists.',
    icon: ExternalLink,
    tone: 'text-stone-700 dark:text-stone-300 border-stone-500/30 bg-stone-500/10',
    pages: [
      {
        path: '/threatintel/external/external',
        tabId: 'external',
        label: 'External Resources',
        desc: 'Off-site cross-references — dashboards, OSINT directories, training labs.',
        compVar: 'ExternalResources',
      },
      {
        path: '/threatintel/external/supply',
        tabId: 'supply',
        label: 'Supply Chain Intel',
        desc: 'Supply chain intelligence — SolarWinds, 3CX, MOVEit, XZ Utils.',
        compVar: 'SupplyChainIntelligence',
      },
      {
        path: '/threatintel/external/awesome',
        tabId: 'awesome',
        label: 'Awesome Lists',
        desc: 'Curated awesome-security list — vetted, ranked, kept current.',
        compVar: 'AwesomeLists',
      },
      {
        path: '/threatintel/external/cerast',
        tabId: 'cerast',
        label: 'Cerast Intelligence',
        desc: 'OSINT domain exposure search — exposed paths, staging, misconfigs.',
        compVar: 'Cerast',
      },
      {
        path: '/threatintel/external/threatmon',
        tabId: 'threatmon',
        label: 'ThreatMon Infostealer',
        desc: 'Infostealer log search — compromised credentials by domain.',
        compVar: 'ThreatMonInfostealer',
      },
    ],
  },
  {
    id: 'predictive',
    label: 'Predictive & Dashboards',
    blurb: 'Intel dashboard, predictions, metrics, and predictive analysis.',
    icon: LineChart,
    tone: 'text-purple-700 dark:text-purple-300 border-purple-500/30 bg-purple-500/10',
    pages: [
      {
        path: '/threatintel/predictive/dashboard',
        tabId: 'dashboard',
        label: 'Intel Dashboard',
        desc: 'Top-level intel dashboard — key stats, trending, top actors.',
        compVar: 'IntelDashboard',
      },
      {
        path: '/threatintel/predictive/global-pulse',
        tabId: 'global-pulse',
        label: 'Global Pulse',
        desc: 'Live 3D globe — 700+ events across 21 layers.',
        compVar: 'GlobalPulse',
        badge: 'live',
      },
      {
        path: '/threatintel/predictive/threat-pulse',
        tabId: 'threat-pulse',
        label: 'Threat Pulse',
        desc: 'Threat-pulse tracking — actor activity, campaign spikes, geo shifts.',
        compVar: 'ThreatPulse',
        badge: 'live',
      },
      {
        path: '/threatintel/predictive/certstream',
        tabId: 'certstream',
        label: 'CertStream',
        desc: 'Certificate transparency live feed.',
        compVar: 'CertStreamLive',
        badge: 'live',
      },
      {
        path: '/threatintel/predictive/pir',
        tabId: 'pir',
        label: 'PIR Dashboard',
        desc: 'Priority Intelligence Requirements dashboard.',
        compVar: 'PirDashboard',
      },
      {
        path: '/threatintel/predictive/metrics',
        tabId: 'metrics',
        label: 'Metrics',
        desc: 'Ten-panel metrics board.',
        compVar: 'Metrics',
      },
      {
        path: '/threatintel/predictive/analytics',
        tabId: 'analytics',
        label: 'Analytics & Ops',
        desc: 'Platform health, feed reliability, and intel metrics.',
        compVar: 'AnalyticsDashboard',
      },
      {
        path: '/threatintel/predictive/predictions',
        tabId: 'predictions',
        label: 'Predictions',
        desc: 'Forward-looking threat predictions with confidence.',
        compVar: 'Predictions',
      },
      {
        path: '/threatintel/predictive/predictive',
        tabId: 'predictive',
        label: 'Predictive Intel',
        desc: 'AI-driven threat forecasting from current trends.',
        compVar: 'PredictiveIntel',
      },
      {
        path: '/threatintel/predictive/analyze',
        tabId: 'analyze',
        label: 'Analyze',
        desc: 'Intelligence analysis workspace.',
        compVar: 'Analyze',
      },
      {
        path: '/threatintel/predictive/assessments',
        tabId: 'assessments',
        label: 'Assessments',
        desc: 'Security assessments and risk scoring.',
        compVar: 'Assessments',
      },
      {
        path: '/threatintel/predictive/observe',
        tabId: 'observe',
        label: 'Observe',
        desc: 'Observation dashboard — what is happening right now.',
        compVar: 'Observe',
        badge: 'live',
      },
      {
        path: '/threatintel/soc-dashboard?tab=ransomware',
        tabId: 'soc-dashboard',
        label: 'SOC Dashboard',
        desc: 'Unified tactical SOC view — ransomware, vulnerabilities, and IOC stream panels.',
        compVar: 'SocDashboard',
      },
      {
        path: '/threatintel/live-center',
        tabId: 'live-center',
        label: 'Live Center — Web OSINT',
        desc: 'Browser-based live OSINT tools with install, example, and reference URL per tool.',
        compVar: 'LiveCenter',
      },
      {
        path: '/threatintel/ti-dashboard',
        tabId: 'ti-dashboard',
        label: 'TI Dashboard',
        desc: 'Weekly threat intelligence report — IOCs, threat stories, actor profiles, vulnerabilities, hunting leads, and supply chain incidents.',
        compVar: 'TiDashboard',
      },
      {
        path: '/threatintel/cti-dashboard',
        tabId: 'cti-dashboard',
        label: 'CTI Dashboard',
        desc: 'Central CTI operations dashboard — KPI cards, feed health, alert volume, and recent intel.',
        compVar: 'CtiDashboard',
      },
      {
        path: '/threatintel/dashboard',
        tabId: 'dashboard-live',
        label: 'Threat Dashboard',
        desc: 'Live threat landscape — IOCs, ransomware victims, and breach disclosures with sortable table and severity filters.',
        compVar: 'ThreatIntelDashboard',
        badge: 'new',
      },
    ],
  },
  {
    id: 'monitoring-estate',
    label: 'Monitoring & Estate',
    blurb: 'Noise-filtered alert feed, ransomware monitoring, and estate configuration.',
    icon: Bell,
    tone: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
    pages: [
      {
        path: '/threatintel/alerts',
        tabId: 'alerts',
        label: 'Alert Feed',
        desc: 'Prioritised threat intelligence alerts — noise-filtered, confidence-scored, and matched to your estate.',
        compVar: 'AlertFeed',
      },
      {
        path: '/threatintel/ransomware-live',
        tabId: 'ransomware-live',
        label: 'Ransomware Live',
        desc: 'Live ransomware victim and group monitoring with sector/region filtering.',
        compVar: 'RansomwareLive',
        badge: 'live',
      },
      {
        path: '/threatintel/estate',
        tabId: 'estate',
        label: 'Estate Config',
        desc: 'Manage your digital estate — assets, tech stack, sector, and data types for personalised correlation.',
        compVar: 'EstateConfig',
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Lookup helpers                                                     */
/* ------------------------------------------------------------------ */

const HUB_BY_ID = new Map(HUB_META.map((h) => [h.id, h]));
const PAGE_BY_PATH = new Map<string, { hub: HubMeta; page: HubPage }>();
// slug → hub id. The slug for a page is the LAST segment of its path
// (e.g. `/threatintel/iocs/cross` → `cross`). The hub itself is the slug
// for flat 2-segment pages (e.g. `/threatintel/detections`). Both
// contribute entries here. When the same slug appears in two hubs
// (e.g. `cross` is a tab under both `iocs` and `campaigns`) the first
// write wins; the resolver still returns the correct hub for 3-segment
// paths because it uses the hub part, not the slug. A drift test in
// `src/data/threatintel-hubs.test.ts` asserts that the resulting map
// is well-formed (every entry points to a real hub).
const SLUG_TO_HUB = new Map<string, string>();
// Set of all valid 2-segment paths (flat tool pages) — used by the
// back-link resolver to disambiguate `/threatintel/<hub-id>` (the hub
// landing page) from `/threatintel/<flat-tool-slug>` (a tool that just
// happens to share its name with a tab elsewhere).
const FLAT_TOOL_PATHS = new Set<string>();
for (const hub of HUB_META) {
  // 2-segment page: /threatintel/<hub>  → the slug is the hub id itself.
  SLUG_TO_HUB.set(hub.id, hub.id);
  for (const page of hub.pages) {
    const rel = page.path.replace(/^\/threatintel\//, '');
    const parts = rel.split('/');
    const slug = parts[parts.length - 1];
    if (slug && !SLUG_TO_HUB.has(slug)) SLUG_TO_HUB.set(slug, hub.id);
    if (parts.length === 1) FLAT_TOOL_PATHS.add(page.path);
    PAGE_BY_PATH.set(page.path, { hub, page });
  }
}

/** Look up the hub id for a tool slug (the last path segment after
 *  /threatintel/). Returns `undefined` when the slug is not registered. */
export function hubIdForSlug(slug: string): string | undefined {
  return SLUG_TO_HUB.get(slug);
}

/** True when `path` is a registered flat 2-segment tool page
 *  (e.g. `/threatintel/briefings` lives directly under the campaigns
 *  hub and is a real tool, not a hub landing). */
export function isFlatToolPath(path: string): boolean {
  return FLAT_TOOL_PATHS.has(path);
}

export function getHub(id: string): HubMeta | undefined {
  return HUB_BY_ID.get(id);
}

export function getPageByPath(path: string): { hub: HubMeta; page: HubPage } | undefined {
  return PAGE_BY_PATH.get(path);
}

export function getAllPages(): Array<{ hub: HubMeta; page: HubPage }> {
  return Array.from(PAGE_BY_PATH.values());
}

export function flattenPages(): Array<HubPage & { hub: HubMeta }> {
  const out: Array<HubPage & { hub: HubMeta }> = [];
  for (const hub of HUB_META) {
    for (const page of hub.pages) {
      out.push({ ...page, hub });
    }
  }
  return out;
}

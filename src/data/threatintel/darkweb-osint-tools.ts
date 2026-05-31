export type DarkWebCategory =
  | 'search-engines'
  | 'onion-links'
  | 'scanners'
  | 'crawlers'
  | 'intel-platforms'
  | 'forums-markets'
  | 'leak-databases'
  | 'misc';

export interface DarkWebTool {
  id: string;
  name: string;
  url: string;
  category: DarkWebCategory;
  description: string;
  source_url?: string;
  badge?: string;
}

export const CATEGORY_LABELS: Record<DarkWebCategory, string> = {
  'search-engines': 'Search Engines',
  'onion-links': 'Onion Link Discovery',
  scanners: 'Scanners & Analysis',
  crawlers: 'Crawlers & Indexing',
  'intel-platforms': 'Intel Platforms',
  'forums-markets': 'Forums & Markets',
  'leak-databases': 'Leak Databases',
  misc: 'Miscellaneous',
};

export const CATEGORY_BLURB: Record<DarkWebCategory, string> = {
  'search-engines': 'Search engines that index .onion sites and dark web content.',
  'onion-links': 'Directories and link-lists for discovering new onion services.',
  scanners: 'Security scanners that probe onion sites for misconfigurations and leaks.',
  crawlers: 'Automated crawlers for indexing, scraping and archiving dark web content.',
  'intel-platforms': 'Threat intelligence platforms with dark-web collection pipes.',
  'forums-markets': 'Monitors for underground forums, markets and criminal communities.',
  'leak-databases': 'Searchable breach and leak databases covering dark-web-sourced data.',
  misc: 'Utility tools and frameworks that do not fit the categories above.',
};

export const CATEGORY_PILL: Record<DarkWebCategory, string> = {
  'search-engines': 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  'onion-links': 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  scanners: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  crawlers: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'intel-platforms': 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  'forums-markets': 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  'leak-databases': 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  misc: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
};

export const TOOLS: DarkWebTool[] = [
  // ── Search Engines ────────────────────────────────────────────────────
  {
    id: 'ahmia',
    name: 'Ahmia',
    url: 'https://ahmia.fi',
    category: 'search-engines',
    description:
      'Leading dark-web search engine that indexes .onion sites. Public API available for programmatic queries. Also publishes a list of verified onion links.',
    source_url: 'https://github.com/ahmia/ahmia-site',
    badge: 'essential',
  },
  {
    id: 'onion-search',
    name: 'OnionSearch',
    url: 'https://github.com/megadose/OnionSearch',
    category: 'search-engines',
    description:
      'Scrapes onion links from 9+ search engines (Ahmia, DarkSearch, Tor66, etc) in one CLI. Supports Tor proxy.',
    source_url: 'https://github.com/megadose/OnionSearch',
  },
  {
    id: 'katana',
    name: 'Katana',
    url: 'https://github.com/adnane-X-tebbaa/Katana',
    category: 'search-engines',
    description: 'Dark-web crawler and search engine with a web UI. Indexes .onion pages and makes them searchable.',
    source_url: 'https://github.com/adnane-X-tebbaa/Katana',
  },
  {
    id: 'darkdump',
    name: 'Darkdump',
    url: 'https://github.com/josh0xA/darkdump',
    category: 'search-engines',
    description: 'CLI tool that searches the deep web with a single command. Queries Ahmia and other engines via Tor.',
    source_url: 'https://github.com/josh0xA/darkdump',
  },
  {
    id: 'darkus',
    name: 'Darkus',
    url: 'https://github.com/Lucksi/Darkus',
    category: 'search-engines',
    description: 'Dark-web monitoring tool with search + screenshot capabilities. Tracks onion site changes over time.',
    source_url: 'https://github.com/Lucksi/Darkus',
  },
  {
    id: 'iaca-darkweb',
    name: 'IACA Dark Web Tools',
    url: 'https://iaca-darkweb-tools.com/',
    category: 'search-engines',
    description:
      'Curated directory of dark-web investigation resources maintained by the International Anti-Crime Academy.',
  },
  {
    id: 'onion-engine',
    name: 'Onion Search Engine',
    url: 'https://onionengine.com/',
    category: 'search-engines',
    description: 'Clearnet-accessible search engine for .onion sites. No Tor required on the client side.',
  },

  // ── Onion Link Discovery ──────────────────────────────────────────────
  {
    id: 'tor66',
    name: 'Tor66',
    url: 'http://tor66sewebgixwhcqfnp5inzp5x5uohhdy3kvtnyfxc2e5mxiuh34iid.onion/fresh',
    category: 'onion-links',
    description: 'Fresh onion link directory updated daily. One of the longest-running onion link lists.',
  },
  {
    id: 'tornode',
    name: 'TorNode',
    url: 'http://tornode3tnrtzgqwd3vmxdumucddqfd6zk7icu4wzdwxo5c3zn2xqfqd.onion',
    category: 'onion-links',
    description: 'Onion service directory with category browsing and uptime statistics.',
  },
  {
    id: 'darkweblink',
    name: 'Darkweblink',
    url: 'https://darkweblink.com',
    category: 'onion-links',
    description: 'Clearnet directory of working .onion links organized by category. Accessible without Tor.',
    badge: 'essential',
  },

  // ── Scanners & Analysis ───────────────────────────────────────────────
  {
    id: 'onionscan',
    name: 'OnionScan',
    url: 'https://github.com/s-rah/onionscan',
    category: 'scanners',
    description:
      'The reference scanner for .onion site security. Checks for misconfigurations, data leaks, and identifiable information.',
    source_url: 'https://github.com/s-rah/onionscan',
    badge: 'essential',
  },
  {
    id: 'onioff',
    name: 'Onioff',
    url: 'https://github.com/k4m4/onioff',
    category: 'scanners',
    description: 'Checks whether an onion site is online. Simple CLI that reports reachability and response time.',
    source_url: 'https://github.com/k4m4/onioff',
  },
  {
    id: 'onion-nmap',
    name: 'Docker Onion Nmap',
    url: 'https://github.com/milesrichardson/docker-onion-nmap',
    category: 'scanners',
    description: 'Runs Nmap scans against onion services through the Tor network in a Docker container.',
    source_url: 'https://github.com/milesrichardson/docker-onion-nmap',
  },

  // ── Crawlers & Indexing ───────────────────────────────────────────────
  {
    id: 'torbot',
    name: 'TorBot',
    url: 'https://github.com/DedSecInside/TorBot',
    category: 'crawlers',
    description: 'Dark-web crawler with data extraction, page parsing, and custom module support. Python-based.',
    source_url: 'https://github.com/DedSecInside/TorBot',
  },
  {
    id: 'torcrawl',
    name: 'TorCrawl.py',
    url: 'https://github.com/MikeMeliz/TorCrawl.py',
    category: 'crawlers',
    description: 'Lightweight Python crawler that spider .onion domains via Tor proxy. Saves HTML/JSON output.',
    source_url: 'https://github.com/MikeMeliz/TorCrawl.py',
  },
  {
    id: 'vigilantonion',
    name: 'VigilantOnion',
    url: 'https://github.com/andreyglauzer/VigilantOnion',
    category: 'crawlers',
    description: 'Continuous dark-web monitoring framework. Crawled content is indexed and alertable.',
    source_url: 'https://github.com/andreyglauzer/VigilantOnion',
  },
  {
    id: 'onioningestor',
    name: 'OnionIngestor',
    url: 'https://github.com/danieleperera/OnionIngestor',
    category: 'crawlers',
    description: 'Modular onion site ingestor — crawl, parse, and export structured data from dark-web pages.',
    source_url: 'https://github.com/danieleperera/OnionIngestor',
  },
  {
    id: 'prying-deep',
    name: 'Prying Deep',
    url: 'https://github.com/iudicium/pryingdeep',
    category: 'crawlers',
    description:
      'Dark-web OSINT framework written in Go. Crawls .onion pages, extracts metadata, and generates reports.',
    source_url: 'https://github.com/iudicium/pryingdeep',
  },
  {
    id: 'darc',
    name: 'Darc',
    url: 'https://github.com/JarryShaw/darc',
    category: 'crawlers',
    description:
      'Dark-web crawler with asynchronous architecture. Supports concurrent page scraping and content parsing.',
    source_url: 'https://github.com/JarryShaw/darc',
  },
  {
    id: 'midnight-sea',
    name: 'Midnight Sea',
    url: 'https://github.com/RicYaben/midnight_sea',
    category: 'crawlers',
    description: 'Privacy-first dark-web scraper with proxy rotation and stealth techniques.',
    source_url: 'https://github.com/RicYaben/midnight_sea',
  },

  // ── Intel Platforms ───────────────────────────────────────────────────
  {
    id: 'deepdarkcti',
    name: 'DeepDarkCTI',
    url: 'https://github.com/fastfire/deepdarkCTI',
    category: 'intel-platforms',
    description:
      'Curated collection of dark-web threat intelligence sources, tools, and reports. Excellent starting point.',
    source_url: 'https://github.com/fastfire/deepdarkCTI',
    badge: 'essential',
  },
  {
    id: 'robin',
    name: 'Robin',
    url: 'https://github.com/apurvsinghgautam/robin',
    category: 'intel-platforms',
    description:
      'AI-powered dark-web OSINT investigation tool. LLM-driven query refinement, multi-engine search, scrape, summarise.',
    source_url: 'https://github.com/apurvsinghgautam/robin',
    badge: 'essential',
  },
  {
    id: 'recon',
    name: 'Recon',
    url: 'https://github.com/UltimateHackers/Recon',
    category: 'intel-platforms',
    description: 'Dark-web reconnaissance framework with modular plugins for data collection and analysis.',
    source_url: 'https://github.com/UltimateHackers/Recon',
  },
  {
    id: 'socradar',
    name: 'SOCRadar Dark Web',
    url: 'https://www.socradar.com/dark-web-monitoring/',
    category: 'intel-platforms',
    description:
      'Commercial dark-web monitoring — leaked credentials, brand impersonation, forum mentions, ransomware leak sites.',
  },
  {
    id: 'flare',
    name: 'Flare Systems',
    url: 'https://flare.systems',
    category: 'intel-platforms',
    description:
      'Dark-web + clear-web threat monitoring. Covers Telegram, Discord, ransomware leak sites, paste sites.',
  },

  // ── Forums & Markets ──────────────────────────────────────────────────
  {
    id: 'breach-forums-monitor',
    name: 'BreachForums Monitor',
    url: 'https://breachforums.st',
    category: 'forums-markets',
    description: 'Tracking thread listings and user activity across breach-forum marketplaces.',
  },
  {
    id: 'ransomwatch',
    name: 'Ransomwatch',
    url: 'https://ransomwatch.telemetry.ltd',
    category: 'forums-markets',
    description: 'Monitors and archives ransomware leak-site postings. Indexes victim disclosures from 50+ groups.',
    badge: 'essential',
  },
  {
    id: 'darkfeed',
    name: 'DarkFeed',
    url: 'https://darkfeed.io',
    category: 'forums-markets',
    description: 'IOC feed sourced from dark-web forums, ransomware leak sites, and Telegram channels.',
  },

  // ── Leak Databases ────────────────────────────────────────────────────
  {
    id: 'intelx-darkweb',
    name: 'IntelligenceX (Dark Web)',
    url: 'https://intelx.io',
    category: 'leak-databases',
    description:
      'Search across dark-web pages, paste sites, and leaked databases. Free tier with preview-only results.',
    badge: 'essential',
  },
  {
    id: 'dehashed',
    name: 'DeHashed',
    url: 'https://dehashed.com',
    category: 'leak-databases',
    description: 'Credential search engine aggregating data from breach dumps and dark-web sources.',
  },
  {
    id: 'leak-check',
    name: 'LeakCheck',
    url: 'https://leakcheck.io',
    category: 'leak-databases',
    description: 'Search leaked credentials and personal data from dark-web breach compilations.',
  },
  {
    id: 'snusbase',
    name: 'Snusbase',
    url: 'https://snusbase.com',
    category: 'leak-databases',
    description: 'Database search engine covering thousands of breach compilations sourced from dark-web channels.',
  },

  // ── Miscellaneous ─────────────────────────────────────────────────────
  {
    id: 'tor-gateway',
    name: 'Tor Gateway',
    url: 'https://www.torproject.org',
    category: 'misc',
    description:
      'The Tor network itself is the foundational layer. Tools in this directory require Tor for routing to .onion services.',
    badge: 'essential',
  },
  {
    id: 'torsocks',
    name: 'torsocks',
    url: 'https://gitlab.torproject.org/tpo/core/torsocks',
    category: 'misc',
    description: 'Wraps any CLI tool so its traffic routes through Tor. Use with curl, nmap, git — any TCP-based tool.',
    source_url: 'https://gitlab.torproject.org/tpo/core/torsocks',
  },
  {
    id: 'nyx',
    name: 'Nyx',
    url: 'https://github.com/torproject/nyx',
    category: 'misc',
    description: 'Terminal-based Tor status monitor. Shows bandwidth, circuit paths, relay info in real time.',
    source_url: 'https://github.com/torproject/nyx',
  },
  {
    id: 'torbrowser',
    name: 'Tor Browser',
    url: 'https://www.torproject.org/download/',
    category: 'misc',
    description:
      'Modified Firefox hardened for .onion browsing. The standard gateway for manual dark-web investigation.',
    badge: 'essential',
  },
];

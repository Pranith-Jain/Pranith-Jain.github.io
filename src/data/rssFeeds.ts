export interface RSSFeed {
  id: string;
  name: string;
  url: string;
  description: string;
  category: 'vulnerability' | 'advisory' | 'threat-intel' | 'news' | 'general' | 'ics-cert';
  icon?: string;
  source?: string;
  language?: string;
}

export const rssFeeds: RSSFeed[] = [
  // ============================================================================
  // GOVERNMENT & SECURITY ADVISORIES
  // ============================================================================
  {
    id: 'cisa-alerts',
    name: 'CISA Alerts',
    url: 'https://www.cisa.gov/uscert/ncas/alerts.xml',
    description: 'US-CERT Current Activity - Latest cybersecurity alerts and advisories',
    category: 'advisory',
    source: 'CISA',
    language: 'en-US',
  },
  {
    id: 'cisa-current',
    name: 'CISA Current Activity',
    url: 'https://www.cisa.gov/uscert/current-activity.xml',
    description: 'Current cybersecurity activity, known malware, and exploits',
    category: 'advisory',
    source: 'CISA',
    language: 'en-US',
  },
  {
    id: 'cisa-medical-advisories',
    name: 'CISA Medical Advisories',
    url: 'https://www.cisa.gov/uscert/ncas/current-activity.xml',
    description: 'Healthcare and medical device cybersecurity advisories',
    category: 'advisory',
    source: 'CISA',
    language: 'en-US',
  },
  {
    id: 'nist-nvd',
    name: 'NIST NVD',
    url: 'https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml',
    description: 'National Vulnerability Database - CVE vulnerabilities and CVSS scores',
    category: 'vulnerability',
    source: 'NIST',
    language: 'en-US',
  },
  {
    id: 'nist-nvd-api',
    name: 'NIST NVD Recent CVEs',
    url: 'https://nvd.nist.gov/feeds/json/cve/1.1/nvd-cve-1.1-recent.rss',
    description: 'Recently published CVE entries from NIST NVD',
    category: 'vulnerability',
    source: 'NIST',
    language: 'en-US',
  },
  {
    id: 'ics-cert',
    name: 'ICS-CERT Advisories',
    url: 'https://www.cisa.gov/ics/advisories.xml',
    description: 'Industrial Control Systems Cyber Emergency Response Team advisories',
    category: 'ics-cert',
    source: 'CISA',
    language: 'en-US',
  },
  {
    id: 'ics-cert-alerts',
    name: 'ICS-CERT Alerts',
    url: 'https://www.cisa.gov/ics/alerts.xml',
    description: 'Time-sensitive alerts for industrial control systems',
    category: 'ics-cert',
    source: 'CISA',
    language: 'en-US',
  },
  {
    id: 'federal-cisa-advisories',
    name: 'Federal CISA Known Exploited Vulnerabilities',
    url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.xml',
    description: 'Catalog of vulnerabilities known to be exploited in the wild',
    category: 'advisory',
    source: 'CISA',
    language: 'en-US',
  },

  // ============================================================================
  // THREAT INTELLIGENCE
  // ============================================================================
  {
    id: 'dfir-lab',
    name: 'DFIR Lab',
    url: 'https://dfir-lab.ch/feed.xml',
    description: 'Digital forensics and incident response research, threat analysis, and case studies',
    category: 'threat-intel',
    source: 'DFIR Lab',
    language: 'en-US',
  },
  {
    id: 'dfir-radar',
    name: 'DFIR Radar',
    url: 'https://falhumaid.github.io/DFIR_Radar_RSS/rss.xml',
    description: 'Security advisories and threat intelligence from the DFIR Radar project',
    category: 'threat-intel',
    source: 'DFIR Radar',
    language: 'en-US',
  },
  {
    id: 'sans-isc',
    name: 'SANS Internet Storm Center',
    url: 'https://isc.sans.edu/rssfeed.xml',
    description: 'Daily handler diaries and security threat intelligence',
    category: 'threat-intel',
    source: 'SANS',
    language: 'en-US',
  },
  {
    id: 'sans-isc-threats',
    name: 'SANS ISC Top Threats',
    url: 'https://isc.sans.edu/rss/topthreats.xml',
    description: 'Current top threats tracked by SANS Internet Storm Center',
    category: 'threat-intel',
    source: 'SANS',
    language: 'en-US',
  },
  {
    id: 'packetstorm',
    name: 'PacketStorm',
    url: 'https://rss.packetstormsecurity.com/',
    description: 'Latest exploits, vulnerabilities, and security tools',
    category: 'threat-intel',
    source: 'PacketStorm',
    language: 'en-US',
  },
  {
    id: 'packetstorm-files',
    name: 'PacketStorm Files',
    url: 'https://rss.packetstormsecurity.com/files/',
    description: 'Newly published files, exploits, and tools',
    category: 'threat-intel',
    source: 'PacketStorm',
    language: 'en-US',
  },
  {
    id: 'alienvault-otx',
    name: 'AlienVault OTX',
    url: 'https://otx.alienvault.com/api/v1/pulses/subscribe/user/1037989/rss',
    description: 'Open Threat Exchange pulses and threat research',
    category: 'threat-intel',
    source: 'AlienVault',
    language: 'en-US',
  },
  {
    id: 'threatfox',
    name: 'Abuse.ch ThreatFox',
    url: 'https://threatfox.abuse.ch/rss/',
    description: 'Malware indicators and threat intelligence from Abuse.ch',
    category: 'threat-intel',
    source: 'Abuse.ch',
    language: 'en-US',
  },
  {
    id: 'malwarebazaar',
    name: 'Abuse.ch MalwareBazaar',
    url: 'https://mb-api.abuse.ch/rss/',
    description: 'Malware samples database and analysis',
    category: 'threat-intel',
    source: 'Abuse.ch',
    language: 'en-US',
  },
  {
    id: 'urlhaus',
    name: 'Abuse.ch URLhaus',
    url: 'https://urlhaus.abuse.ch/rss/',
    description: 'Malware distribution URLs database',
    category: 'threat-intel',
    source: 'Abuse.ch',
    language: 'en-US',
  },

  // ============================================================================
  // SECURITY NEWS
  // ============================================================================
  {
    id: 'threatpost',
    name: 'Threatpost',
    url: 'https://threatpost.com/feed/',
    description: 'Independent cybersecurity news and analysis',
    category: 'news',
    source: 'Threatpost',
    language: 'en-US',
  },
  {
    id: 'darkreading',
    name: 'Dark Reading',
    url: 'https://www.darkreading.com/rss/all.xml',
    description: 'Security strategies and technology insights',
    category: 'news',
    source: 'Dark Reading',
    language: 'en-US',
  },
  {
    id: 'krebsonsecurity',
    name: 'Krebs on Security',
    url: 'https://krebsonsecurity.com/feed/',
    description: 'In-depth security journalism by Brian Krebs',
    category: 'news',
    source: 'Krebs on Security',
    language: 'en-US',
  },
  {
    id: 'hackernews',
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    description: 'Latest cybersecurity news, exploits, and vulnerabilities',
    category: 'news',
    source: 'The Hacker News',
    language: 'en-US',
  },
  {
    id: 'bleepingcomputer',
    name: 'BleepingComputer',
    url: 'https://www.bleepingcomputer.com/feed/',
    description: 'Computer security news, tutorials, and how-to guides',
    category: 'news',
    source: 'BleepingComputer',
    language: 'en-US',
  },
  {
    id: 'securityweek',
    name: 'SecurityWeek',
    url: 'https://www.securityweek.com/feed/',
    description: 'Cybersecurity news, analysis, and enterprise security insights',
    category: 'news',
    source: 'SecurityWeek',
    language: 'en-US',
  },
  {
    id: 'schneier',
    name: 'Schneier on Security',
    url: 'https://www.schneier.com/blog/atom.xml',
    description: "Bruce Schneier's security blog and essays",
    category: 'general',
    source: 'Schneier',
    language: 'en-US',
  },
  {
    id: 'zdnet-security',
    name: 'ZDNet Security',
    url: 'https://www.zdnet.com/home/security/feed/',
    description: 'Cybersecurity news and analysis from ZDNet',
    category: 'news',
    source: 'ZDNet',
    language: 'en-US',
  },
  {
    id: 'arstechnica-security',
    name: 'Ars Technica - Security',
    url: 'https://feeds.arstechnica.com/arstechnica/security/',
    description: 'In-depth security coverage and analysis',
    category: 'news',
    source: 'Ars Technica',
    language: 'en-US',
  },
  {
    id: 'vice-security',
    name: 'Vice Security',
    url: 'https://www.vice.com/en/topic/cybersecurity/rss',
    description: 'Cybersecurity and privacy investigative journalism',
    category: 'news',
    source: 'Vice',
    language: 'en-US',
  },
  {
    id: 'wired-security',
    name: 'Wired Security',
    url: 'https://www.wired.com/feed/category/security/latest/rss',
    description: 'Security news and features from Wired',
    category: 'news',
    source: 'Wired',
    language: 'en-US',
  },
  {
    id: 'theregister-security',
    name: 'The Register - Security',
    url: 'https://www.theregister.com/security/headlines.atom',
    description: 'Biting the hand that feeds IT - Security news',
    category: 'news',
    source: 'The Register',
    language: 'en-GB',
  },
  {
    id: 'helpnetsecurity',
    name: 'Help Net Security',
    url: 'https://www.helpnetsecurity.com/feed/',
    description: 'Computer security news and cybersecurity insights',
    category: 'news',
    source: 'Help Net Security',
    language: 'en-US',
  },
  {
    id: 'securitymagazine',
    name: 'Security Magazine',
    url: 'https://www.securitymagazine.com/rss',
    description: 'Enterprise security news and analysis',
    category: 'news',
    source: 'Security Magazine',
    language: 'en-US',
  },
  {
    id: 'csoconline',
    name: 'CSO Online',
    url: 'https://www.csoonline.com/feed/',
    description: 'Security and risk management leadership news',
    category: 'news',
    source: 'CSO Online',
    language: 'en-US',
  },

  // ============================================================================
  // VULNERABILITY & RESEARCH
  // ============================================================================
  {
    id: 'cvedetails',
    name: 'CVE Details',
    url: 'https://www.cvedetails.com/rss.xml',
    description: 'CVE vulnerability details and statistics',
    category: 'vulnerability',
    source: 'CVE Details',
    language: 'en-US',
  },
  {
    id: 'exploitdb',
    name: 'Exploit-DB',
    url: 'https://www.exploit-db.com/rss.xml',
    description: 'The Exploit Database - latest exploits and vulnerabilities',
    category: 'vulnerability',
    source: 'Offensive Security',
    language: 'en-US',
  },
  {
    id: 'nuclei-templates',
    name: 'Nuclei Templates',
    url: 'https://raw.githubusercontent.com/projectdiscovery/nuclei-templates/master/README.md',
    description: 'Community-contributed nuclei templates for vulnerability scanning',
    category: 'vulnerability',
    source: 'ProjectDiscovery',
    language: 'en-US',
  },

  // ============================================================================
  // MALWARE ANALYSIS & SANDBOX
  // ============================================================================
  {
    id: 'hybrid-analysis',
    name: 'Hybrid Analysis',
    url: 'https://feed.hybrid-analysis.com/rss/latest',
    description: 'Public malware analysis reports from Hybrid Analysis sandbox',
    category: 'threat-intel',
    source: 'Hybrid Analysis',
    language: 'en-US',
  },
  {
    id: 'anyrun',
    name: 'ANY.RUN',
    url: 'https://any.run/cybersecurity-blog/rss/',
    description: 'Interactive malware analysis sandbox - latest reports',
    category: 'threat-intel',
    source: 'ANY.RUN',
    language: 'en-US',
  },

  // ============================================================================
  // GENERAL SECURITY
  // ============================================================================
  {
    id: 'reddit-netsec',
    name: 'Reddit r/netsec',
    url: 'https://www.reddit.com/r/netsec/.rss',
    description: 'Network security community discussions',
    category: 'general',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'twitter-security',
    name: 'Twitter Security Feed',
    url: 'https://twitrss.me/twitter_user_to_rss/?user=CISAgov',
    description: 'CISA Twitter updates in RSS format',
    category: 'general',
    source: 'Twitter',
    language: 'en-US',
  },
];

// Default feeds to display (curated selection of high-value sources)
export const defaultFeeds = [
  'cisa-current',
  'cisa-alerts',
  'nist-nvd',
  'sans-isc',
  'threatpost',
  'krebsonsecurity',
  'hackernews',
  'bleepingcomputer',
  'threatfox',
  'malwarebazaar',
  'securityweek',
  'darkreading',
];

// Feed categories for filtering
export const feedCategories = [
  { id: 'all', label: 'All Feeds' },
  { id: 'vulnerability', label: 'Vulnerabilities' },
  { id: 'advisory', label: 'Advisories' },
  { id: 'ics-cert', label: 'ICS-CERT' },
  { id: 'threat-intel', label: 'Threat Intel' },
  { id: 'news', label: 'News' },
  { id: 'general', label: 'General' },
];

// Get feed statistics
export function getFeedStats() {
  return {
    total: rssFeeds.length,
    byCategory: feedCategories.slice(1).map((cat) => ({
      ...cat,
      count: rssFeeds.filter((f) => f.category === cat.id).length,
    })),
  };
}

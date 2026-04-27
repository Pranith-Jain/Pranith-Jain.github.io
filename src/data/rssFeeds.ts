export interface RSSFeed {
  id: string;
  name: string;
  url: string;
  description: string;
  category: 'vulnerability' | 'advisory' | 'threat-intel' | 'news' | 'general' | 'ics-cert';
  icon?: string;
  source?: string;
}

export const rssFeeds: RSSFeed[] = [
  // Government & Security Advisories
  {
    id: 'cisa-alerts',
    name: 'CISA Alerts',
    url: 'https://www.cisa.gov/uscert/ncas/alerts.xml',
    description: 'US-CERT Current Activity - Latest cybersecurity alerts and advisories',
    category: 'advisory',
    source: 'CISA',
  },
  {
    id: 'cisa-current',
    name: 'CISA Current Activity',
    url: 'https://www.cisa.gov/uscert/current-activity.xml',
    description: 'Current cybersecurity activity, known malware, and exploits',
    category: 'advisory',
    source: 'CISA',
  },
  {
    id: 'nist-nvd',
    name: 'NIST NVD',
    url: 'https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml',
    description: 'National Vulnerability Database - CVE vulnerabilities and CVSS scores',
    category: 'vulnerability',
    source: 'NIST',
  },
  {
    id: 'ics-cert',
    name: 'ICS-CERT Alerts',
    url: 'https://www.cisa.gov/ics/advisories.xml',
    description: 'Industrial Control Systems Cyber Emergency Response Team advisories',
    category: 'ics-cert',
    source: 'CISA',
  },

  // Threat Intelligence
  {
    id: 'mitre-attack',
    name: 'MITRE ATT&CK',
    url: 'https://attack.mitre.org/docs/v13/attack-search/',
    description: 'MITRE ATT&CK framework updates and technique mappings',
    category: 'threat-intel',
    source: 'MITRE',
  },
  {
    id: 'sans-isc',
    name: 'SANS Internet Storm Center',
    url: 'https://isc.sans.edu/rssfeed.xml',
    description: 'Daily handler diaries and security threat intelligence',
    category: 'threat-intel',
    source: 'SANS',
  },
  {
    id: 'packetstorm',
    name: 'PacketStorm',
    url: 'https://rss.packetstormsecurity.com/',
    description: 'Latest exploits, vulnerabilities, and security tools',
    category: 'threat-intel',
    source: 'PacketStorm',
  },

  // Security News
  {
    id: 'threatpost',
    name: 'Threatpost',
    url: 'https://threatpost.com/feed/',
    description: 'Independent cybersecurity news and analysis',
    category: 'news',
    source: 'Threatpost',
  },
  {
    id: 'darkreading',
    name: 'Dark Reading',
    url: 'https://www.darkreading.com/rss/all.xml',
    description: 'Security strategies and technology insights',
    category: 'news',
    source: 'Dark Reading',
  },
  {
    id: 'krebsonsecurity',
    name: 'Krebs on Security',
    url: 'https://krebsonsecurity.com/feed/',
    description: 'In-depth security journalism by Brian Krebs',
    category: 'news',
    source: 'Krebs on Security',
  },
  {
    id: 'hackernews',
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    description: 'Latest cybersecurity news, exploits, and vulnerabilities',
    category: 'news',
    source: 'The Hacker News',
  },
  {
    id: 'bleepingcomputer',
    name: 'BleepingComputer',
    url: 'https://www.bleepingcomputer.com/feed/',
    description: 'Computer security news, tutorials, and how-to guides',
    category: 'news',
    source: 'BleepingComputer',
  },
  {
    id: 'securityweek',
    name: 'SecurityWeek',
    url: 'https://www.securityweek.com/feed/',
    description: 'Cybersecurity news, analysis, and enterprise security insights',
    category: 'news',
    source: 'SecurityWeek',
  },
  {
    id: 'schneier',
    name: 'Schneier on Security',
    url: 'https://www.schneier.com/blog/atom.xml',
    description: "Bruce Schneier's security blog and essays",
    category: 'general',
    source: 'Schneier',
  },
  {
    id: 'us-cert-alerts',
    name: 'US-CERT Alerts',
    url: 'https://www.cisa.gov/uscert/ncas/alerts.xml',
    description: 'Current cybersecurity activity alerts',
    category: 'advisory',
    source: 'CISA',
  },

  // Additional Security Feeds
  {
    id: 'zdnet-security',
    name: 'ZDNet Security',
    url: 'https://www.zdnet.com/home/security/feed/',
    description: 'Cybersecurity news and analysis from ZDNet',
    category: 'news',
    source: 'ZDNet',
  },
  {
    id: 'arstechnica-security',
    name: 'Ars Technica - Security',
    url: 'https://feeds.arstechnica.com/arstechnica/security/',
    description: 'In-depth security coverage and analysis',
    category: 'news',
    source: 'Ars Technica',
  },
  {
    id: 'vice-security',
    name: 'Vice Security',
    url: 'https://www.vice.com/en/topic/cybersecurity/rss',
    description: 'Cybersecurity and privacy investigative journalism',
    category: 'news',
    source: 'Vice',
  },
];

// Default feeds to display
export const defaultFeeds = ['cisa-alerts', 'sans-isc', 'krebsonsecurity', 'threatpost'];

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

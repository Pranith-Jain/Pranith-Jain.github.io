export interface RSSFeed {
  id: string;
  name: string;
  url: string;
  description: string;
  category: 'vulnerability' | 'advisory' | 'threat-intel' | 'news' | 'general';
  icon?: string;
}

export const rssFeeds: RSSFeed[] = [
  {
    id: 'cisa-alerts',
    name: 'CISA Alerts',
    url: 'https://www.cisa.gov/uscert/ncas/alerts.xml',
    description: 'US-CERT Current Activity - Latest cybersecurity alerts and advisories',
    category: 'advisory',
  },
  {
    id: 'nist-nvd',
    name: 'NIST NVD',
    url: 'https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml',
    description: 'National Vulnerability Database - CVE vulnerabilities and CVSS scores',
    category: 'vulnerability',
  },
  {
    id: 'mitre-attack',
    name: 'MITRE ATT&CK',
    url: 'https://attack.mitre.org/docs/v13/attack-search/',
    description: 'MITRE ATT&CK framework updates and technique mappings',
    category: 'threat-intel',
  },
  {
    id: 'threatpost',
    name: 'Threatpost',
    url: 'https://threatpost.com/feed/',
    description: 'Independent cybersecurity news and analysis',
    category: 'news',
  },
  {
    id: 'darkreading',
    name: 'Dark Reading',
    url: 'https://www.darkreading.com/rss/all.xml',
    description: 'Security strategies and technology insights',
    category: 'news',
  },
  {
    id: 'schneier',
    name: 'Schneier on Security',
    url: 'https://www.schneier.com/blog/atom.xml',
    description: 'Bruce Schneier\'s security blog and essays',
    category: 'general',
  },
  {
    id: 'krebsonsecurity',
    name: 'Krebs on Security',
    url: 'https://krebsonsecurity.com/feed/',
    description: 'In-depth security journalism by Brian Krebs',
    category: 'news',
  },
  {
    id: 'us-cert-alerts',
    name: 'US-CERT Alerts',
    url: 'https://www.cisa.gov/uscert/ncas/alerts.xml',
    description: 'Current cybersecurity activity alerts',
    category: 'advisory',
  },
];

// Default feeds to display
export const defaultFeeds = ['cisa-alerts', 'threatpost', 'krebsonsecurity'];

// Feed categories for filtering
export const feedCategories = [
  { id: 'all', label: 'All Feeds' },
  { id: 'vulnerability', label: 'Vulnerabilities' },
  { id: 'advisory', label: 'Advisories' },
  { id: 'threat-intel', label: 'Threat Intel' },
  { id: 'news', label: 'News' },
  { id: 'general', label: 'General' },
];
export interface RSSFeed {
  id: string;
  name: string;
  url: string;
  description: string;
  category: 'vulnerability' | 'advisory' | 'threat-intel' | 'news' | 'general' | 'ics-cert' | 'tech';
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
    id: 'cisa-medical-advisories',
    name: 'CISA Medical Advisories',
    url: 'https://www.cisa.gov/uscert/ncas/current-activity.xml',
    description: 'Healthcare and medical device cybersecurity advisories',
    category: 'advisory',
    source: 'CISA',
    language: 'en-US',
  },

  // ============================================================================
  // THREAT INTELLIGENCE
  // ============================================================================

  // Vendor research feeds (probed and confirmed returning XML)
  {
    id: 'talos',
    name: 'Cisco Talos Intelligence',
    url: 'https://blog.talosintelligence.com/rss/',
    description: 'Threat research from Cisco Talos — daily IOCs, malware analysis, campaign tracking',
    category: 'threat-intel',
    source: 'talosintelligence.com',
    language: 'en',
  },
  {
    id: 'unit42',
    name: 'Unit 42 (Palo Alto)',
    url: 'https://unit42.paloaltonetworks.com/feed/',
    description: 'Active campaign tracking and malware analysis',
    category: 'threat-intel',
    source: 'unit42.paloaltonetworks.com',
    language: 'en',
  },
  {
    id: 'eset',
    name: 'ESET WeLiveSecurity',
    url: 'https://www.welivesecurity.com/feed/',
    description: 'European-focused threat research, esp. Russia/Ukraine cyber operations',
    category: 'threat-intel',
    source: 'welivesecurity.com',
    language: 'en',
  },
  {
    id: 'kaspersky-securelist',
    name: 'Kaspersky SecureList',
    url: 'https://securelist.com/feed/',
    description: 'Long-tail threat and malware research from Kaspersky GReAT',
    category: 'threat-intel',
    source: 'securelist.com',
    language: 'en',
  },
  {
    id: 'crowdstrike',
    name: 'CrowdStrike Blog',
    url: 'https://www.crowdstrike.com/blog/feed/',
    description: 'Endpoint-driven adversary intelligence and incident reports',
    category: 'threat-intel',
    source: 'crowdstrike.com',
    language: 'en',
  },
  {
    id: 'sentinelone-labs',
    name: 'SentinelOne Labs',
    url: 'https://www.sentinelone.com/labs/feed/',
    description: 'Malware reverse engineering and threat hunting',
    category: 'threat-intel',
    source: 'sentinelone.com',
    language: 'en',
  },

  // Dark web, ransomware, and breach trackers
  {
    id: 'darkwebinformer',
    name: 'Dark Web Informer',
    url: 'https://darkwebinformer.com/rss/',
    description: 'Daily dark web intelligence, ransomware leak-site posts, breach reports, and underground chatter',
    category: 'threat-intel',
    source: 'darkwebinformer.com',
    language: 'en',
  },
  {
    id: 'ransomware-live',
    name: 'Ransomware.live',
    url: 'https://ransomware.live/rss.xml',
    description: 'Active ransomware victim and leak-site tracker, updated continuously',
    category: 'threat-intel',
    source: 'ransomware.live',
    language: 'en',
  },
  {
    id: 'databreaches',
    name: 'DataBreaches.net',
    url: 'https://www.databreaches.net/feed/',
    description:
      'Breach reporting and analysis from Dissent. Wide coverage of healthcare, education, and government incidents',
    category: 'threat-intel',
    source: 'databreaches.net',
    language: 'en',
  },
  {
    id: 'dfir-report',
    name: 'The DFIR Report',
    url: 'https://thedfirreport.com/feed/',
    description: 'In-depth incident response writeups with full IOC and TTP detail',
    category: 'threat-intel',
    source: 'thedfirreport.com',
    language: 'en',
  },
  {
    id: 'the-record',
    name: 'The Record',
    url: 'https://therecord.media/feed',
    description: 'Cybersecurity reporting from Recorded Future, with strong dark web and ransomware coverage',
    category: 'threat-intel',
    source: 'therecord.media',
    language: 'en',
  },
  {
    id: 'curated-intel',
    name: 'Curated Intelligence',
    url: 'https://www.curatedintel.org/feeds/posts/default',
    description: 'Threat actor and ransomware research from the Curated Intelligence collective',
    category: 'threat-intel',
    source: 'curatedintel.org',
    language: 'en',
  },

  // Reddit communities (RSS via .rss suffix)

  // Vendor labs and research teams (curated from awesome-threat-intel-rss and cudeso/OPML-Security-Feeds)
  {
    id: 'google-project-zero',
    name: 'Google Project Zero',
    url: 'https://googleprojectzero.blogspot.com/feeds/posts/default',
    description: 'Zero-day vulnerability research from the Google Project Zero team',
    category: 'threat-intel',
    source: 'googleprojectzero.blogspot.com',
    language: 'en',
  },
  {
    id: 'checkpoint-research',
    name: 'Check Point Research',
    url: 'https://research.checkpoint.com/feed/',
    description: 'Malware reverse engineering and active campaign tracking from Check Point',
    category: 'threat-intel',
    source: 'research.checkpoint.com',
    language: 'en',
  },
  {
    id: 'sophos-xops',
    name: 'Sophos X-Ops',
    url: 'https://news.sophos.com/en-us/category/threat-research/feed/',
    description: 'Threat research from Sophos X-Ops, including ransomware tracking and incident reports',
    category: 'threat-intel',
    source: 'news.sophos.com',
    language: 'en',
  },
  {
    id: 'malwarebytes-labs',
    name: 'Malwarebytes Labs',
    url: 'https://blog.malwarebytes.com/feed/',
    description: 'Consumer and enterprise malware research from Malwarebytes Labs',
    category: 'threat-intel',
    source: 'malwarebytes.com',
    language: 'en',
  },
  {
    id: 'huntress',
    name: 'Huntress Blog',
    url: 'https://www.huntress.com/blog/rss.xml',
    description: 'Detection content and incident reports from the Huntress threat ops team',
    category: 'threat-intel',
    source: 'huntress.com',
    language: 'en',
  },
  {
    id: 'red-canary',
    name: 'Red Canary',
    url: 'https://redcanary.com/feed/',
    description: 'Detection engineering and threat intel from the Red Canary team',
    category: 'threat-intel',
    source: 'redcanary.com',
    language: 'en',
  },
  {
    id: 'malware-traffic-analysis',
    name: 'Malware Traffic Analysis',
    url: 'https://www.malware-traffic-analysis.net/blog-entries.rss',
    description: "Brad Duncan's daily PCAPs, IOCs, and malware samples. One of the highest-signal IOC feeds online",
    category: 'threat-intel',
    source: 'malware-traffic-analysis.net',
    language: 'en',
  },
  {
    id: 'doublepulsar',
    name: 'DoublePulsar (Kevin Beaumont)',
    url: 'https://doublepulsar.com/feed',
    description: 'Kevin Beaumont on ransomware, zero-days, and active exploitation campaigns',
    category: 'threat-intel',
    source: 'doublepulsar.com',
    language: 'en',
  },
  {
    id: 'mitre-attack-medium',
    name: 'MITRE ATT&CK',
    url: 'https://medium.com/feed/mitre-attack',
    description: 'Official updates from the MITRE ATT&CK team on framework changes and threat groups',
    category: 'threat-intel',
    source: 'medium.com/mitre-attack',
    language: 'en',
  },

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
  // ============================================================================
  // SECURITY NEWS
  // ============================================================================
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
    id: 'csoconline',
    name: 'CSO Online',
    url: 'https://www.csoonline.com/feed/',
    description: 'Security and risk management leadership news',
    category: 'news',
    source: 'CSO Online',
    language: 'en-US',
  },

  // ============================================================================
  // HACKER NEWS / Y COMBINATOR (AI / Tech / Cybersecurity)
  // ============================================================================
  {
    id: 'hn-frontpage',
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    description: 'Hacker News front page - top tech, AI, and security stories',
    category: 'tech',
    source: 'Hacker News',
    language: 'en-US',
  },
  {
    id: 'hn-ask',
    name: 'Ask HN',
    url: 'https://hnrss.org/ask',
    description: 'Ask Hacker News - questions and discussions from the community',
    category: 'tech',
    source: 'Hacker News',
    language: 'en-US',
  },
  {
    id: 'hn-show',
    name: 'Show HN',
    url: 'https://hnrss.org/show',
    description: 'Show Hacker News - new projects, products, and demos',
    category: 'tech',
    source: 'Hacker News',
    language: 'en-US',
  },
  {
    id: 'hn-ai',
    name: 'HN — AI',
    url: 'https://hnrss.org/newest?q=AI',
    description: 'Newest Hacker News stories matching "AI"',
    category: 'tech',
    source: 'Hacker News',
    language: 'en-US',
  },
  {
    id: 'hn-cybersecurity',
    name: 'HN — Cybersecurity',
    url: 'https://hnrss.org/newest?q=cybersecurity',
    description: 'Newest Hacker News stories matching "cybersecurity"',
    category: 'tech',
    source: 'Hacker News',
    language: 'en-US',
  },
  {
    id: 'yc-blog',
    name: 'Y Combinator Blog',
    url: 'https://www.ycombinator.com/blog/rss',
    description: 'Y Combinator blog - startup essays, announcements, and YC news',
    category: 'tech',
    source: 'Y Combinator',
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

  // ============================================================================
  // MALWARE ANALYSIS & SANDBOX
  // ============================================================================

  // ============================================================================
  // GENERAL SECURITY
  // ============================================================================
  // Reddit communities. Reddit aggressively rate-limits Cloudflare Worker egress
  // for the most popular subs (r/cybersecurity, r/ransomware return 502); the four
  // listed below have been verified to return parseable Atom from the proxy.
  {
    id: 'reddit-netsec',
    name: 'Reddit r/netsec',
    url: 'https://www.reddit.com/r/netsec/.rss',
    description: 'Network security community discussions',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'reddit-malware',
    name: 'Reddit r/Malware',
    url: 'https://www.reddit.com/r/Malware/.rss',
    description: 'Malware analysis, samples, and reverse engineering discussion',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'reddit-blueteamsec',
    name: 'Reddit r/blueteamsec',
    url: 'https://www.reddit.com/r/blueteamsec/.rss',
    description: 'Defender-focused threat intel, detection rules, and incident reports',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'reddit-threatintel',
    name: 'Reddit r/threatintel',
    url: 'https://www.reddit.com/r/threatintel/.rss',
    description: 'Threat intelligence discussion, IOC sharing, and actor tracking',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },

  // ============================================================================
  // SCAM WATCH SOURCES — official alerts, deepfake news, victim reports
  // ============================================================================
  {
    id: 'ftc-consumer',
    name: 'FTC Consumer Alerts',
    url: 'https://consumer.ftc.gov/blog/rss',
    description: 'Federal Trade Commission consumer-protection blog — scam alerts and emerging fraud trends',
    category: 'advisory',
    source: 'FTC',
    language: 'en-US',
  },
  {
    id: 'ic3-psas',
    name: 'FBI IC3 Public Service Announcements',
    url: 'https://www.ic3.gov/CSA/RSS',
    description: 'FBI Internet Crime Complaint Center PSAs — active fraud schemes, BEC, romance + tech-support scams',
    category: 'advisory',
    source: 'FBI IC3',
    language: 'en-US',
  },
  {
    id: 'snopes',
    name: 'Snopes',
    url: 'https://www.snopes.com/feed/',
    description: 'Misinformation + scam fact-checking; routinely covers deepfake claims and viral scam stories',
    category: 'news',
    source: 'snopes.com',
    language: 'en-US',
  },
  {
    id: 'gnews-deepfake',
    name: 'Google News — deepfake scam',
    url: 'https://news.google.com/rss/search?q=deepfake+scam&hl=en-US&gl=US&ceid=US:en',
    description: 'Google News search RSS for "deepfake scam" — synthetic-media-driven fraud incidents',
    category: 'news',
    source: 'Google News',
    language: 'en-US',
  },
  {
    id: 'gnews-victim',
    name: 'Google News — digital scam victims',
    url: 'https://news.google.com/rss/search?q=digital+scam+victim&hl=en-US&gl=US&ceid=US:en',
    description:
      'Google News search RSS for "digital scam victim" — case-by-case fraud reporting from mainstream media',
    category: 'news',
    source: 'Google News',
    language: 'en-US',
  },
  {
    id: 'reddit-scams',
    name: 'Reddit r/Scams',
    url: 'https://www.reddit.com/r/Scams/.rss',
    description:
      'First-person scam reports — phishing, IRS impersonation, romance, marketplace, tech-support, gift-card',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'reddit-cryptoscams',
    name: 'Reddit r/CryptoScams',
    url: 'https://www.reddit.com/r/CryptoScams/.rss',
    description: 'Cryptocurrency-specific scam reports — pig butchering, fake exchanges, wallet drainers',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'reddit-romance-scams',
    name: 'Reddit r/Romance_Scams',
    url: 'https://www.reddit.com/r/Romance_Scams/.rss',
    description: 'Romance- and pig-butchering-scam victim reports + recovery community',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'reddit-phishing-scams',
    name: 'Reddit r/PhishingScams',
    url: 'https://www.reddit.com/r/PhishingScams/.rss',
    description: 'User-reported phishing samples — SMS, email, voice (vishing)',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'reddit-jobscams',
    name: 'Reddit r/JobScams',
    url: 'https://www.reddit.com/r/JobScams/.rss',
    description: 'Fake recruiter / fake interview / employment-fraud reports',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'reddit-scammer-payback',
    name: 'Reddit r/ScammerPayback',
    url: 'https://www.reddit.com/r/ScammerPayback/.rss',
    description: 'Anti-scam community — call-centre exposes, scammer-baiting writeups, IRS / Microsoft impersonation',
    category: 'threat-intel',
    source: 'Reddit',
    language: 'en-US',
  },
  {
    id: 'gnews-pig-butcher',
    name: 'Google News — pig butchering scam',
    url: 'https://news.google.com/rss/search?q=pig+butchering+scam&hl=en-US&gl=US&ceid=US:en',
    description: 'Long-con investment + crypto fraud ("sha zhu pan") news coverage',
    category: 'news',
    source: 'Google News',
    language: 'en-US',
  },
  {
    id: 'gnews-job-scam',
    name: 'Google News — job / recruiter scam',
    url: 'https://news.google.com/rss/search?q=job+scam+fake+recruiter&hl=en-US&gl=US&ceid=US:en',
    description: 'Fake-job / fake-recruiter / employment-fraud incident coverage',
    category: 'news',
    source: 'Google News',
    language: 'en-US',
  },
  {
    id: 'gnews-tech-support',
    name: 'Google News — tech support scam',
    url: 'https://news.google.com/rss/search?q=tech+support+scam&hl=en-US&gl=US&ceid=US:en',
    description: 'Microsoft / Apple / IRS / IT-support impersonation incident coverage',
    category: 'news',
    source: 'Google News',
    language: 'en-US',
  },
  {
    id: 'gnews-investment-scam',
    name: 'Google News — investment scam',
    url: 'https://news.google.com/rss/search?q=investment+scam+fraud&hl=en-US&gl=US&ceid=US:en',
    description: 'Investment / brokerage / advisory fraud coverage',
    category: 'news',
    source: 'Google News',
    language: 'en-US',
  },
  {
    id: 'gnews-voice-clone',
    name: 'Google News — AI voice clone',
    url: 'https://news.google.com/rss/search?q=AI+voice+clone+scam&hl=en-US&gl=US&ceid=US:en',
    description: 'Voice-cloning vishing / family-emergency / kidnapping-claim incident coverage',
    category: 'news',
    source: 'Google News',
    language: 'en-US',
  },
  {
    id: 'gnews-sim-swap',
    name: 'Google News — SIM swap',
    url: 'https://news.google.com/rss/search?q=SIM+swap+attack&hl=en-US&gl=US&ceid=US:en',
    description: 'SIM-swap account-takeover incidents — banking, crypto, social-media takeovers',
    category: 'news',
    source: 'Google News',
    language: 'en-US',
  },
];

// Default feeds shown in the ThreatIntelFeed surface on /dfir.
// Auto-derived from the catalog so any new threat-intel, advisory, or news entry
// is picked up automatically. Tech / startup news (HN, YC) lives in `defaultTechFeeds`.
export const defaultFeeds = rssFeeds
  .filter((f) => f.category === 'threat-intel' || f.category === 'advisory' || f.category === 'news')
  .map((f) => f.id);

// Tech / AI / startup news — rendered in TechNewsFeed on /dfir, separate from the threat feed.
export const defaultTechFeeds = ['hn-frontpage', 'hn-ask', 'hn-show', 'hn-ai', 'yc-blog'];

// Feed categories for filtering
export const feedCategories = [
  { id: 'all', label: 'All Feeds' },
  { id: 'vulnerability', label: 'Vulnerabilities' },
  { id: 'advisory', label: 'Advisories' },
  { id: 'ics-cert', label: 'ICS-CERT' },
  { id: 'threat-intel', label: 'Threat Intel' },
  { id: 'news', label: 'News' },
  { id: 'tech', label: 'Tech & AI' },
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

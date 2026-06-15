export type ToolCategory =
  | 'username'
  | 'email'
  | 'domain'
  | 'social'
  | 'dorking'
  | 'recon'
  | 'framework'
  | 'breach'
  | 'telegram'
  | 'malware';

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  username: 'Username Search',
  email: 'Email OSINT',
  domain: 'Domain & Website',
  social: 'Social Media',
  dorking: 'Dorking & Crawling',
  recon: 'Recon Toolkits',
  framework: 'Frameworks & Collections',
  breach: 'Breach Data',
  telegram: 'Telegram',
  malware: 'Malware Analysis',
};

export interface CliTool {
  name: string;
  repo: string;
  category: ToolCategory;
  lang: string;
  desc: string;
  stars?: string;
  tags?: string[];
}

export const CLI_TOOLS: CliTool[] = [
  // Username
  {
    name: 'Sherlock',
    repo: 'https://github.com/sherlock-project/sherlock',
    category: 'username',
    lang: 'Python',
    desc: 'Hunt down social media accounts by username across 400+ sites',
    stars: '62k',
  },
  {
    name: 'Maigret',
    repo: 'https://github.com/soxoj/maigret',
    category: 'username',
    lang: 'Python',
    desc: 'OSINT username checker with 5000+ site modules and async architecture',
    stars: '13k',
  },
  {
    name: 'Blackbird',
    repo: 'https://github.com/p1ngul1n0/blackbird',
    category: 'username',
    lang: 'Python',
    desc: 'Fast username checker — search 100+ sites in seconds',
    stars: '3.5k',
  },
  {
    name: 'WhatsMyName-Python',
    repo: 'https://github.com/C3n7ral051nt4g3ncy/WhatsMyName-Python',
    category: 'username',
    lang: 'Python',
    desc: 'Web enumeration username hunt via valid response code mapping',
    stars: '1.2k',
  },
  {
    name: 'Nexfil',
    repo: 'https://github.com/thewhiteh4t/nexfil',
    category: 'username',
    lang: 'Python',
    desc: 'Check usernames across 350+ platforms in real-time',
    stars: '2.5k',
  },
  {
    name: 'Social-Analyzer',
    repo: 'https://github.com/qeeqbox/social-analyzer',
    category: 'username',
    lang: 'Python',
    desc: 'CLI, API, and web app to find profiles by name/username/phone/email',
    stars: '3.2k',
  },
  {
    name: 'HandleHawk',
    repo: 'https://github.com/C3n7ral051nt4g3ncy/HandleHawk',
    category: 'username',
    lang: 'Python',
    desc: 'X/Twitter handle investigation — followers, tweets, metadata',
    tags: ['x', 'twitter'],
  },
  {
    name: 'Tracer',
    repo: 'https://github.com/chr3st5an/tracer',
    category: 'username',
    lang: 'Python',
    desc: 'Cross-platform username search with detailed results',
  },

  // Email
  {
    name: 'Holehe',
    repo: 'https://github.com/megadose/holehe',
    category: 'email',
    lang: 'Python',
    desc: 'Check if an email is linked to accounts on 120+ platforms',
    stars: '2.8k',
  },
  {
    name: 'GHunt',
    repo: 'https://github.com/mxrch/GHunt',
    category: 'email',
    lang: 'Python',
    desc: 'Investigate Google accounts — emails, calendars, Drive, maps',
    stars: '6.5k',
  },
  {
    name: 'H8mail',
    repo: 'https://github.com/khast3x/h8mail',
    category: 'email',
    lang: 'Python',
    desc: 'Email OSINT — breach check, password tracking, linked accounts',
    stars: '2.2k',
  },
  {
    name: 'The Harvester',
    repo: 'https://github.com/laramies/theHarvester',
    category: 'email',
    lang: 'Python',
    desc: 'Gather emails, subdomains, hosts, employee names from public sources',
    stars: '11k',
  },
  {
    name: 'SocialScan',
    repo: 'https://github.com/iojw/socialscan',
    category: 'email',
    lang: 'Python',
    desc: 'Check email registration status on Instagram, Facebook, Twitter',
    stars: '1.5k',
  },
  {
    name: 'Poastal',
    repo: 'https://github.com/jakecreps/poastal',
    category: 'email',
    lang: 'Python',
    desc: 'Email OSINT — breach lookup, social profiles, domain intel',
  },
  {
    name: 'Eyes',
    repo: 'https://github.com/N0rz3/Eyes',
    category: 'email',
    lang: 'Python',
    desc: 'Email intelligence — find linked accounts and data breaches',
  },
  {
    name: 'Zen',
    repo: 'https://github.com/s0md3v/Zen',
    category: 'email',
    lang: 'Python',
    desc: 'Email reconnaissance — social media, breach data, reverse lookup',
  },

  // Domain
  {
    name: 'Amass',
    repo: 'https://github.com/owasp-amass/amass',
    category: 'domain',
    lang: 'Go',
    desc: 'OWASP network mapping and attack surface discovery',
    stars: '11k',
  },
  {
    name: 'Bbot',
    repo: 'https://github.com/blacklanternsecurity/bbot',
    category: 'domain',
    lang: 'Python',
    desc: 'Recursive crawling and subdomain enumeration with OSINT modules',
    stars: '4k',
  },
  {
    name: 'SpiderFoot',
    repo: 'https://github.com/smicallef/spiderfoot',
    category: 'domain',
    lang: 'Python',
    desc: 'Full OSINT automation — 200+ modules for recon on IP, domain, name',
    stars: '14k',
  },
  {
    name: 'FinalRecon',
    repo: 'https://github.com/thewhiteh4t/FinalRecon',
    category: 'domain',
    lang: 'Python',
    desc: 'All-in-one web recon — headers, whois, DNS, subdomains, trace',
    stars: '2.5k',
  },
  {
    name: 'Photon',
    repo: 'https://github.com/s0md3v/Photon',
    category: 'domain',
    lang: 'Python',
    desc: 'Fast web crawler — extract emails, URLs, social accounts, files',
    stars: '5.5k',
  },
  {
    name: 'Argus',
    repo: 'https://github.com/jasonxtn/Argus',
    category: 'domain',
    lang: 'Python',
    desc: 'OSINT framework — recon, forensics, trace, and visualization',
  },
  {
    name: 'Unfurl',
    repo: 'https://github.com/tomnomnom/unfurl',
    category: 'domain',
    lang: 'Go',
    desc: 'Extract and analyze URLs — query params, paths, fragments',
    stars: '3.5k',
  },
  {
    name: 'Subcat',
    repo: 'https://github.com/duty1g/subcat',
    category: 'domain',
    lang: 'Python',
    desc: 'Subdomain enumeration and analysis tool',
  },

  // Social
  {
    name: 'Toutatis',
    repo: 'https://github.com/megadose/toutatis',
    category: 'social',
    lang: 'Python',
    desc: 'X/Twitter OSINT — profile info, followers, tweets, lists',
    stars: '2.5k',
  },
  {
    name: 'Geogramint',
    repo: 'https://github.com/Alb-310/Geogramint',
    category: 'social',
    lang: 'Python',
    desc: 'Telegram OSINT — geolocate users via shared media and groups',
  },
  {
    name: 'Masto',
    repo: 'https://github.com/C3n7ral051nt4g3ncy/Masto',
    category: 'social',
    lang: 'Python',
    desc: 'Mastodon OSINT — profile search, instance enumeration',
  },
  {
    name: 'SnapIntel',
    repo: 'https://github.com/Kr0wZ/SnapIntel',
    category: 'social',
    lang: 'Python',
    desc: 'Snapchat OSINT — profile lookup and metadata extraction',
  },
  {
    name: 'LinkedIn2Username',
    repo: 'https://github.com/initstring/linkedin2username',
    category: 'social',
    lang: 'Python',
    desc: 'Generate username permutations from LinkedIn company pages',
    stars: '1.5k',
  },
  {
    name: 'WhatsOSINT',
    repo: 'https://github.com/HackUnderway/WhatsOSINT',
    category: 'social',
    lang: 'Python',
    desc: 'WhatsApp OSINT — profile photo extraction and metadata',
  },

  // Dorking
  {
    name: 'OxDork',
    repo: 'https://github.com/rly0nheart/oxdork',
    category: 'dorking',
    lang: 'Python',
    desc: 'Google dorking automation — fast, multi-query search engine dorking',
  },
  {
    name: 'Dorks Eye',
    repo: 'https://github.com/BullsEye0/dorks-eye',
    category: 'dorking',
    lang: 'Python',
    desc: 'Google dork scanner — find exposed files, login panels, data leaks',
  },
  {
    name: 'XNL Dorker',
    repo: 'https://github.com/xnl-h4ck3r/xnldorker',
    category: 'dorking',
    lang: 'Python',
    desc: 'Advanced dorking with Google, Bing, DuckDuckGo, Brave',
  },
  {
    name: 'SX Dork',
    repo: 'https://github.com/samhaxr/SXDork',
    category: 'dorking',
    lang: 'Python',
    desc: 'Simple yet powerful Google dorking tool for OSINT',
  },

  // Recon
  {
    name: 'Recon-ng',
    repo: 'https://github.com/lanmaster53/recon-ng',
    category: 'recon',
    lang: 'Python',
    desc: 'Full-featured reconnaissance framework with modules and database',
    stars: '7k',
  },
  {
    name: 'ReconFTW',
    repo: 'https://github.com/six2dez/reconftw',
    category: 'recon',
    lang: 'Shell',
    desc: 'Automated recon — subdomain takeovers, port scanning, web fuzzing',
    stars: '5.5k',
  },
  {
    name: 'RedTiger Tools',
    repo: 'https://github.com/loxy0dev/RedTiger-Tools',
    category: 'recon',
    lang: 'Python',
    desc: 'Multi-tool OSINT toolkit for red team operations',
  },
  {
    name: 'Laitoxx',
    repo: 'https://github.com/laitoxx/Laitoxx-Multi-Tool',
    category: 'recon',
    lang: 'Python',
    desc: 'Multi-purpose OSINT and reconnaissance toolkit',
  },
  {
    name: 'X-OSINT',
    repo: 'https://github.com/TermuxHackz/X-osint',
    category: 'recon',
    lang: 'Shell',
    desc: 'OSINT toolkit optimized for Termux/Android',
  },
  {
    name: 'IKY',
    repo: 'https://github.com/kennbroorg/iKy',
    category: 'recon',
    lang: 'Python',
    desc: 'OSINT data collection and visualization framework',
    stars: '1.5k',
  },
  {
    name: 'Infooze',
    repo: 'https://github.com/devxprite/infoooze',
    category: 'recon',
    lang: 'JavaScript',
    desc: 'OSINT tool — email, username, IP, phone, domain lookups',
  },

  // Framework
  {
    name: 'OSINT Framework',
    repo: 'https://osintframework.com/',
    category: 'framework',
    lang: '',
    desc: 'Collection of OSINT tools organized by category and data type',
    stars: '9k',
  },
  {
    name: "Malfrat's OSINT Map",
    repo: 'https://map.malfrats.industries/',
    category: 'framework',
    lang: '',
    desc: 'Interactive OSINT tool map — visual navigation of tools by use case',
  },
  {
    name: 'Bellingcat Toolkit',
    repo: 'https://bellingcat.gitbook.io/toolkit',
    category: 'framework',
    lang: '',
    desc: "Bellingcat's curated OSINT toolkit — investigations, verification, geolocation",
  },

  // Breach
  {
    name: 'DeHashed',
    repo: 'https://www.dehashed.com/',
    category: 'breach',
    lang: '',
    desc: 'Breach database search — emails, usernames, IPs, names, phone numbers',
  },
  {
    name: 'IntelX',
    repo: 'https://intelx.io/',
    category: 'breach',
    lang: '',
    desc: 'Intelligence search engine — breaches, darknet, paste sites',
  },

  // Telegram
  {
    name: 'TGStat',
    repo: 'https://tgstat.com/',
    category: 'telegram',
    lang: '',
    desc: 'Telegram channel analytics — growth, reach, engagement stats',
  },
  {
    name: 'Telemetr',
    repo: 'https://telemetr.io/',
    category: 'telegram',
    lang: '',
    desc: 'Telegram channel analytics and statistics platform',
  },
];

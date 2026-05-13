/**
 * Curated Telegram channel catalog for threat intel and cybercrime
 * monitoring.
 *
 * Honest scope:
 *   - We do NOT scrape or proxy Telegram. Telegram channels accessible
 *     to non-members go through t.me/<channel> or t.me/s/<channel>
 *     (preview view). Joining channels requires a Telegram account and
 *     is opsec-sensitive — use a dedicated sock-puppet account.
 *   - This is an INDEX, not a feed. Channels rotate (Telegram bans + actor
 *     pivots). Each entry is documented in public threat-intel writeups
 *     or by reputable researchers; verify before relying on the link.
 *   - We lean toward LEGITIMATE researcher / news / OSINT-team channels
 *     which are stable. For fast-rotating cybercrime channels we point
 *     at the deepdarkCTI living index rather than hard-coding entries
 *     that decay within months.
 *
 * Categories are oriented around the analyst's job: what is this for?
 * If you're investigating a stealer drop you want `stealer-logs`; if
 * you're tracking ransomware claims you want `ransomware`.
 */

export type TelegramCategory =
  | 'threat-intel'
  | 'ransomware'
  | 'breach-leaks'
  | 'stealer-logs'
  | 'carding-fraud'
  | 'malware-research'
  | 'security-news'
  | 'osint-research'
  | 'regional-cybercrime'
  | 'hacktivism'
  | 'index-of-indexes';

export type Audience = 'public-channel' | 'public-group' | 'preview-only';

export interface TelegramEntry {
  id: string;
  /** Display name — what researchers refer to it as. */
  name: string;
  /** Channel handle without the @, e.g. "vxunderground". */
  handle: string;
  /** Where this entry was first publicly documented or who runs it. */
  attribution?: string;
  categories: TelegramCategory[];
  /** Primary content language (ISO 639-1 lowercase, plus a few extras). */
  language: 'en' | 'ru' | 'es' | 'pt' | 'zh' | 'fa' | 'ar' | 'mixed';
  audience: Audience;
  /** What an analyst gets out of this channel in 1–2 sentences. */
  description: string;
  /** Optional approximate member count, if known and stable. */
  approx_members?: string;
  /** Optional badge: "essential", "research", "news-mirror", etc. */
  badge?: string;
}

export const CATEGORY_LABELS: Record<TelegramCategory, string> = {
  'threat-intel': 'Threat Intelligence',
  ransomware: 'Ransomware Tracking',
  'breach-leaks': 'Breach / Leak Reposts',
  'stealer-logs': 'Stealer Logs',
  'carding-fraud': 'Carding / Fraud',
  'malware-research': 'Malware Research',
  'security-news': 'Security News',
  'osint-research': 'OSINT Research',
  'regional-cybercrime': 'Regional Cybercrime',
  hacktivism: 'Hacktivism',
  'index-of-indexes': 'Living Indexes',
};

export const CATEGORY_BLURB: Record<TelegramCategory, string> = {
  'threat-intel': 'Researcher-run channels publishing IOCs, write-ups, and campaign tracking.',
  ransomware: 'Channels mirroring or tracking ransomware leak-site activity and claims.',
  'breach-leaks': 'Channels reposting fresh breach data, samples, and breach announcements.',
  'stealer-logs': 'Channels distributing or indexing infostealer logs (RedLine, Raccoon, Vidar, Lumma).',
  'carding-fraud': 'Carding shops, fraud-as-a-service, and fraud tutorial channels.',
  'malware-research': 'Sample sharing, sandbox links, reverse-engineering write-ups.',
  'security-news': 'Mirrors of established security press and vendor blogs into Telegram.',
  'osint-research': 'OSINT-team channels for geolocation, SOCMINT, conflict tracking.',
  'regional-cybercrime': 'Russian / Chinese / Iranian / LatAm-language cybercrime communities.',
  hacktivism: 'Hacktivist groups announcing operations and dumps.',
  'index-of-indexes': 'Curated catalogues of other Telegram channels — start here.',
};

export const LANGUAGE_LABELS: Record<TelegramEntry['language'], string> = {
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
  pt: 'Portuguese',
  zh: 'Chinese',
  fa: 'Farsi',
  ar: 'Arabic',
  mixed: 'Mixed',
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  'public-channel': 'Public channel',
  'public-group': 'Public group',
  'preview-only': 'Preview only',
};

export const CATALOG: TelegramEntry[] = [
  // ─────────────────────────────────────────────────────────────────────
  // Index-of-indexes — start here
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'deepdarkcti-telegram',
    name: 'deepdarkCTI · Telegram index',
    handle: 'fastfire/deepdarkCTI', // surfaced via GitHub, not t.me
    attribution: 'github.com/fastfire/deepdarkCTI',
    categories: ['index-of-indexes', 'threat-intel'],
    language: 'mixed',
    audience: 'public-channel',
    description:
      'Continuously-maintained markdown index of dark-web and cybercrime Telegram channels. The canonical starting point for fast-rotating threat channels — saves you from chasing dead handles.',
    badge: 'essential',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Legitimate threat-intel / researcher channels (stable, recommended)
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'vxunderground',
    name: 'vx-underground',
    handle: 'vxunderground',
    attribution: 'vx-underground.org collective',
    categories: ['malware-research', 'threat-intel'],
    language: 'en',
    audience: 'public-channel',
    description:
      'Largest public malware-source-code archive. Channel posts new samples, paper releases, and threat-actor commentary. Run by the same team behind the vx-underground.org library.',
    badge: 'essential',
  },
  {
    id: 'androidmalware',
    name: 'Android Malware',
    handle: 'androidmalware',
    attribution: 'Android malware research community',
    categories: ['malware-research', 'threat-intel'],
    language: 'en',
    audience: 'public-channel',
    description:
      'Daily Android malware sample drops, family attribution, and detonation notes. High signal for mobile-threat analysts.',
    badge: 'research',
  },
  {
    id: 'ctinow',
    name: 'CTI Now',
    handle: 'ctinow',
    attribution: 'CTI Now community',
    categories: ['threat-intel', 'breach-leaks'],
    language: 'en',
    audience: 'public-channel',
    description:
      'Real-time threat-intelligence aggregator — fresh IOCs, advisories, and breach announcements. Multiple posts per day; pair with your TIP for ingestion.',
    badge: 'essential',
  },
  {
    id: 'cyber-ti-reports-vn',
    name: 'Cyber TI Reports',
    handle: 'Cyber_Ti_Reports_VN',
    attribution: 'Vietnamese CTI community',
    categories: ['threat-intel'],
    language: 'mixed',
    audience: 'public-channel',
    description:
      'Curated mirror of CTI / APT reports from vendors and CERTs (Vietnamese-curated, English content). Useful as a long-form report feed.',
    badge: 'research',
  },
  {
    id: 'defendor-eng',
    name: 'Defendor (EN)',
    handle: 'defendor_eng',
    attribution: 'Defendor CTI community',
    categories: ['threat-intel'],
    language: 'en',
    audience: 'public-channel',
    description:
      'Defensive-CTI write-ups, IR retros, and threat-actor tracking — English-language community channel; multiple posts per day.',
    badge: 'research',
  },
  {
    id: 'ctifeeds-group',
    name: 'CTI Feeds (group)',
    handle: 'ctifeeds',
    attribution: 'Open CTI community',
    categories: ['threat-intel'],
    language: 'en',
    audience: 'public-group',
    description:
      'Open Telegram GROUP (not a channel) for CTI practitioners to swap fresh IOCs, advisory links, and intel notes. Join required to read; no t.me/s/<...> preview, so it cannot be ingested into the firehose.',
  },
  {
    id: 'group-ib',
    name: 'Group-IB',
    handle: 'group_ib',
    attribution: 'group-ib.com',
    categories: ['threat-intel'],
    language: 'en',
    audience: 'public-channel',
    description:
      'Official Group-IB channel — vendor blog cross-posts on APT campaigns, ransomware actors, and underground-economy research.',
    badge: 'research',
  },
  {
    id: 'dataleak',
    name: 'DataLeak',
    handle: 'dataleak',
    categories: ['breach-leaks'],
    language: 'en',
    audience: 'public-channel',
    description:
      'High-volume breach-repost channel — fresh database dumps, sample releases, and breach announcements aggregated from multiple sources.',
  },
  {
    id: 'leakradar-io',
    name: 'LeakRadar',
    handle: 'leakradar_io',
    attribution: 'leakradar.io',
    categories: ['breach-leaks', 'stealer-logs'],
    language: 'en',
    audience: 'public-channel',
    description:
      'Official LeakRadar channel — fresh stealer-log drops, breach-file indexing alerts, and combolist availability notices from the 290B+ credential corpus they index. Pairs with leakradar.io for searchable access.',
    badge: 'research',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Security news mirrors
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'bleepingcomputer',
    name: 'BleepingComputer',
    handle: 'BleepingComputer',
    attribution: 'bleepingcomputer.com',
    categories: ['security-news'],
    language: 'en',
    audience: 'public-channel',
    description: 'Official Telegram mirror of BleepingComputer headlines — fast vector for breaking incident news.',
  },
  {
    id: 'thehackernews',
    name: 'The Hacker News',
    handle: 'TheHackerNews',
    attribution: 'thehackernews.com',
    categories: ['security-news'],
    language: 'en',
    audience: 'public-channel',
    description: 'Official Telegram mirror of The Hacker News headlines.',
  },
  {
    id: 'cyber-security-channel',
    name: 'Cyber Security Channel',
    handle: 'cyber_security_channel',
    categories: ['security-news', 'threat-intel'],
    language: 'en',
    audience: 'public-channel',
    description:
      'High-volume aggregator — daily mirrors of vendor blogs, news sites, and advisories into one feed. Best paired with a keyword filter.',
  },
  {
    id: 'cyberscoop',
    name: 'CyberScoop',
    handle: 'cyberscoop',
    attribution: 'cyberscoop.com',
    categories: ['security-news'],
    language: 'en',
    audience: 'public-channel',
    description: 'Official CyberScoop mirror — strong on government / federal-cyber and policy coverage.',
  },

  // ─────────────────────────────────────────────────────────────────────
  // OSINT research
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'daily-bounty-writeup',
    name: 'Daily Bounty Writeup',
    handle: 'dailybountywriteup',
    attribution: 'Bug-bounty community',
    categories: ['osint-research'],
    language: 'en',
    audience: 'public-channel',
    description:
      'Curated daily bug-bounty write-ups, disclosed vulnerability reports, and offensive-research tradecraft from HackerOne / Intigriti / Bugcrowd disclosures.',
    badge: 'research',
  },
  {
    id: 'deepdarkcti-osint-pointer',
    name: 'OSINT-team channels (via deepdarkCTI)',
    handle: 'fastfire/deepdarkCTI',
    attribution: 'see deepdarkCTI OSINT sections',
    categories: ['osint-research', 'index-of-indexes'],
    language: 'mixed',
    audience: 'public-channel',
    description:
      'OSINT-team channels (Bellingcat, IntelCrab, OSINT-team) have rotated handles or disabled previews repeatedly. The deepdarkCTI living index is the canonical pointer — find current handles there before relying on any specific entry.',
    badge: 'pointer',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Stealer logs / cybercrime indexes (public-documented)
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'redline-stealer',
    name: 'RedLine Stealer ecosystem',
    handle: 'fastfire/deepdarkCTI/blob/main/telegram_infostealer.md',
    attribution: 'see deepdarkCTI infostealer index',
    categories: ['stealer-logs', 'index-of-indexes'],
    language: 'mixed',
    audience: 'public-channel',
    description:
      'Pointer to the deepdarkCTI living list of infostealer-distribution channels (RedLine, Raccoon, Lumma, Vidar, StealC). Hard-coding individual handles is futile — they rotate weekly.',
    badge: 'pointer',
  },
  {
    id: 'cl0p-leak-news',
    name: 'Cl0p leak news (defunct mirrors)',
    handle: 'fastfire/deepdarkCTI/blob/main/telegram_ransomware.md',
    attribution: 'see deepdarkCTI ransomware index',
    categories: ['ransomware', 'index-of-indexes'],
    language: 'mixed',
    audience: 'public-channel',
    description:
      'Cl0p, LockBit, BlackBasta and other ransomware Telegram presences come and go after takedowns. The deepdarkCTI ransomware index is the canonical living register.',
    badge: 'pointer',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Regional cybercrime
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'xss-mirror',
    name: 'XSS forum (RU mirrors)',
    handle: 'fastfire/deepdarkCTI/blob/main/telegram_forum.md',
    attribution: 'see deepdarkCTI forum index',
    categories: ['regional-cybercrime', 'index-of-indexes'],
    language: 'ru',
    audience: 'public-channel',
    description:
      'Russian-language forum-mirror channels (XSS, Exploit.in, BHF). The deepdarkCTI forum index is the place to look — direct handles change frequently after operator infighting and bans.',
    badge: 'pointer',
  },
  {
    id: 'cn-cyber',
    name: 'Chinese-language cyber channels',
    handle: 'fastfire/deepdarkCTI',
    attribution: 'see deepdarkCTI Chinese sections',
    categories: ['regional-cybercrime', 'index-of-indexes'],
    language: 'zh',
    audience: 'public-channel',
    description:
      'Chinese-language cybercrime and dox channels — mostly hosted on Telegram for jurisdictional convenience. deepdarkCTI maintains a section.',
    badge: 'pointer',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Hacktivism — public-by-design
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'killnet-track',
    name: 'KillNet activity tracking',
    handle: 'CyberKnow20',
    attribution: 'see CyberKnow channel above',
    categories: ['hacktivism'],
    language: 'en',
    audience: 'public-channel',
    description:
      'KillNet, NoName057(16), Anonymous Sudan and adjacent hacktivist crews announce ops on Telegram. CyberKnow tracks them in English; for primary sources, follow group-specific channels documented in public IR reports.',
  },
  {
    id: 'usdod-tracking',
    name: 'USDoD / IntelBroker tracking',
    handle: 'fastfire/deepdarkCTI',
    attribution: 'see deepdarkCTI hacktivist & data-broker indexes',
    categories: ['hacktivism', 'breach-leaks'],
    language: 'en',
    audience: 'public-channel',
    description:
      'Independent hacker / data-broker personas (USDoD, IntelBroker, R00TK1T) frequently announce sales on Telegram. Indexed in deepdarkCTI; primary handles rotate after platform takedowns.',
    badge: 'pointer',
  },
];

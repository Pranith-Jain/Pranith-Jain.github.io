/**
 * Baseline infostealer encyclopedia — curated family profiles with
 * Malpedia references and threat-actor attribution.
 *
 * Inspired by Hokage-Intel's 24-family infostealer seed set.
 * Each entry links to Malpedia and ThreatFox for live IOC ingestion.
 */
export interface InfostealerFamily {
  slug: string;
  name: string;
  aliases: string[];
  description: string;
  malpediaUrl?: string;
  threatfoxTag?: string;
  actors: string[];
  firstSeen: string;
  platforms: string[];
  capabilities: string[];
}

export const INFOSTEALER_FAMILIES: InfostealerFamily[] = [
  {
    slug: 'redline',
    name: 'RedLine Stealer',
    aliases: ['RedLine'],
    description:
      'RedLine is a commodity infostealer written in .NET, sold on underground forums since 2020. It targets browser credentials, cryptocurrency wallets, VPN/ FTP clients, and system information. Distributed via phishing, malvertising, and loader-as-a-service. One of the most prevalent stealers in 2023-2025.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.redline_stealer',
    threatfoxTag: 'RedLine',
    actors: ['Lazarus'],
    firstSeen: '2020-03',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'VPN/FTP clients', 'System info', 'Screen capture'],
  },
  {
    slug: 'lumma',
    name: 'LummaC2',
    aliases: ['Lumma Stealer', 'Lumma'],
    description:
      'LummaC2 is a C++ infostealer active since 2022, sold as malware-as-a-service. Notable for targeting 2FA browser extensions, cryptocurrency wallets, and credentials. Uses a C2 panel with Telegram exfiltration. Frequently updated with new evasion techniques.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.lumma_stealer',
    threatfoxTag: 'Lumma',
    actors: [],
    firstSeen: '2022-08',
    platforms: ['Windows'],
    capabilities: [
      'Browser credentials',
      '2FA extensions',
      'Cryptocurrency wallets',
      'Browser sessions',
      'System info',
    ],
  },
  {
    slug: 'vidar',
    name: 'Vidar',
    aliases: [],
    description:
      'Vidar is a .NET infostealer first observed in 2018, closely related to the Arkei stealer codebase. It targets a wide range of applications including browsers, cryptocurrency wallets, email clients, and messaging apps. Distributed through exploit kits, phishing, and malvertising campaigns.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.vidar',
    threatfoxTag: 'Vidar',
    actors: [],
    firstSeen: '2018-12',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'Email clients', 'Messaging apps', 'File grabber'],
  },
  {
    slug: 'stealc',
    name: 'StealC',
    aliases: [],
    description:
      'StealC is a commodity infostealer written in C, first spotted in February 2023. It targets browser credentials, cryptocurrency wallets, and desktop applications. Known for its C2 protocol using AES-encrypted JSON over WebSocket-like channels.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.stealc',
    threatfoxTag: 'StealC',
    actors: [],
    firstSeen: '2023-02',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'Desktop apps', 'System info', 'File grabber'],
  },
  {
    slug: 'raccoon',
    name: 'Raccoon Stealer',
    aliases: ['Raccoon', 'Monster Loader'],
    description:
      'Raccoon Stealer is a malware-as-a-service infostealer active since 2019. Written in C, it targets browser credentials, cryptocurrency wallets, email clients, and VPN configurations. The original author retired in 2022; v2 appeared in 2023 with a complete rewrite.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.raccoon_stealer',
    threatfoxTag: 'Raccoon',
    actors: [],
    firstSeen: '2019-04',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'Email clients', 'VPN configs', 'System info'],
  },
  {
    slug: 'rhadamanthys',
    name: 'Rhadamanthys',
    aliases: [],
    description:
      'Rhadamanthys is a sophisticated C++ infostealer first observed in 2022. It uses a modular plugin architecture for credential theft, cryptocurrency wallet extraction, and file exfiltration. Features anti-analysis techniques and a modern C2 panel with WebSocket communication.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.rhadamanthys',
    threatfoxTag: 'Rhadamanthys',
    actors: ['Kimsuky'],
    firstSeen: '2022-10',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'Plugin system', 'File exfiltration', 'Keylogging'],
  },
  {
    slug: 'azorult',
    name: 'AZORult',
    aliases: ['Azorult'],
    description:
      'AZORult is a .NET infostealer active since 2016, one of the oldest stealer families still in circulation. It targets browser credentials, cryptocurrency wallets, FTP clients, and email clients. Frequently used by Russian-speaking threat actors.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.azorult',
    threatfoxTag: 'AZORult',
    actors: ['APT29'],
    firstSeen: '2016-07',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'FTP clients', 'Email clients', 'Cookie theft'],
  },
  {
    slug: 'meta-stealer',
    name: 'Meta Stealer',
    aliases: ['META Stealer'],
    description:
      'Meta Stealer is a .NET infostealer active since 2022, sold on Telegram channels. Uses a Telegram bot for C2 exfiltration instead of traditional infrastructure. Targets browser credentials, cryptocurrency wallets, and file system data.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.meta_stealer',
    threatfoxTag: 'MetaStealer',
    actors: [],
    firstSeen: '2022-04',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'File grabber', 'Telegram C2', 'System info'],
  },
  {
    slug: 'risepro',
    name: 'RisePro',
    aliases: [],
    description:
      'RisePro is an infostealer written in C++, first observed in 2022. Distributed through PrivateLoader and other pay-per-install services. Targets browser credentials, cryptocurrency wallets, and桌面 applications.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.risepro',
    threatfoxTag: 'RisePro',
    actors: [],
    firstSeen: '2022-11',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'System info', 'File grabber'],
  },
  {
    slug: 'aurora-stealer',
    name: 'Aurora Stealer',
    aliases: ['Aurora'],
    description:
      'Aurora Stealer is a .NET-based infostealer active since 2021, offered as malware-as-a-service. It targets browser credentials, cryptocurrency wallets, and performs file collection. Uses encrypted C2 communication and has multiple evasion layers.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.aurora_stealer',
    threatfoxTag: 'AuroraStealer',
    actors: [],
    firstSeen: '2021-07',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'File collection', 'Evasion', 'Keylogging'],
  },
  {
    slug: 'mars-stealer',
    name: 'Mars Stealer',
    aliases: ['Mars'],
    description:
      'Mars Stealer is a C++ infostealer active since 2021, emerging after the original Raccoon Stealer author retired. Targets browser credentials, cryptocurrency wallets, and 2FA browser extensions. Sold on underground forums for $140.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.mars_stealer',
    threatfoxTag: 'MarsStealer',
    actors: [],
    firstSeen: '2021-09',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', '2FA extensions', 'System info'],
  },
  {
    slug: 'agenttesla',
    name: 'Agent Tesla',
    aliases: ['AgentTesla', 'Negas'],
    description:
      'Agent Tesla is a .NET-based RAT/stealer active since 2014, making it one of the longest-running stealers. Targets browser credentials, email clients, FTP clients, and VPN configurations. Known for its keylogging and screen capture capabilities.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.agent_tesla',
    threatfoxTag: 'AgentTesla',
    actors: ['TA544'],
    firstSeen: '2014-06',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Keylogging', 'Screen capture', 'Email clients', 'FTP/VPN theft'],
  },
  {
    slug: 'banshee',
    name: 'Banshee Stealer',
    aliases: ['Banshee'],
    description:
      'Banshee is an infostealer first observed in 2024, targeting both Windows and macOS systems. Targets browser credentials, cryptocurrency wallets, and password managers. Notable for its cross-platform capability, a rarer feature among infostealers.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.banshee_stealer',
    threatfoxTag: 'BansheeStealer',
    actors: [],
    firstSeen: '2024-01',
    platforms: ['Windows', 'macOS'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'Password managers', 'Cross-platform'],
  },
  {
    slug: 'atomic-stealer',
    name: 'Atomic Stealer',
    aliases: ['AMOS'],
    description:
      'Atomic macOS Stealer (AMOS) is a macOS-specific infostealer active since 2023. Targets iCloud Keychain, browser credentials, cryptocurrency wallets, and password managers. Distributed via fake browser updates and cracked software.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/mac.atomic_stealer',
    threatfoxTag: 'AMOS',
    actors: [],
    firstSeen: '2023-04',
    platforms: ['macOS'],
    capabilities: ['iCloud Keychain', 'Browser credentials', 'Cryptocurrency wallets', 'Password managers'],
  },
  {
    slug: 'phemedrone',
    name: 'Phemedrone Stealer',
    aliases: ['Phemedrone'],
    description:
      'Phemedrone is a C# infostealer first observed in 2023, often distributed via LNK files and Discord CDN links. Targets browser credentials, cryptocurrency wallets, and Discord tokens. Uses Telegram for C2 and data exfiltration.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.phemedrone_stealer',
    threatfoxTag: 'Phemedrone',
    actors: [],
    firstSeen: '2023-06',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'Discord tokens', 'Telegram C2', 'File grabber'],
  },
  {
    slug: 'snake-keylogger',
    name: 'Snake Keylogger',
    aliases: ['Snake', 'Turla Snake'],
    description:
      'Snake Keylogger is a .NET-based keylogger/stealer active since 2020. It logs keystrokes, steals browser credentials, and captures screenshots. Exfiltrates via SMTP (email), FTP, or Telegram. Widely distributed through phishing campaigns.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.snake_keylogger',
    threatfoxTag: 'SnakeKeylogger',
    actors: ['TA569'],
    firstSeen: '2020-01',
    platforms: ['Windows'],
    capabilities: ['Keylogging', 'Browser credentials', 'Screen capture', 'SMTP exfiltration', 'Clipboard monitoring'],
  },
  {
    slug: 'lokibot',
    name: 'LokiBot',
    aliases: ['Loki', 'Loki PWS'],
    description:
      'LokiBot is an information stealer that has been active since 2015. It targets browser credentials, FTP clients, cryptocurrency wallets, and email credentials. One of the first malware-as-a-service infostealers and a precursor to modern stealer families.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.lokibot',
    threatfoxTag: 'LokiBot',
    actors: ['TA544', 'TA505'],
    firstSeen: '2015-12',
    platforms: ['Windows'],
    capabilities: [
      'Browser credentials',
      'FTP clients',
      'Cryptocurrency wallets',
      'Email credentials',
      'Password recovery',
    ],
  },
  {
    slug: 'cryptbot',
    name: 'CryptBot',
    aliases: ['CryptBot Stealer'],
    description:
      'CryptBot is a .NET infostealer first observed in 2019, distributed via cracked software and fake downloads. Targets browser credentials, cryptocurrency wallets, and FTP clients. Known for its large-scale distribution networks and frequent builder updates.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.cryptbot',
    threatfoxTag: 'CryptBot',
    actors: ['TA544'],
    firstSeen: '2019-06',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'FTP clients', 'File grabber', 'System info'],
  },
  {
    slug: 'erbium',
    name: 'Erbium Stealer',
    aliases: ['Erbium'],
    description:
      'Erbium is a C++ infostealer active since 2022, sold on underground forums. Targets browser credentials, cryptocurrency wallets, 2FA browser extensions, and Discord tokens. Frequently distributed via loader services and malvertising.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.erbium_stealer',
    threatfoxTag: 'Erbium',
    actors: [],
    firstSeen: '2022-05',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', '2FA extensions', 'Discord tokens', 'System info'],
  },
  {
    slug: 'taurus-stealer',
    name: 'Taurus Stealer',
    aliases: ['Taurus'],
    description:
      'Taurus Stealer is a C++ infostealer first spotted in 2022, sold as malware-as-a-service. It targets browser credentials, cryptocurrency wallets, and gaming accounts. Uses Telegram for C2 exfiltration and receives frequent updates.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.taurus_stealer',
    threatfoxTag: 'TaurusStealer',
    actors: [],
    firstSeen: '2022-03',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'Gaming accounts', 'Telegram C2', 'System info'],
  },
  {
    slug: 'skuld',
    name: 'Skuld Stealer',
    aliases: ['Skuld'],
    description:
      'Skuld is a Go-based infostealer first observed in 2022, notable for being one of the first stealers written in Go. It targets browser credentials, cryptocurrency wallets, and Discord tokens. Uses Discord webhooks and Telegram for exfiltration.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.skuld_stealer',
    threatfoxTag: 'Skuld',
    actors: [],
    firstSeen: '2022-01',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'Discord tokens', 'Go-based', 'System info'],
  },
  {
    slug: 'nexus-stealer',
    name: 'Nexus Stealer',
    aliases: ['Nexus'],
    description:
      'Nexus Stealer is a .NET infostealer active since 2022, sold on Telegram channels. It targets browser credentials, cryptocurrency wallets, and VPN/FTP clients. Known for its clean UI and builder panel with configurable modules.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.nexus_stealer',
    threatfoxTag: 'NexusStealer',
    actors: [],
    firstSeen: '2022-07',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'VPN/FTP clients', 'Telegram C2', 'System info'],
  },
  {
    slug: 'kematian',
    name: 'Kematian Stealer',
    aliases: ['Kematian'],
    description:
      'Kematian is a .NET infostealer first observed in 2023, distributed through malvertising and fake download sites. It targets browser credentials, cryptocurrency wallets, and password managers. Uses AES-encrypted C2 communication.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.kematian_stealer',
    threatfoxTag: 'Kematian',
    actors: [],
    firstSeen: '2023-01',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'Password managers', 'AES C2', 'System info'],
  },
  {
    slug: 'ficker-stealer',
    name: 'Ficker Stealer',
    aliases: ['Ficker', 'FickerStealer'],
    description:
      'Ficker Stealer is a C++ infostealer active since 2021, sold on Russian-language underground forums. Targets browser credentials, cryptocurrency wallets, FTP clients, and email clients. Known for its high-configurability builder and frequent updates.',
    malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.ficker_stealer',
    threatfoxTag: 'FickerStealer',
    actors: [],
    firstSeen: '2021-11',
    platforms: ['Windows'],
    capabilities: ['Browser credentials', 'Cryptocurrency wallets', 'FTP clients', 'Email clients', 'System info'],
  },
];

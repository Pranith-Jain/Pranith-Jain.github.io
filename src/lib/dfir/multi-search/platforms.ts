// src/lib/dfir/multi-search/platforms.ts
//
// URL-template registry for the Multi-Search Launcher. Each platform
// declares a small set of named placeholders (e.g. {q}, {username},
// {email}, {domain}, {ip}, {phone}, {hash}, {cve}, {btc}, {url}) that
// get filled in from the input form. The page auto-detects the input
// kind (email, domain, IPv4, …) and pre-selects the matching platforms.
//
// Pure data — no React imports — so the module can be unit-tested with
// vitest and tree-shaken into per-page chunks.

export type Placeholder =
  | 'q' | 'username' | 'email' | 'domain' | 'ip'
  | 'phone' | 'hash' | 'cve' | 'btc' | 'url' | 'asn';

export type PlatformCategory =
  | 'web' | 'people' | 'email' | 'domain' | 'ip'
  | 'code' | 'social' | 'crypto' | 'leak' | 'threat';

export interface Platform {
  id: string;
  name: string;
  category: PlatformCategory;
  /** lucide-react icon name (resolved in the page). */
  icon: string;
  description: string;
  /** URL with optional {placeholder} tokens. */
  url: string;
  /** Placeholders that must be populated for the platform to be enabled. */
  required: Placeholder[];
  /** Optional. The auto-detect kinds that pre-select this platform. */
  autoMatch?: Array<
    'email' | 'domain' | 'ip' | 'phone' | 'hash'
    | 'cve' | 'btc' | 'url' | 'username'
  >;
}

export const CATEGORIES: Array<{
  id: PlatformCategory;
  label: string;
  icon: string;
}> = [
  { id: 'web', label: 'Web search', icon: 'Globe' },
  { id: 'people', label: 'People & usernames', icon: 'User' },
  { id: 'email', label: 'Email', icon: 'Mail' },
  { id: 'domain', label: 'Domain / URL', icon: 'Link2' },
  { id: 'ip', label: 'IP / ASN', icon: 'Network' },
  { id: 'code', label: 'Code & files', icon: 'Code2' },
  { id: 'social', label: 'Social', icon: 'AtSign' },
  { id: 'crypto', label: 'Crypto', icon: 'Bitcoin' },
  { id: 'leak', label: 'Breach / leak', icon: 'Database' },
  { id: 'threat', label: 'Threat intel', icon: 'Shield' },
];

export const PLATFORMS: Platform[] = [
  // ── Web search ───────────────────────────────────────────────
  { id: 'google', name: 'Google', category: 'web', icon: 'Search',
    description: 'General web search.',
    url: 'https://www.google.com/search?q={q}', required: ['q'] },
  { id: 'bing', name: 'Bing', category: 'web', icon: 'Search',
    description: 'Microsoft Bing.',
    url: 'https://www.bing.com/search?q={q}', required: ['q'] },
  { id: 'duckduckgo', name: 'DuckDuckGo', category: 'web', icon: 'Search',
    description: 'Privacy-respecting search.',
    url: 'https://duckduckgo.com/?q={q}', required: ['q'] },
  { id: 'brave', name: 'Brave Search', category: 'web', icon: 'Search',
    description: 'Independent web index.',
    url: 'https://search.brave.com/search?q={q}', required: ['q'] },
  { id: 'yandex', name: 'Yandex', category: 'web', icon: 'Search',
    description: 'Yandex (good for RU/CIS).',
    url: 'https://yandex.com/search/?text={q}', required: ['q'] },
  { id: 'startpage', name: 'Startpage', category: 'web', icon: 'Search',
    description: 'Google results, no tracking.',
    url: 'https://www.startpage.com/do/search?query={q}', required: ['q'] },
  { id: 'wikipedia', name: 'Wikipedia', category: 'web', icon: 'BookOpen',
    description: 'Encyclopaedia lookup.',
    url: 'https://en.wikipedia.org/w/index.php?search={q}', required: ['q'] },

  // ── People & usernames ────────────────────────────────────────
  { id: 'github-user', name: 'GitHub user', category: 'people', icon: 'Github',
    description: 'Profile, repos, gists.',
    url: 'https://github.com/{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'gitlab-user', name: 'GitLab user', category: 'people', icon: 'GitBranch',
    description: 'GitLab profile.',
    url: 'https://gitlab.com/{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'twitter-user', name: 'X (Twitter)', category: 'people', icon: 'AtSign',
    description: 'X / Twitter timeline.',
    url: 'https://twitter.com/{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'reddit-user', name: 'Reddit user', category: 'people', icon: 'MessageSquare',
    description: 'Reddit posts & comments.',
    url: 'https://www.reddit.com/user/{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'instagram', name: 'Instagram', category: 'people', icon: 'Instagram',
    description: 'Instagram profile.',
    url: 'https://www.instagram.com/{username}/', required: ['username'],
    autoMatch: ['username'] },
  { id: 'tiktok', name: 'TikTok', category: 'people', icon: 'Music',
    description: 'TikTok profile.',
    url: 'https://www.tiktok.com/@{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'linkedin', name: 'LinkedIn', category: 'people', icon: 'Briefcase',
    description: 'LinkedIn public profile.',
    url: 'https://www.linkedin.com/in/{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'mastodon', name: 'Mastodon', category: 'people', icon: 'Hash',
    description: 'Federated Mastodon profile.',
    url: 'https://mastodon.social/@{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'namechk', name: 'Namechk', category: 'people', icon: 'UserCheck',
    description: 'Username-availability across 100+ sites.',
    url: 'https://namechk.com/{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'whatsmyname', name: 'WhatsMyName', category: 'people', icon: 'Fingerprint',
    description: 'Web-scale username enumeration.',
    url: 'https://whatsmyname.app/?q={username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'gravatar', name: 'Gravatar', category: 'people', icon: 'UserCircle',
    description: 'Gravatar (email-linked).',
    url: 'https://en.gravatar.com/{email}', required: ['email'],
    autoMatch: ['email'] },
  { id: 'aboutme', name: 'About.me', category: 'people', icon: 'User',
    description: 'Self-profile pages.',
    url: 'https://about.me/{username}', required: ['username'],
    autoMatch: ['username'] },

  // ── Email ─────────────────────────────────────────────────────
  { id: 'hunter', name: 'Hunter.io', category: 'email', icon: 'Mail',
    description: 'Find professional emails by name / domain.',
    url: 'https://hunter.io/email-verifier/{email}', required: ['email'],
    autoMatch: ['email'] },
  { id: 'emailrep', name: 'EmailRep', category: 'email', icon: 'Mail',
    description: 'Email reputation & presence lookup.',
    url: 'https://emailrep.io/{email}', required: ['email'],
    autoMatch: ['email'] },
  { id: 'epieos', name: 'Epieos', category: 'email', icon: 'User',
    description: 'Gravatar + social + profile-pic OSINT.',
    url: 'https://epieos.com/?q={email}', required: ['email'],
    autoMatch: ['email'] },
  { id: 'haveibeenpwned', name: 'HaveIBeenPwned', category: 'email', icon: 'AlertTriangle',
    description: 'Email breach lookup.',
    url: 'https://haveibeenpwned.com/unifiedsearch/{email}', required: ['email'],
    autoMatch: ['email'] },
  { id: 'dehashed', name: 'Dehashed', category: 'email', icon: 'Database',
    description: 'Credential-search engine.',
    url: 'https://dehashed.com/search?query={email}', required: ['email'],
    autoMatch: ['email'] },
  { id: 'intelx', name: 'Intelligence X', category: 'email', icon: 'Search',
    description: 'Selector across leaks / paste / dark web.',
    url: 'https://intelx.io/?s={email}', required: ['email'],
    autoMatch: ['email'] },

  // ── Domain / URL ──────────────────────────────────────────────
  { id: 'whois', name: 'WHOIS (whois.com)', category: 'domain', icon: 'Globe',
    description: 'WHOIS record lookup.',
    url: 'https://www.whois.com/whois/{domain}', required: ['domain'],
    autoMatch: ['domain'] },
  { id: 'rdap', name: 'RDAP (rdap.org)', category: 'domain', icon: 'Globe',
    description: 'IANA RDAP lookup.',
    url: 'https://client.rdap.org/?domain={domain}', required: ['domain'],
    autoMatch: ['domain'] },
  { id: 'dnsdumpster', name: 'DNSDumpster', category: 'domain', icon: 'Server',
    description: 'Passive DNS / subdomains.',
    url: 'https://dnsdumpster.com/?target={domain}', required: ['domain'],
    autoMatch: ['domain'] },
  { id: 'crtsh', name: 'crt.sh', category: 'domain', icon: 'FileSearch',
    description: 'Certificate-transparency log search.',
    url: 'https://crt.sh/?q={domain}', required: ['domain'],
    autoMatch: ['domain'] },
  { id: 'urlscan', name: 'urlscan.io', category: 'domain', icon: 'ScanLine',
    description: 'Public scan results for a URL.',
    url: 'https://urlscan.io/search/#{url}', required: ['url'],
    autoMatch: ['url'] },
  { id: 'wayback', name: 'Wayback Machine', category: 'domain', icon: 'History',
    description: 'Historical snapshots of a URL.',
    url: 'https://web.archive.org/web/*/{url}', required: ['url'],
    autoMatch: ['url'] },
  { id: 'virustotal-url', name: 'VirusTotal (URL)', category: 'domain', icon: 'Shield',
    description: 'Multi-engine URL scan.',
    url: 'https://www.virustotal.com/gui/url/{url}', required: ['url'],
    autoMatch: ['url'] },
  { id: 'securitytrails', name: 'SecurityTrails', category: 'domain', icon: 'Map',
    description: 'Historical DNS / WHOIS explorer.',
    url: 'https://securitytrails.com/domain/{domain}/dns', required: ['domain'],
    autoMatch: ['domain'] },
  { id: 'shodan-cert', name: 'Shodan Cert', category: 'domain', icon: 'Search',
    description: 'Shodan certificate search.',
    url: 'https://www.shodan.io/search?query=ssl.cert.subject.cn%3A{domain}',
    required: ['domain'], autoMatch: ['domain'] },
  { id: 'builtwith', name: 'BuiltWith', category: 'domain', icon: 'Layers',
    description: 'Tech-stack profiler.',
    url: 'https://builtwith.com/{domain}', required: ['domain'],
    autoMatch: ['domain'] },

  // ── IP / ASN ──────────────────────────────────────────────────
  { id: 'shodan-ip', name: 'Shodan', category: 'ip', icon: 'Radar',
    description: 'Internet-connected device search.',
    url: 'https://www.shodan.io/host/{ip}', required: ['ip'],
    autoMatch: ['ip'] },
  { id: 'censys-ip', name: 'Censys', category: 'ip', icon: 'ScanSearch',
    description: 'Internet-wide scan search.',
    url: 'https://search.censys.io/hosts/{ip}', required: ['ip'],
    autoMatch: ['ip'] },
  { id: 'ipinfo', name: 'IPinfo', category: 'ip', icon: 'Info',
    description: 'IP geolocation & ASN data.',
    url: 'https://ipinfo.io/{ip}', required: ['ip'],
    autoMatch: ['ip'] },
  { id: 'abuseipdb', name: 'AbuseIPDB', category: 'ip', icon: 'ShieldAlert',
    description: 'Community IP-abuse reports.',
    url: 'https://www.abuseipdb.com/check/{ip}', required: ['ip'],
    autoMatch: ['ip'] },
  { id: 'greynoise', name: 'GreyNoise', category: 'ip', icon: 'Volume2',
    description: 'Internet-scanner classification.',
    url: 'https://viz.greynoise.io/ip/{ip}', required: ['ip'],
    autoMatch: ['ip'] },
  { id: 'bgpview', name: 'BGPView', category: 'ip', icon: 'Network',
    description: 'ASN / prefix / peering.',
    url: 'https://bgpview.io/{ip}', required: ['ip'],
    autoMatch: ['ip'] },
  { id: 'arin', name: 'ARIN Whois', category: 'ip', icon: 'Server',
    description: 'ARIN registry search.',
    url: 'https://search.arin.net/rdap/?query={ip}', required: ['ip'],
    autoMatch: ['ip'] },

  // ── Code & files ──────────────────────────────────────────────
  { id: 'github-code', name: 'GitHub code', category: 'code', icon: 'Github',
    description: 'Public code search across GitHub.',
    url: 'https://github.com/search?q={q}&type=code', required: ['q'] },
  { id: 'grepapp', name: 'grep.app', category: 'code', icon: 'Code2',
    description: 'Regex search across public GitHub repos.',
    url: 'https://grep.app/search?q={q}', required: ['q'] },
  { id: 'sourcegraph', name: 'Sourcegraph', category: 'code', icon: 'SearchCode',
    description: 'Cross-repo code search.',
    url: 'https://sourcegraph.com/search?q={q}', required: ['q'] },
  { id: 'virustotal-file', name: 'VirusTotal (file)', category: 'code', icon: 'Shield',
    description: 'Hash lookup against multi-engine scanners.',
    url: 'https://www.virustotal.com/gui/file/{hash}', required: ['hash'],
    autoMatch: ['hash'] },
  { id: 'malwarebazaar', name: 'MalwareBazaar', category: 'code', icon: 'Bug',
    description: 'Malware-sample hash lookup.',
    url: 'https://bazaar.abuse.ch/browse.php?search={hash}', required: ['hash'],
    autoMatch: ['hash'] },
  { id: 'hybridanalysis', name: 'Hybrid Analysis', category: 'code', icon: 'FlaskConical',
    description: 'Free sandbox detonation lookup.',
    url: 'https://www.hybrid-analysis.com/search?query={hash}', required: ['hash'],
    autoMatch: ['hash'] },
  { id: 'pulsedive', name: 'Pulsedive', category: 'code', icon: 'Activity',
    description: 'Indicator enrichment.',
    url: 'https://pulsedive.com/indicator/?ioc={q}', required: ['q'] },

  // ── Social ────────────────────────────────────────────────────
  { id: 'facebook', name: 'Facebook', category: 'social', icon: 'Facebook',
    description: 'Facebook profile.',
    url: 'https://www.facebook.com/{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'youtube', name: 'YouTube', category: 'social', icon: 'Youtube',
    description: 'YouTube channel / video search.',
    url: 'https://www.youtube.com/results?search_query={q}', required: ['q'] },
  { id: 'tiktok-search', name: 'TikTok search', category: 'social', icon: 'Music',
    description: 'TikTok video search.',
    url: 'https://www.tiktok.com/search?q={q}', required: ['q'] },
  { id: 'twitch', name: 'Twitch', category: 'social', icon: 'Twitch',
    description: 'Twitch channel.',
    url: 'https://www.twitch.tv/{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'steam', name: 'Steam', category: 'social', icon: 'Gamepad2',
    description: 'Steam community profile.',
    url: 'https://steamcommunity.com/id/{username}', required: ['username'],
    autoMatch: ['username'] },
  { id: 'pinterest', name: 'Pinterest', category: 'social', icon: 'Image',
    description: 'Pinterest user.',
    url: 'https://www.pinterest.com/{username}/', required: ['username'],
    autoMatch: ['username'] },

  // ── Crypto ────────────────────────────────────────────────────
  { id: 'blockchain-btc', name: 'Blockchain.com', category: 'crypto', icon: 'Bitcoin',
    description: 'BTC address explorer.',
    url: 'https://www.blockchain.com/btc/address/{btc}', required: ['btc'],
    autoMatch: ['btc'] },
  { id: 'etherscan', name: 'Etherscan', category: 'crypto', icon: 'Coins',
    description: 'ETH address explorer.',
    url: 'https://etherscan.io/address/{btc}', required: ['btc'],
    autoMatch: ['btc'] },
  { id: 'blockchair', name: 'Blockchair', category: 'crypto', icon: 'Coins',
    description: 'Multi-chain explorer.',
    url: 'https://blockchair.com/search?q={btc}', required: ['btc'],
    autoMatch: ['btc'] },
  { id: 'bitcoinabuse', name: 'BitcoinAbuse', category: 'crypto', icon: 'AlertOctagon',
    description: 'BTC abuse-report database.',
    url: 'https://www.bitcoinabuse.com/reports/{btc}', required: ['btc'],
    autoMatch: ['btc'] },

  // ── Breach / leak ─────────────────────────────────────────────
  { id: 'leaklookup', name: 'Leak-Lookup', category: 'leak', icon: 'Database',
    description: 'Multi-source breach search.',
    url: 'https://leak-lookup.com/search?q={q}', required: ['q'] },
  { id: 'scylla', name: 'Scylla.sh', category: 'leak', icon: 'Database',
    description: 'Free combo-list & breach lookup.',
    url: 'https://scylla.sh/search?q={q}', required: ['q'] },

  // ── Threat intel ──────────────────────────────────────────────
  { id: 'otx', name: 'AlienVault OTX', category: 'threat', icon: 'Eye',
    description: 'Open threat-exchange indicator search.',
    url: 'https://otx.alienvault.com/indicator/{q}', required: ['q'] },
  { id: 'cve-mitre', name: 'CVE MITRE', category: 'threat', icon: 'Bug',
    description: 'CVE record lookup.',
    url: 'https://cve.mitre.org/cgi-bin/cvename.cgi?name={cve}', required: ['cve'],
    autoMatch: ['cve'] },
  { id: 'nvd', name: 'NVD CVE', category: 'threat', icon: 'Shield',
    description: 'NIST NVD CVE record.',
    url: 'https://nvd.nist.gov/vuln/detail/{cve}', required: ['cve'],
    autoMatch: ['cve'] },
  { id: 'cisa-kev', name: 'CISA KEV', category: 'threat', icon: 'AlertTriangle',
    description: 'Known exploited vulnerabilities catalog.',
    url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext={cve}',
    required: ['cve'], autoMatch: ['cve'] },
  { id: 'feodo', name: 'Feodo Tracker', category: 'threat', icon: 'Crosshair',
    description: 'Botnet C2 IP blocklist.',
    url: 'https://feodotracker.abuse.ch/browse/host/{ip}/', required: ['ip'],
    autoMatch: ['ip'] },
  { id: 'threatfox', name: 'ThreatFox', category: 'threat', icon: 'Crosshair',
    description: 'IOC database (abuse.ch).',
    url: 'https://threatfox.abuse.ch/browse/?search={q}', required: ['q'] },
  { id: 'vxtwitter', name: 'VX-Underground', category: 'threat', icon: 'Archive',
    description: 'Malware-sample archive.',
    url: 'https://www.vx-underground.org/#search={q}', required: ['q'] },
];

/* ─── Auto-detect helpers ───────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)([a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63})+)(\/.*)?$/;
const MD5_RE = /^[a-fA-F0-9]{32}$/;
const SHA1_RE = /^[a-fA-F0-9]{40}$/;
const SHA256_RE = /^[a-fA-F0-9]{64}$/;
const CVE_RE = /^CVE-\d{4}-\d{4,7}$/i;
const BTC_RE = /^(bc1[0-9a-z]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[a-fA-F0-9]{40})$/;
const PHONE_RE = /^\+?[0-9 .\-()]{7,20}$/;
const URL_RE = /^https?:\/\//i;

export type DetectedKind =
  | 'email' | 'ip' | 'domain' | 'url' | 'hash'
  | 'cve' | 'btc' | 'phone' | 'username' | 'q';

/** Best-effort kind detection for a single input. Order matters: IPv4
 *  is checked before "domain" because 8.8.8.8 would otherwise look like a
 *  dot-separated string. Hash lengths are tried 32/40/64. */
export function detectInputKind(input: string): DetectedKind {
  const v = input.trim();
  if (!v) return 'q';
  if (EMAIL_RE.test(v)) return 'email';
  if (CVE_RE.test(v)) return 'cve';
  if (BTC_RE.test(v)) return 'btc';
  if (IPV4_RE.test(v)) return 'ip';
  if (MD5_RE.test(v) || SHA1_RE.test(v) || SHA256_RE.test(v)) return 'hash';
  if (URL_RE.test(v)) return 'url';
  if (DOMAIN_RE.test(v)) return 'domain';
  if (PHONE_RE.test(v) && v.replace(/\D/g, '').length >= 7) return 'phone';
  if (IPV6_RE.test(v) && v.includes(':')) return 'ip';
  // short handle-like text → username so people-search auto-fires.
  // Require length < 32 to keep MD5/SHA1/SHA256 hashes from being
  // mis-classified as usernames.
  if (/^[a-zA-Z0-9._-]{2,31}$/.test(v) && !v.includes(' ')) return 'username';
  return 'q';
}

/** Fill the URL template with input + any extras. Unfilled placeholders
 *  are left as `{name}` so the user can see what's missing rather than
 *  silently opening a broken URL. */
export function fillTemplate(
  template: string,
  inputs: Partial<Record<Placeholder, string>>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = inputs[key as Placeholder];
    if (!v) return match;
    return encodeURIComponent(v);
  });
}

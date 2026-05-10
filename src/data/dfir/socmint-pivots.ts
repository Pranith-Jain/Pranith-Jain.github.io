/**
 * SOCMINT pivot catalogue — URL generators that take an
 * email/domain/username/handle/full-name and produce a categorised
 * list of OSINT lookup links. URL generation only — no scraping.
 *
 * Each pivot is plain template substitution. Always opens in a new tab.
 *
 * Categories:
 *   - breach        — Have I Been Pwned, XposedOrNot, Dehashed, etc.
 *   - b2b           — ZoomInfo, Apollo, Hunter, Snov, Lusha, RocketReach,
 *                      ContactOut, LeadIQ, PeopleDataLabs, Clearbit/HubSpot
 *   - social        — LinkedIn, Twitter/X, Facebook, Instagram, Reddit,
 *                      Mastodon, Bluesky, Telegram
 *   - dev           — GitHub commit search, GitLab, Bitbucket, npm/PyPI
 *   - paste         — paste-site Google dorks
 *   - dorks         — Google / Bing / DuckDuckGo / Yandex composite
 *   - identity      — Gravatar, Pipl (paid), Spokeo, ThatsThem, BeenVerified
 *   - infra         — DNS / WHOIS / Shodan / Censys / SecurityTrails for domains
 *
 * `appliesTo` controls which input kinds each pivot accepts.
 */

export type PivotCategory = 'breach' | 'b2b' | 'social' | 'dev' | 'paste' | 'dorks' | 'identity' | 'infra';
export type PivotInputKind = 'email' | 'domain' | 'username' | 'handle' | 'name';

export interface PivotLink {
  category: PivotCategory;
  appliesTo: PivotInputKind[];
  label: string;
  blurb: string;
  /** Build the lookup URL from the input value. */
  build: (value: string) => string;
  /** True if this is a paid service (UI shows a $ tag). */
  paid?: boolean;
  /** True if signup is required even for the free tier. */
  signupRequired?: boolean;
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────── */

const enc = (s: string) => encodeURIComponent(s);
const domainOf = (email: string): string => {
  const idx = email.lastIndexOf('@');
  return idx >= 0 ? email.slice(idx + 1) : email;
};
const handleOf = (s: string): string => s.replace(/^@/, '').trim();

/** Gravatar takes a normalised lowercase MD5 of the email. We compute
 *  this client-side via SubtleCrypto in the page layer; here we just
 *  pass the email through the public lookup-by-email URL which Gravatar
 *  redirects on. */
const gravatarUrl = (email: string) => `https://gravatar.com/${enc(email.toLowerCase().trim())}`;

/* ──────────────────────────────────────────────────────────────────
 * Catalogue
 * ────────────────────────────────────────────────────────────────── */

export const PIVOTS: PivotLink[] = [
  /* ── breach ─────────────────────────────────────────────────── */
  {
    category: 'breach',
    appliesTo: ['email'],
    label: 'Have I Been Pwned',
    blurb: 'Email-level breach check (free, public)',
    build: (v) => `https://haveibeenpwned.com/account/${enc(v)}`,
  },
  {
    category: 'breach',
    appliesTo: ['email', 'domain'],
    label: 'XposedOrNot',
    blurb: 'Open-source breach lookup (free, no signup)',
    build: (v) => `https://xposedornot.com/check_email/${enc(v.includes('@') ? v : `*@${v}`)}`,
  },
  {
    category: 'breach',
    appliesTo: ['email'],
    label: 'Dehashed',
    blurb: 'Paid breach search (large dataset)',
    build: (v) => `https://www.dehashed.com/search?query=${enc(v)}`,
    paid: true,
    signupRequired: true,
  },
  {
    category: 'breach',
    appliesTo: ['email', 'domain'],
    label: 'IntelligenceX',
    blurb: 'Paste & breach search (free tier limited)',
    build: (v) => `https://intelx.io/?s=${enc(v)}`,
    signupRequired: true,
  },
  {
    category: 'breach',
    appliesTo: ['email', 'domain'],
    label: 'LeakCheck',
    blurb: 'Breach search (paid, has free demo)',
    build: (v) => `https://leakcheck.io/lookup/${enc(v)}`,
    paid: true,
  },
  {
    category: 'breach',
    appliesTo: ['email'],
    label: 'EmailRep',
    blurb: 'Sender reputation, breach hits, social presence',
    build: (v) => `https://emailrep.io/${enc(v)}`,
  },

  /* ── b2b / data-broker ──────────────────────────────────────── */
  {
    category: 'b2b',
    appliesTo: ['domain'],
    label: 'Hunter.io',
    blurb: 'Find email addresses for a domain (free tier)',
    build: (v) => `https://hunter.io/search/${enc(v)}`,
    signupRequired: true,
  },
  {
    category: 'b2b',
    appliesTo: ['domain', 'name'],
    label: 'Apollo.io',
    blurb: 'B2B contact database — search by company or name',
    build: (v) => `https://app.apollo.io/#/companies?qOrganizationName=${enc(v)}`,
    signupRequired: true,
  },
  {
    category: 'b2b',
    appliesTo: ['domain', 'name'],
    label: 'ZoomInfo',
    blurb: 'Enterprise B2B contact + firmographic data',
    build: (v) => `https://www.zoominfo.com/companies-search?companyName=${enc(v)}`,
    paid: true,
    signupRequired: true,
  },
  {
    category: 'b2b',
    appliesTo: ['domain'],
    label: 'Snov.io',
    blurb: 'Email finder by domain (free tier)',
    build: (v) => `https://app.snov.io/leads-finder?domain=${enc(v)}`,
    signupRequired: true,
  },
  {
    category: 'b2b',
    appliesTo: ['domain', 'name', 'email'],
    label: 'RocketReach',
    blurb: 'Person + company contact info',
    build: (v) => `https://rocketreach.co/search?searchTerms=${enc(v)}`,
    paid: true,
    signupRequired: true,
  },
  {
    category: 'b2b',
    appliesTo: ['domain', 'name', 'email'],
    label: 'Lusha',
    blurb: 'Sales-intel contact platform',
    build: (v) => `https://www.lusha.com/search/?q=${enc(v)}`,
    paid: true,
    signupRequired: true,
  },
  {
    category: 'b2b',
    appliesTo: ['domain'],
    label: 'ContactOut',
    blurb: 'Email + phone for LinkedIn profiles',
    build: (v) => `https://contactout.com/search?q=${enc(v)}`,
    paid: true,
    signupRequired: true,
  },
  {
    category: 'b2b',
    appliesTo: ['domain', 'email'],
    label: 'LeadIQ',
    blurb: 'B2B contact discovery',
    build: (v) => `https://login.leadiq.com/search?q=${enc(v)}`,
    paid: true,
    signupRequired: true,
  },
  {
    category: 'b2b',
    appliesTo: ['domain'],
    label: 'Clearbit / HubSpot',
    blurb: 'Domain/company intel (now part of HubSpot)',
    build: (v) => `https://clearbit.com/logo/${enc(v)}`,
  },
  {
    category: 'b2b',
    appliesTo: ['domain', 'email'],
    label: 'People Data Labs',
    blurb: 'Person + company enrichment API (developer search)',
    build: (v) => `https://docs.peopledatalabs.com/docs/sandbox-search?q=${enc(v)}`,
    signupRequired: true,
  },

  /* ── social ────────────────────────────────────────────────── */
  {
    category: 'social',
    appliesTo: ['name', 'username', 'email'],
    label: 'LinkedIn search',
    blurb: 'Search results for the term (no scraping)',
    build: (v) => `https://www.linkedin.com/search/results/all/?keywords=${enc(v)}`,
  },
  {
    category: 'social',
    appliesTo: ['email', 'domain'],
    label: 'LinkedIn @domain dork',
    blurb: 'Google site-search for LinkedIn profiles tied to a domain',
    build: (v) =>
      `https://www.google.com/search?q=${enc(`site:linkedin.com/in "${v.includes('@') ? domainOf(v) : v}"`)}`,
  },
  {
    category: 'social',
    appliesTo: ['username', 'handle'],
    label: 'Twitter / X profile',
    blurb: 'Direct profile URL (verify exists)',
    build: (v) => `https://twitter.com/${enc(handleOf(v))}`,
  },
  {
    category: 'social',
    appliesTo: ['email', 'name', 'username'],
    label: 'Twitter advanced search',
    blurb: 'X/Twitter advanced search by mention',
    build: (v) => `https://twitter.com/search?q=${enc(v)}&src=typed_query`,
  },
  {
    category: 'social',
    appliesTo: ['username', 'handle'],
    label: 'Reddit user',
    blurb: 'Profile + post history',
    build: (v) => `https://www.reddit.com/user/${enc(handleOf(v))}/`,
  },
  {
    category: 'social',
    appliesTo: ['username', 'handle'],
    label: 'Instagram profile',
    blurb: 'Direct profile URL',
    build: (v) => `https://www.instagram.com/${enc(handleOf(v))}/`,
  },
  {
    category: 'social',
    appliesTo: ['username', 'handle'],
    label: 'Facebook profile',
    blurb: 'Direct profile URL (private profiles 404)',
    build: (v) => `https://www.facebook.com/${enc(handleOf(v))}`,
  },
  {
    category: 'social',
    appliesTo: ['username', 'handle'],
    label: 'TikTok profile',
    blurb: 'Direct profile URL',
    build: (v) => `https://www.tiktok.com/@${enc(handleOf(v))}`,
  },
  {
    category: 'social',
    appliesTo: ['username', 'handle'],
    label: 'Mastodon search',
    blurb: 'Federated profile search across instances',
    build: (v) => `https://mastodon.social/search?q=${enc(handleOf(v))}`,
  },
  {
    category: 'social',
    appliesTo: ['username', 'handle'],
    label: 'Bluesky profile',
    blurb: 'Direct profile URL',
    build: (v) => `https://bsky.app/profile/${enc(handleOf(v))}`,
  },
  {
    category: 'social',
    appliesTo: ['username', 'handle'],
    label: 'Telegram channel',
    blurb: 'Public channel/user URL',
    build: (v) => `https://t.me/${enc(handleOf(v))}`,
  },
  {
    category: 'social',
    appliesTo: ['username', 'handle', 'email', 'name'],
    label: 'Sherlock-style multi-site',
    blurb: 'Open WhatsMyName search across 50+ sites',
    build: (v) => `https://whatsmyname.app/?q=${enc(handleOf(v))}`,
  },

  /* ── dev / code ─────────────────────────────────────────────── */
  {
    category: 'dev',
    appliesTo: ['username', 'handle'],
    label: 'GitHub profile',
    blurb: 'User or org page',
    build: (v) => `https://github.com/${enc(handleOf(v))}`,
  },
  {
    category: 'dev',
    appliesTo: ['email'],
    label: 'GitHub commit-author search',
    blurb: 'Find commits authored from this email address',
    build: (v) => `https://github.com/search?q=author-email%3A${enc(v)}&type=commits`,
  },
  {
    category: 'dev',
    appliesTo: ['domain'],
    label: 'GitHub @domain commit search',
    blurb: 'Find commits authored from any address at this domain',
    build: (v) => `https://github.com/search?q=author-email%3A%2A${enc('@' + v)}&type=commits`,
  },
  {
    category: 'dev',
    appliesTo: ['username', 'handle', 'email'],
    label: 'GitLab user search',
    blurb: 'Search GitLab for matching users / commits',
    build: (v) => `https://gitlab.com/search?search=${enc(v)}`,
  },
  {
    category: 'dev',
    appliesTo: ['username', 'handle'],
    label: 'npm author',
    blurb: 'Packages published under this handle',
    build: (v) => `https://www.npmjs.com/~${enc(handleOf(v))}`,
  },
  {
    category: 'dev',
    appliesTo: ['username', 'handle'],
    label: 'PyPI maintainer',
    blurb: 'PyPI search for this maintainer',
    build: (v) => `https://pypi.org/search/?q=${enc(handleOf(v))}`,
  },
  {
    category: 'dev',
    appliesTo: ['username', 'handle', 'name'],
    label: 'Stack Overflow user',
    blurb: 'Stack Overflow user search',
    build: (v) => `https://stackoverflow.com/users?tab=Reputation&filter=all&search=${enc(v)}`,
  },

  /* ── paste-site dorks ──────────────────────────────────────── */
  {
    category: 'paste',
    appliesTo: ['email', 'domain'],
    label: 'Pastebin Google dork',
    blurb: 'Surface mentions in pastebin.com archives',
    build: (v) => `https://www.google.com/search?q=${enc(`site:pastebin.com "${v}"`)}`,
  },
  {
    category: 'paste',
    appliesTo: ['email', 'domain'],
    label: 'GhostBin / Ghostbin Google dork',
    blurb: 'Surface mentions in ghostbin.com archives',
    build: (v) => `https://www.google.com/search?q=${enc(`site:ghostbin.com "${v}"`)}`,
  },
  {
    category: 'paste',
    appliesTo: ['email', 'domain'],
    label: 'PSBDMP archive',
    blurb: 'Pastebin dump archive search (limited)',
    build: (v) => `https://psbdmp.ws/api/search/${enc(v)}`,
  },
  {
    category: 'paste',
    appliesTo: ['email', 'domain'],
    label: 'Multi paste-site dork',
    blurb: 'Pastebin / paste.ee / hastebin / privatebin / rentry combined',
    build: (v) =>
      `https://www.google.com/search?q=${enc(`("${v}") (site:pastebin.com OR site:paste.ee OR site:hastebin.com OR site:rentry.co OR site:privatebin.net)`)}`,
  },

  /* ── search dorks ──────────────────────────────────────────── */
  {
    category: 'dorks',
    appliesTo: ['email', 'domain', 'username', 'handle', 'name'],
    label: 'Google exact-phrase',
    blurb: 'General-purpose Google quoted search',
    build: (v) => `https://www.google.com/search?q=${enc(`"${v}"`)}`,
  },
  {
    category: 'dorks',
    appliesTo: ['email', 'domain', 'username', 'handle', 'name'],
    label: 'Bing search',
    blurb: 'Independent index — Microsoft Bing',
    build: (v) => `https://www.bing.com/search?q=${enc(`"${v}"`)}`,
  },
  {
    category: 'dorks',
    appliesTo: ['email', 'domain', 'username', 'handle', 'name'],
    label: 'DuckDuckGo',
    blurb: 'Privacy-first search',
    build: (v) => `https://duckduckgo.com/?q=${enc(`"${v}"`)}`,
  },
  {
    category: 'dorks',
    appliesTo: ['email', 'domain', 'username', 'handle', 'name'],
    label: 'Yandex search',
    blurb: 'Russian index — often catches different content',
    build: (v) => `https://yandex.com/search/?text=${enc(`"${v}"`)}`,
  },
  {
    category: 'dorks',
    appliesTo: ['email', 'domain'],
    label: 'Wayback Machine',
    blurb: 'All archived snapshots that mention this string',
    build: (v) => `https://web.archive.org/web/*/${enc(v)}`,
  },

  /* ── identity / people-search ──────────────────────────────── */
  {
    category: 'identity',
    appliesTo: ['email'],
    label: 'Gravatar profile',
    blurb: 'Globally Recognised Avatar — also exposes some user metadata',
    build: gravatarUrl,
  },
  {
    category: 'identity',
    appliesTo: ['email', 'name'],
    label: 'Pipl',
    blurb: 'People-search aggregator',
    build: (v) => `https://pipl.com/search/?q=${enc(v)}`,
    paid: true,
    signupRequired: true,
  },
  {
    category: 'identity',
    appliesTo: ['name'],
    label: 'Spokeo',
    blurb: 'US-focused people search',
    build: (v) => `https://www.spokeo.com/${enc(v.replace(/\s+/g, '-'))}`,
    paid: true,
  },
  {
    category: 'identity',
    appliesTo: ['name'],
    label: 'ThatsThem',
    blurb: 'Free reverse lookup (US)',
    build: (v) => `https://thatsthem.com/name/${enc(v.replace(/\s+/g, '-'))}`,
  },
  {
    category: 'identity',
    appliesTo: ['name'],
    label: 'BeenVerified',
    blurb: 'Public-records aggregator (US)',
    build: (v) => `https://www.beenverified.com/people/${enc(v.replace(/\s+/g, '-'))}/`,
    paid: true,
  },

  /* ── infra (domain only) ───────────────────────────────────── */
  {
    category: 'infra',
    appliesTo: ['domain'],
    label: 'Domain inspector',
    blurb: 'In-portfolio: SPF / DKIM / DMARC / MX / TXT',
    build: (v) => `/dfir/domain?d=${enc(v)}`,
  },
  {
    category: 'infra',
    appliesTo: ['domain'],
    label: 'WHOIS',
    blurb: 'Registration history via whoisxmlapi',
    build: (v) => `https://www.whoisxmlapi.com/whois/?domain=${enc(v)}`,
  },
  {
    category: 'infra',
    appliesTo: ['domain'],
    label: 'Shodan',
    blurb: 'Internet-exposed services on this domain',
    build: (v) => `https://www.shodan.io/search?query=hostname:${enc(v)}`,
  },
  {
    category: 'infra',
    appliesTo: ['domain'],
    label: 'Censys',
    blurb: 'Certificate + service search',
    build: (v) => `https://search.censys.io/search?q=${enc(v)}&resource=hosts`,
  },
  {
    category: 'infra',
    appliesTo: ['domain'],
    label: 'SecurityTrails',
    blurb: 'DNS history + subdomains',
    build: (v) => `https://securitytrails.com/domain/${enc(v)}/dns`,
  },
  {
    category: 'infra',
    appliesTo: ['domain'],
    label: 'crt.sh',
    blurb: 'Certificate Transparency log search',
    build: (v) => `https://crt.sh/?q=${enc(v)}`,
  },
];

/* ──────────────────────────────────────────────────────────────────
 * Input-kind detection
 * ────────────────────────────────────────────────────────────────── */

const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const RE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const RE_HANDLE = /^@[A-Za-z0-9._-]{1,40}$/;
const RE_USERNAME = /^[A-Za-z0-9._-]{2,40}$/;

export function detectKind(input: string): PivotInputKind {
  const v = input.trim();
  if (RE_EMAIL.test(v)) return 'email';
  if (RE_DOMAIN.test(v)) return 'domain';
  if (RE_HANDLE.test(v)) return 'handle';
  if (RE_USERNAME.test(v)) return 'username';
  return 'name';
}

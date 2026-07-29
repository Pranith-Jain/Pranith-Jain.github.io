/**
 * Exploratores username OSINT pivot catalog.
 *
 * Sourced from the Exploratores project (sosintops.github.io/Exploratores,
 * v3.4.1) — a curated SOCMINT link board. Each entry is a URL template with a
 * `{username}` placeholder that the board substitutes client-side. These are
 * *manual* pivots: unlike the automated CORS checks in username-pivots.ts,
 * they open the target service's own search/profile page in a new tab so an
 * investigator can confirm a match by hand.
 *
 * A couple of templates carry extra placeholders:
 *   - `{enddate}`  → filled with today's ISO date (SMAT VK search window).
 *   - no placeholder at all (WhatsMyName) → the tool is used interactively.
 */

export type ExploratoresCategory =
  'social' | 'financial' | 'gaming' | 'availability' | 'general-web' | 'security' | 'public-records' | 'russia';

export interface ExploratoresLink {
  id: string;
  name: string;
  /** URL template. `{username}` (and optionally `{enddate}`) are substituted. */
  template: string;
}

export interface ExploratoresCategoryDef {
  id: ExploratoresCategory;
  label: string;
  blurb: string;
  links: ExploratoresLink[];
}

export const EXPLORATORES_VERSION = '3.4.1';

export const EXPLORATORES_CATEGORIES: ExploratoresCategoryDef[] = [
  {
    id: 'social',
    label: 'Social Networks & Messaging',
    blurb: 'Profile + search pivots across the major social platforms.',
    links: [
      {
        id: 'fb-posts',
        name: 'Facebook Posts Search',
        template: 'https://www.facebook.com/search/posts/?q={username}',
      },
      { id: 'fb-profile', name: 'Facebook Profile', template: 'https://facebook.com/{username}' },
      {
        id: 'fb-direct',
        name: 'Facebook Search (Direct)',
        template: 'https://www.facebook.com/search/top?q={username}',
      },
      {
        id: 'fb-google',
        name: 'Facebook Search (Google)',
        template: 'https://www.google.com/search?q=site%3Afacebook.com+"{username}"',
      },
      { id: 'ghunt', name: 'Ghunt (Google Account)', template: 'https://gmail-osint.activetk.jp/{username}' },
      { id: 'github', name: 'GitHub User', template: 'https://github.com/{username}' },
      { id: 'gravatar', name: 'Gravatar', template: 'https://en.gravatar.com/{username}' },
      { id: 'ig-profile', name: 'Instagram Profile', template: 'https://instagram.com/{username}' },
      {
        id: 'ig-google',
        name: 'Instagram Search (Google)',
        template: 'https://www.google.com/search?q=site%3Ainstagram.com+"{username}"',
      },
      { id: 'ig-direct', name: 'Instagram User (Direct)', template: 'https://www.instagram.com/{username}/' },
      { id: 'kik', name: 'Kik User', template: 'https://kik.me/{username}' },
      {
        id: 'linkedin',
        name: 'LinkedIn Keyword Search',
        template: 'https://www.linkedin.com/search/results/all/?keywords={username}',
      },
      { id: 'linktree', name: 'LinkTree', template: 'https://linktr.ee/{username}' },
      { id: 'medium', name: 'Medium', template: 'https://medium.com/@{username}' },
      { id: 'mewe', name: 'MeWe User', template: 'https://mewe.com/i/{username}' },
      { id: 'naijaplanet', name: 'NaijaPlanet User', template: 'https://naijaplanet.com/{username}' },
      { id: 'reddit', name: 'Reddit Profile', template: 'https://www.reddit.com/user/{username}' },
      { id: 'snapchat', name: 'Snapchat', template: 'https://www.snapchat.com/s/{username}' },
      {
        id: 'telegago',
        name: 'Telegago (Telegram Search)',
        template: 'https://cse.google.com/cse?&cx=006368593537057042503:efxu7xprihg#gsc.tab=0&gsc.q={username}',
      },
      { id: 'telegram', name: 'Telegram User', template: 'https://t.me/{username}' },
      { id: 'tiktok', name: 'TikTok Profile', template: 'https://www.tiktok.com/@{username}' },
      { id: 'tinder', name: 'Tinder', template: 'https://tinder.com/@{username}' },
      { id: 'tumblr', name: 'Tumblr', template: 'https://{username}.tumblr.com' },
      { id: 'x-profile', name: 'X Profile', template: 'https://x.com/{username}' },
      {
        id: 'x-google',
        name: 'X Search (Google)',
        template: 'https://www.google.com/search?q=site%3Atwitter.com+"{username}"',
      },
      {
        id: 'x-direct',
        name: 'X User Search (Direct)',
        template: 'https://twitter.com/search?q=({username})&src=typed_query&f=user',
      },
    ],
  },
  {
    id: 'financial',
    label: 'Financial & Crypto',
    blurb: 'Payment profiles and crypto-entity lookups tied to a handle.',
    links: [
      {
        id: 'arkham',
        name: 'Arkham Entity',
        template: 'https://platform.arkhamintelligence.com/explorer/entity/{username}',
      },
      { id: 'cashapp', name: 'CashApp User', template: 'https://cash.app/${username}' },
      { id: 'paypalme', name: 'PayPalMe User', template: 'https://www.paypal.com/paypalme/{username}' },
      { id: 'remitano', name: 'Remitano Profile', template: 'https://remitano.com/btc/ng/profile/{username}' },
      { id: 'venmo', name: 'Venmo User', template: 'https://account.venmo.com/u/{username}' },
    ],
  },
  {
    id: 'gaming',
    label: 'Gaming',
    blurb: 'Gamertag and gaming-community pivots.',
    links: [
      {
        id: 'steam-community',
        name: 'Steam Community Search',
        template: 'https://steamcommunity.com/search/users/#text={username}',
      },
      { id: 'steamid', name: 'SteamID Lookup', template: 'https://steamid.uk/url/{username}' },
      { id: 'xbox', name: 'Xbox Gamertag Search', template: 'https://xboxgamertag.com/search/{username}' },
    ],
  },
  {
    id: 'availability',
    label: 'Availability',
    blurb: 'Bulk username-availability checkers — a fast existence sweep.',
    links: [
      { id: 'checkistan', name: 'Checkistan', template: 'https://usernamechecker.checkistan.com/#{username}' },
      { id: 'instantusername', name: 'InstantUser', template: 'https://instantusername.com/?q={username}' },
      { id: 'namechck', name: 'NameChck', template: 'https://namechk.com/namechk-plugin-search-results/?n={username}' },
      { id: 'namechecker', name: 'NameChecker', template: 'https://www.namechecker.org/#{username}' },
      { id: 'namevine', name: 'NameVine', template: 'https://namevine.com/#/{username}' },
    ],
  },
  {
    id: 'general-web',
    label: 'General Web & Username Search',
    blurb: 'Search-engine dorks and dedicated username-search engines.',
    links: [
      {
        id: 'bing-email',
        name: 'Bing Email Search (from Username)',
        template: 'https://www.bing.com/search?q="{username}"',
      },
      {
        id: 'email-search',
        name: 'Email Search (Google)',
        template: 'https://www.google.com/search?q="{username}@gmail.com" OR "{username}@yahoo.com"',
      },
      { id: 'google-exact', name: 'Google (Exact Username)', template: 'https://www.google.com/search?q="{username}"' },
      {
        id: 'google-strict',
        name: 'Google Search (Strict)',
        template: 'https://www.google.com/search?q=+"{username}"',
      },
      { id: 'idcrawl', name: 'ID Crawl', template: 'https://www.idcrawl.com/u/{username}' },
      { id: 'profilediscover', name: 'ProfileDiscover', template: 'https://profilediscover.com/{username}' },
      {
        id: 'socialsearcher',
        name: 'SocialSearcher',
        template: 'https://www.social-searcher.com/search-users/?q6={username}',
      },
      {
        id: 'usersearch',
        name: 'UserSearch.org',
        template: 'https://usersearch.org/results_normal.php?URL_username={username}',
      },
      { id: 'whatsmyname', name: 'WhatsMyName App', template: 'https://whatsmyname.app/' },
      { id: 'yandex', name: 'Yandex', template: 'https://yandex.com/search/?text="{username}"' },
    ],
  },
  {
    id: 'security',
    label: 'Security, Breaches & Pastes',
    blurb: 'Breach, paste, and threat-intel lookups for a handle.',
    links: [
      {
        id: 'alienvault',
        name: 'AlienVault Indicator',
        template: 'https://otx.alienvault.com/browse/global/indicators?q={username}',
      },
      { id: 'dehashed', name: 'Dehashed (Breaches)', template: 'https://dehashed.com/search?query="{username}"' },
      {
        id: 'dehashed-emails',
        name: 'Dehashed Emails (Breaches)',
        template:
          'https://dehashed.com/search?query="{username}@gmail.com" OR "{username}@yahoo.com" OR "{username}@hotmail.com"',
      },
      { id: 'krebs', name: 'Krebs Security Search', template: 'https://krebsonsecurity.com/?s={username}' },
      { id: 'pastebin', name: 'Pastebin User', template: 'https://pastebin.com/u/{username}' },
      { id: 'psbdmp', name: 'PSBDMP (Pastes)', template: 'https://psbdmp.ws/api/search/{username}' },
      {
        id: 'riskiq',
        name: 'RiskIQ Trackers Search',
        template: 'https://community.riskiq.com/search/trackers?query={username}',
      },
      {
        id: 'stopforumspam',
        name: 'Stop Forum Spam Search',
        template: 'https://www.stopforumspam.com/search/{username}',
      },
    ],
  },
  {
    id: 'public-records',
    label: 'Public Records & Domain Research',
    blurb: 'WHOIS, sanctions, and public-record pivots.',
    links: [
      { id: 'asa', name: 'ASA Search', template: 'https://www.asa.org.uk/search.html?q={username}' },
      {
        id: 'domaintools',
        name: 'DomainTools WHOIS',
        template:
          'https://reversewhois.domaintools.com/?refine#q=%5B%5B%5B%22whois%22%2C%222%22%2C%22{username}%22%5D%5D%5D&historical=1',
      },
      { id: 'google-groups', name: 'Google Groups Search', template: 'https://groups.google.com/search?q={username}' },
      { id: 'occrp', name: 'OCCRP Aleph Search', template: 'https://aleph.occrp.org/search?limit=30&q={username}' },
      {
        id: 'ofac',
        name: 'OFAC Sanctions Search',
        template: 'https://ofac.treasury.gov/recent-actions?search_api_fulltext={username}',
      },
    ],
  },
  {
    id: 'russia',
    label: 'Russia',
    blurb: 'RU-platform pivots — VK, Mail.Ru, and Russian-language archives.',
    links: [
      { id: 'ru-checko', name: 'Checko (RU)', template: 'https://checko.ru/search?query={username}' },
      { id: 'ru-mailru', name: 'Search Mail.Ru Social', template: 'https://go.mail.ru/search_social?q={username}' },
      {
        id: 'ru-smat-vk',
        name: 'SMAT VK Search',
        template:
          'https://www.smat-app.com/search?searchTerm={username}&startDate=2000-06-01&endDate={enddate}&websites=vk&numberOf=10&interval=day&limit=1000&changepoint=false',
      },
      { id: 'ru-vk-direct', name: 'VK Search', template: 'https://vk.com/search/{username}' },
      {
        id: 'ru-vk-google',
        name: 'VK (Google Search)',
        template: 'https://www.google.com/search?q=site%3Avk.com+"{username}"',
      },
      { id: 'ru-vkme', name: 'VK.me Profile', template: 'https://vk.me/{username}' },
      {
        id: 'ru-webarchive',
        name: 'WebArchive (RU Media)',
        template: 'https://web.archive.org/russian-independent-media/search/{username}',
      },
    ],
  },
];

export const EXPLORATORES_TOTAL = EXPLORATORES_CATEGORIES.reduce((n, c) => n + c.links.length, 0);

/**
 * Resolve a template for a given username. `{username}` is URI-encoded;
 * `{enddate}` becomes today's ISO date. Literal `"` search operators are kept
 * (the browser percent-encodes them on navigation).
 */
export function buildExploratoresUrl(link: ExploratoresLink, username: string): string {
  const today = new Date().toISOString().split('T')[0] ?? '';
  return link.template.replace(/\{username\}/g, encodeURIComponent(username)).replace(/\{enddate\}/g, today);
}

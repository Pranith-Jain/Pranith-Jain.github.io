/**
 * Curated OSINT Framework directory.
 *
 * ~70 hand-picked tools and sources across the categories an investigator
 * actually walks through during a phishing / BEC / fraud / threat-actor
 * investigation. Inspired by osintframework.com but kept tighter — every
 * entry should be currently live and reachable from a normal browser.
 *
 * Each entry declares whether it's free, free-with-account, or paid; that
 * lets the page filter for the genuinely free subset (the typical bar for
 * a first-pass open-source investigation).
 */

export type Pricing = 'free' | 'free-account' | 'paid' | 'freemium';

export type Category =
  | 'search-engines'
  | 'social-media'
  | 'username-search'
  | 'email-recon'
  | 'phone-recon'
  | 'domain-ip'
  | 'image-video'
  | 'geolocation'
  | 'people-search'
  | 'company-corp'
  | 'archive-wayback'
  | 'dark-web-cti'
  | 'cryptocurrency'
  | 'transport-tracking'
  | 'public-records';

export interface Entry {
  id: string;
  name: string;
  url: string;
  category: Category;
  pricing: Pricing;
  description: string;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  'search-engines': 'Search engines',
  'social-media': 'Social media',
  'username-search': 'Username search',
  'email-recon': 'Email recon',
  'phone-recon': 'Phone-number recon',
  'domain-ip': 'Domain / IP / network',
  'image-video': 'Image & video',
  geolocation: 'Geolocation',
  'people-search': 'People search',
  'company-corp': 'Company / corporate',
  'archive-wayback': 'Archive / Wayback',
  'dark-web-cti': 'Dark web / CTI',
  cryptocurrency: 'Cryptocurrency',
  'transport-tracking': 'Transport / tracking',
  'public-records': 'Public records',
};

export const ENTRIES: Entry[] = [
  // ── Search engines ────────────────────────────────────────────────────
  {
    id: 'google-dorks',
    name: 'Google Hacking Database (GHDB)',
    url: 'https://www.exploit-db.com/google-hacking-database',
    category: 'search-engines',
    pricing: 'free',
    description: 'Curated Google dorks for finding exposed assets and information leaks.',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com',
    category: 'search-engines',
    pricing: 'free',
    description: "Privacy-respecting search; useful for second-opinion queries against Google's personalised results.",
  },
  {
    id: 'yandex',
    name: 'Yandex',
    url: 'https://yandex.com',
    category: 'search-engines',
    pricing: 'free',
    description: 'Strong on RU/CIS content + reverse image search that often finds matches Google misses.',
  },
  {
    id: 'baidu',
    name: 'Baidu',
    url: 'https://www.baidu.com',
    category: 'search-engines',
    pricing: 'free',
    description: 'Primary search index for the China region; complements Google when investigating PRC targets.',
  },
  {
    id: 'million-short',
    name: 'Million Short',
    url: 'https://millionshort.com',
    category: 'search-engines',
    pricing: 'free',
    description: 'Search excluding the most-popular sites — surfaces long-tail / niche pages.',
  },

  // ── Social media ──────────────────────────────────────────────────────
  {
    id: 'twitter-advanced',
    name: 'X / Twitter Advanced Search',
    url: 'https://x.com/search-advanced',
    category: 'social-media',
    pricing: 'free-account',
    description: 'Date-bounded, account-bounded, language-filtered tweet search. Login wall increasingly restrictive.',
  },
  {
    id: 'social-bearing',
    name: 'Social Bearing',
    url: 'https://socialbearing.com',
    category: 'social-media',
    pricing: 'freemium',
    description: 'Twitter analytics, hashtag search, location-bounded queries.',
  },
  {
    id: 'mastodon-search',
    name: 'Mastodon — search.f-droid.org instance',
    url: 'https://search.fedi.tools',
    category: 'social-media',
    pricing: 'free',
    description: 'Cross-instance Mastodon search (Fedi Tools).',
  },
  {
    id: 'bsky-search',
    name: 'Bluesky search',
    url: 'https://bsky.app/search',
    category: 'social-media',
    pricing: 'free-account',
    description: 'Native Bluesky search — author + keyword + date filters.',
  },
  {
    id: 'reddit-search',
    name: 'Reddit advanced search',
    url: 'https://www.reddit.com/search/',
    category: 'social-media',
    pricing: 'free',
    description: 'Subreddit-bounded keyword search; pair with site: dorks for archived comments.',
  },

  // ── Username search ──────────────────────────────────────────────────
  {
    id: 'sherlock',
    name: 'Sherlock',
    url: 'https://github.com/sherlock-project/sherlock',
    category: 'username-search',
    pricing: 'free',
    description: 'CLI tool that hunts a username across 400+ services. The reference implementation.',
  },
  {
    id: 'whatsmyname',
    name: 'WhatsMyName.app',
    url: 'https://whatsmyname.app',
    category: 'username-search',
    pricing: 'free',
    description: 'Web-based username search across hundreds of sites with categorised filters.',
  },
  {
    id: 'namechk',
    name: 'Namechk',
    url: 'https://namechk.com',
    category: 'username-search',
    pricing: 'free',
    description: 'Quick brand-availability scan across ~100 social/domain destinations.',
  },

  // ── Email recon ──────────────────────────────────────────────────────
  {
    id: 'hibp',
    name: 'Have I Been Pwned',
    url: 'https://haveibeenpwned.com',
    category: 'email-recon',
    pricing: 'free',
    description: 'Authoritative breach-disclosure database; check email and password exposure.',
  },
  {
    id: 'emailrep',
    name: 'EmailRep',
    url: 'https://emailrep.io',
    category: 'email-recon',
    pricing: 'freemium',
    description: 'Reputation lookup for an email address — domain age, SMTP signals, social presence.',
  },
  {
    id: 'hunter',
    name: 'Hunter.io',
    url: 'https://hunter.io',
    category: 'email-recon',
    pricing: 'freemium',
    description: 'Email finder + verifier; surfaces patterns and known emails for a given domain.',
  },
  {
    id: 'epieos',
    name: 'Epieos',
    url: 'https://epieos.com',
    category: 'email-recon',
    pricing: 'freemium',
    description: 'Email lookup pivoting to Google account ID, public reviews, reverse phone-to-email.',
  },
  {
    id: 'gravatar',
    name: 'Gravatar',
    url: 'https://gravatar.com',
    category: 'email-recon',
    pricing: 'free',
    description: 'Public Gravatar profile by MD5 of an email — confirms registration + sometimes reveals real name.',
  },

  // ── Phone-number recon ───────────────────────────────────────────────
  {
    id: 'truecaller',
    name: 'Truecaller',
    url: 'https://www.truecaller.com',
    category: 'phone-recon',
    pricing: 'free-account',
    description: 'Crowdsourced caller-ID; useful when the number is in their database.',
  },
  {
    id: 'numverify',
    name: 'NumLookup',
    url: 'https://www.numlookup.com',
    category: 'phone-recon',
    pricing: 'free',
    description: 'Phone-number validation, carrier, location.',
  },
  {
    id: 'libphonenumber',
    name: 'libphonenumber demo',
    url: 'https://libphonenumber.appspot.com',
    category: 'phone-recon',
    pricing: 'free',
    description: "Google's libphonenumber demo — country, region, carrier, line type.",
  },

  // ── Domain / IP / network ────────────────────────────────────────────
  {
    id: 'whoisxml',
    name: 'WhoisXML',
    url: 'https://www.whoisxmlapi.com',
    category: 'domain-ip',
    pricing: 'freemium',
    description: 'Domain registration data, historical WHOIS, reverse-WHOIS pivots.',
  },
  {
    id: 'viewdns',
    name: 'ViewDNS.info',
    url: 'https://viewdns.info',
    category: 'domain-ip',
    pricing: 'free',
    description: 'Aggregate of WHOIS, DNS, port scan, IP history, reverse IP, MX.',
  },
  {
    id: 'censys',
    name: 'Censys Search',
    url: 'https://search.censys.io',
    category: 'domain-ip',
    pricing: 'freemium',
    description: 'Internet-wide scan data — hosts, certificates, services. Strong CT-log-based pivots.',
  },
  {
    id: 'shodan',
    name: 'Shodan',
    url: 'https://www.shodan.io',
    category: 'domain-ip',
    pricing: 'freemium',
    description: 'Service-banner search engine; classic for finding exposed devices and services.',
  },
  {
    id: 'urlscan',
    name: 'urlscan.io',
    url: 'https://urlscan.io',
    category: 'domain-ip',
    pricing: 'free-account',
    description: 'Sandboxed URL submission with screenshot, DOM, network calls. Public corpus is searchable.',
  },
  {
    id: 'crtsh',
    name: 'crt.sh',
    url: 'https://crt.sh',
    category: 'domain-ip',
    pricing: 'free',
    description: 'Certificate Transparency log search — find subdomains via cert issuance.',
  },
  {
    id: 'dnsdumpster',
    name: 'DNSdumpster',
    url: 'https://dnsdumpster.com',
    category: 'domain-ip',
    pricing: 'free',
    description: 'Quick subdomain + DNS-record visualisation for a domain.',
  },
  {
    id: 'asn-bgp',
    name: 'BGP.tools',
    url: 'https://bgp.tools',
    category: 'domain-ip',
    pricing: 'free',
    description: 'ASN / prefix / peering visualisations for incident-network attribution.',
  },
  {
    id: 'spur',
    name: 'spur.us',
    url: 'https://spur.us',
    category: 'domain-ip',
    pricing: 'paid',
    description: 'Anonymous-traffic intelligence (residential proxies, VPN, Tor, infrastructure tagging).',
  },

  // ── Image & video ────────────────────────────────────────────────────
  {
    id: 'tineye',
    name: 'TinEye',
    url: 'https://tineye.com',
    category: 'image-video',
    pricing: 'freemium',
    description: 'Reverse image search; strong on first-known-occurrence + crop-tolerance.',
  },
  {
    id: 'google-lens',
    name: 'Google Lens',
    url: 'https://lens.google.com',
    category: 'image-video',
    pricing: 'free',
    description: 'Largest reverse-image index. Drop an image to find similar across the web.',
  },
  {
    id: 'yandex-images',
    name: 'Yandex Images',
    url: 'https://yandex.com/images',
    category: 'image-video',
    pricing: 'free',
    description: 'Best-in-class for face matching — finds matches Google routinely misses.',
  },
  {
    id: 'invid-verify',
    name: 'InVID Verification Plugin',
    url: 'https://www.invid-project.eu/tools-and-services/invid-verification-plugin/',
    category: 'image-video',
    pricing: 'free',
    description: 'Browser extension for video / image verification — keyframe extraction, EXIF, reverse search.',
  },
  {
    id: 'forensically',
    name: 'Forensically',
    url: 'https://29a.ch/photo-forensics/',
    category: 'image-video',
    pricing: 'free',
    description: 'In-browser image-forensics suite — ELA, clone detection, magnifier, geo metadata.',
  },

  // ── Geolocation ──────────────────────────────────────────────────────
  {
    id: 'geospy',
    name: 'GeoSpy.ai',
    url: 'https://geospy.ai',
    category: 'geolocation',
    pricing: 'freemium',
    description: 'AI-driven photo geolocation — guesses location from visual cues.',
  },
  {
    id: 'osm-overpass',
    name: 'OpenStreetMap (Overpass)',
    url: 'https://overpass-turbo.eu',
    category: 'geolocation',
    pricing: 'free',
    description: 'Query OpenStreetMap with Overpass QL — find every petrol station within X metres of a coord.',
  },
  {
    id: 'mapchecking',
    name: 'MapChecking',
    url: 'https://www.mapchecking.com',
    category: 'geolocation',
    pricing: 'free',
    description: 'Crowd-density estimation for events / protests / footage.',
  },
  {
    id: 'sun-calc',
    name: 'SunCalc',
    url: 'https://www.suncalc.org',
    category: 'geolocation',
    pricing: 'free',
    description:
      "Sun azimuth + elevation by location and time — confirm a photo's claimed time/place by shadow direction.",
  },

  // ── People search ────────────────────────────────────────────────────
  {
    id: 'pipl',
    name: 'Pipl',
    url: 'https://pipl.com',
    category: 'people-search',
    pricing: 'paid',
    description: 'Identity-resolution database; fee but high-quality cross-source pivots.',
  },
  {
    id: 'thatsthem',
    name: 'ThatsThem',
    url: 'https://thatsthem.com',
    category: 'people-search',
    pricing: 'free',
    description: 'US-focused free people-search — name → phone, address, family.',
  },
  {
    id: 'fastpeoplesearch',
    name: 'FastPeopleSearch',
    url: 'https://www.fastpeoplesearch.com',
    category: 'people-search',
    pricing: 'free',
    description: 'US directory aggregator; has opt-out for the privacy-conscious.',
  },

  // ── Company / corporate ──────────────────────────────────────────────
  {
    id: 'opencorporates',
    name: 'OpenCorporates',
    url: 'https://opencorporates.com',
    category: 'company-corp',
    pricing: 'free',
    description: 'Largest open registry of companies — ownership, filings, jurisdiction crossover.',
  },
  {
    id: 'gleif',
    name: 'GLEIF / LEI Search',
    url: 'https://search.gleif.org',
    category: 'company-corp',
    pricing: 'free',
    description: 'Global Legal Entity Identifier registry — verify legal-entity identity across borders.',
  },
  {
    id: 'sec-edgar',
    name: 'SEC EDGAR',
    url: 'https://www.sec.gov/edgar/searchedgar/companysearch',
    category: 'company-corp',
    pricing: 'free',
    description: 'Public company filings (US). 8-K incident disclosures land here.',
  },
  {
    id: 'companies-house',
    name: 'Companies House (UK)',
    url: 'https://find-and-update.company-information.service.gov.uk',
    category: 'company-corp',
    pricing: 'free',
    description: 'UK company / officer / address search. Free API on top.',
  },
  {
    id: 'mca-india',
    name: 'MCA India',
    url: 'https://www.mca.gov.in/content/mca/global/en/home.html',
    category: 'company-corp',
    pricing: 'free-account',
    description: 'Indian Ministry of Corporate Affairs — directors, ROC filings, charges.',
  },

  // ── Archive / Wayback ────────────────────────────────────────────────
  {
    id: 'wayback',
    name: 'Internet Archive Wayback Machine',
    url: 'https://web.archive.org',
    category: 'archive-wayback',
    pricing: 'free',
    description: 'The de-facto web archive. Save Page Now + CDX API for snapshots.',
  },
  {
    id: 'archive-today',
    name: 'archive.today',
    url: 'https://archive.ph',
    category: 'archive-wayback',
    pricing: 'free',
    description: 'On-demand snapshot service that tends to capture pages Wayback declines.',
  },
  {
    id: 'cachedview',
    name: 'CachedView',
    url: 'https://cachedview.com',
    category: 'archive-wayback',
    pricing: 'free',
    description: 'Aggregator for cached versions across Google, Bing, archive.today, Wayback.',
  },

  // ── Dark web / CTI ───────────────────────────────────────────────────
  {
    id: 'ransomwatch',
    name: 'Ransomlook.io',
    url: 'https://www.ransomlook.io',
    category: 'dark-web-cti',
    pricing: 'free',
    description: 'Active leak-site tracker with API + RSS. See also /dfir/darkweb on this site.',
  },
  {
    id: 'ransomwarelive',
    name: 'Ransomware.live',
    url: 'https://www.ransomware.live',
    category: 'dark-web-cti',
    pricing: 'free',
    description: 'Live ransomware victim and group tracker.',
  },
  {
    id: 'intelx',
    name: 'IntelligenceX',
    url: 'https://intelx.io',
    category: 'dark-web-cti',
    pricing: 'freemium',
    description: 'Search engine across darknet, leaks, paste sites. Limited free tier.',
  },
  {
    id: 'deepdarkcti',
    name: 'deepdarkCTI',
    url: 'https://github.com/fastfire/deepdarkCTI',
    category: 'dark-web-cti',
    pricing: 'free',
    description: 'Continuously updated repository of dark web and CTI sources, by fastfire.',
  },
  {
    id: 'malshare',
    name: 'MalShare',
    url: 'https://malshare.com',
    category: 'dark-web-cti',
    pricing: 'free-account',
    description: 'Free malware repository; researcher-oriented sample sharing.',
  },

  // ── Cryptocurrency ───────────────────────────────────────────────────
  {
    id: 'blockchain',
    name: 'Blockchain.com Explorer',
    url: 'https://www.blockchain.com/explorer',
    category: 'cryptocurrency',
    pricing: 'free',
    description: 'BTC / ETH / BCH explorer with address tracking.',
  },
  {
    id: 'oxt',
    name: 'OXT (Bitcoin)',
    url: 'https://oxt.me',
    category: 'cryptocurrency',
    pricing: 'free',
    description: 'Bitcoin transaction graph + entity clustering — strong for tracing flows.',
  },
  {
    id: 'arkham',
    name: 'Arkham Intelligence',
    url: 'https://www.arkhamintelligence.com',
    category: 'cryptocurrency',
    pricing: 'free-account',
    description: 'On-chain analytics + entity attribution across BTC, ETH, and many EVM chains.',
  },
  {
    id: 'breadcrumbs',
    name: 'Breadcrumbs.app',
    url: 'https://www.breadcrumbs.app',
    category: 'cryptocurrency',
    pricing: 'freemium',
    description: 'Visual crypto-flow tracing across multiple chains.',
  },

  // ── Transport / tracking ─────────────────────────────────────────────
  {
    id: 'flightradar24',
    name: 'Flightradar24',
    url: 'https://www.flightradar24.com',
    category: 'transport-tracking',
    pricing: 'freemium',
    description: 'Live flight tracking + historical playback (paid for full history).',
  },
  {
    id: 'adsbexchange',
    name: 'ADS-B Exchange',
    url: 'https://globe.adsbexchange.com',
    category: 'transport-tracking',
    pricing: 'free',
    description: 'Unfiltered ADS-B feed including aircraft other trackers redact.',
  },
  {
    id: 'marinetraffic',
    name: 'MarineTraffic',
    url: 'https://www.marinetraffic.com',
    category: 'transport-tracking',
    pricing: 'freemium',
    description: 'AIS-based vessel tracking — port calls, voyages, ownership.',
  },

  // ── Public records ───────────────────────────────────────────────────
  {
    id: 'court-listener',
    name: 'CourtListener',
    url: 'https://www.courtlistener.com',
    category: 'public-records',
    pricing: 'free',
    description: 'Free index of US federal and many state court filings (RECAP archive).',
  },
  {
    id: 'pacer',
    name: 'PACER',
    url: 'https://pacer.uscourts.gov',
    category: 'public-records',
    pricing: 'paid',
    description: 'Official US federal court records — pay-per-page, but authoritative.',
  },
  {
    id: 'judyrecords',
    name: 'judyrecords',
    url: 'https://www.judyrecords.com',
    category: 'public-records',
    pricing: 'free',
    description: 'Free US case-law / case-record search across many state systems.',
  },
];

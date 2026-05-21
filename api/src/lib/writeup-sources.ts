/**
 * Writeup sources. This is the "tool to add a writeup source" — every entry
 * here gets aggregated into the unified /writeups page via /api/v1/writeups.
 *
 * To add a new platform you publish on:
 *   - Medium:    { kind: 'medium',   handle: '@yourhandle' }
 *   - dev.to:    { kind: 'devto',    handle: 'yourhandle' }
 *   - Hashnode:  { kind: 'hashnode', host:   'yoursubdomain.hashnode.dev' }
 *   - Personal RSS: { kind: 'rss',   url:    'https://yourblog.com/feed.xml',
 *                     label: 'Your Blog' }
 *   - Curated one-off: { kind: 'manual', title, url, source, published, description }
 *
 * The aggregator dedupes by URL, sorts newest-first, and caps the response.
 */

/**
 * Source tier. `signal` marks a tight curated set of elite vendor labs /
 * independent research outlets that publish low-volume, high-depth pieces
 * — the kind of source an analyst always reads when it ships. The
 * `/threatintel/signal` page filters to just these; the broader
 * `/threatintel/writeups` page surfaces everything. Defaults to
 * `firehose` (treated as the full ecosystem cut).
 */
export type SourceTier = 'signal' | 'firehose';

type WriteupSourceFields = { tier?: SourceTier };

export type WriteupSourceSpec =
  | ({ kind: 'medium'; handle: string; label?: string } & WriteupSourceFields)
  | ({ kind: 'devto'; handle: string; label?: string } & WriteupSourceFields)
  | ({ kind: 'hashnode'; host: string; label?: string } & WriteupSourceFields)
  | ({ kind: 'rss'; url: string; label: string } & WriteupSourceFields)
  | ({
      kind: 'manual';
      title: string;
      url: string;
      source: string;
      /** ISO 8601 publish date. */
      published: string;
      description?: string;
      tags?: string[];
    } & WriteupSourceFields);

export const WRITEUP_SOURCES: WriteupSourceSpec[] = [
  // ─── IR + threat-research blogs (independent + Mandiant-style) ─────────
  // Signal tier — low-volume, high-depth. These are the sources an analyst
  // reads every time they ship. `/threatintel/signal` filters down to just
  // this set; the broader `/threatintel/writeups` includes the firehose.
  { kind: 'rss', url: 'https://thedfirreport.com/feed/', label: 'The DFIR Report', tier: 'signal' },
  { kind: 'rss', url: 'https://www.threatsignal.in/rss.xml', label: 'ThreatSignal Research', tier: 'signal' },
  {
    kind: 'rss',
    url: 'https://blog.bushidotoken.net/feeds/posts/default?alt=rss',
    label: 'BushidoToken',
    tier: 'signal',
  },
  { kind: 'rss', url: 'https://doublepulsar.com/feed', label: 'DoublePulsar (Kevin Beaumont)', tier: 'signal' },
  { kind: 'rss', url: 'https://krebsonsecurity.com/feed/', label: 'Krebs on Security' },
  { kind: 'rss', url: 'https://research.openanalysis.net/feed.xml', label: 'OpenAnalysis Lab', tier: 'signal' },
  { kind: 'rss', url: 'https://opensourcemalware.com/rss.xml', label: 'OpenSourceMalware', tier: 'signal' },

  // ─── Vendor research labs ─────────────────────────────────────────────
  { kind: 'rss', url: 'https://www.sentinelone.com/labs/feed/', label: 'SentinelLabs', tier: 'signal' },
  { kind: 'rss', url: 'https://www.crowdstrike.com/blog/feed/', label: 'CrowdStrike' },
  { kind: 'rss', url: 'https://unit42.paloaltonetworks.com/feed/', label: 'Unit 42 (Palo Alto)', tier: 'signal' },
  { kind: 'rss', url: 'https://research.checkpoint.com/feed/', label: 'Check Point Research', tier: 'signal' },
  // Google TI (Mandiant) dropped 2026-05-11. cloud.google.com/blog/topics/threat-intelligence/rss
  // returns HTML rather than an RSS feed when called server-side. Re-add when a working URL surfaces.
  { kind: 'rss', url: 'https://www.welivesecurity.com/feed/', label: 'WeLiveSecurity (ESET)' },
  { kind: 'rss', url: 'https://www.huntress.com/blog/rss.xml', label: 'Huntress', tier: 'signal' },
  { kind: 'rss', url: 'https://research.eye.security/feed', label: 'Eye Security', tier: 'signal' },
  { kind: 'rss', url: 'https://www.recordedfuture.com/feed/', label: 'Recorded Future' },
  { kind: 'rss', url: 'https://blog.exodusintel.com/feed', label: 'Exodus Intelligence', tier: 'signal' },
  // Added 2026-05-21 after live probing — all four return application/rss+xml
  // with 10+ items and consistently publish technical security research.
  { kind: 'rss', url: 'https://redcanary.com/feed/', label: 'Red Canary', tier: 'signal' },
  { kind: 'rss', url: 'https://www.rapid7.com/blog/rss/', label: 'Rapid7', tier: 'signal' },
  { kind: 'rss', url: 'https://securelist.com/feed/', label: 'Securelist (Kaspersky GReAT)', tier: 'signal' },
  {
    kind: 'rss',
    url: 'https://securitylabs.datadoghq.com/rss/feed.xml',
    label: 'Datadog Security Labs',
    tier: 'signal',
  },
  { kind: 'rss', url: 'https://intezer.com/feed/', label: 'Intezer' },
  { kind: 'rss', url: 'https://blog.aquasec.com/rss.xml', label: 'Aqua Security (cloud)' },
  { kind: 'rss', url: 'https://www.varonis.com/blog/rss.xml', label: 'Varonis (data security)' },

  // ─── Medium tag feeds (technical, on-topic) ──────────────────────────
  // Tag feeds publish every Medium post tagged with the given topic. Quality
  // varies — these tags were probed for signal in 2026-05-12 and the broader
  // tags (cybersecurity, penetration-testing, hacking) were dropped because
  // they're dominated by SEO/beginner content. The set below leans technical:
  // malware reversing, threat hunting, detection engineering, etc.
  //
  // URL convention: https://medium.com/feed/tag/<tag>. Treated as generic RSS.
  // To add a specific analyst's Medium feed, use kind:'medium' + handle.
  { kind: 'rss', url: 'https://medium.com/feed/tag/threat-intelligence', label: 'Medium · #threat-intelligence' },
  { kind: 'rss', url: 'https://medium.com/feed/tag/threat-hunting', label: 'Medium · #threat-hunting' },
  { kind: 'rss', url: 'https://medium.com/feed/tag/malware-analysis', label: 'Medium · #malware-analysis' },
  { kind: 'rss', url: 'https://medium.com/feed/tag/dfir', label: 'Medium · #dfir' },
  { kind: 'rss', url: 'https://medium.com/feed/tag/incident-response', label: 'Medium · #incident-response' },
  { kind: 'rss', url: 'https://medium.com/feed/tag/red-team', label: 'Medium · #red-team' },
  { kind: 'rss', url: 'https://medium.com/feed/tag/detection-engineering', label: 'Medium · #detection-engineering' },
  { kind: 'rss', url: 'https://medium.com/feed/tag/reverse-engineering', label: 'Medium · #reverse-engineering' },
  { kind: 'rss', url: 'https://medium.com/feed/tag/cti', label: 'Medium · #cti' },

  // To add an analyst-specific Medium handle instead of a topic tag:
  // { kind: 'medium', handle: '@some-analyst' },
  // { kind: 'devto', handle: 'some-analyst' },
  // { kind: 'hashnode', host: 'some-analyst.hashnode.dev' },

  // ─── General security news + ransomware coverage ─────────────────────
  // Added 2026-05-12 after user requested ransomware-focused sources.
  // Each was probed for working RSS + non-trivial item count first; the
  // ones that returned 403/0-items under server-side fetch are documented
  // in the "skipped" block below.
  { kind: 'rss', url: 'https://socprime.com/feed/', label: 'SOC Prime' },
  { kind: 'rss', url: 'https://thehackernews.com/feeds/posts/default', label: 'The Hacker News' },
  { kind: 'rss', url: 'https://www.helpnetsecurity.com/feed/', label: 'Help Net Security' },
  { kind: 'rss', url: 'https://hackread.com/feed/', label: 'HackRead' },
  { kind: 'rss', url: 'https://www.databreaches.net/feed/', label: 'DataBreaches.net' },
  { kind: 'rss', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', label: 'CISA Advisories' },
  // Aikido Security's company blog publishes supply-chain malware research
  // including the Shai-Hulud npm worm coverage. The intel.aikido.dev /malware
  // surface (12k+ AIKIDO-* IDs) has no public feed — the blog is the
  // closest machine-readable view of their research output.
  { kind: 'rss', url: 'https://www.aikido.dev/blog/rss.xml', label: 'Aikido Security' },

  // cvefeed.io newsroom — curated CTI-news aggregator pulling from
  // cybersecuritynews.com, thecyberexpress.com, securityonline.info, etc.
  // Same-day cadence, structured RSS. The /severity/high.xml feed from the
  // same site is wired into /api/v1/cve-recent (not here) so the CVE detail
  // stream and the news stream stay in their own surfaces.
  //
  // HTML-only cvefeed.io surfaces (not ingested — listed here so future
  // probes don't re-test): /newsroom/latest, /githubcrawler/initial-access-
  // intelligence, /vuln/technology-vendors/, /vuln/products-security-index/,
  // /vuln/latest/, /epss/exploit-prediction-scoring-system/. These return
  // HTML 200 but no inline data island; the RSS feeds expose the same
  // underlying content in machine-readable form.
  { kind: 'rss', url: 'https://cvefeed.io/rssfeed/newsroom.xml', label: 'cvefeed.io Newsroom' },

  // ─── Skipped sources (documented so we don't re-add them blindly) ────
  // ransomnews.online (requested 2026-05-12): no machine-readable feed.
  //   Probed /feed/, /rss/, /feed.xml, /atom.xml, /sitemap.xml, /posts.json,
  //   /?feed=rss2 — all 404 or HTML homepage. HTML scraping was rejected
  //   as too brittle.
  // valhalla.nextron-systems.com (requested 2026-05-12): commercial Valhalla
  //   YARA rule platform. Requires an API key — no public RSS.
  // socprime.com/active-threats/feed/ (requested 2026-05-12): the category
  //   subfeed 404s. The site-wide socprime.com/feed/ above is the working
  //   surface and includes the same active-threats articles.
  // intel.aikido.dev (requested 2026-05-12): supply-chain malware database
  //   with 12,329 AIKIDO-* CVE IDs in its sitemap. /api/packages returns 10
  //   most-recent packages, but the rolling sample almost never contains
  //   `isMalware: true` items (Aikido reviews in batches). The /malware
  //   page is client-rendered with no inline data island. We use the
  //   sister company-blog feed www.aikido.dev/blog/rss.xml above instead,
  //   which surfaces the same supply-chain research as articles.
  // bleepingcomputer.com/feed/tag/ransomware/: returns 403 to server-side
  //   fetchers (bot detection). Re-add if we add residential-IP egress.
  // therecord.media/feed: 5 items only and content overlaps with Recorded
  //   Future feed already in the vendor section.
  // infosecurity-magazine.com/rss/news/: 250-item feed; would dominate the
  //   round-robin distribution. Re-add only if per-source cap is lowered.
  // blog.talosintelligence.com/feeds/posts/default: 403 to bot UAs.
  // scworld.com/topic/ransomware/feed: 403 to bot UAs.
];

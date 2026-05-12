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

export type WriteupSourceSpec =
  | { kind: 'medium'; handle: string; label?: string }
  | { kind: 'devto'; handle: string; label?: string }
  | { kind: 'hashnode'; host: string; label?: string }
  | { kind: 'rss'; url: string; label: string }
  | {
      kind: 'manual';
      title: string;
      url: string;
      source: string;
      /** ISO 8601 publish date. */
      published: string;
      description?: string;
      tags?: string[];
    };

export const WRITEUP_SOURCES: WriteupSourceSpec[] = [
  // ─── IR + threat-research blogs (independent + Mandiant-style) ─────────
  { kind: 'rss', url: 'https://thedfirreport.com/feed/', label: 'The DFIR Report' },
  { kind: 'rss', url: 'https://blog.bushidotoken.net/feeds/posts/default?alt=rss', label: 'BushidoToken' },
  { kind: 'rss', url: 'https://doublepulsar.com/feed', label: 'DoublePulsar (Kevin Beaumont)' },
  { kind: 'rss', url: 'https://krebsonsecurity.com/feed/', label: 'Krebs on Security' },
  { kind: 'rss', url: 'https://research.openanalysis.net/feed.xml', label: 'OpenAnalysis Lab' },

  // ─── Vendor research labs ─────────────────────────────────────────────
  { kind: 'rss', url: 'https://www.sentinelone.com/labs/feed/', label: 'SentinelLabs' },
  { kind: 'rss', url: 'https://www.crowdstrike.com/blog/feed/', label: 'CrowdStrike' },
  { kind: 'rss', url: 'https://unit42.paloaltonetworks.com/feed/', label: 'Unit 42 (Palo Alto)' },
  { kind: 'rss', url: 'https://research.checkpoint.com/feed/', label: 'Check Point Research' },
  // Google TI (Mandiant) dropped 2026-05-11. cloud.google.com/blog/topics/threat-intelligence/rss
  // returns HTML rather than an RSS feed when called server-side. Re-add when a working URL surfaces.
  { kind: 'rss', url: 'https://www.welivesecurity.com/feed/', label: 'WeLiveSecurity (ESET)' },
  { kind: 'rss', url: 'https://www.huntress.com/blog/rss.xml', label: 'Huntress' },
  { kind: 'rss', url: 'https://research.eye.security/feed', label: 'Eye Security' },
  { kind: 'rss', url: 'https://www.recordedfuture.com/feed/', label: 'Recorded Future' },
  { kind: 'rss', url: 'https://blog.exodusintel.com/feed', label: 'Exodus Intelligence' },
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
];

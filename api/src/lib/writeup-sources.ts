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

  // ─── Medium / dev.to / Hashnode (CTI analysts who publish there) ──────
  // To add an analyst Medium handle, uncomment and replace the placeholder:
  // { kind: 'medium', handle: '@some-analyst' },
  // { kind: 'devto', handle: 'some-analyst' },
  // { kind: 'hashnode', host: 'some-analyst.hashnode.dev' },

  // ─── Featured one-offs (interviews, guest articles) ───────────────────
  {
    kind: 'manual',
    title: 'Mastering DMARC for Enterprise Security',
    url: 'https://www.devx.com/cybersecurity/mastering-dmarc-for-enterprise-security/',
    source: 'DevX.com',
    published: '2025-09-15',
    description:
      'What strict DMARC at scale actually requires. The compatibility traps, the staged-enforcement playbook, and the bits that get overlooked because they only break at p=reject.',
    tags: ['DMARC', 'Email Security', 'Authentication'],
  },
  {
    kind: 'manual',
    title: 'How to Ensure Data Privacy in Cybersecurity',
    url: 'https://www.devx.com/cybersecurity/how-to-ensure-data-privacy-in-cybersecurity-key-protection-tips/',
    source: 'DevX.com',
    published: '2025-07-20',
    description:
      'Concrete data-protection moves for teams that have to make tradeoffs. Encryption choices, threat-modelling the data flow first, and avoiding policies nobody actually follows.',
    tags: ['Data Privacy', 'Encryption', 'Threat Modelling'],
  },
  {
    kind: 'manual',
    title: '15 Initiatives to Build a Strong Cybersecurity Culture',
    url: 'https://www.devx.com/cybersecurity/15-initiatives-to-build-a-strong-cybersecurity-culture/',
    source: 'DevX.com',
    published: '2025-05-10',
    description:
      "Security culture is mostly downstream of incident-response habits. A breakdown of the initiatives I've seen actually shift behaviour, and the ones that just produce posters.",
    tags: ['Security Culture', 'Awareness', 'IR'],
  },
  {
    kind: 'manual',
    title: 'Featured Expert: OSINT & Threat Intelligence',
    url: 'https://featured.com/p/pranith-jain',
    source: 'Featured.com',
    published: '2026-01-01',
    description:
      'Q&A on how I work the OSINT-to-actioned-intel pipeline, the tools I lean on, and what I think most enterprises get wrong about email-threat tradecraft.',
    tags: ['OSINT', 'Threat Intel'],
  },
];

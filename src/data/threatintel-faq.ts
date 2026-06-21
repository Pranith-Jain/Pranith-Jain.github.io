/**
 * On-page FAQ for the Threat Intel landing page (/threatintel). Four
 * hand-counted Q&A pairs, each 40-60 words, that answer the queries AI
 * engines most often field about free, live CTI platforms. The same array
 * is consumed twice:
 *   1. `FaqStructuredData` in threatintel/Home.tsx emits the matching
 *      FAQPage JSON-LD.
 *   2. A visible <details> block renders the same answers to humans.
 * Keeping a single source of truth means the schema can never drift from
 * the on-page text (a common failure mode that gets the schema ignored).
 */

export const THREATINTEL_FAQ: { question: string; answer: string }[] = [
  {
    question: 'What is PANOPTICON (Threat Intelligence Platform)?',
    answer:
      'PANOPTICON is a free, live, self-updating CTI surface that aggregates 30-plus intel sources — ransomware leak sites, MITRE ATT&CK, CISA KEV, NVD, deepdarkCTI criminal forums, Telegram channels, and Reddit subreddits — into one searchable view. It correlates IOCs across sources with consensus scoring, tracks threat actor timelines, monitors dark-web chatter, and exports enriched bundles as STIX 2.1. Everything updates hourly with no signup required.',
  },
  {
    question: 'How does the platform pull from ransomware leak sites?',
    answer:
      'PANOPTICON pulls leak-site claims from six independent sources: Ransomlook, ransomfeed.it, ransomwatch, ransomware.live, MyThreatIntel, and Andrea Fortuna. Each is fetched in parallel, normalised into a common victim schema, deduplicated by leak-site claim, and ranked by recency. The result is one feed of recent victims with per-victim screenshots, sector heuristics, and a re-leak timeline so analysts can spot repeat targets rather than scrolling raw rows.',
  },
  {
    question: 'Can I export threat data as STIX 2.1?',
    answer:
      'Yes. The /threatintel/stix page and /dfir/stix-builder both export enriched IOCs, actor context, and CVE entries as STIX 2.1 bundles. Bundles are valid against the OASIS STIX 2.1 specification and can be ingested into MISP, OpenCTI, or any TAXII 2.1 client. Each bundle carries object refs, marking definitions, and a created/modified timestamp. Bundles are produced server-side from the same cache the front-end renders.',
  },
  {
    question: 'Is PANOPTICON free?',
    answer:
      'Yes. PANOPTICON is free, with no signup, no API key, and no rate-limit login. It runs on Cloudflare Workers using a KV cache and a D1 database. Server costs are absorbed by the author, not by ads or data resale. PANOPTICON is not affiliated with any commercial threat-intel vendor; it is a side project by a working SOC analyst.',
  },
];

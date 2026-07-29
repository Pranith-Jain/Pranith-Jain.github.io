/**
 * Long-form portfolio case studies. These are the "credibility document"
 * of the portfolio: methodology and results from real engagements,
 * anonymised at the company/individual level. They live at
 * /projects/<slug>.
 *
 * Source of truth for ALL anchored stats: numbers that already appear
 * publicly on this site (stats.ts, the Hero bio, the live profile
 * README). Nothing fabricated. Nothing employer-identifying.
 *
 * Voice rules: written by hand, no AI tells. No em-dashes (commas,
 * periods, semicolons, or parens instead). No "leverage", "robust",
 * "comprehensive", "essential", "critical". No "let's dive in",
 * "it's worth noting", "in conclusion". Contractions are fine.
 * Specific numbers beat generic claims.
 *
 * Adding or editing a case study: keep the `published` flag honest.
 * Drafts with `published: false` are hidden from the public index and
 * read pages (the route returns 404). Lets a draft sit in the repo for
 * review before going live.
 */

export interface CaseStudyMeta {
  /** Stable slug for the URL: /projects/<slug>. */
  slug: string;
  /** Display title, short and declarative. */
  title: string;
  /** One-line summary used on the index card. Keep under 120 chars. */
  excerpt: string;
  /** Section label shown above the title on the read page. */
  kicker: string;
  /** Short result line surfaced on the index card: the 1-3 most
   *  compelling metrics, comma-separated. */
  outcome: string;
  /** ISO 8601 date the case study was written/published on the site. */
  publishedAt: string;
  /** Reading time hint shown on the index card; computed by hand from
   *  body word count (~200 wpm). Kept manual rather than calculated so
   *  a future expansion of the body doesn't silently change the number
   *  on render. */
  readingTime: string;
  /** Topical tags shown on the index card and the read page header. */
  tags: string[];
  /** Show on the public index. Set false to keep a draft in-repo
   *  without exposing it. */
  published: boolean;
}

const PHISHING_PROGRAM: CaseStudyMeta = {
  slug: 'phishing-program-at-scale',
  title: 'Phishing program at scale: methodology and what changed',
  excerpt:
    'How I cut false positives 25% and per-incident analysis time 35% across a 250+ incident year, without buying anything new.',
  kicker: 'Investigation methodology',
  outcome: '250+ incidents · −25% false positives · −35% time per case · 90%+ remediation',
  publishedAt: '2026-05-21',
  readingTime: '6 min',
  tags: ['Phishing', 'BEC', 'SOC', 'Investigation Methodology', 'Automation'],
  published: true,
};

const DMARC_ROLLOUT: CaseStudyMeta = {
  slug: 'dmarc-enforcement-1300-domains',
  title: 'DMARC enforcement across 1,300+ domains: a playbook that survived contact with reality',
  excerpt:
    'How we moved a 1,300-domain portfolio to 98%+ authentication alignment, dropped spoofing incidents 60%, and what almost broke the plan.',
  kicker: 'Email security at scale',
  outcome: '1,300+ domains · 98%+ DMARC alignment · −60% spoofing incidents · 30+ lookalike campaigns surfaced',
  publishedAt: '2026-05-21',
  readingTime: '7 min',
  tags: ['DMARC', 'SPF', 'DKIM', 'Email Authentication', 'Deliverability'],
  published: true,
};

const N8N_AUTOMATION: CaseStudyMeta = {
  slug: 'phishing-triage-automation-n8n-mcp',
  title: 'From 4 hours to 75 minutes: building the n8n + MCP triage automation',
  excerpt: "What got automated, what didn't, and why the decision boundary mattered more than the code.",
  kicker: 'Security automation',
  outcome: 'Median response 4h → <75min · automation handles ~70% of cases end-to-end · zero new vendor cost',
  publishedAt: '2026-05-21',
  readingTime: '5 min',
  tags: ['n8n', 'MCP', 'Claude Code', 'SOC Automation', 'AI'],
  published: true,
};

const EMAIL_INFRA_PLATFORM: CaseStudyMeta = {
  slug: 'email-infra-automation-platform',
  title: 'Building an end-to-end email infrastructure automation platform',
  excerpt:
    'Domain purchase, DNS, Workspace provisioning, warmup, monitoring. Six disconnected workflows collapsed into one platform.',
  kicker: 'Platform engineering',
  outcome:
    '6 workflows automated · setup per domain: hours → 10 min · 2,700+ inboxes monitored · real-time DMARC dashboard',
  publishedAt: '2026-05-21',
  readingTime: '7 min',
  tags: ['Email Infra', 'Smartlead', 'n8n', 'Cloudflare', 'Automation', 'MCP'],
  published: true,
};

const DFIR_TOOLKIT_BUILD: CaseStudyMeta = {
  slug: 'dfir-toolkit-design',
  title: 'Designing a 60-tool DFIR toolkit at the edge: what earns a slot',
  excerpt:
    'Building 60+ analyst tools on Cloudflare Workers, deciding which tools earn the front door, and why most of them are wrappers around the same triage workflow.',
  kicker: 'Tool design',
  outcome:
    '60+ tools shipped · 5 featured tools earn the front door · zero credits required · sub-200ms median IOC check',
  publishedAt: '2026-05-21',
  readingTime: '6 min',
  tags: ['DFIR', 'Cloudflare Workers', 'Tool Design', 'Detection Engineering', 'Universal Rule Converter'],
  published: true,
};

const THREAT_INTEL_PLATFORM_BUILD: CaseStudyMeta = {
  slug: 'threat-intel-platform-build',
  title: 'Shipping autonomous threat-intel: layer-1 + layer-2 defences before the AI writes',
  excerpt:
    'How /threatintel publishes case studies without a human in the loop, and the two layers of IOC validation that make that safe.',
  kicker: 'Autonomous publishing',
  outcome:
    'Autonomous discover → AI generate → QA → publish · 2 IOC truth-defence layers · admin approval gate · 16 elite research sources curated',
  publishedAt: '2026-05-21',
  readingTime: '7 min',
  tags: ['Threat Intel', 'AI Safety', 'IOC Validation', 'Autonomous Publishing', 'Cloudflare Workers'],
  published: true,
};

export const caseStudies: CaseStudyMeta[] = [
  PHISHING_PROGRAM,
  DMARC_ROLLOUT,
  N8N_AUTOMATION,
  EMAIL_INFRA_PLATFORM,
  DFIR_TOOLKIT_BUILD,
  THREAT_INTEL_PLATFORM_BUILD,
];

/** Public-only view, filtered to published studies and sorted newest-first. */
export const publishedCaseStudies: CaseStudyMeta[] = caseStudies
  .filter((c) => c.published)
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

/** Look up a case study by slug. Returns null for unknown / unpublished. */
export function findCaseStudy(slug: string): CaseStudyMeta | null {
  const hit = caseStudies.find((c) => c.slug === slug);
  return hit && hit.published ? hit : null;
}

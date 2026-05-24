/**
 * Back-link routing: when you're on a tool page (say /threatintel/writeups),
 * the "← back" affordance should drop you on the category-filtered hub
 * (/threatintel/c/knowledge), not the full hub home. That keeps related
 * sources one click away instead of forcing you to re-navigate the chip
 * strip.
 *
 * The source-of-truth for the DFIR mapping is `tool-sections.ts` (already
 * a pure data module). The threat-intel mapping is duplicated here because
 * the canonical SECTIONS array lives inside `pages/threatintel/Home.tsx`
 * alongside heavy components; pulling it would force every tool page to
 * bundle the home page's deps. A vitest test (`src/lib/back-link.test.ts`)
 * asserts the duplicate map stays in sync with Home.tsx's SECTIONS so any
 * drift fails CI rather than silently dead-ending a back link.
 */

import { SECTIONS as DFIR_SECTIONS, type ToolGroup } from '../components/dfir/tool-sections';

// ---------------------------------------------------------------------------
// Threat Intel: /threatintel/<slug> → category id  (categories rendered at
// /threatintel/c/<cat>). Keep ordering aligned with Home.tsx SECTIONS so a
// reviewer can diff the two side-by-side.
// ---------------------------------------------------------------------------
const THREATINTEL_TOOL_TO_CATEGORY: Record<string, string> = {
  // ransomware
  'ransomware-activity': 'ransomware',
  'ransomware-live': 'ransomware',
  negotiations: 'ransomware',
  're-leaks': 'ransomware',
  'onion-watch': 'ransomware',
  mythreatintel: 'ransomware',
  // darkweb-breach
  darkweb: 'darkweb-breach',
  'breach-forums': 'darkweb-breach',
  breach: 'darkweb-breach',
  infostealer: 'darkweb-breach',
  deepdarkcti: 'darkweb-breach',
  'scam-watch': 'darkweb-breach',
  // feeds-news
  cybersec: 'feeds-news',
  reddit: 'feeds-news',
  x: 'feeds-news',
  'threat-feeds': 'feeds-news',
  'tech-ai-news': 'feeds-news',
  'cyber-crime': 'feeds-news',
  pulse: 'feeds-news',
  'telegram-settings': 'feeds-news',
  // cti-platforms
  'threat-map': 'cti-platforms',
  metrics: 'cti-platforms',
  status: 'cti-platforms',
  briefings: 'cti-platforms',
  'feed-sources': 'cti-platforms',
  settings: 'cti-platforms',
  // ioc-detection
  'live-iocs': 'ioc-detection',
  correlation: 'ioc-detection',
  'c2-tracker': 'ioc-detection',
  rules: 'ioc-detection',
  detections: 'ioc-detection',
  'cve-list': 'ioc-detection',
  'cve-threat-map': 'ioc-detection',
  'domain-monitor': 'ioc-detection',
  // adversary
  actors: 'adversary',
  'actor-kb': 'adversary',
  'actor-timeline': 'adversary',
  mitre: 'adversary',
  atlas: 'adversary',
  malpedia: 'adversary',
  maltrail: 'adversary',
  // knowledge
  research: 'knowledge',
  signal: 'knowledge',
  writeups: 'knowledge',
  wiki: 'knowledge',
  'cve-resources': 'knowledge',
  'secops-tools': 'knowledge',
  'awesome-lists': 'knowledge',
  'external-resources': 'knowledge',
  'telegram-watch': 'knowledge',
  'osint-framework': 'knowledge',
};

// ---------------------------------------------------------------------------
// DFIR: /dfir/<slug> → group  (groups rendered at /dfir/tools/<group>).
// Derived once from the SECTIONS source of truth at module load.
// ---------------------------------------------------------------------------
const DFIR_TOOL_TO_GROUP: Record<string, ToolGroup> = (() => {
  const map: Record<string, ToolGroup> = {};
  for (const section of DFIR_SECTIONS) {
    for (const t of section.tools) {
      // Strip the leading `/dfir/` so the lookup table keys on the slug only.
      const slug = t.path.replace(/^\/dfir\//, '');
      if (slug && !slug.includes('/')) map[slug] = section.group;
    }
  }
  return map;
})();

/**
 * Given the current pathname, return the URL the "back" link should send the
 * user to. Returns `null` when the page isn't a known tool — callers fall
 * back to the surface's hub root (`/threatintel` or `/dfir`).
 */
export function backCategoryFor(pathname: string): string | null {
  const ti = /^\/threatintel\/([^/]+)$/.exec(pathname);
  if (ti) {
    const cat = THREATINTEL_TOOL_TO_CATEGORY[ti[1]!];
    return cat ? `/threatintel/c/${cat}` : null;
  }
  const df = /^\/dfir\/([^/]+)$/.exec(pathname);
  if (df) {
    const group = DFIR_TOOL_TO_GROUP[df[1]!];
    return group ? `/dfir/tools/${group}` : null;
  }
  return null;
}

// Exposed for the drift test; not part of the public API.
export const __TEST_ONLY = {
  THREATINTEL_TOOL_TO_CATEGORY,
  DFIR_TOOL_TO_GROUP,
};

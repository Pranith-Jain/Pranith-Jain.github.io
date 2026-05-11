/**
 * Briefing item auto-tagger.
 *
 * Each briefing finding is a flat title + description blob. To make briefings
 * filterable post-hoc (and to summarize an archive by actor/CVE/sector),
 * we extract three tag classes from the text:
 *   - cves    → regex match on CVE-YYYY-NNNN
 *   - actors  → substring match against curated ransomware actor lookup
 *   - sectors → reuse the heuristic sector classifier
 *
 * Lazy: applied at read-time on the briefings handler so existing KV-stored
 * briefings get tags without rewriting them.
 */

import { mitreGroupRef } from './ransomware-mitre-groups';
import { classifySector } from './sector-classifier';

export interface BriefingTags {
  cves: string[];
  actors: Array<{ slug: string; mitre_id?: string }>;
  sectors: string[];
}

const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/gi;

/** Known ransomware actor slugs to scan for. Maps slug → display name. */
const ACTOR_SLUGS: Array<{ slug: string; aliases: string[] }> = [
  { slug: 'lockbit', aliases: ['lockbit'] },
  { slug: 'alphv', aliases: ['alphv', 'blackcat'] },
  { slug: 'cl0p', aliases: ['cl0p', 'clop'] },
  { slug: 'akira', aliases: ['akira'] },
  { slug: 'play', aliases: ['play ransomware', 'playcrypt'] },
  { slug: 'black basta', aliases: ['black basta', 'blackbasta'] },
  { slug: 'royal', aliases: ['royal ransomware'] },
  { slug: 'medusa', aliases: ['medusa ransomware', 'medusa locker'] },
  { slug: 'bianlian', aliases: ['bianlian'] },
  { slug: 'qilin', aliases: ['qilin', 'agenda ransomware'] },
  { slug: 'conti', aliases: ['conti'] },
  { slug: 'revil', aliases: ['revil', 'sodinokibi'] },
  { slug: 'darkside', aliases: ['darkside'] },
  { slug: 'blackbyte', aliases: ['blackbyte'] },
  { slug: 'hive', aliases: ['hive ransomware'] },
  { slug: 'ryuk', aliases: ['ryuk'] },
  { slug: 'ragnarlocker', aliases: ['ragnar locker', 'ragnarlocker'] },
  { slug: 'rhysida', aliases: ['rhysida'] },
  { slug: 'inc ransom', aliases: ['inc ransom', 'inc. ransom'] },
  { slug: 'lynx', aliases: ['lynx ransomware'] },
  { slug: 'the gentlemen', aliases: ['the gentlemen'] },
];

/**
 * Extract tags from a finding's text. The same finding may match multiple
 * actors / sectors / CVEs — we return the de-duplicated union.
 */
export function extractBriefingTags(text: string): BriefingTags {
  const haystack = text.toLowerCase();

  // CVEs
  const cveMatches = text.match(CVE_RE) ?? [];
  const cves = Array.from(new Set(cveMatches.map((c) => c.toUpperCase()))).sort();

  // Actors
  const actors: BriefingTags['actors'] = [];
  for (const a of ACTOR_SLUGS) {
    if (a.aliases.some((alias) => haystack.includes(alias))) {
      const ref = mitreGroupRef(a.slug);
      actors.push({ slug: a.slug, mitre_id: ref?.id });
    }
  }

  // Sectors — the classifier returns a single best match per text.
  // We surface as a single-element array (drop 'Unknown') so the UI can
  // render tags uniformly across all three classes.
  const sector = classifySector(text);
  const sectors = sector === 'Unknown' ? [] : [sector];

  return { cves, actors, sectors };
}

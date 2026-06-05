/**
 * Ransomware group name normalization.
 *
 * The 7 upstream trackers (ransomware.live, Ransomlook, cti.fyi, ransomfeed,
 * ransomwatch, MTI, AF) each spell the same group slightly differently. The
 * spelling drift inflates both:
 *   1. The `groups[]` count (e.g. "thegentlemen" + "the gentlemen" = 2 rows
 *      for the same gang, summing to 58 victims instead of 33).
 *   2. The per-victim dedup — the merge key includes `group`, so two trackers
 *      reporting the same victim under different spellings count as two
 *      separate victims.
 *
 * `normalizeGroup` is the single source of truth used by:
 *   - `api/src/routes/ransomware-recent.ts` mergeVictims()
 *   - `api/src/lib/briefing-builder.ts` ransomware section dedup
 *   - `api/src/case-study/discovery/platform-data.ts` group-by key
 *
 * Rule: lowercase → strip whitespace/punctuation → resolve known alias
 * dictionary. When the dictionary disagrees (e.g. Black Cat / ALPHV / Noberus
 * are all the same RaaS), the entry's `canonical` field is the slug every
 * caller uses. Unknown groups get the cleaned lowercase as their slug — never
 * a fabricated alias — so the tracker spelling still appears in the UI when
 * the user hovers the pill, and counts across sources always agree.
 */

const ALIASES: Record<string, string> = {
  // Spacing/punctuation variants
  thegentlemen: 'thegentlemen',
  'the gentlemen': 'thegentlemen',
  'the-gentlemen': 'thegentlemen',
  // Aliases the trackers disagree on
  lockbit: 'lockbit',
  lockbit3: 'lockbit',
  'lockbit 3': 'lockbit',
  'lockbit 3.0': 'lockbit',
  alphv: 'alphv',
  blackcat: 'alphv',
  'black cat': 'alphv',
  noberus: 'alphv',
  'alphv-blackcat': 'alphv',
  // RaaS rebrandings
  'hive-leaks': 'hive',
  hive: 'hive',
  // Trivial casing/whitespace
  'play  ': 'play',
  play: 'play',
};

/**
 * Lowercase, strip whitespace/hyphens/underscores/dots, collapse aliases.
 * Returns the canonical slug for the group. Empty/whitespace → "unknown".
 */
export function normalizeGroup(input: string | undefined | null): string {
  const raw = (input ?? '').toString().trim().toLowerCase();
  if (!raw) return 'unknown';
  // Direct dictionary hit first (catches multi-word spellings like "the gentlemen")
  if (ALIASES[raw]) return ALIASES[raw];
  // Strip whitespace/hyphens/underscores/dots and check again
  const compressed = raw.replace(/[\s\-_.]+/g, '');
  if (ALIASES[compressed]) return ALIASES[compressed];
  // Otherwise the compressed form IS the slug. "the gentlemen" → "thegentlemen".
  return compressed || 'unknown';
}

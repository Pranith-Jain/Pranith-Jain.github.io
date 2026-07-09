/**
 * Shared set of known ransomware group slugs.
 *
 * Used by entity-resolution.ts (entity type classification) and
 * relationship-graph.ts (node type rendering). Single source of truth —
 * keep in sync with the ransomware section of threat-actor-aliases.ts.
 */
export const RANSOMWARE_SLUGS = new Set([
  'lockbit',
  'blackcat-alphv',
  'cl0p',
  'royal',
  'black-basta',
  'play',
  'rhysida',
  'akira',
  'medusa',
  'bianlian',
  'cactus',
  'qilin',
  'hunters-international',
  'ransomhub',
  'darkside',
  'conti',
  'hive',
  'revil',
  'inc-ransom',
  'dragonforce',
  '8base',
  'lynx',
]);

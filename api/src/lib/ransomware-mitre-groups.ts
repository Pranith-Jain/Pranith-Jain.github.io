/**
 * Curated mapping from ransomware-group slug (as Ransomlook names them) to
 * MITRE ATT&CK Group ID. Only includes groups MITRE has formally tracked.
 *
 * Source: https://attack.mitre.org/groups/ — verified against MITRE's
 * enterprise-attack-stix-data repository. Newer groups (post-2024) may
 * not have a MITRE ID yet; their entry returns null and the UI gracefully
 * shows just the Ransomlook profile link.
 *
 * Last reviewed: 2026-05-11.
 */

export interface MitreGroupRef {
  /** MITRE Group ID (e.g. "G1006"). */
  id: string;
  /** Group name as MITRE labels it (may differ from Ransomlook slug). */
  name: string;
  /** Direct link to the MITRE Group profile. */
  url: string;
}

const MAP: Record<string, MitreGroupRef> = {
  lockbit: { id: 'G1006', name: 'LockBit', url: 'https://attack.mitre.org/groups/G1006/' },
  'lockbit 3.0': { id: 'G1006', name: 'LockBit', url: 'https://attack.mitre.org/groups/G1006/' },
  alphv: { id: 'G1011', name: 'BlackCat (ALPHV)', url: 'https://attack.mitre.org/groups/G1011/' },
  blackcat: { id: 'G1011', name: 'BlackCat (ALPHV)', url: 'https://attack.mitre.org/groups/G1011/' },
  cl0p: { id: 'G0092', name: 'TA505 / Cl0p', url: 'https://attack.mitre.org/groups/G0092/' },
  clop: { id: 'G0092', name: 'TA505 / Cl0p', url: 'https://attack.mitre.org/groups/G0092/' },
  akira: { id: 'G1024', name: 'Akira', url: 'https://attack.mitre.org/groups/G1024/' },
  play: { id: 'G1040', name: 'Play', url: 'https://attack.mitre.org/groups/G1040/' },
  playcrypt: { id: 'G1040', name: 'Play', url: 'https://attack.mitre.org/groups/G1040/' },
  'black basta': { id: 'G1033', name: 'Black Basta', url: 'https://attack.mitre.org/groups/G1033/' },
  blackbasta: { id: 'G1033', name: 'Black Basta', url: 'https://attack.mitre.org/groups/G1033/' },
  royal: { id: 'G1037', name: 'Royal', url: 'https://attack.mitre.org/groups/G1037/' },
  medusa: { id: 'G1038', name: 'Medusa', url: 'https://attack.mitre.org/groups/G1038/' },
  bianlian: { id: 'G1002', name: 'BianLian', url: 'https://attack.mitre.org/groups/G1002/' },
  qilin: { id: 'G1010', name: 'Agenda / Qilin', url: 'https://attack.mitre.org/groups/G1010/' },
  agenda: { id: 'G1010', name: 'Agenda / Qilin', url: 'https://attack.mitre.org/groups/G1010/' },
  conti: { id: 'G0098', name: 'Wizard Spider / Conti', url: 'https://attack.mitre.org/groups/G0098/' },
  revil: { id: 'G0115', name: 'GOLD SOUTHFIELD / REvil', url: 'https://attack.mitre.org/groups/G0115/' },
  sodinokibi: { id: 'G0115', name: 'GOLD SOUTHFIELD / REvil', url: 'https://attack.mitre.org/groups/G0115/' },
  darkside: { id: 'G1014', name: 'DarkSide', url: 'https://attack.mitre.org/groups/G1014/' },
  blackbyte: { id: 'G1043', name: 'BlackByte', url: 'https://attack.mitre.org/groups/G1043/' },
  hive: { id: 'G1015', name: 'HIVE', url: 'https://attack.mitre.org/groups/G1015/' },
  ryuk: { id: 'G0102', name: 'Wizard Spider', url: 'https://attack.mitre.org/groups/G0102/' },
  ragnarlocker: { id: 'G1041', name: 'RagnarLocker', url: 'https://attack.mitre.org/groups/G1041/' },
  'ragnar locker': { id: 'G1041', name: 'RagnarLocker', url: 'https://attack.mitre.org/groups/G1041/' },
  rhysida: { id: 'G1048', name: 'Rhysida', url: 'https://attack.mitre.org/groups/G1048/' },
  // ─── Non-ransomware APTs referenced in CVE attribution ─────────────────
  // These aren't ransomware operators but the cve-actor-mapping lib points
  // at them for state-actor CVE exploitation (Volt Typhoon, Lazarus, etc).
  // We keep them here so the CVE-list page can render a proper MITRE pill.
  'volt-typhoon': { id: 'G1017', name: 'Volt Typhoon', url: 'https://attack.mitre.org/groups/G1017/' },
  'lazarus-group': { id: 'G0032', name: 'Lazarus Group', url: 'https://attack.mitre.org/groups/G0032/' },
  'fancy-bear': { id: 'G0007', name: 'APT28 (Fancy Bear)', url: 'https://attack.mitre.org/groups/G0007/' },
};

/** Lookup a Ransomlook slug; case-insensitive; returns null when unknown. */
export function mitreGroupRef(slug: string): MitreGroupRef | null {
  return MAP[slug.trim().toLowerCase()] ?? null;
}

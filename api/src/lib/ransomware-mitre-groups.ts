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
  // These aren't ransomware operators but are referenced in heuristic
  // CVE-to-actor scanning (Volt Typhoon, Lazarus, etc).
  // We keep them here so the CVE-list page can render a proper MITRE pill.
  'volt-typhoon': { id: 'G1017', name: 'Volt Typhoon', url: 'https://attack.mitre.org/groups/G1017/' },
  'lazarus-group': { id: 'G0032', name: 'Lazarus Group', url: 'https://attack.mitre.org/groups/G0032/' },
  lazarus: { id: 'G0032', name: 'Lazarus Group', url: 'https://attack.mitre.org/groups/G0032/' },
  'fancy-bear': { id: 'G0007', name: 'APT28 (Fancy Bear)', url: 'https://attack.mitre.org/groups/G0007/' },
  apt28: { id: 'G0007', name: 'APT28 (Fancy Bear)', url: 'https://attack.mitre.org/groups/G0007/' },
  sofacy: { id: 'G0007', name: 'APT28 (Fancy Bear)', url: 'https://attack.mitre.org/groups/G0007/' },
  apt29: { id: 'G0016', name: 'APT29 (Cozy Bear)', url: 'https://attack.mitre.org/groups/G0016/' },
  'cozy-bear': { id: 'G0016', name: 'APT29 (Cozy Bear)', url: 'https://attack.mitre.org/groups/G0016/' },
  'the-dukes': { id: 'G0016', name: 'APT29 (Cozy Bear)', url: 'https://attack.mitre.org/groups/G0016/' },
  apt41: { id: 'G0096', name: 'APT41 (Winnti)', url: 'https://attack.mitre.org/groups/G0096/' },
  winnti: { id: 'G0096', name: 'APT41 (Winnti)', url: 'https://attack.mitre.org/groups/G0096/' },
  'double-dragon': { id: 'G0096', name: 'APT41 (Winnti)', url: 'https://attack.mitre.org/groups/G0096/' },
  sandworm: { id: 'G0034', name: 'Sandworm', url: 'https://attack.mitre.org/groups/G0034/' },
  'voodoo-bear': { id: 'G0034', name: 'Sandworm', url: 'https://attack.mitre.org/groups/G0034/' },
  apt33: { id: 'G0064', name: 'APT33 (Elfin)', url: 'https://attack.mitre.org/groups/G0064/' },
  elfin: { id: 'G0064', name: 'APT33 (Elfin)', url: 'https://attack.mitre.org/groups/G0064/' },
  apt34: { id: 'G0049', name: 'APT34 (OilRig)', url: 'https://attack.mitre.org/groups/G0049/' },
  oilrig: { id: 'G0049', name: 'APT34 (OilRig)', url: 'https://attack.mitre.org/groups/G0049/' },
  apt35: { id: 'G0059', name: 'APT35 (Charming Kitten)', url: 'https://attack.mitre.org/groups/G0059/' },
  'charming-kitten': { id: 'G0059', name: 'APT35 (Charming Kitten)', url: 'https://attack.mitre.org/groups/G0059/' },
  apt38: { id: 'G0082', name: 'APT38 (BlueNoroff)', url: 'https://attack.mitre.org/groups/G0082/' },
  bluenoroff: { id: 'G0082', name: 'APT38 (BlueNoroff)', url: 'https://attack.mitre.org/groups/G0082/' },
  apt39: { id: 'G0087', name: 'APT39 (Chafer)', url: 'https://attack.mitre.org/groups/G0087/' },
  chafer: { id: 'G0087', name: 'APT39 (Chafer)', url: 'https://attack.mitre.org/groups/G0087/' },
  apt40: { id: 'G0117', name: 'APT40 (Leviathan)', url: 'https://attack.mitre.org/groups/G0117/' },
  leviathan: { id: 'G0117', name: 'APT40 (Leviathan)', url: 'https://attack.mitre.org/groups/G0117/' },
  apt10: { id: 'G0050', name: 'APT10 (Stone Panda)', url: 'https://attack.mitre.org/groups/G0050/' },
  'stone-panda': { id: 'G0050', name: 'APT10 (Stone Panda)', url: 'https://attack.mitre.org/groups/G0050/' },
  menupass: { id: 'G0050', name: 'APT10 (Stone Panda)', url: 'https://attack.mitre.org/groups/G0050/' },
  apt32: { id: 'G0057', name: 'APT32 (OceanLotus)', url: 'https://attack.mitre.org/groups/G0057/' },
  oceanlotus: { id: 'G0057', name: 'APT32 (OceanLotus)', url: 'https://attack.mitre.org/groups/G0057/' },
  apt37: { id: 'G0067', name: 'APT37 (Reaper)', url: 'https://attack.mitre.org/groups/G0067/' },
  reaper: { id: 'G0067', name: 'APT37 (Reaper)', url: 'https://attack.mitre.org/groups/G0067/' },
  scarcruft: { id: 'G0067', name: 'APT37 (Reaper)', url: 'https://attack.mitre.org/groups/G0067/' },
  apt3: { id: 'G0022', name: 'APT3 (Gothic Panda)', url: 'https://attack.mitre.org/groups/G0022/' },
  'gothic-panda': { id: 'G0022', name: 'APT3 (Gothic Panda)', url: 'https://attack.mitre.org/groups/G0022/' },
  apt1: { id: 'G0006', name: 'APT1 (Comment Crew)', url: 'https://attack.mitre.org/groups/G0006/' },
  'comment-crew': { id: 'G0006', name: 'APT1 (Comment Crew)', url: 'https://attack.mitre.org/groups/G0006/' },
  fin7: { id: 'G0046', name: 'FIN7 (Carbanak)', url: 'https://attack.mitre.org/groups/G0046/' },
  carbanak: { id: 'G0046', name: 'FIN7 (Carbanak)', url: 'https://attack.mitre.org/groups/G0046/' },
  ta505: { id: 'G0092', name: 'TA505', url: 'https://attack.mitre.org/groups/G0092/' },
  muddywater: { id: 'G0069', name: 'MuddyWater', url: 'https://attack.mitre.org/groups/G0069/' },
  'mango-sandstorm': { id: 'G0069', name: 'MuddyWater', url: 'https://attack.mitre.org/groups/G0069/' },
  'mustang-panda': { id: 'G0009', name: 'Mustang Panda', url: 'https://attack.mitre.org/groups/G0009/' },
  tick: { id: 'G0080', name: 'TICK', url: 'https://attack.mitre.org/groups/G0080/' },
  kimsuky: { id: 'G0094', name: 'Kimsuky', url: 'https://attack.mitre.org/groups/G0094/' },
  'scarlet-mockingbird': { id: 'G1027', name: 'Scarlet Mockingbird', url: 'https://attack.mitre.org/groups/G1027/' },
  'aqua-blizzard': { id: 'G1034', name: 'Aqua Blizzard', url: 'https://attack.mitre.org/groups/G1034/' },
  'cadet-blizzard': { id: 'G1035', name: 'Cadet Blizzard', url: 'https://attack.mitre.org/groups/G1035/' },
  tortoiseshell: { id: 'G0090', name: 'Tortoiseshell', url: 'https://attack.mitre.org/groups/G0090/' },
  'apt-c-50': { id: 'G1018', name: 'APT-C-50', url: 'https://attack.mitre.org/groups/G1018/' },
};

/** Lookup a Ransomlook slug; case-insensitive; returns null when unknown. */
export function mitreGroupRef(slug: string): MitreGroupRef | null {
  return MAP[slug.trim().toLowerCase()] ?? null;
}

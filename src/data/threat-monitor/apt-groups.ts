/** 65 APT groups + aliases from MITRE ATT&CK + public vendor reporting. */
export interface AptGroup {
  mitre_id: string | null;
  aliases: string[];
  suspected_origin: string;
  target_sectors: string[];
}
export const APT_GROUPS: Record<string, AptGroup> = {
  // ── Russia ───────────────────────────────────────────────────────────────
  APT28: {
    mitre_id: 'G0007',
    aliases: ['APT28', 'Fancy Bear', 'Sofacy', 'Sednit', 'STRONTIUM', 'Forest Blizzard', 'Pawn Storm'],
    suspected_origin: 'Russia',
    target_sectors: ['Government', 'Military', 'Media'],
  },
  APT29: {
    mitre_id: 'G0016',
    aliases: ['APT29', 'Cozy Bear', 'The Dukes', 'Midnight Blizzard', 'NOBELIUM', 'Yttrium'],
    suspected_origin: 'Russia',
    target_sectors: ['Government', 'Think Tanks', 'Healthcare'],
  },
  Sandworm: {
    mitre_id: 'G0034',
    aliases: ['Sandworm', 'Sandworm Team', 'Voodoo Bear', 'Seashell Blizzard', 'Iron Viking'],
    suspected_origin: 'Russia',
    target_sectors: ['Energy', 'Government', 'Critical Infrastructure'],
  },
  Turla: {
    mitre_id: 'G0010',
    aliases: ['Turla', 'Snake', 'Uroburos', 'Venomous Bear', 'Waterbug'],
    suspected_origin: 'Russia',
    target_sectors: ['Government', 'Diplomatic', 'Defense'],
  },
  Gamaredon: {
    mitre_id: 'G0047',
    aliases: ['Gamaredon', 'Primitive Bear', 'Armageddon', 'Shuckworm'],
    suspected_origin: 'Russia',
    target_sectors: ['Government', 'Ukraine-focused'],
  },
  'Wizard Spider': {
    mitre_id: 'G0102',
    aliases: ['Wizard Spider', 'TrickBot Gang', 'UNC1878', 'Periwinkle Tempest'],
    suspected_origin: 'Russia',
    target_sectors: ['Healthcare', 'Financial', 'Ransomware'],
  },
  FIN7: {
    mitre_id: 'G0046',
    aliases: ['FIN7', 'Carbon Spider', 'Sangria Tempest'],
    suspected_origin: 'Russia',
    target_sectors: ['Retail', 'Hospitality', 'Financial'],
  },
  Armageddon: {
    mitre_id: 'G0017',
    aliases: ['Armageddon', 'Gamaredon', 'Bugdropper', 'Iron Tilden'],
    suspected_origin: 'Russia',
    target_sectors: ['Government', 'Ukraine-focused'],
  },
  'Turla Snake': {
    mitre_id: null,
    aliases: ['Turla Snake', 'Uroburos'],
    suspected_origin: 'Russia',
    target_sectors: ['Intelligence', 'Government'],
  },
  BelBear: {
    mitre_id: null,
    aliases: ['BelBear', 'Ghostwriter'],
    suspected_origin: 'Belarus',
    target_sectors: ['Government', 'Media', 'Defense'],
  },

  // ── China ────────────────────────────────────────────────────────────────
  APT41: {
    mitre_id: 'G0096',
    aliases: ['APT41', 'Double Dragon', 'Winnti', 'Wicked Panda', 'BARIUM'],
    suspected_origin: 'China',
    target_sectors: ['Gaming', 'Healthcare', 'Telecom', 'Supply Chain'],
  },
  APT1: {
    mitre_id: 'G0006',
    aliases: ['APT1', 'Comment Crew', 'Comment Panda', 'PLA Unit 61398'],
    suspected_origin: 'China',
    target_sectors: ['Manufacturing', 'Defense'],
  },
  APT10: {
    mitre_id: 'G0045',
    aliases: ['APT10', 'Stone Panda', 'MenuPass', 'Red Apollo', 'Cicada'],
    suspected_origin: 'China',
    target_sectors: ['MSPs', 'Cloud Providers', 'Government'],
  },
  APT40: {
    mitre_id: 'G0065',
    aliases: ['APT40', 'Leviathan', 'TEMP.Periscope', 'Kryptonite Panda', 'Gingham Typhoon'],
    suspected_origin: 'China',
    target_sectors: ['Maritime', 'Defense', 'Research'],
  },
  'Volt Typhoon': {
    mitre_id: 'G1017',
    aliases: ['Volt Typhoon', 'Vanguard Panda', 'BRONZE SILHOUETTE'],
    suspected_origin: 'China',
    target_sectors: ['Critical Infrastructure', 'Communications', 'Utilities'],
  },
  'Mustang Panda': {
    mitre_id: 'G0129',
    aliases: ['Mustang Panda', 'TA416', 'Bronze President', 'Red Lich'],
    suspected_origin: 'China',
    target_sectors: ['NGOs', 'Government', 'Southeast Asia'],
  },
  'Winnti Group': {
    mitre_id: 'G0044',
    aliases: ['Winnti Group', 'Blackfly', 'Bronze Atlas'],
    suspected_origin: 'China',
    target_sectors: ['Gaming', 'Pharmaceuticals'],
  },
  'Lotus Blossom': {
    mitre_id: 'G0030',
    aliases: ['Lotus Blossom', 'Spring Dragon', 'Billbug'],
    suspected_origin: 'China',
    target_sectors: ['Government - Southeast Asia'],
  },
  'Earth Lusca': {
    mitre_id: null,
    aliases: ['Earth Lusca', 'TAG-22'],
    suspected_origin: 'China',
    target_sectors: ['Government', 'Gambling', 'Media'],
  },
  BlackTech: {
    mitre_id: 'G0098',
    aliases: ['BlackTech', 'Palmerworm', 'Circuit Panda'],
    suspected_origin: 'China',
    target_sectors: ['Telecom', 'Government - East Asia'],
  },
  Hafnium: {
    mitre_id: 'G0106',
    aliases: ['Hafnium', 'Widow Cricket', 'Lead Goanna'],
    suspected_origin: 'China',
    target_sectors: ['Healthcare', 'Universities', 'Research'],
  },
  'Flax Typhoon': {
    mitre_id: 'G1024',
    aliases: ['Flax Typhoon', 'DHAMPIR'],
    suspected_origin: 'China',
    target_sectors: ['IoT', 'Critical Infrastructure', 'Taiwan'],
  },
  'Salt Typhoon': {
    mitre_id: 'G1038',
    aliases: ['Salt Typhoon', 'Camaro Dragon'],
    suspected_origin: 'China',
    target_sectors: ['Telecom', 'Government'],
  },
  'Charcoal Typhoon': {
    mitre_id: 'G1040',
    aliases: ['Charcoal Typhoon', 'CHROMIUM'],
    suspected_origin: 'China',
    target_sectors: ['Government', 'NGOs', 'Education'],
  },
  'Brass Typhoon': {
    mitre_id: 'G0035',
    aliases: ['Brass Typhoon', 'APT14'],
    suspected_origin: 'China',
    target_sectors: ['Telecom', 'Defense'],
  },
  Naikon: {
    mitre_id: 'G0019',
    aliases: ['Naikon', 'Nexus Zt'],
    suspected_origin: 'China',
    target_sectors: ['Government', 'Military - APAC'],
  },

  // ── North Korea ──────────────────────────────────────────────────────────
  'Lazarus Group': {
    mitre_id: 'G0032',
    aliases: ['Lazarus Group', 'Hidden Cobra', 'Guardians of Peace', 'APT38', 'Zinc', 'Diamond Sleet'],
    suspected_origin: 'North Korea',
    target_sectors: ['Financial', 'Cryptocurrency', 'Defense'],
  },
  Kimsuky: {
    mitre_id: 'G0094',
    aliases: ['Kimsuky', 'Velvet Chollima', 'Black Banshee', 'Emerald Sleet', 'Thallium'],
    suspected_origin: 'North Korea',
    target_sectors: ['Think Tanks', 'Government', 'Nuclear Policy'],
  },
  Andariel: {
    mitre_id: 'G0138',
    aliases: ['Andariel', 'Silent Chollima', 'Onyx Sleet', 'Stonefly'],
    suspected_origin: 'North Korea',
    target_sectors: ['Defense', 'Healthcare', 'Financial'],
  },
  APT38: {
    mitre_id: 'G0082',
    aliases: ['APT38', 'Bluenoroff', 'Stardust Chollima'],
    suspected_origin: 'North Korea',
    target_sectors: ['Financial', 'Cryptocurrency', 'Banks'],
  },
  'Labyrinth Chollima': {
    mitre_id: 'G0156',
    aliases: ['Labyrinth Chollima', 'Stardust'],
    suspected_origin: 'North Korea',
    target_sectors: ['Defense', 'Government'],
  },

  // ── Iran ─────────────────────────────────────────────────────────────────
  APT33: {
    mitre_id: 'G0064',
    aliases: ['APT33', 'Elfin', 'Refined Kitten', 'Peach Sandstorm'],
    suspected_origin: 'Iran',
    target_sectors: ['Aviation', 'Energy', 'Petrochemical'],
  },
  APT34: {
    mitre_id: 'G0049',
    aliases: ['APT34', 'OilRig', 'Helix Kitten', 'Crambus', 'Cobalt Gypsy'],
    suspected_origin: 'Iran',
    target_sectors: ['Government', 'Financial', 'Energy'],
  },
  APT35: {
    mitre_id: 'G0059',
    aliases: ['APT35', 'Charming Kitten', 'Phosphorus', 'Mint Sandstorm', 'TA453'],
    suspected_origin: 'Iran',
    target_sectors: ['Academia', 'Government', 'Media'],
  },
  MuddyWater: {
    mitre_id: 'G0069',
    aliases: ['MuddyWater', 'Mango Sandstorm', 'Static Kitten', 'Seedworm'],
    suspected_origin: 'Iran',
    target_sectors: ['Telecom', 'Government', 'Oil and Gas'],
  },
  Agrius: {
    mitre_id: 'G1030',
    aliases: ['Agrius', 'Pink Sandstorm', 'BlackShadow'],
    suspected_origin: 'Iran',
    target_sectors: ['Israel-focused', 'Diamond Industry'],
  },
  APT39: {
    mitre_id: 'G0087',
    aliases: ['APT39', 'Chafer', 'Remix Kitten'],
    suspected_origin: 'Iran',
    target_sectors: ['Telecom', 'Travel'],
  },
  APT42: {
    mitre_id: 'G1044',
    aliases: ['APT42', 'Charming Kitten subgroup', 'Damselfly'],
    suspected_origin: 'Iran',
    target_sectors: ['NGOs', 'Journalists', 'Activists'],
  },
  'Cobalt Sandstorm': {
    mitre_id: 'G1027',
    aliases: ['Cobalt Sandstorm', 'Cobalt Gypsy'],
    suspected_origin: 'Iran',
    target_sectors: ['Telecom', 'Defense'],
  },

  // ── North Korea / DPRK (additional) ─────────────────────────────────────
  DarkSeoul: {
    mitre_id: null,
    aliases: ['DarkSeoul', 'Jestefuna'],
    suspected_origin: 'North Korea',
    target_sectors: ['Banking', 'Media - South Korea'],
  },

  // ── North America / Western ──────────────────────────────────────────────
  'Equation Group': {
    mitre_id: 'G0020',
    aliases: ['Equation Group', 'Equation'],
    suspected_origin: 'USA (alleged)',
    target_sectors: ['Telecom', 'Government'],
  },

  // ── South America ────────────────────────────────────────────────────────
  'APT-C-36': {
    mitre_id: null,
    aliases: ['APT-C-36', 'Blind Eagle'],
    suspected_origin: 'South America',
    target_sectors: ['Colombia', 'Government', 'Financial'],
  },
  Machete: {
    mitre_id: 'G0095',
    aliases: ['Machete', 'APT-C-43'],
    suspected_origin: 'South America',
    target_sectors: ['Military', 'Government - LATAM'],
  },

  // ── East Asia ────────────────────────────────────────────────────────────
  DarkHotel: {
    mitre_id: 'G0012',
    aliases: ['DarkHotel', 'APT-C-06', 'Tapaoux'],
    suspected_origin: 'South Korea (alleged)',
    target_sectors: ['Hospitality', 'Executives'],
  },

  // ── Financial / Ecrime ───────────────────────────────────────────────────
  FIN12: { mitre_id: 'G1004', aliases: ['FIN12'], suspected_origin: 'Unknown', target_sectors: ['Healthcare'] },
  'Scattered Spider': {
    mitre_id: 'G1015',
    aliases: ['Scattered Spider', 'UNC3944', 'Octo Tempest', 'Muddled Libra'],
    suspected_origin: 'Unknown (English-speaking)',
    target_sectors: ['Telecom', 'BPO', 'Gaming', 'Retail'],
  },
  Clop: {
    mitre_id: null,
    aliases: ['Clop', 'Cl0p', 'TA505'],
    suspected_origin: 'Russia',
    target_sectors: ['Supply Chain', 'Ransomware', 'Government'],
  },
  'ALPHV/BlackCat': {
    mitre_id: null,
    aliases: ['ALPHV', 'BlackCat', 'Noberus'],
    suspected_origin: 'Russia',
    target_sectors: ['Healthcare', 'Critical Infrastructure', 'Ransomware'],
  },
  LockBit: {
    mitre_id: null,
    aliases: ['LockBit', 'LockBit 2.0', 'LockBit 3.0', 'LockBit Supp'],
    suspected_origin: 'Russia',
    target_sectors: ['Ransomware', 'Multiple Sectors'],
  },
  Conti: {
    mitre_id: null,
    aliases: ['Conti', 'TrickBot', 'Ryuk'],
    suspected_origin: 'Russia',
    target_sectors: ['Healthcare', 'Government', 'Ransomware'],
  },

  // ── South Asia ───────────────────────────────────────────────────────────
  'Transparent Tribe': {
    mitre_id: 'G0134',
    aliases: ['Transparent Tribe', 'APT36', 'Mythic Leopard'],
    suspected_origin: 'Pakistan',
    target_sectors: ['Government', 'Military - India focus'],
  },
  SideWinder: {
    mitre_id: 'G0121',
    aliases: ['SideWinder', 'Rattlesnake', 'T-APT-04'],
    suspected_origin: 'India (alleged)',
    target_sectors: ['Government', 'Military - South Asia'],
  },
  Patchwork: {
    mitre_id: 'G0040',
    aliases: ['Patchwork', 'Dropping Elephant', 'APT-C-09'],
    suspected_origin: 'India (alleged)',
    target_sectors: ['Government', 'Think Tanks - South Asia'],
  },
  Bitter: {
    mitre_id: 'G1002',
    aliases: ['Bitter', 'APT-C-08', 'T-APT-17'],
    suspected_origin: 'South Asia',
    target_sectors: ['Government', 'Energy - South Asia'],
  },

  // ── Middle East ──────────────────────────────────────────────────────────
  Molerats: {
    mitre_id: 'G0021',
    aliases: ['Molerats', 'Gaza Cybergang', 'TA402'],
    suspected_origin: 'Middle East',
    target_sectors: ['Government - Middle East'],
  },
  OceanLotus: {
    mitre_id: 'G0050',
    aliases: ['OceanLotus', 'APT32', 'SeaLotus', 'Canvas Cyclone'],
    suspected_origin: 'Vietnam',
    target_sectors: ['Manufacturing', 'Media', 'ASEAN Government'],
  },
  OilRig: {
    mitre_id: 'G0049',
    aliases: ['OilRig', 'APT34', 'Helix Kitten'],
    suspected_origin: 'Iran',
    target_sectors: ['Energy', 'Government'],
  },

  // ── Unknown / Multi-origin ───────────────────────────────────────────────
  RedCurl: {
    mitre_id: null,
    aliases: ['RedCurl', 'Earth Kapre'],
    suspected_origin: 'Unknown',
    target_sectors: ['Corporate Espionage'],
  },
  FIN8: {
    mitre_id: 'G0092',
    aliases: ['FIN8', 'DarkHydrus'],
    suspected_origin: 'Unknown',
    target_sectors: ['Healthcare', 'Hospitality', 'Financial'],
  },
  'Cobalt Group': {
    mitre_id: 'G0080',
    aliases: ['Cobalt Group', 'Carbanak', 'Anunak'],
    suspected_origin: 'Unknown',
    target_sectors: ['Financial', 'ATM', 'POS'],
  },
  DarkSide: {
    mitre_id: null,
    aliases: ['DarkSide'],
    suspected_origin: 'Russia',
    target_sectors: ['Energy', 'Healthcare', 'Ransomware'],
  },
  Hive: { mitre_id: null, aliases: ['Hive'], suspected_origin: 'Russia', target_sectors: ['Healthcare', 'Ransomware'] },
  BlackBasta: {
    mitre_id: null,
    aliases: ['BlackBasta', 'Black Basta'],
    suspected_origin: 'Russia',
    target_sectors: ['Healthcare', 'Ransomware'],
  },
  ScatteredLaPossa: {
    mitre_id: null,
    aliases: ['ScatteredLaPossa', 'Scattered G00LA'],
    suspected_origin: 'Unknown',
    target_sectors: ['Ransomware', 'Telecom'],
  },
  'Vice Society': {
    mitre_id: null,
    aliases: ['Vice Society'],
    suspected_origin: 'Unknown',
    target_sectors: ['Education', 'Ransomware'],
  },
  DarkAngels: {
    mitre_id: null,
    aliases: ['DarkAngels', 'Dark Angels'],
    suspected_origin: 'Russia',
    target_sectors: ['Healthcare', 'Ransomware'],
  },
  // ── Additional Ecrime / Ransomware ─────────────────────────────────────
  RansomHub: {
    mitre_id: null,
    aliases: ['RansomHub', 'Greenbender'],
    suspected_origin: 'Unknown',
    target_sectors: ['Ransomware', 'Multiple Sectors'],
  },
  Play: {
    mitre_id: null,
    aliases: ['Play', 'PlayCrypt'],
    suspected_origin: 'Unknown',
    target_sectors: ['Ransomware', 'Multiple Sectors'],
  },
  Royal: {
    mitre_id: null,
    aliases: ['Royal', 'BlackSuit'],
    suspected_origin: 'Russia',
    target_sectors: ['Ransomware', 'Healthcare'],
  },
  Rhysida: {
    mitre_id: null,
    aliases: ['Rhysida'],
    suspected_origin: 'Unknown',
    target_sectors: ['Healthcare', 'Education', 'Ransomware'],
  },
  Medusa: {
    mitre_id: null,
    aliases: ['Medusa', 'MedusaLocker'],
    suspected_origin: 'Unknown',
    target_sectors: ['Healthcare', 'Ransomware'],
  },
  Akira: {
    mitre_id: null,
    aliases: ['Akira', 'Akira Team'],
    suspected_origin: 'Unknown',
    target_sectors: ['Ransomware', 'Multiple Sectors'],
  },
  '8Base': {
    mitre_id: null,
    aliases: ['8Base', 'Phango'],
    suspected_origin: 'Unknown',
    target_sectors: ['Ransomware', 'Multiple Sectors'],
  },
  Embargo: {
    mitre_id: null,
    aliases: ['Embargo'],
    suspected_origin: 'Unknown',
    target_sectors: ['Ransomware', 'Healthcare'],
  },
  SafePay: {
    mitre_id: null,
    aliases: ['SafePay', 'Safepay Ransomware'],
    suspected_origin: 'Unknown',
    target_sectors: ['Ransomware', 'Multiple Sectors'],
  },
  // ── Additional China ────────────────────────────────────────────────────
  'Iron Tiger': {
    mitre_id: null,
    aliases: ['Iron Tiger', 'Emissary Panda', 'APT17', 'Deputy Dog'],
    suspected_origin: 'China',
    target_sectors: ['Defense', 'Technology', 'Telecom'],
  },
  APT23: {
    mitre_id: 'G0008',
    aliases: ['APT23', 'Defray', 'Deep Panda'],
    suspected_origin: 'China',
    target_sectors: ['Healthcare', 'Government', 'Defense'],
  },
  // ── Infostealer operators ──────────────────────────────────────────────
  'Lumma Operator': {
    mitre_id: null,
    aliases: ['Lumma', 'LummaC2', 'Lumma Stealer'],
    suspected_origin: 'Unknown',
    target_sectors: ['Infostealer', 'Credential Theft'],
  },
  'Raccoon Operator': {
    mitre_id: null,
    aliases: ['Raccoon', 'Raccoon Stealer', 'Raccoon2'],
    suspected_origin: 'Unknown',
    target_sectors: ['Infostealer', 'Credential Theft'],
  },
  'RedLine Operator': {
    mitre_id: null,
    aliases: ['RedLine', 'RedLine Stealer'],
    suspected_origin: 'Unknown',
    target_sectors: ['Infostealer', 'Credential Theft'],
  },
  'Vidar Operator': {
    mitre_id: null,
    aliases: ['Vidar', 'Vidar Stealer'],
    suspected_origin: 'Unknown',
    target_sectors: ['Infostealer', 'Credential Theft'],
  },
};

/** Flat alias map: lowercase alias → canonical group name */
export const ALIAS_MAP: Record<string, string> = {};
for (const [name, meta] of Object.entries(APT_GROUPS)) {
  for (const alias of meta.aliases) ALIAS_MAP[alias.toLowerCase()] = name;
}

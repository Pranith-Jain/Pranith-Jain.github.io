/**
 * Curated alias → canonical-actor index for the heuristic extractor.
 *
 * The frontend keeps a richer threat-actor catalog in
 * `src/data/dfir/threat-actors.ts`. This worker-side file holds the minimal
 * shape the extractor needs:
 *   - `canonical`  — display name used in STIX `threat-actor.name`
 *   - `aliases`    — case-insensitive whole-word match candidates
 *   - `mitreId`    — optional MITRE ATT&CK group ID (G####) for cross-refs
 *   - `slug`       — stable identifier for STIX UUIDv5 derivation
 *
 * Coverage policy: every well-known APT cluster tracked by at least one
 * mainstream vendor (Mandiant FireEye APT-numbering, CrowdStrike animals,
 * Microsoft weather, Secureworks Bronze/Iron) plus active ransomware
 * operators and notable hacktivist groups. MITRE G-IDs are populated only
 * where verified against the MITRE ATT&CK catalogue — extraction works
 * without them (canonical-name + aliases drive the match), the ID just
 * enables the ATT&CK external_reference cross-link in the emitted STIX
 * `threat-actor` object.
 */
export interface ActorAlias {
  slug: string;
  canonical: string;
  aliases: string[];
  mitreId?: string;
}

export const ACTOR_ALIASES: ActorAlias[] = [
  // =====================================================================
  // CHINESE — APT numbered clusters + Panda + Microsoft Typhoon naming
  // =====================================================================
  {
    slug: 'apt1',
    canonical: 'APT1',
    aliases: ['Comment Crew', 'Comment Panda', 'PLA Unit 61398', 'Byzantine Candor'],
    mitreId: 'G0006',
  },
  { slug: 'apt3', canonical: 'APT3', aliases: ['Gothic Panda', 'TG-0110', 'Buckeye', 'UPS Team'], mitreId: 'G0022' },
  { slug: 'apt5', canonical: 'APT5', aliases: ['Manganese', 'Keyhole Panda', 'UNC2630'], mitreId: 'G1023' },
  {
    slug: 'apt10',
    canonical: 'APT10',
    aliases: ['Stone Panda', 'menuPass', 'Cicada', 'Potassium', 'Bronze Riverside'],
    mitreId: 'G0045',
  },
  {
    slug: 'apt12',
    canonical: 'APT12',
    aliases: ['Numbered Panda', 'IXESHE', 'DynCalc', 'Calc Team'],
    mitreId: 'G0005',
  },
  {
    slug: 'apt15',
    canonical: 'APT15',
    aliases: ['Vixen Panda', 'Ke3chang', 'Mirage', 'Playful Dragon', 'GREF', 'Royal APT', 'Nickel'],
    mitreId: 'G0004',
  },
  { slug: 'apt16', canonical: 'APT16', aliases: ['SVCMONDR'], mitreId: 'G0023' },
  {
    slug: 'apt17',
    canonical: 'APT17',
    aliases: ['Deputy Dog', 'Tailgater Team', 'Hidden Lynx', 'Bronze Keystone'],
    mitreId: 'G0025',
  },
  { slug: 'apt18', canonical: 'APT18', aliases: ['Dynamite Panda', 'TG-0416', 'Wekby'], mitreId: 'G0026' },
  {
    slug: 'apt19',
    canonical: 'APT19',
    aliases: ['Codoso', 'C0d0so0', 'Codoso Team', 'Sunshop Group'],
    mitreId: 'G0073',
  },
  { slug: 'apt22', canonical: 'APT22', aliases: ['Bronze Olive', 'Suckfly'] },
  { slug: 'apt26', canonical: 'APT26', aliases: ['Hippo Team', 'JerseyMikes'] },
  {
    slug: 'apt27',
    canonical: 'APT27',
    aliases: ['Emissary Panda', 'Bronze Union', 'Iron Tiger', 'LuckyMouse', 'TG-3390'],
    mitreId: 'G0027',
  },
  { slug: 'apt30', canonical: 'APT30', aliases: ['Lotus Panda', 'Naikon'], mitreId: 'G0013' },
  {
    slug: 'apt31',
    canonical: 'APT31',
    aliases: ['Judgement Panda', 'Zirconium', 'Violet Typhoon', 'Red Keres'],
    mitreId: 'G0128',
  },
  {
    slug: 'apt40',
    canonical: 'APT40',
    aliases: ['Leviathan', 'Kryptonite Panda', 'Bronze Mohawk', 'TEMP.Periscope', 'TEMP.Jumper', 'Gingham Typhoon'],
    mitreId: 'G0065',
  },
  {
    slug: 'apt41',
    canonical: 'APT41',
    aliases: ['Winnti', 'BARIUM', 'Wicked Panda', 'Brass Typhoon', 'WICKED SPIDER', 'Blackfly', 'Earth Baku'],
    mitreId: 'G0096',
  },
  {
    slug: 'mustang-panda',
    canonical: 'Mustang Panda',
    aliases: ['Bronze President', 'RedDelta', 'Earth Preta', 'TA416', 'Camaro Dragon'],
    mitreId: 'G0129',
  },
  { slug: 'naikon', canonical: 'Naikon', aliases: ['Lotus Panda', 'Override Panda', 'Camerashy'], mitreId: 'G0019' },
  {
    slug: 'tropic-trooper',
    canonical: 'Tropic Trooper',
    aliases: ['KeyBoy', 'Pirate Panda', 'Bronze Hobart', 'Earth Centaur'],
    mitreId: 'G0081',
  },
  {
    slug: 'volt-typhoon',
    canonical: 'Volt Typhoon',
    aliases: ['VANGUARD PANDA', 'BRONZE SILHOUETTE', 'Insidious Taurus', 'DEV-0391'],
    mitreId: 'G1017',
  },
  { slug: 'salt-typhoon', canonical: 'Salt Typhoon', aliases: ['GhostEmperor', 'FamousSparrow', 'UNC2286'] },
  { slug: 'flax-typhoon', canonical: 'Flax Typhoon', aliases: ['Ethereal Panda'] },
  { slug: 'storm-0558', canonical: 'Storm-0558', aliases: ['Storm0558'] },
  {
    slug: 'darkhotel',
    canonical: 'DarkHotel',
    aliases: ['DUBNIUM', 'Karba', 'Tapaoux', 'Higaisa', 'Luder'],
    mitreId: 'G0012',
  },
  { slug: 'winnti', canonical: 'Winnti Group', aliases: ['Blackfly', 'Suckfly'], mitreId: 'G0044' },
  { slug: 'goblin-panda', canonical: 'Goblin Panda', aliases: ['Cycldek', '1937CN', 'Conimes', 'Hellsing'] },
  {
    slug: 'earth-lusca',
    canonical: 'Earth Lusca',
    aliases: ['TAG-22', 'Aquatic Panda', 'Charcoal Typhoon', 'Red Dev 10', 'Bronze University'],
  },
  { slug: 'mulberry-typhoon', canonical: 'Mulberry Typhoon', aliases: ['Manganese (deprecated)', 'Plant Typhoon'] },

  // =====================================================================
  // RUSSIAN — APT28/29 + Sandworm cluster + commercial-aligned crime
  // =====================================================================
  {
    slug: 'apt28',
    canonical: 'APT28',
    aliases: ['Fancy Bear', 'STRONTIUM', 'Sofacy', 'Pawn Storm', 'Forest Blizzard', 'Sednit', 'TsarTeam', 'TG-4127'],
    mitreId: 'G0007',
  },
  {
    slug: 'apt29',
    canonical: 'APT29',
    aliases: ['Cozy Bear', 'NOBELIUM', 'Midnight Blizzard', 'The Dukes', 'YTTRIUM', 'CozyDuke', 'Iron Hemlock'],
    mitreId: 'G0016',
  },
  {
    slug: 'sandworm',
    canonical: 'Sandworm',
    aliases: [
      'Voodoo Bear',
      'Iridium',
      'Seashell Blizzard',
      'BlackEnergy Group',
      'TeleBots',
      'Quedagh',
      'IRON VIKING',
      'Hades',
    ],
    mitreId: 'G0034',
  },
  {
    slug: 'turla',
    canonical: 'Turla',
    aliases: ['Snake', 'Venomous Bear', 'Secret Blizzard', 'Waterbug', 'Krypton', 'Uroburos', 'Iron Hunter'],
    mitreId: 'G0010',
  },
  {
    slug: 'gamaredon',
    canonical: 'Gamaredon',
    aliases: ['Primitive Bear', 'Aqua Blizzard', 'ACTINIUM', 'Armageddon', 'Shuckworm', 'Trident Ursa'],
    mitreId: 'G0047',
  },
  {
    slug: 'energetic-bear',
    canonical: 'Energetic Bear',
    aliases: ['Dragonfly', 'Crouching Yeti', 'Berserk Bear', 'Iron Liberty', 'TEMP.Isotope', 'Ghost Blizzard'],
    mitreId: 'G0035',
  },
  {
    slug: 'star-blizzard',
    canonical: 'Star Blizzard',
    aliases: ['Callisto', 'SEABORGIUM', 'COLDRIVER', 'TA446', 'Iron Frontier'],
  },
  { slug: 'dev-0537', canonical: 'DEV-0537', aliases: ['Strawberry Tempest'] },

  // =====================================================================
  // NORTH KOREAN — Lazarus umbrella + sub-clusters
  // =====================================================================
  {
    slug: 'lazarus',
    canonical: 'Lazarus Group',
    aliases: [
      'Lazarus',
      'Hidden Cobra',
      'Diamond Sleet',
      'ZINC',
      'Labyrinth Chollima',
      'Guardians of Peace',
      'APT-C-26',
      'Whois Team',
    ],
    mitreId: 'G0032',
  },
  {
    slug: 'apt37',
    canonical: 'APT37',
    aliases: ['Reaper', 'ScarCruft', 'Group 123', 'Ricochet Chollima', 'StarCruft', 'InkySquid', 'Geumseong121'],
    mitreId: 'G0067',
  },
  {
    slug: 'apt38',
    canonical: 'APT38',
    aliases: ['Bluenoroff', 'Stardust Chollima', 'TEMP.Hermit', 'Sapphire Sleet', 'CageyChameleon'],
    mitreId: 'G0082',
  },
  {
    slug: 'apt43',
    canonical: 'APT43',
    aliases: ['ARCHIPELAGO'],
  },
  {
    slug: 'kimsuky',
    canonical: 'Kimsuky',
    aliases: ['Velvet Chollima', 'THALLIUM', 'Emerald Sleet', 'Black Banshee', 'Mirae', 'TA406', 'Springtail'],
    mitreId: 'G0094',
  },
  {
    slug: 'andariel',
    canonical: 'Andariel',
    aliases: ['Onyx Sleet', 'PLUTONIUM', 'Silent Chollima', 'Stonefly', 'Jumpy Pisces'],
    mitreId: 'G0138',
  },

  // =====================================================================
  // IRANIAN — Kitten / Sandstorm cluster
  // =====================================================================
  {
    slug: 'apt33',
    canonical: 'APT33',
    aliases: ['Refined Kitten', 'Elfin', 'HOLMIUM', 'Peach Sandstorm', 'Magnallium'],
    mitreId: 'G0064',
  },
  {
    slug: 'apt34',
    canonical: 'APT34',
    aliases: ['OilRig', 'Helix Kitten', 'Hazel Sandstorm', 'EUROPIUM', 'IRN2', 'Cobalt Gypsy'],
    mitreId: 'G0049',
  },
  {
    slug: 'apt35',
    canonical: 'APT35',
    aliases: ['Charming Kitten', 'Phosphorus', 'Mint Sandstorm', 'TA453', 'Newscaster Team', 'Ajax Security Team'],
    mitreId: 'G0059',
  },
  { slug: 'apt39', canonical: 'APT39', aliases: ['Chafer', 'Remix Kitten', 'ITG07'], mitreId: 'G0087' },
  {
    slug: 'apt42',
    canonical: 'APT42',
    aliases: ['UNC788', 'Damselfly', 'Storm-2035', 'TA456'],
    mitreId: 'G1044',
  },
  {
    slug: 'muddywater',
    canonical: 'MuddyWater',
    aliases: ['Static Kitten', 'Mango Sandstorm', 'Mercury', 'Seedworm', 'Cobalt Ulster', 'TEMP.Zagros'],
    mitreId: 'G0069',
  },
  {
    slug: 'pioneer-kitten',
    canonical: 'Pioneer Kitten',
    aliases: ['Fox Kitten', 'PARISITE', 'UNC757', 'Lemon Sandstorm'],
  },
  {
    slug: 'cyber-avengers',
    canonical: 'CyberAv3ngers',
    aliases: ['Cyber Av3ngers', 'IRGC-affiliated hacktivists', 'Storm-0784'],
  },

  // =====================================================================
  // VIETNAMESE
  // =====================================================================
  {
    slug: 'apt32',
    canonical: 'APT32',
    aliases: ['OceanLotus', 'SeaLotus', 'BISMUTH', 'Cobalt Kitty', 'POND LOACH', 'Canvas Cyclone'],
    mitreId: 'G0050',
  },

  // =====================================================================
  // SOUTH ASIAN — India / Pakistan cluster
  // =====================================================================
  {
    slug: 'apt36',
    canonical: 'APT36',
    aliases: ['Transparent Tribe', 'Mythic Leopard', 'ProjectM', 'C-Major', 'Earth Karkaddan', 'COPPER FIELDSTONE'],
    mitreId: 'G0134',
  },
  {
    slug: 'sidewinder',
    canonical: 'SideWinder',
    aliases: ['Rattlesnake', 'T-APT-04', 'BabyElephant', 'Razor Tiger'],
    mitreId: 'G0121',
  },
  {
    slug: 'patchwork',
    canonical: 'Patchwork',
    aliases: ['Dropping Elephant', 'Chinastrats', 'Quilted Tiger', 'Monsoon', 'Hangover'],
    mitreId: 'G0040',
  },
  { slug: 'confucius', canonical: 'Confucius', aliases: ['Confucius APT'], mitreId: 'G0142' },
  { slug: 'donot', canonical: 'DoNot Team', aliases: ['APT-C-35', 'Viceroy Tiger', 'SectorE02'], mitreId: 'G0114' },

  // =====================================================================
  // MIDDLE-EASTERN — UAE/Saudi/regional clusters
  // =====================================================================
  { slug: 'stealth-falcon', canonical: 'Stealth Falcon', aliases: ['FruityArmor', 'Project Raven'], mitreId: 'G0038' },
  {
    slug: 'molerats',
    canonical: 'Molerats',
    aliases: ['Gaza Cybergang', 'Extreme Jackal', 'Moonlight'],
    mitreId: 'G0021',
  },

  // =====================================================================
  // EQUATION GROUP (US) — historical / signals-intel
  // =====================================================================
  { slug: 'equation-group', canonical: 'Equation Group', aliases: ['EquationDrug', 'Tilded Team'], mitreId: 'G0020' },

  // =====================================================================
  // CRIMINAL CLUSTERS — financially motivated, APT-class
  // =====================================================================
  {
    slug: 'fin7',
    canonical: 'FIN7',
    aliases: ['Carbanak', 'Navigator Group', 'Sangria Tempest', 'ITG14'],
    mitreId: 'G0046',
  },
  { slug: 'fin8', canonical: 'FIN8', aliases: ['Syssphinx'], mitreId: 'G0061' },
  { slug: 'fin11', canonical: 'FIN11', aliases: ['TA505 affiliate'] },
  { slug: 'fin12', canonical: 'FIN12', aliases: ['Pistachio Tempest', 'DEV-0237'] },
  { slug: 'ta505', canonical: 'TA505', aliases: ['Hive0065', 'Graceful Spider', 'CHIMBORAZO'], mitreId: 'G0092' },
  {
    slug: 'evil-corp',
    canonical: 'Evil Corp',
    aliases: ['INDRIK SPIDER', 'Manatee Tempest', 'TA505 collaborator', 'Gold Drake'],
    mitreId: 'G0119',
  },
  {
    slug: 'scattered-spider',
    canonical: 'Scattered Spider',
    aliases: ['UNC3944', '0ktapus', 'Octo Tempest', 'Muddled Libra', 'Storm-0875', 'Roasted 0ktapus'],
    mitreId: 'G1015',
  },
  {
    slug: 'wizard-spider',
    canonical: 'Wizard Spider',
    aliases: ['UNC1878', 'TEMP.MixMaster', 'Grim Spider', 'Periwinkle Tempest'],
    mitreId: 'G0102',
  },
  {
    slug: 'cobalt-group',
    canonical: 'Cobalt Group',
    aliases: ['Cobalt Gang', 'Cobalt Spider', 'GOLD KINGSWOOD'],
    mitreId: 'G0080',
  },

  // =====================================================================
  // HACKTIVIST / LEAK GROUPS
  // =====================================================================
  { slug: 'lapsus', canonical: 'LAPSUS$', aliases: ['Strawberry Tempest', 'DEV-0537'], mitreId: 'G1004' },
  { slug: 'killnet', canonical: 'KillNet', aliases: ['Killnet'] },
  { slug: 'anonymous-sudan', canonical: 'Anonymous Sudan', aliases: ['Storm-1359'] },
  { slug: 'team-insane-pk', canonical: 'Team Insane PK', aliases: ['Insane PK'] },

  // =====================================================================
  // RANSOMWARE OPERATORS
  // =====================================================================
  {
    slug: 'lockbit',
    canonical: 'LockBit',
    aliases: ['LockBit 3.0', 'LockBit Black', 'Bitwise Spider', 'LockBit Green', 'LockBit Red'],
    mitreId: 'G0125',
  },
  {
    slug: 'blackcat-alphv',
    canonical: 'BlackCat',
    aliases: ['ALPHV', 'Noberus', 'BlackCat ransomware gang'],
    mitreId: 'G1006',
  },
  { slug: 'cl0p', canonical: 'Clop', aliases: ['CL0P', 'Lace Tempest'] },
  { slug: 'royal', canonical: 'Royal', aliases: ['Royal Ransomware'] },
  { slug: 'black-basta', canonical: 'Black Basta', aliases: ['BlackBasta', 'Storm-1811', 'UNC4393'] },
  { slug: 'play', canonical: 'Play', aliases: ['PlayCrypt'] },
  { slug: 'rhysida', canonical: 'Rhysida', aliases: [] },
  { slug: 'akira', canonical: 'Akira', aliases: ['Storm-1567'] },
  { slug: 'medusa', canonical: 'Medusa', aliases: ['MedusaLocker', 'Spearwing'] },
  { slug: 'bianlian', canonical: 'BianLian', aliases: ['Bian Lian'] },
  { slug: 'cactus', canonical: 'Cactus', aliases: ['Cactus Ransomware'] },
  { slug: 'qilin', canonical: 'Qilin', aliases: ['Agenda'] },
  { slug: 'hunters-international', canonical: 'Hunters International', aliases: ['Hive successor'] },
  { slug: 'ransomhub', canonical: 'RansomHub', aliases: ['Ransom Hub'] },
  { slug: 'darkside', canonical: 'DarkSide', aliases: ['Carbon Spider'] },
  { slug: 'conti', canonical: 'Conti', aliases: ['Wizard Spider', 'TrickBot Group'] },
  { slug: 'hive', canonical: 'Hive', aliases: [] },
  { slug: 'revil', canonical: 'REvil', aliases: ['Sodinokibi', 'GandCrab successor', 'Pinchy Spider'] },
  { slug: 'inc-ransom', canonical: 'INC Ransom', aliases: ['INC Ransomware', 'GOLD IONIC'] },
  { slug: 'dragonforce', canonical: 'DragonForce', aliases: ['DragonForce Malaysia'] },
  { slug: '8base', canonical: '8Base', aliases: ['8base group'] },
  { slug: 'lynx', canonical: 'Lynx', aliases: ['INC Ransom rebrand (suspected)'] },
];

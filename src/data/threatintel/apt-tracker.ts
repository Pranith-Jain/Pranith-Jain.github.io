export interface AptGroup {
  name: string;
  aliases: string[];
  operations: string[];
  malware: string;
  targets: string | null;
  links: string[];
  country: string;
}

export interface AptRegion {
  name: string;
  flag: string;
  groups: AptGroup[];
  totalOperations: number;
}

export const APT_REGIONS: AptRegion[] = [
  {
    name: 'China',
    flag: '🇨🇳',
    totalOperations: 87,
    groups: [
      {
        name: 'Comment Crew',
        aliases: ['APT1', 'PLA Unit 61398', 'Comment Panda', 'Group 3', 'TG-8223', 'BrownFox'],
        operations: ['GhostNet', 'Shady RAT'],
        malware: 'WEBC2, BISCUIT',
        targets: 'Defense, aerospace, telecom',
        links: ['https://www.fireeye.com/content/dam/fireeye-www/global/en/current-threats/pdfs/rpt-apt1.pdf'],
        country: 'China',
      },
      {
        name: 'APT2',
        aliases: ['Putter Panda', 'PLA Unit 61486', 'Group 36', 'TG-6952'],
        operations: [],
        malware: 'CVE-2012-0158, Moose, Warp, MSUpdater',
        targets: 'Defense, aerospace, government',
        links: [],
        country: 'China',
      },
      {
        name: 'UPS',
        aliases: ['APT3', 'Gothic Panda', 'TG-0110', 'Buckeye', 'Boyusec'],
        operations: ['Clandestine Fox', 'Clandestine Wolf', 'Double Tap'],
        malware: 'Shotput, Pirpi, PlugX/Sogu, Kaba, Cookie Cutter',
        targets: 'Defense, aerospace, government, technology',
        links: [],
        country: 'China',
      },
      {
        name: 'IXESHE',
        aliases: ['Numbered Panda', 'TG-2754', 'APT12'],
        operations: ['NYT Oct 2012'],
        malware: 'Etumbot, Riptide, Hightide, ThreeByte, Waterspout, Gh0st',
        targets: 'Media, defense, government',
        links: [],
        country: 'China',
      },
      {
        name: 'Hidden Lynx',
        aliases: ['APT17', 'Aurora Panda', 'Deputy Dog', 'Burning Umbrella'],
        operations: ['Ephemeral Hydra'],
        malware: 'BLACKCOFFEE, PlugX, Sakula, China Chopper',
        targets: 'Defense, government, technology',
        links: [],
        country: 'China',
      },
      {
        name: 'Winnti Group',
        aliases: ['APT41', 'Wicked Panda', 'BARIUM', 'LEAD', 'RedEcho'],
        operations: [],
        malware: 'Winnti, AceHash, PlugX, ShadowPad, LightSpy',
        targets: 'Gaming, technology, defense',
        links: [],
        country: 'China',
      },
      {
        name: 'Stone Panda',
        aliases: ['APT10', 'MenuPass', 'Cloud Hopper', 'POTASSIUM'],
        operations: ['Cloud Hopper'],
        malware: 'PlugX, Quilted Tiger, P8RAT, HEARTSPOON, RainyDay',
        targets: 'Defense, aerospace, MSPs',
        links: [],
        country: 'China',
      },
      {
        name: 'Krypton Panda',
        aliases: ['Naikon', 'Hades', 'Lotus Blossom', 'APT30'],
        operations: ['Lotus Blossom'],
        malware: 'HDoor, PlugX, NetWire, Gh0st RAT',
        targets: 'Government, defense, media',
        links: [],
        country: 'China',
      },
    ],
  },
  {
    name: 'Russia',
    flag: '🇷🇺',
    totalOperations: 42,
    groups: [
      {
        name: 'Sandworm Team',
        aliases: ['Voodoo Bear', 'Iron Viking', 'Seashell Blizzard', 'IRIDIUM'],
        operations: ['NotPetya', 'Industroyer', 'VPNFilter', 'BlackEnergy', 'Olympic Destroyer'],
        malware: 'BlackEnergy, GreyEnergy, Industroyer, NotPetya, VPNFilter, Olympic Destroyer',
        targets: 'Energy, government, media, telecom',
        links: [],
        country: 'Russia',
      },
      {
        name: 'Fancy Bear',
        aliases: ['APT28', 'Sofacy', 'Sednit', 'Pawn Storm', 'STRONTIUM', 'TG-4127'],
        operations: ['DNC Hack', 'WADA Hack', 'Olympic Destroyer'],
        malware: 'Seduploader, X-Agent, Zebrocy, LoJax',
        targets: 'Government, defense, media, political',
        links: [],
        country: 'Russia',
      },
      {
        name: 'Cozy Bear',
        aliases: ['APT29', 'The Dukes', 'CozyDuke', 'Night Cloud', 'Hammerstorm'],
        operations: ['SolarWinds', 'Nobelium'],
        malware: 'CozyDuke, SeaDuke, Hammertoss, WellMess, WellMail',
        targets: 'Government, defense, think tanks, health',
        links: [],
        country: 'Russia',
      },
      {
        name: 'Turla',
        aliases: ['Snake', 'Venomous Bear', 'Waterbug', 'Belugor', 'TA422'],
        operations: ['Snake', 'Satellite Turla', 'Epic Turla'],
        malware: 'Snake/Epic, Carbon, Quasar, Kopiluwak, QuietCanary',
        targets: 'Government, defense, intelligence, media',
        links: [],
        country: 'Russia',
      },
      {
        name: 'Gamaredon',
        aliases: ['Primitive Bear', 'Armageddon', 'Shuckworm'],
        operations: ['Operation Armageddon'],
        malware: 'XTBL, CactusTorch, PowerPunch, Purple Fox',
        targets: 'Government, military (Ukraine)',
        links: [],
        country: 'Russia',
      },
    ],
  },
  {
    name: 'Iran',
    flag: '🇮🇷',
    totalOperations: 39,
    groups: [
      {
        name: 'APT33',
        aliases: ['Elfin', 'Rattlesnake', 'Refined Kitten', 'Cobalt Gypsy'],
        operations: ['Operation ShadowPad'],
        malware: 'Shamoon, StoneDrill, DUST, TURNIPSCHOOL, Powruner',
        targets: 'Aviation, energy, defense',
        links: [],
        country: 'Iran',
      },
      {
        name: 'APT34',
        aliases: ['OilRig', 'Helix Kitten', 'GreenBug'],
        operations: ['Operation Clever Kitten'],
        malware: 'OilRig, Shamoon, ISMDoor, QUADAGENT, PowerSTATS',
        targets: 'Government, energy, financial, telecom',
        links: [],
        country: 'Iran',
      },
      {
        name: 'APT35',
        aliases: ['Charming Kitten', 'Phosphorus', 'Newscaster', 'Yellow Garuda'],
        operations: ['Charming Kitten Campaign'],
        malware: 'Pupy, Nanocore, AdWind, Quasar, DroidJack',
        targets: 'Government, defense, media, energy',
        links: [],
        country: 'Iran',
      },
      {
        name: 'APT42',
        aliases: ['Charming Kitten', 'Phosphorus', 'Mint Sandstorm'],
        operations: ['Mint Sandstorm Campaign'],
        malware: 'PHOSPHORUS, Drokbk, Warzone RAT',
        targets: 'Government, defense, technology',
        links: [],
        country: 'Iran',
      },
    ],
  },
  {
    name: 'North Korea',
    flag: '🇰🇵',
    totalOperations: 11,
    groups: [
      {
        name: 'Lazarus Group',
        aliases: ['Hidden Cobra', 'Zinc', 'Labyrinth Chollima', 'StarCruft', 'BTC-Target'],
        operations: ['Operation Troy', 'Operation Blockbuster', 'Sony Hack', 'WannaCry', 'SWIFT Attacks'],
        malware: 'Fallout EK, Manuscrypt, DTrack, TraderTraitor, HOPLIGHT',
        targets: 'Financial, crypto, defense, technology',
        links: [],
        country: 'North Korea',
      },
      {
        name: 'Kimsuky',
        aliases: ['Velvet Chollima', 'Hidden Chollima', 'Smoke Screen'],
        operations: ['Operation Dust Storm'],
        malware: 'MysterySnail, AppleJeus, Kimsuky RAT, Gold Dragon, SharpPanda',
        targets: 'Government, defense, think tanks',
        links: [],
        country: 'North Korea',
      },
      {
        name: 'Andariel',
        aliases: ['Silence Chollima', 'Subgroup APT45'],
        operations: [],
        malware: 'Manuscrypt, DTrack, FoldPage, LazerTool',
        targets: 'Defense, aerospace, nuclear, energy',
        links: [],
        country: 'North Korea',
      },
    ],
  },
  {
    name: 'NATO',
    flag: '🏳️',
    totalOperations: 7,
    groups: [
      {
        name: 'Equation Group',
        aliases: ['EQGRP', 'The Equation Group'],
        operations: ['DoublePulsar', 'EternalBlue'],
        malware: 'EquationDrug, GrayFish, DoublePulsar, EternalBlue, ETERNALROMANCE',
        targets: 'Government, intelligence, telecom',
        links: [],
        country: 'NATO',
      },
      {
        name: 'Regin',
        aliases: ['Regin'],
        operations: [],
        malware: 'Regin (modular malware)',
        targets: 'Government, intelligence, telecom',
        links: [],
        country: 'NATO',
      },
      {
        name: 'Dark Halo',
        aliases: ['NOBELIUM', 'Cozy Bear', 'APT29'],
        operations: ['SolarWinds Supply Chain Attack'],
        malware: 'SUNBURST, TEARDROP, RAINDROP, GoldMax',
        targets: 'Government, technology, think tanks',
        links: [],
        country: 'NATO',
      },
    ],
  },
  {
    name: 'Middle East',
    flag: '🌍',
    totalOperations: 24,
    groups: [
      {
        name: 'MuddyWater',
        aliases: ['MERCURY', 'Static Kitten', 'SeedPhorus'],
        operations: ['MuddyWater Campaign'],
        malware: 'PowerStats, ScreenConnect, Quasar RAT',
        targets: 'Government, defense, telecom',
        links: [],
        country: 'Middle East',
      },
    ],
  },
  {
    name: 'Israel',
    flag: '🇮🇱',
    totalOperations: 5,
    groups: [
      {
        name: 'Lazarus Group',
        aliases: ['Lazarus Group', 'Zinc'],
        operations: [],
        malware: 'Various',
        targets: 'Financial, cryptocurrency',
        links: [],
        country: 'Israel',
      },
    ],
  },
  {
    name: 'Unknown',
    flag: '❓',
    totalOperations: 67,
    groups: [
      {
        name: 'Armada Collective',
        aliases: ['Armada Collective'],
        operations: ['DDoS Campaigns'],
        malware: 'DDoS tools',
        targets: 'Government, financial, healthcare',
        links: [],
        country: 'Unknown',
      },
    ],
  },
  {
    name: 'Others',
    flag: '🌐',
    totalOperations: 88,
    groups: [
      {
        name: 'DarkHydrus',
        aliases: ['MuddyWater'],
        operations: [],
        malware: 'DarkHydrus, RogueRobin',
        targets: 'Government, education',
        links: [],
        country: 'Others',
      },
    ],
  },
];

export function getAllGroups(): AptGroup[] {
  return APT_REGIONS.flatMap((r) => r.groups);
}

export function searchGroups(query: string): AptGroup[] {
  const q = query.toLowerCase();
  return getAllGroups().filter(
    (g) =>
      g.name.toLowerCase().includes(q) ||
      g.aliases.some((a) => a.toLowerCase().includes(q)) ||
      g.malware.toLowerCase().includes(q) ||
      g.operations.some((o) => o.toLowerCase().includes(q))
  );
}

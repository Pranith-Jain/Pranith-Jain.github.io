#!/usr/bin/env node
/**
 * Fetch wddadk/OSINT-for-countries README (raw markdown), parse per-country
 * sections, and emit a TypeScript data file for the OsintCountryMap page.
 *
 * Run: node scripts/generate-osint-countries.mjs
 * Output: src/data/threatintel/osint-countries.ts
 *
 * The raw README is MIT-licensed; our generated derivative inherits that.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RAW_URL = 'https://raw.githubusercontent.com/wddadk/OSINT-for-countries/main/README.md';
const OUT = resolve(ROOT, 'src/data/threatintel/osint-countries.ts');

const COUNTRY_COORDS = {
  AF: [67.7, 33.9],  AL: [20.2, 41.2],  DZ: [3.0, 28.0],  AD: [1.6, 42.5],
  AO: [17.5, -12.3], AG: [-61.8, 17.1], AR: [-63.6, -38.4], AM: [45.0, 40.1],
  AU: [134.5, -25.3], AT: [14.6, 47.5], AZ: [47.6, 40.1],  BS: [-77.4, 25.0],
  BH: [50.6, 26.0],  BD: [90.4, 23.7],  BB: [-59.5, 13.2], BY: [28.0, 53.7],
  BE: [4.7, 50.5],   BZ: [-88.5, 17.2], BJ: [2.3, 9.3],    BT: [90.4, 27.5],
  BO: [-63.6, -16.7], BA: [17.7, 43.9],  BW: [24.7, -22.3], BR: [-53.2, -10.8],
  BN: [114.9, 4.5],  BG: [25.5, 42.7],  BF: [-1.5, 12.2],  BI: [30.0, -3.4],
  KH: [104.9, 12.6], CM: [12.4, 5.7],   CA: [-106.3, 56.1], CV: [-23.6, 16.0],
  CF: [20.9, 6.6],   TD: [18.7, 15.5],  CL: [-71.5, -35.7], CN: [104.2, 35.9],
  CO: [-74.3, 4.6],  KM: [43.3, -11.9], CG: [15.8, -0.2],  CD: [23.7, -2.9],
  CR: [-84.0, 10.0], CI: [-5.6, 7.5],   HR: [15.2, 45.1],  CU: [-79.5, 21.5],
  CY: [33.4, 35.1],  CZ: [15.5, 49.8],  DK: [9.5, 56.0],   DJ: [42.6, 11.8],
  DM: [-61.4, 15.4], DO: [-70.7, 18.7], EC: [-78.2, -1.8],  EG: [30.8, 26.8],
  SV: [-88.9, 13.8], GQ: [10.3, 1.7],   ER: [37.8, 16.0],  EE: [25.6, 58.7],
  SZ: [31.6, -26.5], ET: [40.5, 9.1],   FJ: [165.0, -17.6], FI: [25.7, 61.9],
  FR: [2.2, 46.6],   GA: [11.7, -0.8],  GM: [-15.3, 13.4], GE: [43.4, 42.3],
  DE: [10.5, 51.2],  GH: [-0.2, 7.9],   GR: [21.8, 39.0],   GD: [-61.7, 12.1],
  GT: [-90.2, 15.7], GN: [-9.7, 9.8],   GW: [-14.9, 11.9], GY: [-58.9, 4.9],
  HT: [-72.3, 18.9], HN: [-86.6, 14.7], HU: [19.5, 47.2],  IS: [-19.0, 64.9],
  IN: [78.7, 22.4],  ID: [113.9, -0.8], IR: [53.7, 32.4],  IQ: [44.0, 33.0],
  IE: [-8.2, 53.4],  IL: [34.9, 31.0],  IT: [12.6, 41.9],  JM: [-77.3, 18.1],
  JP: [138.0, 36.2], JO: [36.0, 31.2],  KZ: [66.9, 48.2],  KE: [37.9, 0.5],
  KI: [169.5, 1.9],  KW: [47.5, 29.3],  KG: [74.5, 41.2],  LA: [102.5, 19.9],
  LV: [24.6, 56.9],  LB: [35.9, 33.9],  LS: [28.5, -29.5], LR: [-9.4, 6.4],
  LY: [17.5, 26.3],  LI: [9.5, 47.1],   LT: [23.9, 55.2],  LU: [6.1, 49.8],
  MG: [46.7, -18.8], MW: [34.3, -13.2], MY: [101.7, 3.2],  MV: [73.2, 3.2],
  ML: [-1.5, 17.3],  MT: [14.4, 35.9],  MH: [171.2, 7.3],  MR: [-10.3, 21.0],
  MU: [57.6, -20.3], MX: [-102.6, 23.6], FM: [158.2, 6.9],  MD: [28.6, 47.4],
  MC: [7.4, 43.7],   MN: [103.5, 46.8], ME: [19.3, 42.7],  MA: [-6.0, 32.0],
  MZ: [34.5, -18.7], MM: [96.0, 21.9],  NA: [17.2, -22.1], NR: [166.9, -0.5],
  NP: [84.1, 28.4],  NL: [5.3, 52.1],   NZ: [174.0, -41.0], NI: [-85.0, 12.9],
  NE: [9.4, 17.6],   NG: [8.7, 9.1],    KP: [127.5, 40.3], NO: [8.5, 60.5],
  OM: [55.3, 21.5],  PK: [69.3, 30.4],  PW: [134.4, 7.5],   PS: [35.2, 31.9],
  PA: [-80.1, 8.5],  PG: [146.0, -6.5], PY: [-58.3, -23.4], PE: [-74.9, -9.2],
  PH: [122.9, 11.8], PL: [19.1, 51.9],  PT: [-8.2, 39.4],   QA: [51.2, 25.3],
  RO: [25.0, 45.9],  RU: [105.3, 61.5],   RW: [30.0, -1.9],   KN: [-62.8, 17.3],
  LC: [-60.9, 13.9], VC: [-61.2, 13.3], WS: [-172.1, -13.7], SM: [12.5, 43.9],
  ST: [6.6, 1.0],    SA: [45.0, 23.9],  SN: [-14.4, 14.4],  RS: [20.8, 44.2],
  SC: [55.5, -4.7],  SL: [-11.6, 8.6],  SG: [103.8, 1.4],   SK: [19.7, 48.7],
  SI: [14.8, 46.1],  SB: [165.0, -9.5], SO: [48.5, 5.2],   ZA: [22.9, -30.6],
  KR: [127.8, 36.3], SS: [30.3, 7.5],   ES: [-3.7, 40.5],   LK: [80.6, 7.9],
  SD: [30.0, 12.9],  SR: [-55.9, 4.1],  SE: [18.6, 60.1],  CH: [8.2, 46.8],
  SY: [39.0, 34.8],  TW: [121.0, 23.7], TJ: [71.0, 38.5],  TZ: [34.8, -6.3],
  TH: [101.0, 15.9], TL: [125.7, -8.8], TG: [0.8, 8.6],    TO: [-175.0, -21.2],
  TT: [-61.2, 10.6], TN: [9.5, 33.9],   TR: [35.2, 39.0],  TM: [59.6, 38.9],
  TV: [179.2, -8.5], UG: [32.4, 1.3],   UA: [31.2, 49.0],  AE: [54.4, 23.4],
  GB: [-2.5, 54.4],  US: [-98.6, 39.8], UY: [-55.7, -32.5], UZ: [64.6, 41.4],
  VU: [168.0, -15.9], VA: [12.5, 41.9], VE: [-66.0, 6.4],   VN: [108.3, 14.1],
  YE: [48.5, 15.6],  ZM: [27.8, -13.1], ZW: [29.9, -19.0],
};

// Map folder names from the README to alpha-2 codes for territories
const TERRITORY_MAP = {
  'american samoa': 'AS', 'anguilla': 'AI', 'aruba': 'AW', 'bermuda': 'BM',
  'british virgin islands': 'VG', 'cayman islands': 'KY', 'cook islands': 'CK',
  'curaçao': 'CW', 'falkland islands': 'FK', 'faroe islands': 'FO',
  'french guiana': 'GF', 'french polynesia': 'PF', 'gibraltar': 'GI',
  'greenland': 'GL', 'guadeloupe': 'GP', 'guam': 'GU', 'hong kong': 'HK',
  'isle of man': 'IM', 'macao': 'MO', 'martinique': 'MQ',
  'mayotte': 'YT', 'montserrat': 'MS', 'new caledonia': 'NC',
  'northern mariana islands': 'MP', 'pitcairn islands': 'PN',
  'puerto rico': 'PR', 'réunion': 'RE', 'saint barthélemy': 'BL',
  'saint martin': 'MF', 'saint pierre and miquelon': 'PM',
  'sint maarten': 'SX', 'svalbard': 'SJ', 'tokelau': 'TK',
  'turks and caicos islands': 'TC', 'us virgin islands': 'VI',
  'wallis and futuna': 'WF', 'aland': 'AX',
  'akrotiri and dhekelia': '--', 'caribbean netherlands': 'BQ',
};

const nameToAlpha2 = {
  'afghanistan': 'AF', 'albania': 'AL', 'algeria': 'DZ', 'andorra': 'AD',
  'angola': 'AO', 'antigua and barbuda': 'AG', 'argentina': 'AR', 'armenia': 'AM',
  'australia': 'AU', 'austria': 'AT', 'azerbaijan': 'AZ', 'bahamas': 'BS',
  'bahrain': 'BH', 'bangladesh': 'BD', 'barbados': 'BB', 'belarus': 'BY',
  'belgium': 'BE', 'belize': 'BZ', 'benin': 'BJ', 'bhutan': 'BT',
  'bolivia': 'BO', 'bosnia and herzegovina': 'BA', 'botswana': 'BW', 'brazil': 'BR',
  'brunei': 'BN', 'bulgaria': 'BG', 'burkina faso': 'BF', 'burundi': 'BI',
  'cabo verde': 'CV', 'cambodia': 'KH', 'cameroon': 'CM', 'canada': 'CA',
  'central african republic': 'CF', 'chad': 'TD', 'chile': 'CL', 'china': 'CN',
  'colombia': 'CO', 'comoros': 'KM', 'congo': 'CG',
  'democratic republic of the congo': 'CD', 'costa rica': 'CR',
  "côte d'ivoire": 'CI', 'croatia': 'HR', 'cuba': 'CU', 'cyprus': 'CY',
  'czechia': 'CZ', 'denmark': 'DK', 'djibouti': 'DJ', 'dominica': 'DM',
  'dominican republic': 'DO', 'ecuador': 'EC', 'egypt': 'EG', 'el salvador': 'SV',
  'equatorial guinea': 'GQ', 'eritrea': 'ER', 'estonia': 'EE', 'eswatini': 'SZ',
  'ethiopia': 'ET', 'fiji': 'FJ', 'finland': 'FI', 'france': 'FR', 'gabon': 'GA',
  'gambia': 'GM', 'georgia': 'GE', 'germany': 'DE', 'ghana': 'GH', 'greece': 'GR',
  'grenada': 'GD', 'guatemala': 'GT', 'guinea': 'GN', 'guinea-bissau': 'GW',
  'guyana': 'GY', 'haiti': 'HT', 'honduras': 'HN', 'hungary': 'HU', 'iceland': 'IS',
  'india': 'IN', 'indonesia': 'ID', 'iran': 'IR', 'iraq': 'IQ', 'ireland': 'IE',
  'israel': 'IL', 'italy': 'IT', 'jamaica': 'JM', 'japan': 'JP', 'jordan': 'JO',
  'kazakhstan': 'KZ', 'kenya': 'KE', 'kiribati': 'KI', 'kuwait': 'KW',
  'kyrgyzstan': 'KG', 'laos': 'LA', 'latvia': 'LV', 'lebanon': 'LB',
  'lesotho': 'LS', 'liberia': 'LR', 'libya': 'LY', 'liechtenstein': 'LI',
  'lithuania': 'LT', 'luxembourg': 'LU', 'madagascar': 'MG', 'malawi': 'MW',
  'malaysia': 'MY', 'maldives': 'MV', 'mali': 'ML', 'malta': 'MT',
  'marshall islands': 'MH', 'mauritania': 'MR', 'mauritius': 'MU', 'mexico': 'MX',
  'micronesia': 'FM', 'moldova': 'MD', 'monaco': 'MC', 'mongolia': 'MN',
  'montenegro': 'ME', 'morocco': 'MA', 'mozambique': 'MZ', 'myanmar': 'MM',
  'namibia': 'NA', 'nauru': 'NR', 'nepal': 'NP', 'netherlands': 'NL',
  'new zealand': 'NZ', 'nicaragua': 'NI', 'niger': 'NE', 'nigeria': 'NG',
  'north korea': 'KP', 'north macedonia': 'MK', 'norway': 'NO', 'oman': 'OM',
  'pakistan': 'PK', 'palau': 'PW', 'palestine': 'PS', 'panama': 'PA',
  'papua new guinea': 'PG', 'paraguay': 'PY', 'peru': 'PE', 'philippines': 'PH',
  'poland': 'PL', 'portugal': 'PT', 'qatar': 'QA', 'romania': 'RO', 'russia': 'RU',
  'rwanda': 'RW', 'saint kitts and nevis': 'KN', 'saint lucia': 'LC',
  'saint vincent and the grenadines': 'VC', 'samoa': 'WS', 'san marino': 'SM',
  'sao tome and principe': 'ST', 'saudi arabia': 'SA', 'senegal': 'SN',
  'serbia': 'RS', 'seychelles': 'SC', 'sierra leone': 'SL', 'singapore': 'SG',
  'slovakia': 'SK', 'slovenia': 'SI', 'solomon islands': 'SB', 'somalia': 'SO',
  'south africa': 'ZA', 'south korea': 'KR', 'south sudan': 'SS', 'spain': 'ES',
  'sri lanka': 'LK', 'sudan': 'SD', 'suriname': 'SR', 'sweden': 'SE',
  'switzerland': 'CH', 'syria': 'SY', 'taiwan': 'TW', 'tajikistan': 'TJ',
  'tanzania': 'TZ', 'thailand': 'TH', 'togo': 'TG', 'tonga': 'TO',
  'trinidad and tobago': 'TT', 'tunisia': 'TN', 'turkey': 'TR', 'turkmenistan': 'TM',
  'tuvalu': 'TV', 'uganda': 'UG', 'ukraine': 'UA',
  'united arab emirates': 'AE', 'united kingdom': 'GB', 'united states': 'US',
  'uruguay': 'UY', 'usa': 'US', 'uzbekistan': 'UZ', 'vanuatu': 'VU',
  'vatican city': 'VA', 'venezuela': 'VE', 'vietnam': 'VN', 'yemen': 'YE',
  'zambia': 'ZM', 'zimbabwe': 'ZW',
};

function categorizeUrl(name, url) {
  const n = name.toLowerCase();
  const u = url.toLowerCase();
  if (u.includes('osintguru')) return 'osint-portal';
  if (u.includes('start.me')) return 'bookmarks';
  if (u.includes('github.com')) return 'github';
  if (u.includes('cyberint.uk')) return 'regional-guide';
  if (u.includes('cybdetective.com/osintmap')) return 'osint-portal';
  if (u.includes('substack.com') || u.includes('t.me/osint') || u.includes('telegram')) return 'community';
  if (u.includes('occrp.org')) return 'research';
  if (u.includes('sawest.eu')) return 'research';
  if (u.includes('disputesregister.org')) return 'company-registry';
  if (u.includes('gov.') || u.includes('.gov')) return 'government';
  if (u.includes('registr') || u.includes('businessreg') || u.includes('company')) return 'company-registry';
  if (n.includes('company reg') || n.includes('business reg') || n.includes('corporate')) return 'company-registry';
  if (n.includes('government') || n.includes('official')) return 'government';
  if (n.includes('guide') || n.includes('how to')) return 'guide';
  if (n.includes('osint of') || n.includes('osint tool') || n.includes('osint resource')) return 'osint-portal';
  if (n.includes('telegram') || n.includes('substack') || n.includes('blog') || n.includes('news')) return 'community';
  return 'general';
}

const CATEGORY_LABELS = {
  'osint-portal': 'OSINT Portal',
  'bookmarks': 'Bookmark Collection',
  'github': 'GitHub Repository',
  'regional-guide': 'Regional Guide',
  'community': 'Community / News',
  'research': 'Research Database',
  'company-registry': 'Company Registry',
  'government': 'Government Portal',
  'guide': 'Investigation Guide',
  'general': 'General Resource',
};

async function main() {
  const resp = await fetch(RAW_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${RAW_URL}`);
  const md = await resp.text();

  const lines = md.split('\n');
  const countries = [];
  let currentCountry = null;
  let currentName = '';
  let currentResources = [];

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      if (currentCountry) {
        countries.push({ name: currentName, resources: currentResources, alpha2: currentCountry });
      }
      const rawName = h2[1].replace(/\s*\[.*?\]\s*$/, '').trim();
      currentName = rawName;
      currentResources = [];
      // Look up alpha-2
      const key = rawName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
      currentCountry = nameToAlpha2[key] || TERRITORY_MAP[key] || '--';
      // Try alternative lookups
      if (currentCountry === '--') {
        for (const [k, v] of Object.entries(nameToAlpha2)) {
          if (key.includes(k) || k.includes(key)) { currentCountry = v; break; }
        }
      }
      if (currentCountry === '--') {
        for (const [k, v] of Object.entries(TERRITORY_MAP)) {
          if (key.includes(k) || k.includes(key)) { currentCountry = v; break; }
        }
      }
      continue;
    }
    // Skip non-list lines and already-parsed content
    if (currentCountry === '--' || !currentCountry) continue;
    // Skip TOC links (anchor-only)
    if (line.match(/^\s*-\s+\[.+\]\(#.+\)/)) continue;
    const link = line.match(/^\s*-\s+\[(.+?)\]\((.+?)\)/);
    if (link) {
      const [, name, url] = link;
      const cat = categorizeUrl(name, url);
      currentResources.push({
        name: name.replace(/\s*\(.*?\)\s*$/, '').trim() || name,
        url,
        category: cat,
      });
    }
  }
  if (currentCountry) {
    countries.push({ name: currentName, resources: currentResources, alpha2: currentCountry });
  }

  // Sort by country name
  countries.sort((a, b) => a.name.localeCompare(b.name));

  // Generate TS file
  const ts = `// Auto-generated by scripts/generate-osint-countries.mjs
// Source: https://github.com/wddadk/OSINT-for-countries (MIT)
// Regenerate: node scripts/generate-osint-countries.mjs

export interface OsintCountryResource {
  name: string;
  url: string;
  category: string;
}

export interface OsintCountry {
  name: string;
  alpha2: string;
  coords?: [number, number];
  resources: OsintCountryResource[];
}

export const CATEGORY_LABELS: Record<string, string> = ${JSON.stringify(CATEGORY_LABELS, null, 2)};

export const OSINT_COUNTRIES: OsintCountry[] = ${JSON.stringify(countries.map(c => ({
    ...c,
    coords: COUNTRY_COORDS[c.alpha2] || undefined,
    resources: c.resources,
  })), null, 2)};
`;

  await writeFile(OUT, ts, 'utf8');
  const totalResources = countries.reduce((s, c) => s + c.resources.length, 0);
  const withCoords = countries.filter(c => COUNTRY_COORDS[c.alpha2]).length;
  console.log(`✓ Generated ${OUT}`);
  console.log(`  ${countries.length} countries/territories, ${totalResources} total resources`);
  console.log(`  ${withCoords} have map coordinates (${countries.length - withCoords} without)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

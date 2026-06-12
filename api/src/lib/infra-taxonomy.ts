/**
 * Infrastructure type taxonomy — maps user-friendly names to OSM tags.
 * Inspired by ni5arga/sightline (481 stars, MIT). 200+ types across 30+ categories.
 *
 * Each entry maps a searchable key → Overpass QL tag filter(s).
 * `osmTags` is an array of { key, value } pairs OR { key } for any-value matches.
 */

export interface InfraType {
  key: string;
  label: string;
  category: string;
  osmTags: Array<{ key: string; value?: string }>;
  aliases?: string[];
}

export const INFRA_TYPES: InfraType[] = [
  // ── Energy & Power ──────────────────────────────────────────────────────
  {
    key: 'power_plant',
    label: 'Power Plant',
    category: 'Energy & Power',
    osmTags: [{ key: 'power', value: 'plant' }],
    aliases: ['powerplant', 'power station'],
  },
  {
    key: 'substation',
    label: 'Substation',
    category: 'Energy & Power',
    osmTags: [{ key: 'power', value: 'substation' }],
  },
  {
    key: 'transformer',
    label: 'Transformer',
    category: 'Energy & Power',
    osmTags: [{ key: 'power', value: 'transformer' }],
  },
  { key: 'switch', label: 'Power Switch', category: 'Energy & Power', osmTags: [{ key: 'power', value: 'switch' }] },
  {
    key: 'power_line',
    label: 'Power Line',
    category: 'Energy & Power',
    osmTags: [{ key: 'power', value: 'line' }],
    aliases: ['transmission line', 'powerline'],
  },
  {
    key: 'solar',
    label: 'Solar Farm',
    category: 'Energy & Power',
    osmTags: [
      { key: 'plant:source', value: 'solar' },
      { key: 'landuse', value: 'solar_farm' },
    ],
    aliases: ['solar panel', 'photovoltaic'],
  },
  {
    key: 'wind',
    label: 'Wind Farm',
    category: 'Energy & Power',
    osmTags: [
      { key: 'power', value: 'generator' },
      { key: 'generator:source', value: 'wind' },
    ],
    aliases: ['wind turbine', 'windmill power'],
  },
  {
    key: 'nuclear',
    label: 'Nuclear Plant',
    category: 'Energy & Power',
    osmTags: [{ key: 'plant:source', value: 'nuclear' }],
    aliases: ['nuclear_site', 'nuclear power'],
  },
  {
    key: 'hydroelectric',
    label: 'Hydroelectric Plant',
    category: 'Energy & Power',
    osmTags: [{ key: 'plant:source', value: 'hydro' }],
    aliases: ['hydro', 'dam power'],
  },
  {
    key: 'geothermal',
    label: 'Geothermal Plant',
    category: 'Energy & Power',
    osmTags: [{ key: 'plant:source', value: 'geothermal' }],
  },
  { key: 'coal', label: 'Coal Plant', category: 'Energy & Power', osmTags: [{ key: 'plant:source', value: 'coal' }] },
  {
    key: 'gas_power',
    label: 'Gas Power Plant',
    category: 'Energy & Power',
    osmTags: [{ key: 'plant:source', value: 'gas' }],
    aliases: ['natural gas plant'],
  },
  {
    key: 'biomass',
    label: 'Biomass Plant',
    category: 'Energy & Power',
    osmTags: [{ key: 'plant:source', value: 'biomass' }],
  },
  {
    key: 'battery_storage',
    label: 'Battery Storage',
    category: 'Energy & Power',
    osmTags: [
      { key: 'power', value: 'storage' },
      { key: 'technology', value: 'battery' },
    ],
    aliases: ['energy storage', 'bess'],
  },

  // ── Telecommunications ──────────────────────────────────────────────────
  {
    key: 'telecom',
    label: 'Telecom Tower',
    category: 'Telecom',
    osmTags: [
      { key: 'man_made', value: 'tower' },
      { key: 'tower:communication', value: 'mobile' },
    ],
    aliases: ['tower', 'cell tower', 'comms tower'],
  },
  { key: 'antenna', label: 'Antenna', category: 'Telecom', osmTags: [{ key: 'man_made', value: 'antenna' }] },
  { key: 'mast', label: 'Communication Mast', category: 'Telecom', osmTags: [{ key: 'man_made', value: 'mast' }] },
  {
    key: 'radio_tower',
    label: 'Radio Tower',
    category: 'Telecom',
    osmTags: [
      { key: 'man_made', value: 'tower' },
      { key: 'tower:communication', value: 'radio' },
    ],
  },
  {
    key: 'broadcast_tower',
    label: 'Broadcast Tower',
    category: 'Telecom',
    osmTags: [
      { key: 'man_made', value: 'tower' },
      { key: 'tower:communication', value: 'broadcast' },
    ],
    aliases: ['tv tower'],
  },
  {
    key: 'data_center',
    label: 'Data Center',
    category: 'Telecom',
    osmTags: [{ key: 'telecom', value: 'data_center' }],
    aliases: ['datacenter', 'data centre'],
  },
  {
    key: 'telephone_exchange',
    label: 'Telephone Exchange',
    category: 'Telecom',
    osmTags: [{ key: 'telecom', value: 'exchange' }],
  },

  // ── Oil, Gas & Mining ───────────────────────────────────────────────────
  {
    key: 'refinery',
    label: 'Oil Refinery',
    category: 'Oil & Gas',
    osmTags: [{ key: 'industrial', value: 'refinery' }],
  },
  { key: 'pipeline', label: 'Pipeline', category: 'Oil & Gas', osmTags: [{ key: 'man_made', value: 'pipeline' }] },
  {
    key: 'oil_well',
    label: 'Oil Well',
    category: 'Oil & Gas',
    osmTags: [{ key: 'man_made', value: 'petroleum_well' }],
    aliases: ['oil derrick'],
  },
  {
    key: 'storage_tank',
    label: 'Storage Tank',
    category: 'Oil & Gas',
    osmTags: [{ key: 'man_made', value: 'storage_tank' }],
  },
  {
    key: 'quarry',
    label: 'Quarry / Mine',
    category: 'Oil & Gas',
    osmTags: [{ key: 'landuse', value: 'quarry' }],
    aliases: ['mine', 'open pit'],
  },
  { key: 'landfill', label: 'Landfill', category: 'Oil & Gas', osmTags: [{ key: 'landuse', value: 'landfill' }] },

  // ── Water & Utilities ───────────────────────────────────────────────────
  { key: 'water_tower', label: 'Water Tower', category: 'Water', osmTags: [{ key: 'man_made', value: 'water_tower' }] },
  {
    key: 'water_treatment',
    label: 'Water Treatment',
    category: 'Water',
    osmTags: [{ key: 'man_made', value: 'water_works' }],
    aliases: ['water works'],
  },
  {
    key: 'wastewater',
    label: 'Wastewater Plant',
    category: 'Water',
    osmTags: [{ key: 'man_made', value: 'wastewater_plant' }],
    aliases: ['sewage', 'sewage plant'],
  },
  { key: 'dam', label: 'Dam', category: 'Water', osmTags: [{ key: 'waterway', value: 'dam' }] },
  { key: 'reservoir', label: 'Reservoir', category: 'Water', osmTags: [{ key: 'landuse', value: 'reservoir' }] },
  {
    key: 'pumping_station',
    label: 'Pumping Station',
    category: 'Water',
    osmTags: [{ key: 'man_made', value: 'pumping_station' }],
  },

  // ── Aviation ────────────────────────────────────────────────────────────
  {
    key: 'airport',
    label: 'Airport',
    category: 'Aviation',
    osmTags: [{ key: 'aeroway', value: 'aerodrome' }],
    aliases: ['airfield', 'airstrip'],
  },
  { key: 'helipad', label: 'Helipad', category: 'Aviation', osmTags: [{ key: 'aeroway', value: 'helipad' }] },
  { key: 'runway', label: 'Runway', category: 'Aviation', osmTags: [{ key: 'aeroway', value: 'runway' }] },
  { key: 'hangar', label: 'Aircraft Hangar', category: 'Aviation', osmTags: [{ key: 'aeroway', value: 'hangar' }] },
  {
    key: 'atc_tower',
    label: 'ATC Tower',
    category: 'Aviation',
    osmTags: [{ key: 'aeroway', value: 'control_tower' }],
    aliases: ['air traffic control'],
  },

  // ── Maritime ────────────────────────────────────────────────────────────
  {
    key: 'port',
    label: 'Port / Seaport',
    category: 'Maritime',
    osmTags: [
      { key: 'leisure', value: 'marina' },
      { key: 'landuse', value: 'port' },
    ],
    aliases: ['seaport', 'harbour'],
  },
  {
    key: 'ferry_terminal',
    label: 'Ferry Terminal',
    category: 'Maritime',
    osmTags: [{ key: 'amenity', value: 'ferry_terminal' }],
  },
  { key: 'shipyard', label: 'Shipyard', category: 'Maritime', osmTags: [{ key: 'industrial', value: 'shipyard' }] },
  { key: 'lighthouse', label: 'Lighthouse', category: 'Maritime', osmTags: [{ key: 'man_made', value: 'lighthouse' }] },
  { key: 'pier', label: 'Pier', category: 'Maritime', osmTags: [{ key: 'leisure', value: 'pier' }] },

  // ── Rail & Transit ──────────────────────────────────────────────────────
  {
    key: 'train_station',
    label: 'Train Station',
    category: 'Rail & Transit',
    osmTags: [{ key: 'railway', value: 'station' }],
    aliases: ['railway station'],
  },
  {
    key: 'railyard',
    label: 'Rail Yard',
    category: 'Rail & Transit',
    osmTags: [{ key: 'railway', value: 'yard' }],
    aliases: ['rail yard', 'marshalling yard'],
  },
  {
    key: 'metro',
    label: 'Metro Station',
    category: 'Rail & Transit',
    osmTags: [{ key: 'railway', value: 'subway_entrance' }],
    aliases: ['subway', 'underground'],
  },
  {
    key: 'tram_stop',
    label: 'Tram Stop',
    category: 'Rail & Transit',
    osmTags: [{ key: 'railway', value: 'tram_stop' }],
  },
  {
    key: 'bus_station',
    label: 'Bus Station',
    category: 'Rail & Transit',
    osmTags: [{ key: 'amenity', value: 'bus_station' }],
  },
  {
    key: 'level_crossing',
    label: 'Level Crossing',
    category: 'Rail & Transit',
    osmTags: [{ key: 'railway', value: 'level_crossing' }],
  },

  // ── Structures ──────────────────────────────────────────────────────────
  { key: 'bridge', label: 'Bridge', category: 'Structures', osmTags: [{ key: 'bridge', value: 'yes' }] },
  { key: 'tunnel', label: 'Tunnel', category: 'Structures', osmTags: [{ key: 'tunnel', value: 'yes' }] },
  {
    key: 'cooling_tower',
    label: 'Cooling Tower',
    category: 'Structures',
    osmTags: [{ key: 'man_made', value: 'cooling_tower' }],
  },
  { key: 'crane', label: 'Crane', category: 'Structures', osmTags: [{ key: 'man_made', value: 'crane' }] },
  { key: 'windmill', label: 'Windmill', category: 'Structures', osmTags: [{ key: 'man_made', value: 'windmill' }] },

  // ── Industrial ──────────────────────────────────────────────────────────
  { key: 'warehouse', label: 'Warehouse', category: 'Industrial', osmTags: [{ key: 'building', value: 'warehouse' }] },
  {
    key: 'factory',
    label: 'Factory',
    category: 'Industrial',
    osmTags: [{ key: 'building', value: 'factory' }],
    aliases: ['manufacturing'],
  },
  {
    key: 'industrial',
    label: 'Industrial Zone',
    category: 'Industrial',
    osmTags: [{ key: 'landuse', value: 'industrial' }],
  },
  { key: 'depot', label: 'Depot', category: 'Industrial', osmTags: [{ key: 'building', value: 'depot' }] },
  {
    key: 'recycling_plant',
    label: 'Recycling Plant',
    category: 'Industrial',
    osmTags: [{ key: 'amenity', value: 'recycling' }],
    aliases: ['recycling center'],
  },

  // ── Military & Defense ──────────────────────────────────────────────────
  {
    key: 'military',
    label: 'Military Installation',
    category: 'Military',
    osmTags: [{ key: 'landuse', value: 'military' }],
    aliases: ['military base', 'army base'],
  },
  { key: 'bunker', label: 'Bunker', category: 'Military', osmTags: [{ key: 'military', value: 'bunker' }] },
  { key: 'barracks', label: 'Barracks', category: 'Military', osmTags: [{ key: 'military', value: 'barracks' }] },
  { key: 'naval_base', label: 'Naval Base', category: 'Military', osmTags: [{ key: 'military', value: 'naval_base' }] },
  {
    key: 'range',
    label: 'Firing Range',
    category: 'Military',
    osmTags: [{ key: 'military', value: 'range' }],
    aliases: ['shooting range'],
  },
  {
    key: 'radar',
    label: 'Radar Installation',
    category: 'Military',
    osmTags: [{ key: 'man_made', value: 'radar' }],
    aliases: ['radar station'],
  },
  {
    key: 'ammunition',
    label: 'Ammunition Depot',
    category: 'Military',
    osmTags: [{ key: 'military', value: 'ammunition' }],
  },

  // ── Government & Public Safety ──────────────────────────────────────────
  { key: 'embassy', label: 'Embassy', category: 'Government', osmTags: [{ key: 'amenity', value: 'embassy' }] },
  {
    key: 'courthouse',
    label: 'Courthouse',
    category: 'Government',
    osmTags: [{ key: 'amenity', value: 'courthouse' }],
  },
  { key: 'townhall', label: 'Town Hall', category: 'Government', osmTags: [{ key: 'amenity', value: 'townhall' }] },
  { key: 'police', label: 'Police Station', category: 'Government', osmTags: [{ key: 'amenity', value: 'police' }] },
  {
    key: 'fire_station',
    label: 'Fire Station',
    category: 'Government',
    osmTags: [{ key: 'amenity', value: 'fire_station' }],
  },
  {
    key: 'prison',
    label: 'Prison',
    category: 'Government',
    osmTags: [{ key: 'amenity', value: 'prison' }],
    aliases: ['jail', 'correctional facility'],
  },
  { key: 'customs', label: 'Customs Office', category: 'Government', osmTags: [{ key: 'amenity', value: 'customs' }] },
  {
    key: 'border_control',
    label: 'Border Control',
    category: 'Government',
    osmTags: [{ key: 'barrier', value: 'border_control' }],
  },
  {
    key: 'surveillance_camera',
    label: 'Surveillance Camera',
    category: 'Government',
    osmTags: [{ key: 'man_made', value: 'surveillance' }],
    aliases: ['cctv', 'security camera'],
  },

  // ── Healthcare ──────────────────────────────────────────────────────────
  { key: 'hospital', label: 'Hospital', category: 'Healthcare', osmTags: [{ key: 'amenity', value: 'hospital' }] },
  { key: 'clinic', label: 'Clinic', category: 'Healthcare', osmTags: [{ key: 'amenity', value: 'clinic' }] },
  { key: 'pharmacy', label: 'Pharmacy', category: 'Healthcare', osmTags: [{ key: 'amenity', value: 'pharmacy' }] },
  {
    key: 'nursing_home',
    label: 'Nursing Home',
    category: 'Healthcare',
    osmTags: [{ key: 'amenity', value: 'nursing_home' }],
  },

  // ── Education ───────────────────────────────────────────────────────────
  { key: 'university', label: 'University', category: 'Education', osmTags: [{ key: 'amenity', value: 'university' }] },
  { key: 'school', label: 'School', category: 'Education', osmTags: [{ key: 'amenity', value: 'school' }] },
  { key: 'library', label: 'Library', category: 'Education', osmTags: [{ key: 'amenity', value: 'library' }] },
  {
    key: 'research',
    label: 'Research Institute',
    category: 'Education',
    osmTags: [{ key: 'amenity', value: 'research_institute' }],
    aliases: ['lab', 'laboratory'],
  },

  // ── Culture & Entertainment ─────────────────────────────────────────────
  { key: 'museum', label: 'Museum', category: 'Culture', osmTags: [{ key: 'amenity', value: 'museum' }] },
  { key: 'stadium', label: 'Stadium', category: 'Culture', osmTags: [{ key: 'leisure', value: 'stadium' }] },
  { key: 'theatre', label: 'Theatre', category: 'Culture', osmTags: [{ key: 'amenity', value: 'theatre' }] },
  { key: 'cinema', label: 'Cinema', category: 'Culture', osmTags: [{ key: 'amenity', value: 'cinema' }] },

  // ── Tourism ─────────────────────────────────────────────────────────────
  { key: 'hotel', label: 'Hotel', category: 'Tourism', osmTags: [{ key: 'tourism', value: 'hotel' }] },
  { key: 'campsite', label: 'Campsite', category: 'Tourism', osmTags: [{ key: 'tourism', value: 'camp_site' }] },
  { key: 'theme_park', label: 'Theme Park', category: 'Tourism', osmTags: [{ key: 'tourism', value: 'theme_park' }] },
  { key: 'viewpoint', label: 'Viewpoint', category: 'Tourism', osmTags: [{ key: 'tourism', value: 'viewpoint' }] },
  { key: 'zoo', label: 'Zoo', category: 'Tourism', osmTags: [{ key: 'tourism', value: 'zoo' }] },

  // ── Religious ───────────────────────────────────────────────────────────
  {
    key: 'church',
    label: 'Church',
    category: 'Religious',
    osmTags: [
      { key: 'amenity', value: 'place_of_worship' },
      { key: 'religion', value: 'christian' },
    ],
  },
  {
    key: 'mosque',
    label: 'Mosque',
    category: 'Religious',
    osmTags: [
      { key: 'amenity', value: 'place_of_worship' },
      { key: 'religion', value: 'muslim' },
    ],
  },
  {
    key: 'temple',
    label: 'Temple',
    category: 'Religious',
    osmTags: [
      { key: 'amenity', value: 'place_of_worship' },
      { key: 'religion', value: 'buddhist' },
    ],
  },
  {
    key: 'synagogue',
    label: 'Synagogue',
    category: 'Religious',
    osmTags: [
      { key: 'amenity', value: 'place_of_worship' },
      { key: 'religion', value: 'jewish' },
    ],
  },

  // ── Historic ────────────────────────────────────────────────────────────
  { key: 'castle', label: 'Castle', category: 'Historic', osmTags: [{ key: 'historic', value: 'castle' }] },
  { key: 'fort', label: 'Fort', category: 'Historic', osmTags: [{ key: 'historic', value: 'fort' }] },
  { key: 'monument', label: 'Monument', category: 'Historic', osmTags: [{ key: 'historic', value: 'monument' }] },
  {
    key: 'archaeological_site',
    label: 'Archaeological Site',
    category: 'Historic',
    osmTags: [{ key: 'historic', value: 'archaeological_site' }],
  },
  {
    key: 'observatory',
    label: 'Observatory',
    category: 'Historic',
    osmTags: [{ key: 'amenity', value: 'observatory' }],
  },

  // ── Agriculture ─────────────────────────────────────────────────────────
  { key: 'farm', label: 'Farm', category: 'Agriculture', osmTags: [{ key: 'landuse', value: 'farmland' }] },
  {
    key: 'greenhouse',
    label: 'Greenhouse',
    category: 'Agriculture',
    osmTags: [{ key: 'building', value: 'greenhouse' }],
  },
  { key: 'vineyard', label: 'Vineyard', category: 'Agriculture', osmTags: [{ key: 'landuse', value: 'vineyard' }] },
  { key: 'orchard', label: 'Orchard', category: 'Agriculture', osmTags: [{ key: 'landuse', value: 'orchard' }] },

  // ── Services ────────────────────────────────────────────────────────────
  {
    key: 'fuel',
    label: 'Fuel Station',
    category: 'Services',
    osmTags: [{ key: 'amenity', value: 'fuel' }],
    aliases: ['gas station', 'petrol station'],
  },
  {
    key: 'charging_station',
    label: 'EV Charging Station',
    category: 'Services',
    osmTags: [{ key: 'amenity', value: 'charging_station' }],
  },
  { key: 'bank', label: 'Bank', category: 'Services', osmTags: [{ key: 'amenity', value: 'bank' }] },
  { key: 'atm', label: 'ATM', category: 'Services', osmTags: [{ key: 'amenity', value: 'atm' }] },
  {
    key: 'post_office',
    label: 'Post Office',
    category: 'Services',
    osmTags: [{ key: 'amenity', value: 'post_office' }],
  },

  // ── Emergency ───────────────────────────────────────────────────────────
  {
    key: 'emergency_phone',
    label: 'Emergency Phone',
    category: 'Emergency',
    osmTags: [{ key: 'amenity', value: 'emergency_phone' }],
  },
  {
    key: 'defibrillator',
    label: 'Defibrillator',
    category: 'Emergency',
    osmTags: [{ key: 'emergency', value: 'defibrillator' }],
  },
  { key: 'siren', label: 'Emergency Siren', category: 'Emergency', osmTags: [{ key: 'man_made', value: 'siren' }] },

  // ── Cable Transport ─────────────────────────────────────────────────────
  {
    key: 'aerialway',
    label: 'Cable Car',
    category: 'Cable Transport',
    osmTags: [{ key: 'aerialway', value: 'cable_car' }],
  },
  { key: 'gondola', label: 'Gondola', category: 'Cable Transport', osmTags: [{ key: 'aerialway', value: 'gondola' }] },
  {
    key: 'chairlift',
    label: 'Chairlift',
    category: 'Cable Transport',
    osmTags: [{ key: 'aerialway', value: 'chair_lift' }],
  },

  // ── Monitoring ──────────────────────────────────────────────────────────
  {
    key: 'weather_station',
    label: 'Weather Station',
    category: 'Monitoring',
    osmTags: [{ key: 'man_made', value: 'weather_station' }],
  },
  {
    key: 'monitoring_station',
    label: 'Monitoring Station',
    category: 'Monitoring',
    osmTags: [{ key: 'man_made', value: 'monitoring_station' }],
  },

  // ── Community ───────────────────────────────────────────────────────────
  {
    key: 'community_centre',
    label: 'Community Centre',
    category: 'Community',
    osmTags: [{ key: 'amenity', value: 'community_centre' }],
  },
  { key: 'shelter', label: 'Shelter', category: 'Community', osmTags: [{ key: 'amenity', value: 'shelter' }] },
];

/** Flat lookup: key → InfraType (for fast matching). */
export const TYPE_BY_KEY = new Map(INFRA_TYPES.map((t) => [t.key, t]));

/** Build alias → key lookup for NLP matching. */
export function buildAliasIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const t of INFRA_TYPES) {
    idx.set(t.key, t.key);
    idx.set(t.label.toLowerCase(), t.key);
    if (t.aliases) for (const a of t.aliases) idx.set(a.toLowerCase(), t.key);
  }
  return idx;
}

/** All unique categories for filter UI. */
export function allCategories(): string[] {
  return [...new Set(INFRA_TYPES.map((t) => t.category))].sort();
}

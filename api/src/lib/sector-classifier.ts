/**
 * Heuristic sector classifier for ransomware victim names.
 *
 * Ransomlook doesn't expose sector metadata, so we infer it from victim
 * name + description using a curated keyword list. Best-effort — the
 * "Unknown" bucket catches ambiguous entries. Caller surfaces this as
 * a heuristic, not as ground truth.
 *
 * Order matters: more specific patterns come first (e.g. "hospital" hits
 * Healthcare before "care" can match anything ambiguous).
 */

export type Sector =
  | 'Healthcare'
  | 'Legal'
  | 'Education'
  | 'Government'
  | 'Finance'
  | 'Manufacturing'
  | 'Construction'
  | 'Engineering'
  | 'Technology'
  | 'Retail / E-commerce'
  | 'Hospitality'
  | 'Logistics'
  | 'Energy'
  | 'Real Estate'
  | 'Agriculture'
  | 'Media / Publishing'
  | 'Nonprofit'
  | 'Unknown';

interface Rule {
  sector: Sector;
  /** Lowercased keyword patterns. Match if any appears as a substring. */
  patterns: string[];
}

// Specific rules first; ambiguous keywords last.
const RULES: Rule[] = [
  {
    sector: 'Healthcare',
    patterns: [
      'hospital',
      'medical',
      'health',
      'clinic',
      'dental',
      'pharm',
      'medicine',
      'neuro',
      'surgery',
      'pediatric',
      'biotech',
      'biomed',
      'physiotherapy',
      'orthopaed',
      'orthoped',
      'cardio',
      'oncolog',
      'radiolog',
      'urolog',
      'gynec',
      'obstet',
      'psych',
      'therapy',
      'rehab',
      'wellness',
      'hospice',
      'nursing',
      'caregiv',
      'eldercare',
      'homecare',
      'carepoint',
      'preventive medicine',
      'family practice',
      'urgent care',
    ],
  },
  {
    sector: 'Legal',
    patterns: [
      'law firm',
      'law office',
      'attorney',
      'attorneys',
      ' law,',
      ' law ',
      'legal services',
      'lindabury',
      'llp',
      'lawpartners',
      'lawgroup',
      'counsel',
      'advoc',
      'barrister',
      'solicitor',
      'paralegal',
      'jurist',
      'tribunal',
      'litigation',
    ],
  },
  {
    sector: 'Education',
    patterns: [
      'school',
      'university',
      'college',
      'academ',
      'institute',
      'isd ',
      ' isd',
      'education',
      'learning center',
      'curriculum',
      'k-12',
      'high school',
      'elementary',
      'kindergarten',
      'tutor',
      'preschool',
      'houghton mifflin',
      'pearson education',
      'mcgraw',
    ],
  },
  {
    sector: 'Government',
    patterns: [
      'county',
      'city of ',
      'town of ',
      'village of ',
      'state of ',
      'municipal',
      'federal',
      'ministry of',
      'department of',
      ' government',
      '.gov',
      'public works',
      'sheriff',
      'police',
      'fire department',
      'court of',
      'consulate',
      'embass',
    ],
  },
  {
    sector: 'Finance',
    patterns: [
      'bank ',
      ' bank',
      'banking',
      ' credit union',
      'financial',
      'finance ',
      ' finance',
      'capital ',
      ' capital',
      'capital management',
      'invest',
      'insurance',
      'accounting',
      'audit',
      'wealth management',
      'asset management',
      'tax services',
      'mortgage',
      'lending',
      'fintech',
      'brokerage',
      'securities',
    ],
  },
  {
    sector: 'Construction',
    patterns: [
      'construction',
      'builders',
      'contractor',
      'roofing',
      'plumbing',
      'hvac',
      'electrical contracting',
      'concrete',
      'masonry',
      'remodeling',
      'restoration',
      'general contractor',
      ' constructors',
      'demolition',
    ],
  },
  {
    sector: 'Engineering',
    patterns: [
      'engineering',
      'aerospace',
      'aec firm',
      'arup ',
      'consulting engineer',
      'structural engineer',
      'mechanical engineering',
      'civil engineering',
      'electrical engineering',
      'design engineer',
    ],
  },
  {
    sector: 'Manufacturing',
    patterns: [
      'manufacturing',
      'industries ',
      ' industries',
      'industrial',
      'factory',
      'machining',
      'plastics',
      'battery',
      ' steel',
      'aluminum',
      'foundry',
      'fabrication',
      'forging',
      'machinery',
      'precision',
      'components',
      'metalworks',
      'composites',
    ],
  },
  {
    sector: 'Technology',
    patterns: [
      'technology',
      'technologies',
      ' tech ',
      'software',
      ' systems',
      'cybersecurity',
      'cyber security',
      'it services',
      'managed services',
      'msp ',
      'data center',
      'cloud services',
      'saas',
      'analytics',
      'digital agency',
      'web design',
    ],
  },
  {
    sector: 'Retail / E-commerce',
    patterns: [
      'retail',
      ' store',
      ' shop ',
      ' shop,',
      'shopping',
      'e-commerce',
      'ecommerce',
      'marketplace',
      'apparel',
      'footwear',
      'cosmetic',
      'grocery',
      'supermarket',
      'boutique',
      'jewelry',
      'department store',
      'consumer goods',
      'home goods',
    ],
  },
  {
    sector: 'Hospitality',
    patterns: [
      'hotel ',
      ' hotel',
      'resort',
      'restaurant',
      'cafe',
      'catering',
      'hospitality',
      'cruise',
      'casino',
      'tourism',
      'lodging',
      'inn ',
    ],
  },
  {
    sector: 'Logistics',
    patterns: [
      'logistics',
      'transport',
      'shipping',
      'freight',
      'trucking',
      'warehousing',
      'fulfillment',
      'cargo',
      'maritime',
      'aviation',
      'rail ',
      'distribution center',
    ],
  },
  {
    sector: 'Energy',
    patterns: [
      'energy',
      ' oil',
      'oilfield',
      ' gas ',
      ' gas,',
      'natural gas',
      'petroleum',
      'utility',
      'utilities',
      'power plant',
      'electric coop',
      'renewable',
      'solar power',
      'wind power',
      'nuclear',
    ],
  },
  {
    sector: 'Real Estate',
    patterns: [
      'real estate',
      'realty',
      'realtors',
      'property management',
      'properties llc',
      'reit ',
      ' reit',
      'leasing',
      'commercial real',
    ],
  },
  {
    sector: 'Agriculture',
    patterns: [
      'farm ',
      ' farms',
      'agri',
      'agricult',
      'livestock',
      'ranch',
      'dairy',
      'poultry',
      'crop ',
      'fertiliz',
      'seed company',
      'orchard',
      'vineyard',
    ],
  },
  {
    sector: 'Media / Publishing',
    patterns: [
      'media ',
      ' media',
      'publishing',
      'publishers',
      'broadcast',
      'newspaper',
      'magazine',
      'radio station',
      'television',
      'production studio',
    ],
  },
  {
    sector: 'Nonprofit',
    patterns: [
      '.org',
      'nonprofit',
      'foundation',
      'charity',
      'church',
      'diocese',
      'parish',
      'archdiocese',
      'ministry',
      'mission ',
      'ngo ',
      'association',
    ],
  },
];

/**
 * Classify a victim name (and optional description) into a sector bucket.
 * Returns 'Unknown' if no pattern matches.
 */
export function classifySector(name: string, description?: string): Sector {
  const haystack = `${name} ${description ?? ''}`.toLowerCase();
  for (const rule of RULES) {
    for (const pat of rule.patterns) {
      if (haystack.includes(pat)) return rule.sector;
    }
  }
  return 'Unknown';
}

/** All sector labels in the order they should appear in UI. */
export const ALL_SECTORS: Sector[] = RULES.map((r) => r.sector).concat(['Unknown']);

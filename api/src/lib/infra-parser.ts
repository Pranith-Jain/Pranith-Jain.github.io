import { buildAliasIndex, TYPE_BY_KEY, type InfraType } from './infra-taxonomy';

/**
 * NLP query parser — converts natural language or structured queries into
 * Overpass QL. Inspired by ni5arga/sightline's parser.ts.
 *
 * Supports:
 *   - Natural: "telecom towers in karnataka", "power plants near mumbai"
 *   - Structured: "type:telecom region:karnataka operator:airtel"
 *   - Direct: "data centers", "military bases in germany"
 */

export interface ParsedQuery {
  types: InfraType[];
  region: string;
  country: string;
  near: string;
  radiusKm: number;
  operator: string;
  /** Overpass bounding box [south, west, north, east] — resolved from region/country. */
  bbox?: [number, number, number, number];
}

/** Common country → approximate bounding box. */
const COUNTRY_BBOX: Record<string, [number, number, number, number]> = {
  india: [6.5, 68.0, 35.5, 97.5],
  'united states': [24.5, -125.0, 49.5, -66.5],
  usa: [24.5, -125.0, 49.5, -66.5],
  us: [24.5, -125.0, 49.5, -66.5],
  germany: [47.3, 5.9, 55.1, 15.0],
  uk: [49.9, -8.2, 60.9, 1.8],
  'united kingdom': [49.9, -8.2, 60.9, 1.8],
  france: [42.3, -5.1, 51.1, 9.6],
  japan: [30.0, 129.0, 46.0, 146.0],
  china: [18.0, 73.5, 53.5, 135.0],
  brazil: [-34.0, -74.0, 5.3, -34.8],
  australia: [-44.0, 112.0, -10.0, 154.0],
  canada: [41.7, -141.0, 83.1, -52.6],
  russia: [41.2, 27.5, 81.8, 169.0],
  'south korea': [33.0, 124.5, 38.5, 132.0],
  israel: [29.4, 34.2, 33.3, 35.9],
  iran: [25.0, 44.0, 39.8, 63.3],
  saudi: [16.4, 34.6, 32.2, 55.7],
  'saudi arabia': [16.4, 34.6, 32.2, 55.7],
  uae: [22.6, 51.6, 26.1, 56.4],
  singapore: [1.2, 103.6, 1.5, 104.0],
  pakistan: [23.6, 60.8, 37.1, 77.8],
  nigeria: [4.3, 2.7, 13.9, 14.7],
  egypt: [22.0, 24.7, 31.7, 36.9],
};

const aliasIndex = buildAliasIndex();

/** Extract structured parameters from "key:value" pairs. */
function extractStructured(text: string): {
  types: string[];
  region: string;
  country: string;
  operator: string;
  near: string;
  radius: number;
} {
  const types: string[] = [];
  let region = '';
  let country = '';
  let operator = '';
  let near = '';
  let radius = 50;

  const pairs = text.match(/(\w+):([^\s]+)/g) ?? [];
  for (const pair of pairs) {
    const [key, ...valParts] = pair.split(':');
    const val = valParts.join(':').toLowerCase();
    switch (key?.toLowerCase()) {
      case 'type':
        types.push(val);
        break;
      case 'region':
        region = val;
        break;
      case 'country':
        country = val;
        break;
      case 'operator':
        operator = val;
        break;
      case 'near':
        near = val;
        break;
      case 'radius':
        radius = parseInt(val) || 50;
        break;
    }
  }

  return { types, region, country, operator, near, radius };
}

/** Try to match a word to an infrastructure type via the alias index. */
function matchType(word: string): InfraType | null {
  const key = aliasIndex.get(word.toLowerCase());
  return key ? (TYPE_BY_KEY.get(key) ?? null) : null;
}

/** Common region names → approximate bbox (subset for hot regions). */
const REGION_BBOX: Record<string, [number, number, number, number]> = {
  karnataka: [11.5, 74.0, 18.5, 78.5],
  maharashtra: [15.6, 72.6, 22.0, 80.9],
  tamil: [8.0, 76.2, 13.5, 80.3],
  'tamil nadu': [8.0, 76.2, 13.5, 80.3],
  telangana: [15.8, 77.8, 19.9, 81.3],
  kerala: [8.3, 74.9, 12.4, 77.4],
  bavaria: [47.3, 8.9, 50.6, 13.8],
  texas: [25.8, -106.7, 36.5, -93.5],
  california: [32.5, -124.5, 42.0, -114.1],
  bengaluru: [12.8, 77.4, 13.1, 77.8],
  mumbai: [18.8, 72.8, 19.1, 73.0],
  london: [51.3, -0.5, 51.7, 0.3],
  tokyo: [35.5, 139.6, 35.9, 139.9],
  delhi: [28.4, 76.8, 28.9, 77.3],
  berlin: [52.3, 13.1, 52.7, 13.8],
  paris: [48.8, 2.2, 49.0, 2.6],
  'new york': [40.5, -74.3, 40.9, -73.7],
  beijing: [39.7, 116.2, 40.0, 116.6],
  singapore: [1.2, 103.6, 1.5, 104.0],
  dubai: [24.8, 55.0, 25.4, 55.5],
  bangalore: [12.8, 77.4, 13.1, 77.8],
  sydney: [-33.9, 151.1, -33.8, 151.3],
  manila: [14.5, 120.9, 14.7, 121.1],
  jakarta: [-6.4, 106.7, -6.1, 107.0],
};

/**
 * Parse a natural language or structured query into a ParsedQuery.
 * The bbox resolution happens in the API handler via Nominatim,
 * here we just extract the text entities.
 */
export function parseInfraQuery(raw: string): ParsedQuery {
  const text = raw.trim().toLowerCase();
  const result: ParsedQuery = {
    types: [],
    region: '',
    country: '',
    near: '',
    radiusKm: 50,
    operator: '',
  };

  // 1. Check for structured "key:value" pairs
  const hasStructured = /\w+:[^\s]+/.test(text);
  if (hasStructured) {
    const s = extractStructured(text);
    for (const t of s.types) {
      const matched = aliasIndex.get(t);
      if (matched) {
        const infraType = TYPE_BY_KEY.get(matched);
        if (infraType) result.types.push(infraType);
      }
    }
    result.region = s.region;
    result.country = s.country;
    result.operator = s.operator;
    result.near = s.near;
    result.radiusKm = s.radius;
  }

  // 2. Natural language: try to match multi-word phrases first, then single words
  if (result.types.length === 0) {
    const words = text.replace(/["']/g, '').split(/\s+/);

    // Try 3-word phrases
    for (let i = 0; i <= words.length - 3; i++) {
      const phrase = words.slice(i, i + 3).join(' ');
      const t = matchType(phrase);
      if (t) {
        result.types.push(t);
        words.splice(i, 3);
        i--;
      }
    }
    // Try 2-word phrases
    for (let i = 0; i <= words.length - 2; i++) {
      const phrase = words.slice(i, i + 2).join(' ');
      const t = matchType(phrase);
      if (t) {
        result.types.push(t);
        words.splice(i, 2);
        i--;
      }
    }
    // Try single words
    const locationWords: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i] ?? '';
      const t = matchType(w);
      if (t) {
        result.types.push(t);
      } else {
        locationWords.push(w);
      }
    }

    // Classify remaining words as region/country
    const locText = locationWords.join(' ');
    const inMatch = locText.match(/\b(?:in|near|around|of)\s+(.+)/);
    if (inMatch) {
      const place = (inMatch[1] ?? '').trim();
      if (COUNTRY_BBOX[place]) {
        result.country = place;
      } else if (REGION_BBOX[place]) {
        result.region = place;
      } else {
        result.near = place;
      }
    } else if (locationWords.length > 0) {
      // Last word(s) are likely location
      const last = locationWords[locationWords.length - 1] ?? '';
      if (COUNTRY_BBOX[last]) result.country = last;
      else if (REGION_BBOX[last]) result.region = last;
      else result.near = last;
    }
  }

  // Deduplicate types
  const seen = new Set<string>();
  result.types = result.types.filter((t) => {
    if (seen.has(t.key)) return false;
    seen.add(t.key);
    return true;
  });

  return result;
}

/** Build an Overpass QL query from a ParsedQuery. */
export function buildOverpassQuery(parsed: ParsedQuery): string {
  if (parsed.types.length === 0) return '';
  if (!parsed.bbox) return '';

  const [s, w, n, e] = parsed.bbox;
  const area = `${s},${w},${n},${e}`;

  const unionParts: string[] = [];
  for (const t of parsed.types) {
    for (const tag of t.osmTags) {
      if (tag.value) {
        unionParts.push(
          `  node["${tag.key}"="${tag.value}"](${area});\n  way["${tag.key}"="${tag.value}"](${area});\n  relation["${tag.key}"="${tag.value}"](${area});`
        );
      } else {
        unionParts.push(
          `  node["${tag.key}"](${area});\n  way["${tag.key}"](${area});\n  relation["${tag.key}"](${area});`
        );
      }
    }
  }

  return `[out:json][timeout:30];\n(\n${unionParts.join('\n')}\n);\nout center body;`;
}

/** Quick bbox from region/country string (sync, for pre-Nominatim fallback). */
export function quickBbox(region: string, country: string): [number, number, number, number] | null {
  if (region) {
    const b = REGION_BBOX[region.toLowerCase()];
    if (b) return b;
  }
  if (country) {
    const b = COUNTRY_BBOX[country.toLowerCase()];
    if (b) return b;
  }
  return null;
}

/** Nominatim geocoding for bbox resolution. */
export async function nominatimGeocode(query: string): Promise<[number, number, number, number] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { signal: ctrl.signal, headers: { 'User-Agent': 'pranithjain-infra-search/1.0' } }
    );
    clearTimeout(timer);
    if (!r.ok) return null;
    const data = (await r.json()) as Array<{ boundingbox?: [number, number, number, number] }>;
    if (data.length > 0 && data[0] && data[0].boundingbox) {
      const [latS, latN, lonW, lonE] = data[0].boundingbox;
      return [latS, lonW, latN, lonE];
    }
    return null;
  } catch {
    return null;
  }
}

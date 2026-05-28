import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchRansomwareRecent } from './ransomware-recent';

const CACHE_KEY = 'https://ransomware-map-cache.internal/v1';
const CACHE_TTL = 900;

interface RansomwareCountryAgg {
  country: string;
  countryCode: string;
  victim_count: number;
  groups: string[];
  top_victims: string[];
}

interface RansomwareMapResponse {
  generated_at: string;
  total_victims: number;
  total_countries: number;
  countries: RansomwareCountryAgg[];
}

const COUNTRY_MAP: Record<string, string> = {
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  germany: 'DE',
  france: 'FR',
  canada: 'CA',
  australia: 'AU',
  japan: 'JP',
  brazil: 'BR',
  india: 'IN',
  italy: 'IT',
  spain: 'ES',
  netherlands: 'NL',
  switzerland: 'CH',
  sweden: 'SE',
  norway: 'NO',
  belgium: 'BE',
  austria: 'AT',
  ireland: 'IE',
  denmark: 'DK',
  finland: 'FI',
  poland: 'PL',
  portugal: 'PT',
  czechia: 'CZ',
  'czech republic': 'CZ',
  hungary: 'HU',
  greece: 'GR',
  romania: 'RO',
  russia: 'RU',
  china: 'CN',
  'south korea': 'KR',
  'korea, republic of': 'KR',
  singapore: 'SG',
  'united arab emirates': 'AE',
  uae: 'AE',
  'saudi arabia': 'SA',
  israel: 'IL',
  turkey: 'TR',
  mexico: 'MX',
  argentina: 'AR',
  colombia: 'CO',
  chile: 'CL',
  'south africa': 'ZA',
  nigeria: 'NG',
  egypt: 'EG',
  kenya: 'KE',
  thailand: 'TH',
  vietnam: 'VN',
  indonesia: 'ID',
  malaysia: 'MY',
  philippines: 'PH',
  taiwan: 'TW',
  'new zealand': 'NZ',
  ukraine: 'UA',
  'costa rica': 'CR',
  'puerto rico': 'PR',
  luxembourg: 'LU',
  malta: 'MT',
  cyprus: 'CY',
  estonia: 'EE',
  latvia: 'LV',
  lithuania: 'LT',
  slovenia: 'SI',
  slovakia: 'SK',
  bulgaria: 'BG',
  croatia: 'HR',
  serbia: 'RS',
  iceland: 'IS',
  monaco: 'MC',
  liechtenstein: 'LI',
  'san marino': 'SM',
  jordan: 'JO',
  qatar: 'QA',
  kuwait: 'KW',
  bahrain: 'BH',
  oman: 'OM',
  morocco: 'MA',
  tunisia: 'TN',
  algeria: 'DZ',
  ghana: 'GH',
  angola: 'AO',
  peru: 'PE',
  ecuador: 'EC',
  uruguay: 'UY',
  venezuela: 'VE',
  'dominican republic': 'DO',
  guatemala: 'GT',
  panama: 'PA',
  pakistan: 'PK',
  bangladesh: 'BD',
  sri_lanka: 'LK',
  nepal: 'NP',
  kazakhstan: 'KZ',
  uzbekistan: 'UZ',
  azerbaijan: 'AZ',
  georgia: 'GE',
  armenia: 'AM',
  paraguay: 'PY',
  bolivia: 'BO',
  cuba: 'CU',
  lebanon: 'LB',
  syria: 'SY',
  iraq: 'IQ',
  yemen: 'YE',
  afghanistan: 'AF',
  myanmar: 'MM',
  'hong kong': 'HK',
  macau: 'MO',
  mongolia: 'MN',
  albania: 'AL',
  bosnia: 'BA',
  'bosnia and herzegovina': 'BA',
  macedonia: 'MK',
  'north macedonia': 'MK',
  moldova: 'MD',
  montenegro: 'ME',
  belarus: 'BY',
  mauritius: 'MU',
  bahamas: 'BS',
  barbados: 'BB',
  trinidad: 'TT',
  'trinidad and tobago': 'TT',
  bermuda: 'BM',
  jersey: 'JE',
  guernsey: 'GG',
  'isle of man': 'IM',
  gibraltar: 'GI',
  'faroe islands': 'FO',
  andorra: 'AD',
  'cayman islands': 'KY',
  'british virgin islands': 'VG',
  'virgin islands': 'VI',
  'antigua and barbuda': 'AG',
  aruba: 'AW',
  curacao: 'CW',
  svalbard: 'SJ',
  'jan mayen': 'SJ',
};

function normalizeCountry(raw: string | undefined): { country: string; code: string } | null {
  if (!raw || raw === 'N/D' || raw === 'Unknown' || raw === 'unknown') return null;
  const trimmed = raw.trim().replace(/\.$/, '');
  if (!trimmed) return null;
  if (trimmed.length === 2) {
    return { country: trimmed.toUpperCase(), code: trimmed.toUpperCase() };
  }
  const lower = trimmed.toLowerCase();
  const mapped = COUNTRY_MAP[lower];
  if (mapped) return { country: trimmed, code: mapped };
  return { country: trimmed, code: trimmed.slice(0, 2).toUpperCase() };
}

export async function ransomwareMapHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const { body, upstreamOk } = await fetchRansomwareRecent(c.env);

  const countryBuckets = new Map<
    string,
    { country: string; victim_count: number; groups: Set<string>; victims: string[] }
  >();

  for (const v of body.victims) {
    const resolved = normalizeCountry(v.country);
    if (!resolved) continue;
    let bucket = countryBuckets.get(resolved.code);
    if (!bucket) {
      bucket = { country: resolved.country, victim_count: 0, groups: new Set(), victims: [] };
      countryBuckets.set(resolved.code, bucket);
    }
    bucket.victim_count++;
    bucket.groups.add(v.group);
    if (bucket.victims.length < 10) bucket.victims.push(v.victim);
  }

  const countries: RansomwareCountryAgg[] = [...countryBuckets.entries()]
    .map(([countryCode, b]) => ({
      country: b.country,
      countryCode,
      victim_count: b.victim_count,
      groups: [...b.groups].sort(),
      top_victims: b.victims,
    }))
    .sort((a, b) => b.victim_count - a.victim_count);

  const result: RansomwareMapResponse = {
    generated_at: new Date().toISOString(),
    total_victims: body.victims.length,
    total_countries: countries.length,
    countries,
  };

  const json = JSON.stringify(result);
  const response = new Response(json, {
    headers: {
      'content-type': 'application/json',
      'cache-control': upstreamOk ? `public, max-age=${CACHE_TTL}` : 'no-store',
      'access-control-allow-origin': '*',
    },
  });
  if (upstreamOk) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

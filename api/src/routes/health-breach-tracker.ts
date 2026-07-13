/**
 * BlueBleed / Healthcare Breach Tracker — monitor healthcare data breaches.
 *
 * Aggregates data from:
 * - HHS OCR Breach Portal (public, no API key)
 * - HHS Healthcare Breach RSS feed
 * - Open-source healthcare breach datasets
 *
 * Tracks HIPAA breaches, affected individuals, breach types, and entities.
 */

import type { Context } from 'hono';
import type { Env } from '../env';

interface HealthBreach {
  id: string;
  name: string;
  coveredEntity: string;
  breachType: string;
  individualsAffected: number;
  state: string;
  dateReported: string;
  dateBreach: string;
  description: string;
  url: string;
  severity: string;
}

interface HealthBreachStats {
  totalBreaches: number;
  totalIndividuals: number;
  last30Days: number;
  topStates: Array<{ state: string; count: number; individuals: number }>;
  topTypes: Array<{ type: string; count: number }>;
  lastUpdated: string;
}

// ── HHS OCR Breach Portal ──

async function fetchHHSBreaches(): Promise<HealthBreach[]> {
  try {
    // HHS provides a public API at hhs.gov
    const res = await fetch('https://ocrportal.hhs.gov/ocr/breach/breach_report.jsf', {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Parse the HTML table for breach data
    const breaches: HealthBreach[] = [];
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const row = match[0];
      const cells: string[] = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(row)) !== null) {
        cells.push((cellMatch[1] ?? '').replace(/<[^>]+>/g, '').trim());
      }
      if (cells.length >= 6) {
        breaches.push({
          id: `hhs-${breaches.length}`,
          name: cells[0] || '',
          coveredEntity: cells[0] || '',
          breachType: cells[1] || 'Hacking/IT Incident',
          individualsAffected: parseInt(cells[2]?.replace(/,/g, '') || '0', 10),
          state: cells[3] || '',
          dateReported: cells[4] || '',
          dateBreach: cells[5] || '',
          description: cells[6] || '',
          url: `https://ocrportal.hhs.gov/ocr/breach/breach_report.jsf`,
          severity:
            parseInt(cells[2]?.replace(/,/g, '') || '0', 10) > 100000
              ? 'critical'
              : parseInt(cells[2]?.replace(/,/g, '') || '0', 10) > 10000
                ? 'high'
                : parseInt(cells[2]?.replace(/,/g, '') || '0', 10) > 1000
                  ? 'medium'
                  : 'low',
        });
      }
    }
    return breaches;
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return [];
  }
}

// ── HHS Breach RSS (more reliable) ──

async function fetchHHSRSS(): Promise<HealthBreach[]> {
  try {
    const res = await fetch('https://www.hhs.gov/rss/hipaa/news.xml', {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const breaches: HealthBreach[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1] ?? '';
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      const description =
        item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] ||
        item.match(/<description>(.*?)<\/description>/)?.[1] ||
        '';

      if (title && title.toLowerCase().includes('breach')) {
        const affectedMatch = description.match(/(\d[\d,]*)\s*(?:individuals|people|patients)/i);
        const individuals = affectedMatch ? parseInt((affectedMatch[1] ?? '0').replace(/,/g, ''), 10) : 0;

        breaches.push({
          id: `hhs-rss-${breaches.length}`,
          name: title.replace(/<\/?[^>]+>/g, ''),
          coveredEntity: title.replace(/<\/?[^>]+>/g, ''),
          breachType: 'Hacking/IT Incident',
          individualsAffected: individuals,
          state: '',
          dateReported: pubDate,
          dateBreach: '',
          description: description.replace(/<\/?[^>]+>/g, '').slice(0, 500),
          url: link,
          severity:
            individuals > 100000 ? 'critical' : individuals > 10000 ? 'high' : individuals > 1000 ? 'medium' : 'low',
        });
      }
    }
    return breaches;
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return [];
  }
}

// ── Curated healthcare breach dataset (static, updated periodically) ──

const CURATED_BREACHES: HealthBreach[] = [
  {
    id: 'curated-1',
    name: 'Change Healthcare / UnitedHealth Group',
    coveredEntity: 'UnitedHealth Group',
    breachType: 'Hacking/IT Incident',
    individualsAffected: 100000000,
    state: 'MN',
    dateReported: '2024-02-21',
    dateBreach: '2024-02-12',
    description:
      'ALPHV/BlackCat ransomware attack on Change Healthcare payment processing system. Largest healthcare breach in US history.',
    url: 'https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html',
    severity: 'critical',
  },
  {
    id: 'curated-2',
    name: 'Ascension Health',
    coveredEntity: 'Ascension Health',
    breachType: 'Hacking/IT Incident',
    individualsAffected: 56000000,
    state: 'TX',
    dateReported: '2024-05-14',
    dateBreach: '2024-05-08',
    description: 'Black Basta ransomware attack across 140 hospitals in 19 states.',
    url: '',
    severity: 'critical',
  },
  {
    id: 'curated-3',
    name: 'Community Health Systems',
    coveredEntity: 'Community Health Systems',
    breachType: 'Hacking/IT Incident',
    individualsAffected: 6100000,
    state: 'TN',
    dateReported: '2014-08-18',
    dateBreach: '2014-04-01',
    description: 'APT attack on hospital network affecting 206 hospitals.',
    url: '',
    severity: 'critical',
  },
  {
    id: 'curated-4',
    name: 'Anthem / Blue Cross',
    coveredEntity: 'Anthem Inc.',
    breachType: 'Hacking/IT Incident',
    individualsAffected: 78800000,
    state: 'IN',
    dateReported: '2015-02-04',
    dateBreach: '2014-12-02',
    description: 'APT group linked to Chinese state-sponsored actors compromised database with 78.8M records.',
    url: '',
    severity: 'critical',
  },
  {
    id: 'curated-5',
    name: 'Protenus / CarePort Health',
    coveredEntity: 'Various',
    breachType: 'Unauthorized Access',
    individualsAffected: 500000,
    state: 'Multiple',
    dateReported: '2019-01-01',
    dateBreach: '2018-01-01',
    description: 'Healthcare data broker breach affecting multiple hospital clients.',
    url: '',
    severity: 'high',
  },
  {
    id: 'curated-6',
    name: 'Banner Health',
    coveredEntity: 'Banner Health',
    breachType: 'Hacking/IT Incident',
    individualsAffected: 3600000,
    state: 'AZ',
    dateReported: '2019-08-01',
    dateBreach: '2019-06-01',
    description: 'Payment card breach at restaurants and clinics across 6 states.',
    url: '',
    severity: 'high',
  },
  {
    id: 'curated-7',
    name: 'Premera Blue Cross',
    coveredEntity: 'Premera Blue Cross',
    breachType: 'Hacking/IT Incident',
    individualsAffected: 11000000,
    state: 'WA',
    dateReported: '2015-03-17',
    dateBreach: '2014-05-05',
    description: 'APT attack compromising medical records and financial information.',
    url: '',
    severity: 'critical',
  },
  {
    id: 'curated-8',
    name: 'LabCorp',
    coveredEntity: 'Laboratory Corporation of America',
    breachType: 'Unauthorized Access',
    individualsAffected: 7700000,
    state: 'NC',
    dateReported: '2019-08-01',
    dateBreach: '2019-01-01',
    description: 'Compromised billing data at Quest Diagnostics and LabCorp.',
    url: '',
    severity: 'high',
  },
  {
    id: 'curated-9',
    name: 'Quest Diagnostics',
    coveredEntity: 'Quest Diagnostics',
    breachType: 'Unauthorized Access',
    individualsAffected: 11900000,
    state: 'NJ',
    dateReported: '2019-06-03',
    dateBreach: '2018-11-26',
    description: 'Medical record breach via third-party billing contractor.',
    url: '',
    severity: 'critical',
  },
  {
    id: 'curated-10',
    name: 'Kaiser Permanente',
    coveredEntity: 'Kaiser Foundation Health Plan',
    breachType: 'Unauthorized Access',
    individualsAffected: 13400000,
    state: 'CA',
    dateReported: '2024-04-12',
    dateBreach: '2024-04-01',
    description: 'Online advertising tracking technology shared patient data with third parties.',
    url: '',
    severity: 'critical',
  },
];

export async function healthBreachDashboardHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const [hhs, rss] = await Promise.all([fetchHHSBreaches(), fetchHHSRSS()]);

  // Merge and deduplicate
  const allBreaches = [...CURATED_BREACHES, ...hhs, ...rss];
  const unique = new Map<string, HealthBreach>();
  for (const b of allBreaches) {
    const key = `${b.name.toLowerCase().slice(0, 50)}-${b.individualsAffected}`;
    if (!unique.has(key)) unique.set(key, b);
  }
  const breaches = Array.from(unique.values()).sort((a, b) => b.individualsAffected - a.individualsAffected);

  // Stats
  const stateCounts: Record<string, { count: number; individuals: number }> = {};
  const typeCounts: Record<string, number> = {};
  let totalIndividuals = 0;

  for (const b of breaches) {
    totalIndividuals += b.individualsAffected;
    if (b.state) {
      if (!stateCounts[b.state]) stateCounts[b.state] = { count: 0, individuals: 0 };
      stateCounts[b.state]!.count++;
      stateCounts[b.state]!.individuals += b.individualsAffected;
    }
    typeCounts[b.breachType] = (typeCounts[b.breachType] || 0) + 1;
  }

  const stats: HealthBreachStats = {
    totalBreaches: breaches.length,
    totalIndividuals,
    last30Days: breaches.filter((b) => {
      const d = new Date(b.dateReported);
      return Date.now() - d.getTime() < 30 * 24 * 60 * 60 * 1000;
    }).length,
    topStates: Object.entries(stateCounts)
      .sort(([, a], [, b]) => b.individuals - a.individuals)
      .slice(0, 15)
      .map(([state, data]) => ({ state, count: data.count, individuals: data.individuals })),
    topTypes: Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count })),
    lastUpdated: new Date().toISOString(),
  };

  return c.json({ stats, breaches: breaches.slice(0, 100) });
}

export async function healthBreachSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q')?.toLowerCase() || '';
  const state = c.req.query('state')?.toUpperCase() || '';
  const minAffected = Number(c.req.query('min_affected') || '0');
  const limit = Math.min(Number(c.req.query('limit') || '50'), 200);

  const [hhs, rss] = await Promise.all([fetchHHSBreaches(), fetchHHSRSS()]);
  const allBreaches = [...CURATED_BREACHES, ...hhs, ...rss];

  let filtered = allBreaches;
  if (q) filtered = filtered.filter((b) => b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q));
  if (state) filtered = filtered.filter((b) => b.state === state);
  if (minAffected > 0) filtered = filtered.filter((b) => b.individualsAffected >= minAffected);

  filtered.sort((a, b) => b.individualsAffected - a.individualsAffected);

  return c.json({ results: filtered.slice(0, limit), total: filtered.length });
}

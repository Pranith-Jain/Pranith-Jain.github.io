import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * TAXII 2.1 Server — standardized threat intelligence sharing.
 *
 * Implements the Trusted Automated eXchange of Intelligence Information
 * (TAXII) 2.1 protocol, allowing other security tools (MISP, OpenCTI,
 * Splunk SOAR, etc.) to pull threat intelligence from this platform.
 *
 * Endpoints:
 *   GET  /api/taxii2/                     → Discovery
 *   GET  /api/taxii2/collections/         → List collections
 *   GET  /api/taxii2/collections/{id}/    → Collection metadata
 *   GET  /api/taxii2/collections/{id}/objects/ → Get STIX objects
 *   POST /api/taxii2/collections/{id}/objects/ → Add STIX objects
 *
 * Collections:
 *   - iocs: All IOCs (IPs, domains, URLs, hashes)
 *   - actors: Threat actor profiles
 *   - malware: Malware families
 *   - vulnerabilities: CVE data
 *   - briefings: Daily/weekly briefings
 *
 * Authentication: Bearer token (same as API keys).
 */

const TAXII_CONTENT_TYPE = 'application/vnd.oasis.taxii+json; version=2.1';
const STIX_CONTENT_TYPE = 'application/stix+json; version=2.1';

interface TaxiiCollection {
  id: string;
  title: string;
  description: string;
  can_read: boolean;
  can_write: boolean;
  media_types: string[];
}

const COLLECTIONS: TaxiiCollection[] = [
  {
    id: 'iocs',
    title: 'Indicators of Compromise',
    description: 'All IOCs aggregated from 30+ threat intelligence feeds',
    can_read: true,
    can_write: false,
    media_types: [STIX_CONTENT_TYPE],
  },
  {
    id: 'actors',
    title: 'Threat Actors',
    description: 'Known threat actor profiles with TTPs and attributions',
    can_read: true,
    can_write: false,
    media_types: [STIX_CONTENT_TYPE],
  },
  {
    id: 'malware',
    title: 'Malware Families',
    description: 'Malware family profiles with signatures and behaviors',
    can_read: true,
    can_write: false,
    media_types: [STIX_CONTENT_TYPE],
  },
  {
    id: 'vulnerabilities',
    title: 'Vulnerabilities',
    description: 'CVE data with CVSS, EPSS, and KEV status',
    can_read: true,
    can_write: false,
    media_types: [STIX_CONTENT_TYPE],
  },
  {
    id: 'briefings',
    title: 'Threat Briefings',
    description: 'Daily and weekly threat intelligence briefings',
    can_read: true,
    can_write: false,
    media_types: [STIX_CONTENT_TYPE],
  },
];

/** GET /api/taxii2/ — Discovery */
export async function taxiiDiscoveryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json(
    {
      title: 'DFIR & Threat Intel TAXII Server',
      description: 'TAXII 2.1 server for automated threat intelligence sharing',
      default: '/api/taxii2/collections/',
      api_roots: ['/api/taxii2/'],
    },
    200,
    { 'Content-Type': TAXII_CONTENT_TYPE }
  );
}

/** GET /api/taxii2/collections/ — List collections */
export async function taxiiCollectionsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json(
    { collections: COLLECTIONS },
    200,
    { 'Content-Type': TAXII_CONTENT_TYPE }
  );
}

/** GET /api/taxii2/collections/{id}/ — Collection metadata */
export async function taxiiCollectionHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const collection = COLLECTIONS.find((col) => col.id === id);

  if (!collection) {
    return c.json(
      { title: 'Not Found', description: `Collection '${id}' does not exist` },
      404,
      { 'Content-Type': TAXII_CONTENT_TYPE }
    );
  }

  return c.json(collection, 200, { 'Content-Type': TAXII_CONTENT_TYPE });
}

/** GET /api/taxii2/collections/{id}/objects/ — Get STIX objects */
export async function taxiiObjectsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const collection = COLLECTIONS.find((col) => col.id === id);

  if (!collection) {
    return c.json(
      { title: 'Not Found', description: `Collection '${id}' does not exist` },
      404,
      { 'Content-Type': TAXII_CONTENT_TYPE }
    );
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) {
    return c.json(
      { title: 'Service Unavailable', description: 'Database not configured' },
      503,
      { 'Content-Type': TAXII_CONTENT_TYPE }
    );
  }

  // Parse pagination params
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500);
  const addedAfter = c.req.query('added_after');

  try {
    let objects: Record<string, unknown>[] = [];

    switch (id) {
      case 'iocs':
        objects = await getIocObjects(db, limit, addedAfter);
        break;
      case 'actors':
        objects = await getActorObjects(limit);
        break;
      case 'malware':
        objects = await getMalwareObjects(limit);
        break;
      case 'vulnerabilities':
        objects = await getVulnerabilityObjects(limit);
        break;
      case 'briefings':
        objects = await getBriefingObjects(db, limit);
        break;
    }

    return c.json(
      {
        type: 'bundle',
        id: `bundle--${crypto.randomUUID()}`,
        objects,
      },
      200,
      {
        'Content-Type': STIX_CONTENT_TYPE,
        'Cache-Control': 'public, max-age=300',
      }
    );
  } catch (err) {
    return c.json(
      {
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to fetch objects',
      },
      500,
      { 'Content-Type': TAXII_CONTENT_TYPE }
    );
  }
}

/** POST /api/taxii2/collections/{id}/objects/ — Add STIX objects */
export async function taxiiAddObjectsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const collection = COLLECTIONS.find((col) => col.id === id);

  if (!collection) {
    return c.json(
      { title: 'Not Found', description: `Collection '${id}' does not exist` },
      404,
      { 'Content-Type': TAXII_CONTENT_TYPE }
    );
  }

  if (!collection.can_write) {
    return c.json(
      { title: 'Forbidden', description: 'This collection is read-only' },
      403,
      { 'Content-Type': TAXII_CONTENT_TYPE }
    );
  }

  // For now, accept but don't persist (future feature)
  return c.json(
    {
      id: `status--${crypto.randomUUID()}`,
      status: 'complete',
      total_count: 0,
      success_count: 0,
      failure_count: 0,
    },
    200,
    { 'Content-Type': TAXII_CONTENT_TYPE }
  );
}

// ── Helper functions to build STIX objects ─────────────────────────────

async function getIocObjects(db: D1Database, limit: number, addedAfter?: string): Promise<Record<string, unknown>[]> {
  // Get recent IOCs from lifecycle table
  let query = `
    SELECT indicator, indicator_type, first_seen, last_seen, peak_score, tags
    FROM ioc_lifecycle
    WHERE last_seen > datetime('now', '-7 days')
  `;
  const params: unknown[] = [];

  if (addedAfter) {
    query += ' AND first_seen > ?';
    params.push(addedAfter);
  }

  query += ' ORDER BY last_seen DESC LIMIT ?';
  params.push(limit);

  const rows = await db.prepare(query).bind(...params).all<{
    indicator: string;
    indicator_type: string;
    first_seen: string;
    last_seen: string;
    peak_score: number;
    tags: string;
  }>();

  return (rows.results ?? []).map((row) => {
    const tags: string[] = JSON.parse(row.tags ?? '[]');
    const stixType = row.indicator_type === 'hash' ? 'file' : row.indicator_type === 'url' ? 'url' : 'ipv4-addr';

    return {
      type: 'indicator',
      spec_version: '2.1',
      id: `indicator--${crypto.randomUUID()}`,
      created: row.first_seen,
      modified: row.last_seen,
      name: row.indicator,
      description: `IOC from threat intelligence feeds. Tags: ${tags.join(', ')}`,
      pattern: buildStixPattern(row.indicator, row.indicator_type),
      pattern_type: 'stix',
      valid_from: row.first_seen,
      labels: tags.slice(0, 5),
      confidence: row.peak_score >= 70 ? 85 : row.peak_score >= 40 ? 60 : 30,
    };
  });
}

async function getActorObjects(limit: number): Promise<Record<string, unknown>[]> {
  // Return static threat actor data (would be expanded with full actor KB)
  const ACTORS = [
    { name: 'APT28', aliases: ['Fancy Bear', 'Sofacy'], country: 'Russia' },
    { name: 'APT29', aliases: ['Cozy Bear', 'The Dukes'], country: 'Russia' },
    { name: 'Lazarus Group', aliases: ['HIDDEN COBRA', 'Zinc'], country: 'North Korea' },
    { name: 'APT41', aliases: ['Double Dragon', 'Winnti'], country: 'China' },
    { name: 'Sandworm', aliases: ['Voodoo Bear', 'Seashell Blizzard'], country: 'Russia' },
  ];

  return ACTORS.slice(0, limit).map((actor) => ({
    type: 'threat-actor',
    spec_version: '2.1',
    id: `threat-actor--${crypto.randomUUID()}`,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    name: actor.name,
    aliases: actor.aliases,
    description: `Threat actor attributed to ${actor.country}`,
    threat_actor_types: ['nation-state'],
    sophistication: 'advanced',
    resource_level: 'government',
    primary_motivation: 'espionage',
    country: actor.country,
  }));
}

async function getMalwareObjects(limit: number): Promise<Record<string, unknown>[]> {
  const MALWARE = [
    { name: 'Cobalt Strike', type: 'backdoor', description: 'Commercial penetration testing tool abused by threat actors' },
    { name: 'Mimikatz', type: 'credential-theft', description: 'Windows credential dumping tool' },
    { name: 'Emotet', type: 'banking-trojan', description: 'Modular banking trojan and malware delivery service' },
    { name: 'LockBit', type: 'ransomware', description: 'Ransomware-as-a-service operation' },
    { name: 'TrickBot', type: 'banking-trojan', description: 'Modular banking trojan with C2 capabilities' },
  ];

  return MALWARE.slice(0, limit).map((m) => ({
    type: 'malware',
    spec_version: '2.1',
    id: `malware--${crypto.randomUUID()}`,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    name: m.name,
    description: m.description,
    malware_types: [m.type],
    is_family: true,
  }));
}

async function getVulnerabilityObjects(limit: number): Promise<Record<string, unknown>[]> {
  // Return recent high-severity CVEs (would be expanded with full CVE data)
  return [
    {
      type: 'vulnerability',
      spec_version: '2.1',
      id: 'vulnerability--CVE-2024-3094',
      created: '2024-03-29T00:00:00Z',
      modified: '2024-03-29T00:00:00Z',
      name: 'CVE-2024-3094',
      description: 'XZ Utils backdoor - malicious code in liblzma',
      external_references: [{ source_name: 'CVE', external_id: 'CVE-2024-3094' }],
    },
  ].slice(0, limit);
}

async function getBriefingObjects(db: D1Database, limit: number): Promise<Record<string, unknown>[]> {
  const rows = await db
    .prepare(
      `SELECT slug, type, title, published_at, stats_json
       FROM briefings
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<{
      slug: string;
      type: string;
      title: string;
      published_at: string;
      stats_json: string;
    }>();

  return (rows.results ?? []).map((row) => ({
    type: 'report',
    spec_version: '2.1',
    id: `report--${crypto.randomUUID()}`,
    created: row.published_at,
    modified: row.published_at,
    name: row.title,
    description: `${row.type} threat intelligence briefing`,
    report_types: ['threat-report'],
    published: row.published_at,
    external_references: [
      { source_name: 'briefing', url: `https://pranithjain.qzz.io/threatintel/briefings/${row.slug}` },
    ],
  }));
}

function buildStixPattern(value: string, type: string): string {
  switch (type) {
    case 'ipv4':
      return `[ipv4-addr:value = '${value}']`;
    case 'ipv6':
      return `[ipv6-addr:value = '${value}']`;
    case 'domain':
      return `[domain-name:value = '${value}']`;
    case 'url':
      return `[url:value = '${value}']`;
    case 'hash':
      if (value.length === 64) return `[file:hashes.'SHA-256' = '${value}']`;
      if (value.length === 40) return `[file:hashes.'SHA-1' = '${value}']`;
      if (value.length === 32) return `[file:hashes.'MD5' = '${value}']`;
      return `[file:hashes.'SHA-256' = '${value}']`;
    default:
      return `[artifact:payload_bin = '${value}']`;
  }
}

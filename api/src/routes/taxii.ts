import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { getSiteUrl } from '../lib/site-config';
import { safeEqual } from '../lib/admin-auth';
import { stixId } from '../lib/uuidv5';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * TAXII 2.1 Server — standardized threat intelligence sharing.
 *
 * Implements the Trusted Automated eXchange of Intelligence Information
 * (TAXII) 2.1 protocol, allowing other security tools (MISP, OpenCTI,
 * ThreatConnect, ThreatQ, ThreatStream, Cortex XSOAR, etc.) to pull threat
 * intelligence from this platform.
 *
 * Endpoints:
 *   GET  /api/taxii2/                     → Discovery (absolute api_roots)
 *   GET  /api/taxii2/collections/         → List collections
 *   GET  /api/taxii2/collections/{id}/    → Collection metadata
 *   GET  /api/taxii2/collections/{id}/objects/ → Envelope { more, next }
 *   POST /api/taxii2/collections/{id}/objects/ → Admin-only (all read-only)
 *
 * Get-Objects supports: limit (cap 500), next (opaque offset cursor),
 * added_after (RFC3339, all collections), match[type], match[id],
 * match[version] (accepted; single-version store behaves as "all").
 *
 * Collections:
 *   - iocs: Recent IOCs — rolling 7-day window, use added_after to page
 *   - actors: Threat actor profiles
 *   - malware: Malware families
 *   - vulnerabilities: CVE data
 *   - briefings: Daily/weekly briefings
 *
 * Authentication: API key via Authorization: Bearer, X-API-Key, or HTTP
 * Basic (key as password — for TAXII clients that only speak Basic).
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
    description:
      'Recent IOCs aggregated from 30+ threat intelligence feeds (rolling 7-day window; use added_after for incremental sync)',
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

/** STIX object types served per collection (for match[type] gating). */
const COLLECTION_TYPES: Record<string, string[]> = {
  iocs: ['indicator'],
  actors: ['threat-actor'],
  malware: ['malware'],
  vulnerabilities: ['vulnerability'],
  briefings: ['identity', 'report'],
};

/** Platform producer identity + TLP marking attached to every envelope. */
const PRODUCER_ID = 'identity--b1c2d3e4-0000-5000-8000-000000000001';
const PRODUCER: Record<string, unknown> = {
  type: 'identity',
  spec_version: '2.1',
  id: PRODUCER_ID,
  created: '2024-01-01T00:00:00.000Z',
  modified: '2024-01-01T00:00:00.000Z',
  name: 'pranithjain CTI',
  identity_class: 'organization',
};
// Official OASIS TLP:CLEAR marking-definition id (shared with the STIX exporter).
const MARKING_CLEAR_ID = 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9';
const MARKING_CLEAR: Record<string, unknown> = {
  type: 'marking-definition',
  spec_version: '2.1',
  id: MARKING_CLEAR_ID,
  created: '2017-01-20T00:00:00Z',
  modified: '2017-01-20T00:00:00Z',
  name: 'TLP:CLEAR',
  definition_type: 'tlp',
  definition: { tlp: 'clear' },
};

/**
 * Attach producer + handling refs to collection objects (when absent) and
 * prepend the producer identity + marking so every envelope is self-contained.
 * STIX lists must be non-empty — refs are only added, never emptied.
 */
function withProducer(objects: Record<string, unknown>[]): Record<string, unknown>[] {
  const marked = objects.map((o) => {
    if (o.type === 'identity' || o.type === 'marking-definition') return o;
    const out = { ...o };
    if (!out.created_by_ref) out.created_by_ref = PRODUCER_ID;
    if (!out.object_marking_refs) out.object_marking_refs = [MARKING_CLEAR_ID];
    return out;
  });
  return [PRODUCER, MARKING_CLEAR, ...marked];
}

/** GET /api/taxii2/ — Discovery */
export async function taxiiDiscoveryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // api_roots must be absolute URIs — strict clients (ThreatConnect,
  // ThreatQ, Anomali, XSOAR URL builders) reject relative roots.
  const siteUrl = getSiteUrl(c.env).replace(/\/$/, '');
  const apiRoot = `${siteUrl}/api/taxii2/`;
  return c.json(
    {
      title: 'DFIR & Threat Intel TAXII Server',
      description: 'TAXII 2.1 server for automated threat intelligence sharing',
      default: `${apiRoot}collections/`,
      api_roots: [apiRoot],
    },
    200,
    { 'Content-Type': TAXII_CONTENT_TYPE }
  );
}

/** GET /api/taxii2/collections/ — List collections */
export async function taxiiCollectionsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json({ collections: COLLECTIONS }, 200, { 'Content-Type': TAXII_CONTENT_TYPE });
}

/** GET /api/taxii2/collections/{id}/ — Collection metadata */
export async function taxiiCollectionHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const collection = COLLECTIONS.find((col) => col.id === id);

  if (!collection) {
    return c.json({ title: 'Not Found', description: `Collection '${id}' does not exist` }, 404, {
      'Content-Type': TAXII_CONTENT_TYPE,
    });
  }

  return c.json(collection, 200, { 'Content-Type': TAXII_CONTENT_TYPE });
}

/** GET /api/taxii2/collections/{id}/objects/ — Get STIX objects (envelope + paging) */
export async function taxiiObjectsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const collection = COLLECTIONS.find((col) => col.id === id);

  if (!collection) {
    return c.json({ title: 'Not Found', description: `Collection '${id}' does not exist` }, 404, {
      'Content-Type': TAXII_CONTENT_TYPE,
    });
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) {
    return c.json({ title: 'Service Unavailable', description: 'Database not configured' }, 503, {
      'Content-Type': TAXII_CONTENT_TYPE,
    });
  }

  const badRequest = (description: string): Response =>
    c.json({ title: 'Bad Request', description }, 400, { 'Content-Type': TAXII_CONTENT_TYPE });

  // Pagination: limit (cap 500) + opaque `next` offset cursor.
  const limitRaw = c.req.query('limit');
  const limit = limitRaw === undefined ? 100 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return badRequest('limit must be an integer between 1 and 500');
  }
  const nextRaw = c.req.query('next');
  const offset = nextRaw === undefined ? 0 : Number(nextRaw);
  if (!Number.isInteger(offset) || offset < 0 || offset > 2147483647) {
    return badRequest('next is an opaque cursor from a previous response');
  }

  // Incremental polling — honored by every collection (compared against
  // first_seen/last_seen/published_at depending on the collection).
  const addedAfter = c.req.query('added_after');
  if (addedAfter !== undefined && Number.isNaN(Date.parse(addedAfter))) {
    return badRequest('added_after must be an RFC3339 timestamp');
  }

  // STIX filters. match[version] is accepted but this store keeps a single
  // version per object, so it behaves as "all" (documented, not rejected).
  const matchTypes = (c.req.query('match[type]') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const matchIds =
    c.req.query('match[id]') === undefined
      ? null
      : new Set(
          c.req
            .query('match[id]')!
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        );

  // match[type] that excludes every type in this collection → empty page
  // (producer envelope only, same shape as any other empty result).
  const collectionTypes = COLLECTION_TYPES[id ?? ''] ?? [];
  if (matchTypes.length > 0 && !matchTypes.some((t) => collectionTypes.includes(t))) {
    return taxiiEnvelope(withProducer([]));
  }

  try {
    // match[id] targets individual objects — return all matches, no paging.
    const pageLimit = matchIds ? 5000 : limit + 1;
    const pageOffset = matchIds ? 0 : offset;
    let objects: Record<string, unknown>[] = [];

    switch (id) {
      case 'iocs':
        objects = await getIocObjects(db, pageLimit, addedAfter, pageOffset);
        break;
      case 'actors':
        objects = await getActorObjects(db, pageLimit, addedAfter, pageOffset);
        break;
      case 'malware':
        objects = await getMalwareObjects(db, pageLimit, addedAfter, pageOffset);
        break;
      case 'vulnerabilities':
        objects = await getVulnerabilityObjects(db, pageLimit, addedAfter, pageOffset);
        break;
      case 'briefings':
        objects = await getBriefingObjects(db, pageLimit, c.env, addedAfter, pageOffset);
        break;
    }

    if (matchTypes.length > 0) {
      objects = objects.filter((o) => matchTypes.includes(o.type as string));
    }
    if (matchIds) {
      objects = objects.filter((o) => matchIds.has(o.id as string));
      return taxiiEnvelope(withProducer(objects));
    }

    const more = objects.length > limit;
    const page = more ? objects.slice(0, limit) : objects;
    return taxiiEnvelope(withProducer(page), more ? { more: true, next: String(offset + limit) } : undefined);
  } catch (err) {
    logError('handler failed', err);
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

/** TAXII 2.1 Get-Objects envelope (TAXII media type, not application/stix+json). */
function taxiiEnvelope(objects: Record<string, unknown>[], page?: { more: boolean; next: string }): Response {
  return Response.json(
    {
      type: 'envelope',
      id: `envelope--${crypto.randomUUID()}`,
      objects,
      more: page?.more ?? false,
      ...(page ? { next: page.next } : {}),
    },
    {
      status: 200,
      headers: {
        'Content-Type': TAXII_CONTENT_TYPE,
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
}

/** POST /api/taxii2/collections/{id}/objects/ — Add STIX objects */
export async function taxiiAddObjectsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Require admin token — TAXII write operations are admin-only.
  // Constant-time compare (safeEqual) to avoid leaking the token via timing.
  const auth = c.req.header('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const required = c.env.ADMIN_TOKEN ?? '';
  if (!required || !token || !safeEqual(token, required)) {
    return c.json({ title: 'Unauthorized', description: 'Valid admin token required' }, 401, {
      'Content-Type': TAXII_CONTENT_TYPE,
    });
  }

  const id = c.req.param('id');
  const collection = COLLECTIONS.find((col) => col.id === id);

  if (!collection) {
    return c.json({ title: 'Not Found', description: `Collection '${id}' does not exist` }, 404, {
      'Content-Type': TAXII_CONTENT_TYPE,
    });
  }

  if (!collection.can_write) {
    return c.json({ title: 'Forbidden', description: 'This collection is read-only' }, 403, {
      'Content-Type': TAXII_CONTENT_TYPE,
    });
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

export async function getIocObjects(
  db: D1Database,
  limit: number,
  addedAfter?: string,
  offset = 0
): Promise<Record<string, unknown>[]> {
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

  query += ' ORDER BY last_seen DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await db
    .prepare(query)
    .bind(...params)
    .all<{
      indicator: string;
      indicator_type: string;
      first_seen: string;
      last_seen: string;
      peak_score: number;
      tags: string;
    }>();

  const out: Record<string, unknown>[] = [];
  for (const row of rows.results ?? []) {
    // Unknown indicator types have no valid STIX pattern — skip rather than
    // emit a misleading guess (previously artifact:payload_bin).
    const pattern = buildStixPattern(row.indicator, row.indicator_type);
    if (!pattern) continue;
    const tags: string[] = JSON.parse(row.tags ?? '[]');

    out.push({
      type: 'indicator',
      spec_version: '2.1',
      id: await stixId('indicator', `indicator|${row.indicator_type}|${String(row.indicator).toLowerCase()}`),
      created: row.first_seen,
      modified: row.last_seen,
      name: row.indicator,
      description: `IOC from threat intelligence feeds. Tags: ${tags.join(', ')}`,
      pattern,
      pattern_type: 'stix',
      valid_from: row.first_seen,
      // STIX lists must be non-empty — omit labels when there are no tags.
      ...(tags.length > 0 ? { labels: tags.slice(0, 5) } : {}),
      confidence: row.peak_score >= 70 ? 85 : row.peak_score >= 40 ? 60 : 30,
    });
  }
  return out;
}

export async function getActorObjects(
  db: D1Database,
  limit: number,
  addedAfter?: string,
  offset = 0
): Promise<Record<string, unknown>[]> {
  // Query graph DB for actor nodes; fall back to hardcoded if empty
  let query = 'SELECT id, value, properties, confidence, sources, last_seen FROM graph_nodes WHERE type = ?';
  const params: unknown[] = ['actor'];
  if (addedAfter) {
    query += ' AND last_seen > ?';
    params.push(addedAfter);
  }
  query += ' ORDER BY confidence DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = await db
    .prepare(query)
    .bind(...params)
    .all<{ id: string; value: string; properties: string; confidence: number; sources: string; last_seen: string }>();
  const fromDb = await Promise.all(
    (rows.results ?? []).map(async (r) => {
      const props = JSON.parse(r.properties || '{}') as Record<string, unknown>;
      const sources = JSON.parse(r.sources || '[]') as string[];
      const actorName = (props.label ?? r.value) as string;
      return {
        type: 'threat-actor',
        spec_version: '2.1',
        id: await stixId('threat-actor', `threat-actor|${actorName}`),
        created: r.last_seen,
        modified: r.last_seen,
        name: actorName,
        aliases: [r.value],
        description: `Threat actor from ${sources.join(', ') || 'unknown source'}`,
        threat_actor_types: ['unknown'],
        sophistication: 'advanced',
        resource_level: 'unknown',
        primary_motivation: 'unknown',
        confidence: r.confidence,
      };
    })
  );

  if (fromDb.length > 0) return fromDb;

  // Fallback: hardcoded actors
  const ACTORS = [
    { name: 'APT28', aliases: ['Fancy Bear', 'Sofacy'], country: 'Russia' },
    { name: 'APT29', aliases: ['Cozy Bear', 'The Dukes'], country: 'Russia' },
    { name: 'Lazarus Group', aliases: ['HIDDEN COBRA', 'Zinc'], country: 'North Korea' },
    { name: 'APT41', aliases: ['Double Dragon', 'Winnti'], country: 'China' },
    { name: 'Sandworm', aliases: ['Voodoo Bear', 'Seashell Blizzard'], country: 'Russia' },
  ];
  return await Promise.all(
    ACTORS.slice(offset, offset + limit).map(async (actor) => ({
      type: 'threat-actor',
      spec_version: '2.1',
      id: await stixId('threat-actor', `threat-actor|${actor.name}`),
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
    }))
  );
}

export async function getMalwareObjects(
  db: D1Database,
  limit: number,
  addedAfter?: string,
  offset = 0
): Promise<Record<string, unknown>[]> {
  let query = 'SELECT id, value, properties, confidence, sources, last_seen FROM graph_nodes WHERE type = ?';
  const params: unknown[] = ['malware'];
  if (addedAfter) {
    query += ' AND last_seen > ?';
    params.push(addedAfter);
  }
  query += ' ORDER BY confidence DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = await db
    .prepare(query)
    .bind(...params)
    .all<{ id: string; value: string; properties: string; confidence: number; sources: string; last_seen: string }>();
  const fromDb = await Promise.all(
    (rows.results ?? []).map(async (r) => {
      const props = JSON.parse(r.properties || '{}') as Record<string, unknown>;
      const malwareName = (props.label ?? r.value) as string;
      return {
        type: 'malware',
        spec_version: '2.1',
        id: await stixId('malware', `malware|${malwareName}`),
        created: r.last_seen,
        modified: r.last_seen,
        name: malwareName,
        description: `Malware from graph database (confidence: ${r.confidence})`,
        malware_types: ['unknown'],
        is_family: true,
        confidence: r.confidence,
      };
    })
  );

  if (fromDb.length > 0) return fromDb;

  const MALWARE = [
    {
      name: 'Cobalt Strike',
      type: 'backdoor',
      description: 'Commercial penetration testing tool abused by threat actors',
    },
    { name: 'Mimikatz', type: 'credential-theft', description: 'Windows credential dumping tool' },
    { name: 'Emotet', type: 'banking-trojan', description: 'Modular banking trojan and malware delivery service' },
    { name: 'LockBit', type: 'ransomware', description: 'Ransomware-as-a-service operation' },
    { name: 'TrickBot', type: 'banking-trojan', description: 'Modular banking trojan with C2 capabilities' },
  ];
  return await Promise.all(
    MALWARE.slice(offset, offset + limit).map(async (m) => ({
      type: 'malware',
      spec_version: '2.1',
      id: await stixId('malware', `malware|${m.name}`),
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      name: m.name,
      description: m.description,
      malware_types: [m.type],
      is_family: true,
    }))
  );
}

export async function getVulnerabilityObjects(
  db: D1Database,
  limit: number,
  addedAfter?: string,
  offset = 0
): Promise<Record<string, unknown>[]> {
  let query = 'SELECT id, value, properties, confidence, sources, last_seen FROM graph_nodes WHERE type = ?';
  const params: unknown[] = ['cve'];
  if (addedAfter) {
    query += ' AND last_seen > ?';
    params.push(addedAfter);
  }
  query += ' ORDER BY last_seen DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = await db
    .prepare(query)
    .bind(...params)
    .all<{ id: string; value: string; properties: string; confidence: number; sources: string; last_seen: string }>();
  const fromDb = await Promise.all(
    (rows.results ?? []).map(async (r) => ({
      type: 'vulnerability',
      spec_version: '2.1',
      id: await stixId('vulnerability', `vulnerability|${r.value}`),
      created: r.last_seen,
      modified: r.last_seen,
      name: r.value.toUpperCase(),
      description: `CVE from graph database (confidence: ${r.confidence})`,
      external_references: [{ source_name: 'CVE', external_id: r.value.toUpperCase() }],
      confidence: r.confidence,
    }))
  );

  if (fromDb.length > 0) return fromDb;

  return [
    {
      type: 'vulnerability',
      spec_version: '2.1',
      id: await stixId('vulnerability', `vulnerability|CVE-2024-3094`),
      created: '2024-03-29T00:00:00Z',
      modified: '2024-03-29T00:00:00Z',
      name: 'CVE-2024-3094',
      description: 'XZ Utils backdoor - malicious code in liblzma',
      external_references: [{ source_name: 'CVE', external_id: 'CVE-2024-3094' }],
    },
  ].slice(offset, offset + limit);
}

export async function getBriefingObjects(
  db: D1Database,
  limit: number,
  env?: Env,
  addedAfter?: string,
  offset = 0
): Promise<Record<string, unknown>[]> {
  let query = 'SELECT slug, title, type, published_at FROM briefings';
  const params: unknown[] = [];
  if (addedAfter) {
    query += ' WHERE published_at > ?';
    params.push(addedAfter);
  }
  query += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = await db
    .prepare(query)
    .bind(...params)
    .all<{ slug: string; title: string; type: string; published_at: string }>();
  const results = rows.results ?? [];
  if (results.length === 0) return [];

  const siteUrl = env ? getSiteUrl(env) : 'https://pranithjain.qzz.io';
  // STIX 2.1 requires `report.object_refs`, and STIX lists MUST be non-empty.
  // These briefing reports are thin metadata (no per-object extraction here), so
  // we emit a stable producer `identity` and have every report reference it —
  // a valid, non-empty object_refs + created_by_ref. (An empty array would be
  // spec-invalid.)
  const producerId = await stixId('identity', 'identity|pranithjain-cti');
  const producer: Record<string, unknown> = {
    type: 'identity',
    spec_version: '2.1',
    id: producerId,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    name: 'pranithjain CTI',
    identity_class: 'organization',
  };

  const reports = await Promise.all(
    results.map(async (row) => {
      return {
        type: 'report',
        spec_version: '2.1',
        id: await stixId('report', `report|${row.slug}`),
        created: row.published_at,
        modified: row.published_at,
        created_by_ref: producerId,
        name: row.title,
        description: `${row.type} threat intelligence briefing`,
        report_types: ['threat-report'],
        published: row.published_at,
        object_refs: [producerId],
        external_references: [{ source_name: 'briefing', url: `${siteUrl}/threatintel/briefings/${row.slug}` }],
      } satisfies Record<string, unknown>;
    })
  );
  return [producer, ...reports];
}

function buildStixPattern(value: string, type: string): string | null {
  switch (type) {
    case 'ipv4':
      return `[ipv4-addr:value = '${value}']`;
    case 'ipv6':
      return `[ipv6-addr:value = '${value}']`;
    case 'domain':
      return `[domain-name:value = '${value}']`;
    case 'url':
      return `[url:value = '${value}']`;
    case 'email':
      return `[email-addr:value = '${value}']`;
    case 'hash':
      if (value.length === 64) return `[file:hashes.'SHA-256' = '${value}']`;
      if (value.length === 40) return `[file:hashes.'SHA-1' = '${value}']`;
      if (value.length === 32) return `[file:hashes.'MD5' = '${value}']`;
      return `[file:hashes.'SHA-256' = '${value}']`;
    case 'md5':
      return `[file:hashes.'MD5' = '${value}']`;
    case 'sha1':
      return `[file:hashes.'SHA-1' = '${value}']`;
    case 'sha256':
      return `[file:hashes.'SHA-256' = '${value}']`;
    default:
      // No valid STIX pattern for this type — the caller skips the object
      // rather than emitting a misleading guess. Every type the lifecycle
      // writer emits is mapped above, so this is a defensive dead-end that
      // keeps limit+1 paging exact.
      return null;
  }
}

import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * STIX 2.1 fetch-by-ID via the public MITRE ATT&CK TAXII server.
 *
 * Coverage limit: only objects published in the three MITRE ATT&CK
 * domains (Enterprise / ICS / Mobile) — attack-pattern, intrusion-set,
 * malware, tool, x-mitre-tactic, x-mitre-mitigation, course-of-action,
 * identity, marking-definition, relationship. Other STIX feeds
 * (commercial threat-intel, OASIS Common Vulnerability Reporting,
 * etc.) require auth and are out of scope.
 *
 * STIX ID shape: `<type>--<uuid>` (e.g. `attack-pattern--01a5...`).
 *
 * Cached 7d at the edge. ATT&CK objects revise rarely (~quarterly),
 * so a long TTL is fine and dramatically lowers TAXII upstream load.
 */

const FETCH_TIMEOUT = 12_000;
const CACHE_TTL = 7 * 24 * 3600;
const TAXII_BASE = 'https://attack-taxii.mitre.org/api/v21';
// Public collection IDs published in MITRE's TAXII discovery (probed live).
const COLLECTIONS = [
  { id: 'x-mitre-collection--1f5f1533-f617-4ca8-9ab4-6a02367fa019', label: 'Enterprise ATT&CK' },
  { id: 'x-mitre-collection--90c00720-636b-4485-b342-8751d232bf09', label: 'ICS ATT&CK' },
  { id: 'x-mitre-collection--dac0d2d7-8653-445c-9bff-82f934c1e858', label: 'Mobile ATT&CK' },
];
const STIX_ID_RE = /^[a-z][a-z0-9-]*--[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TaxiiObject {
  id?: string;
  type?: string;
  name?: string;
  description?: string;
  external_references?: Array<{ source_name?: string; url?: string; external_id?: string; description?: string }>;
  [k: string]: unknown;
}

interface TaxiiEnvelope {
  objects?: TaxiiObject[];
  more?: boolean;
}

async function fetchFromCollection(collectionId: string, stixId: string): Promise<TaxiiObject | null> {
  // TAXII spec uses ?match[id]=... — brackets must be URL-encoded.
  const url = `${TAXII_BASE}/collections/${collectionId}/objects/?match%5Bid%5D=${encodeURIComponent(stixId)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: 'application/taxii+json;version=2.1',
        'user-agent': 'pranithjain-dfir/1.0',
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as TaxiiEnvelope;
    return body.objects?.[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface StixFetchResponse {
  found: boolean;
  stix_id: string;
  /** Source TAXII collection. */
  collection?: string;
  /** Source TAXII collection raw ID. */
  collection_id?: string;
  /** The full STIX 2.1 object as returned by TAXII. */
  object?: TaxiiObject;
  /** Convenience extract for the UI. */
  attack_id?: string;
  source: string;
  source_url: string;
}

export async function stixFetchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const stixId = (c.req.query('id') ?? '').trim();
  if (!stixId) return c.json({ error: 'missing id' }, 400);
  if (!STIX_ID_RE.test(stixId)) {
    return c.json({ error: 'invalid STIX ID — expected <type>--<uuid>, e.g. attack-pattern--01a5...' }, 400);
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://stix-fetch-cache.internal/v1?id=${encodeURIComponent(stixId)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Fan out to all three collections in parallel — first match wins.
  const settled = await Promise.all(
    COLLECTIONS.map((c) => fetchFromCollection(c.id, stixId).then((obj) => ({ obj, meta: c })))
  );

  let found: { obj: TaxiiObject; meta: (typeof COLLECTIONS)[number] } | null = null;
  for (const r of settled) {
    if (r.obj) {
      found = { obj: r.obj, meta: r.meta };
      break;
    }
  }

  const body: StixFetchResponse = found
    ? {
        found: true,
        stix_id: stixId,
        collection: found.meta.label,
        collection_id: found.meta.id,
        object: found.obj,
        attack_id: found.obj.external_references?.find((r) => r.source_name === 'mitre-attack')?.external_id,
        source: 'MITRE ATT&CK TAXII 2.1',
        source_url: 'https://attack-taxii.mitre.org/api/v21/',
      }
    : {
        found: false,
        stix_id: stixId,
        source: 'MITRE ATT&CK TAXII 2.1',
        source_url: 'https://attack-taxii.mitre.org/api/v21/',
      };

  const status = found ? 200 : 404;
  const response = c.json(body, status, {
    'Cache-Control': found ? `public, max-age=${CACHE_TTL}` : 'no-store',
  });
  if (found) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

import type { Context } from 'hono';
import type { Env } from '../env';
import { ATTACK_ID_INDEX } from '../data/attack-id-index';

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
// MITRE ATT&CK external ids: technique T1566(.001), software S0001, group
// G0016, mitigation M1049, tactic TA0001, data-source DS0009, campaign C0001.
const ATTACK_ID_RE = /^(?:T\d{4}(?:\.\d{3})?|S\d{4}|G\d{4}|M\d{4}|TA\d{4}|DS\d{4}|C\d{4})$/i;
const COL_BY_KEY: Record<'e' | 'i' | 'm', (typeof COLLECTIONS)[number]> = {
  e: COLLECTIONS[0]!,
  i: COLLECTIONS[1]!,
  m: COLLECTIONS[2]!,
};

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

interface FetchOutcome {
  obj: TaxiiObject | null;
  /** Upstream HTTP status. -1 = network error / abort. */
  status: number;
}

async function fetchFromCollection(collectionId: string, stixId: string): Promise<FetchOutcome> {
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
    if (!res.ok) return { obj: null, status: res.status };
    const body = (await res.json()) as TaxiiEnvelope;
    return { obj: body.objects?.[0] ?? null, status: 200 };
  } catch {
    return { obj: null, status: -1 };
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
  const raw = (c.req.query('id') ?? '').trim();
  if (!raw) return c.json({ error: 'missing id' }, 400);

  // Resolve the lookup. Accept BOTH a STIX id (<type>--<uuid>) and a MITRE
  // ATT&CK external id (T1566.001 / S0001 / G0016 / M1049 / TA0001 / DS0009
  // / C0001). MITRE's TAXII can't filter by external_id, so an ATT&CK id is
  // mapped to its STIX uuid + owning collection via the committed index.
  let stixId: string;
  let targets: (typeof COLLECTIONS)[number][];
  if (STIX_ID_RE.test(raw)) {
    stixId = raw;
    targets = COLLECTIONS; // unknown collection — fan out to all three
  } else if (ATTACK_ID_RE.test(raw)) {
    const ref = ATTACK_ID_INDEX[raw.toUpperCase()];
    if (!ref) {
      return c.json(
        {
          error: `unknown ATT&CK id "${raw.toUpperCase()}" — not in Enterprise/ICS/Mobile (revoked, deprecated, or mistyped)`,
        },
        404,
        { 'cache-control': 'no-store' }
      );
    }
    stixId = ref.id;
    targets = [COL_BY_KEY[ref.col]];
  } else {
    return c.json(
      {
        error:
          'invalid id — expected a STIX id (<type>--<uuid>, e.g. attack-pattern--01a5a209-b94c-450b-b7f9-946497d91055) or a MITRE ATT&CK id (e.g. T1566.001, S0001, G0016, TA0001)',
      },
      400
    );
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://stix-fetch-cache.internal/v2?id=${encodeURIComponent(raw)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  // Fan out to the target collection(s) in parallel — first match wins.
  const settled = await Promise.all(
    targets.map((c) => fetchFromCollection(c.id, stixId).then((r) => ({ ...r, meta: c })))
  );

  let found: { obj: TaxiiObject; meta: (typeof COLLECTIONS)[number] } | null = null;
  for (const r of settled) {
    if (r.obj) {
      found = { obj: r.obj, meta: r.meta };
      break;
    }
  }

  // If not found, distinguish "definitively absent" (all 3 returned 200
  // with empty objects) from "upstream told us to back off" (any 429).
  if (!found) {
    if (settled.every((r) => r.status === 429)) {
      return c.json(
        { error: 'mitre_taxii_rate_limited', upstream: 'attack-taxii.mitre.org', upstream_status: 429 },
        429,
        { 'retry-after': '60', 'cache-control': 'no-store' }
      );
    }
    if (settled.every((r) => r.status !== 200)) {
      return c.json({ error: 'mitre_taxii_unreachable', statuses: settled.map((r) => r.status) }, 502, {
        'cache-control': 'no-store',
      });
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

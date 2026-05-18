/**
 * CTI output feeds — make the site a *producer* of machine-readable threat
 * intel, not just a viewer:
 *
 *   - TAXII 2.1 (read-only)  → consumable by OpenCTI / MISP / TheHive /
 *     any STIX client. Discovery → API root → one collection → objects.
 *   - MISP feed              → manifest.json + <uuid>.json event, the
 *     format `misp-modules`/MISP "Add feed" expects.
 *
 * Both wrap the existing STIX 2.1 bundle (fetchIocCorrelationStix) so
 * there's a single source of truth. Everything is GET + edge-cached and
 * lives under /api/v1/ so the API app serves it (clients just point their
 * discovery/feed URL at the full path — TAXII doesn't mandate a root).
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchIocCorrelationStix } from './ioc-correlation-stix';

const TAXII_CT = 'application/taxii+json;version=2.1';
const STIX_CT = 'application/stix+json;version=2.1';
const BASE = 'https://pranithjain.qzz.io/api/v1';
const COLLECTION_ID = 'a1f5c2e0-1d3b-4c7a-9e21-pranithjainioc';
const MISP_EVENT_UUID = 'b7e4d9c2-3a16-4f8e-8c52-pranithjainmisp';
const CACHE_TTL = 3600;

function cached(c: Context<{ Bindings: Env }>, key: string, body: unknown, ct: string): Promise<Response> {
  const res = new Response(JSON.stringify(body), {
    headers: { 'content-type': ct, 'cache-control': `public, max-age=${CACHE_TTL}` },
  });
  const cache = (caches as unknown as { default: Cache }).default;
  c.executionCtx.waitUntil(cache.put(new Request(key), res.clone()));
  return Promise.resolve(res);
}
async function fromCache(key: string): Promise<Response | undefined> {
  const cache = (caches as unknown as { default: Cache }).default;
  return cache.match(new Request(key));
}

// ─── TAXII 2.1 ────────────────────────────────────────────────────────────

/** GET /api/v1/taxii2/ — Discovery */
export function taxiiDiscoveryHandler(c: Context<{ Bindings: Env }>) {
  return c.json(
    {
      title: 'pranithjain.qzz.io Threat Intel',
      description: 'Read-only TAXII 2.1 server exposing aggregated abuse.ch / community IOCs as STIX 2.1.',
      contact: 'https://pranithjain.qzz.io',
      default: `${BASE}/taxii2/api/`,
      api_roots: [`${BASE}/taxii2/api/`],
    },
    200,
    { 'content-type': TAXII_CT, 'cache-control': `public, max-age=${CACHE_TTL}` }
  );
}

/** GET /api/v1/taxii2/api/ — API Root */
export function taxiiApiRootHandler(c: Context<{ Bindings: Env }>) {
  return c.json(
    {
      title: 'Default API Root',
      description: 'Single read-only collection of current malicious indicators.',
      versions: ['application/taxii+json;version=2.1'],
      max_content_length: 10485760,
    },
    200,
    { 'content-type': TAXII_CT, 'cache-control': `public, max-age=${CACHE_TTL}` }
  );
}

const COLLECTION_META = {
  id: COLLECTION_ID,
  title: 'Aggregated IOCs',
  description: 'Live malicious IPs / domains / URLs / file hashes correlated from abuse.ch + community feeds.',
  can_read: true,
  can_write: false,
  media_types: [STIX_CT],
};

/** GET /api/v1/taxii2/api/collections/ */
export function taxiiCollectionsHandler(c: Context<{ Bindings: Env }>) {
  return c.json({ collections: [COLLECTION_META] }, 200, {
    'content-type': TAXII_CT,
    'cache-control': `public, max-age=${CACHE_TTL}`,
  });
}

/** GET /api/v1/taxii2/api/collections/:id/ */
export function taxiiCollectionHandler(c: Context<{ Bindings: Env }>) {
  if (c.req.param('id') !== COLLECTION_ID) return c.json({ title: 'Not Found', http_status: '404' }, 404);
  return c.json(COLLECTION_META, 200, { 'content-type': TAXII_CT, 'cache-control': `public, max-age=${CACHE_TTL}` });
}

/** GET /api/v1/taxii2/api/collections/:id/objects/ — the STIX objects (TAXII envelope) */
export async function taxiiObjectsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (c.req.param('id') !== COLLECTION_ID) return c.json({ title: 'Not Found', http_status: '404' }, 404);
  const key = 'https://cti-taxii-objects.internal/v1';
  const hit = await fromCache(key);
  if (hit) return hit;
  const bundle = await fetchIocCorrelationStix();
  return cached(c, key, { objects: bundle.objects, more: false }, TAXII_CT);
}

// ─── MISP feed ────────────────────────────────────────────────────────────

/** Recover {misp type, value, category} from a STIX 2.1 indicator pattern. */
function patternToMisp(pattern: string): { type: string; value: string; category: string } | null {
  let m = /\[ipv4-addr:value = '([^']+)'\]/.exec(pattern);
  if (m) return { type: 'ip-dst', value: m[1]!, category: 'Network activity' };
  m = /\[domain-name:value = '([^']+)'\]/.exec(pattern);
  if (m) return { type: 'domain', value: m[1]!, category: 'Network activity' };
  m = /\[url:value = '([^']+)'\]/.exec(pattern);
  if (m) return { type: 'url', value: m[1]!, category: 'Network activity' };
  m = /\[file:hashes\.'([^']+)' = '([^']+)'\]/.exec(pattern);
  if (m) {
    const algo = m[1]!.toLowerCase().replace('-', '');
    const t = algo === 'sha256' ? 'sha256' : algo === 'sha1' ? 'sha1' : algo === 'md5' ? 'md5' : 'sha256';
    return { type: t, value: m[2]!, category: 'Payload delivery' };
  }
  return null;
}

async function buildMispEvent(): Promise<Record<string, unknown>> {
  const bundle = await fetchIocCorrelationStix();
  const now = new Date();
  const ts = Math.floor(now.getTime() / 1000).toString();
  const attributes = bundle.objects
    .filter((o): o is Extract<typeof o, { type: 'indicator' }> => o.type === 'indicator')
    .map((ind, i) => {
      const a = patternToMisp(ind.pattern);
      if (!a) return null;
      return {
        uuid: `${MISP_EVENT_UUID.slice(0, 24)}${i.toString(16).padStart(12, '0')}`,
        type: a.type,
        category: a.category,
        to_ids: true,
        value: a.value,
        timestamp: ts,
        comment: (ind.external_references ?? []).map((r) => r.source_name).join(', '),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    Event: {
      uuid: MISP_EVENT_UUID,
      info: 'pranithjain.qzz.io aggregated IOC feed (abuse.ch + community)',
      date: now.toISOString().slice(0, 10),
      threat_level_id: '2',
      analysis: '2',
      published: true,
      timestamp: ts,
      Orgc: { name: 'pranithjain.qzz.io', uuid: 'c9a2f1e8-4b73-4d6a-91c5-pranithjainorg' },
      Attribute: attributes,
      Tag: [{ name: 'tlp:clear' }, { name: 'type:OSINT' }],
    },
  };
}

/** GET /api/v1/cti/misp/manifest.json */
export async function mispManifestHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const key = 'https://cti-misp-manifest.internal/v1';
  const hit = await fromCache(key);
  if (hit) return hit;
  const ev = (await buildMispEvent()).Event as Record<string, unknown>;
  const manifest = {
    [MISP_EVENT_UUID]: {
      Orgc: ev.Orgc,
      Tag: ev.Tag,
      info: ev.info,
      date: ev.date,
      analysis: ev.analysis,
      threat_level_id: ev.threat_level_id,
      timestamp: ev.timestamp,
    },
  };
  return cached(c, key, manifest, 'application/json');
}

/** GET /api/v1/cti/misp/:file  (the <uuid>.json event) */
export async function mispEventHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const file = c.req.param('file');
  if (file !== `${MISP_EVENT_UUID}.json`) return c.json({ error: 'not found' }, 404);
  const key = 'https://cti-misp-event.internal/v1';
  const hit = await fromCache(key);
  if (hit) return hit;
  return cached(c, key, await buildMispEvent(), 'application/json');
}

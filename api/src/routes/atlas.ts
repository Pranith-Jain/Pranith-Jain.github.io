import type { Context } from 'hono';
import type { Env } from '../env';

const ATLAS_DATA_URL = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/atlas_json/atlas.json';

interface AtlasTechnique {
  id: string;
  name: string;
  description: string;
  tactic: string | null;
  tacticId: string | null;
  url: string;
}

interface TechniqueLookupResponse {
  technique: AtlasTechnique | null;
  relatedTechniques: string[];
  error?: string;
}

const CACHE_TTL = 86400;

interface AtlasStixObject {
  type: string;
  id: string;
  name?: string;
  description?: string;
  external_references?: Array<{ source_name: string; external_id?: string; url?: string }>;
  kill_chain_phases?: Array<{ phase_name: string; phase_id?: string }>;
  modified: string;
}

let atlasCache: { data: AtlasStixObject[]; timestamp: number } | null = null;

class UpstreamError extends Error {
  constructor(
    public upstreamStatus: number,
    public retryAfter: string | null
  ) {
    super(`ATLAS API failed: ${upstreamStatus}`);
  }
}

async function fetchAtlasData(): Promise<AtlasStixObject[]> {
  if (atlasCache && Date.now() - atlasCache.timestamp < CACHE_TTL * 1000) {
    return atlasCache.data;
  }
  const res = await fetch(ATLAS_DATA_URL, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    throw new UpstreamError(res.status, res.headers.get('retry-after'));
  }
  const bundle = (await res.json()) as { objects: AtlasStixObject[] };
  atlasCache = { data: bundle.objects, timestamp: Date.now() };
  return bundle.objects;
}

export async function atlasTechniqueHandler(c: Context<{ Bindings: Env }>) {
  const q = c.req.query('technique') ?? c.req.query('t') ?? c.req.query('q');
  if (!q) {
    return c.json({ error: 'missing technique param (e.g. AML-T1234)' }, 400);
  }

  // Accept BOTH our local dash format (`AML-T0000`, used by the static
  // matrix in `src/data/dfir/atlas-matrix.ts`) AND MITRE's upstream dot
  // format (`AML.T0000`). The upstream STIX bundle uses dots in its
  // `external_references[].external_id`, so we must compare against the
  // dot form when searching.
  const techniqueId = q.toUpperCase();
  if (!techniqueId.match(/^AML[-.]T\d{4}(\.\d{3})?$/i)) {
    return c.json({ error: 'invalid ATLAS technique ID (expected AML-T0000 or AML.T0000)' }, 400);
  }
  // Canonicalise both forms — `AML-T0000.001` → `AML.T0000.001` for the lookup.
  const techniqueIdDot = techniqueId.replace(/^AML-/, 'AML.');

  let objects: AtlasStixObject[];
  try {
    objects = await fetchAtlasData();
  } catch (err) {
    if (err instanceof UpstreamError) {
      const status = err.upstreamStatus === 429 ? 429 : 502;
      return c.json(
        { error: 'atlas_upstream', upstream: 'raw.githubusercontent.com', upstream_status: err.upstreamStatus },
        status,
        {
          ...(err.retryAfter
            ? { 'retry-after': err.retryAfter }
            : err.upstreamStatus === 429
              ? { 'retry-after': '60' }
              : {}),
          'cache-control': 'no-store',
        }
      );
    }
    if (err instanceof Error) console.warn('atlas fetch failed:', err.message);
    return c.json({ error: 'atlas_unreachable' }, 502);
  }

  const technique = objects.find(
    (o) =>
      o.type === 'attack-pattern' &&
      o.external_references?.some(
        (r) =>
          r.external_id?.toUpperCase() === techniqueIdDot ||
          r.url?.toUpperCase().includes(`/TECHNIQUES/${techniqueIdDot}`)
      )
  );

  if (!technique) {
    return c.json({ error: 'technique not found' }, 404);
  }

  const tactic = technique.kill_chain_phases?.[0]?.phase_name ?? null;
  const tacticId = technique.kill_chain_phases?.[0]?.phase_id ?? null;

  const related = objects
    .filter((o) => o.type === 'attack-pattern' && o.id !== technique.id)
    .filter((o) => o.name?.toLowerCase().includes(technique.name?.toLowerCase()?.split(' ')[0] ?? ''))
    .slice(0, 5)
    .map((o) => o.external_references?.find((r) => r.external_id?.startsWith('AML-T'))?.external_id ?? o.id);

  const response: TechniqueLookupResponse = {
    technique: {
      id: techniqueId,
      name: technique.name ?? '',
      description: technique.description?.slice(0, 500) ?? '',
      tactic,
      tacticId,
      url: `https://atlas.mitre.org/techniques/${techniqueId}`,
    },
    relatedTechniques: related,
  };

  return c.json(response, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
}

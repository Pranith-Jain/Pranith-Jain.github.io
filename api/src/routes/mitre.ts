import type { Context } from 'hono';
import type { Env } from '../env';

const MITRE_ATTCK_API = 'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';

interface MitreTechnique {
  id: string;
  name: string;
  description: string;
  tactic: string | null;
  platforms: string[];
  dataSources: string[];
  detection: string;
  mitreUrl: string;
}

interface MitreActor {
  id: string;
  name: string;
  aliases: string[];
}

interface TechniqueLookupResponse {
  technique: MitreTechnique | null;
  actors: MitreActor[];
  relatedTechniques: string[];
  error?: string;
}

const CACHE_TTL = 86400;

interface MitreStixObject {
  type: string;
  id: string;
  name?: string;
  description?: string;
  external_references?: Array<{ source_name: string; external_id?: string; url?: string }>;
  kill_chain_phases?: Array<{ phase_name: string }>;
  x_mitre_platforms?: string[];
  x_mitre_data_sources?: string[];
  x_mitre_detection?: string;
  created: string;
  modified: string;
}

let mitreCache: { data: MitreStixObject[]; timestamp: number } | null = null;

async function fetchMitreData(): Promise<MitreStixObject[]> {
  if (mitreCache && Date.now() - mitreCache.timestamp < CACHE_TTL * 1000) {
    return mitreCache.data;
  }
  const res = await fetch(MITRE_ATTCK_API, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`MITRE API failed: ${res.status}`);
  const bundle = (await res.json()) as { objects: MitreStixObject[] };
  mitreCache = { data: bundle.objects, timestamp: Date.now() };
  return bundle.objects;
}

export async function mitreTechniqueHandler(c: Context<{ Bindings: Env }>) {
  const q = c.req.query('technique') ?? c.req.query('t') ?? c.req.query('q');
  if (!q) {
    return c.json({ error: 'missing technique param (e.g. T1566 or T1566.001)' }, 400);
  }

  const techniqueId = q.toUpperCase();
  if (!techniqueId.match(/^T\d{4}(\.\d{3})?$/)) {
    return c.json({ error: 'invalid technique ID (expected T1234 or T1234.001)' }, 400);
  }

  const objects = await fetchMitreData();

  const technique = objects.find(
    (o) =>
      o.type === 'attack-pattern' &&
      o.external_references?.some((r) => r.external_id === techniqueId || r.url?.includes(`/techniques/${techniqueId}`))
  );

  if (!technique) {
    return c.json({ error: 'technique not found' }, 404);
  }

  const tactic = technique.kill_chain_phases?.[0]?.phase_name ?? null;

  const related = objects
    .filter((o) => o.type === 'attack-pattern' && o.id !== technique.id)
    .filter((o) => o.name?.toLowerCase().includes(technique.name?.toLowerCase()?.split(' ')[0] ?? ''))
    .slice(0, 5)
    .map((o) => o.external_references?.find((r) => r.external_id?.startsWith('T'))?.external_id ?? o.id);

  const actorMap = new Map<string, MitreActor>();
  for (const obj of objects) {
    if (obj.type === 'intrusion-set') {
      const alias = obj.name ?? '';
      const techRefs = obj.external_references ?? [];
      for (const ref of techRefs) {
        if (ref.external_id === techniqueId) {
          if (!actorMap.has(obj.id)) {
            actorMap.set(obj.id, {
              id: obj.id,
              name: alias,
              aliases: [],
            });
          }
        }
      }
    }
  }

  const response: TechniqueLookupResponse = {
    technique: {
      id: techniqueId,
      name: technique.name ?? '',
      description: technique.description?.slice(0, 500) ?? '',
      tactic,
      platforms: technique.x_mitre_platforms ?? [],
      dataSources: technique.x_mitre_data_sources ?? [],
      detection: technique.x_mitre_detection ?? '',
      mitreUrl: `https://attack.mitre.org/techniques/${techniqueId}`,
    },
    actors: Array.from(actorMap.values()),
    relatedTechniques: related,
  };

  return c.json(response, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
}

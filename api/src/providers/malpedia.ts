import type { ProviderAdapter, ProviderResult } from './types';

const supports = new Set(['hash']);

export const malpedia: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'malpedia',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');

  try {
    const res = await fetch(
      `https://malpedia.caad.fkie.fraunhofer.de/api/get/malware/${indicator.value.toLowerCase()}`,
      { headers: { Accept: 'application/json' }, signal }
    );
    if (res.status === 404) return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: {} });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const data = (await res.json()) as MalpediaFamilyResponse;

    const tags: string[] = [];
    if (data.family_name) tags.push(`malpedia:${data.family_name}`);
    if (data.common_name && data.common_name !== data.family_name) tags.push(`alias:${data.common_name}`);

    const associated = Array.isArray(data.associated_actors) ? data.associated_actors.slice(0, 5) : [];
    for (const actor of associated) {
      if (typeof actor === 'string') tags.push(`actor:${actor.toLowerCase().replace(/\s+/g, '-')}`);
    }

    return base('ok', {
      score: 75,
      verdict: 'suspicious',
      tags,
      raw_summary: {
        family: data.family_name,
        common_name: data.common_name ?? data.family_name,
        description: data.description ? data.description.slice(0, 500) : '',
        associated_actors: associated,
        references: Array.isArray(data.references) ? data.references.slice(0, 5) : [],
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};

interface MalpediaFamilyResponse {
  family_name?: string;
  common_name?: string;
  description?: string;
  associated_actors?: string[];
  references?: string[];
}

import type { Context } from 'hono';
import type { Env } from '../env';
import { cvesForActor } from '../lib/cve-actor-mapping';

const MALPEDIA_BASE = 'https://malpedia.caad.fkie.fraunhofer.de';

interface MaltrailMatch {
  filename: string;
  displayName: string;
  size: number;
}

interface MalpediaMatch {
  type: 'family' | 'actor';
  name: string;
  commonName?: string;
  description?: string;
  url?: string;
}

interface OtxPulse {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  created?: string;
  author?: string;
  reference_count?: number;
  ioc_count?: number;
}

interface EnrichmentResult {
  malpedia: MalpediaMatch[];
  maltrail: MaltrailMatch[];
  otx: OtxPulse[];
  /** CVE IDs publicly attributed to this actor — curated, narrow scope. */
  linked_cves: string[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenMatch(query: string, target: string): boolean {
  const qTokens = normalize(query).split(/\s+/).filter(Boolean);
  const tNorm = normalize(target);
  const tTokens = tNorm.split(/\s+/).filter(Boolean);
  return qTokens.length > 0 && qTokens.some((qt) => tTokens.some((tt) => tt.includes(qt) || qt.includes(tt)));
}

function fuzzyMatch(terms: string[], target: string): boolean {
  return terms.some((t) => tokenMatch(t, target));
}

function parseActorFromFilename(name: string): string {
  const base = name.replace(/\.txt$/i, '');
  const parts = base.split(/[_\s]+/);
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

export async function actorEnrichHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const name = c.req.query('name');
  if (!name || !name.trim()) {
    return c.json({ error: 'missing query param name' }, 400, { 'cache-control': 'no-store' });
  }

  const aliasesRaw = c.req.query('aliases') ?? '';
  const softwareRaw = c.req.query('software') ?? '';

  const queryTerms = [
    name.trim(),
    ...aliasesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ...softwareRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ];

  // Linked CVEs from curated actor→CVE mapping. Try the bare name first
  // (e.g. "Lazarus Group" → "lazarus-group" slug), then each alias. Union
  // the result so an actor with multiple alias spellings still finds hits.
  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const slugCandidates = new Set<string>();
  for (const t of queryTerms) {
    if (!t) continue;
    slugCandidates.add(slugify(t));
    // Hokage uses bare-token slugs too (e.g. "apt28" rather than "apt-28").
    slugCandidates.add(t.trim().toLowerCase().replace(/\s+/g, ''));
  }
  const cveSet = new Set<string>();
  for (const slug of slugCandidates) {
    for (const cve of cvesForActor(slug)) cveSet.add(cve);
  }
  const result: EnrichmentResult = {
    malpedia: [],
    maltrail: [],
    otx: [],
    linked_cves: [...cveSet].sort((a, b) => b.localeCompare(a)),
  };

  try {
    // --- Malpedia: search families + actors ---
    // Each branch fault-isolated so one slow/dead upstream doesn't poison
    // the other. AbortSignal.timeout (15s) caps tail latency.
    const safeJson = async (url: string): Promise<unknown> => {
      try {
        const r = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
        });
        return r.ok ? await r.json() : [];
      } catch {
        return [];
      }
    };
    const [families, actors] = await Promise.all([
      safeJson(`${MALPEDIA_BASE}/api/get/families`) as Promise<unknown[]>,
      safeJson(`${MALPEDIA_BASE}/api/get/actors`) as Promise<unknown[]>,
    ]);

    if (Array.isArray(families)) {
      for (const f of families) {
        if (typeof f !== 'object' || f === null) continue;
        const rec = f as Record<string, unknown>;
        const familyName = String(rec.family_name ?? rec.common_name ?? '');
        if (fuzzyMatch(queryTerms, familyName)) {
          result.malpedia.push({
            type: 'family',
            name: familyName,
            commonName: String(rec.common_name ?? ''),
            description: String(rec.description ?? ''),
          });
        }
      }
    }

    if (Array.isArray(actors)) {
      for (const a of actors) {
        if (typeof a !== 'object' || a === null) continue;
        const rec = a as Record<string, unknown>;
        const actorName = String(rec.actor_name ?? '');
        if (fuzzyMatch(queryTerms, actorName)) {
          result.malpedia.push({
            type: 'actor',
            name: actorName,
            description: String(rec.description ?? ''),
          });
        }
      }
    }

    // --- Maltrail: match trail files against query terms ---
    const maltrailListRes = await fetch(
      `https://api.github.com/repos/stamparm/maltrail/contents/trails/static/malware`,
      {
        headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'pranithjain.qzz.io' },
        signal: AbortSignal.timeout(15_000),
      }
    ).catch(() => null);

    if (maltrailListRes?.ok) {
      const files = (await maltrailListRes.json()) as Array<{ name: string; path: string; size: number; type: string }>;
      const trailFiles = (Array.isArray(files) ? files : []).filter(
        (f) => f.type === 'file' && f.name.endsWith('.txt')
      );

      for (const f of trailFiles) {
        const displayName = parseActorFromFilename(f.name);
        if (fuzzyMatch(queryTerms, displayName) || fuzzyMatch(queryTerms, f.name)) {
          result.maltrail.push({
            filename: f.name,
            displayName,
            size: f.size,
          });
        }
      }
    }

    // --- OTX: search pulses ---
    const otxKey = c.env.OTX_API_KEY;
    if (otxKey) {
      const otxRes = await fetch(
        `https://otx.alienvault.com/api/v1/search/pulses?q=${encodeURIComponent(name.trim())}`,
        {
          headers: { 'X-OTX-API-KEY': otxKey },
          signal: AbortSignal.timeout(25_000),
        }
      ).catch(() => null);

      if (otxRes?.ok) {
        const otxJson = (await otxRes.json()) as {
          results?: Array<{
            id?: string;
            name?: string;
            description?: string;
            tags?: string[];
            created?: string;
            author?: string;
            reference_count?: number;
            ioc_count?: number;
          }>;
          count?: number;
        };

        if (Array.isArray(otxJson.results)) {
          result.otx = otxJson.results.slice(0, 10).map((p) => ({
            id: p.id ?? '',
            name: p.name ?? '',
            description: p.description ?? '',
            tags: p.tags ?? [],
            created: p.created ?? '',
            author: p.author ?? '',
          }));
        }
      }
    }
  } catch (err) {
    console.error('actor-enrich error:', err);
  }

  return c.json({ ok: true, ...result }, 200, {
    'cache-control': 'public, max-age=3600',
  });
}

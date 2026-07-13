import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Reverse lookup: actor → CVEs they are known to exploit.
 *
 * Derives CVE→actor links from upstream sources (Malpedia, OTX, heuristic
 * NVD/KEV scanning) via the enrich_actor endpoint.
 */
const MAX_ALIASES = 12;

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function actorCvesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const name = (c.req.query('name') ?? c.req.query('slug') ?? '').trim();
  if (!name) {
    return c.json({ error: 'missing query param name or slug' }, 400);
  }
  const aliasesRaw = c.req.query('aliases') ?? '';
  const aliases = aliasesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ALIASES);

  const candidates = new Set<string>([slugify(name)]);
  candidates.add(name.toLowerCase().replace(/\s+/g, ''));
  for (const a of aliases) {
    candidates.add(slugify(a));
    candidates.add(a.toLowerCase().replace(/\s+/g, ''));
  }

  // Derive linked CVEs from the enrich_actor endpoint which extracts them
  // from OTX pulse tags/descriptions and Malpedia descriptions.
  const SELF = (c.env as unknown as { SELF?: { fetch: typeof fetch } }).SELF;
  let cves: string[] = [];

  if (SELF) {
    try {
      const enc = encodeURIComponent(name);
      const res = await SELF.fetch(`https://api/v1/actor-enrich?name=${enc}`);
      if (res.ok) {
        const data = (await res.json()) as { linked_cves?: string[] };
        cves = data.linked_cves ?? [];
      }
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      // Non-fatal — return empty list
    }
  }

  return c.json(
    {
      slug: slugify(name),
      aliases_searched: aliases,
      slugs_resolved: [...candidates],
      cves,
      count: cves.length,
      generated_at: new Date().toISOString(),
    },
    200,
    { 'Cache-Control': 'public, max-age=3600' }
  );
}

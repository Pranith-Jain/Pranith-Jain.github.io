import type { Context } from 'hono';
import type { Env } from '../env';
import { cvesForActor } from '../lib/cve-actor-mapping';

/**
 * Reverse lookup: actor → CVEs they are known to exploit.
 *
 * Backed by the curated `cve-actor-mapping.ts` table (public-attribution
 * only; narrow scope). Accepts a primary slug plus comma-separated
 * aliases, unions the result so an actor with multiple spellings still
 * resolves. Edge-cached for 6h — the underlying table is curated, so it
 * rarely changes inside a deploy.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_ALIASES = 12;

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function actorCvesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const slug = (c.req.query('slug') ?? '').trim().toLowerCase();
  if (!slug || !SLUG_RE.test(slug)) {
    return c.json({ error: 'missing or invalid slug (a-z, 0-9, _, -)' }, 400);
  }
  const aliasesRaw = c.req.query('aliases') ?? '';
  const aliases = aliasesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ALIASES);

  const candidates = new Set<string>([slug]);
  // Hokage uses both "apt28" and "apt-28" style slugs; accept either.
  candidates.add(slug.replace(/-/g, ''));
  for (const a of aliases) {
    candidates.add(slugify(a));
    candidates.add(a.toLowerCase().replace(/\s+/g, ''));
  }

  const cveSet = new Set<string>();
  for (const c of candidates) {
    for (const cve of cvesForActor(c)) cveSet.add(cve);
  }

  const cves = [...cveSet].sort((a, b) => b.localeCompare(a));
  return c.json(
    {
      slug,
      aliases_searched: aliases,
      slugs_resolved: [...candidates],
      cves,
      count: cves.length,
      generated_at: new Date().toISOString(),
    },
    200,
    { 'Cache-Control': 'public, max-age=21600' }
  );
}

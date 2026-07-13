/**
 * Threat-actor profile — single-call aggregator that fans out to every
 * relevant actor data source and returns a unified profile object.
 *
 *   GET /api/v1/actor-profile?name=...&aliases=...
 *
 * Aggregates:
 *   /actor-enrich         — Malpedia + Maltrail + OTX pulses + linked CVEs
 *   /actor-cves           — CVEs attributed to the actor (curated map)
 *   /actor-timeline       — recent activity timeline
 *   /actor-dna            — TTP fingerprint (top techniques, software, sectors)
 *   /skeleton-actors/:slug — Maltrail skeleton profile (if cached)
 *   /malpedia/actor       — Malpedia actor page (if available)
 *   /briefings/for-actor/:slug — recent intel briefings about this actor
 *
 * The handler runs as much as possible in parallel and degrades gracefully
 * when individual sub-sources error.
 */
import type { Context } from 'hono';
import type { Env } from '../env';

const INTERNAL = 'https://self.internal';

interface SourceHit {
  source: string;
  ok: boolean;
  error?: string;
  data: unknown;
  ms: number;
}

async function timeIt<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ source: string; ok: boolean; error?: string; data: T | null; ms: number }> {
  const t0 = Date.now();
  try {
    const data = await fn();
    return { source: label, ok: true, data, ms: Date.now() - t0 };
  } catch (err) {
    console.error('timeIt failed:', err instanceof Error ? err.message : String(err));
    return {
      source: label,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      data: null,
      ms: Date.now() - t0,
    };
  }
}

async function selfFetch(self: Fetcher | undefined, path: string): Promise<Response | null> {
  try {
    if (self) return await self.fetch(`${INTERNAL}${path}`);
    return await fetch(`${INTERNAL}${path}`);
  } catch (_catchErr) {
    console.error('selfFetch failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function actorProfileHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const name = (c.req.query('name') ?? '').trim();
  if (!name) return c.json({ error: 'missing query param name' }, 400);

  const aliasesRaw = c.req.query('aliases') ?? '';
  const softwareRaw = c.req.query('software') ?? '';
  const aliases = aliasesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const software = softwareRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const self = (c.env as unknown as { SELF?: Fetcher }).SELF;
  const enc = encodeURIComponent(name);
  const aliasesParam = aliases.length > 0 ? `&aliases=${encodeURIComponent(aliases.join(','))}` : '';
  const softwareParam = software.length > 0 ? `&software=${encodeURIComponent(software.join(','))}` : '';

  // Slug candidates for skeleton-actor lookup.
  const slugCandidates = new Set<string>();
  slugCandidates.add(slugify(name));
  for (const a of aliases) slugCandidates.add(slugify(a));
  // Drop invalid slugs.
  for (const s of slugCandidates) if (!SLUG_RE.test(s)) slugCandidates.delete(s);

  const hits: Array<Promise<SourceHit>> = [
    timeIt('enrich', () =>
      selfFetch(self, `/api/v1/actor-enrich?name=${enc}${aliasesParam}${softwareParam}`).then((r) =>
        r ? r.json() : { error: 'no-response' }
      )
    ),
    timeIt('cves', () =>
      selfFetch(self, `/api/v1/actor-cves?name=${enc}`).then((r) => (r ? r.json() : { error: 'no-response' }))
    ),
    timeIt('timeline', () =>
      selfFetch(self, `/api/v1/actor-timeline?name=${enc}`).then((r) => (r ? r.json() : { error: 'no-response' }))
    ),
    timeIt('dna', () =>
      selfFetch(self, `/api/v1/actor-dna?name=${enc}`).then((r) => (r ? r.json() : { error: 'no-response' }))
    ),
    timeIt('malpedia', () =>
      selfFetch(self, `/api/v1/malpedia/actor?name=${enc}`).then((r) => (r ? r.json() : { error: 'no-response' }))
    ),
  ];

  // Skeleton-actor lookup: try each slug candidate, take the first hit.
  if (slugCandidates.size > 0) {
    hits.push(
      timeIt('skeleton', async () => {
        for (const slug of slugCandidates) {
          try {
            const r = await selfFetch(self, `/api/v1/skeleton-actors/${encodeURIComponent(slug)}`);
            if (r && r.ok) {
              const data = (await r.json()) as { error?: string };
              if (!data.error) return { slug, data };
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* try next slug */
          }
        }
        return { skipped: 'no-skeleton-match' };
      })
    );
  }

  // Briefings lookup.
  const primarySlug = [...slugCandidates][0] ?? slugify(name);
  if (SLUG_RE.test(primarySlug)) {
    hits.push(
      timeIt('briefings', () =>
        selfFetch(self, `/api/v1/briefings/for-actor/${encodeURIComponent(primarySlug)}`).then((r) =>
          r ? r.json() : { error: 'no-response' }
        )
      )
    );
  }

  const results = await Promise.allSettled(hits);
  const sources: SourceHit[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') sources.push(r.value);
  }

  // Build the unified profile.
  const enrich = sources.find((s) => s.source === 'enrich')?.data as
    | { malpedia?: unknown[]; maltrail?: unknown[]; otx?: unknown[]; linked_cves?: string[] }
    | undefined;
  const cves = sources.find((s) => s.source === 'cves')?.data as { cves?: string[] } | undefined;
  const dna = sources.find((s) => s.source === 'dna')?.data as
    | { techniques?: unknown[]; software?: unknown[]; sectors?: unknown[] }
    | undefined;
  const timeline = sources.find((s) => s.source === 'timeline')?.data;
  const malpedia = sources.find((s) => s.source === 'malpedia')?.data;
  const skeleton = sources.find((s) => s.source === 'skeleton')?.data;
  const briefings = sources.find((s) => s.source === 'briefings')?.data;

  // Union of linked CVEs from all sources.
  const cveSet = new Set<string>();
  for (const c of enrich?.linked_cves ?? []) cveSet.add(c);
  for (const c of cves?.cves ?? []) cveSet.add(c);
  const allCves = [...cveSet].sort((a, b) => b.localeCompare(a));

  return c.json(
    {
      name,
      aliases,
      software,
      slug: primarySlug,
      profile: {
        malpedia,
        maltrail: enrich?.maltrail ?? [],
        otx_pulses: enrich?.otx ?? [],
        timeline,
        dna,
        skeleton,
        briefings,
      },
      linked_cves: allCves,
      sources: sources.map((s) => ({ source: s.source, ok: s.ok, error: s.error, ms: s.ms })),
    },
    200,
    { 'cache-control': 'public, max-age=60, s-maxage=60', 'x-robots-tag': 'noindex' }
  );
}

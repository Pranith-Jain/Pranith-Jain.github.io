import type { Context } from 'hono';
import type { Env } from '../env';
import { sseStream } from '../lib/sse';
import { claimSseSlot } from '../lib/sse-concurrency';
import { safeJsonBody } from '../lib/safe-body';

/**
 * Bulk OTX enrichment with fair-queue rotation, streamed over SSE.
 *
 *   POST /api/v1/actor-enrich/otx-stream
 *   Body: { actors: Array<{ slug: string; name: string; aliases?: string[] }>,
 *           limit?: number }
 *
 * Picks actors in priority order — never-attempted first, then fewest
 * IOCs, then oldest attempt — and streams one `actor` event per actor
 * processed. Rotation state is stored in caches.default (no KV quota),
 * keyed by a single JSON blob to keep reads/writes to one each per
 * batch regardless of input size.
 *
 * Events emitted:
 *   - `started` { total: number, queued: string[] }
 *   - `actor`   { slug, name, pulses, ioc_count, attempted_at }
 *   - `error`   { slug, message }
 *   - `done`    { processed, skipped }
 */

interface RotationEntry {
  lastAttempt: number; // epoch ms
  iocCount: number;
}

type RotationState = Record<string, RotationEntry>;

interface ActorInput {
  slug: string;
  name: string;
  aliases?: string[];
}

interface OtxPulse {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  created?: string;
  author?: string;
  ioc_count?: number;
}

const ROTATION_CACHE_KEY = new Request('https://actor-otx-rotation.internal/v1');
const ROTATION_TTL = 90 * 24 * 3600; // 90 days
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
// OTX `/search/pulses` is slow from CF egress (commonly 15–20s).
// 25s leaves headroom under the 30s Workers wall-clock per subrequest.
const PER_ACTOR_TIMEOUT_MS = 25_000;
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

async function readRotationState(): Promise<RotationState> {
  const cache = (caches as unknown as { default: Cache }).default;
  try {
    const hit = await cache.match(ROTATION_CACHE_KEY);
    if (hit) {
      const json = (await hit.json()) as RotationState;
      if (json && typeof json === 'object') return json;
    }
  } catch {
    /* fall through */
  }
  return {};
}

async function writeRotationState(state: RotationState): Promise<void> {
  const cache = (caches as unknown as { default: Cache }).default;
  try {
    await cache.put(
      ROTATION_CACHE_KEY,
      new Response(JSON.stringify(state), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${ROTATION_TTL}, s-maxage=${ROTATION_TTL}`,
        },
      })
    );
  } catch {
    /* swallow */
  }
}

/**
 * Sort actors by fair-queue priority:
 *   1. never-attempted (no rotation entry) first
 *   2. then by ascending iocCount  (fewest IOCs next)
 *   3. then by oldest lastAttempt
 *
 * Stable enough to give predictable test output without crypto-grade
 * tiebreaking — slug ordering as the final tiebreaker.
 */
function prioritise(actors: ActorInput[], state: RotationState): ActorInput[] {
  return [...actors].sort((a, b) => {
    const ea = state[a.slug];
    const eb = state[b.slug];
    if (!ea && eb) return -1;
    if (ea && !eb) return 1;
    if (ea && eb) {
      if (ea.iocCount !== eb.iocCount) return ea.iocCount - eb.iocCount;
      if (ea.lastAttempt !== eb.lastAttempt) return ea.lastAttempt - eb.lastAttempt;
    }
    return a.slug.localeCompare(b.slug);
  });
}

async function fetchOtxPulses(apiKey: string, query: string): Promise<{ pulses: OtxPulse[]; iocCount: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_ACTOR_TIMEOUT_MS);
  try {
    const res = await fetch(`https://otx.alienvault.com/api/v1/search/pulses?q=${encodeURIComponent(query)}`, {
      headers: { 'X-OTX-API-KEY': apiKey },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`otx HTTP ${res.status}`);
    const json = (await res.json()) as {
      results?: Array<{
        id?: string;
        name?: string;
        description?: string;
        tags?: string[];
        created?: string;
        author?: string;
        ioc_count?: number;
      }>;
    };
    const results = Array.isArray(json.results) ? json.results.slice(0, 10) : [];
    const pulses: OtxPulse[] = results.map((p) => ({
      id: p.id ?? '',
      name: p.name ?? '',
      description: p.description ?? '',
      tags: p.tags ?? [],
      created: p.created ?? '',
      author: p.author ?? '',
      ioc_count: p.ioc_count ?? 0,
    }));
    const iocCount = pulses.reduce((acc, p) => acc + (p.ioc_count ?? 0), 0);
    return { pulses, iocCount };
  } finally {
    clearTimeout(timer);
  }
}

interface StreamEvent {
  type: 'started' | 'actor' | 'error' | 'done';
  total?: number;
  queued?: string[];
  slug?: string;
  name?: string;
  pulses?: OtxPulse[];
  ioc_count?: number;
  attempted_at?: number;
  message?: string;
  processed?: number;
  skipped?: number;
}

export async function actorEnrichOtxStreamHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const otxKey = c.env.OTX_API_KEY;
  if (!otxKey) {
    return c.json({ error: 'OTX not configured' }, 503, { 'cache-control': 'no-store' });
  }

  // Cap concurrent streams per IP (defensive — SSE producers do upstream burn).
  const ip = c.req.header('cf-connecting-ip') ?? 'anon';
  const slot = await claimSseSlot(c, ip);
  if (!slot) {
    return c.json({ error: 'too many concurrent streams' }, 429, { 'cache-control': 'no-store' });
  }

  const parsed = await safeJsonBody<{ actors?: unknown; limit?: unknown }>(c, { maxBytes: 32 * 1024, maxDepth: 6 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  const rawActors = Array.isArray(body.actors) ? body.actors : [];
  const actors: ActorInput[] = [];
  const seen = new Set<string>();
  for (const a of rawActors) {
    if (typeof a !== 'object' || a === null) continue;
    const rec = a as Record<string, unknown>;
    const slug = typeof rec.slug === 'string' ? rec.slug.trim().toLowerCase() : '';
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!slug || !name) continue;
    if (!SLUG_RE.test(slug)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const aliases = Array.isArray(rec.aliases)
      ? rec.aliases.filter((x) => typeof x === 'string' && x.trim()).slice(0, 5)
      : undefined;
    actors.push({ slug, name, aliases: aliases as string[] | undefined });
  }
  if (actors.length === 0) {
    return c.json({ error: 'no valid actors in body' }, 400, { 'cache-control': 'no-store' });
  }

  const limitRaw = typeof body.limit === 'number' ? body.limit : DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)));

  return sseStream<StreamEvent>(async (write) => {
    try {
      const state = await readRotationState();
      const queue = prioritise(actors, state).slice(0, limit);
      write('started', {
        type: 'started',
        total: queue.length,
        queued: queue.map((a) => a.slug),
      });

      let processed = 0;
      let skipped = 0;
      const now = Date.now();
      for (const actor of queue) {
        // Build the query: name + first alias. OTX search treats commas
        // as logical OR — but we use the name only to keep the result
        // tight and the aliases are surfaced in the response if they
        // appear in pulse names.
        const query = actor.name;
        try {
          const { pulses, iocCount } = await fetchOtxPulses(otxKey, query);
          state[actor.slug] = { lastAttempt: now, iocCount };
          processed += 1;
          write('actor', {
            type: 'actor',
            slug: actor.slug,
            name: actor.name,
            pulses,
            ioc_count: iocCount,
            attempted_at: now,
          });
        } catch (err) {
          skipped += 1;
          write('error', {
            type: 'error',
            slug: actor.slug,
            message: err instanceof Error ? err.message : 'fetch failed',
          });
        }
      }

      // Persist rotation state once at the end (single Cache API write).
      await writeRotationState(state);
      write('done', { type: 'done', processed, skipped });
    } finally {
      c.executionCtx.waitUntil(slot.release());
    }
  });
}

import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';
import {
  BRIEFING_MAX_AGE_DAYS,
  buildBriefing,
  listBriefings,
  readBriefing,
  sweepOldBriefings,
  writeBriefing,
  type Briefing,
  type BriefingType,
} from '../lib/briefing-builder';
import { extractBriefingTags } from '../lib/briefing-tags';

/**
 * Walk every finding in the briefing and attach auto-extracted tags
 * (CVE IDs, known ransomware actors, heuristic sector). Lazy — applied on
 * read so existing DB-stored briefings get tags without a backfill.
 */
function enrichBriefingWithTags(b: Briefing): Briefing {
  const sections = b.sections.map((s) => ({
    ...s,
    findings: s.findings.map((f) => {
      const blob = `${f.title} ${f.description} ${f.vendor ?? ''} ${f.product ?? ''}`;
      return { ...f, tags: extractBriefingTags(blob) };
    }),
  }));
  return { ...b, sections } as Briefing;
}

function dbOrError(c: Context<{ Bindings: Env }>): D1Database | null {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return null;
  return db;
}

/**
 * Edge-cache key for briefing reads.
 *
 * `caches.default` stores the whole Response (headers included). Keying on the
 * raw request URL means a Response cached by older code sticks around for its
 * original max-age no matter what — that's why a 26-row D1 still showed 1
 * briefing for hours after the restore. Keying on a *versioned* synthetic URL
 * makes every cached entry disposable: bump BRIEFINGS_CACHE_VERSION and every
 * stale briefing entry is abandoned on the next request (cache miss -> fresh
 * D1 read). Also lets the cron bust the list after writing a briefing.
 */
const BRIEFINGS_CACHE_VERSION = 'v2';

function briefingsCacheKey(c: Context<{ Bindings: Env }>): Request {
  const u = new URL(c.req.url);
  return new Request(`https://briefings-cache.internal/${BRIEFINGS_CACHE_VERSION}${u.pathname}${u.search}`, {
    method: 'GET',
  });
}

// Short TTL: a restore or the daily cron should surface within minutes, not
// hours. SWR keeps it cheap (one revalidation per window, stale served free).
const BRIEFINGS_CC = 'public, max-age=300, s-maxage=300, stale-while-revalidate=600';

export async function listBriefingsHandler(c: Context<{ Bindings: Env }>) {
  const db = dbOrError(c);
  if (!db) return c.json({ error: 'briefings database not bound' }, 503);
  try {
    const cache = caches.default;
    const key = briefingsCacheKey(c);
    const cached = await cache.match(key);
    if (cached) return cached;

    const typeRaw = c.req.query('type');
    const type = typeRaw === 'daily' || typeRaw === 'weekly' ? (typeRaw as BriefingType) : undefined;
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 100) : 20;
    const items = await listBriefings(db, { type, limit });
    const res = c.json({ items }, 200, {
      'cache-control': BRIEFINGS_CC,
      'last-modified': new Date().toUTCString(),
    });
    c.executionCtx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (err) {
    console.error('listBriefingsHandler error:', err);
    return c.json({ error: String(err) }, 500);
  }
}

export async function getBriefingHandler(c: Context<{ Bindings: Env }>) {
  const db = dbOrError(c);
  if (!db) return c.json({ error: 'briefings database not bound' }, 503);
  const slug = c.req.param('slug');
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return c.json({ error: 'invalid slug' }, 400);
  }
  const cache = caches.default;
  const key = briefingsCacheKey(c);
  const cached = await cache.match(key);
  if (cached) return cached;
  const briefing = await readBriefing(db, slug);
  if (!briefing) return c.json({ error: 'not found' }, 404);
  const res = c.json(enrichBriefingWithTags(briefing), 200, {
    'cache-control': BRIEFINGS_CC,
    'last-modified': new Date().toUTCString(),
  });
  c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export async function todayBriefingHandler(c: Context<{ Bindings: Env }>) {
  const db = dbOrError(c);
  if (!db) return c.json({ error: 'briefings database not bound' }, 503);
  const cache = caches.default;
  const key = briefingsCacheKey(c);
  const cached = await cache.match(key);
  if (cached) return cached;
  // "today's" briefing covers the previous calendar day (latest fully-closed window)
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400_000);
  const slug = `daily-${yesterday.toISOString().slice(0, 10)}`;
  const briefing = await readBriefing(db, slug);
  if (!briefing) return c.json({ error: 'not yet generated', slug }, 404);
  const res = c.json(enrichBriefingWithTags(briefing), 200, {
    'cache-control': BRIEFINGS_CC,
    'last-modified': new Date().toUTCString(),
  });
  c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/**
 * Constant-time string compare to avoid leaking the admin token via timing
 * differences. Workers V8 strings still aren't truly constant-time but this
 * removes the obvious early-exit shortcut of `===`.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

type AdminCtx = Context<{ Bindings: Env & { BRIEFINGS_ADMIN_TOKEN?: string } }>;

function requireAdmin(c: AdminCtx): { error: Response } | { ok: true } {
  const required = c.env.BRIEFINGS_ADMIN_TOKEN;
  if (!required) {
    return { error: c.json({ error: 'admin endpoint disabled (BRIEFINGS_ADMIN_TOKEN not set)' }, 403) };
  }

  // Extract the candidate token (empty string when the prefix is missing)
  // and pass it unconditionally into safeEqual. The previous `headerToken &&
  // safeEqual(...)` short-circuit returned 401 faster for malformed prefixes
  // than for "right prefix, wrong token" — a hairline timing oracle. The
  // length-mismatch fast-path inside safeEqual is acceptable since the token
  // length isn't secret.
  const authz = c.req.header('authorization') ?? '';
  const headerToken = /^Bearer\s+(.+)$/i.exec(authz)?.[1] ?? '';
  if (safeEqual(headerToken, required)) {
    return { ok: true };
  }

  return {
    error: c.json(
      {
        error: 'unauthorized',
        hint: 'send `Authorization: Bearer <BRIEFINGS_ADMIN_TOKEN>`',
      },
      401
    ),
  };
}

/**
 * Trigger an on-demand briefing build. Authenticated via Authorization: Bearer header.
 * Set BRIEFINGS_ADMIN_TOKEN as a Worker secret. If unset, this handler is disabled.
 */
export async function buildBriefingHandler(c: AdminCtx) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'briefings database not bound' }, 503);
  const auth = requireAdmin(c);
  if ('error' in auth) return auth.error;

  const typeRaw = c.req.query('type');
  if (typeRaw !== 'daily' && typeRaw !== 'weekly') {
    return c.json({ error: 'type must be daily or weekly' }, 400);
  }

  try {
    const briefing = await buildBriefing(typeRaw as BriefingType, undefined, {
      nvdApiKey: c.env.NVD_API_KEY,
      env: c.env,
    });
    await writeBriefing(db, briefing);
    return c.json({ ok: true, slug: briefing.slug, stats: briefing.stats }, 200);
  } catch (err) {
    console.error('briefing build failed:', err);
    return c.json(
      {
        error: 'briefing build failed',
        type: typeRaw,
      },
      500
    );
  }
}

/**
 * Admin backfill — generate the past N daily briefings + last M weekly briefings.
 * Useful on first deploy to populate the list page.
 *
 * POST /api/v1/briefings/backfill?days=14&weeks=3
 *   Authorization: Bearer <BRIEFINGS_ADMIN_TOKEN>
 *
 * Per-iteration failures are tracked and reported. Status is:
 *   200 if everything wrote/skipped cleanly,
 *   207 if some iterations failed (the response lists which),
 *   500 if absolutely nothing succeeded.
 */
export async function backfillBriefingsHandler(c: AdminCtx) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'briefings database not bound' }, 503);
  const auth = requireAdmin(c);
  if ('error' in auth) return auth.error;

  const days = Math.min(Math.max(parseInt(c.req.query('days') ?? '14', 10) || 14, 0), 21);
  const weeks = Math.min(Math.max(parseInt(c.req.query('weeks') ?? '3', 10) || 3, 0), 4);
  // Default: skip if a briefing already exists (preserve fresh cron-generated
  // ones). Pass ?force=1 to overwrite — useful after a builder change.
  const force = c.req.query('force') === '1';

  const writtenDaily: string[] = [];
  const skippedDaily: string[] = [];
  const writtenWeekly: string[] = [];
  const skippedWeekly: string[] = [];
  const failures: Array<{ kind: 'daily' | 'weekly'; offset: number; error: string }> = [];

  for (let i = 0; i < days; i += 1) {
    const anchor = new Date(Date.now() - i * 86400_000);
    try {
      const briefing = await buildBriefing('daily', anchor, { nvdApiKey: c.env.NVD_API_KEY, env: c.env });
      const result = await writeBriefing(db, briefing, { skipIfExists: !force });
      (result.written ? writtenDaily : skippedDaily).push(briefing.slug);
    } catch (err) {
      console.error('backfill daily failed:', err);
      failures.push({ kind: 'daily', offset: i, error: 'build failed' });
    }
  }

  for (let i = 0; i < weeks; i += 1) {
    const anchor = new Date(Date.now() - i * 7 * 86400_000);
    try {
      const briefing = await buildBriefing('weekly', anchor, { nvdApiKey: c.env.NVD_API_KEY, env: c.env });
      const result = await writeBriefing(db, briefing, { skipIfExists: !force });
      (result.written ? writtenWeekly : skippedWeekly).push(briefing.slug);
    } catch (err) {
      console.error('backfill weekly failed:', err);
      failures.push({ kind: 'weekly', offset: i, error: 'build failed' });
    }
  }

  const totalAttempted = days + weeks;
  const totalSucceeded = writtenDaily.length + skippedDaily.length + writtenWeekly.length + skippedWeekly.length;
  const status: 200 | 207 | 500 = totalSucceeded === 0 && totalAttempted > 0 ? 500 : failures.length > 0 ? 207 : 200;

  return c.json(
    {
      ok: failures.length === 0,
      force,
      daily: writtenDaily,
      daily_skipped: skippedDaily,
      weekly: writtenWeekly,
      weekly_skipped: skippedWeekly,
      failures,
    },
    status
  );
}

/**
 * Admin sweep — delete briefings older than maxAgeDays (default matches the
 * BRIEFING_MAX_AGE_DAYS retention ceiling). Operators can pass a smaller
 * value to force-prune (e.g. `?max_age_days=7`); larger values are clamped
 * to the ceiling so the sweep can never extend retention beyond policy.
 */
export async function sweepBriefingsHandler(c: AdminCtx) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'briefings database not bound' }, 503);
  const auth = requireAdmin(c);
  if ('error' in auth) return auth.error;

  const maxAgeRaw = c.req.query('max_age_days');
  const requested = maxAgeRaw ? Math.max(parseInt(maxAgeRaw, 10) || BRIEFING_MAX_AGE_DAYS, 1) : BRIEFING_MAX_AGE_DAYS;
  const maxAge = Math.min(requested, BRIEFING_MAX_AGE_DAYS);

  try {
    const result = await sweepOldBriefings(db, maxAge);
    return c.json({ ok: true, max_age_days: maxAge, ...result }, 200);
  } catch (err) {
    console.error('sweep failed:', err);
    return c.json(
      {
        error: 'sweep failed',
        max_age_days: maxAge,
      },
      500
    );
  }
}

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
  // Only include known-safe query parameters in cache key to prevent
  // poisoning via arbitrary query strings.
  const safeParams = new URLSearchParams();
  const type = u.searchParams.get('type');
  if (type === 'daily' || type === 'weekly') safeParams.set('type', type);
  const limit = u.searchParams.get('limit');
  if (limit) safeParams.set('limit', limit);
  const sq = safeParams.toString();
  return new Request(`https://briefings-cache.internal/${BRIEFINGS_CACHE_VERSION}${u.pathname}${sq ? '?' + sq : ''}`, {
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
    if (cached) return new Response(cached.body, cached);

    const typeRaw = c.req.query('type');
    const type = typeRaw === 'daily' || typeRaw === 'weekly' ? (typeRaw as BriefingType) : undefined;
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 100) : 20;
    const offsetRaw = c.req.query('offset');
    const offset = offsetRaw ? Math.max(parseInt(offsetRaw, 10) || 0, 0) : 0;
    const { items, total } = await listBriefings(db, { type, limit, offset });
    const res = c.json({ items, total }, 200, {
      'cache-control': BRIEFINGS_CC,
      'last-modified': new Date().toUTCString(),
    });
    c.executionCtx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (err) {
    console.error('listBriefingsHandler error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'briefings list failed' }, 500);
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
  if (cached) return new Response(cached.body, cached);
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
  if (cached) return new Response(cached.body, cached);
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

type AdminCtx = Context<{ Bindings: Env }>;

function extractAdminToken(c: AdminCtx): string {
  const authz = c.req.header('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(authz)?.[1];
  if (bearer) return bearer;
  return c.req.header('x-admin-token') ?? '';
}

function requireAdmin(c: AdminCtx): { error: Response } | { ok: true } {
  const required = c.env.BRIEFINGS_ADMIN_TOKEN;
  if (!required) {
    return { error: c.json({ error: 'admin endpoint disabled' }, 403) };
  }

  const token = extractAdminToken(c);
  if (!token || !safeEqual(token, required)) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  return { ok: true };
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
/**
 * GET /api/v1/briefings/for-actor/:slug — returns findings tagged with the given
 * actor across recent briefings. Useful for generating actor-specific intelligence
 * summaries without rebuilding the entire briefing pipeline.
 */
/**
 * GET /api/v1/briefings/:slug/print — returns a printable HTML version of the
 * briefing. Designed for "Print to PDF" from the browser or curl-to-file usage.
 */
export async function briefingPrintHandler(c: Context<{ Bindings: Env }>) {
  const db = dbOrError(c);
  if (!db) return c.json({ error: 'briefings database not bound' }, 503);

  const slug = c.req.param('slug');
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return c.json({ error: 'invalid slug' }, 400);
  }

  const briefing = await readBriefing(db, slug);
  if (!briefing) return c.json({ error: 'not found' }, 404);

  const b = briefing as Record<string, unknown>;
  const sections = (b.sections as Array<Record<string, unknown>>) ?? [];
  const stats = (b.stats as Record<string, unknown>) ?? {};

  // Build findings per severity for HTML table
  const severityOrder = ['critical', 'high', 'medium', 'low', 'none'];
  const severityLabels: Record<string, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    none: 'Info',
  };

  let sectionsHtml = '';
  for (const section of sections) {
    const findings = (section.findings as Array<Record<string, unknown>>) ?? [];
    if (findings.length === 0) continue;

    const rows = findings
      .map((f: Record<string, unknown>) => {
        const sev = (f.severity as string) ?? 'none';
        const label = severityLabels[sev] ?? 'Info';
        return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${f.title ?? ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${f.description ?? ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb"><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;background:${sev === 'critical' ? '#fef2f2' : '#fffbeb'}">${label}</span></td>
      </tr>`;
      })
      .join('');

    sectionsHtml += `<h2 style="font-size:16px;margin:16px 0 8px;border-bottom:2px solid #111827;padding-bottom:4px">${section.title ?? ''}</h2>
    <table style="width:100%;border-collapse:collapse">${rows}</table>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${b.title ?? slug}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;color:#111;padding:40px;max-width:900px;margin:0 auto;line-height:1.5}
  h1{font-size:24px;margin-bottom:4px}
  .meta{color:#6b7280;font-size:14px;margin-bottom:24px}
  .stats{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
  .stat{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;text-align:center}
  .stat-num{font-size:20px;font-weight:700}
  .stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:2px solid #e5e7eb}
  @media print{body{padding:20px} .no-print{display:none}}
</style></head><body>
  <h1>${b.title ?? ''}</h1>
  <div class="meta">${b.date_range ?? ''} &middot; ${b.type ?? ''} briefing</div>
  <div class="stats">
    <div class="stat"><div class="stat-num">${(stats.findings as number) ?? 0}</div><div class="stat-label">Findings</div></div>
    <div class="stat"><div class="stat-num">${(stats.cves as number) ?? 0}</div><div class="stat-label">CVEs</div></div>
    <div class="stat"><div class="stat-num">${(stats.iocs as number) ?? 0}</div><div class="stat-label">IOCs</div></div>
    <div class="stat"><div class="stat-num">${(stats.kevs as number) ?? 0}</div><div class="stat-label">KEVs</div></div>
  </div>
  ${sectionsHtml}
  <p style="margin-top:32px;font-size:11px;color:#9ca3af;text-align:center">Generated by DFIR Threat Intel Platform</p>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

export async function briefingsForActorHandler(c: Context<{ Bindings: Env }>) {
  const db = dbOrError(c);
  if (!db) return c.json({ error: 'briefings database not bound' }, 503);

  const actorSlug = c.req.param('slug')?.toLowerCase();
  if (!actorSlug || !/^[a-z0-9-]+$/.test(actorSlug)) {
    return c.json({ error: 'invalid actor slug' }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://briefings-cache.internal/for-actor/${actorSlug}`);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const { items } = await listBriefings(db, { limit: 14 });
  const results: Array<{
    slug: string;
    title: string;
    date_range: string;
    findings: Array<{ section: string; finding: Record<string, unknown> }>;
  }> = [];

  for (const b of items) {
    try {
      const full = await readBriefing(db, b.slug);
      if (!full) continue;
      const enriched = enrichBriefingWithTags(full);
      const matched: Array<{ section: string; finding: Record<string, unknown> }> = [];
      for (const section of enriched.sections) {
        for (const finding of section.findings) {
          const f = finding as Record<string, unknown>;
          const tags = f.tags as { actors?: Array<{ slug: string }> } | undefined;
          if (tags?.actors?.some((a) => a.slug === actorSlug)) {
            matched.push({ section: section.title, finding: f });
          }
        }
      }
      if (matched.length > 0) {
        results.push({
          slug: b.slug,
          title: ((full as Record<string, unknown>).title as string) ?? '',
          date_range: ((full as Record<string, unknown>).date_range as string) ?? '',
          findings: matched,
        });
      }
    } catch {
      /* skip failed briefings */
    }
  }

  const total_findings = results.reduce((s, r) => s + r.findings.length, 0);
  const res = c.json({ actor: actorSlug, briefings: results, total_findings }, 200, {
    'cache-control': 'public, max-age=3600',
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

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

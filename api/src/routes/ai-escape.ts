/**
 * AI Escape Watch — REST surface for the agent-containment-failure registry.
 *
 * All read-only, served from the static ASSETS manifest (no per-request
 * upstream, no secrets):
 *   GET  /ai-escape/              — registry meta + stats + guardrail counts
 *   GET  /ai-escape/incidents     — registry rows (klass, sev, tier, guardrail,
 *                                    autonomous, q, limit)
 *   GET  /ai-escape/incidents/:id — full docket (chain, sources, disputed)
 *   GET  /ai-escape/guardrails    — 10 control definitions
 *   GET  /ai-escape/trackers      — provenance table
 *   GET  /ai-escape/timeline      — month buckets for the chronology strip
 *   POST /ai-escape/reports       — public incident submission (pending review)
 *   GET  /ai-escape/reports       — public review queue (?status=pending|approved|rejected)
 *   POST /ai-escape/reports/:id/review — admin approve/reject (ADMIN_TOKEN)
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound, badRequest, serviceUnavailable } from '../lib/api-error';
import { safeJsonBody } from '../lib/safe-body';
import { requireAdmin } from '../lib/admin-auth';

async function loadMod() {
  return await import('../lib/ai-escape-manifest');
}

export const aiEscapeRouter = new Hono<{ Bindings: Env }>();

aiEscapeRouter.get('/ai-escape/', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadEscapeIndex(c.env.ASSETS);
    return c.json({
      registry: idx.registry,
      version: idx.version,
      compiled: idx.compiled,
      builtAt: idx.builtAt,
      cbsScale: idx.cbsScale,
      stats: idx.stats,
      guardrailCounts: idx.guardrailCounts,
    });
  } catch (e) {
    logError('ai-escape index failed', e);
    return internalError(c, `ai_escape_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/incidents', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadEscapeIndex(c.env.ASSETS);
    const klass = c.req.query('klass');
    const sev = c.req.query('sev');
    const tier = c.req.query('tier');
    const auto = c.req.query('autonomous');
    const entries = mod.filterEscapes(idx, {
      klass:
        klass === 'containment-breach' ||
        klass === 'agent-hijack' ||
        klass === 'supply-chain' ||
        klass === 'tool-misuse' ||
        klass === 'injection'
          ? klass
          : undefined,
      sev: sev === 'critical' || sev === 'severe' || sev === 'notable' || sev === 'contained' ? sev : undefined,
      tier: tier === 'A' || tier === 'B' || tier === 'C' || tier === 'D' || tier === 'X' ? tier : undefined,
      guardrail: c.req.query('guardrail') || undefined,
      autonomous: auto === 'true' ? true : auto === 'false' ? false : undefined,
      q: c.req.query('q') || undefined,
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : 100,
    });
    return c.json({ total: idx.stats.entries, returned: entries.length, incidents: entries });
  } catch (e) {
    logError('ai-escape list failed', e);
    return internalError(c, `ai_escape_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/incidents/:id', async (c) => {
  const id = c.req.param('id').toUpperCase();
  try {
    const mod = await loadMod();
    const body = await mod.getEscapeIncident(c.env.ASSETS, id);
    if (!body) return notFound(c, `ai_escape_not_found: ${id}`);
    return c.json(body);
  } catch (e) {
    logError('ai-escape docket failed', e);
    return internalError(c, `ai_escape_docket_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/guardrails', async (c) => {
  try {
    const mod = await loadMod();
    const assets = c.env.ASSETS;
    const [guardrails, idx] = await Promise.all([mod.loadEscapeGuardrails(assets), mod.loadEscapeIndex(assets)]);
    return c.json({ guardrails, counts: idx.guardrailCounts, total: idx.stats.entries });
  } catch (e) {
    logError('ai-escape guardrails failed', e);
    return internalError(c, `ai_escape_guardrails_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/trackers', async (c) => {
  try {
    const mod = await loadMod();
    const trackers = await mod.loadEscapeTrackers(c.env.ASSETS);
    return c.json({ total: trackers.length, trackers });
  } catch (e) {
    logError('ai-escape trackers failed', e);
    return internalError(c, `ai_escape_trackers_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/timeline', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadEscapeIndex(c.env.ASSETS);
    return c.json({ buckets: mod.escapeTimelineBuckets(idx) });
  } catch (e) {
    logError('ai-escape timeline failed', e);
    return internalError(c, `ai_escape_timeline_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Community report queue (D1) ────────────────────────────────────────────
// Submissions land as status='pending' and only reach the registry after
// manual review. The queue itself is public so review is auditable.

const REPORT_KLASS = ['containment-breach', 'agent-hijack', 'supply-chain', 'tool-misuse', 'injection'] as const;
const REPORT_STATUS = ['pending', 'approved', 'rejected'] as const;
const REPORTS_PER_IP_PER_DAY = 5;

export interface EscapeReportInput {
  title?: unknown;
  klass?: unknown;
  occurred?: unknown;
  purpose?: unknown;
  systems?: unknown;
  summary?: unknown;
  sources?: unknown;
  handle?: unknown;
  /** Honeypot — legit clients never send it; bots do. Silently accepted. */
  website?: unknown;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Best-effort per-colo throttle via Cache API (no KV quota burn, no D1). */
async function reportThrottleOver(ip: string): Promise<boolean> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = new Request(`https://escape-report-rl.internal/v1?ip=${encodeURIComponent(ip)}&d=${day}`);
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(key);
    const count = hit ? Number(await hit.text()) || 0 : 0;
    if (count >= REPORTS_PER_IP_PER_DAY) return true;
    void cache
      .put(key, new Response(String(count + 1), { headers: { 'cache-control': 'max-age=86400' } }))
      .catch(() => {});
    return false;
  } catch {
    return false; // fail open — review gate, not the throttle, is the defense
  }
}

aiEscapeRouter.post('/ai-escape/reports', async (c) => {
  const parsed = await safeJsonBody<EscapeReportInput>(c, { maxBytes: 8 * 1024, maxDepth: 4 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  // Honeypot: pretend success so bots can't probe the filter.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return c.json({ ok: true, status: 'pending' }, 201, { 'Cache-Control': 'no-store' });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  if (title.length < 10 || title.length > 140) {
    return badRequest(c, 'title must be 10–140 chars');
  }
  if (summary.length < 20 || summary.length > 1600) {
    return badRequest(c, 'summary must be 20–1600 chars (mechanism over narrative)');
  }
  const klass =
    typeof body.klass === 'string' && (REPORT_KLASS as readonly string[]).includes(body.klass)
      ? body.klass
      : 'containment-breach';
  const occurred = typeof body.occurred === 'string' && body.occurred !== '' ? body.occurred : null;
  if (occurred !== null && !/^\d{4}-\d{2}-\d{2}$/.test(occurred)) {
    return badRequest(c, 'occurred must be YYYY-MM-DD');
  }
  const str = (v: unknown, max: number): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!t) return null;
    return t.length > max ? t.slice(0, max) : t;
  };
  const sourcesRaw = str(body.sources, 600);
  if (sourcesRaw) {
    const urls = sourcesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length === 0 || urls.some((u) => !isHttpUrl(u))) {
      return badRequest(c, 'sources must be comma-separated http(s) URLs (required for review)');
    }
  } else {
    return badRequest(c, 'sources are required — a report without a source will not clear review');
  }

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  if (await reportThrottleOver(ip)) {
    return c.json({ ok: false, error: 'rate_limited', message: '5 reports/day/IP — try again tomorrow' }, 429);
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'report storage not configured');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO ai_escape_reports
          (id, title, klass, occurred, purpose, systems, summary, sources, handle, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .bind(
        id,
        title,
        klass,
        occurred,
        str(body.purpose, 140),
        str(body.systems, 140),
        summary,
        sourcesRaw,
        str(body.handle, 60),
        now
      )
      .run();
  } catch (e) {
    logError('ai-escape report insert failed', e);
    return internalError(c, 'ai_escape_report_failed');
  }
  return c.json({ ok: true, id, status: 'pending' }, 201, { 'Cache-Control': 'no-store' });
});

aiEscapeRouter.get('/ai-escape/reports', async (c) => {
  const status = (c.req.query('status') ?? 'pending').toLowerCase();
  if (!(REPORT_STATUS as readonly string[]).includes(status)) {
    return badRequest(c, 'status must be pending|approved|rejected');
  }
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 100);
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'report storage not configured');
  try {
    const rows = await db
      .prepare(
        `SELECT id, title, klass, occurred, purpose, systems, summary, sources,
                handle, status, created_at, reviewed_at, review_note
         FROM ai_escape_reports WHERE status = ? ORDER BY created_at DESC LIMIT ?`
      )
      .bind(status, limit)
      .all();
    return c.json({ status, count: rows.results?.length ?? 0, reports: rows.results ?? [] }, 200, {
      'Cache-Control': 'public, max-age=60',
    });
  } catch (e) {
    logError('ai-escape reports list failed', e);
    return internalError(c, 'ai_escape_reports_failed');
  }
});

aiEscapeRouter.post('/ai-escape/reports/:id/review', async (c) => {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  const id = c.req.param('id');
  const parsed = await safeJsonBody<{ status?: unknown; note?: unknown }>(c, { maxBytes: 4 * 1024, maxDepth: 4 });
  if ('error' in parsed) return parsed.error;
  const { status, note } = parsed.value;
  if (status !== 'approved' && status !== 'rejected') {
    return badRequest(c, 'status must be approved|rejected');
  }
  const reviewNote = typeof note === 'string' ? note.trim().slice(0, 500) : null;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'report storage not configured');
  try {
    const existing = await db.prepare('SELECT id, status FROM ai_escape_reports WHERE id = ?').bind(id).first();
    if (!existing) return notFound(c, `report_not_found: ${id}`);
    await db
      .prepare('UPDATE ai_escape_reports SET status = ?, reviewed_at = ?, review_note = ? WHERE id = ?')
      .bind(status, new Date().toISOString(), reviewNote, id)
      .run();
    return c.json({ ok: true, id, status });
  } catch (e) {
    logError('ai-escape report review failed', e);
    return internalError(c, 'ai_escape_review_failed');
  }
});

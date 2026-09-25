/**
 * Procedure-extraction jobs + review gates (edge-native).
 *
 * Upstream netandneedle/procedure-extraction-pipeline (Apache-2.0) runs a
 * 16-stage LangGraph pipeline with four human review gates (entities →
 * chunks → procedures → bundle) backed by Postgres + Neo4j. This router
 * implements the portable subset on D1:
 *
 *   POST /procedures/jobs (admin) — submit report text, run one-pass LLM
 *     extraction (procedure-extract.ts), land in `entity_review`.
 *   GET  /procedures/jobs — queue list (?status=&limit=).
 *   GET  /procedures/jobs/:id — job + extraction + reviews.
 *   POST /procedures/jobs/:id/review (admin) — {gate, decision, payload}.
 *     approve advances entity_review→chunk_review→procedure_review→
 *     bundle_review→completed (bundle built from approved drafts via
 *     x-procedure.ts + attack-flow.ts at the procedures→bundle step).
 *   GET  /procedures/bundles/:id — completed STIX bundle.
 *   GET  /procedures/rules — learned-rules asset (+ D1 overrides).
 *
 * Writes are admin-gated (requireAdminMiddleware in index.ts, like
 * /api/v1/graph/ingest). Reads are public key-gated (global external-only).
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';
import { logError } from '../lib/logger';
import { badRequest, internalError, notFound, serviceUnavailable } from '../lib/api-error';
import { requireAdmin } from '../lib/admin-auth';
import { safeJsonBody } from '../lib/safe-body';
import { extractProcedures } from '../lib/procedure-extract';
import { buildXProcedure, checkProcedureTuple, X_PROCEDURE_EXT_ID } from '../lib/x-procedure';
import { buildAttackFlowObjects, orderByTactic, ATTACK_FLOW_EXT_ID } from '../lib/attack-flow';
import { loadAttackIdIndex } from '../lib/attack-id-lazy';

const SOURCE = 'Procedure extraction (edge port) — upstream netandneedle/procedure-extraction-pipeline (Apache-2.0)';
const SOURCE_URL = 'https://github.com/netandneedle/procedure-extraction-pipeline';
const MAX_TEXT = 60000;
const MAX_LIMIT = 100;

const GATE_ORDER = ['entities', 'chunks', 'procedures', 'bundle'] as const;
const STATUS_FOR_GATE: Record<string, string> = {
  entities: 'entity_review',
  chunks: 'chunk_review',
  procedures: 'procedure_review',
  bundle: 'bundle_review',
};

function rid(prefix: string): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return `${prefix}_${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

async function ensureTables(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS procedure_jobs (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, source_type TEXT NOT NULL DEFAULT 'free_text',
        status TEXT NOT NULL DEFAULT 'queued', gates TEXT NOT NULL DEFAULT '{}',
        gate_modes TEXT NOT NULL DEFAULT '{}', is_sequential TEXT NOT NULL DEFAULT 'auto',
        source_text TEXT NOT NULL DEFAULT '', checkpoints TEXT NOT NULL DEFAULT '{}',
        extraction TEXT NOT NULL DEFAULT '{}', corrections TEXT NOT NULL DEFAULT '[]',
        bundle_json TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS procedure_reviews (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, gate TEXT NOT NULL, decision TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}', reviewer TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
}

async function loadRulesMod() {
  return await import('../lib/procedure-manifest');
}

export const proceduresRouter = new Hono<{ Bindings: Env }>();

proceduresRouter.get('/procedures/', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'D1 not bound');
  try {
    await ensureTables(db);
    const row = (await db.prepare(`SELECT COUNT(*) AS n FROM procedure_jobs`).first()) as unknown as { n: number } | null;
    const byStatus = await db.prepare(`SELECT status, COUNT(*) AS n FROM procedure_jobs GROUP BY status`).all();
    return c.json({
      source: SOURCE,
      source_url: SOURCE_URL,
      license: 'Apache-2.0 (upstream design); edge port is original code.',
      jobs: row?.n ?? 0,
      byStatus: (byStatus.results ?? []) as Array<{ status: string; n: number }>,
      gates: [...GATE_ORDER],
    });
  } catch (e) {
    logError('procedures index failed', e);
    return internalError(c, 'procedures_index_failed');
  }
});

proceduresRouter.post('/procedures/jobs', async (c) => {
  const admin = requireAdmin(c);
  if ('error' in admin) return admin.error;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'D1 not bound');
  const parsed = await safeJsonBody<{
    title?: string;
    sourceText?: string;
    sourceType?: string;
    isSequential?: string;
    gates?: Record<string, boolean>;
  }>(c, { maxBytes: 128 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  const title = (body.title ?? '').trim().slice(0, 300);
  const sourceText = (body.sourceText ?? '').slice(0, MAX_TEXT);
  if (!title) return badRequest(c, 'Provide {title}');
  if (sourceText.trim().length < 600) return badRequest(c, 'Provide {sourceText} (≥600 chars)');
  try {
    await ensureTables(db);
    const id = rid('proc');
    const gates = JSON.stringify({ entities: true, chunks: true, procedures: true, bundle: true, ...(body.gates ?? {}) });
    await db
      .prepare(
        `INSERT INTO procedure_jobs (id, title, source_type, status, gates, is_sequential, source_text, updated_at)
         VALUES (?, ?, ?, 'queued', ?, ?, ?, datetime('now'))`
      )
      .bind(id, title, (body.sourceType ?? 'free_text').slice(0, 40), gates, (body.isSequential ?? 'auto').slice(0, 10), sourceText)
      .run();
    // One-pass extraction inline (single LLM call; never throws).
    const extraction = await extractProcedures(c.env, sourceText);
    await db
      .prepare(
        `UPDATE procedure_jobs SET status='entity_review', checkpoints=?, extraction=?, updated_at=datetime('now') WHERE id=?`
      )
      .bind(JSON.stringify({ extractedAt: new Date().toISOString() }), JSON.stringify(extraction), id)
      .run();
    const job = await db.prepare(`SELECT * FROM procedure_jobs WHERE id=?`).bind(id).first();
    return c.json({ job, source: SOURCE }, 201);
  } catch (e) {
    logError('procedures submit failed', e);
    return internalError(c, 'procedure_submit_failed');
  }
});

proceduresRouter.get('/procedures/jobs', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'D1 not bound');
  try {
    await ensureTables(db);
    const status = (c.req.query('status') ?? '').trim().slice(0, 40);
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '20', 10) || 20, 1), MAX_LIMIT);
    const rows = status
      ? await db.prepare(`SELECT id,title,source_type,status,created_at,updated_at FROM procedure_jobs WHERE status=? ORDER BY updated_at DESC LIMIT ?`).bind(status, limit).all()
      : await db.prepare(`SELECT id,title,source_type,status,created_at,updated_at FROM procedure_jobs ORDER BY updated_at DESC LIMIT ?`).bind(limit).all();
    return c.json({ jobs: rows.results ?? [], source: SOURCE });
  } catch (e) {
    logError('procedures list failed', e);
    return internalError(c, 'procedures_list_failed');
  }
});

proceduresRouter.get('/procedures/jobs/:id', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'D1 not bound');
  try {
    await ensureTables(db);
    const job = await db.prepare(`SELECT * FROM procedure_jobs WHERE id=?`).bind(c.req.param('id')).first();
    if (!job) return notFound(c, 'job not found');
    const reviews = await db.prepare(`SELECT * FROM procedure_reviews WHERE job_id=? ORDER BY created_at ASC`).bind(c.req.param('id')).all();
    return c.json({ job, reviews: reviews.results ?? [], source: SOURCE });
  } catch (e) {
    logError('procedures get failed', e);
    return internalError(c, 'procedures_get_failed');
  }
});

proceduresRouter.post('/procedures/jobs/:id/review', async (c) => {
  const admin = requireAdmin(c);
  if ('error' in admin) return admin.error;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'D1 not bound');
  const parsed = await safeJsonBody<{ gate?: string; decision?: string; payload?: Record<string, unknown>; reviewer?: string }>(c, { maxBytes: 32 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  const gate = (body.gate ?? '').trim();
  const decision = (body.decision ?? '').trim().toLowerCase();
  if (!(GATE_ORDER as readonly string[]).includes(gate)) return badRequest(c, 'gate must be one of entities|chunks|procedures|bundle');
  if (!['approve', 'reject', 'edit'].includes(decision)) return badRequest(c, 'decision must be approve|reject|edit');
  try {
    await ensureTables(db);
    const id = c.req.param('id');
    const job = (await db.prepare(`SELECT * FROM procedure_jobs WHERE id=?`).bind(id).first()) as unknown as {
      id: string;
      title: string;
      status: string;
      source_text: string;
      extraction: string;
      corrections: string;
    } | null;
    if (!job) return notFound(c, 'job not found');
    await db
      .prepare(`INSERT INTO procedure_reviews (id, job_id, gate, decision, payload, reviewer) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(rid('rev'), id, gate, decision, JSON.stringify(body.payload ?? {}), (body.reviewer ?? '').slice(0, 120))
      .run();
    // Record corrections for the learning loop.
    const corrections = JSON.parse(job.corrections || '[]') as unknown[];
    corrections.push({ gate, decision, at: new Date().toISOString(), payload: body.payload ?? {} });
    let nextStatus = job.status;
    let bundleJson = '';
    if (decision === 'approve') {
      const idx = GATE_ORDER.indexOf(gate as (typeof GATE_ORDER)[number]);
      if (gate === 'procedures') {
        // Build the STIX bundle from approved drafts now.
        bundleJson = await buildProcedureBundle(c.env, job);
        nextStatus = 'bundle_review';
      } else if (idx >= 0 && idx < GATE_ORDER.length - 1) {
        nextStatus = STATUS_FOR_GATE[GATE_ORDER[idx + 1]!]!;
      } else {
        nextStatus = 'completed';
      }
    } else if (decision === 'reject') {
      nextStatus = STATUS_FOR_GATE[gate] ?? job.status;
    }
    if (gate === 'bundle' && decision === 'approve') nextStatus = 'completed';
    await db
      .prepare(`UPDATE procedure_jobs SET status=?, corrections=?, ${bundleJson ? 'bundle_json=?,' : ''} updated_at=datetime('now') WHERE id=?`)
      .bind(...(bundleJson ? [nextStatus, JSON.stringify(corrections).slice(0, 60000), bundleJson, id] : [nextStatus, JSON.stringify(corrections).slice(0, 60000), id]))
      .run();
    const updated = await db.prepare(`SELECT * FROM procedure_jobs WHERE id=?`).bind(id).first();
    return c.json({ job: updated, source: SOURCE });
  } catch (e) {
    logError('procedures review failed', e);
    return internalError(c, 'procedure_review_failed');
  }
});

async function buildProcedureBundle(env: Env, job: { title: string; extraction: string }): Promise<string> {
  const now = new Date().toISOString();
  const identityId = 'identity--a1c9d6c0-0000-4000-8000-000000000000';
  const extraction = JSON.parse(job.extraction || '{}') as {
    drafts?: Array<{ name: string; description: string; techniqueIds: string[]; platforms: string[]; tactics: string[]; commandLines: string[]; confidence: number }>;
  };
  const drafts = Array.isArray(extraction.drafts) ? extraction.drafts : [];
  let index: Record<string, { id: string; tac?: string }> = {};
  try {
    index = (await loadAttackIdIndex(env)) as unknown as typeof index;
  } catch {
    index = {};
  }
  const objects: Array<Record<string, unknown>> = [];
  const flowTechs: Array<{ id: string; name: string; stixApId: string; tactic?: string }> = [];
  for (const d of drafts.slice(0, 60)) {
    const stixMap: Record<string, string> = {};
    for (const tid of d.techniqueIds ?? []) {
      if (index[tid]) {
        stixMap[tid] = index[tid]!.id;
        flowTechs.push({ id: tid, name: tid, stixApId: index[tid]!.id, tactic: index[tid]!.tac });
      }
    }
    const { procedure, observables } = await buildXProcedure(
      {
        name: d.name,
        description: d.description,
        techniqueIds: d.techniqueIds ?? [],
        platforms: d.platforms ?? [],
        tactics: d.tactics ?? [],
        commandLines: d.commandLines ?? [],
        confidence: d.confidence ?? 50,
      },
      { identityId, time: now, techniqueStixIds: stixMap }
    );
    const tuple = checkProcedureTuple(
      procedure.x_technique_refs,
      procedure.x_log_source_refs ?? [],
      procedure.x_components_refs,
      procedure.confidence
    );
    void tuple;
    objects.push(procedure as unknown as Record<string, unknown>, ...observables);
  }
  // Attack-Flow sequencing (linear chain in kill-chain order).
  const ordered = orderByTactic(flowTechs.filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i));
  const keyPrefix = `procedure|${job.title.slice(0, 60)}`;
  let counter = 0;
  const idFor = async (type: string, key: string): Promise<string> => {
    counter++;
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    void key;
    return `${type}--${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}-${String(counter).padStart(4, '0').slice(-4)}`;
  };
  const flow = await buildAttackFlowObjects(ordered, {
    flowName: job.title.slice(0, 200),
    identityId,
    time: { created: now, modified: now },
    keyPrefix,
    idFor,
  });
  objects.unshift(
    {
      type: 'extension-definition',
      spec_version: '2.1',
      id: X_PROCEDURE_EXT_ID,
      created: now,
      modified: now,
      name: 'x-procedure',
      description: 'Adversary procedure (edge port of the upstream x-procedure draft).',
      schema: 'https://raw.githubusercontent.com/netandneedle/procedure-extraction-pipeline/main/backend/app/schemas/x_procedure_v3.json',
      version: '0.5.0-draft',
      extension_types: ['new-sdo'],
    },
    ...(flow.objects as unknown as Array<Record<string, unknown>>).filter((o) => o.id !== ATTACK_FLOW_EXT_ID || true)
  );
  const bundle = {
    type: 'bundle',
    id: `bundle--${crypto.randomUUID()}`,
    spec_version: '2.1',
    objects,
    x_flowviz_metadata: undefined,
  };
  return JSON.stringify(bundle).slice(0, 4_000_000);
}

proceduresRouter.get('/procedures/bundles/:id', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'D1 not bound');
  try {
    await ensureTables(db);
    const job = (await db.prepare(`SELECT id,title,status,bundle_json,updated_at FROM procedure_jobs WHERE id=?`).bind(c.req.param('id')).first()) as unknown as {
      id: string;
      title: string;
      status: string;
      bundle_json: string;
    } | null;
    if (!job) return notFound(c, 'job not found');
    if (!job.bundle_json) return notFound(c, 'bundle not built yet (approve the procedures gate first)');
    c.header('Content-Type', 'application/json');
    return c.body(job.bundle_json);
  } catch (e) {
    logError('procedures bundle failed', e);
    return internalError(c, 'procedures_bundle_failed');
  }
});

proceduresRouter.get('/procedures/rules', async (c) => {
  try {
    const mod = await loadRulesMod();
    const rules = await mod.loadProcedureRules(c.env.ASSETS);
    return c.json({ rules, source: SOURCE, source_url: SOURCE_URL });
  } catch (e) {
    logError('procedures rules failed', e);
    return internalError(c, 'procedures_rules_failed');
  }
});

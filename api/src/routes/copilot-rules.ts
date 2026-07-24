import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError, notFound } from '../lib/api-error';

interface SavedRule {
  id: string;
  session_id: string | null;
  rule_type: string;
  rule_name: string;
  rule_content: string;
  description: string;
  context: string;
  created_at: string;
}

async function ensureTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS copilot_saved_rules (
        id TEXT PRIMARY KEY, session_id TEXT, rule_type TEXT NOT NULL,
        rule_name TEXT NOT NULL DEFAULT '', rule_content TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', context TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`
    )
    .run();
}

export async function copilotRulesSaveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const db = c.env.BRIEFINGS_DB as D1Database | undefined;
    if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));

    const body = await c.req.json<{
      session_id?: string;
      rule_type: string;
      rule_name?: string;
      rule_content: string;
      description?: string;
      context?: string;
    }>();
    if (!body.rule_type || !body.rule_content) return badRequest(c, 'rule_type and rule_content required');

    await ensureTable(db);
    const id = `rule_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO copilot_saved_rules (id, session_id, rule_type, rule_name, rule_content, description, context, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        body.session_id ?? null,
        body.rule_type,
        body.rule_name ?? '',
        body.rule_content,
        body.description ?? '',
        body.context ?? '',
        now
      )
      .run();

    return c.json({ id, created_at: now });
  } catch (e) {
    console.error('copilotRulesSaveHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

export async function copilotRulesListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const db = c.env.BRIEFINGS_DB as D1Database | undefined;
    if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));

    await ensureTable(db);
    const type = c.req.query('type');
    let rows: D1Result<SavedRule>;
    if (type) {
      rows = await db
        .prepare('SELECT * FROM copilot_saved_rules WHERE rule_type = ? ORDER BY created_at DESC LIMIT 50')
        .bind(type)
        .all<SavedRule>();
    } else {
      rows = await db
        .prepare('SELECT * FROM copilot_saved_rules ORDER BY created_at DESC LIMIT 50')
        .all<SavedRule>();
    }
    return c.json({ rules: rows.results ?? [] });
  } catch (e) {
    console.error('copilotRulesListHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

export async function copilotRulesDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const db = c.env.BRIEFINGS_DB as D1Database | undefined;
    if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));
    const id = c.req.param('id');
    if (!id) return badRequest(c, 'id required');

    await db.prepare('DELETE FROM copilot_saved_rules WHERE id = ?').bind(id).run();
    return c.json({ deleted: true });
  } catch (e) {
    console.error('copilotRulesDeleteHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

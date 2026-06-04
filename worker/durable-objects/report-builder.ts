import type { Env } from '../env';
import { advance, initState, type ReportState } from '../../api/src/lib/report/pipeline';
import type { Env as ApiEnv } from '../../api/src/env';
import type { TemplateId, Tlp } from '../../api/src/lib/report/types';

/**
 * Alarm-driven report builder. Each `alarm()` runs ONE pipeline phase (its own
 * subrequest budget), persists the state, and reschedules until the report is
 * done/errored — then writes the finished Report to the D1 `reports` table.
 */
export class ReportBuilderDO {
  private ctx: DurableObjectState;
  private env: Env;
  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/build' && request.method === 'POST') {
      const body = (await request.json()) as { id: string; subject: string; template?: TemplateId; tlp: Tlp };
      const state = initState(body.id, body.subject, body.template, body.tlp ?? 'AMBER');
      await this.ctx.storage.put(`state:${body.id}`, state);
      await this.persist(state);
      await this.ctx.storage.setAlarm(Date.now() + 1);
      return Response.json({ id: body.id });
    }

    if (url.pathname === '/state') {
      const id = url.searchParams.get('id') ?? '';
      const state = await this.ctx.storage.get<ReportState>(`state:${id}`);
      return state ? Response.json(state) : Response.json({ error: 'not found' }, { status: 404 });
    }

    return new Response('not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    const all = await this.ctx.storage.list<ReportState>({ prefix: 'state:' });
    let anyPending = false;
    for (const [key, state] of all) {
      if (state.phase === 'done' || state.phase === 'error') continue;
      const next = await advance(state, {
        env: this.env as unknown as ApiEnv,
        write: { ai: (this.env as unknown as ApiEnv).AI, groqKey: (this.env as unknown as ApiEnv).GROQ_API_KEY },
      });
      await this.ctx.storage.put(key, next);
      if (next.phase === 'done' || next.phase === 'error') await this.persist(next);
      else anyPending = true;
    }
    if (anyPending) await this.ctx.storage.setAlarm(Date.now() + 1);
  }

  private async persist(state: ReportState): Promise<void> {
    const db = (this.env as unknown as ApiEnv).BRIEFINGS_DB;
    if (!db) return;
    const status = state.phase === 'done' ? 'done' : state.phase === 'error' ? 'error' : 'building';
    const json = state.phase === 'done' && state.report ? JSON.stringify(state.report) : null;
    await db
      .prepare(
        `INSERT INTO reports (id, subject, template, tlp, status, report_json, created_at, updated_at)
         VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, report_json=COALESCE(excluded.report_json, reports.report_json), updated_at=datetime('now')`
      )
      .bind(state.id, state.input.subject, state.input.template ?? 'auto', state.input.tlp, status, json)
      .run();
  }
}

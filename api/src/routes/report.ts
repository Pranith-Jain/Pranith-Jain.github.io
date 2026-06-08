import type { Context } from 'hono';
import type { Env } from '../env';
import { notFound, serviceUnavailable } from '../lib/api-error';
import { sseStream } from '../lib/sse';
import { getParsed } from '../lib/validate';

const ORIGIN = 'https://report-builder.internal';

function stub(env: Env) {
  const ns = env.REPORT_BUILDER!;
  return ns.get(ns.idFromName('global'));
}

/** POST /api/v1/report/build → kick a report job, return its id. */
export async function buildReportHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!c.env.REPORT_BUILDER) return serviceUnavailable(c, 'report builder unavailable');
  const body = await getParsed<{ subject: string; template?: string; tlp: string }>(c, () => c.req.json());
  const id = crypto.randomUUID();
  await stub(c.env).fetch(`${ORIGIN}/build`, { method: 'POST', body: JSON.stringify({ id, ...body }) });
  return c.json({ report_id: id }, 202);
}

/** GET /api/v1/report/:id → live DO state (with progress) or the persisted row. */
export async function getReportHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id') ?? '';
  if (c.env.REPORT_BUILDER) {
    const res = await stub(c.env).fetch(`${ORIGIN}/state?id=${encodeURIComponent(id)}`);
    if (res.ok) return new Response(res.body, { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const row = await c.env.BRIEFINGS_DB?.prepare('SELECT report_json, status FROM reports WHERE id = ?')
    .bind(id)
    .first<{ report_json: string | null; status: string }>();
  if (!row) return notFound(c);
  return c.json({ status: row.status, report: row.report_json ? JSON.parse(row.report_json) : null });
}

/** GET /api/v1/report/:id/stream → SSE progress by polling the DO. */
export function streamReportHandler(c: Context<{ Bindings: Env }>): Response {
  const id = c.req.param('id') ?? '';
  const env = c.env;
  return sseStream(async (write) => {
    if (!env.REPORT_BUILDER) {
      write('error', { error: 'report builder unavailable' });
      return;
    }
    for (let i = 0; i < 120; i++) {
      const res = await stub(env).fetch(`${ORIGIN}/state?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        write('error', { error: 'not found' });
        return;
      }
      const s = (await res.json()) as { phase: string; pct: number; detail: string };
      write('progress', { phase: s.phase, pct: s.pct, detail: s.detail });
      if (s.phase === 'done' || s.phase === 'error') return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  });
}

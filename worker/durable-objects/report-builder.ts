import type { Env } from '../env';
import { advance, initState, type ReportState } from '../../api/src/lib/report/pipeline';
import type { Env as ApiEnv } from '../../api/src/env';
import type { TemplateId, Tlp } from '../../api/src/lib/report/types';

const MAX_REPORT_WS_CONNECTIONS = 5;

/**
 * Alarm-driven report builder. Each `alarm()` runs ONE pipeline phase (its own
 * subrequest budget), persists the state, and reschedules until the report is
 * done/errored — then writes the finished Report to the D1 `reports` table.
 */
export class ReportBuilderDO {
  private ctx: DurableObjectState;
  private env: Env;
  private sessions = new Map<string, WebSocket>();
  /** Tracks which reportId each WebSocket session is watching. */
  private sessionReportIds = new Map<string, string>();
  private ipConnections = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade — real-time progress streaming
    if (request.headers.get('upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

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

  private handleWebSocketUpgrade(request: Request): Response {
    if (this.sessions.size >= MAX_REPORT_WS_CONNECTIONS) {
      return new Response('Too many connections', { status: 429 });
    }

    const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const ipCount = this.ipConnections.get(clientIp) ?? 0;
    if (ipCount >= 3) {
      return new Response('Too many connections from this IP', { status: 429 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const sessionId = crypto.randomUUID();

    this.sessions.set(sessionId, server);
    this.ipConnections.set(clientIp, ipCount + 1);
    server.accept();

    // Listen for the client's subscription message: {"reportId":"xxx"}
    // The client sends this after connecting to indicate which report
    // it wants to monitor. Only messages for that reportId are delivered.
    server.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (typeof msg.reportId === 'string') {
          this.sessionReportIds.set(sessionId, msg.reportId);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.sessions.delete(sessionId);
      this.sessionReportIds.delete(sessionId);
      const remaining = this.ipConnections.get(clientIp) ?? 1;
      if (remaining <= 1) this.ipConnections.delete(clientIp);
      else this.ipConnections.set(clientIp, remaining - 1);
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    server.send(JSON.stringify({ type: 'connected' }));

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(msg: unknown): void {
    if (this.sessions.size === 0) return;
    const payload = JSON.stringify(msg);
    // Extract reportId from the message to filter delivery.
    // Only sessions that have subscribed to this reportId receive the message.
    // Sessions that haven't subscribed yet (no reportId set) receive nothing —
    // they must send {"reportId":"..."} after connecting.
    const msgReportId = (msg as Record<string, unknown>).reportId;
    for (const [id, ws] of this.sessions) {
      const watching = this.sessionReportIds.get(id);
      // Deliver only if: session subscribed to this specific reportId,
      // or the message has no reportId (broadcast to all, e.g. 'connected').
      if (watching && watching !== msgReportId) continue;
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(id);
        this.sessionReportIds.delete(id);
      }
    }
  }

  async alarm(): Promise<void> {
    const all = await this.ctx.storage.list<ReportState>({ prefix: 'state:' });
    let anyPending = false;
    for (const [key, state] of all) {
      if (state.phase === 'done' || state.phase === 'error') continue;
      try {
        const next = await advance(state, {
          env: this.env as unknown as ApiEnv,
          write: { ai: (this.env as unknown as ApiEnv).AI, groqKey: (this.env as unknown as ApiEnv).GROQ_API_KEY, googleKey: (this.env as unknown as ApiEnv).GOOGLE_AI_STUDIO_API_KEY },
        });
        await this.ctx.storage.put(key, next);

        // Push progress to WebSocket clients
        this.broadcast({
          type: 'progress',
          reportId: next.id,
          phase: next.phase,
          pct: next.pct,
          detail: next.detail,
        });

        if (next.phase === 'done' || next.phase === 'error') {
          await this.persist(next);
          this.broadcast({
            type: next.phase,
            reportId: next.id,
            report: next.report,
            error: next.error,
          });
        } else {
          anyPending = true;
        }
      } catch (err) {
        console.error(
          JSON.stringify({
            job: 'report-builder-alarm',
            reportId: state.id,
            error: err instanceof Error ? err.message : String(err),
          })
        );
        const errored: ReportState = {
          ...state,
          phase: 'error',
          error: err instanceof Error ? err.message : 'alarm failed',
        };
        await this.ctx.storage.put(key, errored);
        await this.persist(errored);
        this.broadcast({ type: 'error', reportId: state.id, error: errored.error });
      }
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

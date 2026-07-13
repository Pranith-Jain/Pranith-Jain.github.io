import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError, notFound, serviceUnavailable } from '../lib/api-error';
import type { AgentState } from '../lib/agent/types';
import { detectType } from '../lib/report/subject-resolver';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent_id?: string;
  query_type?: string;
  model_used?: string;
  processed_at?: string;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

function generateId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const CVE_ANYWHERE = /CVE-\d{4}-\d{4,}/i;
const IP_ANYWHERE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

const FOLLOW_UP_PATTERNS =
  /^(what|how|when|where|why|who|can|could|would|tell|explain|elaborate|tell me|can you|more|also|and|so)\b/i;
const PRONOUN_REF_PATTERNS = /\b(this|that|it|these|those|them|the previous|the above|the earlier)\b/i;

function extractEntity(query: string): string | null {
  const cve = CVE_ANYWHERE.exec(query);
  if (cve) return cve[0]!.toUpperCase();
  const ip = IP_ANYWHERE.exec(query);
  if (ip) return ip[0]!;
  return null;
}

function isFollowUpQuery(query: string): boolean {
  const cleaned = query.replace(/[^\w\s]/g, '').trim();
  if (cleaned.length < 10 && FOLLOW_UP_PATTERNS.test(cleaned)) return true;
  if (PRONOUN_REF_PATTERNS.test(query)) return true;
  return false;
}

const VAGUE_TYPES = new Set(['general', 'generic']);

function getLastSubstantiveQuery(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'user' && m.query_type && !VAGUE_TYPES.has(m.query_type)) {
      return m.content;
    }
  }
  return null;
}

function getLastSubstantiveQueryType(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'user' && m.query_type && !VAGUE_TYPES.has(m.query_type)) {
      return m.query_type;
    }
  }
  return null;
}

async function ensureTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS copilot_sessions (
        id TEXT PRIMARY KEY,
        messages_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
}

async function loadSession(db: D1Database, id: string): Promise<ChatSession | null> {
  const row = await db.prepare('SELECT * FROM copilot_sessions WHERE id = ?').bind(id).first<{
    id: string;
    messages_json: string;
    created_at: string;
    updated_at: string;
  }>();
  if (!row) return null;
  return {
    id: row.id,
    messages: JSON.parse(row.messages_json) as ChatMessage[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function saveSession(db: D1Database, session: ChatSession): Promise<void> {
  await db
    .prepare(
      `INSERT INTO copilot_sessions (id, messages_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET messages_json = excluded.messages_json, updated_at = excluded.updated_at`
    )
    .bind(session.id, JSON.stringify(session.messages), session.created_at, new Date().toISOString())
    .run();
}

export async function copilotChatHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{ sessionId?: string; query: string }>();
    const query = body.query?.trim();
    if (!query) return badRequest(c, 'query is required');
    if (query.length > 500) return badRequest(c, 'query too long (max 500 chars)');

    const db = c.env.BRIEFINGS_DB as D1Database | undefined;
    if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));

    const doNamespace = c.env.INVESTIGATOR_AGENT;
    if (!doNamespace) return serviceUnavailable(c, 'Agent not configured');

    await ensureTable(db);

    let session: ChatSession;
    if (body.sessionId) {
      const existing = await loadSession(db, body.sessionId);
      if (!existing) return notFound(c, 'session not found');
      session = existing;
    } else {
      session = {
        id: generateId(),
        messages: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    const queryType = detectType(query) as string;
    const isFollowUp = isFollowUpQuery(query);

    let effectiveQuery = query.trim();
    let effectiveType = queryType;

    if (isFollowUp || VAGUE_TYPES.has(queryType)) {
      const extracted = extractEntity(query);
      if (extracted) {
        effectiveQuery = extracted;
        effectiveType = detectType(extracted) as string;
      } else if (session.messages.length > 0) {
        const prevQuery = getLastSubstantiveQuery(session.messages);
        const prevType = getLastSubstantiveQueryType(session.messages);
        if (prevQuery && prevType) {
          effectiveQuery = prevQuery;
          effectiveType = prevType;
        }
      }
    }

    const agentId = crypto.randomUUID();
    const doId = doNamespace.idFromName(agentId);
    const stub = doNamespace.get(doId);

    const doRes = await stub.fetch('https://agent/investigate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: agentId, query: effectiveQuery, queryType: effectiveType, maxSteps: 6 }),
    });

    if (!doRes.ok) {
      return internalError(c, new Error('failed to start agent investigation'));
    }

    session.messages.push({ role: 'user', content: query, query_type: queryType });
    session.messages.push({ role: 'system', content: '', agent_id: agentId });
    await saveSession(db, session);

    return c.json({ sessionId: session.id, agentId });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

export async function copilotChatStreamHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const sessionId = c.req.param('sessionId');
  if (!sessionId) return badRequest(c, 'sessionId required');

  const db = c.env.BRIEFINGS_DB as D1Database | undefined;
  if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));

  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (!doNamespace) return serviceUnavailable(c, 'Agent not configured');

  const session = await loadSession(db, sessionId);
  if (!session) return notFound(c, 'session not found');

  const systemMsg = [...session.messages].reverse().find((m) => m.role === 'system' && m.agent_id);
  const agentId = systemMsg?.agent_id;
  if (!agentId) return badRequest(c, 'no active investigation');

  const doId = doNamespace.idFromName(agentId);
  const stub = doNamespace.get(doId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastStep = -1;
      let closed = false;

      const send = (data: string) => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch (_catchErr) {
            console.error('copilotChatStreamHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            closed = true;
          }
        }
      };

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          const res = await stub.fetch(`https://agent/state?id=${encodeURIComponent(agentId)}`);
          if (!res.ok) return;
          const state = (await res.json()) as AgentState;

          for (const step of state.steps) {
            if (step.stepNumber > lastStep) {
              send(JSON.stringify({ type: 'step', step }));
              lastStep = step.stepNumber;
            }
          }

          if (state.status === 'done' || state.status === 'error') {
            clearInterval(interval);

            const report = state.status === 'done' ? (state.report ?? 'Investigation completed.') : null;
            const errMsg = state.status === 'error' ? (state.error ?? 'Unknown error') : null;

            if (report) {
              session.messages.push({
                role: 'assistant',
                content: report,
                agent_id: agentId,
                query_type: state.queryType,
                model_used: state.modelUsed ?? undefined,
                processed_at: state.completedAt ?? new Date().toISOString(),
              });

              const maxHistory = 20;
              if (session.messages.length > maxHistory) {
                session.messages = session.messages.slice(-maxHistory);
              }

              try {
                await saveSession(db, session);
              } catch (_catchErr) {
                console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
                /* non-fatal */
              }
            }

            send(
              JSON.stringify({
                type: state.status,
                report,
                error: errMsg,
                modelUsed: state.modelUsed,
              })
            );

            closed = true;
            try {
              controller.close();
            } catch (_catchErr) {
              console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
              /* already closed */
            }
          }
        } catch (_catchErr) {
          console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          /* poll */
        }
      }, 800);

      const heartbeat = setInterval(() => {
        if (!closed) send(JSON.stringify({ type: 'heartbeat' }));
        else clearInterval(heartbeat);
      }, 15000);

      const timeout = setTimeout(() => {
        if (!closed) {
          clearInterval(interval);
          clearInterval(heartbeat);
          closed = true;
          send(JSON.stringify({ type: 'error', error: 'Stream timed out after 120s' }));
          try {
            controller.close();
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* already closed */
          }
        }
      }, 120_000);

      c.req.raw.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        clearTimeout(timeout);
        try {
          controller.close();
        } catch (_catchErr) {
          console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}

export async function copilotChatHistoryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const sessionId = c.req.param('sessionId');
    if (!sessionId) return badRequest(c, 'sessionId required');

    const db = c.env.BRIEFINGS_DB as D1Database | undefined;
    if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));

    await ensureTable(db);
    const session = await loadSession(db, sessionId);
    if (!session) return notFound(c, 'session not found');

    return c.json({
      sessionId: session.id,
      messages: session.messages,
      created_at: session.created_at,
      updated_at: session.updated_at,
    });
  } catch (e) {
    console.error('copilotChatHistoryHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

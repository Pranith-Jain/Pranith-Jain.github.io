import type { Env } from './env';
import type { Env as ApiEnv } from '../api/src/env';
import type { AgentState } from '../api/src/lib/agent/types';
import { validateRawKey } from '../api/src/lib/auth';

/**
 * Handle WebSocket upgrade for copilot chat sessions.
 * The WS connection stays alive across multiple messages — the client sends
 * { type: "message", content: "..." } and the server streams back step
 * events and the final response.
 *
 * Requires a valid API key to prevent unauthenticated Workers AI abuse
 * (denial-of-wallet via unlimited agent investigations).
 */
export async function handleChatWebSocket(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  // Authenticate: require a valid API key. Without this, any page on the
  // allowed origin could open unlimited chat sessions, each invoking
  // Workers AI investigations (denial-of-wallet).
  const authz = request.headers.get('authorization') ?? '';
  const rawKey = /^Bearer\s+(\S+)/i.exec(authz)?.[1] ?? request.headers.get('x-api-key') ?? '';
  const db = env.BRIEFINGS_DB;
  if (!db || !rawKey) {
    return new Response(JSON.stringify({ error: 'api key required for chat' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const valid = await validateRawKey(db, rawKey);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'invalid api key' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  // Ensure the sessions table exists
  await db!
    .prepare(
      `CREATE TABLE IF NOT EXISTS copilot_sessions (
        id TEXT PRIMARY KEY,
        messages_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();

  let session: {
    id: string;
    messages: Array<{
      role: string;
      content: string;
      agent_id?: string;
      query_type?: string;
      model_used?: string;
      processed_at?: string;
    }>;
    created_at: string;
    updated_at: string;
  } | null = null;
  let currentAgentId: string | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  server.send(JSON.stringify({ type: 'connected' }));

  server.addEventListener('message', async (event) => {
    let msg: { type: string; content?: string; sessionId?: string };
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data));
    } catch {
      server.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    if (msg.type === 'ping') {
      server.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (msg.type === 'message' && msg.content) {
      // Clean up any previous polling
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }

      const content = msg.content.trim();
      if (!content || content.length > 500) {
        server.send(JSON.stringify({ type: 'error', error: 'Invalid message' }));
        return;
      }

      // Load or create session
      if (msg.sessionId) {
        const row = await db!.prepare('SELECT * FROM copilot_sessions WHERE id = ?').bind(msg.sessionId).first<{
          id: string;
          messages_json: string;
          created_at: string;
          updated_at: string;
        }>();
        if (row) {
          session = {
            id: row.id,
            messages: JSON.parse(row.messages_json),
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        }
      }

      if (!session) {
        session = {
          id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          messages: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        server.send(JSON.stringify({ type: 'session', sessionId: session.id }));
      }

      // Detect query type
      const queryType = detectType(content);

      // Start agent investigation
      const agentId = crypto.randomUUID();
      currentAgentId = agentId;

      const doNamespace = (env as unknown as ApiEnv).INVESTIGATOR_AGENT;
      if (!doNamespace) {
        server.send(JSON.stringify({ type: 'error', error: 'Agent not configured' }));
        return;
      }

      session.messages.push({ role: 'user', content, query_type: queryType });
      session.messages.push({ role: 'system', content: '', agent_id: agentId });

      const doId = doNamespace.idFromName(agentId);
      const stub = doNamespace.get(doId);

      const doRes = await stub.fetch('https://agent/investigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: agentId, query: content, queryType, maxSteps: 6 }),
      });

      if (!doRes.ok) {
        server.send(JSON.stringify({ type: 'error', error: 'Failed to start investigation' }));
        return;
      }

      server.send(JSON.stringify({ type: 'investigating', agentId }));

      // Poll for step updates
      let lastStep = -1;
      pollInterval = setInterval(async () => {
        if (!currentAgentId || currentAgentId !== agentId) {
          clearInterval(pollInterval!);
          pollInterval = null;
          return;
        }

        try {
          const res = await stub.fetch(`https://agent/state?id=${encodeURIComponent(agentId)}`);
          if (!res.ok) return;
          const state = (await res.json()) as AgentState;

          for (const step of state.steps) {
            if (step.stepNumber > lastStep) {
              server.send(JSON.stringify({ type: 'step', step }));
              lastStep = step.stepNumber;
            }
          }

          if (state.status === 'done' || state.status === 'error') {
            clearInterval(pollInterval!);
            pollInterval = null;

            if (state.status === 'done' && state.report && session) {
              session.messages.push({
                role: 'assistant',
                content: state.report,
                agent_id: agentId,
                query_type: state.queryType,
                model_used: state.modelUsed ?? undefined,
                processed_at: state.completedAt ?? new Date().toISOString(),
              });

              // Trim history
              const maxHistory = 20;
              if (session.messages.length > maxHistory) {
                session.messages = session.messages.slice(-maxHistory);
              }

              // Save session
              try {
                await db!
                  .prepare(
                    `INSERT INTO copilot_sessions (id, messages_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET messages_json = excluded.messages_json, updated_at = excluded.updated_at`
                  )
                  .bind(session.id, JSON.stringify(session.messages), session.created_at, new Date().toISOString())
                  .run();
              } catch {
                /* non-fatal */
              }
            }

            server.send(
              JSON.stringify({
                type: state.status,
                report: state.status === 'done' ? state.report : null,
                error: state.status === 'error' ? state.error : null,
                modelUsed: state.modelUsed,
              })
            );

            currentAgentId = null;
          }
        } catch {
          /* poll error */
        }
      }, 800);
    }
  });

  server.addEventListener('close', () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });

  server.addEventListener('error', () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });

  return new Response(null, { status: 101, webSocket: client });
}

function detectType(query: string): string {
  const q = query.toLowerCase();
  if (/\bcve-\d{4}-\d{4,}/i.test(query)) return 'cve';
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(query)) return 'ip';
  if (/\b[a-fA-F0-9]{32,64}\b/.test(query)) return 'hash';
  if (/^https?:\/\//i.test(query.trim())) return 'url';
  if (/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/i.test(query)) return 'domain';
  if (/\b(apt\d+|lazarus|fin\d+|ta\d+|lockbit|blackcat|alphv|cl0p)\b/i.test(q)) return 'actor';
  if (/\bransomware\b/i.test(q)) return 'ransomware';
  return 'generic';
}

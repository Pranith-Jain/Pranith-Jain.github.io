import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError, notFound } from '../lib/api-error';
import {
  gatherSources,
  gatherLiveEnrichment,
  buildSystemPrompt,
  callWorkersAi,
  callGroq,
  type Source,
  type QueryType,
  type CopilotResponse,
} from './copilot';
import { computeConfidence } from '../lib/confidence';
import { detectType } from '../lib/report/subject-resolver';
import { validateAiOutput } from '../lib/ai-output-validator';
import { queryCorpus, formatRetrievedContext } from '../lib/rag-embedder';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  query_type?: string;
  model_used?: string;
  confidence?: CopilotResponse['confidence'];
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

function buildChatUserPrompt(
  query: string,
  queryType: QueryType,
  sources: Source[],
  history: ChatMessage[],
  ragContext?: string
): string {
  let prompt = `<investigation>\nQuery: ${query}\nType: ${queryType}\n</investigation>\n\n`;

  if (history.length > 0) {
    prompt += `<conversation_history>\n`;
    for (const msg of history) {
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      const preview = msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content;
      prompt += `<${label.toLowerCase()}_message>\n${preview}\n</${label.toLowerCase()}_message>\n\n`;
    }
    prompt += `</conversation_history>\n\n`;
    prompt += `<instruction>The user's previous questions and your previous answers are shown above in <conversation_history>. Answer the NEW query below, referencing earlier context where relevant. If the user refers to "it" or "that" or "the previous result", look at the conversation history.</instruction>\n\n`;
  }

  const ragBlock = ragContext ? `${ragContext}\n\n` : '';
  let body = '';
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]!;
    const refNum = i + 1;
    body += `<source ref="${refNum}" name="${src.name}" results="${src.items}">\n`;
    body += JSON.stringify(src.data, null, 2);
    body += '\n</source>\n\n';
  }
  if (!body) body = '<source name="none" results="0">No sources returned data. Use general knowledge.</source>\n';

  const citationNote =
    sources.length > 0
      ? `\n<instruction>You have ${sources.length} source(s) above. Reference them inline using [1], [2], etc.</instruction>`
      : '';
  return prompt + ragBlock + body + citationNote;
}

export async function copilotChatHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{ sessionId?: string; query: string }>();
    const query = body.query?.trim();
    if (!query) return badRequest(c, 'query is required');
    if (query.length > 500) return badRequest(c, 'query too long (max 500 chars)');

    const db = c.env.BRIEFINGS_DB as D1Database | undefined;
    if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));

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

    const queryType = detectType(query) as QueryType;
    const [sources, liveSources] = await Promise.all([
      gatherSources(query.trim(), queryType),
      gatherLiveEnrichment(query.trim(), queryType, c.env),
    ]);
    const allSources = [...sources, ...liveSources];

    let ragContext: string | undefined;
    try {
      if (query.trim().length >= 5 && c.env.VECTORIZE) {
        const results = await queryCorpus(c.env, query.trim(), 8, undefined);
        if (results.length > 0) ragContext = formatRetrievedContext(results);
      }
    } catch {
      /* RAG is additive */
    }

    const confidence = computeConfidence({
      sourceIds: allSources.map((s) =>
        s.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      ),
      findingType:
        queryType === 'cve'
          ? 'vulnerability'
          : queryType === 'actor' || queryType === 'ransomware'
            ? 'attribution'
            : 'general',
    });

    const system = buildSystemPrompt(query.trim(), queryType, confidence);
    const user = buildChatUserPrompt(query.trim(), queryType, allSources, session.messages, ragContext);

    let narrative: string;
    let modelUsed: string;
    try {
      narrative = await callGroq(c.env, system, user);
      modelUsed = 'groq:llama-4-scout-17b-16e';
    } catch {
      narrative = await callWorkersAi(c.env, system, user);
      modelUsed = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    }

    const sourceData = allSources.map((s) => JSON.stringify(s.data)).join('\n');
    const validation = validateAiOutput(narrative, sourceData, { minWords: 50, requireCitations: false });
    narrative = validation.cleaned;

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: narrative,
      sources: allSources,
      query_type: queryType,
      model_used: modelUsed,
      confidence,
      processed_at: new Date().toISOString(),
    };

    session.messages.push({ role: 'user', content: query, query_type: queryType });
    session.messages.push(assistantMsg);

    const maxHistory = 20;
    if (session.messages.length > maxHistory) {
      session.messages = session.messages.slice(-maxHistory);
    }

    await saveSession(db, session);

    return c.json({
      sessionId: session.id,
      reply: narrative,
      query_type: queryType,
      sources: allSources,
      model_used: modelUsed,
      confidence,
      processed_at: assistantMsg.processed_at,
      history_length: session.messages.length,
    });
  } catch (e) {
    return internalError(c, e);
  }
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
    return internalError(c, e);
  }
}

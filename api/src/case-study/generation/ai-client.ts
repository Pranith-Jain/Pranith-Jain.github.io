/**
 * LLM client — Groq-only.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL: string = 'openai/gpt-oss-120b';
export const GROQ_MODEL_FALLBACK: string = 'llama-3.3-70b-versatile';
const GROQ_MODEL_DEEP: string = 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 15_000;

export interface CompletionInput {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionOutput {
  text: string;
  modelUsed: string;
}

export interface CompletionOpts {
  groqKey?: string;
  nvidiaKey?: string;
  googleKey?: string;
  quality?: boolean;
  role?: string;
  preferGroq?: boolean;
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function isRateLimited(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('context window') || msg.includes('5021') || (msg.includes('token') && msg.includes('exceeded'))) {
    return false;
  }
  return (
    msg.includes('rate') ||
    msg.includes('429') ||
    msg.includes('too many') ||
    msg.includes('limit') ||
    msg.includes('exceeded') ||
    msg.includes('quota') ||
    msg.includes('capacity')
  );
}

export function isAuthError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid key') ||
    msg.includes('api key invalid') ||
    msg.includes('authentication failed') ||
    msg.includes('not authorized') ||
    msg.includes('permission denied')
  );
}

async function runGroq(key: string, input: CompletionInput, model?: string): Promise<string> {
  let res: Response;
  try {
    const m = model ?? GROQ_MODEL;
    const isReasoning = m === GROQ_MODEL || m === GROQ_MODEL_DEEP;
    const body: Record<string, unknown> = {
      model: m,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      ...(isReasoning
        ? { max_completion_tokens: input.maxTokens ?? 4000, reasoning_effort: 'medium' }
        : { max_tokens: input.maxTokens ?? 4000 }),
      temperature: input.temperature ?? 0.5,
    };
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`groq request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 429) throw new RateLimitError('groq rate limited (429)');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`groq HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('groq empty response');
  return text;
}

export async function runCompletion(
  _ai: unknown,
  input: CompletionInput,
  opts: CompletionOpts = {}
): Promise<CompletionOutput> {
  const errors: string[] = [];
  const groqKey = opts.groqKey;
  if (!groqKey) throw new Error('GROQ_API_KEY not set');

  const groqModels = [GROQ_MODEL, GROQ_MODEL_FALLBACK, GROQ_MODEL_DEEP, 'llama-3.1-8b-instant'];
  for (const model of groqModels) {
    try {
      const text = await runGroq(groqKey, input, model);
      return { text, modelUsed: `groq:${model}` };
    } catch (err) {
      errors.push(`groq:${model}: ${err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80)}`);
      if (isAuthError(err)) break;
    }
  }

  throw new Error(`All LLM providers exhausted. Errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
}

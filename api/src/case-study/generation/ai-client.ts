import type { Ai } from '@cloudflare/workers-types';

/**
 * Case-study LLM client.
 *
 * Provider order:
 *   1. Groq free tier (own quota, fast, good long-form) — used when a
 *      GROQ_API_KEY is configured. This is the durable fix for the
 *      Workers-AI free-quota exhaustion that was throwing `publish_failed`.
 *   2. Workers AI (no key) — graceful fallback, two models only.
 *
 * Rate-limit handling (the root-cause fix): a quota/"exceeded"/429 error is
 * account-wide — retrying with back-off or walking more same-account models
 * just deepens the limit and burns ~60-90s before still failing. So we
 * FAIL FAST on a rate-limit: surface a clear RateLimitError and let the
 * hourly publisher cron retry once the quota window resets, instead of
 * hammering it. Non-rate errors (e.g. a bad model id) still fall through.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_TIMEOUT_MS = 30_000;

// Workers-AI fallback chain (no key). Kept to two models — under an
// account-wide rate limit, more models don't help and only add load.
const WORKERS_AI_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'] as const;

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
  /** Groq API key; when present Groq is tried first. */
  groqKey?: string;
}

/** Distinct type so callers (publisher/cron) can treat quota as "defer & retry later". */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function isRateLimited(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  // A context-window / token-budget overflow is DETERMINISTIC, not a
  // transient rate-limit — deferring/retrying never helps (it's the prompt
  // size). Classify it out so it isn't mis-handled as quota. (The prompt
  // clamp in templates.ts is the actual prevention; this is defense-in-depth
  // + accurate logs.)
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

async function runGroq(key: string, input: CompletionInput): Promise<string> {
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens ?? 3000,
        temperature: input.temperature ?? 0.4,
      }),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`groq request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 429) throw new RateLimitError('groq rate limited (429)');
  if (!res.ok) throw new Error(`groq HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('groq empty response');
  return text;
}

/** Single Workers-AI attempt — NO back-off retry (see file header). */
async function runWorkersModel(ai: Ai, model: string, input: CompletionInput): Promise<string> {
  const res = (await ai.run(
    model as any,
    {
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_tokens: input.maxTokens ?? 3000,
      temperature: input.temperature ?? 0.4,
    } as any
  )) as { response?: string };
  if (!res || typeof res.response !== 'string' || !res.response.trim()) {
    throw new Error(`Empty response from ${model}`);
  }
  return res.response;
}

export async function runCompletion(
  ai: Ai,
  input: CompletionInput,
  opts: CompletionOpts = {}
): Promise<CompletionOutput> {
  // 1. Groq primary (own quota + quality) when configured.
  if (opts.groqKey) {
    try {
      const text = await runGroq(opts.groqKey, input);
      return { text, modelUsed: `groq:${GROQ_MODEL}` };
    } catch (err) {
      if (isRateLimited(err)) {
        console.warn('runCompletion: groq rate-limited, falling back to Workers AI', err);
      } else {
        console.warn('runCompletion: groq failed, falling back to Workers AI', err);
      }
      // fall through to Workers AI
    }
  }

  // 2. Workers-AI fallback. FAIL FAST on a rate-limit — it's account-wide,
  // so trying the next model (same account) is futile and just deepens it.
  let lastErr: unknown;
  for (let i = 0; i < WORKERS_AI_MODELS.length; i += 1) {
    const model = WORKERS_AI_MODELS[i]!;
    try {
      const text = await runWorkersModel(ai, model, input);
      return { text, modelUsed: model };
    } catch (err) {
      lastErr = err;
      if (isRateLimited(err)) {
        throw new RateLimitError(
          `AI rate-limited/quota exceeded (${model}) — deferring; the hourly publisher cron will retry. ` +
            `Configure GROQ_API_KEY to use Groq's separate free quota. Detail: ${
              err instanceof Error ? err.message : String(err)
            }`
        );
      }
      if (i < WORKERS_AI_MODELS.length - 1) {
        console.warn(`runCompletion: ${model} failed (non-rate), trying ${WORKERS_AI_MODELS[i + 1]}`, err);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

import type { Ai } from '@cloudflare/workers-types';

/**
 * Case-study LLM client.
 *
 * Model selection (v2 — Qwen3-32B primary):
 *   Qwen3-32B is the best model for content writing on Groq:
 *   - 32.8B params, optimized for creative writing (23% of training data)
 *   - 82.08 WritingBench score
 *   - 60 RPM (highest rate limit on Groq)
 *   - 500K context window
 *   - Thinking mode (reasoning_effort) for deep blog analysis
 *   - Non-thinking mode for fast social content generation
 *
 *   Qwen3's thinking/non-thinking dual mode is the perfect fit:
 *   quality=true → thinking mode (blog posts, deep analysis)
 *   quality=false → non-thinking mode (social posts, fast generation)
 *
 * Provider order:
 *   1. Google AI Studio (Gemini) — own quota, free tier up to 1000 RPM,
 *      used when GOOGLE_AI_STUDIO_API_KEY is configured.
 *   2. Groq free tier (own quota, fast, good long-form) — used when a
 *      GROQ_API_KEY is configured.
 *   3. Workers AI (no key) — graceful fallback, two models only.
 *
 * Groq fallback chain: Qwen3-32B → GPT-OSS-120B → Workers AI.
 * Workers AI fallback: Llama-3.3-70B → Qwen3-30B-A3B → Llama-3.1-8B.
 *
 * Rate-limit handling (the root-cause fix): a quota/"exceeded"/429 error is
 * account-wide — retrying with back-off or walking more same-account models
 * just deepens the limit and burns ~60-90s before still failing. So we
 * FAIL FAST on a rate-limit: surface a clear RateLimitError and let the
 * hourly publisher cron retry once the quota window resets, instead of
 * hammering it. Non-rate errors (e.g. a bad model id) still fall through.
 */

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GOOGLE_MODEL = 'gemini-2.5-flash';
const GOOGLE_MODEL_FALLBACK = 'gemini-2.0-flash';
const GOOGLE_MODEL_QUALITY = 'gemini-2.5-pro';
const GOOGLE_MODEL_QUALITY_FALLBACK = 'gemini-2.0-pro';
const GOOGLE_TIMEOUT_MS = 30_000;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** Default model — Qwen3-32B (non-thinking mode). Best for social / fast generation. */
const GROQ_MODEL: string = 'qwen/qwen3-32b';
/**
 * Quality model — same Qwen3-32B but with reasoning_effort (thinking mode).
 * Produces deeper, more analytical blog content.
 */
const GROQ_MODEL_QUALITY: string = 'qwen/qwen3-32b';
/** Fallback when Qwen3-32B fails. */
const GROQ_MODEL_FALLBACK: string = 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 30_000;

// Workers-AI fallback chain (no key). Kept to two models — under an
// account-wide rate limit, more models don't help and only add load.
const WORKERS_AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/meta/llama-3.1-8b-instruct',
] as const;

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
  /** Groq API key; when present Groq is tried after Google (if configured). */
  groqKey?: string;
  /** Google AI Studio (Gemini) API key; when present Gemini is tried first. */
  googleKey?: string;
  /** Use the higher-quality model for synthesis. */
  quality?: boolean;
  /**
   * Try Groq BEFORE Google. Used by social content generation so Groq's
   * Qwen3-32B (thinking/non-thinking) runs before Gemini — Gemini/Workers AI
   * stay as fallback.
   */
  preferGroq?: boolean;
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

async function callGoogleModel(key: string, model: string, input: CompletionInput): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${GOOGLE_BASE}/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: [{ text: input.user }] }],
        generationConfig: {
          maxOutputTokens: input.maxTokens ?? 4000,
          temperature: input.temperature ?? 0.5,
        },
      }),
    });
  } catch (err) {
    throw new Error(`google request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 429) throw new RateLimitError('google rate limited (429)');
  if (!res.ok) return null;
  const j = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) return null;
  return text;
}

async function runGoogle(
  key: string,
  input: CompletionInput,
  quality?: boolean
): Promise<{ text: string; model: string }> {
  const primary = quality ? GOOGLE_MODEL_QUALITY : GOOGLE_MODEL;
  const fallback = quality ? GOOGLE_MODEL_QUALITY_FALLBACK : GOOGLE_MODEL_FALLBACK;
  const result = await callGoogleModel(key, primary, input);
  if (result) return { text: result, model: primary };
  const fallbackResult = await callGoogleModel(key, fallback, input);
  if (fallbackResult) return { text: fallbackResult, model: fallback };
  throw new Error(`google models unavailable (${primary}, ${fallback})`);
}

async function runGroq(key: string, input: CompletionInput, model?: string, quality?: boolean): Promise<string> {
  let res: Response;
  try {
    const body: Record<string, unknown> = {
      model: model ?? GROQ_MODEL,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_completion_tokens: input.maxTokens ?? 4000,
      temperature: input.temperature ?? 0.5,
    };
    // Qwen3-32B supports reasoning_effort (thinking mode).
    // quality=true → thinking mode for deep blog analysis
    // quality=false → non-thinking mode for fast social generation
    if (quality) {
      body.reasoning_effort = 'medium';
    }
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
  if (!res.ok) throw new Error(`groq HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('groq empty response');
  return text;
}

/** Single Workers-AI attempt — NO back-off retry (see file header). */
async function runWorkersModel(ai: Ai, model: string, input: CompletionInput): Promise<string> {
  const res = (await ai.run(
    model as Parameters<typeof ai.run>[0],
    {
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_tokens: input.maxTokens ?? 4000,
      temperature: input.temperature ?? 0.5,
    } as Parameters<typeof ai.run>[1]
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
  // Google + Groq attempts as closures so the order can be swapped. Default is
  // Google → Groq (case-study generation); AI-summary surfaces pass
  // opts.preferGroq to run Groq before Google ("prefer Groq").
  const tryGoogle = async (): Promise<CompletionOutput | null> => {
    if (!opts.googleKey) return null;
    try {
      const googleResult = await runGoogle(opts.googleKey, input, opts.quality);
      return { text: googleResult.text, modelUsed: `google:${googleResult.model}` };
    } catch (err) {
      if (isRateLimited(err)) {
        // Own quota separate from Groq/Workers AI, so the others may still work.
        console.warn('runCompletion: google rate-limited, falling through', err);
      } else {
        console.warn('runCompletion: google failed, falling through', err);
      }
      return null;
    }
  };

  const tryGroq = async (): Promise<CompletionOutput | null> => {
    if (!opts.groqKey) return null;
    const model = opts.quality ? GROQ_MODEL_QUALITY : GROQ_MODEL;
    try {
      const text = await runGroq(opts.groqKey, input, model, opts.quality);
      return { text, modelUsed: `groq:${model}${opts.quality ? '+thinking' : ''}` };
    } catch (err) {
      // If Qwen3-32B failed, try GPT-OSS-120B fallback before Workers AI.
      if (model !== GROQ_MODEL_FALLBACK) {
        try {
          const text = await runGroq(opts.groqKey, input, GROQ_MODEL_FALLBACK, false);
          return { text, modelUsed: `groq:${GROQ_MODEL_FALLBACK}` };
        } catch {
          /* fallback also failed, fall through to Workers AI */
        }
      }
      if (isRateLimited(err)) {
        console.warn('runCompletion: groq rate-limited, falling back to Workers AI', err);
      } else {
        console.warn('runCompletion: groq failed, falling back to Workers AI', err);
      }
      return null;
    }
  };

  // 1+2. Try the two keyed providers in the configured order.
  const order = opts.preferGroq ? [tryGroq, tryGoogle] : [tryGoogle, tryGroq];
  for (const attempt of order) {
    const result = await attempt();
    if (result) return result;
  }

  // 3. Workers-AI fallback. FAIL FAST on a rate-limit — it's account-wide,
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

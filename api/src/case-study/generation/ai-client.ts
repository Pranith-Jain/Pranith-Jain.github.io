/**
 * Case-study LLM client.
 *
 * Keyed providers only — NVIDIA (first), Groq, Google. No Workers AI
 * fallback (free quota exhausted). If all keyed providers fail the
 * call throws with the last error.
 *
 * Provider order:
 *   1. NVIDIA build.nvidia.com (free tier, 40 RPM, 1000 credits, no CC) —
 *      used when NVIDIA_API_KEY is configured. OpenAI-compatible endpoint.
 *   2. Groq free tier (own quota, fast, Qwen3-32B) — used when a
 *      GROQ_API_KEY is configured.
 *   3. Google AI Studio (Gemini) — own quota, free tier up to 1000 RPM,
 *      used when GOOGLE_AI_STUDIO_API_KEY is configured.
 *
 * NVIDIA fallback: MiniMax M2.7 → GLM-5.2 (both free on NVIDIA).
 * Groq fallback: Qwen3-32B (thinking/non-thinking) → Llama 4 Scout.
 *
 * Rate-limit handling: a quota/"exceeded"/429 error is account-wide —
 * retrying deepens the limit. FAIL FAST on rate-limit (RateLimitError).
 * Non-rate errors (e.g. a bad model id) still fall through to next
 * provider.
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
 * Quality model — Qwen3-32B with thinking mode. Excellent for analytical/
 * reasoning tasks (82 WritingBench score, 500K context). Falls back to
 * non-thinking Qwen3-32B then Llama 4 Scout.
 */
const GROQ_MODEL_QUALITY: string = 'qwen/qwen3-32b';
/**
 * Fallback when the quality Qwen3-32B is rate-limited or unavailable.
 * Llama 4 Scout (17B, 16 MoE experts) has generous TPM limits.
 */
const GROQ_MODEL_FALLBACK: string = 'llama-4-scout-17b-16e-instruct';
const GROQ_TIMEOUT_MS = 30_000;

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'minimaxai/minimax-m2.7';
const NVIDIA_MODEL_FALLBACK = 'z-ai/glm-5.2';
const NVIDIA_TIMEOUT_MS = 30_000;

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
  /** NVIDIA build.nvidia.com API key; tried first. */
  nvidiaKey?: string;
  /** Use the higher-quality model for synthesis. */
  quality?: boolean;
  /** @deprecated NVIDIA is now always tried first; this option is a no-op. */
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
    // Qwen3-32B supports reasoning_effort for thinking mode. For quality
    // mode use 'default' (the Groq API accepts 'none' or 'default').
    if (quality && model === GROQ_MODEL_QUALITY) {
      body.reasoning_effort = 'default';
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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`groq HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('groq empty response');
  return text;
}

async function runNvidia(key: string, input: CompletionInput, model: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(NVIDIA_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens ?? 4000,
        temperature: input.temperature ?? 0.5,
      }),
      signal: AbortSignal.timeout(NVIDIA_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`nvidia request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 429) throw new RateLimitError('nvidia rate limited (429)');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`nvidia HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('nvidia empty response');
  return text;
}

export async function runCompletion(
  _ai: unknown,
  input: CompletionInput,
  opts: CompletionOpts = {}
): Promise<CompletionOutput> {
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
    const primaryModel = opts.quality ? GROQ_MODEL_QUALITY : GROQ_MODEL;
    try {
      const text = await runGroq(opts.groqKey, input, primaryModel, opts.quality);
      return { text, modelUsed: `groq:${primaryModel}${opts.quality ? '+quality' : ''}` };
    } catch (err) {
      // If quality Qwen3-32B with thinking mode failed, try without reasoning_effort.
      if (opts.quality) {
        try {
          const text = await runGroq(opts.groqKey, input, GROQ_MODEL, false);
          return { text, modelUsed: `groq:${GROQ_MODEL}` };
        } catch (e2) {
          console.warn('runCompletion: groq quality→non-thinking fallback failed', e2);
        }
      }
      // Try generic fallback before Google/Workers AI.
      try {
        const text = await runGroq(opts.groqKey, input, GROQ_MODEL_FALLBACK, false);
        return { text, modelUsed: `groq:${GROQ_MODEL_FALLBACK}` };
      } catch (e3) {
        console.warn('runCompletion: groq generic fallback failed', e3);
      }
      if (isRateLimited(err)) {
        console.warn('runCompletion: groq rate-limited, falling through', err);
      } else {
        console.warn('runCompletion: groq failed, falling through', err);
      }
      return null;
    }
  };

  // 3. Add tryNvidia closure.
  const tryNvidiaClosure = async (): Promise<CompletionOutput | null> => {
    if (!opts.nvidiaKey) return null;
    try {
      const text = await runNvidia(opts.nvidiaKey, input, NVIDIA_MODEL);
      return { text, modelUsed: `nvidia:${NVIDIA_MODEL}` };
    } catch (err) {
      if (isRateLimited(err)) {
        console.warn('runCompletion: nvidia rate-limited, falling through', err);
      } else {
        try {
          const text = await runNvidia(opts.nvidiaKey, input, NVIDIA_MODEL_FALLBACK);
          return { text, modelUsed: `nvidia:${NVIDIA_MODEL_FALLBACK}` };
        } catch (e2) {
          console.warn('runCompletion: nvidia fallback model failed too', e2);
        }
      }
      return null;
    }
  };

  // Try keyed providers in order: NVIDIA → Groq → Google.
  const keyedOrder = [tryNvidiaClosure, tryGroq, tryGoogle];
  for (const attempt of keyedOrder) {
    const result = await attempt();
    if (result) return result;
  }

  // All keyed providers exhausted — surface the last error or a clear message.
  throw new Error(
    'All LLM providers exhausted. Configure at least NVIDIA_API_KEY or GROQ_API_KEY as a wrangler secret.'
  );
}

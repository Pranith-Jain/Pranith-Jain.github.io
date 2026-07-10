/**
 * Case-study LLM client.
 *
 * Provider order (free / cheap APIs only, no hard dependency on any one):
 *   1. Groq — primary provider. Fastest inference.
 *        quality=false → GPT OSS 120B.
 *        quality=true → GPT OSS 120B (same; it is a quality model).
 *        Fallback chain: 120B → Llama 3.3 70B → deepseek-r1.
 *   2. NVIDIA build.nvidia.com — keyed fallback.
 *        Primary: MiniMax M2.7 → fallback: GLM-5.2.
 *   3. Workers AI (env.AI binding) — no key needed, never rate-limited.
 *        Fallback chain: llama-3.1-8b → llama-3-8b → mistral-7b.
 *   4. Google Gemini — last-resort keyed fallback (API-key deprecated, may 401).
 *
 * Rate-limit / auth errors on a provider skip its fallback chain (same key,
 * same quota pool). Timeouts still try the fallback model.
 */

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GOOGLE_MODEL = 'gemini-2.5-flash';
const GOOGLE_MODEL_FALLBACK = 'gemini-2.0-flash';
const GOOGLE_MODEL_QUALITY = 'gemini-2.5-pro';
const GOOGLE_MODEL_QUALITY_FALLBACK = 'gemini-2.0-pro';
const GOOGLE_TIMEOUT_MS = 10_000;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL: string = 'openai/gpt-oss-120b';
const GROQ_MODEL_QUALITY: string = 'openai/gpt-oss-120b';
export const GROQ_MODEL_FALLBACK: string = 'llama-3.3-70b-versatile';
const GROQ_MODEL_DEEP: string = 'deepseek-r1-distill-llama-70b';
const GROQ_TIMEOUT_MS = 15_000;

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'minimaxai/minimax-m2.7';
const NVIDIA_MODEL_FALLBACK = 'z-ai/glm-5.2';
const NVIDIA_TIMEOUT_MS = 5_000;

const WA_MODELS = [
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3-8b-instruct',
  '@cf/mistral/mistral-7b-instruct-v0.1',
  '@hf/meta-llama/meta-llama-3-8b-instruct',
  '@cf/meta/llama-3.2-3b-instruct',
];

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
): Promise<{ text: string; model: string } | null> {
  const primary = quality ? GOOGLE_MODEL_QUALITY : GOOGLE_MODEL;
  const fallback = quality ? GOOGLE_MODEL_QUALITY_FALLBACK : GOOGLE_MODEL_FALLBACK;
  const result = await callGoogleModel(key, primary, input);
  if (result) return { text: result, model: primary };
  const fallbackResult = await callGoogleModel(key, fallback, input);
  if (fallbackResult) return { text: fallbackResult, model: fallback };
  return null;
}

async function runGroq(key: string, input: CompletionInput, model?: string, _quality?: boolean): Promise<string> {
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

interface WorkersAiHandle {
  run: (model: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

async function tryWorkersAiModel(
  handle: WorkersAiHandle,
  model: string,
  input: CompletionInput,
  tag: string
): Promise<{ text: string; model: string } | null> {
  try {
    const result = await handle.run(model, {
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_tokens: input.maxTokens ?? 4000,
      temperature: input.temperature ?? 0.5,
    });
    const text = (result?.response ?? result?.text ?? '') as string;
    if (typeof text === 'string' && text.trim()) {
      const shortName = model.split('/').pop() ?? model;
      return { text, model: `workers-ai:${shortName}` };
    }
    return null;
  } catch (e) {
    console.warn(`${tag} workers-ai model ${model} failed`, e);
    return null;
  }
}

export async function runCompletion(
  ai: unknown,
  input: CompletionInput,
  opts: CompletionOpts = {}
): Promise<CompletionOutput> {
  const tag = opts.role ? `[${opts.role}]` : '[llm]';
  const errors: string[] = [];

  // Estimate prompt size. Groq's quality model (Llama 3.3 70B) supports 128K
  // context. Skip only if the prompt is truly excessive (50K+ chars).
  const estimatedPromptSize = input.system.length + input.user.length;
  const groqLikelyOversize = estimatedPromptSize > 50_000;

  // ── 1. Groq (primary) — skip if prompt is too large for 8K-32K context ─
  const tryGroq = async (): Promise<CompletionOutput | null> => {
    if (groqLikelyOversize) {
      errors.push(
        `groq: skipped — prompt ~${Math.round(estimatedPromptSize / 1000)}K chars exceeds small context windows`
      );
      return null;
    }
    if (!opts.groqKey) {
      errors.push('groq: no key');
      return null;
    }
    const primaryModel = opts.quality ? GROQ_MODEL_QUALITY : GROQ_MODEL;
    try {
      const text = await runGroq(opts.groqKey, input, primaryModel, opts.quality);
      return { text, modelUsed: `groq:${primaryModel}${opts.quality ? '+quality' : ''}` };
    } catch (err) {
      errors.push(
        `groq:${primaryModel}: ${err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80)}`
      );
      if (isAuthError(err)) return null;
      if (opts.quality) {
        try {
          const text = await runGroq(opts.groqKey, input, GROQ_MODEL, false);
          return { text, modelUsed: `groq:${GROQ_MODEL}` };
        } catch (e2) {
          errors.push(`groq:${GROQ_MODEL}: ${e2 instanceof Error ? e2.message.slice(0, 80) : String(e2).slice(0, 80)}`);
        }
      }
      try {
        const text = await runGroq(opts.groqKey, input, GROQ_MODEL_FALLBACK, false);
        return { text, modelUsed: `groq:${GROQ_MODEL_FALLBACK}` };
      } catch (e3) {
        errors.push(
          `groq:${GROQ_MODEL_FALLBACK}: ${e3 instanceof Error ? e3.message.slice(0, 80) : String(e3).slice(0, 80)}`
        );
      }
      try {
        const text = await runGroq(opts.groqKey, input, GROQ_MODEL_DEEP, false);
        return { text, modelUsed: `groq:${GROQ_MODEL_DEEP}` };
      } catch (e4) {
        errors.push(
          `groq:${GROQ_MODEL_DEEP}: ${e4 instanceof Error ? e4.message.slice(0, 80) : String(e4).slice(0, 80)}`
        );
      }
      return null;
    }
  };

  // ── 2. NVIDIA (keyed fallback) ───────────────────────────────────────
  const tryNvidia = async (): Promise<CompletionOutput | null> => {
    if (!opts.nvidiaKey) {
      errors.push('nvidia: no key');
      return null;
    }
    try {
      const text = await runNvidia(opts.nvidiaKey, input, NVIDIA_MODEL);
      return { text, modelUsed: `nvidia:${NVIDIA_MODEL}` };
    } catch (err) {
      errors.push(
        `nvidia:${NVIDIA_MODEL}: ${err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80)}`
      );
      if (isAuthError(err) || isRateLimited(err)) return null;
      try {
        const text = await runNvidia(opts.nvidiaKey, input, NVIDIA_MODEL_FALLBACK);
        return { text, modelUsed: `nvidia:${NVIDIA_MODEL_FALLBACK}` };
      } catch (e2) {
        errors.push(
          `nvidia:${NVIDIA_MODEL_FALLBACK}: ${e2 instanceof Error ? e2.message.slice(0, 80) : String(e2).slice(0, 80)}`
        );
      }
      return null;
    }
  };

  // ── 3. Workers AI (no key needed) ────────────────────────────────────
  const tryWorkersAiFn = async (): Promise<CompletionOutput | null> => {
    if (!ai || typeof ai !== 'object') {
      errors.push('workers-ai: binding unavailable');
      return null;
    }
    const handle = ai as WorkersAiHandle;
    for (const model of WA_MODELS) {
      const result = await tryWorkersAiModel(handle, model, input, tag);
      if (result) return { text: result.text, modelUsed: result.model };
    }
    errors.push('workers-ai: all models failed');
    return null;
  };

  // ── 4. Google Gemini (last resort) ───────────────────────────────────
  const tryGoogle = async (): Promise<CompletionOutput | null> => {
    if (!opts.googleKey) {
      errors.push('google: no key');
      return null;
    }
    try {
      const result = await runGoogle(opts.googleKey, input, opts.quality);
      if (result) return { text: result.text, modelUsed: `google:${result.model}` };
      errors.push('google: models unavailable');
      return null;
    } catch (err) {
      errors.push(`google: ${err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80)}`);
      return null;
    }
  };

  // Try providers in order
  const providers = [tryGroq, tryNvidia, tryWorkersAiFn, tryGoogle];
  for (const attempt of providers) {
    const result = await attempt();
    if (result) return result;
  }

  throw new Error(`All LLM providers exhausted. Errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
}

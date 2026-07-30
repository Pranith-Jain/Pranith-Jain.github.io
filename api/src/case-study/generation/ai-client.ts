/**
 * LLM client — multi-provider with fallback chain: Infron → Groq → Google Gemini → NVIDIA.
 *
 * Infron (https://infron.ai) is the DEFAULT provider — an OpenAI-compatible
 * routing platform with free models (sapiens/agnes-2.0-flash:free for agent
 * workflows, deepseek/deepseek-v4-flash:free for summaries). Groq is the
 * fallback when Infron is unavailable or rate-limited.
 */

const INFRON_URL = 'https://llm.onerouter.pro/v1/chat/completions';
// Agnes-2.0-Flash: no stated daily limit, tool calling + JSON mode, ranked 9th
// on Claw-Eval for agent capabilities. Best default for agent + general use.
const INFRON_MODEL: string = 'sapiens/agnes-2.0-flash:free';
// DeepSeek V4 Flash: fast, strong reasoning — used for quality/summary calls.
const INFRON_MODEL_QUALITY: string = 'deepseek/deepseek-v4-flash:free';
// Llama 3.2 11B Vision: 200 req/day, reliable fallback within Infron.
const INFRON_MODEL_FALLBACK: string = 'meta/llama-3.2-11b-vision-instruct:free';
const INFRON_TIMEOUT_MS = 20_000;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL: string = 'openai/gpt-oss-120b';
export const GROQ_MODEL_FALLBACK: string = 'llama-3.3-70b-versatile';
const GROQ_MODEL_DEEP: string = 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 15_000;

const GOOGLE_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 20_000;

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';
const NVIDIA_TIMEOUT_MS = 20_000;

// Provider health tracking — imported dynamically to avoid circular deps
let _providerHealth: typeof import('../../lib/agent/provider-health') | null = null;
async function getProviderHealth() {
  if (!_providerHealth) {
    try {
      _providerHealth = await import('../../lib/agent/provider-health');
    } catch {
      /* optional */
    }
  }
  return _providerHealth;
}

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
  infronKey?: string;
  groqKey?: string;
  nvidiaKey?: string;
  googleKey?: string;
  quality?: boolean;
  role?: string;
  preferGroq?: boolean;
  /** Skip directly to a specific provider (e.g. 'gemini' for large-context QA). */
  preferProvider?: 'infron' | 'groq' | 'gemini' | 'nvidia';
  /** With preferProvider: use ONLY that provider, no fall-through. Used by the
   *  ensemble QA so each parallel call makes exactly one provider fetch instead
   *  of walking the whole chain (keeps subrequests bounded on the free plan). */
  exclusiveProvider?: boolean;
  /** Invoked on success with the model + prompt/response text for cost tracking. */
  recordUsage?: (model: string, inputText: string, outputText: string, role: string) => void;
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

/**
 * A 413 / "request too large" means THIS prompt exceeds the model's input
 * window — it is NOT a provider-health signal. Distinguished so the circuit
 * breaker isn't tripped by one oversized prompt (which would wrongly skip the
 * provider for every subsequent, possibly smaller, request).
 */
export function isRequestTooLarge(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('413') || msg.includes('too large') || msg.includes('request too large');
}

// ── Workers AI fallback ─────────────────────────────────────────────────
// Always available on the Worker (no external API key, no shared quota) and
// large-context, so it neither 413s on a big prompt nor trips the same rate
// limits as the external providers. The last line of defence when Groq,
// Gemini, and NVIDIA are all rate-limited / circuit-broken / oversized /
// timed out. Model order mirrors the proven chain in routes/agent.ts.
const WORKERS_AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/openai/gpt-oss-120b',
  '@cf/meta/llama-3.1-8b-instruct',
];

interface WorkersAiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

function isWorkersAi(ai: unknown): ai is WorkersAiBinding {
  return !!ai && typeof ai === 'object' && typeof (ai as { run?: unknown }).run === 'function';
}

async function runWorkersAI(ai: WorkersAiBinding, input: CompletionInput): Promise<{ text: string; model: string }> {
  let lastErr = 'no model attempted';
  for (const model of WORKERS_AI_MODELS) {
    try {
      const res = (await ai.run(model, {
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens ?? 4000,
        temperature: input.temperature ?? 0.5,
      })) as { response?: string; choices?: Array<{ message?: { content?: string } }> };
      const text =
        (typeof res?.response === 'string' ? res.response : undefined) ?? res?.choices?.[0]?.message?.content;
      if (typeof text === 'string' && text.trim()) return { text, model };
      lastErr = `${model}: empty response`;
    } catch (err) {
      lastErr = `${model}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`runWorkersAI ${lastErr.slice(0, 200)}`);
    }
  }
  throw new Error(`workers-ai exhausted: ${lastErr}`);
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`runGroq request failed: ${msg}`);
    throw new Error(`groq request failed: ${msg}`);
  }
  if (res.status === 429) {
    console.error('runGroq rate limited (429)');
    throw new RateLimitError('groq rate limited (429)');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const msg = `groq HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`;
    console.error(`runGroq ${msg}`);
    throw new Error(msg);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('groq empty response');
  return text;
}

async function runInfron(key: string, input: CompletionInput, model: string): Promise<string> {
  let res: Response;
  try {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_tokens: input.maxTokens ?? 4000,
      temperature: input.temperature ?? 0.5,
    };
    res = await fetch(INFRON_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INFRON_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`runInfron request failed: ${msg}`);
    throw new Error(`infron request failed: ${msg}`);
  }
  if (res.status === 429) {
    console.error('runInfron rate limited (429)');
    throw new RateLimitError('infron rate limited (429)');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const msg = `infron HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`;
    console.error(`runInfron ${msg}`);
    throw new Error(msg);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('infron empty response');
  return text;
}

async function runGemini(key: string, input: CompletionInput): Promise<string> {
  const url = `${GOOGLE_GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${key}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${input.system}\n\n${input.user}` }] }],
        generationConfig: {
          maxOutputTokens: input.maxTokens ?? 4000,
          temperature: input.temperature ?? 0.5,
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`gemini HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
    const j = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) throw new Error('gemini empty response');
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`runGemini failed: ${msg.slice(0, 200)}`);
    throw new Error(`gemini failed: ${msg}`);
  }
}

async function runNvidia(key: string, input: CompletionInput): Promise<string> {
  try {
    const res = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens ?? 4000,
        temperature: input.temperature ?? 0.5,
      }),
      signal: AbortSignal.timeout(NVIDIA_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`nvidia HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('nvidia empty response');
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`runNvidia failed: ${msg.slice(0, 200)}`);
    throw new Error(`nvidia failed: ${msg}`);
  }
}

export async function runCompletion(
  _ai: unknown,
  input: CompletionInput,
  opts: CompletionOpts = {}
): Promise<CompletionOutput> {
  const errors: string[] = [];
  const infronKey = opts.infronKey;
  const groqKey = opts.groqKey;
  const health = await getProviderHealth();
  const inputText = `${input.system}\n${input.user}`;
  const usageRole = opts.role ?? 'completion';

  // Build provider order. Infron is the DEFAULT (free models, agent-optimized).
  // preferGroq bumps Groq ahead of Infron for callers that specifically want
  // Groq's streaming/reasoning (synthesizer, ai-summary). preferProvider
  // overrides the whole order.
  const allProviders = ['infron', 'groq', 'gemini', 'nvidia'] as const;
  const providers: Array<(typeof allProviders)[number]> = opts.preferProvider
    ? opts.exclusiveProvider
      ? [opts.preferProvider]
      : [opts.preferProvider, ...allProviders.filter((p) => p !== opts.preferProvider)]
    : opts.preferGroq
      ? ['groq', 'infron', 'gemini', 'nvidia']
      : ['infron', 'groq', 'gemini', 'nvidia'];

  for (const provider of providers) {
    // Skip providers that are rate-limited or circuit-broken
    if (health && !(await health.isProviderHealthy(provider))) {
      errors.push(`${provider}: skipped (rate-limited or circuit-broken)`);
      continue;
    }

    if (provider === 'infron' && infronKey) {
      // Quality calls (briefing summaries, landscape reports) use DeepSeek V4
      // Flash for stronger reasoning; default calls use Agnes-2.0-Flash for
      // agent/tool-calling workflows. Fallback to Llama 3.2 Vision (200/day).
      const infronModels = opts.quality
        ? [INFRON_MODEL_QUALITY, INFRON_MODEL, INFRON_MODEL_FALLBACK]
        : [INFRON_MODEL, INFRON_MODEL_FALLBACK, INFRON_MODEL_QUALITY];
      for (const model of infronModels) {
        const startMs = Date.now();
        try {
          const text = await runInfron(infronKey, input, model);
          if (health) await health.recordSuccess('infron', Date.now() - startMs);
          opts.recordUsage?.(`infron:${model}`, inputText, text, usageRole);
          return { text, modelUsed: `infron:${model}` };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`runCompletion infron:${model} failed: ${errMsg.slice(0, 200)}`);
          errors.push(`infron:${model}: ${errMsg.slice(0, 80)}`);
          if (isRequestTooLarge(err)) break;
          if (health) await health.recordFailure('infron', isRateLimited(err));
          if (isAuthError(err)) break;
        }
      }
    } else if (provider === 'groq' && groqKey) {
      const groqModels = [GROQ_MODEL, GROQ_MODEL_FALLBACK, GROQ_MODEL_DEEP, 'llama-3.1-8b-instant'];
      for (const model of groqModels) {
        const startMs = Date.now();
        try {
          const text = await runGroq(groqKey, input, model);
          if (health) await health.recordSuccess('groq', Date.now() - startMs);
          opts.recordUsage?.(`groq:${model}`, inputText, text, usageRole);
          return { text, modelUsed: `groq:${model}` };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`runCompletion groq:${model} failed: ${errMsg.slice(0, 200)}`);
          errors.push(`groq:${model}: ${errMsg.slice(0, 80)}`);
          // A 413 means THIS prompt is too big for Groq's models — the remaining
          // Groq models will also 413 on the same input, and it isn't a provider-
          // health signal, so bail without tripping the circuit breaker (which
          // would wrongly skip Groq for later, smaller requests). Fall through to
          // gemini/nvidia/workers-ai, which have larger input windows.
          if (isRequestTooLarge(err)) break;
          if (health) await health.recordFailure('groq', isRateLimited(err));
          if (isAuthError(err)) break;
        }
      }
    } else if (provider === 'gemini' && opts.googleKey) {
      const startMs = Date.now();
      try {
        const text = await runGemini(opts.googleKey, input);
        if (health) await health.recordSuccess('gemini', Date.now() - startMs);
        opts.recordUsage?.(`gemini:${GEMINI_MODEL}`, inputText, text, usageRole);
        return { text, modelUsed: `gemini:${GEMINI_MODEL}` };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`runCompletion gemini failed: ${errMsg.slice(0, 200)}`);
        errors.push(`gemini: ${errMsg.slice(0, 80)}`);
        if (health) await health.recordFailure('gemini', isRateLimited(err));
      }
    } else if (provider === 'nvidia' && opts.nvidiaKey) {
      const startMs = Date.now();
      try {
        const text = await runNvidia(opts.nvidiaKey, input);
        if (health) await health.recordSuccess('nvidia', Date.now() - startMs);
        opts.recordUsage?.(`nvidia:${NVIDIA_MODEL}`, inputText, text, usageRole);
        return { text, modelUsed: `nvidia:${NVIDIA_MODEL}` };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`runCompletion nvidia failed: ${errMsg.slice(0, 200)}`);
        errors.push(`nvidia: ${errMsg.slice(0, 80)}`);
        if (health) await health.recordFailure('nvidia', isRateLimited(err));
      }
    }
  }

  // Final fallback: Workers AI — always available on the Worker, large-context
  // (won't 413 on a big LinkedIn prompt), and not subject to the external
  // providers' rate limits. This is what closes the
  // "All LLM providers exhausted" failure when Groq/Gemini/NVIDIA are all
  // rate-limited, circuit-broken, oversized, or timed out.
  if (isWorkersAi(_ai)) {
    try {
      const { text, model } = await runWorkersAI(_ai, input);
      opts.recordUsage?.(`workers-ai:${model.split('/').pop()}`, inputText, text, usageRole);
      return { text, modelUsed: `workers-ai:${model.split('/').pop()}` };
    } catch (err) {
      errors.push(`workers-ai: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`);
    }
  }

  throw new Error(`All LLM providers exhausted. Errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
}

// ── Streaming ────────────────────────────────────────────────────────────

/** Timeout for a streamed completion (longer than one-shot — tokens arrive over time). */
const STREAM_TIMEOUT_MS = 120_000;

/**
 * Parse a single Groq/OpenAI SSE line into its delta text. Returns null for
 * non-data lines, the terminal `[DONE]`, lines without a content delta, or
 * malformed JSON. Pure and unit-tested.
 */
export function parseSseDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    const j = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
    const content = j?.choices?.[0]?.delta?.content;
    return typeof content === 'string' && content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

/**
 * Stream a Groq completion, invoking `onToken` for each content delta.
 * Returns the full accumulated text. Throws on any failure so the caller can
 * fall back to the whole-text chain.
 */
async function runGroqStream(key: string, input: CompletionInput, onToken: (token: string) => void): Promise<string> {
  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    stream: true,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
    max_completion_tokens: input.maxTokens ?? 4000,
    temperature: input.temperature ?? 0.5,
  };
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });
  if (res.status === 429) throw new RateLimitError('groq rate limited (429)');
  if (!res.ok || !res.body) throw new Error(`groq stream HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const delta = parseSseDelta(line);
      if (delta) {
        full += delta;
        onToken(delta);
      }
    }
  }
  if (!full.trim()) throw new Error('groq empty stream');
  return full;
}

/**
 * Streaming completion. Tries Groq SSE first (invoking `onToken` per delta);
 * on any failure falls back to the whole-text `runCompletion` chain, emitting
 * the result as a single chunk. Always resolves to the full text + model.
 */
export async function runCompletionStream(
  ai: unknown,
  input: CompletionInput,
  opts: CompletionOpts,
  onToken: (token: string) => void
): Promise<CompletionOutput> {
  const health = await getProviderHealth();
  // Try Infron first (non-streaming — Infron SSE streaming is supported but
  // the synthesizer's token-by-token UX is not critical for free models).
  if (opts.infronKey && (!health || (await health.isProviderHealthy('infron')))) {
    const startMs = Date.now();
    try {
      const text = await runInfron(opts.infronKey, input, INFRON_MODEL);
      if (health) await health.recordSuccess('infron', Date.now() - startMs);
      onToken(text);
      opts.recordUsage?.(`infron:${INFRON_MODEL}`, `${input.system}\n${input.user}`, text, opts.role ?? 'completion');
      return { text, modelUsed: `infron:${INFRON_MODEL}` };
    } catch (err) {
      console.error(
        `runCompletionStream infron failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`
      );
      if (health) await health.recordFailure('infron', isRateLimited(err));
      // fall through to Groq streaming, then the whole-text chain
    }
  }
  if (opts.groqKey && (!health || (await health.isProviderHealthy('groq')))) {
    const startMs = Date.now();
    try {
      const text = await runGroqStream(opts.groqKey, input, onToken);
      if (health) await health.recordSuccess('groq', Date.now() - startMs);
      opts.recordUsage?.(`groq:${GROQ_MODEL}`, `${input.system}\n${input.user}`, text, opts.role ?? 'completion');
      return { text, modelUsed: `groq:${GROQ_MODEL}` };
    } catch (err) {
      console.error(
        `runCompletionStream groq failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`
      );
      if (health) await health.recordFailure('groq', isRateLimited(err));
      // fall through to the whole-text chain
    }
  }
  const out = await runCompletion(ai, input, opts);
  onToken(out.text);
  return out;
}

import type { Env } from '../env';

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GOOGLE_MODEL = 'gemini-2.5-flash';
const GOOGLE_MODEL_FALLBACK = 'gemini-2.0-flash';
const GOOGLE_TIMEOUT_MS = 30_000;

interface AiInput {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'qwen/qwen3.6-27b';

async function callGoogleModel(
  key: string,
  model: string,
  input: AiInput
): Promise<{ text: string; model: string } | null> {
  try {
    const res = await fetch(`${GOOGLE_BASE}/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: [{ text: input.user }] }],
        generationConfig: {
          maxOutputTokens: input.maxTokens ?? 1500,
          temperature: input.temperature ?? 0.2,
        },
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text === 'string' && text.trim()) return { text: text.trim(), model: `google:${model}` };
  } catch {
    /* fall through */
  }
  return null;
}

async function runGoogle(key: string, input: AiInput): Promise<{ text: string; model: string } | null> {
  const result = await callGoogleModel(key, GOOGLE_MODEL, input);
  if (result) return result;
  return callGoogleModel(key, GOOGLE_MODEL_FALLBACK, input);
}

async function callGroq(groqKey: string, input: AiInput): Promise<{ text: string; model: string } | null> {
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_completion_tokens: input.maxTokens ?? 1500,
        temperature: input.temperature ?? 0.2,
        reasoning_effort: 'medium',
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.trim()) return { text: text.trim(), model: `groq:${GROQ_MODEL}` };
  } catch {
    /* fall through */
  }
  return null;
}

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODELS = ['minimaxai/minimax-m2.7', 'z-ai/glm-5.2'];

async function callNvidia(nvidiaKey: string, input: AiInput): Promise<{ text: string; model: string } | null> {
  for (const model of NVIDIA_MODELS) {
    try {
      const res = await fetch(NVIDIA_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${nvidiaKey}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          max_tokens: input.maxTokens ?? 1500,
          temperature: input.temperature ?? 0.2,
        }),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = j?.choices?.[0]?.message?.content;
      if (typeof text === 'string' && text.trim()) return { text: text.trim(), model: `nvidia:${model}` };
    } catch {
      /* try next model */
    }
  }
  return null;
}

export async function runAi(
  _ai: Env['AI'],
  groqKey: string | undefined,
  input: AiInput,
  googleKey?: string,
  nvidiaKey?: string
): Promise<{ text: string; model: string }> {
  if (nvidiaKey) {
    const result = await callNvidia(nvidiaKey, input);
    if (result) return result;
  }

  if (groqKey) {
    const result = await callGroq(groqKey, input);
    if (result) return result;
  }

  if (googleKey) {
    const result = await runGoogle(googleKey, input);
    if (result) return result;
  }

  throw new Error('All LLM providers exhausted');
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m?.[1]) {
    try {
      return JSON.parse(m[1]);
    } catch {
      /* continue */
    }
  }
  return { raw: text };
}

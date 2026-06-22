import type { Env } from '../env';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

interface AiInput {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export async function runAi(
  ai: Env['AI'],
  groqKey: string | undefined,
  input: AiInput
): Promise<{ text: string; model: string }> {
  if (groqKey) {
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
      if (res.ok) {
        const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = j?.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text.trim()) return { text: text.trim(), model: `groq:${GROQ_MODEL}` };
      }
    } catch {
      /* fall through to Workers AI */
    }
  }
  const result = (await ai.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any,
    {
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_tokens: input.maxTokens ?? 1500,
      temperature: input.temperature ?? 0.2,
    } as any
  )) as any;
  const text = typeof result?.response === 'string' ? result.response : JSON.stringify(result);
  return { text, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' };
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

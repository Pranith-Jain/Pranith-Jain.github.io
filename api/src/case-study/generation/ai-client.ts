import type { Ai } from '@cloudflare/workers-types';

const PRIMARY = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK = '@cf/meta/llama-3.1-8b-instruct';

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

async function runModel(ai: Ai, model: string, input: CompletionInput): Promise<string> {
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

export async function runCompletion(ai: Ai, input: CompletionInput): Promise<CompletionOutput> {
  try {
    const text = await runModel(ai, PRIMARY, input);
    return { text, modelUsed: PRIMARY };
  } catch (err) {
    console.warn('runCompletion: primary failed, trying fallback', err);
    const text = await runModel(ai, FALLBACK, input);
    return { text, modelUsed: FALLBACK };
  }
}

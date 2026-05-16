import type { Ai } from '@cloudflare/workers-types';

const PRIMARY = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK = '@cf/meta/llama-3.1-8b-instruct';
const MAX_RETRIES = 3;
const BASE_DELAY = 2000;

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

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('rate') || msg.includes('429') || msg.includes('too many') || msg.includes('limit');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runModel(ai: Ai, model: string, input: CompletionInput, attempt = 1): Promise<string> {
  try {
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
  } catch (err) {
    if (isRateLimited(err) && attempt < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.warn(`runModel: rate limited on ${model} (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms`);
      await sleep(delay);
      return runModel(ai, model, input, attempt + 1);
    }
    throw err;
  }
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

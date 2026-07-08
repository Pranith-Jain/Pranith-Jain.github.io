import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  runCompletion,
  isRateLimited,
  isModelCapacityError,
  RateLimitError,
} from '../../../src/case-study/generation/ai-client';

const WORKERS_AI_MODELS = [
  '@cf/moonshotai/kimi-k2.6',
  '@cf/zai-org/glm-5.2',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isRateLimited', () => {
  it('matches quota / rate / exceeded / 429 signals', () => {
    for (const m of ['Rate limit exceeded', 'HTTP 429', 'too many requests', 'daily quota exceeded', 'over capacity']) {
      expect(isRateLimited(new Error(m))).toBe(true);
    }
    expect(isRateLimited(new Error('model not found'))).toBe(false);
  });
});

describe('isModelCapacityError', () => {
  it('matches Workers AI 3040 capacity errors', () => {
    expect(isModelCapacityError(new Error('3040: Capacity temporarily exceeded, please try again.'))).toBe(true);
    expect(isModelCapacityError(new Error('3040: Capacity exceeded'))).toBe(true);
    expect(isModelCapacityError(new Error('rate limit exceeded'))).toBe(false);
    expect(isModelCapacityError(new Error('HTTP 429'))).toBe(false);
    expect(isModelCapacityError(new Error('model not found'))).toBe(false);
  });
});

describe('runCompletion — Workers-AI fallback (no Groq key)', () => {
  it('uses the first Workers-AI model on success', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'WAI OK' })) };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' });
    expect(out.text).toBe('WAI OK');
    expect(out.modelUsed).toBe(WORKERS_AI_MODELS[0]);
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it('falls to the next model on a NON-rate error', async () => {
    const ai = {
      run: vi
        .fn()
        .mockRejectedValueOnce(new Error('model unavailable'))
        .mockResolvedValueOnce({ response: 'FALLBACK OK' }),
    };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' });
    expect(out.text).toBe('FALLBACK OK');
    expect(out.modelUsed).toBe(WORKERS_AI_MODELS[1]);
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it('FAST-FAILS on a true rate-limit — no retry, no chain-walk', async () => {
    const ai = { run: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')) };
    await expect(runCompletion(ai as any, { system: 's', user: 'u' })).rejects.toBeInstanceOf(RateLimitError);
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it('walks to the next model on a 3040 capacity error (model-specific)', async () => {
    const ai = {
      run: vi
        .fn()
        .mockRejectedValueOnce(new Error('3040: Capacity temporarily exceeded, please try again.'))
        .mockResolvedValueOnce({ response: 'CAPACITY_FALLBACK_OK' }),
    };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' });
    expect(out.text).toBe('CAPACITY_FALLBACK_OK');
    expect(out.modelUsed).toBe(WORKERS_AI_MODELS[1]);
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it('throws when all models fail with non-rate errors', async () => {
    const ai = { run: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(runCompletion(ai as any, { system: 's', user: 'u' })).rejects.toThrow();
    expect(ai.run).toHaveBeenCalledTimes(3);
  });
});

describe('runCompletion — Groq primary', () => {
  it('uses Groq when a key is provided and never touches Workers AI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: { content: 'GROQ OK' } }] }), { status: 200 })
      )
    );
    const ai = { run: vi.fn() };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' }, { groqKey: 'k' });
    expect(out.text).toBe('GROQ OK');
    expect(out.modelUsed).toContain('groq:');
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('falls back to Workers AI when Groq fails (non-rate)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    const ai = { run: vi.fn(async () => ({ response: 'WAI OK' })) };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' }, { groqKey: 'k' });
    expect(out.text).toBe('WAI OK');
    expect(out.modelUsed).toBe(WORKERS_AI_MODELS[0]);
  });
});

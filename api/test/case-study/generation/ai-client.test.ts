import { describe, it, expect, vi, afterEach } from 'vitest';
import { runCompletion, isRateLimited, RateLimitError } from '../../../src/case-study/generation/ai-client';

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

describe('runCompletion — Workers-AI fallback (no Groq key)', () => {
  it('uses the first Workers-AI model on success', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'WAI OK' })) };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' });
    expect(out.text).toBe('WAI OK');
    expect(out.modelUsed).toContain('llama-3.3-70b');
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
    expect(out.modelUsed).toContain('llama-3.1-8b');
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it('FAST-FAILS on a rate-limit — no retry, no chain-walk', async () => {
    const ai = { run: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')) };
    await expect(runCompletion(ai as any, { system: 's', user: 'u' })).rejects.toBeInstanceOf(RateLimitError);
    // The old code did 3 models x 3 retries = 9 calls + ~90s of back-off.
    // The fix must stop after the FIRST rate-limited call.
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it('throws when all models fail with non-rate errors', async () => {
    const ai = { run: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(runCompletion(ai as any, { system: 's', user: 'u' })).rejects.toThrow();
    expect(ai.run).toHaveBeenCalledTimes(2);
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
    expect(out.modelUsed).toContain('llama-3.3-70b');
  });
});

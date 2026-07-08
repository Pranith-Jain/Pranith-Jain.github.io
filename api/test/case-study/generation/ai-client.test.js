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

describe('runCompletion — no keys', () => {
  it('throws when no keys are configured', async () => {
    await expect(runCompletion(null, { system: 's', user: 'u' })).rejects.toThrow('All LLM providers exhausted');
  });
});

describe('runCompletion — NVIDIA primary', () => {
  it('uses NVIDIA when nvidiaKey is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: { content: 'NVIDIA OK' } }] }), { status: 200 })
      )
    );
    const out = await runCompletion(null, { system: 's', user: 'u' }, { nvidiaKey: 'nvapi-k' });
    expect(out.text).toBe('NVIDIA OK');
    expect(out.modelUsed).toContain('nvidia:');
  });

  it('falls back to Groq when NVIDIA fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: 'GROQ OK' } }] }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);
    const out = await runCompletion(null, { system: 's', user: 'u' }, { nvidiaKey: 'nvapi-k', groqKey: 'grok-k' });
    expect(out.text).toBe('GROQ OK');
    expect(out.modelUsed).toContain('groq:');
  });

  it('throws when all providers fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    await expect(
      runCompletion(null, { system: 's', user: 'u' }, { nvidiaKey: 'nvapi-k', groqKey: 'grok-k', googleKey: 'g-key' })
    ).rejects.toThrow('All LLM providers exhausted');
  });
});

describe('runCompletion — Groq primary (no NVIDIA)', () => {
  it('uses Groq when groqKey is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: { content: 'GROQ OK' } }] }), { status: 200 })
      )
    );
    const out = await runCompletion(null, { system: 's', user: 'u' }, { groqKey: 'k' });
    expect(out.text).toBe('GROQ OK');
    expect(out.modelUsed).toContain('groq:');
  });

  it('throws when Groq fails and no NVIDIA key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    await expect(runCompletion(null, { system: 's', user: 'u' }, { groqKey: 'k' })).rejects.toThrow(
      'All LLM providers exhausted'
    );
  });
});

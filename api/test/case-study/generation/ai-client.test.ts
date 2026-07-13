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
    await expect(runCompletion(null, { system: 's', user: 'u' })).rejects.toThrow('GROQ_API_KEY not set');
  });
});

describe('runCompletion — Groq primary', () => {
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

  it('uses role tag in log output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }))
    );
    const out = await runCompletion(null, { system: 's', user: 'u' }, { groqKey: 'k', role: 'synthesizer' });
    expect(out.modelUsed).toContain('groq:');
  });

  it('throws when all Groq models fail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(runCompletion(null, { system: 's', user: 'u' }, { groqKey: 'k' })).rejects.toThrow(
      'All LLM providers exhausted'
    );
  });

  it('throws when all providers fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    await expect(
      runCompletion(null, { system: 's', user: 'u' }, { nvidiaKey: 'nvapi-k', groqKey: 'grok-k' })
    ).rejects.toThrow('All LLM providers exhausted');
  });
});

describe('runCompletion — Groq only (no NVIDIA)', () => {
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

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  runCompletion,
  isRateLimited,
  isRequestTooLarge,
  isSubrequestExhausted,
  RateLimitError,
} from '../../../src/case-study/generation/ai-client';
import { resetProviderHealth } from '../../../src/lib/agent/provider-health';

afterEach(async () => {
  vi.unstubAllGlobals();
  // Isolate tests: clear the shared Cache-API circuit-breaker state so one
  // test's mocked failures (e.g. the Workers-AI-fallback tests that 500 every
  // Groq model) don't trip the breaker and skip Groq for the next test.
  await resetProviderHealth('groq');
  await resetProviderHealth('gemini');
  await resetProviderHealth('nvidia');
});

describe('isRateLimited', () => {
  it('matches quota / rate / exceeded / 429 signals', () => {
    for (const m of ['Rate limit exceeded', 'HTTP 429', 'too many requests', 'daily quota exceeded', 'over capacity']) {
      expect(isRateLimited(new Error(m))).toBe(true);
    }
    expect(isRateLimited(new Error('model not found'))).toBe(false);
  });
});

describe('isRequestTooLarge', () => {
  it('matches 413 / request-too-large signals', () => {
    for (const m of ['groq HTTP 413', 'Request too large for model', 'payload too large (413)']) {
      expect(isRequestTooLarge(new Error(m))).toBe(true);
    }
    expect(isRequestTooLarge(new Error('rate limited (429)'))).toBe(false);
  });
});

describe('isSubrequestExhausted', () => {
  it('matches the Workers free-plan subrequest cap wording', () => {
    for (const m of [
      'Too many subrequests by single Worker invocation',
      'Too many sub-requests: exceeded 50',
      'sub request limit reached',
    ]) {
      expect(isSubrequestExhausted(new Error(m))).toBe(true);
    }
    expect(isSubrequestExhausted(new Error('rate limited (429)'))).toBe(false);
    expect(isSubrequestExhausted(new Error('All LLM providers exhausted'))).toBe(false);
  });
});

describe('runCompletion — Workers AI fallback', () => {
  it('falls back to Workers AI when every external provider is exhausted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    const ai = { run: vi.fn(async () => ({ response: 'WORKERS AI OK' })) };
    const out = await runCompletion(ai, { system: 's', user: 'u' }, { groqKey: 'k' });
    expect(out.text).toBe('WORKERS AI OK');
    expect(out.modelUsed).toContain('workers-ai:');
  });

  it('treats a Groq 413 as oversized and still succeeds via Workers AI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Request too large for model', { status: 413 }))
    );
    const ai = { run: vi.fn(async () => ({ response: 'WA OK' })) };
    const out = await runCompletion(ai, { system: 's', user: 'u' }, { groqKey: 'k' });
    expect(out.text).toBe('WA OK');
    expect(out.modelUsed).toContain('workers-ai:');
  });

  it('throws when external providers AND Workers AI all fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    const ai = { run: vi.fn(async () => ({ response: '' })) }; // empty → Workers AI exhausts
    await expect(runCompletion(ai, { system: 's', user: 'u' }, { groqKey: 'k' })).rejects.toThrow(
      'All LLM providers exhausted'
    );
  });

  it('fail-fast rethrows subrequest-exhaustion instead of walking the rest of the chain', async () => {
    // Every fetch throws once the invocation's 50-subrequest budget is spent.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(
          'Too many subrequests by single Worker invocation, limit reached. Read the docs on scaling to avoid this. Please retry request'
        );
      })
    );
    const ai = { run: vi.fn(async () => ({ response: 'never reached' })) };
    await expect(runCompletion(ai, { system: 's', user: 'u' }, { groqKey: 'k' })).rejects.toThrow(
      'Too many subrequests'
    );
    // The Workers AI binding must not be called — the invocation is doomed and
    // the remaining provider models would all fail identically.
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('fail-fast rethrows from Workers AI when the binding exhausts the budget', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    const ai = {
      run: vi.fn(async () => {
        throw new Error('Too many subrequests by single Worker invocation is 50');
      }),
    };
    await expect(runCompletion(ai, { system: 's', user: 'u' }, { groqKey: 'k' })).rejects.toThrow(
      'Too many subrequests'
    );
    // Only the first model is attempted — after the budget hits zero there is
    // no point trying qwen / gpt-oss / llama-3.1.
    expect(ai.run).toHaveBeenCalledTimes(1);
  });
});

describe('runCompletion — no keys', () => {
  it('throws when no keys are configured', async () => {
    await expect(runCompletion(null, { system: 's', user: 'u' })).rejects.toThrow('All LLM providers exhausted');
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

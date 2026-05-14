import { describe, it, expect, vi } from 'vitest';
import { runCompletion } from '../../../src/case-study/generation/ai-client';

describe('runCompletion', () => {
  it('returns text from primary model on success', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'PRIMARY OK' })) };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' });
    expect(out.text).toBe('PRIMARY OK');
    expect(out.modelUsed).toContain('llama-3.3-70b');
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it('falls back to 8B model when primary throws', async () => {
    const ai = {
      run: vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce({ response: 'FALLBACK OK' }),
    };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' });
    expect(out.text).toBe('FALLBACK OK');
    expect(out.modelUsed).toContain('llama-3.1-8b');
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it('throws when both models fail', async () => {
    const ai = { run: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(runCompletion(ai as any, { system: 's', user: 'u' })).rejects.toThrow();
  });
});

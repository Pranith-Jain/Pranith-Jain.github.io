import { describe, it, expect, vi } from 'vitest';
import { parseHooks } from '../../../src/case-study/generation/hook-variants';

vi.mock('../../../src/case-study/generation/ai-client', async () => {
  const actual = await vi.importActual('../../../src/case-study/generation/ai-client');
  return {
    ...(actual as Record<string, unknown>),
    runCompletion: vi.fn(),
  };
});

describe('parseHooks', () => {
  it('splits lines, strips numbering/bullets/quotes, caps at 3', () => {
    const out = parseHooks('1. First hook here\n- Second hook line\n"Third hook"\n4. Fourth too many');
    expect(out).toEqual(['First hook here', 'Second hook line', 'Third hook']);
  });

  it('drops blank and too-short lines', () => {
    const out = parseHooks('\n  \nok\nA real hook sentence with substance');
    expect(out).toEqual(['A real hook sentence with substance']);
  });

  it('strips a leading markdown fence / commentary line', () => {
    const out = parseHooks('Here are 3 hooks:\nLockBit posted 15 victims in 7 days — 4 were recycled.');
    expect(out).toContain('LockBit posted 15 victims in 7 days — 4 were recycled.');
    expect(out).not.toContain('Here are 3 hooks:');
  });
});

describe('generateHookVariants', () => {
  it('returns parsed hooks from the model output', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    (runCompletion as any).mockResolvedValue({
      text: 'A sharp data-shock hook with a number 42.\nA contrarian take everyone missed.\nA curiosity-gap opener that demands the click.',
      modelUsed: 'mock',
    });
    const { generateHookVariants } = await import('../../../src/case-study/generation/hook-variants');
    const hooks = await generateHookVariants({ title: 'T', body: 'body facts' }, {} as any);
    expect(hooks).toHaveLength(3);
    expect(hooks[0]).toMatch(/data-shock/);
  });

  it('returns [] (never throws) when the model errors', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    (runCompletion as any).mockRejectedValue(new Error('AI down'));
    const { generateHookVariants } = await import('../../../src/case-study/generation/hook-variants');
    const hooks = await generateHookVariants({ title: 'T', body: 'b' }, {} as any);
    expect(hooks).toEqual([]);
  });
});

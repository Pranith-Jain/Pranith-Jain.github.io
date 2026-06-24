import { describe, it, expect, vi } from 'vitest';
import { parseHooks, generateHookVariants } from '../../../src/case-study/generation/hook-variants';
import type { Ai } from '@cloudflare/workers-types';

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
    const ai = {
      run: vi.fn(async () => ({
        response:
          'A sharp data-shock hook with a number 42.\nA contrarian take everyone missed.\nA curiosity-gap opener that demands the click.',
      })),
    } as unknown as Ai;
    const hooks = await generateHookVariants({ title: 'T', body: 'body facts' }, ai);
    expect(hooks).toHaveLength(3);
    expect(hooks[0]).toMatch(/data-shock/);
  });

  it('returns [] (never throws) when the model errors', async () => {
    const ai = {
      run: vi.fn(async () => {
        throw new Error('AI down');
      }),
    } as unknown as Ai;
    const hooks = await generateHookVariants({ title: 'T', body: 'b' }, ai);
    expect(hooks).toEqual([]);
  });
});

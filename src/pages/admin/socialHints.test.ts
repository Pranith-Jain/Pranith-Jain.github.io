import { describe, it, expect } from 'vitest';
import { bestTimeHint } from './socialHints';

describe('bestTimeHint', () => {
  it('gives platform-specific 2026 guidance with the link-placement reminder', () => {
    expect(bestTimeHint('linkedin')).toMatch(/first comment/i);
    expect(bestTimeHint('twitter')).toMatch(/first reply/i);
    expect(bestTimeHint('linkedin')).toMatch(/Tue.?Thu/i);
  });
});

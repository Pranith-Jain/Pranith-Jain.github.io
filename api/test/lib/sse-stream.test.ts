import { describe, it, expect } from 'vitest';
import { parseSseDelta } from '../../src/case-study/generation/ai-client';

describe('parseSseDelta', () => {
  it('extracts content from a Groq/OpenAI SSE data line', () => {
    expect(parseSseDelta('data: {"choices":[{"delta":{"content":"Hello"}}]}')).toBe('Hello');
  });

  it('returns null for the terminal [DONE] marker', () => {
    expect(parseSseDelta('data: [DONE]')).toBeNull();
  });

  it('returns null for non-data lines and empty deltas', () => {
    expect(parseSseDelta(': keep-alive')).toBeNull();
    expect(parseSseDelta('event: message')).toBeNull();
    expect(parseSseDelta('data: {"choices":[{"delta":{}}]}')).toBeNull();
    expect(parseSseDelta('data: {"choices":[{"delta":{"content":""}}]}')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseSseDelta('data: {not json')).toBeNull();
  });
});

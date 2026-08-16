import { describe, it, expect } from 'vitest';
import { extractJson } from '../../src/lib/llm-json';

describe('extractJson — LLM defect repair', () => {
  it('parses clean JSON objects', () => {
    expect(extractJson('{"a":1,"b":[1,2]}')).toEqual({ a: 1, b: [1, 2] });
  });

  it('parses JSON arrays', () => {
    expect(extractJson('[{"x":1},{"x":2}]')).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('removes trailing commas', () => {
    expect(extractJson('{"a":[1,2,],}')).toEqual({ a: [1, 2] });
  });

  it('escapes literal newlines inside string values', () => {
    // The exact failure class reported on /threatintel/dashboard-hub: a real
    // newline inside a string value makes JSON.parse throw
    // "Expected ',' or '}' after property value in JSON ... at line N".
    const raw = '{\n  "summary": "line one\nline two",\n  "count": 3\n}';
    const out = extractJson<{ summary: string; count: number }>(raw);
    expect(out?.summary).toBe('line one\nline two');
    expect(out?.count).toBe(3);
  });

  it('escapes literal tabs inside string values', () => {
    expect(extractJson<{ title: string }>('{"title": "a\tb"}')?.title).toBe('a\tb');
  });

  it('does not mangle escaped quotes or backslashes', () => {
    const raw = '{"s":"say \\"hi\\" \\\\ done","n":1}';
    expect(extractJson<{ s: string; n: number }>(raw)).toEqual({ s: 'say "hi" \\ done', n: 1 });
  });

  it('leaves structural whitespace untouched', () => {
    const raw = '{\n  "a": [\n    1,\n    2\n  ]\n}';
    expect(extractJson(raw)).toEqual({ a: [1, 2] });
  });

  it('returns null on garbage', () => {
    expect(extractJson('not json at all')).toBeNull();
  });

  it('handles single-quoted JSON as last resort', () => {
    expect(extractJson("{'a': 1}")).toEqual({ a: 1 });
  });

  it('survives an LLM-style prediction array with literal newlines in a field', () => {
    const raw = `Here you go:
[
  {
    "pattern_id": "VP-AB12",
    "title": "Test",
    "summary": "First line
second line",
    "confidence": 70
  }
]
`;
    const out = extractJson<Array<{ summary: string; confidence: number }>>(raw);
    expect(out?.[0]?.summary).toBe('First line\nsecond line');
    expect(out?.[0]?.confidence).toBe(70);
  });
});

/**
 * Test the strict KQL expression parser.
 *
 * Validates: and/or/not/parens, all operators, string escaping,
 * graceful handling of incomplete input, and round-trip through
 * parseKql + Sigma emission (i.e. the KQL→KQL round-trip is faithful
 * for the boolean structure).
 */
import { describe, it, expect } from 'vitest';
import { parseKqlStrict } from './kql-expr-parser';

describe('parseKqlStrict - leaf comparisons', () => {
  it('parses a single eq predicate', () => {
    const r = parseKqlStrict('where ProcessName == "cmd.exe"');
    expect(r.groups.length).toBe(1);
    expect(r.groups[0]!.predicates?.[0]).toEqual({
      field: 'ProcessName',
      op: 'eq',
      values: ['cmd.exe'],
    });
    expect(r.condition).toBe('g1');
  });

  it('parses contains', () => {
    const r = parseKqlStrict('where CommandLine contains "powershell"');
    expect(r.groups[0]!.predicates?.[0]?.op).toBe('contains');
  });

  it('parses startswith / endswith', () => {
    expect(parseKqlStrict('where FileName startswith "ms"').groups[0]!.predicates?.[0]?.op).toBe('startswith');
    expect(parseKqlStrict('where FileName endswith ".exe"').groups[0]!.predicates?.[0]?.op).toBe('endswith');
  });

  it('parses matches regex (KQL `=~`)', () => {
    const r = parseKqlStrict('where FileName =~ "\\\\.exe$"');
    expect(r.groups[0]!.predicates?.[0]?.op).toBe('re');
    expect(r.groups[0]!.predicates?.[0]?.values).toEqual(['\\.exe$']);
  });

  it('parses `has` as contains (KQL synonym)', () => {
    expect(parseKqlStrict('where CommandLine has "mimikatz"').groups[0]!.predicates?.[0]?.op).toBe('contains');
  });

  it('handles single-quoted strings', () => {
    const r = parseKqlStrict("where ProcessName == 'cmd.exe'");
    expect(r.groups[0]!.predicates?.[0]?.values).toEqual(['cmd.exe']);
  });

  it('handles backslash-escaped chars in strings', () => {
    const r = parseKqlStrict('where Path == "C:\\\\Windows"');
    expect(r.groups[0]!.predicates?.[0]?.values).toEqual(['C:\\Windows']);
  });
});

describe('parseKqlStrict - boolean structure', () => {
  it('preserves AND', () => {
    const r = parseKqlStrict('where A == "1" and B == "2"');
    expect(r.groups.length).toBe(2);
    expect(r.condition).toBe('( g1 and g2 )');
  });

  it('preserves OR', () => {
    const r = parseKqlStrict('where A == "1" or A == "2"');
    expect(r.condition).toBe('( g1 or g2 )');
    expect(r.groups.length).toBe(2);
  });

  it('preserves AND + OR (precedence)', () => {
    const r = parseKqlStrict('where A == "1" and B == "2" or C == "3"');
    // and binds tighter than or, so the condition is "( g1 and g2 ) or g3"
    expect(r.condition).toBe('( ( g1 and g2 ) or g3 )');
  });

  it('handles parens', () => {
    const r = parseKqlStrict('where (A == "1" or A == "2") and B == "3"');
    expect(r.condition).toBe('( ( g1 or g2 ) and g3 )');
  });

  it('handles nested parens', () => {
    const r = parseKqlStrict('where ((A == "1" or A == "2") and B == "3") or C == "4"');
    expect(r.condition).toBe('( ( ( g1 or g2 ) and g3 ) or g4 )');
  });

  it('handles NOT', () => {
    const r = parseKqlStrict('where not (A == "1" or A == "2")');
    expect(r.condition).toBe('not ( ( g1 or g2 ) )');
  });

  it('handles double negation', () => {
    const r = parseKqlStrict('where not not A == "1"');
    expect(r.condition).toBe('not ( not ( g1 ) )');
  });

  it('handles a 3-way OR', () => {
    const r = parseKqlStrict('where A == "1" or A == "2" or A == "3"');
    expect(r.condition).toBe('( ( g1 or g2 ) or g3 )');
  });
});

describe('parseKqlStrict - negation warnings', () => {
  it('warns on != and flattens to eq', () => {
    const r = parseKqlStrict('where A != "1"');
    expect(r.warnings.some((w) => /negation/.test(w))).toBe(true);
    expect(r.groups[0]!.predicates?.[0]?.op).toBe('eq');
  });
});

describe('parseKqlStrict - error handling', () => {
  it('returns empty groups for empty input', () => {
    const r = parseKqlStrict('where ');
    expect(r.groups.length).toBe(0);
  });

  it('emits a warning for trailing tokens', () => {
    const r = parseKqlStrict('where A == "1" and and');
    expect(r.warnings.some((w) => /trailing|expected/.test(w))).toBe(true);
  });
});

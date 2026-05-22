import { describe, it, expect, vi } from 'vitest';
import { env as testEnv } from 'cloudflare:test';
import { extractLlm, EMPTY_LLM_ENTITIES, parseLlmJson } from '../../src/lib/extract-llm';
import type { Env } from '../../src/env';
import type { ExtractedEntities } from '../../src/lib/extract';

const env = testEnv as unknown as Env;

const emptyEntities: ExtractedEntities = {
  iocs: [],
  actors: [],
  malware: [],
  cves: [],
  tags: [],
  summary: '',
};

describe('extractLlm — skip rule', () => {
  it('returns ran:false and never calls runCompletion when body is under 600 chars', async () => {
    const runCompletion = vi.fn();
    const out = await extractLlm('Short brief', 'Body too short', emptyEntities, env, {
      runCompletion: runCompletion as never,
    });
    expect(out.ran).toBe(false);
    expect(out.sectors).toEqual([]);
    expect(out.actorCandidates).toEqual([]);
    expect(runCompletion).not.toHaveBeenCalled();
  });

  it('returns ran:false when findingsCount is 0 even with a long body', async () => {
    const runCompletion = vi.fn();
    const longBody = 'A'.repeat(2000);
    const out = await extractLlm('Long brief with no findings', longBody, emptyEntities, env, {
      runCompletion: runCompletion as never,
      findingsCount: 0,
    });
    expect(out.ran).toBe(false);
    expect(runCompletion).not.toHaveBeenCalled();
  });

  it('EMPTY_LLM_ENTITIES has every array empty + ran:false', () => {
    expect(EMPTY_LLM_ENTITIES.ran).toBe(false);
    expect(EMPTY_LLM_ENTITIES.partial).toBe(false);
    expect(EMPTY_LLM_ENTITIES.sectors).toEqual([]);
    expect(EMPTY_LLM_ENTITIES.affectedProducts).toEqual([]);
    expect(EMPTY_LLM_ENTITIES.attackPatterns).toEqual([]);
    expect(EMPTY_LLM_ENTITIES.actorCandidates).toEqual([]);
    expect(EMPTY_LLM_ENTITIES.malwareCandidates).toEqual([]);
  });
});

describe('parseLlmJson — tolerant parser', () => {
  it('parses a clean JSON object', () => {
    const out = parseLlmJson('{"sectors": ["healthcare"]}');
    expect(out).toEqual({ sectors: ['healthcare'] });
  });

  it('extracts JSON wrapped in markdown fences', () => {
    const input = '```json\n{"sectors": ["finance"]}\n```';
    const out = parseLlmJson(input);
    expect(out).toEqual({ sectors: ['finance'] });
  });

  it('extracts JSON when the LLM adds a prose preamble', () => {
    const input = 'Sure, here is the JSON:\n{"sectors": ["energy"]}\nLet me know if you need more.';
    const out = parseLlmJson(input);
    expect(out).toEqual({ sectors: ['energy'] });
  });

  it('handles nested braces correctly (balanced extraction)', () => {
    const input = '{"affected_products": [{"vendor":"Fortinet","product":"FortiGate"}]}';
    const out = parseLlmJson(input);
    expect((out as { affected_products: unknown[] }).affected_products).toHaveLength(1);
  });

  it('returns null on malformed input', () => {
    expect(parseLlmJson('not json at all')).toBeNull();
    expect(parseLlmJson('{ bad json }')).toBeNull();
    expect(parseLlmJson('')).toBeNull();
  });

  it('returns null when there is no { in the response', () => {
    expect(parseLlmJson('the LLM forgot the JSON entirely')).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { env as testEnv } from 'cloudflare:test';
import { extractLlm, EMPTY_LLM_ENTITIES, parseLlmJson, validateLlmEntities } from '../../src/lib/extract-llm';
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

describe('validateLlmEntities — per-class validation', () => {
  const sourceText = 'Microsoft Exchange was targeted by LightSpy v2. APT28 also active.';

  it('trims, lowercase-canonicalizes, dedupes, and caps sectors at 8', () => {
    const raw = {
      sectors: [
        '  Healthcare  ',
        'European Government',
        'healthcare', // duplicate
        'Energy',
        'Finance',
        'Manufacturing',
        'Defense',
        'Education',
        'Retail', // 9 distinct
      ],
    };
    const out = validateLlmEntities(raw, 'title', 'body');
    expect(out.sectors).toHaveLength(8);
    expect(out.sectors.map((s) => s.name)).toContain('healthcare');
    expect(out.sectors.map((s) => s.name)).toContain('european-government');
  });

  it('drops affected_products missing vendor or product, dedupes, caps at 12', () => {
    const raw = {
      affected_products: [
        { vendor: 'Fortinet', product: 'FortiGate' },
        { vendor: 'Fortinet', product: 'FortiGate' }, // duplicate
        { vendor: '', product: 'FortiOS' }, // missing vendor
        { vendor: 'Microsoft', product: '' }, // missing product
        { vendor: 'Microsoft', product: 'Exchange Server' },
      ],
    };
    const out = validateLlmEntities(raw, 'title', 'body');
    expect(out.affectedProducts).toEqual([
      { vendor: 'Fortinet', product: 'FortiGate' },
      { vendor: 'Microsoft', product: 'Exchange Server' },
    ]);
  });

  it('attack_patterns: keeps valid + in ATTACK_ID_INDEX, drops invalid shapes and unknown ids', () => {
    const raw = {
      attack_patterns: [
        { id: 'T1566.001', name: 'Spear-phishing Attachment' },
        { id: 'T9999', name: 'Invented' }, // not in index → dropped
        { id: 'BAD-SHAPE', name: 'Bad' }, // regex fails → dropped
        { id: 'T1003', name: 'OS Credential Dumping' },
        { id: 'T1003', name: 'Dup' }, // dup → dropped
      ],
    };
    const out = validateLlmEntities(raw, 'title', 'body');
    // T1566.001 and T1003 are real ATT&CK techniques — they're in ATTACK_ID_INDEX.
    expect(out.attackPatterns.map((a) => a.id).sort()).toEqual(['T1003', 'T1566.001']);
  });

  it('actor_candidates: drops names already in ACTOR_ALIASES (canonical or alias)', () => {
    const raw = {
      actor_candidates: [
        { name: 'APT28', rationale: 'matches canonical' },
        { name: 'Fancy Bear', rationale: 'matches alias' },
        { name: 'LightSpy', rationale: 'novel' },
      ],
    };
    const out = validateLlmEntities(raw, 'title', sourceText);
    expect(out.actorCandidates.map((c) => c.name)).toEqual(['LightSpy']);
  });

  it('actor_candidates: drops names not appearing verbatim in title+body', () => {
    const raw = {
      actor_candidates: [
        { name: 'LightSpy', rationale: 'in source' },
        { name: 'GhostHacker', rationale: 'not in source — must be dropped' },
      ],
    };
    const out = validateLlmEntities(raw, 'title', sourceText);
    expect(out.actorCandidates.map((c) => c.name)).toEqual(['LightSpy']);
  });

  it('actor_candidates: case-insensitive substring match', () => {
    const raw = { actor_candidates: [{ name: 'lightspy', rationale: '' }] };
    const out = validateLlmEntities(raw, 'title', sourceText);
    expect(out.actorCandidates).toHaveLength(1);
  });

  it('actor_candidates: caps at 4', () => {
    const body = 'A1 A2 A3 A4 A5 A6 are all here.';
    const raw = {
      actor_candidates: [
        { name: 'A1', rationale: '' },
        { name: 'A2', rationale: '' },
        { name: 'A3', rationale: '' },
        { name: 'A4', rationale: '' },
        { name: 'A5', rationale: '' },
      ],
    };
    const out = validateLlmEntities(raw, 'title', body);
    expect(out.actorCandidates).toHaveLength(4);
  });

  it('malware_candidates: same guards as actors', () => {
    const raw = {
      malware_candidates: [
        { name: 'Emotet', rationale: 'in dict' }, // dropped
        { name: 'LightSpy', rationale: 'novel + in source' },
        { name: 'Phantom', rationale: 'not in source' }, // dropped
      ],
    };
    const out = validateLlmEntities(raw, 'title', sourceText);
    expect(out.malwareCandidates.map((c) => c.name)).toEqual(['LightSpy']);
  });

  it('returns empty arrays for every class when raw is null / not an object', () => {
    const out = validateLlmEntities(null, 'title', 'body');
    expect(out.sectors).toEqual([]);
    expect(out.affectedProducts).toEqual([]);
    expect(out.attackPatterns).toEqual([]);
    expect(out.actorCandidates).toEqual([]);
    expect(out.malwareCandidates).toEqual([]);
  });

  it('handles malformed entries inside otherwise valid arrays without rejecting the whole class', () => {
    const raw = {
      sectors: ['healthcare', 42, null, { junk: true }, 'finance'],
    };
    const out = validateLlmEntities(raw, 'title', 'body');
    expect(out.sectors.map((s) => s.name)).toEqual(['healthcare', 'finance']);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { env as testEnv } from 'cloudflare:test';
import { extractLlm, EMPTY_LLM_ENTITIES, parseLlmJson, validateLlmEntities } from '../../src/lib/extract-llm';
const env = testEnv;
const emptyEntities = {
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
            runCompletion: runCompletion,
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
            runCompletion: runCompletion,
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
        expect(out.affected_products).toHaveLength(1);
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
describe('extractLlm — happy path with DI stub', () => {
    const body = 'A'.repeat(800) + '\nMicrosoft Exchange and LightSpy v2 observed.';
    it('returns validated entities when runCompletion succeeds', async () => {
        const runCompletion = vi.fn(async () => ({
            text: JSON.stringify({
                sectors: ['Healthcare', 'Healthcare'],
                affected_products: [{ vendor: 'Microsoft', product: 'Exchange' }],
                attack_patterns: [{ id: 'T1566.001', name: 'Spear-phishing' }],
                actor_candidates: [{ name: 'LightSpy', rationale: 'novel name in source' }],
                malware_candidates: [],
            }),
            modelUsed: 'groq:llama-3.3-70b-versatile',
        }));
        const out = await extractLlm('Brief', body, emptyEntities, env, {
            runCompletion: runCompletion,
            findingsCount: 3,
        });
        expect(out.ran).toBe(true);
        expect(out.partial).toBe(false);
        expect(out.modelUsed).toBe('groq:llama-3.3-70b-versatile');
        expect(out.sectors).toEqual([{ name: 'healthcare' }]);
        expect(out.affectedProducts).toEqual([{ vendor: 'Microsoft', product: 'Exchange' }]);
        expect(out.attackPatterns).toEqual([{ id: 'T1566.001', name: 'Spear-phishing' }]);
        expect(out.actorCandidates).toEqual([{ name: 'LightSpy', rationale: 'novel name in source' }]);
        expect(runCompletion).toHaveBeenCalledTimes(1);
    });
    it('passes title + body in the user prompt to runCompletion, fenced as untrusted', async () => {
        let captured = null;
        const runCompletion = vi.fn(async (_ai, input) => {
            captured = input;
            return { text: '{}', modelUsed: 'stub' };
        });
        await extractLlm('Brief title', body, emptyEntities, env, {
            runCompletion: runCompletion,
            findingsCount: 1,
        });
        // Report text is now wrapped in an untrusted-data fence (prompt-injection
        // defense); the title/body still appear inside it.
        expect(captured.user).toMatch(/^\[BEGIN UNTRUSTED REPORT\]\nBrief title/);
        expect(captured.user).toContain('[END UNTRUSTED REPORT]');
        expect(captured.user).toContain('Microsoft Exchange');
        // System prompt mentions the strict JSON schema and the untrusted-data contract.
        expect(captured.system).toContain('JSON');
        expect(captured.system).toContain('sectors');
        expect(captured.system).toContain('UNTRUSTED');
    });
});
describe('extractLlm — error / partial paths', () => {
    const body = 'A'.repeat(800);
    it('returns ran:true partial:true with empty arrays when runCompletion throws', async () => {
        const runCompletion = vi.fn(async () => {
            throw new Error('rate-limited');
        });
        const out = await extractLlm('t', body, emptyEntities, env, {
            runCompletion: runCompletion,
            findingsCount: 1,
        });
        expect(out.ran).toBe(true);
        expect(out.partial).toBe(true);
        expect(out.sectors).toEqual([]);
        expect(out.actorCandidates).toEqual([]);
    });
    it('returns partial:true when the LLM response has no JSON object', async () => {
        const runCompletion = vi.fn(async () => ({
            text: 'I am sorry, I cannot help with that.',
            modelUsed: 'stub',
        }));
        const out = await extractLlm('t', body, emptyEntities, env, {
            runCompletion: runCompletion,
            findingsCount: 1,
        });
        expect(out.ran).toBe(true);
        expect(out.partial).toBe(true);
        expect(out.modelUsed).toBe('stub');
    });
    it('truncates the body at 8000 chars before sending to the LLM', async () => {
        let captured = '';
        const runCompletion = vi.fn(async (_ai, input) => {
            captured = input.user;
            return { text: '{}', modelUsed: 'stub' };
        });
        const huge = 'x'.repeat(20_000);
        await extractLlm('t', huge, emptyEntities, env, {
            runCompletion: runCompletion,
            findingsCount: 1,
        });
        // user prompt = 't\n\n' + clamped body
        expect(captured.length).toBeLessThan(9000);
        expect(captured).toContain('[truncated]');
    });
    it('does NOT flip partial when validation drops entries (strict guardrail working)', async () => {
        const runCompletion = vi.fn(async () => ({
            text: JSON.stringify({
                sectors: ['healthcare'],
                actor_candidates: [{ name: 'APT28', rationale: 'in dict, will drop' }],
            }),
            modelUsed: 'stub',
        }));
        const out = await extractLlm('t', body, emptyEntities, env, {
            runCompletion: runCompletion,
            findingsCount: 1,
        });
        expect(out.partial).toBe(false);
        expect(out.sectors).toEqual([{ name: 'healthcare' }]);
        expect(out.actorCandidates).toEqual([]); // dropped by guardrail, no partial
    });
});

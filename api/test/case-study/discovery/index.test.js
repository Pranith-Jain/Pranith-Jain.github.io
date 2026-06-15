import { describe, it, expect } from 'vitest';
import { runDiscovery } from '../../../src/case-study/discovery/index';
const sampleC = (key, type, score) => ({
    key,
    type,
    title: key,
    rationale: '',
    score,
    evidence: {},
    discoveredAt: '2026-05-14T06:00:00Z',
    status: 'pending',
});
describe('runDiscovery', () => {
    it('selects per-topic so every topic is represented (no global starvation)', async () => {
        const writes = [];
        const env = {
            runners: {
                // actor scores highest — under the old global top-5 it crowded
                // every other topic out. Per-topic selection must keep all four.
                cve: async () => [sampleC('cve-1', 'cve', 0.5), sampleC('cve-2', 'cve', 0.45)],
                actor: async () => [sampleC('actor-1', 'actor', 0.99), sampleC('actor-2', 'actor', 0.98)],
                malware: async () => [sampleC('mal-1', 'malware', 0.4)],
                ransom: async () => [sampleC('ran-1', 'ransom', 0.3)],
            },
            putCandidate: async (c) => {
                writes.push(c);
            },
            commitDedup: async () => { },
            now: new Date('2026-05-14T06:00:00Z'),
        };
        const result = await runDiscovery(env);
        const topics = new Set(writes.map((w) => w.type));
        expect(topics).toEqual(new Set(['cve', 'actor', 'malware', 'ransom']));
        expect(result.byTopic).toEqual({ cve: 2, actor: 2, malware: 1, ransom: 1 });
        expect(result.kept).toBe(6);
    });
    it('caps each topic at perTopic', async () => {
        const writes = [];
        const env = {
            runners: {
                cve: async () => [
                    sampleC('c1', 'cve', 0.9),
                    sampleC('c2', 'cve', 0.8),
                    sampleC('c3', 'cve', 0.7),
                    sampleC('c4', 'cve', 0.6),
                ],
                actor: async () => [],
                malware: async () => [],
                ransom: async () => [],
            },
            putCandidate: async (c) => {
                writes.push(c);
            },
            commitDedup: async () => { },
            now: new Date('2026-05-14T06:00:00Z'),
            perTopic: 2,
        };
        const result = await runDiscovery(env);
        expect(result.byTopic.cve).toBe(2);
        expect(writes.map((w) => w.key).sort()).toEqual(['c1', 'c2']);
    });
    it('applies an optional overall cap after per-topic selection', async () => {
        const env = {
            runners: {
                cve: async () => [sampleC('cve-1', 'cve', 0.9)],
                actor: async () => [sampleC('actor-1', 'actor', 0.8)],
                malware: async () => [sampleC('mal-1', 'malware', 0.7)],
                ransom: async () => [sampleC('ran-1', 'ransom', 0.6)],
            },
            putCandidate: async () => { },
            commitDedup: async () => { },
            now: new Date('2026-05-14T06:00:00Z'),
            limit: 2,
        };
        const result = await runDiscovery(env);
        expect(result.kept).toBe(2);
        expect(result.ids).toEqual(['cve-1', 'actor-1']);
    });
    it('one failing runner does not block the others', async () => {
        const writes = [];
        const env = {
            runners: {
                cve: async () => {
                    throw new Error('cve upstream down');
                },
                actor: async () => [sampleC('actor-1', 'actor', 0.8)],
                malware: async () => [sampleC('mal-1', 'malware', 0.7)],
                ransom: async () => [sampleC('ran-1', 'ransom', 0.6)],
            },
            putCandidate: async (c) => {
                writes.push(c);
            },
            commitDedup: async () => { },
            now: new Date('2026-05-14T06:00:00Z'),
        };
        const result = await runDiscovery(env);
        expect(result.byTopic.cve).toBe(0);
        expect(new Set(writes.map((w) => w.type))).toEqual(new Set(['actor', 'malware', 'ransom']));
    });
    it('uses an injected selectPerTopic when provided', async () => {
        const writes = [];
        const env = {
            runners: {
                cve: async () => [sampleC('c1', 'cve', 0.9), sampleC('c2', 'cve', 0.8), sampleC('c3', 'cve', 0.7)],
                actor: async () => [],
                malware: async () => [],
                ransom: async () => [],
            },
            putCandidate: async (c) => {
                writes.push(c);
            },
            commitDedup: async () => { },
            now: new Date('2026-05-14T06:00:00Z'),
            perTopic: 2,
            // Selector that takes the LOWEST scored instead of the default top-k,
            // proving the seam is honored (not the built-in sort).
            selectPerTopic: (cands, k) => [...cands].sort((a, b) => a.score - b.score).slice(0, k),
        };
        const result = await runDiscovery(env);
        expect(result.byTopic.cve).toBe(2);
        expect(writes.map((w) => w.key).sort()).toEqual(['c2', 'c3']);
    });
});

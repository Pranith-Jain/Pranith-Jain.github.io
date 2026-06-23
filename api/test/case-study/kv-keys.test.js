import { describe, it, expect } from 'vitest';
import { kv } from '../../src/case-study/kv-keys';
describe('kv key helpers', () => {
    it('candidates type prefix is listable', () => {
        expect(kv.candidatesPrefix('cve')).toBe('candidates:cve:');
    });
    it('candidatesAllPrefix', () => {
        expect(kv.candidatesAllPrefix).toBe('candidates:');
    });
    it('approvedPrefix', () => {
        expect(kv.approvedPrefix).toBe('approved:');
    });
    it('post key uses slug', () => {
        expect(kv.post('cve-2026-1234-fortinet')).toBe('posts:cve-2026-1234-fortinet');
    });
    it('static keys', () => {
        expect(kv.scheduleUpcoming).toBe('schedule:upcoming');
        expect(kv.postsIndex).toBe('posts:index');
        expect(kv.metaRss).toBe('meta:rss');
    });
});

import { describe, it, expect } from 'vitest';
import { normalizeScrapedIntel, isHandleShaped, budgetWindowKey, SCRAPEDINTEL_SOURCE, SCRAPEDINTEL_SOURCE_URL, MAX_RESULTS, } from '../../src/lib/scrapedintel';
// A realistic upstream payload from threatactorusernames.com/api/search.
// Rows are per (username, forum); a handle can appear on multiple forums.
const upstream = {
    query: 'lockbit',
    found: true,
    count: 3,
    results: [
        { username: 'LockBitSupp', forum: 'Xss', file_stem: 'xss_usernames', logo: '/static/logos/xss_usernames.png' },
        {
            username: 'lockbitsupp',
            forum: 'Exploit',
            file_stem: 'exploit_usernames',
            logo: '/static/logos/exploit_usernames.png',
        },
        { username: 'LockBit_News', forum: 'Ramp', file_stem: 'ramp_usernames', logo: '/static/logos/ramp_usernames.png' },
    ],
};
describe('normalizeScrapedIntel', () => {
    it('groups rows for the same handle (case-insensitive) into one match with all forums', () => {
        const { matches } = normalizeScrapedIntel(upstream);
        const lockbitsupp = matches.find((m) => m.username.toLowerCase() === 'lockbitsupp');
        expect(lockbitsupp).toBeDefined();
        expect(lockbitsupp.forum_count).toBe(2);
        expect(lockbitsupp.forums.map((f) => f.forum).sort()).toEqual(['Exploit', 'Xss']);
    });
    it('preserves the first-seen display casing of a handle', () => {
        const { matches } = normalizeScrapedIntel(upstream);
        const lockbitsupp = matches.find((m) => m.username.toLowerCase() === 'lockbitsupp');
        expect(lockbitsupp.username).toBe('LockBitSupp');
    });
    it('resolves a relative logo path to an absolute upstream URL', () => {
        const { matches } = normalizeScrapedIntel(upstream);
        const m = matches.find((x) => x.username === 'LockBit_News');
        expect(m.forums[0].logo_url).toBe(`${SCRAPEDINTEL_SOURCE_URL}/static/logos/ramp_usernames.png`);
    });
    it('returns no matches for found:false / empty results', () => {
        expect(normalizeScrapedIntel({ query: 'nope', found: false, count: 0, results: [] }).matches).toEqual([]);
    });
    it('returns no matches for malformed input (null, missing/!array results)', () => {
        expect(normalizeScrapedIntel(null).matches).toEqual([]);
        expect(normalizeScrapedIntel({}).matches).toEqual([]);
        expect(normalizeScrapedIntel({ results: 'nope' }).matches).toEqual([]);
        expect(normalizeScrapedIntel({ results: [{ forum: 'Xss' }] }).matches).toEqual([]); // no username
    });
    it('skips rows with non-string username or forum', () => {
        const { matches } = normalizeScrapedIntel({
            results: [
                { username: 123, forum: 'Xss' },
                { username: 'good', forum: 99 },
                { username: 'good', forum: 'Xss' },
            ],
        });
        expect(matches).toHaveLength(1);
        expect(matches[0].username).toBe('good');
        expect(matches[0].forum_count).toBe(1);
    });
    it('dedupes the same forum reported twice for one handle', () => {
        const { matches } = normalizeScrapedIntel({
            results: [
                { username: 'dup', forum: 'Xss' },
                { username: 'dup', forum: 'Xss' },
            ],
        });
        expect(matches[0].forum_count).toBe(1);
    });
    it('caps distinct handles to MAX_RESULTS and flags truncated when more were dropped', () => {
        const results = Array.from({ length: MAX_RESULTS + 25 }, (_, i) => ({ username: `user${i}`, forum: 'Xss' }));
        const { matches, truncated } = normalizeScrapedIntel({ results });
        expect(matches).toHaveLength(MAX_RESULTS);
        expect(truncated).toBe(true);
    });
    it('does NOT flag truncated at exactly MAX_RESULTS distinct handles (no over-report)', () => {
        const results = Array.from({ length: MAX_RESULTS }, (_, i) => ({ username: `user${i}`, forum: 'Xss' }));
        const { matches, truncated } = normalizeScrapedIntel({ results });
        expect(matches).toHaveLength(MAX_RESULTS);
        expect(truncated).toBe(false);
    });
});
describe('isHandleShaped', () => {
    it('accepts typical handles', () => {
        expect(isHandleShaped('lockbitsupp')).toBe(true);
        expect(isHandleShaped('user_1.2-3')).toBe(true);
        expect(isHandleShaped('ab')).toBe(true);
    });
    it('rejects too-short, too-long, spaced, and empty queries', () => {
        expect(isHandleShaped('a')).toBe(false);
        expect(isHandleShaped('')).toBe(false);
        expect(isHandleShaped('two words')).toBe(false);
        expect(isHandleShaped('x'.repeat(81))).toBe(false);
    });
});
describe('budgetWindowKey', () => {
    it('is stable within a minute window and changes across windows', () => {
        const base = 60_000 * 28_333_333; // aligned to a window start
        expect(budgetWindowKey(base)).toBe(budgetWindowKey(base + 59_000)); // same window
        expect(budgetWindowKey(base)).not.toBe(budgetWindowKey(base + 60_000)); // next window
        expect(budgetWindowKey(base)).toContain('si:budget:');
    });
});
describe('source metadata', () => {
    it('exposes the upstream attribution constants', () => {
        expect(SCRAPEDINTEL_SOURCE).toBe('threatactorusernames.com');
        expect(SCRAPEDINTEL_SOURCE_URL).toBe('https://threatactorusernames.com');
    });
});

import { describe, it, expect } from 'vitest';
import { ctiFyiPostToVictim } from '../../src/routes/ransomware-recent';
describe('ctiFyiPostToVictim', () => {
    const base = {
        post_title: 'IDS Group',
        group_name: 'Rhysida',
        discovered: '2026-06-01 18:06:44.329263',
        post_url: 'http://rhysidafohrhyy2aszi7bm32tnjat5xri65fopcxkdfxhi4tidsg7cad.onion/#ids-group',
        screenshot_path: 'screenshots/rhysida/post_5ebc3d24b4830d60.webp',
    };
    it('maps a cti.fyi post to a normalized victim', () => {
        const v = ctiFyiPostToVictim(base);
        expect(v.victim).toBe('IDS Group');
        expect(v.group).toBe('rhysida'); // lowercased
        expect(v.origin).toBe('ctifyi');
        expect(v.discovered).toBe('2026-06-01T18:06:44.000Z'); // space+micros → ISO UTC
    });
    it('links the clearnet group page (not the raw .onion) and rehosts the screenshot', () => {
        const v = ctiFyiPostToVictim(base);
        expect(v.source_url).toBe('https://cti.fyi/groups/rhysida.html');
        expect(v.screen_url).toBe('https://cti.fyi/screenshots/rhysida/post_5ebc3d24b4830d60.webp');
        expect(v.source_url.startsWith('https://')).toBe(true);
    });
    it('omits screen_url when no screenshot is provided', () => {
        const v = ctiFyiPostToVictim({ ...base, screenshot_path: undefined });
        expect(v.screen_url).toBeUndefined();
    });
    it('returns null when victim, group, or date is missing', () => {
        expect(ctiFyiPostToVictim({ ...base, post_title: '' })).toBeNull();
        expect(ctiFyiPostToVictim({ ...base, group_name: undefined })).toBeNull();
        expect(ctiFyiPostToVictim({ ...base, discovered: undefined })).toBeNull();
    });
    it('returns null on an unparseable date', () => {
        expect(ctiFyiPostToVictim({ ...base, discovered: 'not-a-date' })).toBeNull();
    });
});

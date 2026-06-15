import { describe, it, expect } from 'vitest';
// Live-format smoke for the Malpedia family endpoint (providers silently rot, §10.5).
// SKIPPED by default so it never runs in the offline suite / CI. Run on demand with:
//   cd api && npx vitest run test/lib/report/malpedia.live.test.ts   (sandbox disabled)
// Asserts the family JSON still carries family_name/common_name and that description
// may be '' (exactly why the gatherer skips empty-description items).
describe.skip('malpedia live format (on-demand)', () => {
    it('win.lockbit family carries family_name/common_name (description may be empty)', async () => {
        const res = await fetch('https://malpedia.caad.fkie.fraunhofer.de/api/get/family/win.lockbit', {
            headers: { Accept: 'application/json', 'User-Agent': 'pranithjain-copilot/1.0' },
            signal: AbortSignal.timeout(15_000),
        });
        expect(res.ok).toBe(true);
        const data = (await res.json());
        expect(typeof data.family_name).toBe('string');
        expect(typeof data.common_name).toBe('string');
        // description is present as a (possibly empty) string — this is the rot signal.
        expect('description' in data).toBe(true);
        expect(typeof data.description).toBe('string');
    });
});

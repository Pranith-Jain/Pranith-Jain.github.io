import { describe, it, expect } from 'vitest';
import { collectWithinDeadline } from '../../src/routes/feeds-aggregate';
const after = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const rejectAfter = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('boom')), ms));
describe('collectWithinDeadline', () => {
    it('waits for every task when no deadline is given', async () => {
        const out = await collectWithinDeadline([after(5, 'a'), after(20, 'b')]);
        expect(out).toEqual(['a', 'b']);
    });
    it('returns the fast results and leaves slow ones undefined at the deadline', async () => {
        // The RC2 case: one slow feed must not discard the fast feeds.
        const out = await collectWithinDeadline([after(5, 'fast'), after(500, 'slow')], 60);
        expect(out[0]).toBe('fast');
        expect(out[1]).toBeUndefined();
    });
    it('treats a rejected task as undefined rather than throwing', async () => {
        const out = await collectWithinDeadline([after(5, 'ok'), rejectAfter(5)], 60);
        expect(out[0]).toBe('ok');
        expect(out[1]).toBeUndefined();
    });
    it('preserves index alignment with the input order', async () => {
        const out = await collectWithinDeadline([after(30, 'x'), after(5, 'y'), after(15, 'z')], 60);
        expect(out).toEqual(['x', 'y', 'z']);
    });
});

import { describe, it, expect, vi } from 'vitest';
import { runPublisher } from '../../../src/case-study/publishing/publisher';
const cand = {
    key: 'cve-2026-1234',
    type: 'cve',
    title: 'X',
    rationale: '',
    score: 0.9,
    evidence: {},
    discoveredAt: '',
    status: 'approved',
};
const fakePost = {
    slug: 'cve-2026-1234-x',
    type: 'cve',
    title: 'X',
    excerpt: 'e',
    publishedAt: '2026-05-19T15:05:00Z',
    candidateId: cand.key,
    body: '## Summary\n\nx',
    hero: '<svg/>',
    iocs: [],
    tags: [],
    sources: [],
};
function deps(overrides = {}) {
    const slots = [{ slotAt: '2026-05-19T14:00:00Z', candidateId: cand.key, status: 'pending' }];
    return {
        pickDueSlot: vi.fn(async () => slots.find((s) => s.status === 'pending') ?? null),
        markSlotStatus: vi.fn(async (cid, status, extras) => {
            const i = slots.findIndex((s) => s.candidateId === cid);
            slots[i] = { ...slots[i], status, ...extras };
        }),
        getApproved: vi.fn(async (k) => (k === cand.key ? cand : null)),
        unapprove: vi.fn(async () => { }),
        generatePost: vi.fn(async () => fakePost),
        putPost: vi.fn(async () => { }),
        refreshRss: vi.fn(async () => { }),
        touchDedup: vi.fn(async () => { }),
        recordFailure: vi.fn(async () => { }),
        now: new Date('2026-05-19T15:05:00Z'),
        ...overrides,
    };
}
describe('runPublisher', () => {
    it('publishes a due slot end-to-end', async () => {
        const d = deps();
        const result = await runPublisher(d);
        expect(result.published).toBe(1);
        expect(d.generatePost).toHaveBeenCalled();
        expect(d.putPost).toHaveBeenCalledWith(fakePost);
        expect(d.refreshRss).toHaveBeenCalled();
        expect(d.unapprove).toHaveBeenCalledWith(cand.key);
        expect(d.markSlotStatus).toHaveBeenCalledWith(cand.key, 'published', { publishedSlug: fakePost.slug });
        expect(d.touchDedup).toHaveBeenCalledWith(cand.key, expect.any(Date), fakePost.slug);
    });
    it('does nothing when no slot is due', async () => {
        const d = deps({ pickDueSlot: vi.fn(async () => null) });
        const result = await runPublisher(d);
        expect(result.published).toBe(0);
        expect(d.generatePost).not.toHaveBeenCalled();
    });
    it('records failure when generation throws', async () => {
        const d = deps({
            generatePost: vi.fn(async () => {
                throw new Error('AI down');
            }),
        });
        const result = await runPublisher(d);
        expect(result.published).toBe(0);
        expect(d.recordFailure).toHaveBeenCalled();
        expect(d.markSlotStatus).toHaveBeenCalledWith(cand.key, 'failed', expect.any(Object));
    });
    it('skips when approved candidate is missing', async () => {
        const d = deps({ getApproved: vi.fn(async () => null) });
        const result = await runPublisher(d);
        expect(result.published).toBe(0);
        expect(d.markSlotStatus).toHaveBeenCalledWith(cand.key, 'failed', expect.any(Object));
    });
    it('approval gate: writes to draft, leaves posts:index untouched', async () => {
        const d = deps({
            requireApproval: true,
            putDraft: vi.fn(async () => { }),
        });
        const result = await runPublisher(d);
        // No publish — `published` stays 0, slug bubbles up so the caller can log it
        expect(result.published).toBe(0);
        expect(result.slug).toBe(fakePost.slug);
        // Draft sink fired, posts sink + RSS refresh did NOT
        expect(d.putDraft).toHaveBeenCalledWith(fakePost);
        expect(d.putPost).not.toHaveBeenCalled();
        expect(d.refreshRss).not.toHaveBeenCalled();
        // Slot transitions to 'draft' so the planner doesn't re-pick it
        expect(d.markSlotStatus).toHaveBeenCalledWith(cand.key, 'draft', { publishedSlug: fakePost.slug });
        // Dedup + unapprove still fire so the candidate isn't re-discovered
        expect(d.unapprove).toHaveBeenCalledWith(cand.key);
        expect(d.touchDedup).toHaveBeenCalledWith(cand.key, expect.any(Date), fakePost.slug);
    });
    it('approval gate: falls back to auto-publish when putDraft is not wired', async () => {
        // requireApproval=true but no putDraft sink — the publisher should
        // take the published path rather than silently lose the post.
        const d = deps({ requireApproval: true });
        const result = await runPublisher(d);
        expect(result.published).toBe(1);
        expect(d.putPost).toHaveBeenCalledWith(fakePost);
    });
});

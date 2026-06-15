import { describe, it, expect, beforeEach } from 'vitest';
import { putDraft, getDraft, listDraftIndex, approveDraft, rejectDraft } from '../../src/case-study/storage/drafts';
import { listPostIndex, getPost } from '../../src/case-study/storage/posts';
function makeKv() {
    const store = new Map();
    return {
        async get(key, type) {
            const raw = store.get(key);
            if (raw === undefined)
                return null;
            return type === 'json' ? JSON.parse(raw) : raw;
        },
        async put(key, value) {
            store.set(key, value);
        },
        async delete(key) {
            store.delete(key);
        },
    };
}
function makePost(slug, publishedAt) {
    return {
        slug,
        type: 'cve',
        title: `case-${slug}`,
        excerpt: '',
        publishedAt,
        candidateId: slug,
        body: `## Summary\n\nbody for ${slug}`,
        hero: '',
        iocs: [],
        tags: [],
        sources: [],
    };
}
describe('draft storage — approval gate', () => {
    let ns;
    beforeEach(() => {
        ns = makeKv();
    });
    it('putDraft writes to drafts namespace, never touches posts:index', async () => {
        await putDraft(ns, makePost('alpha', '2026-05-21T00:00:00Z'));
        const draft = await getDraft(ns, 'alpha');
        expect(draft?.status).toBe('draft');
        expect(await listDraftIndex(ns)).toHaveLength(1);
        expect(await listPostIndex(ns)).toHaveLength(0);
        expect(await getPost(ns, 'alpha')).toBeNull();
    });
    it('approveDraft promotes draft → published and stamps approvedAt', async () => {
        await putDraft(ns, makePost('beta', '2026-05-21T00:00:00Z'));
        const now = new Date('2026-05-21T12:00:00Z');
        const promoted = await approveDraft(ns, 'beta', now);
        expect(promoted?.status).toBe('published');
        expect(promoted?.approvedAt).toBe('2026-05-21T12:00:00.000Z');
        // Post now in published namespace + index
        const published = await getPost(ns, 'beta');
        expect(published?.status).toBe('published');
        expect((await listPostIndex(ns)).map((p) => p.slug)).toContain('beta');
        // Draft entries gone
        expect(await getDraft(ns, 'beta')).toBeNull();
        expect((await listDraftIndex(ns)).find((d) => d.slug === 'beta')).toBeUndefined();
    });
    it('approveDraft returns null when no such draft exists', async () => {
        const result = await approveDraft(ns, 'ghost', new Date());
        expect(result).toBeNull();
        expect(await listPostIndex(ns)).toHaveLength(0);
    });
    it('rejectDraft removes the draft without publishing', async () => {
        await putDraft(ns, makePost('gamma', '2026-05-21T00:00:00Z'));
        await rejectDraft(ns, 'gamma');
        expect(await getDraft(ns, 'gamma')).toBeNull();
        expect(await getPost(ns, 'gamma')).toBeNull();
        expect(await listPostIndex(ns)).toHaveLength(0);
    });
    it('drafts index is newest-first; multiple drafts coexist', async () => {
        await putDraft(ns, makePost('first', '2026-05-19T00:00:00Z'));
        await putDraft(ns, makePost('second', '2026-05-20T00:00:00Z'));
        await putDraft(ns, makePost('third', '2026-05-21T00:00:00Z'));
        const index = await listDraftIndex(ns);
        expect(index.map((d) => d.slug)).toEqual(['third', 'second', 'first']);
    });
    it('approving one draft leaves other drafts in place', async () => {
        await putDraft(ns, makePost('keep', '2026-05-20T00:00:00Z'));
        await putDraft(ns, makePost('approve-me', '2026-05-21T00:00:00Z'));
        await approveDraft(ns, 'approve-me', new Date('2026-05-21T12:00:00Z'));
        const drafts = await listDraftIndex(ns);
        expect(drafts.map((d) => d.slug)).toEqual(['keep']);
        expect((await listPostIndex(ns)).map((p) => p.slug)).toEqual(['approve-me']);
    });
});

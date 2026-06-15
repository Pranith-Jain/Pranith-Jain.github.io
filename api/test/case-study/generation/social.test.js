import { describe, it, expect } from 'vitest';
const mockPost = {
    slug: 'cve-2026-20182-cisco-catalyst-sd-wan-con',
    type: 'cve',
    title: 'CVE-2026-20182 Cisco Catalyst SD-WAN Auth Bypass',
    excerpt: 'CVE-2026-20182 is an auth bypass...',
    publishedAt: '2026-05-16T00:00:00.000Z',
    candidateId: 'cve-2026-20182',
    body: '# Summary\nCVE-2026-20182 affects Cisco Catalyst SD-WAN Manager...',
    hero: '<svg></svg>',
    iocs: [],
    tags: ['cve', 'cisco', 'sdwan'],
    sources: [{ url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-20182', title: 'NVD' }],
};
function mockAi(assert) {
    return {
        run: async (_model, input) => {
            assert(input.messages);
            return { response: 'ok' };
        },
    };
}
describe('LinkedIn prompt', () => {
    it('includes the post URL in user prompt', async () => {
        const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
        await generateLinkedinContent(mockPost, mockAi((msgs) => {
            const user = msgs.find((m) => m.role === 'user')?.content ?? '';
            expect(user).toContain('pranithjain.qzz.io/blog/cve-2026-20182-cisco-catalyst-sd-wan-con');
        }), new Date());
    });
    it('encodes the 2026 LinkedIn contract: link-in-first-comment, 3-5 hashtags, carousel option', async () => {
        const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
        await generateLinkedinContent(mockPost, mockAi((msgs) => {
            const user = msgs.find((m) => m.role === 'user')?.content ?? '';
            expect(user).toContain('THE FOLD');
            expect(user).toContain('210 characters');
            expect(user).toMatch(/mobile-first/i);
            // Reach-killer fix: no body link; the link goes in a FIRST COMMENT block.
            expect(user).toContain('FIRST COMMENT:');
            expect(user).toMatch(/body must contain NO link/i);
            expect(user).toContain('1300-2000 characters');
            expect(user).toMatch(/scannable .* bulleted list/);
            expect(user).toMatch(/3-5 specific, on-topic hashtags/i);
            expect(user).toContain('CAROUSEL OUTLINE:');
            // Removed legacy rules.
            expect(user).not.toMatch(/at most two lowercase hashtags/i);
        }), new Date());
    });
});
describe('Twitter prompt', () => {
    it('encodes the 2026 thread contract: 5-8 posts, link-in-reply, bookmark+reply optimization', async () => {
        const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
        await generateTwitterContent(mockPost, mockAi((msgs) => {
            const user = msgs.find((m) => m.role === 'user')?.content ?? '';
            expect(user).toContain('5-8 posts');
            expect(user).toMatch(/stands? alone/i);
            expect(user).toMatch(/does NOT start with "1\/"/);
            // Reach-killer fix: no link in post 1; link goes in a FIRST REPLY block.
            expect(user).toContain('FIRST REPLY:');
            expect(user).toMatch(/bookmark/i);
            expect(user).toMatch(/repl(y|ies)/i);
            expect(user).toContain('< 280 chars');
            // Removed legacy rule.
            expect(user).not.toContain('2-5 posts');
        }), new Date());
    });
    it('includes the post URL and allows at most one hashtag', async () => {
        const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
        await generateTwitterContent(mockPost, mockAi((msgs) => {
            const user = msgs.find((m) => m.role === 'user')?.content ?? '';
            expect(user).toContain('pranithjain.qzz.io/blog/cve-2026-20182-cisco-catalyst-sd-wan-con');
            expect(user).toMatch(/at most ONE hashtag/i);
            expect(user).not.toContain('No hashtags');
        }), new Date());
    });
});
describe('system prompt', () => {
    it('embeds the shared analyze-then-construct ruleset', async () => {
        const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
        await generateLinkedinContent(mockPost, mockAi((msgs) => {
            const sys = msgs.find((m) => m.role === 'system')?.content ?? '';
            expect(sys).toContain('#COPYWRITING RULES');
            expect(sys).toContain('Analyze, then construct. Never template.');
            expect(sys).toContain('Hook construction');
            expect(sys).toContain('#PIPELINE OUTPUT (STRICT)');
            expect(sys).toContain("Here's the thing");
            expect(sys).toMatch(/game-changer/);
        }), new Date());
    });
});
describe('generateSocialContent', () => {
    it('produces both twitter and linkedin', async () => {
        const { generateSocialContent } = await import('../../../src/case-study/generation/social');
        const ai = { run: async (_model, _input) => ({ response: 'content' }) };
        const res = await generateSocialContent(mockPost, ai, new Date());
        expect(res.slug).toBe(mockPost.slug);
        expect(res.twitter).toBe('content');
        expect(res.linkedin).toBe('content');
        expect(res.generatedAt).toBeTruthy();
    });
});
describe('whitespace tidy', () => {
    it('collapses 3+ blank lines to one and strips trailing spaces', async () => {
        const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
        const ai = { run: async () => ({ response: 'Hook line.   \n\n\n\nSecond para.\n\n\n- bullet  ' }) };
        const res = await generateLinkedinContent(mockPost, ai, new Date());
        expect(res.linkedin).not.toMatch(/\n{3,}/); // no 3+ consecutive newlines
        expect(res.linkedin).not.toMatch(/[ \t]\n/); // no trailing space before a newline
        expect(res.linkedin).not.toMatch(/[ \t]$/); // no trailing space at the end
        // Two consecutive tight single-line paragraphs get merged into one dense
        // block (soft-return joined); the blank line BEFORE the list is kept
        // because '- bullet' is a list item and not a "tight" block.
        expect(res.linkedin).toContain('Hook line.\nSecond para.');
        expect(res.linkedin).toContain('\n\n- bullet');
    });
});
describe('LinkedIn sparse-merge tidy', () => {
    it('joins consecutive short single-line paragraphs with soft returns and keeps blank lines before lists / hashtags / special blocks', async () => {
        const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
        const ai = {
            run: async () => ({
                response: [
                    'First short line.',
                    '',
                    'Second short line.',
                    '',
                    'Third short line.',
                    '',
                    '- bullet 1',
                    '- bullet 2',
                    '',
                    '#DFIR #ThreatIntel',
                    '',
                    'FIRST COMMENT: https://pranithjain.qzz.io/blog/x',
                ].join('\n'),
            }),
        };
        const res = await generateLinkedinContent(mockPost, ai, new Date());
        // The three consecutive tight blocks merge into one dense block.
        expect(res.linkedin).toContain('First short line.\nSecond short line.\nThird short line.');
        expect(res.linkedin).not.toContain('First short line.\n\nSecond short line.');
        // The list, hashtag, and FIRST COMMENT are NOT merged with the body.
        expect(res.linkedin).toContain('\n\n- bullet 1');
        expect(res.linkedin).toContain('\n\n#DFIR #ThreatIntel');
        expect(res.linkedin).toContain('\n\nFIRST COMMENT:');
    });
    it('keeps a long single-line paragraph as its own block (not merged with neighbors)', async () => {
        const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
        const long = 'x'.repeat(200);
        const ai = {
            run: async () => ({ response: `Short one.\n\n${long}\n\nShort two.` }),
        };
        const res = await generateLinkedinContent(mockPost, ai, new Date());
        // The long line is its own block, so the short lines stay separated from it.
        expect(res.linkedin).toContain(`Short one.\n\n${long}\n\nShort two.`);
    });
});

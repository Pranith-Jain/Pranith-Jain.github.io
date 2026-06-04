# Phase 3 — LinkedIn & Twitter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the LinkedIn and Twitter/X social prompts in `api/src/case-study/generation/social.ts` to the 2026 reach rules (no body/first-post link, link-in-comment/reply blocks, more hashtags, longer technical threads, bookmark/reply optimization) and surface per-platform best-time hints in the admin Published tab.

**Architecture:** `buildTwitterPrompt(post)` and `buildLinkedinPrompt(post)` are pure string builders inside `social.ts`; they are exercised in tests indirectly via `generateTwitterContent` / `generateLinkedinContent` with a mock `Ai` that captures the `messages` array (the established pattern in `api/test/case-study/generation/social.test.ts`). The best-time hint is a static, pure helper in the frontend (`src/pages/admin/socialHints.ts`) rendered inside `PublishedTab.tsx`'s `SocialContentPanel` — no API/KV/schema change, because the hint is constant per platform and not generated content.

**Tech Stack:** TypeScript, Cloudflare Workers (Hono), Groq/Workers AI for generation, Vitest (`@cloudflare/vitest-pool-workers` for `api/`, jsdom + `@testing-library/react` for `src/`), React 18 + Tailwind.

---

## Conventions for every task

- **API prompt tests** live at `api/test/case-study/generation/social.test.ts` and run with:
  `cd /Users/pranith/Documents/portfolio/api && npx vitest run test/case-study/generation/social.test.ts`
  (this file is under `test/case-study/`, NOT `test/routes/`, so it runs in CI with no special flag — plain `npx vitest run`).
- **Frontend tests** live under `src/` and run with:
  `cd /Users/pranith/Documents/portfolio && npx vitest run src/test/socialHints.test.ts`
- The prompt builders `buildTwitterPrompt` / `buildLinkedinPrompt` stay **private** (not exported). Assert on the captured `user` message string (the prompt) — assert it CONTAINS new rule fragments and does NOT contain removed ones.
- Keep every saved state compilable (the typecheck-on-edit hook blocks on TS errors). After each `social.ts` edit the file must still type-check; `tsc -p api/tsconfig.worker.json` is not required here (`social.ts` is under `api/src`, covered by the per-edit hook), but run `cd api && npx tsc --noEmit` if unsure.
- Deploy is out of scope for this plan (Phase 3 is generation + UI only). If deploying, do it from repo ROOT, never `api/`.
- The existing test file at lines 40-56 asserts the OLD LinkedIn contract (`'210 characters'`, `'1300-2000 characters'`, `/at most two lowercase hashtags/i`, `'No raw URLs in the body'`) and lines 60-88 the OLD Twitter contract (`'2-5 posts'`, `'No hashtags'`). These assertions will be UPDATED in-place by the tasks below — do not leave both old and new asserting contradictory things.

---

## Task 1 — Twitter/X prompt rewrite (2026 Grok rules)

Rewrite `buildTwitterPrompt` so: no link in the first post; a `FIRST REPLY:` block carries the link (or the link goes only in the final post); thread length `5-8` posts for technical breakdowns (single post for breaking news); explicit bookmark optimization (IOC lists, detection rules, command cheatsheets) and reply optimization (arguable/analytical takes); first post stands alone in ≤280 chars; 0-1 hashtag; 0-1 functional emoji max.

**Files**

- Modify: `api/src/case-study/generation/social.ts:33` (`buildTwitterPrompt`)
- Test: `api/test/case-study/generation/social.test.ts` (the `describe('Twitter prompt', …)` block, lines 59-89)

**Steps**

- [ ] (1) Replace the two Twitter test cases in `api/test/case-study/generation/social.test.ts` with the new contract. Use this REAL code for the `describe('Twitter prompt', …)` block:

  ```ts
  describe('Twitter prompt', () => {
    it('encodes the 2026 Grok thread contract: link-in-reply, 5-8 technical thread, bookmark+reply optimization', async () => {
      const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
      await generateTwitterContent(
        mockPost,
        mockAi((msgs) => {
          const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
          // Reach-killer fix: NO link in the first post.
          expect(user).toContain('FIRST REPLY:');
          expect(user).toMatch(/no link in (the )?(first|opening) post/i);
          // Thread length bumped for technical breakdowns.
          expect(user).toContain('5-8 posts');
          expect(user).toMatch(/single post/i); // breaking news / hot take
          // 2026 signals.
          expect(user).toMatch(/bookmark/i);
          expect(user).toMatch(/repl(y|ies)/i);
          // First post stands alone, char + hashtag + emoji limits.
          expect(user).toContain('stand alone');
          expect(user).toContain('280');
          expect(user).toMatch(/0-1 hashtag/i);
          expect(user).toMatch(/0-1 .*emoji/i);
          // Removed legacy fragments.
          expect(user).not.toContain('2-5 posts');
          expect(user).not.toContain('3-6 tweets');
          expect(user).not.toContain('5-7 tweets');
        }),
        new Date()
      );
    });

    it('includes the post URL only in the reply/final-post slot', async () => {
      const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
      await generateTwitterContent(
        mockPost,
        mockAi((msgs) => {
          const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
          expect(user).toContain('pranithjain.qzz.io/blog/cve-2026-20182-cisco-catalyst-sd-wan-con');
        }),
        new Date()
      );
    });
  });
  ```

- [ ] (2) Run: `cd /Users/pranith/Documents/portfolio/api && npx vitest run test/case-study/generation/social.test.ts` — expect FAIL (the current prompt has `2-5 posts`, `No hashtags`, no `FIRST REPLY:`, no `5-8 posts`).
- [ ] (3) Replace `buildTwitterPrompt` in `api/src/case-study/generation/social.ts` (currently lines 33-57) with this REAL implementation:
  ```ts
  function buildTwitterPrompt(post: Post): string {
    const postUrl = `https://pranithjain.qzz.io/blog/${post.slug}`;
    return (
      `<format name="X/Twitter thread (2026)">\n` +
      `- LENGTH: 5-8 posts for a technical breakdown (IOCs, detection logic, exploit chain). A single post for breaking news or a sharp hot take. Use only what the facts justify — fewer dense posts beat a padded thread.\n` +
      `- REACH RULE (critical): put NO link in the first/opening post. Under X's Grok semantic ranking a first-post link gets ~0% reach for non-Premium accounts. The first post earns the click on its own.\n` +
      `- Emit a trailing block on its own, exactly: "FIRST REPLY: ${postUrl}" — the link goes in the first reply to the thread, never in post 1. (You may instead place the link only in the FINAL post if the thread reads better that way, but prefer FIRST REPLY.)\n` +
      `- Post 1 must STAND ALONE in <= 280 chars: the single sharpest specific (a number, a contrast, a named target). It does NOT start with "1/" and is not a teaser — it delivers a real point even if nobody reads on.\n` +
      `- OPTIMIZE FOR BOOKMARKS: bookmarks are the single highest-weighted 2026 signal (~10x a like). Make at least one middle post save-worthy — a tight IOC list, a detection rule (Sigma/KQL/SPL snippet), or a command cheatsheet pulled from the facts.\n` +
      `- OPTIMIZE FOR REPLIES: reply-conversation is the other top signal. Frame one post as an arguable, analytical take (a contrarian-but-defensible read) so practitioners answer back. End the thread on a substantive question, not "what do you think?".\n` +
      `- Middle posts: one concrete idea each — the detection angle, the attacker-economics read, the technical detail. Standalone-valuable.\n` +
      `- Append " (n/N)" at the END of each post (not the start). Each post < 270 chars incl. the counter.\n` +
      `- At most ONE hashtag total (0-1), only if it is a specific topical tag. At most ONE functional emoji total (0-1), only if it adds meaning — never decorative. No raw URLs anywhere except the single "FIRST REPLY: ${postUrl}" block (or the final post).\n` +
      `</format>\n\n` +
      `<examples>\n` +
      `GOOD post 1: "Lockbit5 posted 15 victims in 7 days — 4 already appeared under other affiliates this quarter. Same haul, second auction. Affiliate movement, not new compromise. (1/6)"\n` +
      `       ↑ specific count, contrast, named actor, analytical read, no link, no teaser language.\n` +
      `GOOD reply: "FIRST REPLY: ${postUrl}"\n` +
      `BAD post 1: "Big news in ransomware this week 🚨 — Lockbit5 is back and the implications are huge. Full write-up: ${postUrl} 🧵 (1/4)"\n` +
      `       ↑ link in the first post (kills reach), hype-noun, decorative emoji, teaser framing — exactly what the rules forbid.\n` +
      `BAD post 1: "1/ Today I want to talk about the Lockbit5 leak site activity over the last week. Let's dive in."\n` +
      `       ↑ "1/" prefix, "I want to talk about", "let's dive in" — preamble instead of payload.\n` +
      `</examples>\n\n` +
      `<input>\n` +
      `Title: ${post.title}\n\n` +
      `Body (lede + structure):\n${gist(post.body)}\n` +
      `</input>`
    );
  }
  ```
- [ ] (4) Run: `cd /Users/pranith/Documents/portfolio/api && npx vitest run test/case-study/generation/social.test.ts` — expect PASS (Twitter block + still-passing LinkedIn block from old asserts will be handled in Task 2; if the LinkedIn asserts already fail here, that's fine until Task 2, but they should still pass because Task 1 leaves `buildLinkedinPrompt` untouched).
- [ ] (5) Commit: `feat(social): rewrite Twitter/X prompt for 2026 Grok rules (link-in-reply, 5-8 thread, bookmark+reply optimization)`

---

## Task 2 — LinkedIn prompt rewrite (2026 interest-graph rules)

Rewrite `buildLinkedinPrompt` so: the link is NOT on its own line in the body (−50-60% reach); insight delivered natively; a separate `FIRST COMMENT:` block carries the link; hashtags bumped from 2 to 3-5 specific topical ones on the final line; an OPTIONAL carousel/document slide outline (5-10 slides) for technical breakdowns; keep the sub-210-char pre-fold hook, mobile-first short paragraphs, one scannable bullet list, and a substantive closing question.

**Files**

- Modify: `api/src/case-study/generation/social.ts:59` (`buildLinkedinPrompt`)
- Test: `api/test/case-study/generation/social.test.ts` (the `describe('LinkedIn prompt', …)` block, lines 27-57)

**Steps**

- [ ] (1) Replace the `describe('LinkedIn prompt', …)` block in `api/test/case-study/generation/social.test.ts` with the new contract. Use this REAL code:

  ```ts
  describe('LinkedIn prompt', () => {
    it('includes the post URL in user prompt', async () => {
      const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
      await generateLinkedinContent(
        mockPost,
        mockAi((msgs) => {
          const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
          expect(user).toContain('pranithjain.qzz.io/blog/cve-2026-20182-cisco-catalyst-sd-wan-con');
        }),
        new Date()
      );
    });

    it('encodes the 2026 LinkedIn contract: link-in-comment, 3-5 hashtags, optional carousel, fold + scannable list', async () => {
      const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
      await generateLinkedinContent(
        mockPost,
        mockAi((msgs) => {
          const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
          // Reach-killer fix: link in a separate FIRST COMMENT block, body stays link-free.
          expect(user).toContain('FIRST COMMENT:');
          expect(user).toMatch(/never put (the )?link in the (post )?body/i);
          expect(user).toMatch(/-?50-60% reach/);
          // Hashtags 2 -> 3-5.
          expect(user).toContain('3-5');
          expect(user).toMatch(/hashtag/i);
          // Optional carousel/document outline.
          expect(user).toMatch(/carousel|document/i);
          expect(user).toContain('5-10 slides');
          // Kept rules.
          expect(user).toContain('THE FOLD');
          expect(user).toContain('210 characters');
          expect(user).toMatch(/mobile-first/i);
          expect(user).toMatch(/scannable .* bulleted list/);
          // Removed legacy fragments.
          expect(user).not.toMatch(/at most two lowercase hashtags/i);
          expect(user).not.toContain('then the link on its own final line');
        }),
        new Date()
      );
    });
  });
  ```

- [ ] (2) Run: `cd /Users/pranith/Documents/portfolio/api && npx vitest run test/case-study/generation/social.test.ts` — expect FAIL (current prompt has no `FIRST COMMENT:`, no `3-5`, no `5-10 slides`, and still has `at most TWO lowercase hashtags` + `the link on its own final line`).
- [ ] (3) Replace `buildLinkedinPrompt` in `api/src/case-study/generation/social.ts` (currently lines 59-84) with this REAL implementation:
  ```ts
  function buildLinkedinPrompt(post: Post): string {
    const postUrl = `https://pranithjain.qzz.io/blog/${post.slug}`;
    return (
      `<format name="LinkedIn post (2026)">\n` +
      `- THE FOLD: only the first ~210 characters show before "...more". The first 1-2 lines must carry the single most specific, surprising fact and make the reader expand. No throat-clearing, no "I've been thinking about", no label like "New post:".\n` +
      `- REACH RULE (critical): never put the link in the post body. An external link in the body costs -50-60% reach on LinkedIn in 2026. Deliver the insight NATIVELY in the post so it stands on its own with no click required.\n` +
      `- Emit the link in a separate block on its own line, exactly: "FIRST COMMENT: ${postUrl}" — this goes in the first comment, never in the body. The post body stays completely link-free.\n` +
      `- Then the analysis: the pattern or contrast, the technical detail that matters (CVSS / CWE / exploit chain / affected versions / detection logic / victimology — only what the facts support, no padding).\n` +
      `- Formatting is mobile-first: very short paragraphs (1-3 lines), a blank line between almost every paragraph, generous white space. No walls of text.\n` +
      `- Include ONE scannable "- " bulleted list (4-8 items) of concrete specifics (named victims / affected products+versions / CVEs / IOCs — whichever the data has). Do not skip it.\n` +
      `- Defensive takeaway must be specific to THIS threat model and non-obvious. If the facts don't support concrete defense, say plainly what actually reduces exposure (the detection gap, the access vector, the recovery posture) in one or two sharp lines.\n` +
      `- Close with one substantive question that provokes a practitioner reply (not "what do you think?"). The closing question is the LAST line of the body — do NOT follow it with a link.\n` +
      `- 1300-2000 characters in the body. Put 3-5 specific, topical hashtags on the FINAL line of the body (after the closing question), space-separated, e.g. "#DFIR #ThreatIntel #IncidentResponse". Never a stack mid-sentence, never generic tags.\n` +
      `- OPTIONAL — for a technical breakdown you MAY instead/also output a carousel/document slide outline (the highest-reach LinkedIn format now): emit a block beginning "CAROUSEL OUTLINE:" with 5-10 slides, one line per slide as "Slide N: <title> — <one-line content>". Slide 1 is the hook, the last slide is the takeaway + the FIRST COMMENT link reminder. Only do this when the facts justify a multi-slide breakdown.\n` +
      `- Bold at most one phrase with **asterisks**, only if it earns it. No emojis. No raw URLs in the body — the only link is in the "FIRST COMMENT: ${postUrl}" block.\n` +
      `</format>\n\n` +
      `<examples>\n` +
      `HOOK — GOOD: "Lockbit5 dropped 15 new victims this week — but 4 of those targets already appeared on a different affiliate's leak site this quarter. The same haul is being re-auctioned. Affiliate dispute, not new compromise."\n` +
      `HOOK — BAD: "🚨 New blog post: Lockbit5 ransomware is back, and the threat landscape continues to evolve. In this analysis I break down what we're seeing and what it means for defenders…"\n` +
      `HOOK — BAD: "I've been thinking about ransomware affiliate movement lately. Here are some observations from the latest Lockbit5 activity."\n` +
      `CLOSING — GOOD: "If your IR retainer doesn't cover the affiliate-handoff case (same encryptor, new negotiator), how are you triaging the second extortion attempt?"\n` +
      `CLOSING — BAD: "What do you think? Let me know in the comments!"\n` +
      `HASHTAGS — GOOD final line: "#DFIR #ThreatIntel #IncidentResponse #Ransomware"\n` +
      `LINK — GOOD trailing block: "FIRST COMMENT: ${postUrl}"\n` +
      `</examples>\n\n` +
      `<input>\n` +
      `Title: ${post.title}\n\n` +
      `Body (lede + structure):\n${gist(post.body)}\n` +
      `</input>`
    );
  }
  ```
- [ ] (4) Run: `cd /Users/pranith/Documents/portfolio/api && npx vitest run test/case-study/generation/social.test.ts` — expect PASS (both LinkedIn and Twitter blocks, plus the unchanged `system prompt` and `generateSocialContent` blocks).
- [ ] (5) Commit: `feat(social): rewrite LinkedIn prompt for 2026 (link-in-comment, 3-5 hashtags, optional carousel outline)`

---

## Task 3 — Loosen char-limit truncation so FIRST COMMENT / FIRST REPLY survive

`enforceCharLimit(text, LINKEDIN_MAX_CHARS=2000)` (lines 86-105, 125-126) truncates LinkedIn output at 2000 chars at a sentence/newline boundary. The new prompt asks for a 1300-2000-char BODY **plus** an extra `FIRST COMMENT: <url>` line **plus** 3-5 hashtags **plus** an optional 5-10-line carousel outline — so legitimate output now routinely exceeds 2000 chars and the `FIRST COMMENT:` block (which is appended last) would be silently truncated away, defeating the whole reach fix. Raise the LinkedIn cap and ensure the link block is preserved. Twitter's combined-thread output also grows (5-8 posts + `FIRST REPLY:`); the existing 280-char cap applied to the WHOLE thread in `generateSocialContent` (line 125) was already wrong for multi-post threads but is out of scope to redesign — only ensure the `FIRST REPLY:` link is not truncated by raising the relevant cap used for the combined Twitter field.

Note: the per-platform endpoints (`generateTwitterContent`, `generateLinkedinContent`) do NOT call `enforceCharLimit` (they return `res.text.trim()` raw — lines 144-170), so they are already safe. Only the combined `generateSocialContent` path truncates.

**Files**

- Modify: `api/src/case-study/generation/social.ts:86-105` (`TWITTER_MAX_CHARS`, `LINKEDIN_MAX_CHARS`, `enforceCharLimit`) and `:107-142` (`generateSocialContent`)
- Test: `api/test/case-study/generation/social.test.ts` (`describe('generateSocialContent', …)`, lines 110-120)

**Steps**

- [ ] (1) Add a failing test to the `describe('generateSocialContent', …)` block in `api/test/case-study/generation/social.test.ts`. Insert this `it` after the existing `produces both twitter and linkedin` case:
  ```ts
  it('preserves the FIRST COMMENT link block on a long LinkedIn body', async () => {
    const { generateSocialContent } = await import('../../../src/case-study/generation/social');
    // A 2100-char body followed by the link block — the OLD 2000 cap would cut the link.
    const longLinkedin = 'x'.repeat(2100) + '\n\nFIRST COMMENT: https://pranithjain.qzz.io/blog/' + mockPost.slug;
    const ai = {
      run: async (_model: any, input: any) => {
        const user = input.messages.find((m: any) => m.role === 'user')?.content ?? '';
        // Twitter prompt has no "THE FOLD"; LinkedIn prompt does.
        return { response: user.includes('THE FOLD') ? longLinkedin : 'tweet thread' };
      },
    } as any;
    const res = await generateSocialContent(mockPost, ai, new Date());
    expect(res.linkedin).toContain('FIRST COMMENT: https://pranithjain.qzz.io/blog/' + mockPost.slug);
  });
  ```
- [ ] (2) Run: `cd /Users/pranith/Documents/portfolio/api && npx vitest run test/case-study/generation/social.test.ts` — expect FAIL (the 2100-char body is cut at 2000 and the `FIRST COMMENT:` block is dropped).
- [ ] (3) In `api/src/case-study/generation/social.ts`, raise the LinkedIn cap and add link-block preservation. Replace the constants block (currently lines 86-88):
  ```ts
  /** Maximum character limits per platform. */
  const TWITTER_MAX_CHARS = 280;
  const LINKEDIN_MAX_CHARS = 2000;
  ```
  with:
  ```ts
  /**
   * Maximum character limits per platform.
   * LINKEDIN: the 1300-2000-char BODY plus a trailing "FIRST COMMENT: <url>"
   * block, 3-5 hashtags, and an optional 5-10-line carousel outline now push
   * legitimate output past 2000. Cap the combined field generously so the
   * appended link block survives; the per-platform endpoints don't truncate.
   * TWITTER: 280 is the single-post limit; the combined field holds a whole
   * thread + a "FIRST REPLY: <url>" block, so cap it generously too.
   */
  const TWITTER_MAX_CHARS = 2500;
  const LINKEDIN_MAX_CHARS = 4000;
  ```
  Then replace `enforceCharLimit` (currently lines 94-105) with a version that never severs a trailing `FIRST COMMENT:` / `FIRST REPLY:` link block:
  ```ts
  function enforceCharLimit(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    // Never truncate away the link block — it carries the whole 2026 reach fix.
    const linkBlockMatch = text.match(/\n*(?:FIRST COMMENT:|FIRST REPLY:)[^\n]*$/);
    const linkBlock = linkBlockMatch ? linkBlockMatch[0] : '';
    const bodyLimit = maxChars - linkBlock.length;
    const body = linkBlock ? text.slice(0, text.length - linkBlock.length) : text;
    if (body.length <= bodyLimit) return body + linkBlock;
    const truncated = body.slice(0, bodyLimit - 1);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline);
    const cutBody = cutPoint > bodyLimit * 0.7 ? truncated.slice(0, cutPoint + 1).trim() : truncated.trim() + '…';
    return cutBody + linkBlock;
  }
  ```
- [ ] (4) Run: `cd /Users/pranith/Documents/portfolio/api && npx vitest run test/case-study/generation/social.test.ts` — expect PASS (new case + all prior cases).
- [ ] (5) Commit: `fix(social): raise combined social char caps + preserve FIRST COMMENT/REPLY link block on truncation`

---

## Task 4 — Best-time hint helper (pure, frontend)

Add a pure helper that returns a per-platform best-time-to-post hint string (Tue-Thu mornings, audience timezone) so the admin UI can render it. Keep it a standalone module so it is trivially unit-tested without rendering.

**Files**

- Create: `src/pages/admin/socialHints.ts`
- Test: `src/test/socialHints.test.ts`

**Steps**

- [ ] (1) Create the failing test `src/test/socialHints.test.ts` with this REAL code:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { bestTimeHint } from '../pages/admin/socialHints';

  describe('bestTimeHint', () => {
    it('returns a Tue-Thu morning hint for LinkedIn', () => {
      const h = bestTimeHint('linkedin');
      expect(h).toMatch(/Tue.?[–-].?Thu/);
      expect(h).toMatch(/morning/i);
      expect(h).toMatch(/time zone|timezone/i);
    });

    it('returns a Tue-Thu morning hint for Twitter', () => {
      const h = bestTimeHint('twitter');
      expect(h).toMatch(/Tue.?[–-].?Thu/);
      expect(h).toMatch(/morning/i);
    });
  });
  ```

- [ ] (2) Run: `cd /Users/pranith/Documents/portfolio && npx vitest run src/test/socialHints.test.ts` — expect FAIL (module `src/pages/admin/socialHints.ts` does not exist).
- [ ] (3) Create `src/pages/admin/socialHints.ts` with this REAL code:

  ```ts
  // Static best-time-to-post hints surfaced in the admin Published tab.
  // Grounded in 2025-2026 engagement data: B2B/security audiences are most
  // active Tue-Thu mornings in the audience's local time zone. These are
  // hints for the human posting manually — there is no auto-posting.
  export type SocialPlatform = 'linkedin' | 'twitter';

  export function bestTimeHint(platform: SocialPlatform): string {
    const window = 'Tue–Thu, 8-10am';
    const tz = "(audience's local time zone)";
    if (platform === 'linkedin') {
      return `Best time to post: ${window} ${tz}. LinkedIn also rewards late-PM (~5-6pm) on the same days.`;
    }
    return `Best time to post: ${window} ${tz}. Avoid first-post links — keep the link in the first reply.`;
  }
  ```

- [ ] (4) Run: `cd /Users/pranith/Documents/portfolio && npx vitest run src/test/socialHints.test.ts` — expect PASS.
- [ ] (5) Commit: `feat(admin): add per-platform best-time-to-post hint helper`

---

## Task 5 — Render best-time hints in PublishedTab

Surface the Task 4 hints inside the `SocialContentPanel` in `src/pages/admin/PublishedTab.tsx`, one per platform (next to the Twitter Thread and LinkedIn Post sub-headings).

**Files**

- Modify: `src/pages/admin/PublishedTab.tsx` (import at top + `SocialContentPanel`, lines 291-377)
- Test: `src/test/publishedTabHints.test.tsx` (new)

**Steps**

- [ ] (1) Create the failing test `src/test/publishedTabHints.test.tsx` with this REAL code (renders the panel directly via a tiny harness so we don't need to mock the whole admin fetch flow). Because `SocialContentPanel` is not exported, render `PublishedTab` and drive it through the mocked social GET — but simpler and stable: assert the hint text appears once the panel is open. Use this approach that mounts `PublishedTab` with a mocked `fetch` returning one post + existing social so the panel auto-shows:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import PublishedTab from '../pages/admin/PublishedTab';

  beforeEach(() => {
    localStorage.setItem('adminToken', 'sekret');
    vi.restoreAllMocks();
  });

  describe('PublishedTab best-time hints', () => {
    it('shows per-platform best-time hints when a post has social content', async () => {
      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith('/posts')) {
          return new Response(
            JSON.stringify({
              posts: [
                { slug: 'cve-1', title: 'Test CVE', type: 'cve', excerpt: 'e', publishedAt: '2026-06-01T00:00:00Z', tags: [] },
              ],
            })
          );
        }
        if (u.includes('/social/cve-1')) {
          return new Response(
            JSON.stringify({
              ok: true,
              social: { slug: 'cve-1', twitter: 'tw', linkedin: 'li', generatedAt: '2026-06-01T00:00:00Z' },
            })
          );
        }
        return new Response(JSON.stringify({ ok: true }));
      }) as unknown as typeof fetch;

      render(<PublishedTab />);
      // Open the social panel for the row.
      await waitFor(() => expect(screen.getByText('Test CVE')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /^View$/i }));
      await waitFor(() => {
        expect(screen.getAllByText(/Best time to post/i).length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText(/Tue.?[–-].?Thu/).length).toBeGreaterThanOrEqual(2);
      });
    });
  });
  ```

  (If `getJson`/`adminApi` reads the token from `localStorage` under a different key, mirror `src/test/admin.test.tsx`'s Map-backed localStorage setup at lines 10-30. Verify against `src/pages/admin/adminApi.ts` before finalizing the test; the assertion on hint text is the load-bearing part.)

- [ ] (2) Run: `cd /Users/pranith/Documents/portfolio && npx vitest run src/test/publishedTabHints.test.tsx` — expect FAIL (no "Best time to post" text rendered yet).
- [ ] (3) In `src/pages/admin/PublishedTab.tsx`, add the import after line 2 (`import { getJson, postJson, postJsonWithBody } from './adminApi';`):
  ```ts
  import { bestTimeHint } from './socialHints';
  ```
  Then in `SocialContentPanel`, add the Twitter hint immediately after the Twitter `<pre>` (currently lines 346-348, the `</pre>` that closes the Twitter block). Insert right after that closing `</pre>`:
  ```tsx
  <p className="mt-2 text-[11px] text-slate-500">{bestTimeHint('twitter')}</p>
  ```
  And add the LinkedIn hint immediately after the LinkedIn `<pre>` (currently lines 371-373, the `</pre>` that closes the LinkedIn block). Insert right after that closing `</pre>`:
  ```tsx
  <p className="mt-2 text-[11px] text-slate-500">{bestTimeHint('linkedin')}</p>
  ```
- [ ] (4) Run: `cd /Users/pranith/Documents/portfolio && npx vitest run src/test/publishedTabHints.test.tsx` — expect PASS. Also run `cd /Users/pranith/Documents/portfolio && npx vitest run src/test/admin.test.tsx` to confirm no admin-shell regression.
- [ ] (5) Commit: `feat(admin): show per-platform best-time-to-post hints in PublishedTab social panel`

---

## Task 6 — Full Phase 3 verification & sweep

Confirm the whole phase is green and nothing else asserts the old contract.

**Files**

- (verification only)

**Steps**

- [ ] (1) Grep for any other test or source still asserting the removed Twitter/LinkedIn fragments:
      `cd /Users/pranith/Documents/portfolio && grep -rn "2-5 posts\|at most two lowercase hashtags\|on its own final line\|No hashtags\b\|3-6 tweets\|5-7 tweets" api/test api/src src` — expect NO results in test expectations beyond the `not.toContain` guards added in Tasks 1-2 (those are intentional). Fix any stray legacy assertion found.
- [ ] (2) Run the full social API test file: `cd /Users/pranith/Documents/portfolio/api && npx vitest run test/case-study/generation/social.test.ts` — expect PASS.
- [ ] (3) Run the affected frontend tests: `cd /Users/pranith/Documents/portfolio && npx vitest run src/test/socialHints.test.ts src/test/publishedTabHints.test.tsx src/test/admin.test.tsx` — expect PASS.
- [ ] (4) Typecheck both sides: `cd /Users/pranith/Documents/portfolio/api && npx tsc --noEmit` and `cd /Users/pranith/Documents/portfolio && npx tsc --noEmit` (or `npm run lint`) — expect no errors.
- [ ] (5) Commit (if the sweep changed anything): `test(social): sweep legacy social-prompt assertions for Phase 3`

---

## Phase 3 acceptance (from spec §5.3) — final checklist

- [ ] LinkedIn prompt: link emitted in a `FIRST COMMENT:` block, body link-free (`never put the link in the body` + `-50-60% reach`), 3-5 hashtags on the final line, optional `CAROUSEL OUTLINE:` (5-10 slides). (Tasks 2-3)
- [ ] Twitter prompt: 5-8 post technical threads (single post for breaking news), link in `FIRST REPLY:`/final post, explicit bookmark + reply optimization, first post ≤280 standalone, 0-1 hashtag, 0-1 emoji. (Tasks 1, 3)
- [ ] Admin UI shows best-time hints for each platform (Tue-Thu mornings, audience tz). (Tasks 4-5)
- [ ] All saved states compile; social API test + frontend tests + typecheck green. (Task 6)

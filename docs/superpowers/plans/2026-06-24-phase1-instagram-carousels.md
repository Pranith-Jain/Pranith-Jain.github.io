# Phase 1: Instagram + Server-Side Visual Carousels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Instagram a first-class output of the blog→social pipeline, with brand-accurate carousel slides rendered to PNG inside Cloudflare Workers (no headless browser), previewable/downloadable in `/admin`, tracked via the existing mark-posted flow.

**Architecture:** Extend `generateSocialContent` to also produce an Instagram caption + a carousel slide spec (`ContentSlide[]`). A new pure SVG engine renders one slide (1080×1350) from a slide spec using `BRAND` tokens; the existing `resvg-wasm` path rasterizes it to PNG. An admin-gated route renders slides on demand for preview/download. Types/storage extensions are additive and back-compatible.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, `@resvg/resvg-wasm`, Vitest (`--pool=forks`), React (admin UI).

## Global Constraints

- **Deploy from repo root** (`wrangler.jsonc` → Worker `pranithjain`), `npm run deploy`; rebase onto `origin/main` before deploy. NOT from `api/`.
- **Typecheck all three projects:** `tsc -p tsconfig.json`, `tsc -p api/tsconfig.json`, `tsc -p api/tsconfig.worker.json`. esbuild deploys past tsc — type errors accumulate invisibly.
- **API route tests** run locally only (CI skips `test/routes/`); vitest-pool-workers needs the sandbox disabled. Run api unit tests with `vitest --pool=forks` (workers pool dies on Node 25).
- **KV binding** for posts/social is `CASE_STUDIES`; cache is `KV_CACHE`. D1 is `BRIEFINGS_DB`.
- **Free-plan limit:** 50 subrequests/invocation (KV + Cache-API both count). Social generation is fire-and-forget per publish (one post per invocation) — render route is one slide per request.
- **Workers wasm:** import `.wasm` as a build-time module only; runtime `WebAssembly.instantiate()` is blocked.
- **Branch hygiene:** commit on the feature branch; `main` auto-FF-merges mid-session — never rebase/force-push/`branch -f main`; re-check branch before any git mutation.
- **Canvas:** Instagram carousel = **1080×1350**. Caption ≤ **2200** chars. Fonts: **Bricolage Grotesque** (display) + **Hanken Grotesk** (body). Brand mark text: `pranithjain.qzz.io`.
- **Two duplicate `SocialContent` types** exist: `api/src/case-study/generation/social.ts:8` (the one actually generated/stored) and `api/src/case-study/types.ts:137`. Both get the new fields (Task 1).

---

### Task 1: Shared slide model + additive type extensions

**Files:**

- Create: `api/src/case-study/social/slide-spec.ts`
- Modify: `api/src/case-study/generation/social.ts:8-17` (add fields to its `SocialContent`)
- Modify: `api/src/case-study/types.ts:137-160` (add fields to `SocialContent` + `SocialSchedule`)
- Test: `api/test/case-study/social/slide-spec.test.ts`

**Interfaces:**

- Produces: `ContentSlide`, `SlideKind`, `CarouselSpec`, `clampSlides(slides, min, max)`; `SocialContent.instagram?: string`, `SocialContent.carousel?: CarouselSpec`; `SocialScheduleEntry` reused for `SocialSchedule.instagram?`.

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/social/slide-spec.test.ts
import { describe, it, expect } from 'vitest';
import { clampSlides, type ContentSlide } from '../../../src/case-study/social/slide-spec';

const slide = (headline: string): ContentSlide => ({ index: 0, headline });

describe('clampSlides', () => {
  it('pads nothing but truncates to max, preserving order', () => {
    const many = Array.from({ length: 12 }, (_, i) => slide(`h${i}`));
    const out = clampSlides(many, 3, 8);
    expect(out).toHaveLength(8);
    expect(out[0]!.headline).toBe('h0');
    expect(out.map((s, i) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns [] when given fewer than min (caller falls back)', () => {
    expect(clampSlides([slide('a')], 3, 8)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run --pool=forks test/case-study/social/slide-spec.test.ts`
Expected: FAIL — cannot find module `slide-spec`.

- [ ] **Step 3: Create the shared slide model**

```ts
// api/src/case-study/social/slide-spec.ts
// Shared carousel slide contract. Used by the online generation engine
// (api/) and mirrors social-content/src/content-spec.ts so both speak one
// shape. Online subset only — no thread/reel fields.

export type SlideKind = 'hook' | 'content' | 'list' | 'stat' | 'cta';

export interface ContentSlide {
  /** 0-indexed position in the carousel. */
  index: number;
  /** Large headline text. */
  headline: string;
  /** Optional supporting body. */
  body?: string;
  /** Optional scannable bullets (renders as a list). */
  bullets?: string[];
  /** Optional highlighted statistic. */
  stat?: { value: string; label: string };
  /** Optional explicit kind; otherwise derived (slide 0 = hook, last = cta). */
  kind?: SlideKind;
}

export interface CarouselSpec {
  format: 'instagram';
  slides: ContentSlide[];
}

/**
 * Bound a slide list to [min, max]. Returns [] when below min so the caller
 * can fall back to a deterministic builder. Re-indexes kept slides.
 */
export function clampSlides(slides: ContentSlide[], min: number, max: number): ContentSlide[] {
  if (slides.length < min) return [];
  return slides.slice(0, max).map((s, i) => ({ ...s, index: i }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run --pool=forks test/case-study/social/slide-spec.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Extend the two `SocialContent` types + `SocialSchedule`**

In `api/src/case-study/generation/social.ts`, change the interface at line 8:

```ts
import type { CarouselSpec } from '../social/slide-spec';
// ...
export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  instagram?: string; // caption + hashtags (≤2200 chars)
  carousel?: CarouselSpec; // Instagram carousel slide specs (1080×1350)
  generatedAt: string;
  _validation?: {
    twitter_quality?: SocialQuality;
    linkedin_quality?: SocialQuality;
    instagram_quality?: SocialQuality;
  };
}
```

In `api/src/case-study/types.ts`, extend the `SocialContent` (line ~137) and `SocialSchedule` (line ~157):

```ts
import type { CarouselSpec } from './social/slide-spec';
// ...
export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  instagram?: string;
  carousel?: CarouselSpec;
  generatedAt: string;
}

export interface SocialSchedule {
  slug: string;
  twitter?: SocialScheduleEntry;
  linkedin?: SocialScheduleEntry;
  instagram?: SocialScheduleEntry;
  updatedAt: string;
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit -p api/tsconfig.json`
Expected: no new errors.

```bash
git add api/src/case-study/social/slide-spec.ts api/test/case-study/social/slide-spec.test.ts \
        api/src/case-study/generation/social.ts api/src/case-study/types.ts
git commit -m "feat(social): shared carousel slide model + Instagram type fields"
```

---

### Task 2: Pure SVG carousel renderer

**Files:**

- Create: `api/src/case-study/social/carousel-svg.ts`
- Test: `api/test/case-study/social/carousel-svg.test.ts`

**Interfaces:**

- Consumes: `ContentSlide`, `SlideKind` from `slide-spec.ts`.
- Produces: `renderCarouselSlideSvg(slide: ContentSlide, ctx: RenderCtx): string`, `type RenderCtx = { index: number; total: number; accent?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/social/carousel-svg.test.ts
import { describe, it, expect } from 'vitest';
import { renderCarouselSlideSvg } from '../../../src/case-study/social/carousel-svg';
import type { ContentSlide } from '../../../src/case-study/social/slide-spec';

const ctx = (i: number, total: number) => ({ index: i, total });

describe('renderCarouselSlideSvg', () => {
  it('emits a 1080x1350 SVG containing the headline', () => {
    const slide: ContentSlide = { index: 0, headline: 'Auth bypass on the edge', kind: 'hook' };
    const svg = renderCarouselSlideSvg(slide, ctx(0, 5));
    expect(svg).toMatch(/<svg[^>]*width="1080"[^>]*height="1350"/);
    expect(svg).toContain('Auth bypass on the edge');
  });

  it('XML-escapes headline text to prevent broken SVG', () => {
    const slide: ContentSlide = { index: 1, headline: 'A & B <script> "x"', kind: 'content' };
    const svg = renderCarouselSlideSvg(slide, ctx(1, 5));
    expect(svg).toContain('A &amp; B &lt;script&gt; &quot;x&quot;');
    expect(svg).not.toContain('<script>');
  });

  it('renders a pager "n/total" on non-cover slides', () => {
    const slide: ContentSlide = { index: 2, headline: 'Body', kind: 'content' };
    const svg = renderCarouselSlideSvg(slide, ctx(2, 6));
    expect(svg).toContain('3 / 6');
  });

  it('renders bullets when present', () => {
    const slide: ContentSlide = { index: 1, headline: 'Three things', bullets: ['One', 'Two', 'Three'], kind: 'list' };
    const svg = renderCarouselSlideSvg(slide, ctx(1, 5));
    expect(svg).toContain('One');
    expect(svg).toContain('Two');
    expect(svg).toContain('Three');
  });

  it('renders the brand URL on a cta slide', () => {
    const slide: ContentSlide = { index: 4, headline: 'Read the full analysis', kind: 'cta' };
    const svg = renderCarouselSlideSvg(slide, ctx(4, 5));
    expect(svg).toContain('pranithjain.qzz.io');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run --pool=forks test/case-study/social/carousel-svg.test.ts`
Expected: FAIL — cannot find module `carousel-svg`.

- [ ] **Step 3: Implement the renderer**

```ts
// api/src/case-study/social/carousel-svg.ts
import { BRAND } from '../../../../social-content/src/brand';
import type { ContentSlide, SlideKind } from './slide-spec';

export interface RenderCtx {
  index: number;
  total: number;
  /** Accent override (e.g. threat severity). Defaults to TOFU brand accent. */
  accent?: string;
}

const W = 1080;
const H = 1350;
const DISPLAY = 'Bricolage Grotesque';
const BODY = 'Hanken Grotesk';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Greedy word-wrap into at most `maxLines` lines of ~`perLine` chars. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const rest = words.slice(lines.join(' ').split(/\s+/).length).join(' ');
    if (rest) lines[maxLines - 1] = lines[maxLines - 1]!.replace(/\s*$/, '') + '…';
  }
  return lines;
}

function deriveKind(slide: ContentSlide, ctx: RenderCtx): SlideKind {
  if (slide.kind) return slide.kind;
  if (ctx.index === 0) return 'hook';
  if (ctx.index === ctx.total - 1) return 'cta';
  if (slide.stat) return 'stat';
  if (slide.bullets?.length) return 'list';
  return 'content';
}

function textLines(lines: string[], x: number, y: number, lh: number, attrs: string): string {
  return lines.map((ln, i) => `<text x="${x}" y="${y + i * lh}" ${attrs}>${esc(ln)}</text>`).join('');
}

/** Render one carousel slide (1080×1350) as an SVG string. Pure. */
export function renderCarouselSlideSvg(slide: ContentSlide, ctx: RenderCtx): string {
  const kind = deriveKind(slide, ctx);
  const accent = ctx.accent ?? BRAND.funnel.tofu.accent;
  const dark = BRAND.colors.neutral[950];
  const light = BRAND.colors.neutral[50];
  const ink = BRAND.colors.neutral[900];
  const isDark = kind === 'hook' || kind === 'cta';
  const bg = isDark ? dark : light;
  const fg = isDark ? '#ffffff' : ink;

  const pad = 96;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
  // Accent side bar (brand signature element).
  parts.push(`<rect x="0" y="0" width="16" height="${H}" fill="${accent}"/>`);

  // Headline.
  const headSize = kind === 'hook' ? 92 : 64;
  const headLines = wrap(slide.headline, kind === 'hook' ? 18 : 24, kind === 'hook' ? 5 : 4);
  const headY = kind === 'hook' ? 360 : 240;
  parts.push(
    textLines(
      headLines,
      pad,
      headY,
      headSize * 1.12,
      `font-family="${DISPLAY}" font-size="${headSize}" font-weight="700" fill="${fg}"`
    )
  );

  // Stat.
  if (kind === 'stat' && slide.stat) {
    parts.push(
      `<text x="${pad}" y="760" font-family="${DISPLAY}" font-size="220" font-weight="700" fill="${accent}">${esc(slide.stat.value)}</text>`
    );
    parts.push(
      `<text x="${pad}" y="840" font-family="${BODY}" font-size="40" fill="${fg}">${esc(slide.stat.label)}</text>`
    );
  }

  // Bullets / body.
  let cursorY = headY + headLines.length * headSize * 1.12 + 64;
  if (slide.bullets?.length) {
    for (const b of slide.bullets.slice(0, 5)) {
      const bl = wrap(b, 40, 2);
      parts.push(`<circle cx="${pad + 8}" cy="${cursorY - 14}" r="8" fill="${accent}"/>`);
      parts.push(textLines(bl, pad + 40, cursorY, 52, `font-family="${BODY}" font-size="40" fill="${fg}"`));
      cursorY += bl.length * 52 + 28;
    }
  } else if (slide.body && kind !== 'hook') {
    const bl = wrap(slide.body, 44, 6);
    parts.push(textLines(bl, pad, cursorY, 56, `font-family="${BODY}" font-size="42" fill="${fg}"`));
  }

  // Pager (not on the cover/hook slide).
  if (kind !== 'hook') {
    parts.push(
      `<text x="${W - pad}" y="${H - 72}" text-anchor="end" font-family="${BODY}" font-size="32" fill="${isDark ? '#ffffff' : BRAND.colors.neutral[400]}">${ctx.index + 1} / ${ctx.total}</text>`
    );
  }

  // Brand mark / URL on hook + cta.
  if (isDark) {
    parts.push(
      `<text x="${pad}" y="${H - 72}" font-family="${BODY}" font-size="34" font-weight="700" fill="${accent}">pranithjain.qzz.io</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run --pool=forks test/case-study/social/carousel-svg.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p api/tsconfig.json`
Expected: clean (note: importing from `social-content/src/brand.ts` — if api tsconfig excludes that path, copy the needed `BRAND` subset into `api/src/case-study/social/brand-tokens.ts` and import from there instead; verify with the typecheck).

```bash
git add api/src/case-study/social/carousel-svg.ts api/test/case-study/social/carousel-svg.test.ts
git commit -m "feat(social): pure SVG carousel slide renderer (1080x1350, brand tokens)"
```

---

### Task 3: Post → carousel slides (AI + deterministic fallback)

**Files:**

- Create: `api/src/case-study/social/carousel-build.ts`
- Test: `api/test/case-study/social/carousel-build.test.ts`

**Interfaces:**

- Consumes: `Post` (`../types`), `ContentSlide`/`clampSlides` (`./slide-spec`), `runCompletion` (`../generation/ai-client`).
- Produces: `buildCarouselSlides(post: Post, deps: { ai: Ai; groqKey?: string; googleKey?: string }): Promise<ContentSlide[]>`, and `deterministicSlides(post: Post): ContentSlide[]` (exported for tests + fallback), `parseSlidesJson(text: string): ContentSlide[] | null`.

- [ ] **Step 1: Write the failing test**

````ts
// api/test/case-study/social/carousel-build.test.ts
import { describe, it, expect } from 'vitest';
import { deterministicSlides, parseSlidesJson } from '../../../src/case-study/social/carousel-build';
import type { Post } from '../../../src/case-study/types';

const post = {
  slug: 'cve-2026-1234-fortigate',
  type: 'cve',
  title: 'CVE-2026-1234 — FortiGate Auth Bypass',
  excerpt: 'An unauthenticated bypass on the FortiGate management plane.',
  body: [
    'Intro paragraph that hooks the reader with the stakes.',
    '## Summary',
    'The bypass lets an attacker reach the admin plane unauthenticated.',
    '## Affected products',
    'FortiGate builds before 7.4.5.',
    '## Detection & mitigation',
    'Patch to 7.4.5 and remove the management interface from the internet.',
    '## References',
    '- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-1234)',
  ].join('\n\n'),
} as unknown as Post;

describe('deterministicSlides', () => {
  it('produces a bounded carousel (hook + sections + cta) from a post', () => {
    const slides = deterministicSlides(post);
    expect(slides.length).toBeGreaterThanOrEqual(3);
    expect(slides.length).toBeLessThanOrEqual(8);
    expect(slides[0]!.kind).toBe('hook');
    expect(slides[slides.length - 1]!.kind).toBe('cta');
    expect(slides[0]!.headline.length).toBeGreaterThan(0);
  });
});

describe('parseSlidesJson', () => {
  it('parses a fenced JSON array of slides', () => {
    const out = parseSlidesJson('```json\n[{"headline":"H","body":"B"}]\n```');
    expect(out).not.toBeNull();
    expect(out![0]!.headline).toBe('H');
  });
  it('returns null on malformed output', () => {
    expect(parseSlidesJson('not json at all')).toBeNull();
  });
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run --pool=forks test/case-study/social/carousel-build.test.ts`
Expected: FAIL — cannot find module `carousel-build`.

- [ ] **Step 3: Implement the builder**

````ts
// api/src/case-study/social/carousel-build.ts
import type { Ai } from '@cloudflare/workers-types';
import type { Post } from '../types';
import { runCompletion } from '../generation/ai-client';
import { clampSlides, type ContentSlide } from './slide-spec';

const MIN = 3;
const MAX = 8;

interface RawSlide {
  headline?: string;
  body?: string;
  bullets?: string[];
}

/** Pull "## " section headings + their first sentence from a post body. */
function sections(body: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  const re = /^##\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  const idxs: { title: string; start: number }[] = [];
  while ((m = re.exec(body))) idxs.push({ title: m[1]!.trim(), start: m.index + m[0].length });
  for (let i = 0; i < idxs.length; i++) {
    const end = i + 1 < idxs.length ? body.indexOf('\n## ', idxs[i]!.start) : body.length;
    const slice = body.slice(idxs[i]!.start, end < 0 ? body.length : end).trim();
    const firstSentence = slice.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0] ?? '';
    if (idxs[i]!.title.toLowerCase() !== 'references') {
      out.push({ heading: idxs[i]!.title, text: firstSentence.slice(0, 180) });
    }
  }
  return out;
}

/** Deterministic carousel from a post: hook → up to 5 sections → cta. Always valid. */
export function deterministicSlides(post: Post): ContentSlide[] {
  const secs = sections(post.body).slice(0, 5);
  const slides: ContentSlide[] = [];
  slides.push({ index: 0, kind: 'hook', headline: post.title.replace(/\s+—\s+/g, ' — ') });
  secs.forEach((s) => slides.push({ index: slides.length, kind: 'content', headline: s.heading, body: s.text }));
  slides.push({ index: slides.length, kind: 'cta', headline: 'Read the full analysis' });
  return clampSlides(slides, MIN, MAX).length ? slides.slice(0, MAX).map((s, i) => ({ ...s, index: i })) : slides;
}

/** Parse a (possibly fenced) JSON array of {headline,body,bullets} into slides. */
export function parseSlidesJson(text: string): ContentSlide[] | null {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as RawSlide[];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const slides = raw
      .filter((r) => typeof r.headline === 'string' && r.headline.trim())
      .map((r, i) => ({
        index: i,
        headline: r.headline!.trim().slice(0, 120),
        body: typeof r.body === 'string' ? r.body.trim().slice(0, 220) : undefined,
        bullets: Array.isArray(r.bullets) ? r.bullets.filter((b) => typeof b === 'string').slice(0, 5) : undefined,
      }));
    return slides.length ? slides : null;
  } catch {
    return null;
  }
}

const SLIDE_SYSTEM =
  'You turn a cybersecurity blog post into a punchy Instagram carousel. ' +
  'Output ONLY a JSON array of 5-7 slide objects {headline, body?, bullets?}. ' +
  'Slide 1 is a scroll-stopping hook (no body). Middle slides are scannable (short headline + 1-2 sentence body OR 3 bullets). ' +
  'Last slide is a call to action. Headlines <= 70 chars. Ground every claim in the post — invent nothing. No hashtags, no emoji.';

/** Build carousel slides via AI, falling back to deterministic extraction. */
export async function buildCarouselSlides(
  post: Post,
  deps: { ai: Ai; groqKey?: string; googleKey?: string }
): Promise<ContentSlide[]> {
  try {
    const res = await runCompletion(
      deps.ai,
      {
        system: SLIDE_SYSTEM,
        user: `Title: ${post.title}\n\nBody:\n${post.body.slice(0, 6000)}`,
        temperature: 0.6,
        maxTokens: 1200,
      },
      { groqKey: deps.groqKey, googleKey: deps.googleKey, quality: true }
    );
    const parsed = parseSlidesJson(res.text);
    if (parsed) {
      const withKinds = parsed.map((s, i) => ({
        ...s,
        kind:
          i === 0
            ? ('hook' as const)
            : i === parsed.length - 1
              ? ('cta' as const)
              : s.bullets?.length
                ? ('list' as const)
                : ('content' as const),
      }));
      const clamped = clampSlides(withKinds, MIN, MAX);
      if (clamped.length) return clamped;
    }
  } catch {
    // fall through to deterministic
  }
  return deterministicSlides(post);
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run --pool=forks test/case-study/social/carousel-build.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p api/tsconfig.json`
Expected: clean.

```bash
git add api/src/case-study/social/carousel-build.ts api/test/case-study/social/carousel-build.test.ts
git commit -m "feat(social): Post -> carousel slides (AI + deterministic fallback)"
```

---

### Task 4: Generate Instagram caption + carousel in the pipeline

**Files:**

- Modify: `api/src/case-study/generation/social.ts` (add `generateInstagramFromSource`, wire into `generateSocialFromSource`)
- Test: `api/test/case-study/generation/social-instagram.test.ts`

**Interfaces:**

- Consumes: `buildCarouselSlides` (Task 3), `generateWithValidation` + `SocialSource` + `postToSource` (existing in social.ts), `BRAND`.
- Produces: `SocialContent` now carries `instagram` (caption) + `carousel` (slides).

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/generation/social-instagram.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateSocialContent } from '../../../src/case-study/generation/social';
import type { Post } from '../../../src/case-study/types';

const post = {
  slug: 'cve-2026-1234-fortigate',
  type: 'cve',
  title: 'CVE-2026-1234 — FortiGate Auth Bypass',
  excerpt: 'An unauthenticated bypass on the FortiGate management plane.',
  body: '## Summary\n\nUnauthenticated bypass.\n\n## References\n\n- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-1234)',
} as unknown as Post;

describe('generateSocialContent — instagram', () => {
  it('produces an instagram caption and a carousel with >= 3 slides', async () => {
    const caption = 'Unauthenticated FortiGate bypass — what defenders need to know.\n\n#FortiGate #infosec #DFIR';
    const slidesJson = JSON.stringify([
      { headline: 'FortiGate is wide open' },
      { headline: 'What broke', body: 'Auth check is skippable.' },
      { headline: 'Patch now' },
    ]);
    // ai.run returns caption for the IG caption call and slides for the carousel call.
    const ai = { run: vi.fn(async () => ({ response: caption })) };
    // Force the carousel builder's AI call to yield slide JSON by routing on prompt content.
    ai.run = vi.fn(async (_model: string, opts: { messages: { content: string }[] }) => {
      const u = opts.messages.map((m) => m.content).join(' ');
      return { response: u.includes('Instagram carousel') ? slidesJson : caption };
    }) as never;

    const social = await generateSocialContent(post, ai as never, new Date('2026-05-19T15:05:00Z'));
    expect(typeof social.instagram).toBe('string');
    expect(social.instagram!.length).toBeGreaterThan(0);
    expect(social.instagram!.length).toBeLessThanOrEqual(2200);
    expect(social.carousel?.format).toBe('instagram');
    expect(social.carousel!.slides.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run --pool=forks test/case-study/generation/social-instagram.test.ts`
Expected: FAIL — `social.instagram` is undefined / `carousel` undefined.

- [ ] **Step 3: Add the Instagram generator + wire it in**

In `api/src/case-study/generation/social.ts`, add an import and a generator, then extend `generateSocialFromSource`:

```ts
// near the top imports
import { buildCarouselSlides } from '../social/carousel-build';
import type { Ai } from '@cloudflare/workers-types';

// Instagram caption prompt (visual-first, hashtags on their own line, link goes in profile/first-comment — IG captions aren't clickable).
function buildInstagramPrompt(src: SocialSource): string {
  return (
    `Write an Instagram caption for this analysis. <= 2200 characters.\n` +
    `- Open with a 1-2 line hook that stops the scroll (the carousel carries the depth).\n` +
    `- 3-5 short lines of value, practitioner voice. No markdown, no links in the body (IG captions aren't clickable).\n` +
    `- End with 5-8 specific hashtags on the final line (campaign/CVE/sector specific — never a generic #cybersecurity stack).\n\n` +
    `TITLE: ${src.title}\n\nSOURCE:\n${src.body.slice(0, 4000)}\n`
  );
}

async function generateInstagramFromSource(
  src: SocialSource,
  post: Post,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<{ caption: string; quality?: SocialQuality; slides: Awaited<ReturnType<typeof buildCarouselSlides>> }> {
  const [captionRes, slides] = await Promise.all([
    generateWithValidation(
      ai,
      SOCIAL_SYSTEM,
      buildInstagramPrompt(src),
      'instagram',
      src.body,
      groqKey,
      googleKey,
      1200
    ).catch(() => ({ text: '', quality: undefined as SocialQuality | undefined })),
    buildCarouselSlides(post, { ai, groqKey, googleKey }),
  ]);
  return { caption: captionRes.text.slice(0, 2200), quality: captionRes.quality, slides };
}
```

> **Note for the implementer:** `generateWithValidation(ai, system, prompt, platform, body, groqKey, googleKey, maxTokens)` currently accepts platform `'twitter' | 'linkedin'`. Widen its `platform` parameter type to include `'instagram'` and ensure its per-platform limit map has an `instagram: 2200` entry (search the function for the char-limit map and add the key). If `'instagram'` would fail an exhaustive `switch`, add the case mirroring `linkedin`.

Then extend `generateSocialFromSource` (the function returning `SocialContent`) — it needs the `Post` for the carousel builder. Change its signature to also accept the post, and update `generateSocialContent` to pass it:

```ts
// generateSocialFromSource(src, ai, now, groqKey, googleKey) -> add `post?: Post`
async function generateSocialFromSource(
  src: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string,
  post?: Post
): Promise<SocialContent> {
  const factNote = extractVerifiedFacts(src.body);
  const [twitterRes, linkedinRes, igRes] = await Promise.allSettled([
    generateWithValidation(
      ai,
      SOCIAL_SYSTEM,
      buildTwitterPrompt(src) + factNote,
      'twitter',
      src.body,
      groqKey,
      googleKey,
      1500
    ),
    generateWithValidation(
      ai,
      SOCIAL_SYSTEM,
      buildLinkedinPrompt(src) + factNote,
      'linkedin',
      src.body,
      groqKey,
      googleKey,
      2000
    ),
    post
      ? generateInstagramFromSource(src, post, ai, now, groqKey, googleKey)
      : Promise.resolve({ caption: '', quality: undefined, slides: [] }),
  ]);

  const ig = igRes.status === 'fulfilled' ? igRes.value : { caption: '', quality: undefined, slides: [] };
  return {
    slug: src.slug,
    twitter: twitterRes.status === 'fulfilled' ? twitterRes.value.text : '',
    linkedin: linkedinRes.status === 'fulfilled' ? linkedinRes.value.text : '',
    instagram: ig.caption || undefined,
    carousel: ig.slides.length ? { format: 'instagram', slides: ig.slides } : undefined,
    generatedAt: now.toISOString(),
    _validation: {
      twitter_quality: twitterRes.status === 'fulfilled' ? twitterRes.value.quality : undefined,
      linkedin_quality: linkedinRes.status === 'fulfilled' ? linkedinRes.value.quality : undefined,
      instagram_quality: ig.quality,
    },
  };
}

export async function generateSocialContent(
  post: Post,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<SocialContent> {
  return generateSocialFromSource(postToSource(post), ai, now, groqKey, googleKey, post);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run --pool=forks test/case-study/generation/social-instagram.test.ts`
Expected: PASS. Also run the existing `social.test.ts` to confirm no regression:
Run: `npx vitest run --pool=forks test/case-study/generation/social.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p api/tsconfig.json`
Expected: clean.

```bash
git add api/src/case-study/generation/social.ts api/test/case-study/generation/social-instagram.test.ts
git commit -m "feat(social): generate Instagram caption + carousel in the pipeline"
```

---

### Task 5: Rasterize a carousel slide to PNG (resvg) + Bricolage font

**Files:**

- Create: `worker/social-carousel-raster.ts`
- Add asset: `public/og/bricolage-700.ttf` (download Bricolage Grotesque 700, Latin subset)
- Test: `worker/social-carousel-raster.test.ts`

**Interfaces:**

- Consumes: `Env` (`./env`), the resvg pattern from `worker/og-raster.ts`.
- Produces: `carouselSlideToPng(env: Env, svg: string): Promise<Uint8Array>` (1080-wide PNG).

- [ ] **Step 1: Add the font asset**

Download Bricolage Grotesque 700 (OFL) and place at `public/og/bricolage-700.ttf`. Verify it loads via `env.ASSETS` like the existing `public/og/hanken-*.ttf`. (If subsetting: keep Latin + digits + common punctuation.)

```bash
ls -la public/og/hanken-700.ttf public/og/bricolage-700.ttf
```

Expected: both files exist.

- [ ] **Step 2: Write the failing smoke test**

```ts
// worker/social-carousel-raster.test.ts
import { describe, it, expect } from 'vitest';
import { carouselSlideToPng } from './social-carousel-raster';
import { readFileSync } from 'node:fs';

// Minimal Env stub: ASSETS.fetch returns the real font bytes from disk.
const env = {
  ASSETS: {
    fetch: async (req: Request) => {
      const path = new URL(req.url).pathname; // e.g. /og/hanken-400.ttf
      const bytes = readFileSync(`public${path}`);
      return new Response(bytes);
    },
  },
} as unknown as Parameters<typeof carouselSlideToPng>[0];

describe('carouselSlideToPng', () => {
  it('rasterizes an SVG to PNG (magic bytes)', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#fff"/><text x="80" y="200" font-family="Hanken Grotesk" font-size="48">hi</text></svg>';
    const png = await carouselSlideToPng(env, svg);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/pranith/Documents/portfolio && npx vitest run worker/social-carousel-raster.test.ts`
Expected: FAIL — cannot find module `social-carousel-raster`.

- [ ] **Step 4: Implement the rasterizer**

```ts
// worker/social-carousel-raster.ts
// SVG -> PNG for 1080x1350 Instagram carousel slides. Mirrors og-raster.ts
// (build-time wasm import, fonts from ASSETS, memoised per isolate) but at
// portrait width with the Bricolage display font added.
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import type { Env } from './env';

const ASSET_ORIGIN = 'https://og-assets.internal';
let wasmReady: Promise<void> | null = null;
let fontBuffers: Uint8Array[] | null = null;

async function assetBytes(env: Env, path: string): Promise<Uint8Array> {
  const res = await env.ASSETS.fetch(new Request(`${ASSET_ORIGIN}${path}`));
  if (!res.ok) throw new Error(`carousel asset ${path} -> HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasm).catch((err) => {
      wasmReady = null;
      throw err;
    });
  }
  return wasmReady;
}

async function ensureFonts(env: Env): Promise<Uint8Array[]> {
  if (!fontBuffers) {
    fontBuffers = await Promise.all([
      assetBytes(env, '/og/bricolage-700.ttf'),
      assetBytes(env, '/og/hanken-700.ttf'),
      assetBytes(env, '/og/hanken-400.ttf'),
    ]);
  }
  return fontBuffers;
}

/** Rasterise a carousel SVG to a 1080-wide PNG. */
export async function carouselSlideToPng(env: Env, svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const fonts = await ensureFonts(env);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
    font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Hanken Grotesk' },
  });
  return resvg.render().asPng();
}
```

> **Note:** `initWasm` throws if called twice per isolate. `og-raster.ts` already calls it for the same wasm module. To avoid a double-init across the two modules, the implementer should extract a shared `ensureResvgWasm()` (e.g. in `worker/resvg-shared.ts`) imported by BOTH `og-raster.ts` and `social-carousel-raster.ts`, and have each module keep its own font set. Verify both rasterizers still work after the extraction.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/pranith/Documents/portfolio && npx vitest run worker/social-carousel-raster.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck worker + commit**

Run: `npx tsc --noEmit -p api/tsconfig.worker.json`
Expected: no new errors.

```bash
git add worker/social-carousel-raster.ts worker/social-carousel-raster.test.ts public/og/bricolage-700.ttf
# include worker/resvg-shared.ts + worker/og-raster.ts if the shared-init extraction was done
git commit -m "feat(social): rasterize carousel slides to PNG via resvg + Bricolage font"
```

---

### Task 6: Admin render route — `GET /api/v1/admin/social/carousel/:slug/:i.png`

**Files:**

- Modify: `api/src/routes/case-study-admin.ts` (add the route)
- Test: `api/test/routes/case-study-admin.test.ts` (add cases)

**Interfaces:**

- Consumes: `renderCarouselSlideSvg` (Task 2), `carouselSlideToPng` (Task 5 — call via the worker binding/import path used by other admin image routes; if the route is in `api/` and can't import `worker/`, render SVG in `api/` and rasterize through the existing OG raster route pattern, OR move the route into `worker/router.ts` next to other image routes — follow whatever pattern `og` image serving uses).
- Consumes: social content read from KV `social:${slug}` (reuse the existing getter used by `GET /admin/social-schedule/:slug`).
- Produces: `image/png` response; 404 on bad slug/index.

- [ ] **Step 1: Write the failing route test**

```ts
// add to api/test/routes/case-study-admin.test.ts (follow the file's existing mini-app + admin-token setup)
it('renders a carousel slide PNG for an admin-authed request', async () => {
  // Arrange: seed KV social:<slug> with a carousel of 3 slides (use the test harness's KV put helper).
  // Act: GET /api/v1/admin/social/carousel/<slug>/0.png with the admin token header.
  // Assert: 200, content-type image/png, body starts with PNG magic byte 0x89.
});

it('404s when the slide index is out of range', async () => {
  // GET .../<slug>/99.png -> 404
});
```

> Fill the two cases using the file's established patterns (admin token header, KV seeding helper, `app.request(...)`). The assertions are: status 200 + `content-type: image/png` + first byte `0x89` for the valid case; status 404 for the OOB case.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run --pool=forks --no-file-parallelism test/routes/case-study-admin.test.ts` (sandbox disabled per repo footgun — see how other route tests are invoked; if there's an npm script like `test:routes`, use it).
Expected: FAIL — route returns 404 for the valid case (route not yet defined).

- [ ] **Step 3: Implement the route**

```ts
// api/src/routes/case-study-admin.ts — register near the other /admin/social-schedule routes
import { renderCarouselSlideSvg } from '../case-study/social/carousel-svg';
import { carouselSlideToPng } from '... resolve to the rasterizer ...';

app.get('/admin/social/carousel/:slug/:i{[0-9]+}.png', async (c) => {
  const slug = c.req.param('slug');
  const i = Number(c.req.param('i'));
  if (!/^[a-z0-9-]+$/.test(slug)) return c.json({ error: 'bad slug' }, 400);
  const social = await getSocial(c.env, slug); // reuse existing KV getter
  const slides = social?.carousel?.slides;
  if (!slides || i < 0 || i >= slides.length) return c.notFound();
  const svg = renderCarouselSlideSvg(slides[i]!, { index: i, total: slides.length });
  const png = await carouselSlideToPng(c.env, svg);
  return new Response(png, {
    headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=300' },
  });
});
```

> If `api/` cannot import the `worker/` rasterizer, register this route in `worker/router.ts` (admin-gated) instead — that is where `env.ASSETS` and worker-only modules are reachable. Keep the path identical.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run --pool=forks --no-file-parallelism test/routes/case-study-admin.test.ts`
Expected: PASS (valid → PNG, OOB → 404).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p api/tsconfig.json && npx tsc --noEmit -p api/tsconfig.worker.json`
Expected: clean.

```bash
git add api/src/routes/case-study-admin.ts api/test/routes/case-study-admin.test.ts
# + worker/router.ts if registered there
git commit -m "feat(admin): carousel slide PNG render route (admin-gated, on-demand)"
```

---

### Task 7: Accept `instagram` in schedule storage + admin routes

**Files:**

- Modify: `api/src/case-study/storage/social-schedule.ts` (allow `'instagram'` platform)
- Modify: `api/src/routes/case-study-admin.ts` (`:platform` validation accepts `'instagram'`)
- Test: `api/test/case-study/social-schedule.test.ts` (add IG case)

**Interfaces:**

- Consumes: `SocialSchedule.instagram?` (Task 1).
- Produces: `upsertSocialSchedule(ns, slug, 'instagram', patch)` + `markSocialPosted(ns, slug, 'instagram')` work; `Platform` type includes `'instagram'`.

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/social-schedule.test.ts — add
it('upserts and marks an instagram entry without clobbering twitter', async () => {
  const ns = makeKv(); // use the file's existing KV stub helper
  await upsertSocialSchedule(ns, 'slug-x', 'twitter', { status: 'pending' });
  await upsertSocialSchedule(ns, 'slug-x', 'instagram', { scheduledAt: '2026-06-25T10:00:00Z', status: 'pending' });
  await markSocialPosted(ns, 'slug-x', 'instagram');
  const s = await getSocialSchedule(ns, 'slug-x');
  expect(s?.instagram?.status).toBe('posted');
  expect(s?.twitter?.status).toBe('pending');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run --pool=forks test/case-study/social-schedule.test.ts`
Expected: FAIL — type error / `'instagram'` not an accepted platform.

- [ ] **Step 3: Widen the platform type**

In `social-schedule.ts`, find the platform union (e.g. `type Platform = 'twitter' | 'linkedin'`) and add `'instagram'`. The merge/upsert logic is platform-keyed already, so no other change is needed. In `case-study-admin.ts`, find the `:platform` validation (e.g. an allow-set `['twitter','linkedin']`) and add `'instagram'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run --pool=forks test/case-study/social-schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p api/tsconfig.json`
Expected: clean.

```bash
git add api/src/case-study/storage/social-schedule.ts api/src/routes/case-study-admin.ts api/test/case-study/social-schedule.test.ts
git commit -m "feat(social): instagram platform in schedule storage + admin routes"
```

---

### Task 8: Admin UI — Instagram section in PublishedTab

**Files:**

- Modify: `src/pages/admin/PublishedTab.tsx`
- Test: manual + (optional) a component test if the file has a test harness.

**Interfaces:**

- Consumes: the render route `GET /api/v1/admin/social/carousel/:slug/:i.png` (Task 6), `social.instagram` + `social.carousel` (Task 4), schedule `instagram` entry (Task 7), `adminApi` client.

- [ ] **Step 1: Add the Instagram section**

In the per-post social block where Twitter + LinkedIn render side by side, add an Instagram column:

- **Caption:** a read-only `<textarea>` bound to `social.instagram` + a "Copy" button (reuse the existing copy handler used for Twitter/LinkedIn).
- **Carousel preview:** if `social.carousel?.slides?.length`, render a horizontal scroll/grid of `<img>` — for `i` in `0..slides.length-1`, `src={`/api/v1/admin/social/carousel/${slug}/${i}.png`}` with the admin token. (If images are admin-gated and the token is a header, the existing `adminApi` image pattern applies; otherwise render via an authed fetch → object URL. Follow how any existing admin image is shown; if none, fetch with the admin header into a blob URL.)
- **Download all:** a button that triggers sequential downloads — for each slide, create an `<a download={`${slug}-ig-${i+1}.png`} href={objectUrl}>` and click it.
- **Mark posted:** reuse the existing mark-posted control, passing `platform="instagram"`.

- [ ] **Step 2: Verify in the running app**

Run the app (see the project `run` skill / `npm run dev` equivalent), open `/admin` → Published, pick a post that has `social.carousel`, confirm: caption copies, 3+ slide images render on-brand, download produces PNGs, mark-posted persists (reload shows posted).

- [ ] **Step 3: a11y pass**

Dispatch the `a11y-reviewer` agent on `src/pages/admin/PublishedTab.tsx` (images need `alt`, buttons keyboard-reachable). Fix anything it flags.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/PublishedTab.tsx
git commit -m "feat(admin): Instagram carousel preview + caption + download in PublishedTab"
```

---

### Task 9: Full typecheck, regression suite, deploy-verify

**Files:** none (verification only)

- [ ] **Step 1: Typecheck all three projects**

```bash
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p api/tsconfig.json
npx tsc --noEmit -p api/tsconfig.worker.json
```

Expected: clean (or only the pre-existing unrelated worker errors in `scheduled.ts`/`si-yaml-mini.test.ts` documented before this work — do not regress beyond those).

- [ ] **Step 2: Run the social + generation + admin suites**

```bash
cd api && npx vitest run --pool=forks \
  test/case-study/social/ \
  test/case-study/generation/social.test.ts \
  test/case-study/generation/social-instagram.test.ts \
  test/case-study/social-schedule.test.ts
# route tests (sandbox-off):
npx vitest run --pool=forks --no-file-parallelism test/routes/case-study-admin.test.ts
```

Expected: all green.

- [ ] **Step 3: Wrangler dry-run from repo ROOT**

```bash
cd /Users/pranith/Documents/portfolio && npx wrangler deploy --dry-run
```

Expected: bundles OK; `env.ASSETS` bound; resvg wasm bundled; the new font asset present.

- [ ] **Step 4: Deploy (only when the user asks)**

Use the `deploy-verify` skill workflow: rebase onto `origin/main`, `npm run deploy` (or `npx wrangler deploy` directly if prerender SIGTERMs), then smoke: publish/regenerate a post, hit the render route, confirm a slide PNG renders on-brand in `/admin`.

---

## Self-Review

**Spec coverage:** §2 architecture → Tasks 2–6; §3.1 slide model → Task 1; §3.2 carousel-svg → Task 2; §3.3 carousel-build → Task 3; §3.4 caption+carousel in social.ts → Task 4; §3.5 rasterizer+Bricolage → Task 5; §3.6 render route → Task 6; §3.7 admin UI → Task 8; §3.8 types/storage → Tasks 1 & 7; §5 testing → every task + Task 9. Success criteria 1–6 all covered. No gaps.

**Placeholders:** Tasks 6 & 8 intentionally defer to "the file's existing patterns" for KV-seeding/admin-token/image-auth because those harness details must be read at implementation time; the _assertions_ and _behavior_ are fully specified. All code modules (Tasks 1–5, 7) carry complete code.

**Type consistency:** `ContentSlide`/`SlideKind`/`CarouselSpec`/`clampSlides` (Task 1) used consistently in Tasks 2–4 & 6. `renderCarouselSlideSvg(slide, {index,total,accent?})` (Task 2) called with that exact shape in Task 6. `carouselSlideToPng(env, svg)` (Task 5) called in Task 6. `buildCarouselSlides(post, {ai,groqKey?,googleKey?})` (Task 3) called in Task 4. `SocialContent.instagram`/`carousel` (Task 1) produced in Task 4, consumed in Tasks 6 & 8. `SocialSchedule.instagram` (Task 1) used in Tasks 7 & 8.

**Known wrinkles flagged inline:** (a) two duplicate `SocialContent` types — both extended in Task 1; (b) `social-content/src/brand.ts` import may be outside api tsconfig — fallback to a copied token file noted in Task 2; (c) double `initWasm` across two rasterizers — shared-init extraction noted in Task 5; (d) `api/` → `worker/` import boundary for the rasterizer — route-placement fallback noted in Task 6.

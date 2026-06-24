# Content-Creator Revamp — Phase 1: Instagram + Server-Side Visual Carousels

**Date:** 2026-06-24
**Status:** Design approved; spec under review
**Branch context:** `polish/frontend-audit-2026-06-23` (note: `main` moves fast; rebase before deploy)

---

## 0. Background & program context

The site (`pranithjain.qzz.io`, Cloudflare Workers + React) already runs an automated
DFIR/threat-intel content pipeline: discovery runners surface candidates → an LLM
generates blog "case studies" → on publish, `generateSocialForPost()` produces
Twitter-thread + LinkedIn-post copy (stored in KV `social:${slug}`), surfaced in the
`/admin` Published tab for **manual** posting (mark-posted tracking only — no auto-post).

The owner wants to "think like a content creator": grow reach, repurpose blog content into
many formats, add net-new creator content, and stay on-brand — across **Instagram, X,
and LinkedIn**, with an **approval-queue** model, prioritizing **hooks, visual quality,
cadence, and analytics**.

This is a multi-subsystem program. It is decomposed into phases, each independently
shippable (spec → plan → build):

| Phase             | Delivers                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **1 (this spec)** | Instagram as a first-class channel + server-side SVG→PNG carousel rendering inside Workers; admin preview/download; mark-posted. |
| 2                 | Real scheduling cron (auto-post approved content) + content-calendar approval queue.                                             |
| 3                 | Hooks & storytelling upgrade (stronger hooks, platform-native formats, hashtag intelligence, A/B variants).                      |
| 4                 | Analytics & iteration loop (capture post URLs + engagement, feed back into generation).                                          |
| 0.5 (fold-in)     | `verify-url` hardening (HEAD→GET, narrow "broken", 3-strike recheck). Research captured in Appendix B.                           |

### Existing system facts grounding this design

- **Social generation:** `api/src/case-study/generation/social.ts` (Twitter + LinkedIn, with per-platform QA: limits, grounding, slop detection, 1 retry).
- **Orchestration:** `api/src/case-study/run.ts` `generateSocialForPost()` — fire-and-forget on publish, writes KV `social:${slug}`.
- **Types:** `SocialContent { slug, twitter, linkedin, generatedAt }`, `SocialSchedule { slug, twitter?, linkedin?, updatedAt }`, `SocialScheduleEntry { scheduledAt?, status, postedAt? }` in `api/src/case-study/types.ts`.
- **Schedule storage:** `api/src/case-study/storage/social-schedule.ts` (KV; `scheduledAt` is informational — no cron posts).
- **Admin:** social endpoints in `api/src/routes/case-study-admin.ts` (`GET /admin/social-schedule/:slug`, `POST .../:platform`, `POST .../:platform/mark-posted`); UI in `src/pages/admin/PublishedTab.tsx`.
- **Proven SVG→PNG path in Workers:** `worker/og-raster.ts` `svgToPng(env, svg)` uses bundled `@resvg/resvg-wasm` (build-time wasm import — runtime `WebAssembly.instantiate` is blocked on Workers) + Hanken Grotesk fonts fetched from `env.ASSETS` (`/og/hanken-400.ttf`, `/og/hanken-700.ttf`), memoised per isolate. `worker/lib/si-svg-png.ts` is a second instance of this pattern.
- **Instagram is scaffolded but headless:** caption + carousel-HTML generators exist _only_ in the offline `social-content/` CLI (`social-content/src/generators/instagram.ts`, `carousel-renderer.ts` — HTML rendered via a **headless browser**, which cannot run in Workers). No API posting, no credentials, no `SocialContent.instagram` field, no admin UI.
- **Brand tokens:** `social-content/src/brand.ts` (`BRAND`): brand/sky/emerald/severity/neutral palettes, fonts (Bricolage Grotesque display, Hanken Grotesk body, JetBrains Mono), funnel accents (tofu/mofu/bofu), platform colors (instagram `#e4405f`).
- **Slide model already exists:** `ContentSlide` / `ContentSpec` / `SlideKind` in `social-content/src/content-spec.ts`.

### Decisive constraint

The owner's Instagram is a **personal account**. The Instagram Graph API can **only**
auto-post to Business/Creator accounts linked to a Facebook Page. Therefore Phase 1 is
**generate → render PNG slides → preview/download in admin → owner posts manually**,
with mark-posted tracking. **No Meta OAuth in Phase 1.** Design must allow a future
Business-account upgrade to add auto-posting without rework.

---

## 1. Goal (Phase 1)

Make Instagram a first-class output of the existing pipeline, with brand-accurate carousel
images rendered server-side in Workers (reusing the `resvg-wasm` path), previewable and
downloadable from `/admin`, tracked through the existing mark-posted flow.

**Success criteria**

1. Publishing a post produces an Instagram caption (hashtag-aware, ≤2200 chars, grounded) + a carousel slide spec, stored in KV `social:${slug}`.
2. Admin can preview each rendered carousel slide as a PNG and download all slides.
3. Carousels are on-brand (BRAND tokens, Bricolage display + Hanken body, PANOPTICON mark + URL on cover/CTA).
4. Admin can mark Instagram posted (date + status), same as Twitter/LinkedIn.
5. No regression to existing Twitter/LinkedIn generation or scheduling.
6. All new pure logic is TDD-covered; all 3 tsconfig projects typecheck clean.

---

## 2. Architecture & data flow

```
Post (published)
  └─ generateSocialForPost()  [run.ts, extended]
       └─ generateSocialContent()  [social.ts, extended]
            ├─ twitter   (existing)
            ├─ linkedin  (existing)
            └─ instagram (NEW):
                 ├─ caption + hashtags  (AI, grounded, ≤2200)
                 └─ carousel slides     (carousel-build.ts: AI headlines + deterministic fallback)
            → KV social:${slug}  ({ ...existing, instagram, carousel })

Admin "Instagram" section (PublishedTab.tsx)
  ├─ caption box + copy
  ├─ carousel preview grid: <img src="/api/v1/admin/social/carousel/:slug/:i.png">
  │     └─ route → renderCarouselSlideSvg(slide) → carouselSlideToPng(env, svg) → image/png  [on-demand, admin-gated]
  ├─ "Download all slides"
  └─ "Mark posted" (platform='instagram') → social-schedule.ts
```

**Rendering strategy:** on-demand per request (admin-gated, low volume). No stored PNGs in
Phase 1 — always reflects the current slide spec, no storage lifecycle. A KV cache keyed by
slide-content hash is a deliberate later optimization (Appendix A), not Phase 1.

---

## 3. Components (each isolated, single-purpose, testable)

### 3.1 `api/src/case-study/social/slide-spec.ts` (shared model)

Lift the slide contract (`ContentSlide`, `SlideKind`, the subset needed online) out of
`social-content/src/content-spec.ts` into `api/src/` so both the online engine and the
offline CLI reference one type. The offline CLI re-exports from here (or keeps a structural
copy; no behavior change to the CLI in Phase 1).

- **Interface:** types only.
- **Depends on:** nothing.

### 3.2 `api/src/case-study/social/carousel-svg.ts` (core render engine)

Pure function: `renderCarouselSlideSvg(slide: ContentSlide, ctx: { index, total, funnel, accentHint? }): string`.

- Canvas **1080×1350** (Instagram portrait).
- Slide kinds handled: `hook` (dark gradient, oversized headline, slide pager, brand mark), `content`/`list` (light bg, scannable headline + bullets/body), `stat` (huge number + label), `cta` (accent bg, headline + `pranithjain.qzz.io` + PANOPTICON mark).
- Uses `BRAND` tokens; funnel accent or threat-severity color per content.
- Robust text wrapping/truncation (mirror `og-image.ts` wrapping); XML-escape all text.
- **Interface:** `(slide, ctx) → SVG string`. **Depends on:** `BRAND`, slide-spec types.
- **Testable:** assert SVG dims, headline presence, per-kind bg/accent, escaping, wrap/truncate, pager text `i/total`.

### 3.3 `api/src/case-study/social/carousel-build.ts` (Post → slides)

`buildCarouselSlides(post: Post, deps): Promise<ContentSlide[]>`.

- **AI + deterministic fallback (approved):** AI rewrites the post into 5–7 punchy slide headlines/bodies (hook → 3–5 content → CTA), output as JSON validated against a schema; on AI failure/low-quality/schema-miss, fall back to deterministic extraction from the post's `## ` sections + title/hook.
- Reuse the existing generation AI client (`runCompletion`) + the `superpowers` grounding/QA philosophy already in `social.ts`.
- **Interface:** `(post, {ai, groqKey?, googleKey?}) → ContentSlide[]`. **Depends on:** ai-client, slide-spec.
- **Testable:** deterministic fallback from a fixed Post (no AI) yields a valid, bounded slide array; schema guard rejects malformed AI output; slide count bounds (3–8).

### 3.4 `api/src/case-study/generation/social.ts` (extend)

Add `generateInstagramContent(post, ai, now, groqKey?, googleKey?)`:

- caption: port the hashtag-aware, grounded caption logic from `social-content/src/generators/instagram.ts`; enforce ≤2200 chars, 3–5 (configurable up to ~10) hashtags, reuse existing social-QA (limits, grounding, slop, URL allowlist).
- calls `buildCarouselSlides`.
- `generateSocialContent()` aggregates `instagram` + `carousel` into the returned `SocialContent`.
- **Back-compatible:** existing twitter/linkedin paths unchanged.

### 3.5 `worker/social-carousel-raster.ts` (rasterize)

`carouselSlideToPng(env, svg): Promise<Uint8Array>` — same resvg pattern as `og-raster.ts`,
sized `fitTo width 1080`, loading **Bricolage Grotesque (display)** + **Hanken Grotesk
(body)** font buffers. Prefer generalizing the existing rasterizer (extract a shared
`rasterize(env, svg, { width, fonts, defaultFontFamily })`) rather than copy-paste; keep
`og-raster.ts`'s public `svgToPng` behavior identical.

- **New asset:** add `public/og/bricolage-700.ttf` (static asset, same load path).
- **Testable:** smoke — render a trivial SVG, assert PNG magic bytes `89 50 4E 47`.

### 3.6 Route `GET /api/v1/admin/social/carousel/:slug/:i.png`

Admin-gated (matches `ADMIN_GATED_PREFIXES` / existing admin auth). Loads `SocialContent`
from KV, validates `i` in range, builds SVG via 3.2, rasterizes via 3.5, returns
`image/png` (with sane `Cache-Control` for the admin session). 404 on missing slug/slide.

- **Testable:** admin mini-app route test (auth required; valid slug+index → PNG; OOB index → 404).

### 3.7 Admin UI — `src/pages/admin/PublishedTab.tsx` (extend)

Instagram section alongside Twitter/LinkedIn: caption box + copy; carousel thumbnail grid
(`<img>` per slide via 3.6); "Download all slides" (Phase 1: sequential per-slide download
via anchor `download` attr; client-side zip is a later nicety); mark-posted + date control
wired to `platform='instagram'`. No Meta OAuth.

- a11y: images need alt text; buttons keyboard-reachable (a11y-reviewer pass after).

### 3.8 Types & storage (additive, back-compatible)

- `SocialContent`: add `instagram?: string`, `carousel?: { format: 'instagram'; slides: ContentSlide[] }`.
- `SocialSchedule`: add `instagram?: SocialScheduleEntry`.
- `social-schedule.ts` upsert/mark-posted: accept `'instagram'` platform.
- Admin social-schedule routes: accept `'instagram'` in the `:platform` param + validation.

---

## 4. Error handling

- Instagram generation is **fire-and-forget/non-blocking** like the rest of `generateSocialForPost` — a failure logs and leaves twitter/linkedin intact; never blocks publish.
- `buildCarouselSlides` AI failure → deterministic fallback (never throws to caller).
- Render route: missing slug/slide → 404; rasterization error → 500 with logged reason (admin-only).
- Caption that fails QA after 1 retry → store best-effort caption + log (mirrors existing social-QA behavior); never crash the pipeline.

## 5. Testing strategy (TDD)

- **Pure/red-green:** `carousel-svg.ts`, `carousel-build.ts` (deterministic fallback + schema guard), slide-spec invariants.
- **Caption:** reuse existing social-QA assertions (limits, hashtags, grounding).
- **Route:** admin mini-app pattern (`case-study-admin.test.ts` style).
- **Rasterizer:** PNG-header smoke (Node/vitest; resvg works under Node).
- **Regression:** existing `social.test.ts`, `social-schedule.test.ts`, `case-study-admin.test.ts` stay green.
- **Typecheck:** `tsc -p tsconfig.json`, `-p api/tsconfig.json`, `-p api/tsconfig.worker.json` all clean.
- Run api tests with `vitest --pool=forks`; route tests need sandbox disabled (per repo footguns).

## 6. Out of scope (later phases)

Auto-posting to IG (needs Business account; Phase 2+), Reels/Stories formats, scheduling
cron, analytics, X/LinkedIn image/quality upgrades. The carousel engine built here is the
shared foundation for all of them.

## 7. Risks & mitigations

- **Font asset weight:** Bricolage TTF adds to bundle/assets; mitigate by subsetting to Latin if size matters; falls back to Hanken if absent.
- **Worker CPU on render:** one 1080×1350 slide ≈ OG-card cost (proven fine); admin-gated low volume; cache later if needed.
- **resvg feature gaps:** resvg supports a subset of SVG/CSS — keep slides to rects, gradients, text, simple paths (as OG cards already do); no foreignObject/HTML.
- **`main` moves fast / two wranglers:** deploy from repo root; rebase onto `origin/main` before deploy (existing footguns).

---

## Appendix A — Deferred Phase 1 optimization

KV cache for rendered slides keyed by `hash(slideSpec + renderer-version)`; serve cached
PNG, regenerate on spec change. Skipped in Phase 1 (on-demand is sufficient at admin volume).

## Appendix B — Phase 0.5 research (verify-url hardening, captured)

Current `verify-url.ts` treats all 4xx/5xx as `broken`, which wrongly deletes real
citations behind WAFs and on transient 5xx. Recommended (researched):

- **Probe:** browser-like UA/Accept headers; HEAD first; on 403/405/501 retry `GET` with `Range: bytes=0-2047`; trust the GET status.
- **Classify `broken` narrowly:** only **404/410** and **DoH-confirmed NXDOMAIN** (`https://cloudflare-dns.com/dns-query?name=<host>&type=A`, `Status===3`). Route **401/403/429/451/5xx/timeout/thrown-without-NXDOMAIN** → `unchecked` (never delete).
- **Soft-404:** cheap checks on the already-fetched slice — final URL collapsed to host root, or 404 markers in `<title>`/body; expensive per-host junk-probe gated + cached.
- **Cache (KV, asymmetric TTL):** ok 7–30d, broken 3–7d, unchecked 15–60m (honor `Retry-After`); per-host hard-404 7d; per-host NXDOMAIN 24h. Batch KV reads/writes (one prime + one flush) to respect the 50-subrequest cap.
- **Link rot:** 3-strike spaced-recheck before deleting a published citation; prefer replacing with a `web.archive.org` snapshot over deletion. Weekly recheck cron.

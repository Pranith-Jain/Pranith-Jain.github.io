# Admin Content Engine Rework — Design

**Date:** 2026-06-04
**Status:** Approved (design); pending implementation plan
**Scope:** `/admin` content engine — discovery, AI generation (blog/LinkedIn/Twitter), publishing, distribution

---

## 1. Goal

Make the `/admin` content engine produce **fresh, high-quality, well-distributed** threat-intel content with less friction. Four problem areas, addressed as four independently-shippable phases:

1. **Discovery** shows the same suggestions every day; no bulk dismiss; needs more/diverse sources.
2. **Writing quality** is capped by a deprecated model and a blog structure that predates 2026 AEO/GEO norms.
3. **LinkedIn/Twitter** content follows rules that now _actively suppress reach_ (link placement) and misses current format/algorithm best practice.
4. **Publishing** takes 3-4 days (weekly planner + 7-day drip); needs faster, controllable cadence.

**Locked decisions (from brainstorming):**

- **Model:** stay on Groq (no Anthropic/OpenAI spend) — but upgrade off the deprecated model.
- **Social:** one-click generate → scheduling queue + reminders + best-time hints. **No** LinkedIn/X API auto-posting.
- **Cadence:** daily planner + approve-to-live fast lane + per-item reschedule.
- **Phase order:** Discovery first, then Writing, then Social, then Publishing.
- **Sources:** add the keyless set + **VulnCheck KEV** via a free Community token.

---

## 2. Current architecture (as-built, for reference)

**Pipeline (all cron-driven, `wrangler.jsonc` crons + `worker/scheduled.ts`):**

- **Discovery** — daily `5 0 * * *`. `api/src/case-study/run.ts:runDiscoveryNow()` → 10-12 runners in `api/src/case-study/discovery/*` → deterministic scoring (`scoring.ts`) → top-N per topic (`discovery/index.ts`) → `candidates:<type>:<key>` in KV (`CASE_STUDIES`, 7-day TTL).
- **Planner** — **weekly** `15 0 * * 1`. `publishing/planner.ts:runPlannerNow()` → picks 2-4 approved candidates, spreads across next 7 days (weighted weekday slots).
- **Publisher** — hourly `0 * * * *`. `publishing/publisher.ts` → publishes the due slot → `posts:<slug>` (or `drafts:<slug>` if `BLOG_APPROVAL_REQUIRED`) → refresh RSS.

**Generation (`api/src/case-study/generation/`):**

- `ai-client.ts` — Groq primary (`meta-llama/llama-4-scout-17b-16e-instruct`) → Workers AI fallback (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, then `@cf/meta/llama-3.1-8b-instruct`). Fail-fast on 429.
- `copywriting.ts` — shared `VOICE_IDENTITY` + `COPYWRITING_RULES` + `PIPELINE_OUTPUT_GUARDRAIL` (single source of truth for persona; strong "detection-practitioner" voice).
- `templates.ts` — blog system/user prompt + per-type outlines.
- `social.ts` — `buildTwitterPrompt()` / `buildLinkedinPrompt()`; temp 0.7.
- `post-process.ts` / `index.ts` — structural QA + one self-heal rewrite pass.

**Admin UI (`src/pages/admin/`):** `PendingTab` (approve/skip, one-at-a-time), `DraftsTab`, `PublishedTab` (generate social, copy-to-clipboard — manual posting), `ScheduleTab`/`ApprovedTab`.

**Constraints to honor (from project memory):**

- Two wranglers; **deploy from repo root**, not `api/`.
- Typecheck-on-edit hook blocks on type errors; keep each saved state compilable. `worker/` checked via `api/tsconfig.worker.json`.
- API tests (`vitest-pool-workers`) need `dangerouslyDisableSandbox`; CI skips `test/routes/` — run those locally.
- **Free-plan 50 subrequests/invocation** — KV + Cache + fetch all count. IOC fan-out uses batched KV (primeBatch/flushBatch). Adding feeds must not blow this budget.
- `validate()` middleware schemas must mirror handler reads; `/api/v1` external reads are key-gated (`OPEN_PUBLIC_READS` valve).
- Cloudflare free tier: **max 5 crons** (currently all 5 used; we modify schedules, never add).
- If `worker/mcp-server.ts` changes, mirror to the standalone `dfir-mcp-server` repo (not expected here).

---

## 3. Phase 1 — Discovery Freshness

### 3.1 Root causes

- **Deterministic ranking:** scores (`recency+severity+novelty+weight`) are stable across runs; `argmax top-N` always picks the same items.
- **Soft novelty only:** `noveltyScore()` down-weights seen items but never excludes them; high scorers stay on top.
- **Skip ≠ suppress:** `/candidates/:id/skip` deletes the KV entry only. The next run re-discovers the same item from the still-live source.
- **No bulk dismiss:** only per-candidate approve/skip endpoints exist.

### 3.2 Changes

**(a) Stochastic, date-seeded ranking** — `discovery/index.ts` + `scoring.ts`
Replace strict `top-N` selection with **weighted-random sampling within score bands** (softmax/temperature sampling over the candidate scores), seeded by the current date (e.g., `YYYY-MM-DD`). Result: stable within a day, varied across days, still quality-weighted (high scorers more likely but not guaranteed every day). Keep a small "always include the single highest-severity item" guarantee so genuinely critical items never get sampled out.

**(b) Skip = suppress** — `routes/case-study-admin.ts` + `storage/dedup.ts`
On skip, write a suppression record (`suppressedUntil = now + 30d`) into the dedup index keyed by stable key. `isSuppressed()` (already in `run.ts`) gains a second gate: hard-suppress if `suppressedUntil` is in the future. Suppressed items are excluded from candidate production. (Distinct from the existing 60-day _published_ republish-block.)

**(c) Bulk dismiss** — new endpoint + UI

- `POST /api/v1/admin/case-study/candidates/skip-all` — suppress + delete every current pending candidate (one batched KV write; respects subrequest budget). Optional `?type=<type>` to clear one type.
- `PendingTab.tsx` — "Clear all" (and optional per-type "Clear all CVEs") button with a confirm.
- `validate()` schema + contract test for the new route; mount real `looseValidation` middleware in the integration test.

**(d) New sources** — new runners/feeds in `discovery/` + `config.ts`
Keyless (zero setup): **EUVD** (ENISA EU vuln DB JSON), **CISA ICS advisories** (RSS, set a real UA — CISA 403s bots), **Google TAG** (RSS), **NCSC UK** (RSS), **AhnLab ASEC EN** (RSS), **JPCERT/CC Eyes EN** (Atom), **HaveIBeenPwned breaches** (`/api/v3/breaches`, keyless, set UA).
Keyed (free Community token, user-provisioned): **VulnCheck KEV** — exploited CVEs ~27 days ahead of CISA KEV, ~80% more coverage. Token stored as a Worker secret (`VULNCHECK_API_TOKEN`); runner is a no-op when the secret is absent (graceful degrade). Endpoint `https://api.vulncheck.com/v3/index/vulncheck-kev` (Bearer).
_Do not re-add (already integrated):_ GHSA, OSV.dev, EPSS, MITRE ATT&CK, OTX, CIRCL, The Record, THN, BleepingComputer, Check Point, Huntress, Rapid7, Recorded Future, Project Zero, DataBreaches, Krebs, Talos, IC3, DOJ, abuse.ch family, ransomware.live, cvefeed.io newsroom RSS.

**(e) Feed-group rotation by day** — `discovery/index.ts` / `run.ts`
Partition all feeds into N groups; each daily run executes a rotating subset (e.g., group = `dayOfYear % N`). Serves two goals at once: (1) more variety in daily output, (2) stays under the **50-subrequest** budget as the source count grows. High-priority always-on feeds (CISA KEV, NVD, VulnCheck KEV) run every day; lower-priority/long-tail feeds rotate.

### 3.3 Phase 1 acceptance

- Two consecutive daily discovery runs produce visibly different pending queues.
- Skipping an item prevents it reappearing for 30 days.
- "Clear all" empties the queue in one action and those items stay gone.
- New sources surface candidates (verified against live feed format — providers silently rot, per memory).
- Discovery invocation stays under 50 subrequests.

---

## 4. Phase 2 — Writing & Content Quality

### 4.1 Model: keep Llama-4-Scout (no swap)

**Decision (2026-06-04): no model change.** An earlier research pass wrongly flagged `meta-llama/llama-4-scout-17b-16e-instruct` as deprecated. Re-verified against Groq's live deprecation list: Scout is **not** deprecated or scheduled for shutdown (it's Preview-tier, 17B). It works; the user chose to keep it. The Workers AI `llama-3.3-70b` fallback chain and fail-fast-on-429 stay as-is. `ai-client.ts` is **not** touched in Phase 2.

The real writing-quality lever is the prompt/QA work below (§4.2–4.4), which improves output on any model. (For the record, deprecated-on-Groq models that were therefore never options: llama-4-Maverick, Kimi-K2.)

### 4.2 Blog prompt upgrade (2026 AEO/GEO) — `templates.ts`

Anchored in the Princeton GEO study (statistics → +41% AI-citation visibility; citations/quotes → +30-40%) and FIRST/ICD-203 analytic tradecraft:

- **Answer-first TL;DR block** (≤120 words, self-contained and quotable: finding + impact + affected versions + one headline statistic) before the first section.
- **Query-shaped H2 headings** (phrase as the question a reader/AI would ask); strict H1→H2→H3.
- **FAQ section** (4-6 question-shaped items, 40-60-word answers).
- **Named detections** — Sigma / YARA / KQL / SPL where the ground-truth data supports it; **IOC table**.
- **Estimative-language discipline** — separate likelihood (WEP: likely/very-likely/…) from confidence (High/Moderate/Low); never combine in one sentence; no weasel words.
- **Stat density** — a specific number every ~200-300 words, always tied to ground-truth data.
- **Entity-rich title** — "From X to Y" / witty + (CVE/product); load-bearing entities in the title.
- Keep the existing strong voice/anti-slop rules; do not weaken grounding fences.

### 4.3 Schema / freshness / crawler access — blog render layer

- Emit JSON-LD on rendered blog posts: `BlogPosting` (+ `dateModified`), `FAQPage`, `Person` author with `sameAs` → LinkedIn/X.
- Visible "Updated <date>".
- Allow `GPTBot`, `PerplexityBot`, `ClaudeBot`, `OAI-SearchBot`, `Applebot` in `robots.txt`.

### 4.4 QA loop — `post-process.ts`

Extend structural QA to assert the new elements exist (TL;DR block, ≥1 FAQ, IOC table when IOCs present, headings present, no banned slop). Reuse existing self-heal (one rewrite pass).

### 4.5 Phase 2 acceptance

- Generation runs on `gpt-oss-120b`/`llama-3.3-70b` with no thinking-leakage in output.
- New blog posts contain TL;DR + FAQ + detections/IOC table + correct estimative language.
- Rendered post emits valid `BlogPosting`+`FAQPage` JSON-LD; AI crawlers allowed.

---

## 5. Phase 3 — LinkedIn & Twitter

### 5.1 LinkedIn prompt rewrite (2026) — `social.ts:buildLinkedinPrompt`

- **Fix the reach-killer:** stop putting the link on its own line in the body (−50-60% reach in 2026). Deliver the insight natively; emit a separate **`FIRST COMMENT:`** block containing the link. Post body stays link-free.
- **Hashtags 2 → 3-5** specific/topical (e.g., `#DFIR #ThreatIntel #IncidentResponse`) on the final line.
- **Optional carousel/document outline** for technical breakdowns (highest-reach format now) — generator may output a slide outline (5-10 slides) as an alternative deliverable.
- Keep the sub-210-char hook before the "…more" fold; mobile-first short paragraphs; one scannable bullet list; substantive closing question.
- Surface a **best-time hint** (Tue-Thu, audience-local AM/late-PM) in the admin UI metadata.

### 5.2 Twitter/X prompt rewrite (2026) — `social.ts:buildTwitterPrompt`

- **Fix the reach-killer:** no link in the first post (≈0% reach for non-Premium under Grok semantic ranking). Emit a **`FIRST REPLY:`** block with the link, or place it only in the final post.
- **Thread length 2-5 → 5-8** for technical breakdowns; single post for breaking news/hot takes.
- Optimize explicitly for **bookmarks** (save-worthy: IOC lists, detection rules, command cheatsheets) and **replies** (arguable/analytical takes) — the two highest-weighted 2026 signals.
- First post stands alone in ≤280 chars; 0-1 hashtag; 0-1 functional emoji max.
- Best-time hint (Tue-Thu mornings, audience timezone) in admin UI metadata.

### 5.3 Phase 3 acceptance

- LinkedIn output: link in a `FIRST COMMENT:` block, body link-free, 3-5 hashtags, optional carousel outline.
- Twitter output: 5-8 post technical threads, link in `FIRST REPLY:`/final post, save-worthy + arguable framing.
- Admin UI shows best-time hints for each platform.

---

## 6. Phase 4 — Publishing & Distribution Control

### 6.1 Daily planner — `wrangler.jsonc` + `scheduled.ts`

Change planner cron `15 0 * * 1` → `15 0 * * *` (daily). No cron added (stays within the 5-cron limit). Drains the approved backlog instead of waiting up to a week.

### 6.2 Approve → fast lane — `routes/case-study-admin.ts` + `ApprovedTab`

On approve, offer "publish next hour" — schedules a slot for the next hourly publisher run (live <1hr) rather than waiting for the planner. (`publish-now` already exists as the immediate manual path; this is the lighter "soon" option.)

### 6.3 Per-item reschedule — `ScheduleTab` + endpoint

Admin can change a pending slot's date/time. New `POST /api/v1/admin/schedule/:candidateId/reschedule` with `{ slotAt }`; `validate()` schema + test.

### 6.4 Social scheduling queue — storage + `PublishedTab`

Generated social posts get `{ scheduledAt, status: 'pending'|'posted', platform }` + best-time hint. UI: schedule, reminder/overdue indicator, "mark as posted." No LinkedIn/X API — posting stays manual (copy from UI), but tracked.

### 6.5 Phase 4 acceptance

- Planner runs daily; approved items publish within ~1 day (or <1hr via fast lane).
- A pending slot can be rescheduled from the UI.
- Social posts carry a schedule + status; UI shows what's due and lets you mark posted.

---

## 7. Cross-cutting / risks

- **Subrequest budget (50/invocation):** Phase 1(e) feed rotation is the mitigation; verify each discovery run's subrequest count after adding sources.
- **Provider rot (memory):** every new feed verified against _live_ upstream format; add to the provider-format checks.
- **Typecheck hook:** keep each edit compilable; run `tsc -p api/tsconfig.worker.json` after `worker/` edits.
- **Tests:** new admin routes get contract tests mounting the real middleware; run `test/routes/` locally with `dangerouslyDisableSandbox`.
- **Deploy:** from repo root; rebase worktree onto `origin/main` before deploy (main moves fast); commit on the feature branch and let auto-merge handle main.
- **VulnCheck token:** user provisions a free Community token as `VULNCHECK_API_TOKEN` secret; runner no-ops if absent.

## 8. Out of scope

- LinkedIn/X API auto-posting (explicitly declined — manual posting retained).
- Switching to Anthropic/OpenAI hosted models (no spend — Groq only).
- Visual scheduling calendar (queue + reschedule chosen instead).

## 9. Phasing summary

| Phase | Workstream                                                                                                    | Independently shippable |
| ----- | ------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1     | Discovery freshness (stochastic rank, suppress-on-skip, bulk dismiss, new sources + VulnCheck, feed rotation) | ✅                      |
| 2     | Writing quality (model swap, AEO blog prompt, schema, QA)                                                     | ✅                      |
| 3     | LinkedIn/Twitter (2026 prompt rewrites, link-placement fix, best-time hints)                                  | ✅                      |
| 4     | Publishing control (daily planner, fast lane, reschedule, social queue)                                       | ✅                      |

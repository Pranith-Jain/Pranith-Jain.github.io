# Social Crosspost

**Category:** Content / social publishing

## Loop Description

Take a drafted case-study / blog asset through the full social publishing pipeline:
generate platform-native copy (X + LinkedIn), render the carousel, get human approval,
post to both platforms, and verify the posts landed — looping until both are live or a
blocker is hit. This loop orchestrates the existing social pipeline
(`api/src/case-study/`) rather than replacing it; it exists because the pipeline has
many moving parts (generation, approval gate, drip autopost, per-platform posters,
metrics refresh) and no single documented runbook that ties them together.

The pipeline is **approval-gated by design** — nothing posts without a human OK'ing the
specific platform slot. This loop never bypasses that gate.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT post without explicit per-platform approval. `runSocialAutopost` requires
  `status === 'approved'` on the authoritative schedule entry; this loop must call the
  `/admin/social/:slug/:platform/approve` route (or the human must) before expecting a
  post. Approval is the gate, not a formality.
- Do NOT set `SOCIAL_AUTOPOST_ENABLED=true` just to make the loop "pass" — that is the
  master switch for the cron drip. If it's off, post manually via
  `/admin/social/:slug/post-twitter` and `/post-linkedin` instead. The loop verifies
  posted state either way.
- Do NOT post the same copy to X and LinkedIn. X copy is short + punchy; LinkedIn copy
  is longer + framed for practitioners. Use `generateTwitterContent` and
  `generateLinkedinContent` separately, not `generateSocialContent` for both.
- Do NOT skip the carousel render for LinkedIn — LinkedIn posts with a carousel
  (`/admin/social/carousel/:slug/:file`) materially outperform text-only. If the render
  fails, fix the SVG/PNG pipeline, don't post without it.
- If a post returns `{ ok: false }` from the platform, record the failure via the
  schedule's `attempts` counter (the autopost runner does this automatically; manual
  posts via the admin route do too). After 3 failed attempts the slot is auto-exhausted
  — do NOT reset `attempts` to retry indefinitely; investigate the platform error.
- X (Twitter) OAuth 1.0a credentials (`X_API_KEY` / `X_ACCESS_TOKEN` + secrets) and
  LinkedIn (`LINKEDIN_ACCESS_TOKEN`) must be set as Wrangler secrets. A 401/403 from
  either platform means the token expired or was rotated — do NOT loop on it; stop and
  re-mint the secret.

## Kickoff Prompt

```
Start the "Social Crosspost" loop for slug <SLUG>.

Goal: Platform-native social copy generated, carousel rendered, human-approved, posted
to X and LinkedIn, and both posts verified live with URLs captured.
Max iterations: 6
Between iterations run: curl /api/v1/admin/social/social-schedule/<slug> (with admin
token) and inspect the per-platform status + postUrl fields.
Exit when: both twitter and linkedin schedule entries have status 'posted' with a
non-empty postUrl, OR a platform returned a hard auth error (401/403) that needs a
secret rotation.

Step 1: Generate platform-native copy — POST /api/v1/admin/social/social/:slug with
{generate: true} (or call generateTwitterContent / generateLinkedinContent directly).
This produces separate X and LinkedIn copy from the case-study body. Review both.

Step 2: Render the LinkedIn carousel — GET /api/v1/admin/social/carousel/<slug>/<file>
to confirm the PNG slides exist; if missing, trigger the render pipeline.

Step 3: Human approval — POST /api/v1/admin/social/social-schedule/<slug>/twitter/approve
and /linkedin/approve. This is the gate. Do NOT proceed to post until both are approved.

Step 4: Post — if SOCIAL_AUTOPOST_ENABLED is true, the next cron tick (*/30) will drip
the approved slots. To post immediately, POST /api/v1/admin/social/<slug>/post-twitter
then /post-linkedin. Capture the returned postUrl.

Step 5: Verify — re-fetch the schedule; confirm status === 'posted' and postUrl is set
for both platforms. If a post failed, read the error field; if attempts >= 3, stop and
report (do not reset). Refresh metrics via /admin/social/social-metrics/<slug>/<platform>.

Self-pace this loop. After each iteration, re-fetch the schedule, read the status, and
only continue if the exit condition is not met. Stop when both are posted+verified or a
hard auth error appears. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Generate copy** — `POST /api/v1/admin/social/social/:slug` with `{ generate: true }`
   (route in `api/src/routes/admin/social.ts`). Calls `generateSocialContent` →
   `generateTwitterContent` + `generateLinkedinContent` in
   `api/src/case-study/generation/social.ts`. Produces separate platform-native copy.
2. **Render carousel** — confirm `GET /api/v1/admin/social/carousel/:slug/:file` serves
   the PNG slides (`renderCarouselSlideSvg` + `carouselSlideToPng` in
   `api/src/case-study/social/carousel-svg.ts` + `api/src/lib/social-carousel-raster.ts`).
   LinkedIn posts with carousels outperform text-only.
3. **Approve** — `POST /api/v1/admin/social/social-schedule/:slug/twitter/approve` and
   `/linkedin/approve`. Flips the authoritative schedule entry to `status: 'approved'`.
   This is the human gate — the autopost runner will not post anything unapproved.
4. **Post** — either let the cron drip (`runSocialAutopostNow` in
   `api/src/case-study/run.ts`, triggered `*/30 * * * *` when
   `SOCIAL_AUTOPOST_ENABLED === 'true'`, max `SOCIAL_DRIP_PER_TICK` per platform per tick)
   or post immediately via `POST /api/v1/admin/social/:slug/post-twitter` and
   `/post-linkedin` (calls `postToTwitter` / `postToLinkedin` in
   `api/src/case-study/posting/social-poster.ts`).
5. **Verify** — `GET /api/v1/admin/social/social-schedule/:slug`. Both platforms must
   show `status: 'posted'` with a populated `postUrl`. A `status: 'failed'` with
   `attempts >= 3` means the slot is exhausted — stop, do not reset.
6. **Refresh metrics** — `POST /api/v1/admin/social/social-metrics/:slug/:platform`
   (calls `refreshSocialMetricsNow`) to capture initial engagement. Metrics refresh on
   their own cron thereafter.

## Notes

- The autopost drip is **per-platform rate-limited** (`SOCIAL_DRIP_PER_TICK`, default 1)
  so a backlog goes out gradually, not as a burst. If 10 slots are approved, it takes
  10 cron ticks (5 hours at `*/30`) to clear — that's intentional, not a bug.
- Instagram is structurally excluded from the queue (`AutopostPlatform` is
  `twitter | linkedin` only). The `instagram` schedule slot exists for manual
  cross-posting via the carousel PNG download, not for automated posting.
- X media upload uses v1.1 (`upload.twitter.com/1.1/media/upload.json`) with OAuth 1.0a;
  only the OAuth params are signed, not the binary body. A 401 here means the
  `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` pair is stale.
- LinkedIn posting uses the `w_member_social` scope; a 403 means the token lacks that
  scope — re-authorize at LinkedIn Developer, not just refresh the token.
- The `FIRST REPLY:` / `FIRST COMMENT:` convention in generated copy is parsed by
  `splitSocialParts` in `social-poster.ts` — the link goes in a reply/comment, not the
  body, to keep the body clean. Only links to `pranithjain.qzz.io` are allowed.

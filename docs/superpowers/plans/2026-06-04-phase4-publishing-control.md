# Phase 4 — Publishing & Distribution Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/admin` content engine publish approved threat-intel within ~1 day (or <1hr via a fast lane), let an admin reschedule any pending slot, and track manually-posted social content in a scheduling queue with status + best-time hints.

**Architecture:** The publishing pipeline is cron-driven (`worker/scheduled.ts` dispatches `runPlannerNow`/`runPublisherNow` per cron string) with dependency-injected orchestrators (`runPlanner`/`runPublisher` take `listApproved`/`setSchedule`/`pickDueSlot`/`now`/`random` etc., so the date/random logic is deterministically unit-testable). Admin HTTP routes live in `api/src/routes/case-study-admin.ts`, mounted as a Hono sub-app under `/api/v1/admin` with `requireAdminMiddleware`; the global `looseValidation()` (256 KB body cap) runs on `/api/v1/*` and the new reschedule route adds a per-route `validate('json', …)` Zod schema. Slots and social content are persisted in the `CASE_STUDIES` KV namespace (`schedule:upcoming`, `social:<slug>`); the React admin tabs (`src/pages/admin/*Tab.tsx`) call the routes through `adminApi.ts` (BASE `/api/v1/admin`).

**Tech Stack:** Cloudflare Workers (Hono router, KV, cron triggers), TypeScript, Zod (`validate()` middleware), Vitest (`@cloudflare/vitest-pool-workers` for route tests, plain Vitest for unit tests), React + Tailwind (admin UI).

---

## Conventions & gotchas (read before starting)

- **Typecheck-on-edit hook** runs `tsc` on every Edit/Write and blocks on type errors — keep every saved file compilable. After any `worker/` edit run `tsc -p api/tsconfig.worker.json`.
- **Two wranglers, deploy from repo ROOT** — not relevant until a deploy is requested; do not deploy as part of this plan unless the user asks.
- **Do NOT add a 6th cron.** Free tier caps triggers at 5 and all 5 are used. Phase 4 only _modifies_ an existing cron schedule.
- **API route tests** (`api/test/routes/*.test.ts`) run under `vitest-pool-workers`; CI skips `test/routes/`, so run them locally: `cd api && npx vitest run test/routes/case-study-admin.test.ts` (no vitest flag). They do outbound DNS/TCP — when an agent runs them via the Claude Code **Bash tool**, set the Bash tool's `dangerouslyDisableSandbox: true` option (that's the harness sandbox, per the "api tests run un-sandboxed" memory — NOT a vitest CLI flag). A human in a normal terminal needs nothing extra.
  - **API unit tests** run from `api/` under the same pool (CI runs these): `cd api && npx vitest run test/case-study/publishing/planner.test.ts`. The root vitest config excludes `api/**`, so do NOT run api tests from the repo root.
- **`SocialContent` is defined twice** — canonical in `api/src/case-study/types.ts` (imported by `case-study-admin.ts`) and a duplicate in `api/src/case-study/generation/social.ts`. Extend the **types.ts** one; the social.ts copy is internal to generation and stays the minimal `{slug,twitter,linkedin,generatedAt}`.
- **Social KV keys** (`api/src/case-study/kv-keys.ts`): combined = `social:<slug>` (a `SocialContent` JSON), plus per-platform raw strings `social:<slug>:twitter` / `social:<slug>:linkedin`. The new scheduling metadata is stored in a NEW key `social-schedule:<slug>` (a `SocialSchedule` JSON) so it never collides with the existing three.
- **Mounted paths are real:** the sub-app is mounted at `/api/v1/admin`; inside `registerAdminRoutes` routes are declared WITHOUT that prefix (e.g. `admin.post('/schedule/:candidateId/publish-now', …)`). Frontend calls go through `adminApi.ts` with BASE `/api/v1/admin`, so the React side uses the un-prefixed path (e.g. `/schedule/<id>/publish-now`).

---

## Task 1 — Daily planner cron

Change the planner cron from weekly Mondays (`15 0 * * 1`) to daily (`15 0 * * *`) and make `worker/scheduled.ts` dispatch the planner under the new daily string. NO cron added — the array stays length 5.

**Files:**

- Modify: `wrangler.jsonc` (the `triggers.crons` array, currently lines 59-65)
- Modify: `worker/scheduled.ts` (planner dispatch branch, currently `if (csCron === '15 0 * * 1')` at lines 153-161; doc comment at lines 41-49 mentions `"15 0 * * 1" → weekly briefing`)
- (No new test file — this is a config + dispatch-string change; verified by `tsc -p api/tsconfig.worker.json` + a grep assertion below. The planner _logic_ is covered by Task 2.)

**Steps:**

- [ ] **1.1 Write a guard assertion (shell, not a vitest file).** Confirm the current state first so the change is visible:

  ```
  grep -n '"15 0 \* \* 1"' wrangler.jsonc worker/scheduled.ts
  ```

  Expected NOW: matches in BOTH `wrangler.jsonc` (line ~62) and `worker/scheduled.ts` (line ~153). This is the "before" snapshot.

- [ ] **1.2 Modify `wrangler.jsonc`** — change the planner cron string in the `crons` array. Exact replacement (keep array length 5, do not touch the other four strings):

  ```jsonc
  		"crons": [
  			"0 * * * *",
  			"5 0 * * *",
  			"15 0 * * *",
  			"30 0 * * *",
  			"45 0 * * 1"
  		]
  ```

  (Only `"15 0 * * 1"` → `"15 0 * * *"` changed.)

- [ ] **1.3 Modify `worker/scheduled.ts` planner dispatch.** Replace the existing branch:

  ```ts
  // Case-study planner — its own invocation.
  if (csCron === '15 0 * * 1') {
    ctx.waitUntil(
      runPlannerNow(env as unknown as CaseStudyEnv, csNow)
        .catch(logCronFail('planner'))
        .finally(() => logCronDone({ path: 'planner' }))
        .finally(releaseLease)
    );
    return;
  }
  ```

  with the daily string:

  ```ts
  // Case-study planner — its own invocation. Daily (was weekly Mondays):
  // drains the approved backlog each morning instead of waiting up to a
  // week. Still its OWN cron invocation; no other job shares "15 0 * * *".
  if (csCron === '15 0 * * *') {
    ctx.waitUntil(
      runPlannerNow(env as unknown as CaseStudyEnv, csNow)
        .catch(logCronFail('planner'))
        .finally(() => logCronDone({ path: 'planner' }))
        .finally(releaseLease)
    );
    return;
  }
  ```

- [ ] **1.4 Update the doc comment** at the top of `worker/scheduled.ts`. Replace the line:

  ```ts
   * - "15 0 * * 1" → weekly briefing for the prior ISO week (Mon → Sun)
  ```

  with:

  ```ts
   * - "15 0 * * *" → daily case-study planner (drains the approved backlog)
  ```

  (The weekly _briefing_ runs on its own `45 0 * * 1` cron via the dedicated-briefings path lower in the file — this comment line was describing the now-repurposed planner slot.)

- [ ] **1.5 Typecheck the worker.** Run:

  ```
  tsc -p api/tsconfig.worker.json
  ```

  Expected: PASS (no errors).

- [ ] **1.6 Verify the change landed.** Run:

  ```
  grep -n '"15 0 \* \* 1"' wrangler.jsonc worker/scheduled.ts; grep -n '"15 0 \* \* \*"' wrangler.jsonc worker/scheduled.ts
  ```

  Expected: NO matches for `"15 0 * * 1"`; matches for `"15 0 * * *"` in BOTH files. Confirm the crons array still has exactly 5 entries:

  ```
  grep -c '"\(0\|5\|15\|30\|45\) ' wrangler.jsonc
  ```

  (Sanity-check by eye that `triggers.crons` lists 5 strings.)

- [ ] **1.7 Commit.**

  ```
  feat(publishing): run case-study planner daily (15 0 * * *), not weekly

  Repurpose the existing weekly planner cron slot to fire every day so the
  approved backlog drains within ~1 day. No cron added (array stays 5);
  scheduled.ts planner branch + doc comment updated to the daily string.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Task 2 — Planner is order-stable under daily runs (regression guard)

The planner now fires daily, so it will _rewrite_ `schedule:upcoming` every day. `runPlanner` already calls `setSchedule(slots)` which _replaces_ the whole schedule. We add a unit test that locks in the existing daily-safe behaviour (deterministic given injected `random`/`now`) so a future change can't silently break the daily cadence. No production code change — this is a characterization test on the injected-deps orchestrator.

**Files:**

- Modify (test): `api/test/case-study/publishing/planner.test.ts`

**Steps:**

- [ ] **2.1 Add a failing-first test** to `api/test/case-study/publishing/planner.test.ts`. Append this `it` inside the existing `describe('runPlanner', …)` block. (It asserts slots land in the next 7 days from `now` and that `setSchedule` is called exactly once with a full replacement — the daily-rewrite contract.)

  ```ts
  it('rewrites the whole schedule each run (daily-safe replacement)', async () => {
    const writes: any[][] = [];
    await runPlanner({
      listApproved: async () => [c('a'), c('b'), c('c'), c('d')],
      setSchedule: async (slots) => {
        writes.push(slots);
      },
      now: new Date('2026-06-04T00:15:00Z'),
      random: () => 0.5,
    });
    // Exactly one setSchedule call — a full replacement, not an append.
    expect(writes).toHaveLength(1);
    const slots = writes[0]!;
    expect(slots.length).toBeGreaterThanOrEqual(2);
    for (const slot of slots) {
      const t = new Date(slot.slotAt).getTime();
      expect(t).toBeGreaterThan(Date.UTC(2026, 5, 4, 0, 15));
      expect(t).toBeLessThan(Date.UTC(2026, 5, 11, 0, 15));
      expect(slot.status).toBe('pending');
    }
  });
  ```

- [ ] **2.2 Run it — expect PASS (characterization).** Run from repo root:

  ```
  cd api && npx vitest run test/case-study/publishing/planner.test.ts
  ```

  Expected: ALL pass, including the new case. (This is a guard test; `runPlanner` already satisfies it. If it FAILS, the planner replacement contract regressed — stop and investigate before continuing.)

- [ ] **2.3 Commit.**

  ```
  test(publishing): lock planner full-replacement contract for daily cron

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Task 3 — Approve → fast lane ("publish next hour")

Add a lighter "soon" option alongside the existing immediate `publish-now`. On approve (or from ApprovedTab), schedule a pending slot at the next top-of-hour so the existing hourly publisher (`0 * * * *` → `runPublisherNow`) picks it up — live in <1hr — without doing the synchronous generate-on-request that `publish-now` does.

New route: `POST /api/v1/admin/approved/:id/publish-soon` (declared in the sub-app as `admin.post('/approved/:id/publish-soon', …)`). It looks up the approved candidate, computes the next hour boundary from `new Date()`, and _adds a pending slot_ to `schedule:upcoming` (merging with existing slots), then returns `{ ok, slotAt }`.

**Files:**

- Modify: `api/src/routes/case-study-admin.ts` (add route after the existing `/approved/:id/publish-now` handler, ~line 387)
- Modify: `src/pages/admin/ApprovedTab.tsx` (add a "Publish next hour" button + handler)
- Modify (test): `api/test/routes/case-study-admin.test.ts`

**Steps:**

- [ ] **3.1 Failing route test.** Append to `api/test/routes/case-study-admin.test.ts` (inside `describe('admin routes', …)`). The mockEnv KV already supports get/put/list. Note `setSchedule` writes the `schedule:upcoming` key.

  ```ts
  it('publish-soon adds a pending slot at the next hour boundary', async () => {
    const env = mockEnv();
    env.__store.set(`approved:${cand.key}`, JSON.stringify({ ...cand, status: 'approved' }));
    const r = await app().request(
      `/api/v1/admin/approved/${cand.key}/publish-soon`,
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.ok).toBe(true);
    // A pending slot for this candidate now exists in the schedule.
    const sched = JSON.parse(env.__store.get('schedule:upcoming')!);
    const slot = sched.find((s: any) => s.candidateId === cand.key);
    expect(slot).toBeTruthy();
    expect(slot.status).toBe('pending');
    // slotAt is on an exact hour boundary (mm:ss = 00:00).
    const d = new Date(slot.slotAt);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
  });

  it('publish-soon 404s when candidate is not approved', async () => {
    const env = mockEnv();
    const r = await app().request(
      `/api/v1/admin/approved/missing-key/publish-soon`,
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    expect(r.status).toBe(404);
  });
  ```

- [ ] **3.2 Run — expect FAIL.** Run from `api/` un-sandboxed:

  ```
  cd api && npx vitest run test/routes/case-study-admin.test.ts
  ```

  Expected: the two new cases FAIL (404 from Hono — route not found yet; first test gets 404 not 200).

- [ ] **3.3 Implement the route** in `api/src/routes/case-study-admin.ts`. Add immediately AFTER the existing `admin.post('/approved/:id/publish-now', …)` handler (which ends at the `});` near line 387). This reuses `getApproved`, `getSchedule`, `setSchedule` (already imported at lines 9-10):

  ```ts
  // ─── Fast lane: schedule an approved candidate for the NEXT hourly run ──
  // Lighter than publish-now: instead of generating the post synchronously
  // on this request, drop a pending slot at the next top-of-hour so the
  // hourly publisher cron ("0 * * * *" → runPublisherNow) picks it up. Live
  // in <1hr without paying the generation cost inside this HTTP request.
  admin.post('/approved/:id/publish-soon', async (c) => {
    const id = c.req.param('id');
    const candidate = await getApproved(c.env.CASE_STUDIES, id);
    if (!candidate) return c.json({ error: 'approved candidate not found' }, 404);

    // Next top-of-hour, in UTC, from now. If we're already exactly on the
    // hour the publisher for THIS hour may have run, so always advance to
    // the next hour for deterministic "<1hr" semantics.
    const now = new Date();
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    const slotAt = next.toISOString();

    const schedule = await getSchedule(c.env.CASE_STUDIES);
    // Replace any existing slot for this candidate; otherwise append.
    const others = schedule.filter((s) => s.candidateId !== id);
    const updated = [...others, { slotAt, candidateId: id, status: 'pending' as const }];
    await setSchedule(c.env.CASE_STUDIES, updated);

    return c.json({ ok: true, slotAt });
  });
  ```

- [ ] **3.4 Typecheck.** The per-edit hook runs `tsc` on save; it must pass. (No `worker/` change here, so no separate `tsc -p` run needed — but if the hook is bypassed, run `cd api && npx tsc --noEmit` to confirm.)

- [ ] **3.5 Run — expect PASS.** Re-run:

  ```
  cd api && npx vitest run test/routes/case-study-admin.test.ts
  ```

  Expected: all cases pass (new fast-lane cases green).

- [ ] **3.6 Commit (backend).**

  ```
  feat(publishing): approve fast lane — POST /admin/approved/:id/publish-soon

  Drops a pending slot at the next top-of-hour so the hourly publisher cron
  picks it up (<1hr) without synchronous generation. Lighter than the
  existing publish-now immediate path.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

- [ ] **3.7 Wire the UI.** In `src/pages/admin/ApprovedTab.tsx`, add a handler + button next to the existing "Publish now" / "Unapprove" buttons. Add this handler after the existing `publishNow` function (ends ~line 61):

  ```tsx
  async function publishSoon(id: string) {
    setPublishing(id);
    setPublishMsg(null);
    try {
      const r = await postJsonWithBody<{ ok?: boolean; slotAt?: string; error?: string }>(
        `/approved/${encodeURIComponent(id)}/publish-soon`,
        {}
      );
      setPublishMsg(r.ok ? `Scheduled for next hour (${new Date(r.slotAt!).toLocaleString()})` : `Error: ${r.error}`);
      await load();
    } catch (e) {
      setPublishMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(null);
    }
  }
  ```

  Then add the button in the actions cell, between the "Publish now" and "Unapprove" buttons (inside `<td className="py-2 flex gap-2">`, after the `Publish now` button's `</button>`):

  ```tsx
  <button
    onClick={() => publishSoon(c.key)}
    disabled={publishing === c.key}
    className="px-2 py-1 border border-amber-700 rounded text-xs hover:bg-amber-900/30 disabled:opacity-50"
  >
    {publishing === c.key ? '…' : 'Publish next hour'}
  </button>
  ```

- [ ] **3.8 Typecheck the frontend.** Run from repo root:

  ```
  npx tsc --noEmit
  ```

  Expected: PASS. (Manual UI verification is deferred to the user/`/run` skill; no DOM test exists for these tabs in this repo.)

- [ ] **3.9 Commit (frontend).**

  ```
  feat(admin): ApprovedTab "Publish next hour" fast-lane button

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Task 4 — Per-item reschedule endpoint (`validate()` + contract test)

New `POST /api/v1/admin/schedule/:candidateId/reschedule` taking `{ slotAt }` (ISO 8601). It mutates the matching pending slot's `slotAt` in `schedule:upcoming`. The route uses a `validate('json', rescheduleSlotSchema)` Zod schema that MIRRORS the handler read (`{ slotAt: string }`). A contract test mounts BOTH the real `looseValidation()` (256 KB body cap) AND the real `validate()` schema so the integration matches production middleware.

**Files:**

- Modify: `api/src/lib/validation-schemas.ts` (add `rescheduleSlotSchema` near the other admin schemas, ~line 726)
- Modify: `api/src/routes/case-study-admin.ts` (import `validate` + the schema; add the route after `/schedule/:candidateId/remove`, ~line 214)
- Modify: `src/pages/admin/ScheduleTab.tsx` (add a date/time control + handler)
- Modify (test): `api/test/routes/case-study-admin.test.ts` (contract test mounting real middleware)

**Steps:**

- [ ] **4.1 Add the Zod schema.** In `api/src/lib/validation-schemas.ts`, add after `adminApiKeyCreateSchema` (ends ~line 726):

  ```ts
  // Mirror the reschedule handler's read in case-study-admin.ts: the body is
  // exactly `{ slotAt }` — an ISO-8601 datetime string. Anything else 400s
  // before the handler runs. `:candidateId` is a path param (not in the body).
  export const rescheduleSlotSchema = z.object({
    slotAt: z.string().datetime({ message: 'slotAt must be an ISO-8601 datetime' }),
  });
  ```

  (`z` is already imported at the top of this file — the other admin schemas use it.)

- [ ] **4.2 Failing contract test.** Append to `api/test/routes/case-study-admin.test.ts`. This mounts the REAL `looseValidation()` middleware on `/api/v1/*` in front of the admin sub-app, exactly like `api/src/index.ts` does, so the test exercises the production middleware stack. Add the import at the top of the test file (with the other imports):

  ```ts
  import { looseValidation } from '../../src/lib/loose-validate';
  ```

  Then add a second app factory + tests (place after the existing `app()` helper and `describe` block, or inside the existing describe — keep it self-contained):

  ```ts
  function appWithMiddleware() {
    const a = new Hono<any>();
    a.use('/api/v1/*', looseValidation());
    registerAdminRoutes(a);
    return a;
  }

  describe('admin reschedule route', () => {
    const slotAt0 = '2026-06-10T09:00:00.000Z';
    const newAt = '2026-06-12T14:30:00.000Z';

    function seedSchedule(env: any) {
      env.__store.set(
        'schedule:upcoming',
        JSON.stringify([{ slotAt: slotAt0, candidateId: cand.key, status: 'pending' }])
      );
    }

    it('reschedules a pending slot to a new slotAt', async () => {
      const env = mockEnv();
      seedSchedule(env);
      const r = await appWithMiddleware().request(
        `/api/v1/admin/schedule/${cand.key}/reschedule`,
        {
          method: 'POST',
          headers: { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' },
          body: JSON.stringify({ slotAt: newAt }),
        },
        env
      );
      expect(r.status).toBe(200);
      const sched = JSON.parse(env.__store.get('schedule:upcoming')!);
      const slot = sched.find((s: any) => s.candidateId === cand.key);
      expect(slot.slotAt).toBe(newAt);
      expect(slot.status).toBe('pending');
    });

    it('400s when slotAt is missing (validate schema mirrors handler)', async () => {
      const env = mockEnv();
      seedSchedule(env);
      const r = await appWithMiddleware().request(
        `/api/v1/admin/schedule/${cand.key}/reschedule`,
        {
          method: 'POST',
          headers: { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
        env
      );
      expect(r.status).toBe(400);
    });

    it('400s when slotAt is not an ISO datetime', async () => {
      const env = mockEnv();
      seedSchedule(env);
      const r = await appWithMiddleware().request(
        `/api/v1/admin/schedule/${cand.key}/reschedule`,
        {
          method: 'POST',
          headers: { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' },
          body: JSON.stringify({ slotAt: 'not-a-date' }),
        },
        env
      );
      expect(r.status).toBe(400);
    });

    it('404s when no pending slot matches the candidateId', async () => {
      const env = mockEnv();
      // empty schedule
      const r = await appWithMiddleware().request(
        `/api/v1/admin/schedule/${cand.key}/reschedule`,
        {
          method: 'POST',
          headers: { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' },
          body: JSON.stringify({ slotAt: newAt }),
        },
        env
      );
      expect(r.status).toBe(404);
    });
  });
  ```

- [ ] **4.3 Run — expect FAIL.** Run from `api/` un-sandboxed:

  ```
  cd api && npx vitest run test/routes/case-study-admin.test.ts
  ```

  Expected: the reschedule cases FAIL (route not registered → 404 for the success case where 200 is expected).

- [ ] **4.4 Implement the route.** In `api/src/routes/case-study-admin.ts`:
  - Add `validate` to the imports. Add this import near the top with the other `../lib` imports (e.g. after the `safeJsonBody` import on line 5):
    ```ts
    import { validate } from '../lib/validate';
    import { rescheduleSlotSchema } from '../lib/validation-schemas';
    ```
  - Add the route AFTER `admin.post('/schedule/:candidateId/remove', …)` (ends ~line 214). The handler reads ONLY `{ slotAt }` from the body (mirrored by the schema). Use `getParsed`-free direct read via `c.req.json()` is fine since `validate()` already parsed; but to match the validated value, read it from the parsed body. The simplest correct form re-reads the JSON (Hono caches the body):

    ```ts
    // ─── Reschedule a pending slot to a new date/time ──────────────────────
    // validate('json', rescheduleSlotSchema) enforces { slotAt: ISO-8601 }
    // BEFORE this handler runs (mirrors the read below). Only a `pending`
    // slot can move; published/failed slots are immutable here.
    admin.post('/schedule/:candidateId/reschedule', validate('json', rescheduleSlotSchema), async (c) => {
      const candidateId = c.req.param('candidateId');
      const { slotAt } = await c.req.json<{ slotAt: string }>();

      const schedule = await getSchedule(c.env.CASE_STUDIES);
      const slot = schedule.find((s) => s.candidateId === candidateId);
      if (!slot) return c.json({ error: 'slot not found' }, 404);
      if (slot.status !== 'pending') {
        return c.json({ error: `slot status is ${slot.status}, not pending` }, 400);
      }

      const updated = schedule.map((s) => (s.candidateId === candidateId ? { ...s, slotAt } : s));
      await setSchedule(c.env.CASE_STUDIES, updated);
      return c.json({ ok: true, slotAt });
    });
    ```

    (`getSchedule`/`setSchedule` are already imported at line 10.)

- [ ] **4.5 Typecheck.** The per-edit hook runs `tsc`. Confirm with `cd api && npx tsc --noEmit` if needed — expected PASS.

- [ ] **4.6 Run — expect PASS.** Re-run:

  ```
  cd api && npx vitest run test/routes/case-study-admin.test.ts
  ```

  Expected: all reschedule cases pass — success (200), missing-field (400), bad-datetime (400), no-match (404).

- [ ] **4.7 Commit (backend).**

  ```
  feat(publishing): POST /admin/schedule/:candidateId/reschedule + validate schema

  New per-item reschedule moves a pending slot's slotAt. validate('json',
  rescheduleSlotSchema) mirrors the handler's { slotAt } read; contract test
  mounts the real looseValidation + validate middleware.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

- [ ] **4.8 Wire the UI.** In `src/pages/admin/ScheduleTab.tsx`:
  - Add a `datetime-local`-backed reschedule control per pending row. Add a `rescheduling` state and a handler. After the existing `removeSlot` function (ends ~line 70):
    ```tsx
    async function reschedule(candidateId: string, localValue: string) {
      if (!localValue) return;
      // datetime-local yields "YYYY-MM-DDTHH:mm" (no seconds/zone). Treat it
      // as local time and convert to a full ISO-8601 UTC string for the API.
      const iso = new Date(localValue).toISOString();
      setPublishing(candidateId);
      setMsg(null);
      try {
        const r = await postJsonWithBody<{ ok?: boolean; slotAt?: string; error?: string }>(
          `/schedule/${encodeURIComponent(candidateId)}/reschedule`,
          { slotAt: iso }
        );
        setMsg(r.ok ? `Rescheduled to ${new Date(r.slotAt!).toLocaleString()}` : `Error: ${r.error}`);
        await load();
      } catch (e) {
        setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setPublishing(null);
      }
    }
    ```
  - In the pending-row actions block (the `{s.status === 'pending' && (<>…</>)}` fragment, ~lines 116-133), add an inline date/time input + Apply button after the "Remove" button. Use a local component state via a small uncontrolled input read on click:
    ```tsx
    <input
      type="datetime-local"
      aria-label={`Reschedule ${s.candidateId}`}
      defaultValue={toLocalInputValue(s.slotAt)}
      disabled={publishing === s.candidateId}
      className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 disabled:opacity-50"
      onChange={(e) => void reschedule(s.candidateId, e.target.value)}
    />
    ```
  - Add a helper above the component (or near the top of the file) to format an ISO string into the `datetime-local` value:
    ```tsx
    function toLocalInputValue(iso: string): string {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    ```
  - Also extend the local `Slot` interface's `status` union in this file (line 7) to include `'draft'` so it matches the backend type (it currently omits it):
    ```tsx
    status: 'pending' | 'publishing' | 'published' | 'failed' | 'draft';
    ```

- [ ] **4.9 Typecheck the frontend.** Run from repo root:

  ```
  npx tsc --noEmit
  ```

  Expected: PASS.

- [ ] **4.10 Commit (frontend).**

  ```
  feat(admin): ScheduleTab per-slot reschedule (datetime-local control)

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Task 5 — Social scheduling queue (type + storage)

Extend `SocialContent` with optional per-platform scheduling metadata, and add a NEW storage module + KV key for a per-slug social schedule (`social-schedule:<slug>`). The schedule tracks one entry per platform with `{ platform, scheduledAt, status: 'pending'|'posted', bestTimeHint, postedAt? }`. Posting stays manual (no LinkedIn/X API) — this only persists intent + status.

**Files:**

- Modify: `api/src/case-study/types.ts` (add `SocialScheduleEntry` + `SocialSchedule`; extend `SocialContent` with an optional `schedule?` field for forward-compat)
- Modify: `api/src/case-study/kv-keys.ts` (add `socialSchedule(slug)` key)
- Create: `api/src/case-study/storage/social-schedule.ts` (`getSocialSchedule`, `setSocialSchedule`, `upsertSocialEntry`, `markPosted`)
- Create (test): `api/test/case-study/storage/social-schedule.test.ts`

**Steps:**

- [ ] **5.1 Add the types.** In `api/src/case-study/types.ts`, replace the existing `SocialContent` block (lines 123-128) with the extended version + new types:

  ```ts
  export type SocialPlatform = 'twitter' | 'linkedin';
  export type SocialPostStatus = 'pending' | 'posted';

  export interface SocialScheduleEntry {
    platform: SocialPlatform;
    /** ISO 8601 — when the admin intends to post (manually). */
    scheduledAt: string;
    status: SocialPostStatus;
    /** Best-time hint surfaced from generation (e.g. "Tue-Thu, 8-10am local"). */
    bestTimeHint?: string;
    /** ISO 8601 set when the admin marks it posted. */
    postedAt?: string;
  }

  export interface SocialSchedule {
    slug: string;
    entries: SocialScheduleEntry[];
  }

  export interface SocialContent {
    slug: string;
    twitter: string;
    linkedin: string;
    generatedAt: string;
    /** Optional scheduling queue (Phase 4). Absent for legacy generated content. */
    schedule?: SocialScheduleEntry[];
  }
  ```

- [ ] **5.2 Add the KV key.** In `api/src/case-study/kv-keys.ts`, add inside the `kv` object after the `social:` keys (after line 22):

  ```ts
    socialSchedule: (slug: string) => `social-schedule:${slug}`,
  ```

- [ ] **5.3 Failing storage test.** Create `api/test/case-study/storage/social-schedule.test.ts` (mirror the existing `schedule.test.ts` mockKV style):

  ```ts
  import { describe, it, expect } from 'vitest';
  import {
    getSocialSchedule,
    setSocialSchedule,
    upsertSocialEntry,
    markPosted,
  } from '../../../src/case-study/storage/social-schedule';
  import type { SocialScheduleEntry } from '../../../src/case-study/types';

  function mockKV() {
    const store = new Map<string, string>();
    return {
      async get(key: string, type?: 'json') {
        const v = store.get(key);
        if (v === undefined) return null;
        return type === 'json' ? JSON.parse(v) : v;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
      async delete(key: string) {
        store.delete(key);
      },
    };
  }

  const tw: SocialScheduleEntry = {
    platform: 'twitter',
    scheduledAt: '2026-06-10T13:00:00.000Z',
    status: 'pending',
    bestTimeHint: 'Tue-Thu mornings',
  };

  describe('social-schedule storage', () => {
    it('empty schedule by default', async () => {
      const ns = mockKV() as any;
      expect(await getSocialSchedule(ns, 'my-slug')).toEqual({ slug: 'my-slug', entries: [] });
    });

    it('round-trips a schedule', async () => {
      const ns = mockKV() as any;
      await setSocialSchedule(ns, { slug: 'my-slug', entries: [tw] });
      expect(await getSocialSchedule(ns, 'my-slug')).toEqual({ slug: 'my-slug', entries: [tw] });
    });

    it('upsert replaces the entry for the same platform', async () => {
      const ns = mockKV() as any;
      await upsertSocialEntry(ns, 'my-slug', tw);
      await upsertSocialEntry(ns, 'my-slug', { ...tw, scheduledAt: '2026-06-11T13:00:00.000Z' });
      const s = await getSocialSchedule(ns, 'my-slug');
      expect(s.entries).toHaveLength(1);
      expect(s.entries[0]!.scheduledAt).toBe('2026-06-11T13:00:00.000Z');
    });

    it('markPosted flips status + sets postedAt', async () => {
      const ns = mockKV() as any;
      await upsertSocialEntry(ns, 'my-slug', tw);
      await markPosted(ns, 'my-slug', 'twitter', new Date('2026-06-10T13:05:00.000Z'));
      const s = await getSocialSchedule(ns, 'my-slug');
      expect(s.entries[0]!.status).toBe('posted');
      expect(s.entries[0]!.postedAt).toBe('2026-06-10T13:05:00.000Z');
    });
  });
  ```

- [ ] **5.4 Run — expect FAIL.** Run from repo root:

  ```
  cd api && npx vitest run test/case-study/storage/social-schedule.test.ts
  ```

  Expected: FAIL (module `social-schedule.ts` does not exist → import error).

- [ ] **5.5 Implement the storage module.** Create `api/src/case-study/storage/social-schedule.ts`:

  ```ts
  import type { KVNamespace } from '@cloudflare/workers-types';
  import type { SocialPlatform, SocialSchedule, SocialScheduleEntry } from '../types';
  import { kv } from '../kv-keys';

  /**
   * Per-post social scheduling queue. Stored at `social-schedule:<slug>` so it
   * never collides with the existing `social:<slug>` (combined content) or
   * `social:<slug>:twitter|linkedin` (per-platform raw text) keys. Posting is
   * manual (no LinkedIn/X API) — this tracks intent + status only.
   */
  export async function getSocialSchedule(ns: KVNamespace, slug: string): Promise<SocialSchedule> {
    const raw = (await ns.get(kv.socialSchedule(slug), 'json')) as SocialSchedule | null;
    return raw ?? { slug, entries: [] };
  }

  export async function setSocialSchedule(ns: KVNamespace, schedule: SocialSchedule): Promise<void> {
    await ns.put(kv.socialSchedule(schedule.slug), JSON.stringify(schedule));
  }

  /** Insert or replace the entry for a platform (one entry per platform). */
  export async function upsertSocialEntry(ns: KVNamespace, slug: string, entry: SocialScheduleEntry): Promise<void> {
    const current = await getSocialSchedule(ns, slug);
    const others = current.entries.filter((e) => e.platform !== entry.platform);
    await setSocialSchedule(ns, { slug, entries: [...others, entry] });
  }

  /** Flip a platform's entry to `posted` and stamp `postedAt`. No-op if absent. */
  export async function markPosted(ns: KVNamespace, slug: string, platform: SocialPlatform, now: Date): Promise<void> {
    const current = await getSocialSchedule(ns, slug);
    const entries = current.entries.map((e) =>
      e.platform === platform ? { ...e, status: 'posted' as const, postedAt: now.toISOString() } : e
    );
    await setSocialSchedule(ns, { slug, entries });
  }
  ```

- [ ] **5.6 Run — expect PASS.** Re-run:

  ```
  cd api && npx vitest run test/case-study/storage/social-schedule.test.ts
  ```

  Expected: all 4 cases pass.

- [ ] **5.7 Commit.**

  ```
  feat(social): SocialSchedule type + social-schedule:<slug> KV storage

  Per-platform scheduling queue { platform, scheduledAt, status, bestTimeHint,
  postedAt } stored at a new social-schedule:<slug> key. Posting stays manual;
  this tracks intent + status only.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Task 6 — Social scheduling queue routes

Add admin routes to read/schedule/mark-posted the social queue:

- `GET  /api/v1/admin/social-schedule/:slug` → `{ ok, schedule }`
- `POST /api/v1/admin/social-schedule/:slug` with `{ platform, scheduledAt, bestTimeHint? }` → upsert a pending entry (validate schema mirrors read)
- `POST /api/v1/admin/social-schedule/:slug/posted` with `{ platform }` → mark posted

**Files:**

- Modify: `api/src/lib/validation-schemas.ts` (add `socialScheduleUpsertSchema`, `socialMarkPostedSchema`)
- Modify: `api/src/routes/case-study-admin.ts` (import storage fns + schemas; add 3 routes after the `/social/:slug/linkedin` route, ~line 477)
- Modify (test): `api/test/routes/case-study-admin.test.ts`

**Steps:**

- [ ] **6.1 Add Zod schemas.** In `api/src/lib/validation-schemas.ts`, after `rescheduleSlotSchema` (from Task 4):

  ```ts
  // Mirror the social-schedule upsert handler read: { platform, scheduledAt,
  // bestTimeHint? }. platform is the closed set the SocialScheduleEntry uses.
  export const socialScheduleUpsertSchema = z.object({
    platform: z.enum(['twitter', 'linkedin']),
    scheduledAt: z.string().datetime({ message: 'scheduledAt must be ISO-8601' }),
    bestTimeHint: z.string().max(200).optional(),
  });

  // Mirror the mark-posted handler read: { platform } only.
  export const socialMarkPostedSchema = z.object({
    platform: z.enum(['twitter', 'linkedin']),
  });
  ```

- [ ] **6.2 Failing route tests.** Append to `api/test/routes/case-study-admin.test.ts` (use the `appWithMiddleware()` factory from Task 4 so `validate` runs behind the real `looseValidation`):

  ```ts
  describe('admin social-schedule routes', () => {
    const slug = 'cve-2026-1234-x';

    it('upserts a pending social schedule entry', async () => {
      const env = mockEnv();
      const r = await appWithMiddleware().request(
        `/api/v1/admin/social-schedule/${slug}`,
        {
          method: 'POST',
          headers: { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' },
          body: JSON.stringify({
            platform: 'twitter',
            scheduledAt: '2026-06-10T13:00:00.000Z',
            bestTimeHint: 'Tue-Thu mornings',
          }),
        },
        env
      );
      expect(r.status).toBe(200);
      const stored = JSON.parse(env.__store.get(`social-schedule:${slug}`)!);
      expect(stored.entries).toHaveLength(1);
      expect(stored.entries[0].platform).toBe('twitter');
      expect(stored.entries[0].status).toBe('pending');
    });

    it('400s on bad platform', async () => {
      const env = mockEnv();
      const r = await appWithMiddleware().request(
        `/api/v1/admin/social-schedule/${slug}`,
        {
          method: 'POST',
          headers: { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' },
          body: JSON.stringify({ platform: 'mastodon', scheduledAt: '2026-06-10T13:00:00.000Z' }),
        },
        env
      );
      expect(r.status).toBe(400);
    });

    it('GET returns the schedule', async () => {
      const env = mockEnv();
      env.__store.set(
        `social-schedule:${slug}`,
        JSON.stringify({
          slug,
          entries: [{ platform: 'twitter', scheduledAt: '2026-06-10T13:00:00.000Z', status: 'pending' }],
        })
      );
      const r = await appWithMiddleware().request(
        `/api/v1/admin/social-schedule/${slug}`,
        { headers: { 'X-Admin-Token': 'sekret' } },
        env
      );
      expect(r.status).toBe(200);
      const body = (await r.json()) as any;
      expect(body.schedule.entries).toHaveLength(1);
    });

    it('marks an entry posted', async () => {
      const env = mockEnv();
      env.__store.set(
        `social-schedule:${slug}`,
        JSON.stringify({
          slug,
          entries: [{ platform: 'twitter', scheduledAt: '2026-06-10T13:00:00.000Z', status: 'pending' }],
        })
      );
      const r = await appWithMiddleware().request(
        `/api/v1/admin/social-schedule/${slug}/posted`,
        {
          method: 'POST',
          headers: { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' },
          body: JSON.stringify({ platform: 'twitter' }),
        },
        env
      );
      expect(r.status).toBe(200);
      const stored = JSON.parse(env.__store.get(`social-schedule:${slug}`)!);
      expect(stored.entries[0].status).toBe('posted');
      expect(stored.entries[0].postedAt).toBeTruthy();
    });
  });
  ```

- [ ] **6.3 Run — expect FAIL.** Run from `api/`:

  ```
  cd api && npx vitest run test/routes/case-study-admin.test.ts
  ```

  Expected: the social-schedule cases FAIL (routes not registered).

- [ ] **6.4 Implement the routes.** In `api/src/routes/case-study-admin.ts`:
  - Add imports (with the other case-study storage imports near the top):
    ```ts
    import { getSocialSchedule, upsertSocialEntry, markPosted } from '../case-study/storage/social-schedule';
    import { socialScheduleUpsertSchema, socialMarkPostedSchema } from '../lib/validation-schemas';
    ```
    (Merge the `validation-schemas` import with the `rescheduleSlotSchema` import added in Task 4 into one line.)
  - Add the three routes AFTER `admin.post('/social/:slug/linkedin', …)` (ends ~line 477), reusing the `validSlug` guard already in the file:

    ```ts
    // ─── Social scheduling queue (manual posting, tracked) ─────────────────
    admin.get('/social-schedule/:slug', async (c) => {
      const slug = c.req.param('slug');
      if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
      const schedule = await getSocialSchedule(c.env.CASE_STUDIES, slug);
      return c.json({ ok: true, schedule });
    });

    admin.post('/social-schedule/:slug', validate('json', socialScheduleUpsertSchema), async (c) => {
      const slug = c.req.param('slug');
      if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
      const { platform, scheduledAt, bestTimeHint } = await c.req.json<{
        platform: 'twitter' | 'linkedin';
        scheduledAt: string;
        bestTimeHint?: string;
      }>();
      await upsertSocialEntry(c.env.CASE_STUDIES, slug, {
        platform,
        scheduledAt,
        status: 'pending',
        bestTimeHint,
      });
      const schedule = await getSocialSchedule(c.env.CASE_STUDIES, slug);
      return c.json({ ok: true, schedule });
    });

    admin.post('/social-schedule/:slug/posted', validate('json', socialMarkPostedSchema), async (c) => {
      const slug = c.req.param('slug');
      if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
      const { platform } = await c.req.json<{ platform: 'twitter' | 'linkedin' }>();
      await markPosted(c.env.CASE_STUDIES, slug, platform, new Date());
      const schedule = await getSocialSchedule(c.env.CASE_STUDIES, slug);
      return c.json({ ok: true, schedule });
    });
    ```

- [ ] **6.5 Typecheck.** Per-edit hook runs `tsc`; confirm `cd api && npx tsc --noEmit` PASS.

- [ ] **6.6 Run — expect PASS.** Re-run:

  ```
  cd api && npx vitest run test/routes/case-study-admin.test.ts
  ```

  Expected: all social-schedule cases green.

- [ ] **6.7 Commit.**

  ```
  feat(social): admin social-schedule routes (get/upsert/mark-posted) + schemas

  GET /admin/social-schedule/:slug, POST (upsert pending), POST /posted.
  validate() schemas mirror handler reads; contract tests mount the real
  looseValidation + validate middleware.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Task 7 — PublishedTab social queue UI (schedule / due / mark-posted)

Surface the social queue in `PublishedTab.tsx`: per post, let the admin pick a `scheduledAt` per platform, show a best-time hint, show due/overdue indicators, and "mark as posted". Pure UI wiring against Task 6's routes; no DOM test exists in this repo (verify via typecheck + the `/run` skill on request).

**Files:**

- Modify: `src/pages/admin/PublishedTab.tsx`

**Steps:**

- [ ] **7.1 Add the schedule data model + fetch.** In `PublishedTab.tsx`, add interfaces near the existing `SocialContent` interface (top of file, ~line 18):

  ```tsx
  type SocialPlatform = 'twitter' | 'linkedin';
  interface SocialScheduleEntry {
    platform: SocialPlatform;
    scheduledAt: string;
    status: 'pending' | 'posted';
    bestTimeHint?: string;
    postedAt?: string;
  }
  interface SocialSchedule {
    slug: string;
    entries: SocialScheduleEntry[];
  }
  ```

  Add a state map next to the existing `social` state (~line 33):

  ```tsx
  const [schedules, setSchedules] = useState<Record<string, SocialSchedule>>({});
  ```

- [ ] **7.2 Load schedules in `load()`.** Inside the existing `load()` `Promise.all(d.posts.map(...))` block (~line 47), after the existing `/social/<slug>` fetch, also fetch the schedule (best-effort, optional):

  ```tsx
  try {
    const sr = await getJson<{ ok: boolean; schedule: SocialSchedule }>(
      `/social-schedule/${encodeURIComponent(p.slug)}`
    );
    if (sr.ok) schedAcc[p.slug] = sr.schedule;
  } catch {
    /* schedule is optional */
  }
  ```

  Declare `const schedAcc: Record<string, SocialSchedule> = {};` next to the existing `const initial: SocialState = {};` and call `setSchedules(schedAcc);` next to `setSocial(initial);`.

- [ ] **7.3 Add schedule + mark-posted handlers.** After the existing `generateLinkedin` function (~line 153):

  ```tsx
  async function scheduleSocial(slug: string, platform: SocialPlatform, localValue: string) {
    if (!localValue) return;
    const scheduledAt = new Date(localValue).toISOString();
    try {
      const r = await postJsonWithBody<{ ok: boolean; schedule: SocialSchedule }>(
        `/social-schedule/${encodeURIComponent(slug)}`,
        { platform, scheduledAt }
      );
      if (r.ok) setSchedules((prev) => ({ ...prev, [slug]: r.schedule }));
    } catch (e) {
      setActionMsg(`schedule failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function markPosted(slug: string, platform: SocialPlatform) {
    try {
      const r = await postJsonWithBody<{ ok: boolean; schedule: SocialSchedule }>(
        `/social-schedule/${encodeURIComponent(slug)}/posted`,
        { platform }
      );
      if (r.ok) setSchedules((prev) => ({ ...prev, [slug]: r.schedule }));
    } catch (e) {
      setActionMsg(`mark-posted failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  ```

- [ ] **7.4 Render the queue in the expanded panel.** In the `SocialContentPanel` render path (the `{expanded && social[expanded]?.data && (…)}` block, ~line 270), pass `schedules[expanded]`, the handlers, and `expanded` (the slug) into `SocialContentPanel`. Inside `SocialContentPanel`, under each platform's `<pre>`, add a scheduling row. For each platform compute due/overdue from `entry.scheduledAt` vs `Date.now()`:

  ```tsx
  {
    /* per-platform schedule row */
  }
  {
    (() => {
      const entry = schedule?.entries.find((e) => e.platform === 'twitter');
      const overdue = entry && entry.status === 'pending' && new Date(entry.scheduledAt).getTime() < Date.now();
      return (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <input
            type="datetime-local"
            aria-label="Schedule twitter"
            className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200"
            onChange={(e) => void onSchedule('twitter', e.target.value)}
          />
          {entry && (
            <span className={overdue ? 'text-red-400' : 'text-slate-400'}>
              {entry.status === 'posted'
                ? `posted ${new Date(entry.postedAt!).toLocaleString()}`
                : `${overdue ? 'OVERDUE' : 'due'} ${new Date(entry.scheduledAt).toLocaleString()}`}
            </span>
          )}
          {entry && entry.status === 'pending' && (
            <button
              onClick={() => void onMarkPosted('twitter')}
              className="px-2 py-1 border border-green-700 rounded hover:bg-green-900/30"
            >
              Mark posted
            </button>
          )}
        </div>
      );
    })();
  }
  ```

  Repeat the same block for `'linkedin'` under the LinkedIn `<pre>`. Add the new props to `SocialContentPanel`'s signature:

  ```tsx
    schedule,
    onSchedule,
    onMarkPosted,
  }: {
    // …existing props…
    schedule: SocialSchedule | undefined;
    onSchedule: (platform: SocialPlatform, localValue: string) => void;
    onMarkPosted: (platform: SocialPlatform) => void;
  }) {
  ```

  And pass them at the call site:

  ```tsx
  <SocialContentPanel
    data={social[expanded].data!}
    schedule={schedules[expanded]}
    onSchedule={(platform, v) => void scheduleSocial(expanded, platform, v)}
    onMarkPosted={(platform) => void markPosted(expanded, platform)}
    onCopy={copyText}
    onClose={() => setExpanded(null)}
    onRegenTwitter={() => generateTwitter(expanded)}
    onRegenLinkedin={() => generateLinkedin(expanded)}
    regenTwitterBusy={social[expanded]?.loadingTwitter ?? false}
    regenLinkedinBusy={social[expanded]?.loadingLinkedin ?? false}
  />
  ```

- [ ] **7.5 Typecheck the frontend.** Run from repo root:

  ```
  npx tsc --noEmit
  ```

  Expected: PASS.

- [ ] **7.6 Commit.**

  ```
  feat(admin): PublishedTab social queue — schedule, due/overdue, mark-posted

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Task 8 — Full-suite verification

- [ ] **8.1 Worker typecheck.** Run:

  ```
  tsc -p api/tsconfig.worker.json
  ```

  Expected: PASS.

- [ ] **8.2 Frontend + api typecheck.** Run from repo root and from `api/`:

  ```
  npx tsc --noEmit && (cd api && npx tsc --noEmit)
  ```

  Expected: PASS both.

- [ ] **8.3 Unit tests (no workers pool), from repo root.** Run:

  ```
  cd api && npx vitest run test/case-study/publishing/planner.test.ts test/case-study/storage/social-schedule.test.ts test/case-study/storage/schedule.test.ts test/case-study/publishing/publisher.test.ts
  ```

  Expected: all PASS.

- [ ] **8.4 Route contract tests (un-sandboxed), from `api/`.** Run:

  ```
  cd api && npx vitest run test/routes/case-study-admin.test.ts
  ```

  Expected: all PASS (existing + new fast-lane, reschedule, social-schedule cases).

- [ ] **8.5 Final verification (use superpowers:verification-before-completion).** Confirm: cron array still length 5; no `"15 0 * * 1"` remains; all new routes registered under the `/api/v1/admin` sub-app; every new `validate()` schema mirrors its handler's read. Do NOT claim completion without the test output above shown green.

---

## §6 acceptance mapping

| §6 requirement                                                                                          | Task                               |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 6.1 Daily planner cron (`15 0 * * *`, no cron added)                                                    | Task 1 (+ Task 2 regression guard) |
| 6.2 Approve → fast lane ("publish next hour") + ApprovedTab                                             | Task 3                             |
| 6.3 Per-item reschedule route + validate schema + test + ScheduleTab                                    | Task 4                             |
| 6.4 Social scheduling queue (type/storage + routes) + PublishedTab (schedule, due/overdue, mark-posted) | Tasks 5, 6, 7                      |

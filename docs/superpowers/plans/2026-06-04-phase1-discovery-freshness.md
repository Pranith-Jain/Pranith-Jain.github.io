# Phase 1 — Discovery Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin` discovery surface genuinely different candidate ideas each day, stop skipped items from resurfacing, add a one-click "clear all", and broaden sources — all within the Free-plan subrequest budget.

**Architecture:** Discovery is a dependency-injected orchestrator (`runDiscovery`) wired by `runDiscoveryNow` and driven by a daily cron. We add (1) a pure date-seeded weighted sampler injected as the per-topic selector so selection varies day-to-day while staying quality-weighted, (2) a `suppressedUntil` field on the dedup record plus a pure suppression gate so Skip/Clear-all hide items for 30 days, (3) a bulk `skip-all` admin route + UI button, (4) new RSS/JSON discovery runners (advisories, VulnCheck KEV, EUVD), and (5) a pure day-rotation helper that runs a rotating subset of lower-priority runners each day to add variety and bound subrequests.

**Tech Stack:** TypeScript, Hono (admin API), Cloudflare Workers KV, React (admin UI), Vitest (`@cloudflare/vitest-pool-workers` for `api/`, jsdom+React-Testing-Library for `src/`).

---

## Test commands (read once)

- **`api/` unit tests** (run in CI, no special flag): `cd api && npx vitest run <path>`
  - These live under `test/case-study/` and `test/lib/` and run under the workers pool fine.
- **`api/` route tests** (CI **skips** `test/routes/`; run locally): `cd api && npx vitest run test/routes/<file>`
  - Route tests do outbound DNS/TCP. CI excludes them. When you (an agent) run them via the Claude Code **Bash tool**, pass the Bash tool's `dangerouslyDisableSandbox: true` option — this is the _harness_ sandbox, NOT a vitest CLI flag. A human in a normal terminal needs no flag.
- **`src/` frontend tests**: `npx vitest run <path>` (root; jsdom + RTL already configured in `vitest.config.ts`, setup `src/test/setup.ts`).
- **Worker typecheck after `worker/` edits**: `cd api && npx tsc -p tsconfig.worker.json` (none expected in Phase 1).
- **api typecheck**: `cd api && npx tsc --noEmit`.
- **Commit trailer** (every commit): end the message with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- A typecheck-on-edit hook blocks saves that don't compile — keep each step compilable.

---

## Task 1: Date-seeded weighted sampler (pure helper)

**Files:**

- Create: `api/src/case-study/discovery/sampling.ts`
- Test: `api/test/case-study/discovery/sampling.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/discovery/sampling.test.ts
import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed, weightedSampleByScore } from '../../../src/case-study/discovery/sampling';
import type { Candidate } from '../../../src/case-study/types';

const c = (key: string, score: number): Candidate => ({
  key,
  type: 'cve',
  title: key,
  rationale: '',
  score,
  evidence: {},
  discoveredAt: '2026-06-04T06:00:00Z',
  status: 'pending',
});

describe('dateSeed', () => {
  it('is stable within a UTC day and differs across days', () => {
    expect(dateSeed(new Date('2026-06-04T01:00:00Z'))).toBe(dateSeed(new Date('2026-06-04T23:00:00Z')));
    expect(dateSeed(new Date('2026-06-04T06:00:00Z'))).not.toBe(dateSeed(new Date('2026-06-05T06:00:00Z')));
  });
});

describe('weightedSampleByScore', () => {
  const pool = [c('a', 0.9), c('b', 0.8), c('c', 0.7), c('d', 0.6), c('e', 0.5)];

  it('returns all (sorted) when k >= pool size', () => {
    const out = weightedSampleByScore(pool.slice(0, 2), 5, mulberry32(1));
    expect(out.map((x) => x.key)).toEqual(['a', 'b']);
  });

  it('returns exactly k unique items', () => {
    const out = weightedSampleByScore(pool, 3, mulberry32(42));
    expect(out).toHaveLength(3);
    expect(new Set(out.map((x) => x.key)).size).toBe(3);
  });

  it('always includes the single highest-scored item', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const out = weightedSampleByScore(pool, 3, mulberry32(seed));
      expect(out.map((x) => x.key)).toContain('a');
    }
  });

  it('produces different selections across different seeds (not a fixed top-k)', () => {
    const s1 = weightedSampleByScore(pool, 3, mulberry32(dateSeed(new Date('2026-06-04T06:00:00Z'))));
    const s2 = weightedSampleByScore(pool, 3, mulberry32(dateSeed(new Date('2026-06-11T06:00:00Z'))));
    // Over a week apart, the lower slots should not be guaranteed identical.
    expect(s1.map((x) => x.key).sort()).not.toEqual(['a', 'b', 'c']); // not always strict top-3
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run test/case-study/discovery/sampling.test.ts`
Expected: FAIL — `Failed to resolve import ".../discovery/sampling"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// api/src/case-study/discovery/sampling.ts
import type { Candidate } from '../types';

/** Deterministic PRNG (mulberry32). Same seed → same stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of the UTC YYYY-MM-DD — stable within a day, varies across days. */
export function dateSeed(now: Date): number {
  const ymd = now.toISOString().slice(0, 10);
  let h = 2166136261;
  for (let i = 0; i < ymd.length; i += 1) {
    h ^= ymd.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick up to `k` candidates, weighted by score, WITHOUT replacement.
 * The single highest-scored candidate is always included (a genuinely
 * critical item never gets sampled out); the remaining slots are
 * weighted-random so a thin, stable feed pool stops emitting the exact
 * same top-N every run. `rand` is injected so callers control the seed.
 */
export function weightedSampleByScore(cands: Candidate[], k: number, rand: () => number): Candidate[] {
  if (cands.length <= k) return [...cands].sort((a, b) => b.score - a.score);
  const pool = [...cands].sort((a, b) => b.score - a.score);
  const chosen: Candidate[] = [pool.shift() as Candidate]; // guarantee top item
  while (chosen.length < k && pool.length > 0) {
    const total = pool.reduce((s, x) => s + Math.max(x.score, 0.01), 0);
    let r = rand() * total;
    let idx = 0;
    for (; idx < pool.length; idx += 1) {
      r -= Math.max(pool[idx].score, 0.01);
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run test/case-study/discovery/sampling.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/discovery/sampling.ts api/test/case-study/discovery/sampling.test.ts
git commit -m "feat(discovery): date-seeded weighted candidate sampler

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Make per-topic selection injectable in `runDiscovery`

**Files:**

- Modify: `api/src/case-study/discovery/index.ts:17-32` (deps), `:67` (selection)
- Test: `api/test/case-study/discovery/index.test.ts` (add a case; existing cases must stay green)

- [ ] **Step 1: Write the failing test** (append inside the existing `describe('runDiscovery', …)` block)

```ts
it('uses an injected selectPerTopic when provided', async () => {
  const writes: Candidate[] = [];
  const env = {
    runners: {
      cve: async () => [sampleC('c1', 'cve', 0.9), sampleC('c2', 'cve', 0.8), sampleC('c3', 'cve', 0.7)],
      actor: async () => [],
      malware: async () => [],
      ransom: async () => [],
    },
    putCandidate: async (c: Candidate) => {
      writes.push(c);
    },
    commitDedup: async () => {},
    now: new Date('2026-05-14T06:00:00Z'),
    perTopic: 2,
    // Selector that takes the LOWEST scored instead of the default top-k,
    // proving the seam is honored (not the built-in sort).
    selectPerTopic: (cands: Candidate[], k: number) => [...cands].sort((a, b) => a.score - b.score).slice(0, k),
  };
  const result = await runDiscovery(env as any);
  expect(result.byTopic.cve).toBe(2);
  expect(writes.map((w) => w.key).sort()).toEqual(['c2', 'c3']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run test/case-study/discovery/index.test.ts`
Expected: FAIL — selector ignored, write keys are `['c1','c2']` (default top-k) not `['c2','c3']`.

- [ ] **Step 3: Implement — add the dep and use it**

In `api/src/case-study/discovery/index.ts`, add to `RunDiscoveryDeps` (after the `isSuppressed?` field, before the closing `}` near line 32):

```ts
  /**
   * Per-topic selector. Default = strict top-N by score (legacy behaviour,
   * keeps existing tests deterministic). `runDiscoveryNow` injects a
   * date-seeded weighted sampler so the daily queue varies instead of
   * re-emitting the same top-N every run.
   */
  selectPerTopic?: (cands: Candidate[], k: number, topic: string) => Candidate[];
```

Then replace the selection line (currently `const top = [...fresh].sort((a, b) => b.score - a.score).slice(0, perTopic);` at line 67) with:

```ts
const select =
  deps.selectPerTopic ?? ((cs: Candidate[], k: number) => [...cs].sort((a, b) => b.score - a.score).slice(0, k));
const top = select(fresh, perTopic, name);
```

- [ ] **Step 4: Run to verify all cases pass**

Run: `cd api && npx vitest run test/case-study/discovery/index.test.ts`
Expected: PASS (existing 4 + new 1 = 5).

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/discovery/index.ts api/test/case-study/discovery/index.test.ts
git commit -m "feat(discovery): injectable per-topic selector (default unchanged)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire the date-seeded sampler into `runDiscoveryNow`

**Files:**

- Modify: `api/src/case-study/run.ts:8` (import), `:94-163` (pass `selectPerTopic`)

This is a wiring change verified by typecheck (the sampler logic is already tested in Task 1, the seam in Task 2). One shared `rand` per run → deterministic per UTC day, varied across days.

- [ ] **Step 1: Add the import** near the other discovery imports (after line 8 `import { runDiscovery } from './discovery';`):

```ts
import { mulberry32, dateSeed, weightedSampleByScore } from './discovery/sampling';
```

- [ ] **Step 2: Pass the selector** — inside `runDiscoveryNow`, immediately before `return runDiscovery({` (line 94), add:

```ts
// One rand stream per run, seeded by the UTC date: stable within a day,
// different the next. Weighted by score so high-value items stay likely
// (and the single top item is guaranteed) without freezing the queue.
const rand = mulberry32(dateSeed(now));
const selectPerTopic = (cands: Parameters<typeof weightedSampleByScore>[0], k: number) =>
  weightedSampleByScore(cands, k, rand);
```

Then add `selectPerTopic,` as the first property inside the `runDiscovery({ … })` call (next to `isSuppressed,`):

```ts
  return runDiscovery({
    selectPerTopic,
    isSuppressed,
    runners: {
```

- [ ] **Step 3: Typecheck**

Run: `cd api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the discovery suite (regression)**

Run: `cd api && npx vitest run test/case-study`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/run.ts
git commit -m "feat(discovery): seed daily selection with date-seeded sampler

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add `suppressedUntil` + a pure suppression gate + a batch writer

**Files:**

- Modify: `api/src/case-study/types.ts:109-112` (`DedupRecord`)
- Modify: `api/src/case-study/storage/dedup.ts` (add `suppressDedupMany`, `isKeySuppressed`; update `prune`)
- Test: `api/test/case-study/dedup-suppress.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/dedup-suppress.test.ts
import { describe, it, expect } from 'vitest';
import { suppressDedupMany, isKeySuppressed, loadDedupMap } from '../../src/case-study/storage/dedup';
import type { DedupRecord } from '../../src/case-study/types';

function mockKv() {
  const store = new Map<string, string>();
  return {
    async get(k: string, t?: 'json') {
      const v = store.get(k);
      if (v === undefined) return null;
      return t === 'json' ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
    async delete(k: string) {
      store.delete(k);
    },
    async list() {
      return { keys: [], list_complete: true, cursor: '' };
    },
  } as any;
}

const REPUBLISH_MS = 60 * 24 * 3600 * 1000;

describe('suppression', () => {
  it('isKeySuppressed: future suppressedUntil hard-suppresses', () => {
    const now = new Date('2026-06-04T00:00:00Z');
    const rec: DedupRecord = { lastSeenAt: now.toISOString(), suppressedUntil: '2026-07-01T00:00:00Z' };
    expect(isKeySuppressed(rec, now, REPUBLISH_MS)).toBe(true);
  });

  it('isKeySuppressed: expired suppressedUntil does not suppress (unpublished)', () => {
    const now = new Date('2026-06-04T00:00:00Z');
    const rec: DedupRecord = { lastSeenAt: '2026-06-01T00:00:00Z', suppressedUntil: '2026-06-02T00:00:00Z' };
    expect(isKeySuppressed(rec, now, REPUBLISH_MS)).toBe(false);
  });

  it('isKeySuppressed: published key still hard-suppressed within republish window', () => {
    const now = new Date('2026-06-04T00:00:00Z');
    const rec: DedupRecord = { lastSeenAt: '2026-06-03T00:00:00Z', publishedSlug: 'x' };
    expect(isKeySuppressed(rec, now, REPUBLISH_MS)).toBe(true);
  });

  it('isKeySuppressed: null record is never suppressed', () => {
    expect(isKeySuppressed(null, new Date(), REPUBLISH_MS)).toBe(false);
  });

  it('suppressDedupMany persists suppressedUntil and survives prune', async () => {
    const ns = mockKv();
    const now = new Date('2026-06-04T00:00:00Z');
    const until = new Date('2026-07-04T00:00:00Z');
    await suppressDedupMany(ns, ['cve-2026-1', 'cve-2026-2'], until, now);
    const map = await loadDedupMap(ns);
    expect(map['cve-2026-1'].suppressedUntil).toBe(until.toISOString());
    expect(map['cve-2026-2'].suppressedUntil).toBe(until.toISOString());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run test/case-study/dedup-suppress.test.ts`
Expected: FAIL — `suppressDedupMany` / `isKeySuppressed` not exported.

- [ ] **Step 3: Implement**

In `api/src/case-study/types.ts`, extend `DedupRecord` (lines 109-112):

```ts
export interface DedupRecord {
  lastSeenAt: string;
  publishedSlug?: string;
  /** ISO 8601. When in the future, discovery hard-suppresses this key
   *  (set by admin Skip / Clear-all). Distinct from the 60-day published
   *  republish-block, which is keyed off `publishedSlug`. */
  suppressedUntil?: string;
}
```

In `api/src/case-study/storage/dedup.ts`:

(a) Replace `prune` (lines 22-30) so a still-active suppression is never pruned even if `lastSeenAt` is old:

```ts
function prune(map: DedupMap, now: Date): DedupMap {
  const cutoff = now.getTime() - NINETY_DAYS_MS;
  const out: DedupMap = {};
  for (const [k, v] of Object.entries(map)) {
    const t = Date.parse(v.lastSeenAt);
    const recent = !Number.isNaN(t) && t >= cutoff;
    const suppressActive = v.suppressedUntil ? Date.parse(v.suppressedUntil) > now.getTime() : false;
    if (recent || suppressActive) out[k] = v;
  }
  return out;
}
```

(b) Append two exports at the end of the file:

```ts
/** Pure suppression gate shared by discovery. `republishBlockMs` is the
 *  published-key window (60d). Returns true when the key must NOT be
 *  re-suggested right now. */
export function isKeySuppressed(rec: DedupRecord | null, now: Date, republishBlockMs: number): boolean {
  if (!rec) return false;
  if (rec.suppressedUntil) {
    const s = Date.parse(rec.suppressedUntil);
    if (!Number.isNaN(s) && now.getTime() < s) return true;
  }
  if (!rec.publishedSlug) return false;
  const t = Date.parse(rec.lastSeenAt);
  return !Number.isNaN(t) && now.getTime() - t < republishBlockMs;
}

/** Mark many keys suppressed until `until` in ONE read + ONE write
 *  (admin Skip / Clear-all). Preserves existing lastSeenAt/publishedSlug. */
export async function suppressDedupMany(
  ns: KVNamespace,
  keys: string[],
  until: Date,
  now: Date = new Date()
): Promise<void> {
  if (keys.length === 0) return;
  const map = await loadDedupMap(ns);
  const iso = until.toISOString();
  for (const k of keys) {
    const prev = map[k];
    map[k] = {
      lastSeenAt: prev?.lastSeenAt ?? now.toISOString(),
      ...(prev?.publishedSlug ? { publishedSlug: prev.publishedSlug } : {}),
      suppressedUntil: iso,
    };
  }
  await saveDedupMap(ns, map, now);
}
```

Add the `DedupRecord` import if not already present — it is (`import type { DedupRecord } from '../types';` at line 2). `now` is passed to `saveDedupMap` so prune is computed against the real now, not `until`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run test/case-study/dedup-suppress.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/types.ts api/src/case-study/storage/dedup.ts api/test/case-study/dedup-suppress.test.ts
git commit -m "feat(discovery): suppressedUntil dedup field + batch suppress + gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Use the shared gate in `runDiscoveryNow`

**Files:**

- Modify: `api/src/case-study/run.ts:25` (import), `:87-93` (`isSuppressed`)

Wiring change so a 30-day Skip suppression actually blocks discovery. Verified by typecheck + the discovery regression suite (the gate logic is unit-tested in Task 4).

- [ ] **Step 1: Extend the dedup import** (line 25):

```ts
import { loadDedupMap, touchDedup, touchDedupMany, isKeySuppressed } from './storage/dedup';
```

- [ ] **Step 2: Replace the inline `isSuppressed`** (lines 87-93) with:

```ts
const REPUBLISH_BLOCK_MS = 60 * 24 * 3600 * 1000;
const isSuppressed = (key: string): boolean => isKeySuppressed(dedupMap[key], now, REPUBLISH_BLOCK_MS);
```

- [ ] **Step 3: Typecheck**

Run: `cd api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Regression**

Run: `cd api && npx vitest run test/case-study`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/run.ts
git commit -m "refactor(discovery): route isSuppressed through shared suppression gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Skip suppresses the candidate for 30 days

**Files:**

- Modify: `api/src/routes/case-study-admin.ts:8` (import), `:96-102` (skip handler)
- Test: `api/test/routes/case-study-admin.test.ts` (add a case)

- [ ] **Step 1: Write the failing test** (append inside `describe('admin routes', …)`)

```ts
it('skip writes a 30-day suppression record', async () => {
  const env = mockEnv();
  env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
  const r = await app().request(
    `/api/v1/admin/candidates/${cand.key}/skip?type=cve`,
    { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
    env
  );
  expect(r.status).toBe(200);
  const dedup = JSON.parse(env.__store.get('meta:dedup-index') as string);
  expect(dedup[cand.key].suppressedUntil).toBeTruthy();
  expect(new Date(dedup[cand.key].suppressedUntil).getTime()).toBeGreaterThan(Date.now());
});
```

- [ ] **Step 2: Run to verify it fails**

Run (Bash tool: set `dangerouslyDisableSandbox: true`): `cd api && npx vitest run test/routes/case-study-admin.test.ts`
Expected: FAIL — no `meta:dedup-index` key written by skip.

- [ ] **Step 3: Implement** — add the import (extend line 8):

```ts
import { getDedup, touchDedup, suppressDedupMany } from '../case-study/storage/dedup';
```

Replace the skip handler (lines 96-102) with:

```ts
admin.post('/candidates/:id/skip', async (c) => {
  const id = c.req.param('id');
  const type = (c.req.query('type') ?? '') as CaseStudyType;
  if (!TYPES.includes(type)) return c.json({ error: 'type required' }, 400);
  await deleteCandidate(c.env.CASE_STUDIES, type, id);
  // Suppress for 30 days so the next discovery run does not re-surface
  // the exact item the admin just rejected.
  const until = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await suppressDedupMany(c.env.CASE_STUDIES, [id], until);
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run to verify it passes**

Run (Bash tool: `dangerouslyDisableSandbox: true`): `cd api && npx vitest run test/routes/case-study-admin.test.ts`
Expected: PASS (existing cases + new one). The pre-existing `skip removes a candidate` test still passes (delete still happens).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/case-study-admin.ts api/test/routes/case-study-admin.test.ts
git commit -m "feat(admin): Skip suppresses candidate for 30 days

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Bulk dismiss — `POST /candidates/skip-all`

**Files:**

- Modify: `api/src/routes/case-study-admin.ts` (add route after the skip handler, ~line 103)
- Test: `api/test/routes/case-study-admin.test.ts` (add cases)

- [ ] **Step 1: Write the failing test** (append inside `describe('admin routes', …)`)

```ts
it('skip-all clears every pending candidate and suppresses them', async () => {
  const env = mockEnv();
  env.__store.set('candidates:cve:cve-1', JSON.stringify({ ...cand, key: 'cve-1' }));
  env.__store.set('candidates:actor:actor-1', JSON.stringify({ ...cand, key: 'actor-1', type: 'actor' }));
  const r = await app().request(
    '/api/v1/admin/candidates/skip-all',
    { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
    env
  );
  expect(r.status).toBe(200);
  const body = (await r.json()) as any;
  expect(body.cleared).toBe(2);
  expect(env.__store.has('candidates:cve:cve-1')).toBe(false);
  expect(env.__store.has('candidates:actor:actor-1')).toBe(false);
  const dedup = JSON.parse(env.__store.get('meta:dedup-index') as string);
  expect(dedup['cve-1'].suppressedUntil).toBeTruthy();
  expect(dedup['actor-1'].suppressedUntil).toBeTruthy();
});

it('skip-all with ?type clears only that type', async () => {
  const env = mockEnv();
  env.__store.set('candidates:cve:cve-1', JSON.stringify({ ...cand, key: 'cve-1' }));
  env.__store.set('candidates:actor:actor-1', JSON.stringify({ ...cand, key: 'actor-1', type: 'actor' }));
  const r = await app().request(
    '/api/v1/admin/candidates/skip-all?type=cve',
    { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
    env
  );
  expect(r.status).toBe(200);
  expect((await r.json()).cleared).toBe(1);
  expect(env.__store.has('candidates:cve:cve-1')).toBe(false);
  expect(env.__store.has('candidates:actor:actor-1')).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run (Bash tool: `dangerouslyDisableSandbox: true`): `cd api && npx vitest run test/routes/case-study-admin.test.ts`
Expected: FAIL — `skip-all` route returns 404 (no matching route), `body.cleared` undefined.

- [ ] **Step 3: Implement** — insert after the skip handler (after the closing `});` of `/candidates/:id/skip`, before the `/run/:stage` comment block at line 104). `listAllCandidates` is already imported (line 6).

```ts
// Bulk dismiss: clear the whole pending queue (or one type) in one action,
// suppressing each for 30 days so they don't immediately re-appear. One
// KV.list + N deletes + ONE batched dedup write (subrequest-budget aware).
admin.post('/candidates/skip-all', async (c) => {
  const typeHint = (c.req.query('type') ?? '') as CaseStudyType | '';
  const filterType = typeHint && TYPES.includes(typeHint as CaseStudyType) ? (typeHint as CaseStudyType) : null;
  const all = await listAllCandidates(c.env.CASE_STUDIES);
  const target = filterType ? all.filter((x) => x.type === filterType) : all;
  for (const cand of target) {
    await deleteCandidate(c.env.CASE_STUDIES, cand.type, cand.key);
  }
  const until = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await suppressDedupMany(
    c.env.CASE_STUDIES,
    target.map((x) => x.key),
    until
  );
  return c.json({ ok: true, cleared: target.length });
});
```

- [ ] **Step 4: Run to verify it passes**

Run (Bash tool: `dangerouslyDisableSandbox: true`): `cd api && npx vitest run test/routes/case-study-admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/case-study-admin.ts api/test/routes/case-study-admin.test.ts
git commit -m "feat(admin): POST /candidates/skip-all bulk dismiss (optional ?type)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: "Clear all" button in PendingTab

**Files:**

- Modify: `src/pages/admin/PendingTab.tsx`
- Test: `src/test/PendingTab.test.tsx`

The frontend uses jsdom + React-Testing-Library (configured in `vitest.config.ts`, setup `src/test/setup.ts`). Mirror `src/test/admin.test.tsx`. We mock the `adminApi` module so no real fetch occurs.

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/PendingTab.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getJson = vi.fn();
const postJson = vi.fn();
vi.mock('../pages/admin/adminApi', () => ({
  getJson: (...a: unknown[]) => getJson(...a),
  postJson: (...a: unknown[]) => postJson(...a),
}));

import PendingTab from '../pages/admin/PendingTab';

describe('PendingTab clear-all', () => {
  beforeEach(() => {
    getJson.mockReset();
    postJson.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders a Clear all button and calls skip-all', async () => {
    getJson.mockResolvedValueOnce({
      pending: [
        {
          key: 'cve-1',
          type: 'cve',
          title: 'T',
          rationale: 'r',
          score: 0.9,
          evidence: {},
          discoveredAt: '2026-06-04T06:00:00Z',
          status: 'pending',
        },
      ],
    });
    postJson.mockResolvedValueOnce({ ok: true, cleared: 1 });
    getJson.mockResolvedValueOnce({ pending: [] });

    render(<PendingTab />);
    await screen.findByText('T');
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('/candidates/skip-all'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/PendingTab.test.tsx`
Expected: FAIL — no element with accessible name matching `/clear all/i`.

- [ ] **Step 3: Implement** — in `src/pages/admin/PendingTab.tsx`, add a `clearAll` handler after the `skip` function (after line 60):

```tsx
async function clearAll() {
  if (!window.confirm('Clear all pending candidates? They will be suppressed for 30 days.')) return;
  setActionMsg(null);
  try {
    const res = await postJson<{ cleared: number }>('/candidates/skip-all');
    setActionMsg(`Cleared ${res.cleared} candidate(s)`);
    await load();
  } catch (e) {
    setActionMsg(`clear all failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
```

Then render the button above the table. Replace the opening of the main return (the `<div className="overflow-x-auto">` and the `actionMsg` paragraph, lines 80-82) with:

```tsx
  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        {actionMsg ? <p className="text-xs font-mono text-slate-400">{actionMsg}</p> : <span />}
        <button
          onClick={() => void clearAll()}
          className="px-2 py-1 border border-red-700/60 text-red-300 rounded text-xs hover:bg-red-900/30"
        >
          Clear all
        </button>
      </div>
```

(The empty-list early-return at lines 72-78 still shows `actionMsg` only; that's fine — there's nothing to clear when empty.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/PendingTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/PendingTab.tsx src/test/PendingTab.test.tsx
git commit -m "feat(admin-ui): Clear all pending candidates button

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: New RSS advisory sources runner

Adds a single new runner that scans government/regional advisory + threat-research RSS feeds NOT already covered by `intel.ts`/`actor.ts`, emitting `intel`-type candidates. Mirrors `discoverIntel`'s structure and reuses `parseRssItems`.

**New feeds (verified not in `intel.ts` FEEDS or `config.ts` ACTOR_RSS_FEEDS):** CISA ICS advisories, Google TAG, NCSC UK, AhnLab ASEC EN, JPCERT/CC Eyes EN.

**Files:**

- Modify: `api/src/case-study/config.ts` (add `ADVISORY_RSS_FEEDS`)
- Create: `api/src/case-study/discovery/advisories.ts`
- Modify: `api/src/case-study/run.ts` (import + wire runner)
- Test: `api/test/case-study/discovery/advisories.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/discovery/advisories.test.ts
import { describe, it, expect } from 'vitest';
import { discoverAdvisories } from '../../../src/case-study/discovery/advisories';

const RSS = (title: string, when: string) => `<?xml version="1.0"?><rss><channel>
  <item><title>${title}</title><link>https://example.gov/a</link><pubDate>${when}</pubDate></item>
</channel></rss>`;

describe('discoverAdvisories', () => {
  it('emits intel candidates from advisory feeds within the window', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () =>
      new Response(RSS('ICS Advisory: ACME PLC RCE', '2026-06-03T00:00:00Z'), { status: 200 })) as any;
    const out = await discoverAdvisories({ fetch, now, getDedup: async () => null, feeds: ['https://x/feed'] });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('intel');
    expect(out[0].title).toContain('ACME PLC RCE');
    expect(out[0].key.startsWith('intel-')).toBe(true);
  });

  it('skips items older than the 7-day window', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => new Response(RSS('Old advisory', '2026-04-01T00:00:00Z'), { status: 200 })) as any;
    const out = await discoverAdvisories({ fetch, now, getDedup: async () => null, feeds: ['https://x/feed'] });
    expect(out).toHaveLength(0);
  });

  it('a failing feed does not throw', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => {
      throw new Error('down');
    }) as any;
    const out = await discoverAdvisories({ fetch, now, getDedup: async () => null, feeds: ['https://x/feed'] });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run test/case-study/discovery/advisories.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

In `api/src/case-study/config.ts`, append:

```ts
// Government / regional advisory + state-actor research feeds. Distinct from
// ACTOR_RSS_FEEDS and intel.ts FEEDS — added 2026-06-04 for source diversity
// (OT/ICS, EU/UK/APAC, state-actor). All public RSS, no auth.
// NOTE: verify each resolves + parses on first ingest (set a real UA — CISA
// 403s default bot UAs). Providers silently rot; confirm against live output.
export const ADVISORY_RSS_FEEDS: string[] = [
  'https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml',
  'https://blog.google/threat-analysis-group/rss/',
  'https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml',
  'https://asec.ahnlab.com/en/feed/',
  'https://blogs.jpcert.or.jp/en/atom.xml',
];
```

Create `api/src/case-study/discovery/advisories.ts`:

```ts
import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';
import { parseRssItems } from './rss-util';

const WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface DiscoverAdvisoriesDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
  feeds: string[];
}

/** Government/regional advisory + state-actor research feeds → `intel`
 *  candidates. Mirrors discoverIntel; a real UA avoids CISA bot 403s. */
export async function discoverAdvisories(deps: DiscoverAdvisoriesDeps): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const cutoff = deps.now.getTime() - WINDOW_MS;
  for (const feed of deps.feeds) {
    try {
      const r = await deps.fetch(feed, {
        headers: {
          Accept: 'application/rss+xml, application/atom+xml, application/xml, */*',
          'User-Agent': 'pranithjain.qzz.io case-study-discovery',
        },
      });
      if (!r.ok) continue;
      const xml = await r.text();
      for (const item of parseRssItems(xml, deps.now)) {
        if (item.date.getTime() < cutoff) continue;
        const key = topicKey('intel', item.title);
        const dedup = await deps.getDedup(key);
        const score = finalScore({
          recency: recencyScore(item.date.toISOString(), deps.now),
          severity: severityScore({}),
          novelty: noveltyScore(dedup, deps.now),
          sourceWeight: 0.7,
        });
        out.push({
          key,
          type: 'intel',
          title: item.title,
          rationale: `Advisory · ${new URL(feed).hostname.replace(/^www\./, '')} · ${item.date
            .toISOString()
            .slice(0, 10)}`,
          score,
          evidence: { url: item.link, published: item.date.toISOString(), source: feed },
          discoveredAt: deps.now.toISOString(),
          status: 'pending',
        });
      }
    } catch (err) {
      console.warn(`discoverAdvisories: feed failed ${feed}`, err);
    }
  }
  return out;
}
```

Wire into `api/src/case-study/run.ts`: add imports near the other discovery imports (after line 17 `import { discoverIntel } from './discovery/intel';`):

```ts
import { discoverAdvisories } from './discovery/advisories';
```

and extend the `config` import (line 32) to include the new feeds:

```ts
import { ACTOR_RSS_FEEDS, ADVISORY_RSS_FEEDS } from './config';
```

Add a runner inside the `runners: { … }` object (e.g. after the `intel:` entry, ~line 139):

```ts
      advisories: () =>
        discoverAdvisories({ fetch: globalThis.fetch, now, getDedup: memGet, feeds: ADVISORY_RSS_FEEDS }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run test/case-study/discovery/advisories.test.ts && cd /Users/pranith/Documents/portfolio && cd api && npx tsc --noEmit`
Expected: PASS (3 tests) + no type errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/config.ts api/src/case-study/discovery/advisories.ts api/src/case-study/run.ts api/test/case-study/discovery/advisories.test.ts
git commit -m "feat(discovery): advisory RSS runner (CISA ICS, TAG, NCSC, ASEC, JPCERT)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: VulnCheck KEV runner (free Community token, no-op without it)

Surfaces exploited CVEs ~27 days ahead of CISA KEV. Reads a free Community token from the `VULNCHECK_API_TOKEN` secret; the runner returns `[]` cleanly when the secret is absent so nothing breaks pre-provisioning. Mirrors `breach.ts`'s JSON pattern.

> Response-shape note: the VulnCheck KEV index entry fields are read defensively. Verify against the live `https://api.vulncheck.com/v3/index/vulncheck-kev` response on first ingest and adjust the interface if upstream differs (providers silently rot — see project memory).

**Files:**

- Create: `api/src/case-study/discovery/vulncheck.ts`
- Modify: `api/src/case-study/run.ts` (env field + import + wire)
- Test: `api/test/case-study/discovery/vulncheck.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/discovery/vulncheck.test.ts
import { describe, it, expect } from 'vitest';
import { discoverVulnCheckKev } from '../../../src/case-study/discovery/vulncheck';

const body = {
  data: [
    {
      cve: ['CVE-2026-9999'],
      vendorProject: 'Acme',
      product: 'Gateway',
      shortDescription: 'Pre-auth RCE',
      date_added: '2026-06-03',
    },
  ],
};

describe('discoverVulnCheckKev', () => {
  it('returns [] (no fetch) when token is absent', async () => {
    let called = false;
    const fetch = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as any;
    const out = await discoverVulnCheckKev({
      fetch,
      now: new Date('2026-06-04T06:00:00Z'),
      getDedup: async () => null,
      token: '',
    });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it('emits a cve candidate (kev → severity 1.0) within the window', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as any;
    const out = await discoverVulnCheckKev({ fetch, now, getDedup: async () => null, token: 'tok' });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('cve');
    expect(out[0].key).toBe('cve-2026-9999');
    expect(out[0].title).toContain('CVE-2026-9999');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run test/case-study/discovery/vulncheck.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `api/src/case-study/discovery/vulncheck.ts`:

```ts
import type { Candidate, DedupRecord } from '../types';
import { cveKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const KEV_URL = 'https://api.vulncheck.com/v3/index/vulncheck-kev';
const WINDOW_MS = 14 * 24 * 3600 * 1000;

interface VcKevEntry {
  cve?: string[];
  vendorProject?: string;
  product?: string;
  name?: string;
  shortDescription?: string;
  date_added?: string;
}

export interface DiscoverVulnCheckDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
  /** Free Community token. Empty string = runner disabled (no fetch). */
  token: string;
}

/** Exploited CVEs from VulnCheck KEV (ahead of CISA KEV). No-op when no token. */
export async function discoverVulnCheckKev(deps: DiscoverVulnCheckDeps): Promise<Candidate[]> {
  if (!deps.token) return [];
  const out: Candidate[] = [];
  try {
    const r = await deps.fetch(KEV_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${deps.token}`,
        'User-Agent': 'pranithjain.qzz.io case-study-discovery',
      },
    });
    if (!r.ok) throw new Error(`VulnCheck KEV ${r.status}`);
    const json = (await r.json()) as { data?: VcKevEntry[] };
    const cutoff = deps.now.getTime() - WINDOW_MS;
    for (const e of json.data ?? []) {
      const cveId = e.cve?.[0];
      if (!cveId || !e.date_added) continue;
      const added = new Date(e.date_added).getTime();
      if (!Number.isFinite(added) || added < cutoff) continue;
      const key = cveKey(cveId);
      const dedup = await deps.getDedup(key);
      const score = finalScore({
        recency: recencyScore(e.date_added, deps.now),
        severity: severityScore({ kev: true }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.9,
      });
      const vendor = [e.vendorProject, e.product].filter(Boolean).join(' ');
      out.push({
        key,
        type: 'cve',
        title: `${cveId}${vendor ? ` — ${vendor}` : ''} (exploited in the wild)`,
        rationale: `VulnCheck KEV · added ${e.date_added}${e.shortDescription ? ` · ${e.shortDescription}` : ''}`,
        score,
        evidence: {
          cve: cveId,
          vendor: e.vendorProject,
          product: e.product,
          name: e.name,
          dateAdded: e.date_added,
          description: e.shortDescription,
          url: `https://www.vulncheck.com/cve/${cveId}`,
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }
  } catch (err) {
    console.warn('discoverVulnCheckKev failed', err);
  }
  return out;
}
```

In `api/src/case-study/run.ts`: add the import (after line 19 `import { discoverFromPlatformData } from './discovery/platform-data';`):

```ts
import { discoverVulnCheckKev } from './discovery/vulncheck';
```

Add the env field to `CaseStudyEnv` (after `GROQ_API_KEY?: string;` at line 43):

```ts
  /** Free VulnCheck Community token. Absent = VulnCheck KEV runner is a no-op. */
  VULNCHECK_API_TOKEN?: string;
```

Add the runner inside `runners: { … }` (after the `cve:` entry, ~line 97):

```ts
      vulncheck: () =>
        discoverVulnCheckKev({
          fetch: globalThis.fetch,
          now,
          getDedup: memGet,
          token: env.VULNCHECK_API_TOKEN ?? '',
        }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run test/case-study/discovery/vulncheck.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests) + no type errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/discovery/vulncheck.ts api/src/case-study/run.ts api/test/case-study/discovery/vulncheck.test.ts
git commit -m "feat(discovery): VulnCheck KEV runner (Community token, no-op if unset)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Provisioning note (manual, no code)** — after merge, add the token:
      `cd /Users/pranith/Documents/portfolio && npx wrangler secret put VULNCHECK_API_TOKEN` (run from repo root — two wranglers; this writes to the root worker). Until then the runner stays a no-op.

---

## Task 11: EUVD (ENISA EU vuln DB) runner — keyless

**Files:**

- Create: `api/src/case-study/discovery/euvd.ts`
- Modify: `api/src/case-study/run.ts` (import + wire)
- Test: `api/test/case-study/discovery/euvd.test.ts`

> Shape note: EUVD `lastvulnerabilities` returns a JSON array of recent vulns. Fields are read defensively; verify the live shape on first ingest and adjust.

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/discovery/euvd.test.ts
import { describe, it, expect } from 'vitest';
import { discoverEuvd } from '../../../src/case-study/discovery/euvd';

const arr = [
  { id: 'EUVD-2026-1001', description: 'Heap overflow in Foo', datePublished: '2026-06-03T00:00:00Z', baseScore: 9.1 },
];

describe('discoverEuvd', () => {
  it('emits a cve-type candidate from a recent EUVD entry', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => new Response(JSON.stringify(arr), { status: 200 })) as any;
    const out = await discoverEuvd({ fetch, now, getDedup: async () => null });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('cve');
    expect(out[0].key).toBe('euvd-2026-1001');
    expect(out[0].title).toContain('EUVD-2026-1001');
  });

  it('a non-ok response yields []', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => new Response('err', { status: 500 })) as any;
    const out = await discoverEuvd({ fetch, now, getDedup: async () => null });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run test/case-study/discovery/euvd.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `api/src/case-study/discovery/euvd.ts`:

```ts
import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const EUVD_URL = 'https://euvdservices.enisa.europa.eu/api/lastvulnerabilities';
const WINDOW_MS = 7 * 24 * 3600 * 1000;

interface EuvdEntry {
  id?: string;
  description?: string;
  datePublished?: string;
  baseScore?: number;
}

export interface DiscoverEuvdDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

/** Recently published EU vulnerabilities (ENISA EUVD). Keyless. */
export async function discoverEuvd(deps: DiscoverEuvdDeps): Promise<Candidate[]> {
  const out: Candidate[] = [];
  try {
    const r = await deps.fetch(EUVD_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'pranithjain.qzz.io case-study-discovery' },
    });
    if (!r.ok) throw new Error(`EUVD ${r.status}`);
    const all = (await r.json()) as EuvdEntry[];
    const cutoff = deps.now.getTime() - WINDOW_MS;
    for (const v of Array.isArray(all) ? all : []) {
      if (!v.id || !v.datePublished) continue;
      const pub = new Date(v.datePublished).getTime();
      if (!Number.isFinite(pub) || pub < cutoff) continue;
      const key = topicKey('euvd', v.id);
      const dedup = await deps.getDedup(key);
      const score = finalScore({
        recency: recencyScore(v.datePublished, deps.now),
        severity: severityScore({ cvss: v.baseScore }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.75,
      });
      out.push({
        key,
        type: 'cve',
        title: `${v.id}${typeof v.baseScore === 'number' ? ` (CVSS ${v.baseScore})` : ''}`,
        rationale: `ENISA EUVD · ${v.datePublished.slice(0, 10)}${v.description ? ` · ${v.description.slice(0, 100)}` : ''}`,
        score,
        evidence: {
          id: v.id,
          baseScore: v.baseScore,
          datePublished: v.datePublished,
          description: v.description,
          url: `https://euvd.enisa.europa.eu/vulnerability/${v.id}`,
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }
  } catch (err) {
    console.warn('discoverEuvd failed', err);
  }
  return out;
}
```

Wire into `run.ts`: import (after the vulncheck import from Task 10):

```ts
import { discoverEuvd } from './discovery/euvd';
```

Runner inside `runners: { … }` (after the `vulncheck:` entry):

```ts
      euvd: () => discoverEuvd({ fetch: globalThis.fetch, now, getDedup: memGet }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run test/case-study/discovery/euvd.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests) + no type errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/discovery/euvd.ts api/src/case-study/run.ts api/test/case-study/discovery/euvd.test.ts
git commit -m "feat(discovery): ENISA EUVD runner (keyless EU vuln feed)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Day-rotation so a rotating subset of runners runs each day

Adds variety AND bounds subrequests as the runner count grows. Always-on runners run every day (high-value: cve, vulncheck, actor, ransom, platform); the rest are split into groups, and one group runs per UTC day.

**Files:**

- Create: `api/src/case-study/discovery/rotation.ts`
- Modify: `api/src/case-study/run.ts` (filter the runners object by today's active set)
- Test: `api/test/case-study/discovery/rotation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/discovery/rotation.test.ts
import { describe, it, expect } from 'vitest';
import { activeRunnerNames } from '../../../src/case-study/discovery/rotation';

const ALL = [
  'cve',
  'vulncheck',
  'actor',
  'ransom',
  'platform',
  'malware',
  'breach',
  'scam',
  'aisec',
  'intel',
  'advisories',
  'euvd',
  'releak',
  'briefing',
];
const ALWAYS = new Set(['cve', 'vulncheck', 'actor', 'ransom', 'platform']);

describe('activeRunnerNames', () => {
  it('always includes the always-on runners', () => {
    const a = activeRunnerNames(ALL, ALWAYS, new Date('2026-06-04T00:00:00Z'), 3);
    for (const k of ALWAYS) expect(a).toContain(k);
  });

  it('rotates the optional runners across days (different days → different subsets)', () => {
    const d1 = activeRunnerNames(ALL, ALWAYS, new Date('2026-06-04T00:00:00Z'), 3);
    const d2 = activeRunnerNames(ALL, ALWAYS, new Date('2026-06-05T00:00:00Z'), 3);
    expect(d1).not.toEqual(d2);
  });

  it('every optional runner appears within `groups` consecutive days', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      const day = new Date(Date.UTC(2026, 5, 4 + i));
      for (const n of activeRunnerNames(ALL, ALWAYS, day, 3)) seen.add(n);
    }
    for (const n of ALL) expect(seen.has(n)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run test/case-study/discovery/rotation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `api/src/case-study/discovery/rotation.ts`:

```ts
/** UTC day-of-year (0-based). */
function dayOfYear(now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / 86400000) - 1;
}

/**
 * Which runner names run today: every always-on name, plus the optional
 * runners whose round-robin group matches today. `groups` consecutive days
 * cover all optional runners exactly once → variety + bounded subrequests.
 * Optional runners are taken in their order in `all` for a stable partition.
 */
export function activeRunnerNames(all: string[], alwaysOn: Set<string>, now: Date, groups: number): string[] {
  const optional = all.filter((n) => !alwaysOn.has(n));
  const g = ((dayOfYear(now) % groups) + groups) % groups;
  const todaysOptional = optional.filter((_, i) => i % groups === g);
  return all.filter((n) => alwaysOn.has(n) || todaysOptional.includes(n));
}
```

Wire into `run.ts`: import (with the other discovery imports):

```ts
import { activeRunnerNames } from './discovery/rotation';
```

Then, in `runDiscoveryNow`, after the full `runners` object is passed today it runs all of them. Change the `return runDiscovery({ … })` so the runners are filtered to today's active set. Replace the `runners: { … }` literal assignment by first building it into a const, then filtering. Concretely, change the call to:

```ts
const allRunners: Record<string, () => Promise<Candidate[]>> = {
  vulncheck: () =>
    discoverVulnCheckKev({ fetch: globalThis.fetch, now, getDedup: memGet, token: env.VULNCHECK_API_TOKEN ?? '' }),
  cve: () => discoverCves({ fetch: globalThis.fetch, now, getDedup: memGet }),
  actor: () => discoverActors({ fetch: globalThis.fetch, now, getDedup: memGet, feeds: ACTOR_RSS_FEEDS }),
  malware: () =>
    discoverMalware({ fetch: globalThis.fetch, now, getDedup: memGet, abuseChKey: env.ABUSECH_AUTH_KEY ?? '' }),
  ransom: () => discoverRansomware({ fetchVictims: () => fetchRecentVictims(globalThis.fetch), now, getDedup: memGet }),
  releak: () =>
    discoverReleaks({
      fetchReleaks: async () => {
        try {
          const r = await globalThis.fetch(`${getSiteUrl(env)}/api/v1/victim-releaks`);
          if (!r.ok) return [];
          const data = (await r.json()) as { releaks?: ReleakRow[] };
          return data.releaks ?? [];
        } catch {
          return [];
        }
      },
      now,
      getDedup: memGet,
    }),
  breach: () => discoverBreaches({ fetch: globalThis.fetch, now, getDedup: memGet }),
  scam: () => discoverScams({ fetch: globalThis.fetch, now, getDedup: memGet }),
  aisec: () => discoverAiSec({ fetch: globalThis.fetch, now, getDedup: memGet }),
  intel: () => discoverIntel({ fetch: globalThis.fetch, now, getDedup: memGet }),
  advisories: () => discoverAdvisories({ fetch: globalThis.fetch, now, getDedup: memGet, feeds: ADVISORY_RSS_FEEDS }),
  euvd: () => discoverEuvd({ fetch: globalThis.fetch, now, getDedup: memGet }),
  briefing: () =>
    env.BRIEFINGS_DB ? discoverBriefing({ briefingsDb: env.BRIEFINGS_DB, now, getDedup: memGet }) : Promise.resolve([]),
  platform: () =>
    discoverFromPlatformData({
      apiFetch: async (path) => {
        const url = `${getSiteUrl(env)}${path}`;
        const r = await globalThis.fetch(url);
        if (!r.ok) return null;
        return r.json();
      },
      now,
      getDedup: memGet,
    }),
};
// Always-on = high-value / our own data. The rest rotate over 3 days so
// each daily run hits a different, smaller feed subset: more day-to-day
// variety AND fewer subrequests per invocation (Free-plan 50/inv budget).
const ALWAYS_ON = new Set(['cve', 'vulncheck', 'actor', 'ransom', 'platform']);
const active = new Set(activeRunnerNames(Object.keys(allRunners), ALWAYS_ON, now, 3));
const runners = Object.fromEntries(Object.entries(allRunners).filter(([name]) => active.has(name)));

return runDiscovery({
  selectPerTopic,
  isSuppressed,
  runners,
  putCandidate: (c) => putCandidate(env.CASE_STUDIES, c),
  commitDedup: (keys, n) => touchDedupMany(env.CASE_STUDIES, keys, n),
  now,
});
```

Add `Candidate` to the type import at the top of `run.ts` if not present (it imports from `./types` indirectly; add `import type { Candidate } from './types';` near line 35 next to the `D1Database` import). Remove the now-replaced inline `runners: { … }` block and the old trailing `putCandidate/commitDedup/now` that were inside the previous `runDiscovery({ … })` call.

- [ ] **Step 4: Verify**

Run: `cd api && npx vitest run test/case-study/discovery/rotation.test.ts && npx tsc --noEmit && npx vitest run test/case-study`
Expected: PASS (3 rotation tests) + no type errors + full case-study suite green.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/discovery/rotation.ts api/src/case-study/run.ts api/test/case-study/discovery/rotation.test.ts
git commit -m "feat(discovery): rotate optional runners by day (variety + subrequest budget)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Full Phase-1 regression + acceptance pass

- [ ] **Step 1: api unit suite** — `cd api && npx vitest run test/lib test/case-study test/health.test.ts` → PASS (mirrors CI).
- [ ] **Step 2: api route tests** (Bash tool: `dangerouslyDisableSandbox: true`) — `cd api && npx vitest run test/routes/case-study-admin.test.ts` → PASS.
- [ ] **Step 3: api typecheck** — `cd api && npx tsc --noEmit` → no errors.
- [ ] **Step 4: frontend** — `npx vitest run src/test/PendingTab.test.tsx` → PASS; `npm run build` → succeeds.
- [ ] **Step 5: Acceptance review against spec §3.3:**
  - Stochastic ranking: Tasks 1-3 — two different `now` dates yield different sampler output (Task 1 test asserts this).
  - Skip suppresses 30d: Task 6 test asserts a future `suppressedUntil`; Tasks 4-5 make discovery honor it.
  - Clear-all empties + stays gone: Task 7 (suppress) + Task 8 (UI).
  - New sources surface candidates: Tasks 9-11 (advisories, VulnCheck, EUVD). Verify against LIVE feed format on first cron run (providers silently rot — confirm `parseRssItems` handles Atom for the JPCERT feed; if not, that feed yields 0 and is logged, non-fatal).
  - Subrequest budget: Task 12 rotation keeps each run to always-on + one optional group.
- [ ] **Step 6: Deploy** (from repo ROOT — two wranglers; rebase the worktree onto `origin/main` first, main moves fast): `cd /Users/pranith/Documents/portfolio && npx wrangler deploy`. Provision `VULNCHECK_API_TOKEN` (Task 10 Step 6) to activate the VulnCheck runner.

---

## Notes / open verifications

- **Atom feeds:** the JPCERT feed (`/en/atom.xml`) is Atom, not RSS. Confirm `parseRssItems` (in `discovery/rss-util.ts`) handles `<entry>`/`<updated>` as well as `<item>`/`<pubDate>`; if it only parses RSS `<item>`, that one feed silently yields 0 candidates (logged, non-fatal) — file a follow-up to extend `parseRssItems` for Atom rather than blocking Phase 1.
- **VulnCheck / EUVD response shapes** are read defensively and must be confirmed against live responses on first ingest (project memory: providers silently rot — verify against live upstream when touching discovery sources).
- **Subrequest count:** after deploy, check the discovery cron invocation's subrequest total stays under 50 (KV + Cache + fetch all count). Rotation groups=3 is the lever; raise the group count if a day's subset still runs hot.

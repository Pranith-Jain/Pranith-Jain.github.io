# Andrea Fortuna CTI Feeds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire two new CTI feeds — Andrea Fortuna's Datamarkets (underground forum threads) and Recent Defacements (defaced sites) — into the existing `cybercrime.ts` and `live-iocs.ts` routes, so they enrich the platform with sources we don't already poll directly.

**Architecture:** One new helper module (`api/src/lib/andreafortuna-feeds.ts`) with pure parsers and HTTP fetchers. Two route files import its fetchers and merge results alongside their existing sources. KV last-good fallback per feed mirrors the `phishing-urls.ts` pattern. No new routes, no new frontend pages — just additive enrichment of two existing surfaces.

**Tech Stack:** Cloudflare Workers, TypeScript, Hono, Vitest (`@cloudflare/vitest-pool-workers`), KV namespace for last-good cache.

**Spec:** `docs/superpowers/specs/2026-05-15-andreafortuna-cti-feeds-design.md`

---

## File Structure

**Create:**

- `api/src/lib/andreafortuna-feeds.ts` — fetchers + pure parsers + mapping helpers
- `api/test/lib/andreafortuna-feeds.test.ts` — parser unit tests (inline TS fixtures)
- `api/test/routes/cybercrime.test.ts` — route merge test (new file; not currently present)
- `api/test/routes/live-iocs.test.ts` — route merge test (new file; not currently present)

**Modify:**

- `api/src/routes/live-iocs.ts` — export `LiveIoc` interface; wire fetcher; add source row + KV last-good
- `api/src/routes/cybercrime.ts` — wire fetcher; add source row + KV last-good
- `api/src/lib/cybercrime-sources.ts` — extend `category` union with `'underground-forums'`
- `src/pages/threatintel/CyberCrime.tsx` — add badge style for the new category
- `api/src/routes/feed-status.ts` — add two probe rows that inspect parent route caches

**Working directory note:** All paths are relative to repo root `/Users/pranith/Documents/portfolio`. API tests run from `api/` via `cd api && npm test`. Frontend tests run from repo root via `npm test`.

---

## Task 1: Export the `LiveIoc` type from `live-iocs.ts`

**Why first:** The new helper module imports this type. Tiny prep change, no behavior impact.

**Files:**

- Modify: `api/src/routes/live-iocs.ts` (single-line change near line 59)

- [ ] **Step 1: Open `api/src/routes/live-iocs.ts` and change the `LiveIoc` declaration**

Find:

```ts
interface LiveIoc {
  value: string;
  kind: IocKind;
  source: string;
```

Replace with:

```ts
export interface LiveIoc {
  value: string;
  kind: IocKind;
  source: string;
```

(Just add `export` before `interface`.)

- [ ] **Step 2: Typecheck**

```bash
cd api && npm run typecheck
```

Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/live-iocs.ts
git commit -m "refactor(live-iocs): export LiveIoc interface for downstream imports"
```

---

## Task 2: Create the helper module — parsers (TDD)

**Why:** The parsers are pure functions. Test them in isolation first; HTTP fetch comes next task. This is the largest task; it covers all mapping rules from the spec §4.2.

**Files:**

- Create: `api/src/lib/andreafortuna-feeds.ts`
- Create: `api/test/lib/andreafortuna-feeds.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `api/test/lib/andreafortuna-feeds.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseDatamarkets,
  parseDefacements,
  toIso,
  MAX_ITEMS_PER_FEED,
  type AFEntry,
} from '../../src/lib/andreafortuna-feeds';

const DATAMARKETS_FIXTURE: AFEntry[] = [
  {
    url: 'https://demonforums.net/Thread-test-pack',
    name: 'DemonForums - Test ULP Pack',
    source: 'demonforums',
    screenshot: 'https://urlscan.io/screenshots/abc.png',
    timestamp: '2026-05-15T02:08:01.440399',
    urlscan: 'https://urlscan.io/result/abc/',
    id: 'abc123',
  },
  {
    url: 'https://exploit.in/forum/thread-2',
    name: 'Exploit.in - Stolen DB',
    source: 'exploitin',
    timestamp: '2026-05-14T13:30:23.167810',
    id: 'def456',
  },
];

const DEFACEMENTS_FIXTURE: AFEntry[] = [
  {
    url: 'https://victim.example.com/index.html',
    name: 'Recent defacement reported by Hax.or: https://victim.example.com/index.html',
    source: 'hax',
    screenshot: '',
    timestamp: '2026-05-15T02:07:54.767388',
    id: 'xyz789',
  },
];

describe('toIso', () => {
  it('coerces AF microsecond timestamps to ISO 8601 with Z', () => {
    expect(toIso('2026-05-15T02:08:01.440399')).toBe('2026-05-15T02:08:01.440Z');
  });

  it('returns undefined for unparseable input', () => {
    expect(toIso('not-a-date')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(toIso('')).toBeUndefined();
  });
});

describe('parseDatamarkets', () => {
  it('maps AF entries to CybercrimeItem shape per spec §4.2', () => {
    const items = parseDatamarkets(DATAMARKETS_FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'DemonForums - Test ULP Pack',
      url: 'https://demonforums.net/Thread-test-pack',
      source: 'andreafortuna-demonforums',
      category: 'underground-forums',
      published: '2026-05-15T02:08:01.440Z',
      description: 'Underground forum thread',
      tags: ['demonforums', 'credentials', 'forum'],
    });
  });

  it('uses the AF entry source value in the tags array', () => {
    const items = parseDatamarkets(DATAMARKETS_FIXTURE);
    expect(items[1]!.tags).toContain('exploitin');
  });

  it('skips malformed entries missing url or name without throwing', () => {
    const bad: AFEntry[] = [
      { url: '', name: 'no url', source: 'x', timestamp: '2026-05-15T00:00:00' },
      { url: 'https://ok.example.com/', name: '', source: 'x', timestamp: '2026-05-15T00:00:00' },
      { url: 'https://good.example.com/', name: 'good', source: 'x', timestamp: '2026-05-15T00:00:00' },
    ];
    const items = parseDatamarkets(bad);
    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe('https://good.example.com/');
  });

  it('caps output at MAX_ITEMS_PER_FEED', () => {
    const many: AFEntry[] = Array.from({ length: MAX_ITEMS_PER_FEED + 50 }, (_, i) => ({
      url: `https://demonforums.net/Thread-${i}`,
      name: `Thread ${i}`,
      source: 'demonforums',
      timestamp: '2026-05-15T02:08:01.440399',
    }));
    expect(parseDatamarkets(many)).toHaveLength(MAX_ITEMS_PER_FEED);
  });

  it('returns empty array for empty input', () => {
    expect(parseDatamarkets([])).toEqual([]);
  });
});

describe('parseDefacements', () => {
  it('maps AF entries to LiveIoc shape per spec §4.2', () => {
    const items = parseDefacements(DEFACEMENTS_FIXTURE);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      value: 'https://victim.example.com/index.html',
      kind: 'url',
      source: 'andreafortuna-defacements',
      reporter: 'hax.or',
      context: 'website defacement',
      observed_at: '2026-05-15T02:07:54.767Z',
    });
  });

  it('skips entries with no url', () => {
    const bad: AFEntry[] = [
      { url: '', name: 'no url', source: 'hax', timestamp: '2026-05-15T00:00:00' },
      { url: 'https://ok.example.com/', name: 'ok', source: 'hax', timestamp: '2026-05-15T00:00:00' },
    ];
    expect(parseDefacements(bad)).toHaveLength(1);
  });

  it('caps output at MAX_ITEMS_PER_FEED', () => {
    const many: AFEntry[] = Array.from({ length: MAX_ITEMS_PER_FEED + 50 }, (_, i) => ({
      url: `https://defaced-${i}.example.com/`,
      name: `Defacement ${i}`,
      source: 'hax',
      timestamp: '2026-05-15T02:07:54.767388',
    }));
    expect(parseDefacements(many)).toHaveLength(MAX_ITEMS_PER_FEED);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd api && npx vitest run test/lib/andreafortuna-feeds.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/andreafortuna-feeds'`.

- [ ] **Step 3: Create the module with parsers**

Create `api/src/lib/andreafortuna-feeds.ts`:

```ts
import type { CybercrimeItem } from '../routes/cybercrime';
import type { LiveIoc } from '../routes/live-iocs';

const DATAMARKETS_URL = 'https://ctifeeds.andreafortuna.org/datamarkets.json';
const DEFACEMENTS_URL = 'https://ctifeeds.andreafortuna.org/recent_defacements.json';
const FETCH_TIMEOUT_MS = 12_000;

export const MAX_ITEMS_PER_FEED = 200;

/**
 * Raw entry shape served by the Andrea Fortuna CTI feeds. The same shape is
 * used for every feed; `urlscan` is only present on datamarkets/dataleaks.
 *
 * See: https://ctifeeds.andreafortuna.org/
 */
export interface AFEntry {
  url: string;
  name: string;
  source: string;
  screenshot?: string;
  status?: string;
  timestamp: string;
  urlscan?: string;
  id?: string;
}

/**
 * AF timestamps look like "2026-05-15T02:08:01.440399" — ISO-ish but
 * (a) microsecond precision (JS only handles ms) and (b) no timezone offset.
 * Treat as UTC and truncate to milliseconds.
 */
export function toIso(ts: string | undefined): string | undefined {
  if (!ts) return undefined;
  // Trim sub-millisecond digits, append Z.
  const trimmed = ts.replace(/(\.\d{3})\d+$/, '$1');
  const withZ = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const t = Date.parse(withZ);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString();
}

export function parseDatamarkets(entries: AFEntry[]): CybercrimeItem[] {
  const out: CybercrimeItem[] = [];
  for (const e of entries) {
    if (!e.url || !e.name) continue;
    const published = toIso(e.timestamp);
    out.push({
      title: e.name,
      url: e.url,
      source: 'andreafortuna-demonforums',
      category: 'underground-forums',
      published,
      description: 'Underground forum thread',
      tags: [e.source, 'credentials', 'forum'].filter(Boolean),
    });
    if (out.length >= MAX_ITEMS_PER_FEED) break;
  }
  return out;
}

export function parseDefacements(entries: AFEntry[]): LiveIoc[] {
  const out: LiveIoc[] = [];
  for (const e of entries) {
    if (!e.url) continue;
    out.push({
      value: e.url,
      kind: 'url',
      source: 'andreafortuna-defacements',
      reporter: 'hax.or',
      context: 'website defacement',
      observed_at: toIso(e.timestamp),
    });
    if (out.length >= MAX_ITEMS_PER_FEED) break;
  }
  return out;
}
```

- [ ] **Step 4: Run the parser tests and verify they pass**

```bash
cd api && npx vitest run test/lib/andreafortuna-feeds.test.ts
```

Expected: PASS, all 12 tests green.

- [ ] **Step 5: Typecheck**

```bash
cd api && npm run typecheck
```

Expected: PASS.

> ⚠️ If typecheck fails with "Cannot find name 'IocKind'" or similar, the issue is that `LiveIoc.kind` references the route-local `IocKind` type. The fix is to also export `IocKind` from `live-iocs.ts` (add `export` before `type IocKind = ...` on line 57). Re-run typecheck after.

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/andreafortuna-feeds.ts api/test/lib/andreafortuna-feeds.test.ts
git commit -m "feat(cti): add andreafortuna-feeds parsers + tests"
```

---

## Task 3: Add HTTP fetcher functions to the helper module

**Why:** Parsers are tested. Now compose them with HTTP + timeout. Fetcher integration is not unit-tested (real network), but added behind a clean function boundary so route tests can mock it.

**Files:**

- Modify: `api/src/lib/andreafortuna-feeds.ts` (append at bottom)
- Modify: `api/test/lib/andreafortuna-feeds.test.ts` (append fetcher integration tests using `vi.mock`)

- [ ] **Step 1: Append fetcher tests with mocked global fetch**

Append to `api/test/lib/andreafortuna-feeds.test.ts`:

```ts
import { vi, beforeEach, afterEach } from 'vitest';
import { fetchAFDatamarkets, fetchAFDefacements } from '../../src/lib/andreafortuna-feeds';

describe('fetchAFDatamarkets / fetchAFDefacements', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetchAFDatamarkets returns parsed items on 200', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            url: 'https://demonforums.net/Thread-1',
            name: 'DemonForums - test',
            source: 'demonforums',
            timestamp: '2026-05-15T02:08:01.440399',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const items = await fetchAFDatamarkets();
    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe('https://demonforums.net/Thread-1');
    expect(items[0]!.category).toBe('underground-forums');
  });

  it('fetchAFDatamarkets returns [] on non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 502 }));
    expect(await fetchAFDatamarkets()).toEqual([]);
  });

  it('fetchAFDatamarkets returns [] on network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    expect(await fetchAFDatamarkets()).toEqual([]);
  });

  it('fetchAFDatamarkets returns [] on malformed JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    expect(await fetchAFDatamarkets()).toEqual([]);
  });

  it('fetchAFDefacements returns parsed items on 200', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            url: 'https://victim.example.com/',
            name: 'Recent defacement reported by Hax.or: https://victim.example.com/',
            source: 'hax',
            timestamp: '2026-05-15T02:07:54.767388',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const items = await fetchAFDefacements();
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe('andreafortuna-defacements');
    expect(items[0]!.kind).toBe('url');
  });

  it('fetchAFDefacements returns [] when upstream gives non-array JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"oops": true}', { status: 200 }));
    expect(await fetchAFDefacements()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

```bash
cd api && npx vitest run test/lib/andreafortuna-feeds.test.ts
```

Expected: FAIL — `fetchAFDatamarkets` / `fetchAFDefacements` not exported.

- [ ] **Step 3: Append the fetchers to the module**

Append to `api/src/lib/andreafortuna-feeds.ts`:

```ts
async function fetchJson(url: string): Promise<AFEntry[] | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': 'pranithjain-dfir/1.0',
        accept: 'application/json',
      },
      cf: { cacheTtl: 1800, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    const body = await res.json();
    if (!Array.isArray(body)) return null;
    return body as AFEntry[];
  } catch {
    return null;
  }
}

export async function fetchAFDatamarkets(): Promise<CybercrimeItem[]> {
  const raw = await fetchJson(DATAMARKETS_URL);
  if (!raw) return [];
  return parseDatamarkets(raw);
}

export async function fetchAFDefacements(): Promise<LiveIoc[]> {
  const raw = await fetchJson(DEFACEMENTS_URL);
  if (!raw) return [];
  return parseDefacements(raw);
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd api && npx vitest run test/lib/andreafortuna-feeds.test.ts
```

Expected: PASS (all parser + fetcher tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/andreafortuna-feeds.ts api/test/lib/andreafortuna-feeds.test.ts
git commit -m "feat(cti): add HTTP fetchers for AF datamarkets + defacements"
```

---

## Task 4: Widen `CybercrimeSource.category` union + frontend badge

**Why:** Without this, `parseDatamarkets` produces values that violate `CybercrimeItem['category']`. Frontend currently has no badge styling for `'underground-forums'`, so cards would render unstyled.

**Files:**

- Modify: `api/src/lib/cybercrime-sources.ts` (line 20)
- Modify: `src/pages/threatintel/CyberCrime.tsx` (category badge switch)

- [ ] **Step 1: Open `api/src/lib/cybercrime-sources.ts` and widen the union**

Find:

```ts
category: 'law-enforcement' | 'crypto-crime' | 'news' | 'breaches' | 'fraud-research';
```

Replace with:

```ts
category: 'law-enforcement' | 'crypto-crime' | 'news' | 'breaches' | 'fraud-research' | 'underground-forums';
```

- [ ] **Step 2: Locate the category badge styling in `src/pages/threatintel/CyberCrime.tsx`**

```bash
grep -n "law-enforcement\|crypto-crime\|fraud-research" src/pages/threatintel/CyberCrime.tsx
```

Expected: find a switch / object literal mapping each category to a Tailwind class string (or similar). Note the exact shape used by the existing categories.

- [ ] **Step 3: Add the `'underground-forums'` entry next to the existing categories**

Match the existing pattern. Example if the file has an object literal like:

```ts
const CATEGORY_STYLES: Record<string, string> = {
  'law-enforcement': 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  'crypto-crime': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  // ...
};
```

Add (adjust palette to match the file's existing color conventions; prefer a hue not already used — `violet`/`purple` works):

```ts
  'underground-forums': 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
```

If the file uses a label-text map too, add `'underground-forums': 'underground forums'` (lowercase to match neighbors).

- [ ] **Step 4: Typecheck both packages**

```bash
cd api && npm run typecheck
```

Then from repo root:

```bash
npm run lint
```

Expected: both pass. If `lint` flags the new style line, fix per the linter's complaint (usually just formatting).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/cybercrime-sources.ts src/pages/threatintel/CyberCrime.tsx
git commit -m "feat(cybercrime): add 'underground-forums' category + UI badge style"
```

---

## Task 5: Wire datamarkets into `cybercrime.ts` (TDD)

**Why:** Plumbing. Add the fetcher call, merge items, register the new source row, and add KV last-good fallback.

**Files:**

- Create: `api/test/routes/cybercrime.test.ts`
- Modify: `api/src/routes/cybercrime.ts`

- [ ] **Step 1: Read the existing `cybercrime.ts` to find the merge point + response shape**

```bash
cd api && wc -l src/routes/cybercrime.ts && grep -n "Promise.all\|sources:\|return new Response" src/routes/cybercrime.ts
```

Note: where the `Promise.all` of source fetches lives, where items are merged, and where the response is built. The integration in step 4 must slot into these exact spots — don't restructure surrounding code.

- [ ] **Step 2: Write the failing route merge test**

Create `api/test/routes/cybercrime.test.ts`:

```ts
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';

// Stub the AF fetcher so the test is deterministic and offline.
vi.mock('../../src/lib/andreafortuna-feeds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/andreafortuna-feeds')>();
  return {
    ...actual,
    fetchAFDatamarkets: async () => [
      {
        title: 'DemonForums - Stub Item',
        url: 'https://demonforums.net/Thread-stub',
        source: 'andreafortuna-demonforums',
        category: 'underground-forums' as const,
        published: '2026-05-15T02:08:01.440Z',
        description: 'Underground forum thread',
        tags: ['demonforums', 'credentials', 'forum'],
      },
    ],
  };
});

describe('GET /api/v1/cybercrime — Andrea Fortuna datamarkets', () => {
  it('includes the AF datamarkets source row in the response', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/cybercrime');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ label: string; category: string; ok: boolean; count: number }>;
      items: Array<{ url: string; source: string; category: string }>;
    };
    const afSource = body.sources.find((s) => s.label === 'AndreaFortuna Datamarkets');
    expect(afSource).toBeDefined();
    expect(afSource!.category).toBe('underground-forums');
    expect(afSource!.ok).toBe(true);
    expect(afSource!.count).toBeGreaterThanOrEqual(1);
  });

  it('includes the stubbed AF item in items[]', async () => {
    // Bust the previous test's cached response — KV/Cache-API persists across SELF.fetch.
    const res = await SELF.fetch('https://example.com/api/v1/cybercrime?cb=' + Date.now());
    const body = (await res.json()) as {
      items: Array<{ url: string; source: string; category: string }>;
    };
    const stub = body.items.find((i) => i.url === 'https://demonforums.net/Thread-stub');
    expect(stub).toBeDefined();
    expect(stub!.source).toBe('andreafortuna-demonforums');
    expect(stub!.category).toBe('underground-forums');
  });
});
```

- [ ] **Step 3: Run the test, expect failure**

```bash
cd api && npx vitest run test/routes/cybercrime.test.ts
```

Expected: FAIL — `afSource` is undefined (no AF source row in response).

> ⚠️ If the test FAILS with a different error (e.g. response 500, parse error), fix that root cause first — don't proceed until the failure mode is "AF source missing." A 500 may indicate the route's existing source list expects rigid types; check the merge logic.

- [ ] **Step 4: Modify `api/src/routes/cybercrime.ts` — add AF datamarkets integration**

At the top with other imports, add:

```ts
import { fetchAFDatamarkets } from '../lib/andreafortuna-feeds';
```

In the handler, find the existing `Promise.all` that fetches all RSS sources (the result is an array of per-source `{ items, ok }` objects, typically). Add the AF fetch in parallel:

```ts
// Existing:
const rssResults = await Promise.all(CYBERCRIME_SOURCES.map((s) => fetchOne(s)));

// Add immediately after:
const afItems = await fetchAFDatamarkets();
const afOk = afItems.length > 0;
```

Find where `sources` array is built for the response and append:

```ts
sources.push({
  label: 'AndreaFortuna Datamarkets',
  category: 'underground-forums',
  ok: afOk,
  count: afItems.length,
});
```

Find where items are merged before the round-robin selector and append AF items to the same array:

```ts
mergedItems.push(...afItems);
```

(The exact variable names may differ — match what the file uses. The principle is: append the AF row to the source-tracking array, and append AF items to the item-tracking array, before dedup / round-robin.)

- [ ] **Step 5: Run the test, expect pass**

```bash
cd api && npx vitest run test/routes/cybercrime.test.ts
```

Expected: PASS.

> ⚠️ The second test (`includes the stubbed AF item in items[]`) may still fail if the round-robin selector or dedup eliminates the stub URL. If so, the stub URL needs to be one round-robin won't drop — verify by reading the items[] array length & sample contents in the failing test output, then either (a) seed multiple stub items so the selector picks one, or (b) confirm the dedup logic isn't matching the stub URL against some other source.

- [ ] **Step 6: Add the KV last-good fallback**

In `api/src/routes/cybercrime.ts`, add the keys + helpers near other constants:

```ts
const AF_DATAMARKETS_LASTGOOD_KEY = 'cybercrime/af-datamarkets-lastgood/v1';
const LASTGOOD_TTL_SECONDS = 24 * 60 * 60;
```

Replace the simple `afItems` fetch with a fallback flow:

```ts
let afItems = await fetchAFDatamarkets();
let afOk = afItems.length > 0;
let afStale = false;

if (afOk && c.env.KV_CACHE) {
  // Persist last-good in KV (fire-and-forget via waitUntil).
  c.executionCtx.waitUntil(
    c.env.KV_CACHE.put(
      AF_DATAMARKETS_LASTGOOD_KEY,
      JSON.stringify({ items: afItems, refreshed_at: new Date().toISOString() }),
      { expirationTtl: LASTGOOD_TTL_SECONDS }
    )
  );
} else if (!afOk && c.env.KV_CACHE) {
  try {
    const raw = await c.env.KV_CACHE.get(AF_DATAMARKETS_LASTGOOD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { items: typeof afItems };
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        afItems = parsed.items;
        afOk = true;
        afStale = true;
      }
    }
  } catch {
    /* leave afOk = false */
  }
}
```

And surface `stale` on the source row:

```ts
sources.push({
  label: 'AndreaFortuna Datamarkets',
  category: 'underground-forums',
  ok: afOk,
  count: afItems.length,
  ...(afStale ? { stale: true } : {}),
});
```

You may need to widen the `sources[number]` type in `CybercrimeResponse['sources']` to include `stale?: boolean`. If the type already allows arbitrary extra keys, no widening needed.

- [ ] **Step 7: Typecheck + run the test again**

```bash
cd api && npm run typecheck && npx vitest run test/routes/cybercrime.test.ts
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add api/src/routes/cybercrime.ts api/test/routes/cybercrime.test.ts
git commit -m "feat(cybercrime): wire AF datamarkets feed with KV last-good fallback"
```

---

## Task 6: Wire defacements into `live-iocs.ts` (TDD)

**Why:** Identical shape to Task 5 but in the live-iocs surface.

**Files:**

- Create: `api/test/routes/live-iocs.test.ts`
- Modify: `api/src/routes/live-iocs.ts`

- [ ] **Step 1: Inspect `live-iocs.ts` for the merge point**

```bash
cd api && grep -n "Promise.all\|sources: \[\|sources.push" src/routes/live-iocs.ts | head
```

Note the existing pattern for adding a per-source contribution (it tracks `ok`, `count`, optional `newest_observation`).

- [ ] **Step 2: Write the failing route merge test**

Create `api/test/routes/live-iocs.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/andreafortuna-feeds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/andreafortuna-feeds')>();
  return {
    ...actual,
    fetchAFDefacements: async () => [
      {
        value: 'https://defaced-stub.example.com/',
        kind: 'url' as const,
        source: 'andreafortuna-defacements',
        reporter: 'hax.or',
        context: 'website defacement',
        observed_at: '2026-05-15T02:07:54.767Z',
      },
    ],
  };
});

describe('GET /api/v1/live-iocs — Andrea Fortuna defacements', () => {
  it('includes the AF defacements source row', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/live-iocs');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ id: string; ok: boolean; count: number; newest_observation?: string }>;
      items: Array<{ value: string; source: string; kind: string }>;
    };
    const afSource = body.sources.find((s) => s.id === 'andreafortuna-defacements');
    expect(afSource).toBeDefined();
    expect(afSource!.ok).toBe(true);
    expect(afSource!.count).toBeGreaterThanOrEqual(1);
  });

  it('includes the stubbed defacement URL in items[]', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/live-iocs?cb=' + Date.now());
    const body = (await res.json()) as {
      items: Array<{ value: string; source: string; kind: string }>;
    };
    const stub = body.items.find((i) => i.value === 'https://defaced-stub.example.com/');
    expect(stub).toBeDefined();
    expect(stub!.source).toBe('andreafortuna-defacements');
    expect(stub!.kind).toBe('url');
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
cd api && npx vitest run test/routes/live-iocs.test.ts
```

Expected: FAIL — AF source not in response.

- [ ] **Step 4: Modify `api/src/routes/live-iocs.ts` — add defacements integration**

Add the import near the others:

```ts
import { fetchAFDefacements } from '../lib/andreafortuna-feeds';
```

Add the constants near other KV keys:

```ts
const AF_DEFACEMENTS_LASTGOOD_KEY = 'live-iocs/af-defacements-lastgood/v1';
const LASTGOOD_TTL_SECONDS = 24 * 60 * 60;
```

In the handler, add the fetch alongside the other source fetches (in the existing `Promise.all` if one exists, or as an additional awaited call):

```ts
let afDefacements = await fetchAFDefacements();
let afDefacementsOk = afDefacements.length > 0;
let afDefacementsStale = false;

if (afDefacementsOk && c.env.KV_CACHE) {
  c.executionCtx.waitUntil(
    c.env.KV_CACHE.put(
      AF_DEFACEMENTS_LASTGOOD_KEY,
      JSON.stringify({ items: afDefacements, refreshed_at: new Date().toISOString() }),
      { expirationTtl: LASTGOOD_TTL_SECONDS }
    )
  );
} else if (!afDefacementsOk && c.env.KV_CACHE) {
  try {
    const raw = await c.env.KV_CACHE.get(AF_DEFACEMENTS_LASTGOOD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { items: typeof afDefacements };
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        afDefacements = parsed.items;
        afDefacementsOk = true;
        afDefacementsStale = true;
      }
    }
  } catch {
    /* leave ok = false */
  }
}
```

Append to the items array (before the existing sort that orders by `observed_at`):

```ts
items.push(...afDefacements);
```

Append to the sources array:

```ts
const newestAf = afDefacements
  .map((i) => i.observed_at)
  .filter((t): t is string => Boolean(t))
  .sort()
  .pop();

sources.push({
  id: 'andreafortuna-defacements',
  ok: afDefacementsOk,
  count: afDefacements.length,
  ...(newestAf ? { newest_observation: newestAf } : {}),
  ...(afDefacementsStale ? { stale: true } : {}),
});
```

(If the existing `LiveSource` interface doesn't include `stale?: boolean`, widen it the same way the `phishing-urls.ts` `PhishingSource` does.)

- [ ] **Step 5: Run tests, expect pass**

```bash
cd api && npx vitest run test/routes/live-iocs.test.ts
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
cd api && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/live-iocs.ts api/test/routes/live-iocs.test.ts
git commit -m "feat(live-iocs): wire AF defacements feed with KV last-good fallback"
```

---

## Task 7: Add feed-status probe rows

**Why:** The `/threatintel/status` dashboard reads each route's cached payload and reports per-source health. Without explicit rows, the new AF sources are invisible there.

**Files:**

- Modify: `api/src/routes/feed-status.ts`

- [ ] **Step 1: Open `api/src/routes/feed-status.ts` and find the probe-spec array**

```bash
cd api && grep -n "FeedProbeSpec\|cache_key:" src/routes/feed-status.ts | head -20
```

Find the array (likely named `PROBES` or inline) that lists each `FeedProbeSpec` with `cache_key` + `evaluate`.

- [ ] **Step 2: Add two new probe specs**

In the probe array, append two entries that read the cybercrime and live-iocs cached payloads and pluck the AF source row:

```ts
{
  id: 'af-datamarkets',
  label: 'AF Datamarkets',
  page_path: '/threatintel/cyber-crime',
  api_path: '/api/v1/cybercrime',
  cache_key: CYBERCRIME_CACHE_KEY,
  evaluate: (body) => {
    const sources = (body as { sources?: Array<{ label?: string; ok?: boolean; count?: number; stale?: boolean }> })
      ?.sources;
    const row = Array.isArray(sources) ? sources.find((s) => s.label === 'AndreaFortuna Datamarkets') : undefined;
    if (!row) return { status: 'cold' as const, reason: 'no AF row in cybercrime cache' };
    if (row.ok && !row.stale) return { status: 'ok' as const, reason: `${row.count ?? 0} items`, metrics: { items: row.count ?? 0 } };
    if (row.ok && row.stale) return { status: 'degraded' as const, reason: 'serving stale (last-good fallback)' };
    return { status: 'down' as const, reason: 'upstream failed; no fallback' };
  },
},
{
  id: 'af-defacements',
  label: 'AF Defacements',
  page_path: '/threatintel/live-iocs',
  api_path: '/api/v1/live-iocs',
  cache_key: LIVE_IOCS_CACHE_KEY,
  evaluate: (body) => {
    const sources = (body as { sources?: Array<{ id?: string; ok?: boolean; count?: number; stale?: boolean; newest_observation?: string }> })
      ?.sources;
    const row = Array.isArray(sources) ? sources.find((s) => s.id === 'andreafortuna-defacements') : undefined;
    if (!row) return { status: 'cold' as const, reason: 'no AF row in live-iocs cache' };
    if (row.ok && !row.stale) {
      return {
        status: 'ok' as const,
        reason: `${row.count ?? 0} items`,
        metrics: { items: row.count ?? 0 },
        ageS: row.newest_observation ? Math.max(0, Math.round((Date.now() - Date.parse(row.newest_observation)) / 1000)) : undefined,
      };
    }
    if (row.ok && row.stale) return { status: 'degraded' as const, reason: 'serving stale (last-good fallback)' };
    return { status: 'down' as const, reason: 'upstream failed; no fallback' };
  },
},
```

(`CYBERCRIME_CACHE_KEY` and `LIVE_IOCS_CACHE_KEY` are already imported at the top of `feed-status.ts` — verify with the grep in Step 1; if missing, add the imports.)

- [ ] **Step 3: Bump the feed-status cache version so the new rows surface immediately on deploy**

Find the line near the top:

```ts
const FEED_STATUS_CACHE_KEY = 'https://feed-status-cache.internal/v2-cachereads';
```

Bump to:

```ts
const FEED_STATUS_CACHE_KEY = 'https://feed-status-cache.internal/v3-af-feeds';
```

- [ ] **Step 4: Typecheck**

```bash
cd api && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Smoke test via the existing health/route harness**

```bash
cd api && npx vitest run test/routes/cybercrime.test.ts test/routes/live-iocs.test.ts test/lib/andreafortuna-feeds.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/feed-status.ts
git commit -m "feat(feed-status): add AF datamarkets + defacements probe rows"
```

---

## Task 8: Final verification + frontend lint pass

- [ ] **Step 1: Run the full API test suite**

```bash
cd api && npm test
```

Expected: all PASS (no regressions in pre-existing tests).

- [ ] **Step 2: Frontend lint + typecheck (the only frontend change was Task 4)**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Frontend test suite**

```bash
npm run test:run
```

Expected: PASS.

- [ ] **Step 4: Confirm working tree is clean**

```bash
git status
```

Expected: nothing to commit (everything has been committed task-by-task).

- [ ] **Step 5: Manual deploy verification (optional, post-merge)**

After deploy, hit the endpoints from a browser or curl:

```bash
curl -s "https://<your-host>/api/v1/cybercrime" | jq '.sources[] | select(.label=="AndreaFortuna Datamarkets")'
curl -s "https://<your-host>/api/v1/live-iocs"   | jq '.sources[] | select(.id=="andreafortuna-defacements")'
curl -s "https://<your-host>/api/v1/feed-status" | jq '.rows[] | select(.id|startswith("af-"))'
```

Expected on each: a row with `ok: true` and a non-zero `count`.

---

## Self-review notes

- **Spec coverage:** Tasks 2–3 implement spec §4.1 (module + parsers + fetchers + 200-cap). Task 4 implements §4.5 (category union + UI badge). Task 5 implements §4.3 + §5 (cybercrime wiring + KV last-good). Task 6 implements §4.4 + §5 (live-iocs wiring + KV last-good). Task 7 implements §4.6 (feed-status rows). Task 8 implements §7 verification.
- **Out-of-scope feeds (Phishing/Victims/Dataleaks):** intentionally not present — confirmed against spec §2.
- **IOC correlation (spec §6):** no explicit task because defacement items flow into `ioc-correlation.ts` automatically by virtue of being in the cached `live-iocs` payload. The correlation route reads that cache and treats new `source` values as new feeds with no per-feed wiring needed. Verified by reading `ioc-correlation.ts` — it iterates over `sources[]` from the cached payload.
- **Type drift watch:** `CybercrimeItem`, `LiveIoc`, `IocKind`, and `LiveSource` types are referenced across multiple tasks. If you find drift between tasks (e.g. a property name mismatch), fix at the type definition site, not at the use site.

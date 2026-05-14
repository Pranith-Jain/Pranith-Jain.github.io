# Case-Study Generator MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end pipeline that auto-discovers cybersecurity case-study topics, generates blog posts via Cloudflare Workers AI, and publishes them on a randomized schedule to a new `/blog` surface on the portfolio. Approval happens via token-gated API endpoints (curl/Postman); no admin UI in this plan.

**Architecture:** Single Cloudflare Worker (existing). Piggybacks on the three existing cron triggers (`5 0 * * *` daily, `15 0 * * 1` weekly Mon, `0 * * * *` hourly) — the `scheduled` handler dispatches by cron expression. One new KV namespace `CASE_STUDIES`, one new Workers AI binding `AI`. All free-tier.

**Tech Stack:** TypeScript, Hono (existing), Vitest (existing), Cloudflare Workers + KV + Workers AI, React 18 + Vite SSR (existing), `marked` + `isomorphic-dompurify` (existing).

**Reference spec:** `docs/superpowers/specs/2026-05-14-case-study-generator-design.md`

---

## File Structure

```
api/src/case-study/                     # all new code lives here
├── types.ts                            # shared TS types
├── stable-keys.ts                      # dedup key generation
├── scoring.ts                          # pure scoring functions
├── kv-keys.ts                          # KV key name helpers
├── storage/
│   ├── candidates.ts                   # candidates:* CRUD
│   ├── approved.ts                     # approved:* CRUD
│   ├── schedule.ts                     # schedule:upcoming CRUD
│   ├── posts.ts                        # posts:* + posts:index CRUD
│   ├── dedup.ts                        # meta:dedup:* CRUD
│   └── failed.ts                       # failed:* CRUD
├── discovery/
│   ├── index.ts                        # orchestrator
│   ├── cve.ts                          # KEV + NVD
│   ├── actor.ts                        # MITRE + RSS
│   ├── malware.ts                      # abuse.ch
│   └── ransomware.ts                   # dark-web watcher
├── generation/
│   ├── index.ts                        # orchestrator
│   ├── enrich.ts                       # re-fetch evidence
│   ├── templates.ts                    # 4 type-specific outlines + prompts
│   ├── ai-client.ts                    # Workers AI wrapper with fallback
│   ├── post-process.ts                 # validation, sanitize, IOC extract
│   └── hero-svg.ts                     # SVG banner generator
├── publishing/
│   ├── planner.ts                      # weekly slot planning
│   └── publisher.ts                    # slot picking, generation kickoff
├── rendering/
│   ├── markdown.ts                     # markdown → HTML w/ IOC auto-link
│   └── rss.ts                          # RSS XML rendering
└── auth.ts                             # admin token middleware

api/src/routes/
├── blog-public.ts                      # public /blog routes
└── case-study-admin.ts                 # token-gated approval API

src/pages/
├── Blog.tsx                            # public index page
└── BlogPost.tsx                        # public single post page

worker/index.ts                         # MODIFY: extend scheduled handler
api/src/index.ts                        # MODIFY: register new routes
api/src/env.ts                          # MODIFY: add CASE_STUDIES + AI bindings
src/App.tsx                             # MODIFY: register /blog routes
wrangler.jsonc                          # MODIFY: add KV namespace + AI binding
```

---

## Task 1: Wire up bindings in wrangler.jsonc + Env type

**Files:**

- Modify: `wrangler.jsonc`
- Modify: `api/src/env.ts`

- [ ] **Step 1: Create a new KV namespace via wrangler**

Run:

```bash
cd /Users/pranith/Documents/portfolio
npx wrangler kv namespace create CASE_STUDIES
```

Expected output (example):

```
🌀 Creating namespace with title "pranithjain-CASE_STUDIES"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
[[kv_namespaces]]
binding = "CASE_STUDIES"
id = "<some-32-char-hex>"
```

Copy the `id`.

- [ ] **Step 2: Add KV binding and AI binding to wrangler.jsonc**

In `wrangler.jsonc`, inside the existing `kv_namespaces` array, add a third entry (replace `<id>` with the id from step 1):

```jsonc
"kv_namespaces": [
  { "binding": "BRIEFINGS",    "id": "d7a0a96be0ef452087baef1172bbbe34" },
  { "binding": "KV_CACHE",     "id": "5125e769e49f4a1586f81d1935f9856a" },
  { "binding": "CASE_STUDIES", "id": "<id-from-step-1>" }
],
```

Then add a new top-level `ai` block (after `kv_namespaces`):

```jsonc
"ai": { "binding": "AI" },
```

No cron changes — we'll piggyback on the existing `crons` array.

- [ ] **Step 3: Add ADMIN_TOKEN secret**

Run:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Paste a long random string when prompted (e.g., `openssl rand -hex 32`).

- [ ] **Step 4: Extend the Env type**

Open `api/src/env.ts` and add `CASE_STUDIES`, `AI`, and `ADMIN_TOKEN` to the `Env` interface. The exact shape depends on the existing file — read it first, then add:

```ts
export interface Env {
  // ... existing bindings ...
  CASE_STUDIES: KVNamespace;
  AI: Ai; // type from @cloudflare/workers-types
  ADMIN_TOKEN: string;
}
```

- [ ] **Step 5: Verify types compile**

Run:

```bash
npx tsc --noEmit -p api/tsconfig.json
```

Expected: no new errors related to `CASE_STUDIES`, `AI`, `ADMIN_TOKEN`.

- [ ] **Step 6: Commit**

```bash
git add wrangler.jsonc api/src/env.ts
git commit -m "feat(case-study): add KV namespace, AI binding, ADMIN_TOKEN secret"
```

---

## Task 2: Shared types module

**Files:**

- Create: `api/src/case-study/types.ts`

- [ ] **Step 1: Write the types module**

```ts
// api/src/case-study/types.ts

export type CaseStudyType = 'cve' | 'actor' | 'malware' | 'ransom';

export type CandidateStatus = 'pending' | 'approved' | 'skipped' | 'published';

export interface Candidate {
  key: string; // stable key, e.g. "cve-2026-1234"
  type: CaseStudyType;
  title: string;
  rationale: string; // one-line why-this-matters
  score: number; // 0..1
  evidence: Record<string, unknown>; // type-specific snapshot
  discoveredAt: string; // ISO 8601
  status: CandidateStatus;
}

export interface Slot {
  slotAt: string; // ISO 8601
  candidateId: string; // stable key
  status: 'pending' | 'publishing' | 'published' | 'failed';
  publishedSlug?: string;
  error?: string;
}

export interface PostIOC {
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'sha256' | 'sha1' | 'md5' | 'email';
  value: string;
}

export interface PostSource {
  url: string;
  title: string;
}

export interface Post {
  slug: string;
  type: CaseStudyType;
  title: string;
  excerpt: string;
  publishedAt: string; // ISO 8601
  candidateId: string;
  body: string; // markdown
  hero: string; // inline SVG
  iocs: PostIOC[];
  tags: string[];
  sources: PostSource[];
}

export interface PostIndexEntry {
  slug: string;
  title: string;
  type: CaseStudyType;
  excerpt: string;
  publishedAt: string;
  tags: string[];
}

export interface DedupRecord {
  lastSeenAt: string;
  publishedSlug?: string;
}

export interface FailureRecord {
  slotId: string;
  candidateId: string;
  error: string;
  rawOutput?: string;
  failedAt: string;
  retries: number;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit -p api/tsconfig.json
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add api/src/case-study/types.ts
git commit -m "feat(case-study): add shared types"
```

---

## Task 3: Stable key generator

**Files:**

- Create: `api/src/case-study/stable-keys.ts`
- Create: `api/test/case-study/stable-keys.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/stable-keys.test.ts
import { describe, it, expect } from 'vitest';
import { cveKey, actorKey, malwareKey, ransomKey, slotIdFor } from '../../src/case-study/stable-keys';

describe('stable-keys', () => {
  it('cveKey lowercases and normalizes', () => {
    expect(cveKey('CVE-2026-1234')).toBe('cve-2026-1234');
    expect(cveKey('cve-2026-1234')).toBe('cve-2026-1234');
  });

  it('actorKey slugifies group name', () => {
    expect(actorKey('FIN7')).toBe('actor-fin7');
    expect(actorKey('APT29 (Cozy Bear)')).toBe('actor-apt29-cozy-bear');
  });

  it('malwareKey slugifies family name', () => {
    expect(malwareKey('Lumma Stealer')).toBe('malware-lumma-stealer');
  });

  it('ransomKey includes year-month bucket', () => {
    expect(ransomKey('Akira', new Date('2026-05-14T00:00:00Z'))).toBe('ransom-akira-2026-05');
  });

  it('slotIdFor is deterministic per slot', () => {
    expect(slotIdFor('2026-05-19T14:23:00Z')).toBe('slot-2026-05-19t14-23-00z');
  });

  it('rejects empty input', () => {
    expect(() => cveKey('')).toThrow();
    expect(() => actorKey('')).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/pranith/Documents/portfolio
npx vitest run api/test/case-study/stable-keys.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// api/src/case-study/stable-keys.ts

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function nonEmpty(s: string, field: string): string {
  if (!s || !s.trim()) throw new Error(`${field} must not be empty`);
  return s;
}

export function cveKey(cveId: string): string {
  return nonEmpty(cveId, 'cveId').toLowerCase();
}

export function actorKey(name: string): string {
  return `actor-${slugify(nonEmpty(name, 'name'))}`;
}

export function malwareKey(family: string): string {
  return `malware-${slugify(nonEmpty(family, 'family'))}`;
}

export function ransomKey(group: string, when: Date): string {
  const y = when.getUTCFullYear();
  const m = String(when.getUTCMonth() + 1).padStart(2, '0');
  return `ransom-${slugify(nonEmpty(group, 'group'))}-${y}-${m}`;
}

export function slotIdFor(slotAtIso: string): string {
  return `slot-${slotAtIso.toLowerCase().replace(/[:.]/g, '-')}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run api/test/case-study/stable-keys.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/stable-keys.ts api/test/case-study/stable-keys.test.ts
git commit -m "feat(case-study): add stable key generators with tests"
```

---

## Task 4: Scoring functions

**Files:**

- Create: `api/src/case-study/scoring.ts`
- Create: `api/test/case-study/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/scoring.test.ts
import { describe, it, expect } from 'vitest';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../../src/case-study/scoring';

const now = new Date('2026-05-14T12:00:00Z');

describe('recencyScore', () => {
  it('is 1.0 for events within last 24h', () => {
    const t = new Date('2026-05-13T13:00:00Z').toISOString();
    expect(recencyScore(t, now)).toBeCloseTo(1.0, 2);
  });

  it('decays linearly to 0 over 14 days', () => {
    const t = new Date('2026-04-30T12:00:00Z').toISOString(); // 14d ago
    expect(recencyScore(t, now)).toBeCloseTo(0, 2);
  });

  it('is 0 for events older than 14 days', () => {
    const t = new Date('2026-04-01T12:00:00Z').toISOString();
    expect(recencyScore(t, now)).toBe(0);
  });
});

describe('severityScore', () => {
  it('returns CVSS/10 when given a number', () => {
    expect(severityScore({ cvss: 9.8 })).toBeCloseTo(0.98, 2);
    expect(severityScore({ cvss: 5 })).toBeCloseTo(0.5, 2);
  });

  it('returns 1.0 if KEV-listed regardless of CVSS', () => {
    expect(severityScore({ cvss: 4, kev: true })).toBe(1.0);
  });

  it('scales victim count for ransomware (5+ = 1.0)', () => {
    expect(severityScore({ victims: 1 })).toBeCloseTo(0.2, 2);
    expect(severityScore({ victims: 5 })).toBe(1.0);
    expect(severityScore({ victims: 100 })).toBe(1.0);
  });

  it('returns 0.5 default for no signals', () => {
    expect(severityScore({})).toBe(0.5);
  });
});

describe('noveltyScore', () => {
  it('is 1.0 if not previously seen', () => {
    expect(noveltyScore(null, now)).toBe(1.0);
  });

  it('is 0.0 if seen today', () => {
    expect(noveltyScore({ lastSeenAt: now.toISOString() }, now)).toBe(0);
  });

  it('linearly increases over 90 days', () => {
    const t = new Date(now.getTime() - 45 * 24 * 3600 * 1000).toISOString();
    expect(noveltyScore({ lastSeenAt: t }, now)).toBeCloseTo(0.5, 2);
  });
});

describe('finalScore', () => {
  it('weighted average of recency, severity, novelty with source weight', () => {
    const s = finalScore({
      recency: 1.0,
      severity: 1.0,
      novelty: 1.0,
      sourceWeight: 1.0,
    });
    expect(s).toBeCloseTo(1.0, 2);
  });

  it('drops when novelty drops', () => {
    const hi = finalScore({ recency: 1, severity: 1, novelty: 1, sourceWeight: 1 });
    const lo = finalScore({ recency: 1, severity: 1, novelty: 0, sourceWeight: 1 });
    expect(lo).toBeLessThan(hi);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/scoring.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/scoring.ts
import type { DedupRecord } from './types';

const DAY_MS = 24 * 3600 * 1000;
const FOURTEEN_DAYS = 14 * DAY_MS;
const NINETY_DAYS = 90 * DAY_MS;

export function recencyScore(eventIso: string, now: Date): number {
  const age = now.getTime() - new Date(eventIso).getTime();
  if (age <= DAY_MS) return 1.0;
  if (age >= FOURTEEN_DAYS) return 0;
  return 1 - (age - DAY_MS) / (FOURTEEN_DAYS - DAY_MS);
}

export interface SeverityInput {
  cvss?: number;
  kev?: boolean;
  victims?: number;
}

export function severityScore(input: SeverityInput): number {
  if (input.kev) return 1.0;
  if (typeof input.cvss === 'number') return Math.min(1, Math.max(0, input.cvss / 10));
  if (typeof input.victims === 'number') return Math.min(1, input.victims / 5);
  return 0.5;
}

export function noveltyScore(prev: DedupRecord | null, now: Date): number {
  if (!prev) return 1.0;
  const age = now.getTime() - new Date(prev.lastSeenAt).getTime();
  if (age >= NINETY_DAYS) return 1.0;
  return Math.max(0, age / NINETY_DAYS);
}

export interface FinalScoreInput {
  recency: number;
  severity: number;
  novelty: number;
  sourceWeight: number; // 0..1
}

export function finalScore({ recency, severity, novelty, sourceWeight }: FinalScoreInput): number {
  // Weights chosen so no single dimension can carry a candidate alone.
  const weighted = 0.3 * recency + 0.35 * severity + 0.25 * novelty + 0.1 * sourceWeight;
  return Number(weighted.toFixed(4));
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run api/test/case-study/scoring.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/scoring.ts api/test/case-study/scoring.test.ts
git commit -m "feat(case-study): add scoring functions with tests"
```

---

## Task 5: KV key naming helpers

**Files:**

- Create: `api/src/case-study/kv-keys.ts`
- Create: `api/test/case-study/kv-keys.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/kv-keys.test.ts
import { describe, it, expect } from 'vitest';
import { kv } from '../../src/case-study/kv-keys';

describe('kv key helpers', () => {
  it('candidates key includes type and stable key', () => {
    expect(kv.candidate('cve', 'cve-2026-1234')).toBe('candidates:cve:cve-2026-1234');
  });
  it('candidates type prefix is listable', () => {
    expect(kv.candidatesPrefix('cve')).toBe('candidates:cve:');
  });
  it('approved key', () => {
    expect(kv.approved('cve-2026-1234')).toBe('approved:cve-2026-1234');
  });
  it('post key uses slug', () => {
    expect(kv.post('cve-2026-1234-fortinet')).toBe('posts:cve-2026-1234-fortinet');
  });
  it('static keys', () => {
    expect(kv.scheduleUpcoming).toBe('schedule:upcoming');
    expect(kv.postsIndex).toBe('posts:index');
    expect(kv.metaRss).toBe('meta:rss');
  });
  it('dedup key', () => {
    expect(kv.dedup('cve-2026-1234')).toBe('meta:dedup:cve-2026-1234');
  });
  it('failed key', () => {
    expect(kv.failed('slot-2026-05-19')).toBe('failed:slot-2026-05-19');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/kv-keys.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/kv-keys.ts
import type { CaseStudyType } from './types';

export const kv = {
  candidate: (type: CaseStudyType, stableKey: string) => `candidates:${type}:${stableKey}`,
  candidatesPrefix: (type: CaseStudyType) => `candidates:${type}:`,
  approved: (stableKey: string) => `approved:${stableKey}`,
  approvedPrefix: 'approved:',
  scheduleUpcoming: 'schedule:upcoming',
  post: (slug: string) => `posts:${slug}`,
  postsIndex: 'posts:index',
  metaRss: 'meta:rss',
  dedup: (stableKey: string) => `meta:dedup:${stableKey}`,
  failed: (slotId: string) => `failed:${slotId}`,
};
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run api/test/case-study/kv-keys.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/kv-keys.ts api/test/case-study/kv-keys.test.ts
git commit -m "feat(case-study): add KV key naming helpers"
```

---

## Task 6: Candidates storage

**Files:**

- Create: `api/src/case-study/storage/candidates.ts`
- Create: `api/test/case-study/storage/candidates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/storage/candidates.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  putCandidate,
  getCandidate,
  listCandidates,
  deleteCandidate,
} from '../../../src/case-study/storage/candidates';
import type { Candidate } from '../../../src/case-study/types';

// Minimal in-memory KV mock matching the bits we use.
function mockKV() {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  return {
    store,
    async get(key: string, _type?: 'json') {
      const e = store.get(key);
      if (!e) return null;
      if (e.expiresAt && Date.now() > e.expiresAt) {
        store.delete(key);
        return null;
      }
      return _type === 'json' ? JSON.parse(e.value) : e.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        value,
        expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined,
      });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(opts: { prefix: string }) {
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(opts.prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: '' };
    },
  };
}

const sampleCandidate: Candidate = {
  key: 'cve-2026-1234',
  type: 'cve',
  title: 'Test CVE',
  rationale: 'in KEV',
  score: 0.9,
  evidence: { cve: 'CVE-2026-1234' },
  discoveredAt: '2026-05-14T06:00:00Z',
  status: 'pending',
};

describe('candidates storage', () => {
  it('round-trips a candidate', async () => {
    const kv = mockKV() as any;
    await putCandidate(kv, sampleCandidate);
    const fetched = await getCandidate(kv, 'cve', 'cve-2026-1234');
    expect(fetched).toEqual(sampleCandidate);
  });

  it('writes with 7-day TTL', async () => {
    const kv = mockKV() as any;
    await putCandidate(kv, sampleCandidate);
    const entry = kv.store.get('candidates:cve:cve-2026-1234');
    expect(entry?.expiresAt).toBeDefined();
    const now = Date.now();
    const sevenDays = 7 * 24 * 3600 * 1000;
    expect(entry!.expiresAt! - now).toBeGreaterThan(sevenDays - 60_000);
    expect(entry!.expiresAt! - now).toBeLessThan(sevenDays + 60_000);
  });

  it('listCandidates returns candidates of a type', async () => {
    const kv = mockKV() as any;
    await putCandidate(kv, sampleCandidate);
    await putCandidate(kv, { ...sampleCandidate, key: 'cve-2026-5678' });
    await putCandidate(kv, { ...sampleCandidate, key: 'actor-fin7', type: 'actor' });
    const cves = await listCandidates(kv, 'cve');
    expect(cves).toHaveLength(2);
    const actors = await listCandidates(kv, 'actor');
    expect(actors).toHaveLength(1);
  });

  it('deleteCandidate removes the entry', async () => {
    const kv = mockKV() as any;
    await putCandidate(kv, sampleCandidate);
    await deleteCandidate(kv, 'cve', 'cve-2026-1234');
    expect(await getCandidate(kv, 'cve', 'cve-2026-1234')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/storage/candidates.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/storage/candidates.ts
import type { KVNamespace } from '@cloudflare/workers-types';
import type { Candidate, CaseStudyType } from '../types';
import { kv } from '../kv-keys';

const SEVEN_DAYS_SECONDS = 7 * 24 * 3600;

export async function putCandidate(ns: KVNamespace, c: Candidate): Promise<void> {
  await ns.put(kv.candidate(c.type, c.key), JSON.stringify(c), {
    expirationTtl: SEVEN_DAYS_SECONDS,
  });
}

export async function getCandidate(ns: KVNamespace, type: CaseStudyType, stableKey: string): Promise<Candidate | null> {
  const raw = await ns.get(kv.candidate(type, stableKey), 'json');
  return raw as Candidate | null;
}

export async function listCandidates(ns: KVNamespace, type: CaseStudyType): Promise<Candidate[]> {
  const { keys } = await ns.list({ prefix: kv.candidatesPrefix(type) });
  const results = await Promise.all(keys.map((k) => ns.get(k.name, 'json') as Promise<Candidate | null>));
  return results.filter((x): x is Candidate => x !== null);
}

export async function deleteCandidate(ns: KVNamespace, type: CaseStudyType, stableKey: string): Promise<void> {
  await ns.delete(kv.candidate(type, stableKey));
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/storage/candidates.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/storage/candidates.ts api/test/case-study/storage/candidates.test.ts
git commit -m "feat(case-study): add candidates KV storage"
```

---

## Task 7: Approved queue storage

**Files:**

- Create: `api/src/case-study/storage/approved.ts`
- Create: `api/test/case-study/storage/approved.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/storage/approved.test.ts
import { describe, it, expect } from 'vitest';
import { approve, unapprove, listApproved, getApproved } from '../../../src/case-study/storage/approved';
import type { Candidate } from '../../../src/case-study/types';

// Reuse the mock pattern from Task 6
function mockKV() {
  const store = new Map<string, { value: string }>();
  return {
    store,
    async get(key: string, type?: 'json') {
      const e = store.get(key);
      if (!e) return null;
      return type === 'json' ? JSON.parse(e.value) : e.value;
    },
    async put(key: string, value: string) {
      store.set(key, { value });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(opts: { prefix: string }) {
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(opts.prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: '' };
    },
  };
}

const c: Candidate = {
  key: 'cve-2026-1234',
  type: 'cve',
  title: 'X',
  rationale: 'r',
  score: 0.9,
  evidence: {},
  discoveredAt: '2026-05-14T06:00:00Z',
  status: 'pending',
};

describe('approved storage', () => {
  it('approve writes with status=approved', async () => {
    const ns = mockKV() as any;
    await approve(ns, c);
    const fetched = await getApproved(ns, 'cve-2026-1234');
    expect(fetched?.status).toBe('approved');
  });

  it('listApproved returns all approved candidates', async () => {
    const ns = mockKV() as any;
    await approve(ns, c);
    await approve(ns, { ...c, key: 'actor-fin7', type: 'actor' });
    const list = await listApproved(ns);
    expect(list).toHaveLength(2);
  });

  it('unapprove removes from queue', async () => {
    const ns = mockKV() as any;
    await approve(ns, c);
    await unapprove(ns, 'cve-2026-1234');
    expect(await getApproved(ns, 'cve-2026-1234')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/storage/approved.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/storage/approved.ts
import type { KVNamespace } from '@cloudflare/workers-types';
import type { Candidate } from '../types';
import { kv } from '../kv-keys';

export async function approve(ns: KVNamespace, c: Candidate): Promise<void> {
  const approved: Candidate = { ...c, status: 'approved' };
  await ns.put(kv.approved(c.key), JSON.stringify(approved));
}

export async function unapprove(ns: KVNamespace, stableKey: string): Promise<void> {
  await ns.delete(kv.approved(stableKey));
}

export async function getApproved(ns: KVNamespace, stableKey: string): Promise<Candidate | null> {
  return (await ns.get(kv.approved(stableKey), 'json')) as Candidate | null;
}

export async function listApproved(ns: KVNamespace): Promise<Candidate[]> {
  const { keys } = await ns.list({ prefix: kv.approvedPrefix });
  const results = await Promise.all(keys.map((k) => ns.get(k.name, 'json') as Promise<Candidate | null>));
  return results.filter((x): x is Candidate => x !== null);
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/storage/approved.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/storage/approved.ts api/test/case-study/storage/approved.test.ts
git commit -m "feat(case-study): add approved queue storage"
```

---

## Task 8: Schedule storage

**Files:**

- Create: `api/src/case-study/storage/schedule.ts`
- Create: `api/test/case-study/storage/schedule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/storage/schedule.test.ts
import { describe, it, expect } from 'vitest';
import { getSchedule, setSchedule, markSlotStatus, pickDueSlot } from '../../../src/case-study/storage/schedule';
import type { Slot } from '../../../src/case-study/types';

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
  };
}

const slots: Slot[] = [
  { slotAt: '2026-05-19T14:23:00Z', candidateId: 'cve-2026-1234', status: 'pending' },
  { slotAt: '2026-05-21T11:07:00Z', candidateId: 'actor-fin7', status: 'pending' },
];

describe('schedule storage', () => {
  it('round-trips schedule', async () => {
    const ns = mockKV() as any;
    await setSchedule(ns, slots);
    expect(await getSchedule(ns)).toEqual(slots);
  });

  it('empty schedule by default', async () => {
    const ns = mockKV() as any;
    expect(await getSchedule(ns)).toEqual([]);
  });

  it('markSlotStatus mutates by candidateId', async () => {
    const ns = mockKV() as any;
    await setSchedule(ns, slots);
    await markSlotStatus(ns, 'cve-2026-1234', 'publishing');
    const updated = await getSchedule(ns);
    expect(updated[0].status).toBe('publishing');
  });

  it('pickDueSlot returns earliest pending slot at or before now', async () => {
    const ns = mockKV() as any;
    await setSchedule(ns, slots);
    const due = await pickDueSlot(ns, new Date('2026-05-20T00:00:00Z'));
    expect(due?.candidateId).toBe('cve-2026-1234');
  });

  it('pickDueSlot returns null if nothing is due', async () => {
    const ns = mockKV() as any;
    await setSchedule(ns, slots);
    const due = await pickDueSlot(ns, new Date('2026-05-15T00:00:00Z'));
    expect(due).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/storage/schedule.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/storage/schedule.ts
import type { KVNamespace } from '@cloudflare/workers-types';
import type { Slot } from '../types';
import { kv } from '../kv-keys';

export async function getSchedule(ns: KVNamespace): Promise<Slot[]> {
  const raw = (await ns.get(kv.scheduleUpcoming, 'json')) as Slot[] | null;
  return raw ?? [];
}

export async function setSchedule(ns: KVNamespace, slots: Slot[]): Promise<void> {
  const sorted = [...slots].sort((a, b) => a.slotAt.localeCompare(b.slotAt));
  await ns.put(kv.scheduleUpcoming, JSON.stringify(sorted));
}

export async function markSlotStatus(
  ns: KVNamespace,
  candidateId: string,
  status: Slot['status'],
  extras: Partial<Slot> = {}
): Promise<void> {
  const current = await getSchedule(ns);
  const updated = current.map((s) => (s.candidateId === candidateId ? { ...s, status, ...extras } : s));
  await setSchedule(ns, updated);
}

export async function pickDueSlot(ns: KVNamespace, now: Date): Promise<Slot | null> {
  const slots = await getSchedule(ns);
  for (const s of slots) {
    if (s.status === 'pending' && new Date(s.slotAt) <= now) return s;
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/storage/schedule.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/storage/schedule.ts api/test/case-study/storage/schedule.test.ts
git commit -m "feat(case-study): add schedule storage"
```

---

## Task 9: Posts storage + index

**Files:**

- Create: `api/src/case-study/storage/posts.ts`
- Create: `api/test/case-study/storage/posts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/storage/posts.test.ts
import { describe, it, expect } from 'vitest';
import { putPost, getPost, listPostIndex, removePost } from '../../../src/case-study/storage/posts';
import type { Post } from '../../../src/case-study/types';

function mockKV() {
  const store = new Map<string, string>();
  return {
    store,
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

const samplePost: Post = {
  slug: 'cve-2026-1234-fortinet',
  type: 'cve',
  title: 'CVE-2026-1234 — Fortinet',
  excerpt: 'A summary.',
  publishedAt: '2026-05-19T15:05:00Z',
  candidateId: 'cve-2026-1234',
  body: '## Summary\n\nBody text.',
  hero: '<svg/>',
  iocs: [],
  tags: ['cve', 'fortinet'],
  sources: [],
};

describe('posts storage', () => {
  it('putPost writes post + updates index', async () => {
    const ns = mockKV() as any;
    await putPost(ns, samplePost);
    expect(await getPost(ns, samplePost.slug)).toEqual(samplePost);
    const index = await listPostIndex(ns);
    expect(index).toHaveLength(1);
    expect(index[0].slug).toBe(samplePost.slug);
    expect(index[0].excerpt).toBe('A summary.');
  });

  it('index is sorted by publishedAt desc', async () => {
    const ns = mockKV() as any;
    await putPost(ns, samplePost);
    await putPost(ns, { ...samplePost, slug: 'newer', publishedAt: '2026-05-20T00:00:00Z' });
    const index = await listPostIndex(ns);
    expect(index[0].slug).toBe('newer');
    expect(index[1].slug).toBe(samplePost.slug);
  });

  it('removePost removes from store + index', async () => {
    const ns = mockKV() as any;
    await putPost(ns, samplePost);
    await removePost(ns, samplePost.slug);
    expect(await getPost(ns, samplePost.slug)).toBeNull();
    expect(await listPostIndex(ns)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/storage/posts.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/storage/posts.ts
import type { KVNamespace } from '@cloudflare/workers-types';
import type { Post, PostIndexEntry } from '../types';
import { kv } from '../kv-keys';

export async function getPost(ns: KVNamespace, slug: string): Promise<Post | null> {
  return (await ns.get(kv.post(slug), 'json')) as Post | null;
}

export async function listPostIndex(ns: KVNamespace): Promise<PostIndexEntry[]> {
  const raw = (await ns.get(kv.postsIndex, 'json')) as PostIndexEntry[] | null;
  return raw ?? [];
}

function toIndexEntry(p: Post): PostIndexEntry {
  return {
    slug: p.slug,
    title: p.title,
    type: p.type,
    excerpt: p.excerpt,
    publishedAt: p.publishedAt,
    tags: p.tags,
  };
}

export async function putPost(ns: KVNamespace, p: Post): Promise<void> {
  await ns.put(kv.post(p.slug), JSON.stringify(p));
  const index = await listPostIndex(ns);
  const filtered = index.filter((e) => e.slug !== p.slug);
  filtered.push(toIndexEntry(p));
  filtered.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  await ns.put(kv.postsIndex, JSON.stringify(filtered));
}

export async function removePost(ns: KVNamespace, slug: string): Promise<void> {
  await ns.delete(kv.post(slug));
  const index = await listPostIndex(ns);
  await ns.put(kv.postsIndex, JSON.stringify(index.filter((e) => e.slug !== slug)));
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/storage/posts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/storage/posts.ts api/test/case-study/storage/posts.test.ts
git commit -m "feat(case-study): add posts storage with index"
```

---

## Task 10: Dedup storage

**Files:**

- Create: `api/src/case-study/storage/dedup.ts`
- Create: `api/test/case-study/storage/dedup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/storage/dedup.test.ts
import { describe, it, expect } from 'vitest';
import { touchDedup, getDedup } from '../../../src/case-study/storage/dedup';

function mockKV() {
  const store = new Map<string, { value: string; ttl?: number }>();
  return {
    store,
    async get(key: string, type?: 'json') {
      const e = store.get(key);
      if (!e) return null;
      return type === 'json' ? JSON.parse(e.value) : e.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, { value, ttl: opts?.expirationTtl });
    },
  };
}

describe('dedup storage', () => {
  it('touchDedup writes with 90-day TTL', async () => {
    const ns = mockKV() as any;
    await touchDedup(ns, 'cve-2026-1234', new Date('2026-05-14T00:00:00Z'));
    const rec = await getDedup(ns, 'cve-2026-1234');
    expect(rec?.lastSeenAt).toBe('2026-05-14T00:00:00.000Z');
    expect(ns.store.get('meta:dedup:cve-2026-1234')?.ttl).toBe(90 * 24 * 3600);
  });

  it('touchDedup with publishedSlug retains it', async () => {
    const ns = mockKV() as any;
    await touchDedup(ns, 'cve-2026-1234', new Date(), 'cve-2026-1234-fortinet');
    const rec = await getDedup(ns, 'cve-2026-1234');
    expect(rec?.publishedSlug).toBe('cve-2026-1234-fortinet');
  });

  it('getDedup returns null for unknown key', async () => {
    const ns = mockKV() as any;
    expect(await getDedup(ns, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/storage/dedup.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/storage/dedup.ts
import type { KVNamespace } from '@cloudflare/workers-types';
import type { DedupRecord } from '../types';
import { kv } from '../kv-keys';

const NINETY_DAYS_SECONDS = 90 * 24 * 3600;

export async function touchDedup(
  ns: KVNamespace,
  stableKey: string,
  when: Date,
  publishedSlug?: string
): Promise<void> {
  const record: DedupRecord = {
    lastSeenAt: when.toISOString(),
    ...(publishedSlug ? { publishedSlug } : {}),
  };
  await ns.put(kv.dedup(stableKey), JSON.stringify(record), {
    expirationTtl: NINETY_DAYS_SECONDS,
  });
}

export async function getDedup(ns: KVNamespace, stableKey: string): Promise<DedupRecord | null> {
  return (await ns.get(kv.dedup(stableKey), 'json')) as DedupRecord | null;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/storage/dedup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/storage/dedup.ts api/test/case-study/storage/dedup.test.ts
git commit -m "feat(case-study): add dedup storage"
```

---

## Task 11: Failed records storage

**Files:**

- Create: `api/src/case-study/storage/failed.ts`
- Create: `api/test/case-study/storage/failed.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/storage/failed.test.ts
import { describe, it, expect } from 'vitest';
import { recordFailure, listFailures } from '../../../src/case-study/storage/failed';

function mockKV() {
  const store = new Map<string, { value: string; ttl?: number }>();
  return {
    store,
    async get(key: string, type?: 'json') {
      const e = store.get(key);
      if (!e) return null;
      return type === 'json' ? JSON.parse(e.value) : e.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, { value, ttl: opts?.expirationTtl });
    },
    async list(opts: { prefix: string }) {
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(opts.prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: '' };
    },
  };
}

describe('failed storage', () => {
  it('records a failure with 30-day TTL', async () => {
    const ns = mockKV() as any;
    await recordFailure(ns, {
      slotId: 'slot-2026-05-19',
      candidateId: 'cve-2026-1234',
      error: 'AI quota exceeded',
      failedAt: '2026-05-19T15:05:00Z',
      retries: 0,
    });
    expect(ns.store.get('failed:slot-2026-05-19')?.ttl).toBe(30 * 24 * 3600);
  });

  it('lists failures', async () => {
    const ns = mockKV() as any;
    await recordFailure(ns, { slotId: 'a', candidateId: 'x', error: 'e', failedAt: 't', retries: 0 });
    await recordFailure(ns, { slotId: 'b', candidateId: 'y', error: 'e', failedAt: 't', retries: 0 });
    expect(await listFailures(ns)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/storage/failed.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/storage/failed.ts
import type { KVNamespace } from '@cloudflare/workers-types';
import type { FailureRecord } from '../types';
import { kv } from '../kv-keys';

const THIRTY_DAYS_SECONDS = 30 * 24 * 3600;

export async function recordFailure(ns: KVNamespace, rec: FailureRecord): Promise<void> {
  await ns.put(kv.failed(rec.slotId), JSON.stringify(rec), {
    expirationTtl: THIRTY_DAYS_SECONDS,
  });
}

export async function listFailures(ns: KVNamespace): Promise<FailureRecord[]> {
  const { keys } = await ns.list({ prefix: 'failed:' });
  const results = await Promise.all(keys.map((k) => ns.get(k.name, 'json') as Promise<FailureRecord | null>));
  return results.filter((x): x is FailureRecord => x !== null);
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/storage/failed.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/storage/failed.ts api/test/case-study/storage/failed.test.ts
git commit -m "feat(case-study): add failed records storage"
```

---

## Task 12: CVE discovery adapter

**Files:**

- Create: `api/src/case-study/discovery/cve.ts`
- Create: `api/test/case-study/discovery/cve.test.ts`

KEV feed URL: `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`
NVD recent endpoint: `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=…&pubEndDate=…` (NVD requires User-Agent header; no API key needed for low-volume polling)

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/discovery/cve.test.ts
import { describe, it, expect, vi } from 'vitest';
import { discoverCves } from '../../../src/case-study/discovery/cve';

const fakeKev = {
  vulnerabilities: [
    {
      cveID: 'CVE-2026-1234',
      vendorProject: 'Fortinet',
      product: 'FortiGate',
      vulnerabilityName: 'Authentication Bypass',
      dateAdded: '2026-05-14',
      shortDescription: 'Auth bypass',
      knownRansomwareCampaignUse: 'Known',
    },
  ],
};

describe('discoverCves', () => {
  it('returns candidates from KEV with kev=true severity', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('cisa.gov')) return new Response(JSON.stringify(fakeKev));
      return new Response(JSON.stringify({ vulnerabilities: [] }));
    });
    const now = new Date('2026-05-14T06:00:00Z');
    const cands = await discoverCves({ fetch: fetchMock as any, now, getDedup: async () => null });
    expect(cands.length).toBeGreaterThan(0);
    const c = cands.find((x) => x.key === 'cve-2026-1234');
    expect(c).toBeDefined();
    expect(c!.type).toBe('cve');
    expect(c!.evidence.kev).toBe(true);
    expect(c!.score).toBeGreaterThan(0.6);
  });

  it('penalizes novelty if previously seen', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fakeKev)));
    const now = new Date('2026-05-14T06:00:00Z');
    const dedup = async (key: string) => ({ lastSeenAt: now.toISOString() });
    const cands = await discoverCves({ fetch: fetchMock as any, now, getDedup: dedup });
    expect(cands[0].score).toBeLessThan(0.6);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/discovery/cve.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/discovery/cve.ts
import type { Candidate, DedupRecord } from '../types';
import { cveKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string; // YYYY-MM-DD
  shortDescription: string;
  knownRansomwareCampaignUse?: string;
}

export interface DiscoverDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export async function discoverCves(deps: DiscoverDeps): Promise<Candidate[]> {
  const { fetch, now, getDedup } = deps;
  const candidates: Candidate[] = [];

  try {
    const r = await fetch(KEV_URL, { headers: { 'User-Agent': 'pranithjain.qzz.io case-study-discovery' } });
    if (!r.ok) throw new Error(`KEV fetch ${r.status}`);
    const data = (await r.json()) as { vulnerabilities: KevEntry[] };

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    for (const k of data.vulnerabilities) {
      const dateAdded = new Date(k.dateAdded + 'T00:00:00Z');
      if (dateAdded < fourteenDaysAgo) continue;

      const stable = cveKey(k.cveID);
      const dedup = await getDedup(stable);

      const evidence = {
        cveId: k.cveID,
        vendor: k.vendorProject,
        product: k.product,
        name: k.vulnerabilityName,
        description: k.shortDescription,
        kev: true,
        kevAddedAt: dateAdded.toISOString(),
        ransomwareUse: k.knownRansomwareCampaignUse === 'Known',
      };

      const score = finalScore({
        recency: recencyScore(dateAdded.toISOString(), now),
        severity: severityScore({ kev: true }),
        novelty: noveltyScore(dedup, now),
        sourceWeight: 1.0,
      });

      candidates.push({
        key: stable,
        type: 'cve',
        title: `${k.cveID} — ${k.vendorProject} ${k.product} ${k.vulnerabilityName}`,
        rationale: `Added to CISA KEV ${k.dateAdded}` + (evidence.ransomwareUse ? '; known ransomware use' : ''),
        score,
        evidence,
        discoveredAt: now.toISOString(),
        status: 'pending',
      });
    }
  } catch (err) {
    console.warn('discoverCves: KEV fetch failed', err);
  }

  // (NVD recent CVEs path can be added later if needed — KEV alone is enough signal for MVP.)
  return candidates;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/discovery/cve.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/discovery/cve.ts api/test/case-study/discovery/cve.test.ts
git commit -m "feat(case-study): add CVE discovery via CISA KEV"
```

---

## Task 13: Threat actor discovery adapter

**Files:**

- Create: `api/src/case-study/discovery/actor.ts`
- Create: `api/test/case-study/discovery/actor.test.ts`

Discovery strategy for MVP: scan the existing RSS feeds catalog in `src/data/` (vendor blogs from Mandiant / CrowdStrike / Microsoft / Talos) — these are already proxied via your Worker. Each feed item's title is scanned for known actor names (we maintain a small in-code lookup).

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/discovery/actor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { discoverActors } from '../../../src/case-study/discovery/actor';

const rssFixture = `<rss><channel>
  <item><title>FIN7 returns with new loader</title><link>https://example.com/fin7</link><pubDate>Wed, 14 May 2026 06:00:00 GMT</pubDate></item>
  <item><title>Generic security news</title><link>https://example.com/x</link><pubDate>Wed, 14 May 2026 06:00:00 GMT</pubDate></item>
</channel></rss>`;

describe('discoverActors', () => {
  it('extracts actor mentions from RSS', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(rssFixture, {
          headers: { 'content-type': 'application/rss+xml' },
        })
    );
    const cands = await discoverActors({
      fetch: fetchMock as any,
      now: new Date('2026-05-14T12:00:00Z'),
      getDedup: async () => null,
      feeds: ['https://feeds.example.com/mandiant.rss'],
    });
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0].key).toBe('actor-fin7');
    expect(cands[0].evidence.mentions).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/discovery/actor.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/discovery/actor.ts
import type { Candidate, DedupRecord } from '../types';
import { actorKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

// Curated, minimal set for MVP — extend later. Each entry: canonical display name.
const KNOWN_ACTORS = [
  'FIN7',
  'FIN8',
  'APT28',
  'APT29',
  'APT41',
  'Lazarus',
  'Sandworm',
  'Turla',
  'Volt Typhoon',
  'Salt Typhoon',
  'Scattered Spider',
  'UNC3886',
  'Mustang Panda',
  'Kimsuky',
  'Charming Kitten',
  'TA505',
  'TA577',
  'Cozy Bear',
  'Fancy Bear',
] as const;

const ITEM_RE = /<item[\s\S]*?<\/item>/g;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/;
const LINK_RE = /<link>([\s\S]*?)<\/link>/;
const PUB_RE = /<pubDate>([\s\S]*?)<\/pubDate>/;

export interface DiscoverActorsDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
  feeds: string[]; // RSS feed URLs
}

export async function discoverActors(deps: DiscoverActorsDeps): Promise<Candidate[]> {
  const mentions = new Map<string, { count: number; latest: Date; urls: string[]; titles: string[] }>();

  for (const feed of deps.feeds) {
    try {
      const r = await deps.fetch(feed);
      if (!r.ok) continue;
      const xml = await r.text();
      for (const item of xml.match(ITEM_RE) ?? []) {
        const title = (item.match(TITLE_RE)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        const link = (item.match(LINK_RE)?.[1] ?? '').trim();
        const pub = item.match(PUB_RE)?.[1];
        const pubDate = pub ? new Date(pub) : deps.now;
        for (const actor of KNOWN_ACTORS) {
          if (new RegExp(`\\b${actor}\\b`, 'i').test(title)) {
            const k = actorKey(actor);
            const e = mentions.get(k) ?? { count: 0, latest: new Date(0), urls: [], titles: [] };
            e.count += 1;
            if (pubDate > e.latest) e.latest = pubDate;
            e.urls.push(link);
            e.titles.push(title);
            mentions.set(k, e);
          }
        }
      }
    } catch (err) {
      console.warn(`discoverActors: feed failed ${feed}`, err);
    }
  }

  const out: Candidate[] = [];
  for (const [key, info] of mentions.entries()) {
    const dedup = await deps.getDedup(key);
    const score = finalScore({
      recency: recencyScore(info.latest.toISOString(), deps.now),
      severity: severityScore({ victims: info.count }),
      novelty: noveltyScore(dedup, deps.now),
      sourceWeight: 0.8,
    });
    const displayName = key.replace(/^actor-/, '').toUpperCase();
    out.push({
      key,
      type: 'actor',
      title: `${displayName} — recent activity`,
      rationale: `${info.count} mention(s) across vendor blogs in last 7 days`,
      score,
      evidence: { mentions: info.count, latest: info.latest.toISOString(), urls: info.urls, titles: info.titles },
      discoveredAt: deps.now.toISOString(),
      status: 'pending',
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/discovery/actor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/discovery/actor.ts api/test/case-study/discovery/actor.test.ts
git commit -m "feat(case-study): add threat actor discovery via vendor RSS feeds"
```

---

## Task 14: Malware discovery adapter

**Files:**

- Create: `api/src/case-study/discovery/malware.ts`
- Create: `api/test/case-study/discovery/malware.test.ts`

Source: abuse.ch URLhaus + MalwareBazaar — both have public JSON APIs that don't require auth for recent listings (`https://urlhaus-api.abuse.ch/v1/urls/recent/` and `https://mb-api.abuse.ch/api/v1/` with action `get_recent`). The project's existing one-shared-free-key infra (`ABUSE_CH_KEY`) is already wired — reuse it if needed.

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/discovery/malware.test.ts
import { describe, it, expect, vi } from 'vitest';
import { discoverMalware } from '../../../src/case-study/discovery/malware';

const fakeMb = {
  query_status: 'ok',
  data: [
    { signature: 'Lumma', sha256_hash: 'a'.repeat(64), first_seen: '2026-05-13 12:00:00', file_type: 'exe' },
    { signature: 'Lumma', sha256_hash: 'b'.repeat(64), first_seen: '2026-05-13 14:00:00', file_type: 'exe' },
    { signature: 'Emotet', sha256_hash: 'c'.repeat(64), first_seen: '2026-05-13 14:00:00', file_type: 'exe' },
  ],
};

describe('discoverMalware', () => {
  it('groups by family and counts samples', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fakeMb)));
    const cands = await discoverMalware({
      fetch: fetchMock as any,
      now: new Date('2026-05-14T06:00:00Z'),
      getDedup: async () => null,
      abuseChKey: 'fake-key',
    });
    const lumma = cands.find((c) => c.key === 'malware-lumma');
    expect(lumma).toBeDefined();
    expect(lumma!.evidence.sampleCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/discovery/malware.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/discovery/malware.ts
import type { Candidate, DedupRecord } from '../types';
import { malwareKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const MB_RECENT_URL = 'https://mb-api.abuse.ch/api/v1/';

interface MbSample {
  signature: string | null;
  sha256_hash: string;
  first_seen: string; // 'YYYY-MM-DD HH:MM:SS'
  file_type?: string;
}

export interface DiscoverMalwareDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
  abuseChKey: string;
}

export async function discoverMalware(deps: DiscoverMalwareDeps): Promise<Candidate[]> {
  const families = new Map<string, { count: number; latest: Date; hashes: string[] }>();

  try {
    const r = await deps.fetch(MB_RECENT_URL, {
      method: 'POST',
      headers: { 'Auth-Key': deps.abuseChKey, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'query=get_recent&selector=100',
    });
    if (!r.ok) throw new Error(`MB fetch ${r.status}`);
    const data = (await r.json()) as { data?: MbSample[] };

    for (const s of data.data ?? []) {
      if (!s.signature) continue;
      const k = malwareKey(s.signature);
      const seen = new Date(s.first_seen.replace(' ', 'T') + 'Z');
      const e = families.get(k) ?? { count: 0, latest: new Date(0), hashes: [] };
      e.count += 1;
      if (seen > e.latest) e.latest = seen;
      e.hashes.push(s.sha256_hash);
      families.set(k, e);
    }
  } catch (err) {
    console.warn('discoverMalware: MalwareBazaar fetch failed', err);
  }

  const out: Candidate[] = [];
  for (const [key, info] of families.entries()) {
    if (info.count < 2) continue; // require ≥2 samples for signal
    const dedup = await deps.getDedup(key);
    const score = finalScore({
      recency: recencyScore(info.latest.toISOString(), deps.now),
      severity: severityScore({ victims: info.count }),
      novelty: noveltyScore(dedup, deps.now),
      sourceWeight: 0.9,
    });
    const display = key.replace(/^malware-/, '');
    out.push({
      key,
      type: 'malware',
      title: `${display} — ${info.count} fresh samples on MalwareBazaar`,
      rationale: `${info.count} sample(s) first-seen in last 7 days`,
      score,
      evidence: {
        family: display,
        sampleCount: info.count,
        latest: info.latest.toISOString(),
        hashes: info.hashes.slice(0, 10),
      },
      discoveredAt: deps.now.toISOString(),
      status: 'pending',
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/discovery/malware.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/discovery/malware.ts api/test/case-study/discovery/malware.test.ts
git commit -m "feat(case-study): add malware discovery via MalwareBazaar"
```

---

## Task 15: Ransomware discovery adapter

**Files:**

- Create: `api/src/case-study/discovery/ransomware.ts`
- Create: `api/test/case-study/discovery/ransomware.test.ts`

Reuse the existing victim-releaks aggregation in `api/src/routes/victim-releaks.ts` and `api/src/routes/ransomware-recent.ts`. The discovery adapter calls the underlying data function (not the HTTP route) and groups victims by ransomware group.

- [ ] **Step 1: Read the existing ransomware route**

```bash
cat /Users/pranith/Documents/portfolio/api/src/routes/ransomware-recent.ts | head -50
```

Identify the underlying function that returns a list of `{ group, victim, postedAt, url }` entries. If the data fetch is inlined in the handler, refactor it: extract a `fetchRecentVictims(env): Promise<Victim[]>` function and export it. The adapter below will import that function. If no such function exists in a re-usable shape, the simplest path is to fetch the existing endpoint internally.

- [ ] **Step 2: Write the failing test**

```ts
// api/test/case-study/discovery/ransomware.test.ts
import { describe, it, expect } from 'vitest';
import { discoverRansomware } from '../../../src/case-study/discovery/ransomware';

describe('discoverRansomware', () => {
  it('groups victims by ransomware group and uses victim count as severity', async () => {
    const victims = [
      { group: 'Akira', victim: 'ACME', postedAt: '2026-05-13T00:00:00Z', url: 'http://x' },
      { group: 'Akira', victim: 'BCorp', postedAt: '2026-05-14T00:00:00Z', url: 'http://y' },
      { group: 'LockBit', victim: 'XCorp', postedAt: '2026-05-13T00:00:00Z', url: 'http://z' },
    ];
    const cands = await discoverRansomware({
      fetchVictims: async () => victims,
      now: new Date('2026-05-14T06:00:00Z'),
      getDedup: async () => null,
    });
    const akira = cands.find((c) => c.key.startsWith('ransom-akira'));
    expect(akira).toBeDefined();
    expect(akira!.evidence.victimCount).toBe(2);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
npx vitest run api/test/case-study/discovery/ransomware.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Write implementation**

```ts
// api/src/case-study/discovery/ransomware.ts
import type { Candidate, DedupRecord } from '../types';
import { ransomKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

export interface Victim {
  group: string;
  victim: string;
  postedAt: string; // ISO 8601
  url?: string;
}

export interface DiscoverRansomwareDeps {
  fetchVictims: () => Promise<Victim[]>;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export async function discoverRansomware(deps: DiscoverRansomwareDeps): Promise<Candidate[]> {
  let victims: Victim[] = [];
  try {
    victims = await deps.fetchVictims();
  } catch (err) {
    console.warn('discoverRansomware: fetchVictims failed', err);
    return [];
  }

  const sevenDaysAgo = new Date(deps.now.getTime() - 7 * 24 * 3600 * 1000);
  const groups = new Map<string, { victims: Victim[]; latest: Date }>();
  for (const v of victims) {
    const posted = new Date(v.postedAt);
    if (posted < sevenDaysAgo) continue;
    const k = ransomKey(v.group, deps.now);
    const e = groups.get(k) ?? { victims: [], latest: new Date(0) };
    e.victims.push(v);
    if (posted > e.latest) e.latest = posted;
    groups.set(k, e);
  }

  const out: Candidate[] = [];
  for (const [key, info] of groups.entries()) {
    const dedup = await deps.getDedup(key);
    const score = finalScore({
      recency: recencyScore(info.latest.toISOString(), deps.now),
      severity: severityScore({ victims: info.victims.length }),
      novelty: noveltyScore(dedup, deps.now),
      sourceWeight: 0.9,
    });
    const display = info.victims[0].group;
    out.push({
      key,
      type: 'ransom',
      title: `${display} — ${info.victims.length} new victims this week`,
      rationale: `${info.victims.length} victim post(s) on leak site in last 7 days`,
      score,
      evidence: {
        group: display,
        victimCount: info.victims.length,
        latest: info.latest.toISOString(),
        victims: info.victims.slice(0, 20),
      },
      discoveredAt: deps.now.toISOString(),
      status: 'pending',
    });
  }
  return out;
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run api/test/case-study/discovery/ransomware.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/case-study/discovery/ransomware.ts api/test/case-study/discovery/ransomware.test.ts
git commit -m "feat(case-study): add ransomware discovery from leak-site victims"
```

---

## Task 16: Discovery orchestrator

**Files:**

- Create: `api/src/case-study/discovery/index.ts`
- Create: `api/test/case-study/discovery/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/discovery/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runDiscovery } from '../../../src/case-study/discovery/index';
import type { Candidate } from '../../../src/case-study/types';

const sampleC = (key: string, type: any, score: number): Candidate => ({
  key,
  type,
  title: key,
  rationale: '',
  score,
  evidence: {},
  discoveredAt: '2026-05-14T06:00:00Z',
  status: 'pending',
});

describe('runDiscovery', () => {
  it('keeps top 5 by score across all types and writes them', async () => {
    const writes: Candidate[] = [];
    const env = {
      runners: {
        cve: async () => [sampleC('cve-1', 'cve', 0.9), sampleC('cve-2', 'cve', 0.4)],
        actor: async () => [sampleC('actor-1', 'actor', 0.8)],
        malware: async () => [sampleC('mal-1', 'malware', 0.7)],
        ransom: async () => [sampleC('ran-1', 'ransom', 0.6), sampleC('ran-2', 'ransom', 0.3)],
      },
      putCandidate: async (c: Candidate) => {
        writes.push(c);
      },
      touchDedup: async () => {},
      now: new Date('2026-05-14T06:00:00Z'),
      limit: 5,
    };
    const result = await runDiscovery(env as any);
    expect(result.kept).toBe(5);
    expect(writes.map((w) => w.key).sort()).toEqual(['actor-1', 'cve-1', 'cve-2', 'mal-1', 'ran-1'].sort());
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/discovery/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/discovery/index.ts
import type { Candidate } from '../types';

export interface RunDiscoveryDeps {
  runners: {
    cve: () => Promise<Candidate[]>;
    actor: () => Promise<Candidate[]>;
    malware: () => Promise<Candidate[]>;
    ransom: () => Promise<Candidate[]>;
  };
  putCandidate: (c: Candidate) => Promise<void>;
  touchDedup: (key: string, now: Date) => Promise<void>;
  now: Date;
  limit?: number;
}

export async function runDiscovery(deps: RunDiscoveryDeps): Promise<{ total: number; kept: number; ids: string[] }> {
  const limit = deps.limit ?? 5;
  const all: Candidate[] = [];

  for (const [name, runner] of Object.entries(deps.runners)) {
    try {
      const results = await runner();
      all.push(...results);
    } catch (err) {
      console.warn(`runDiscovery: ${name} runner failed`, err);
    }
  }

  all.sort((a, b) => b.score - a.score);
  const kept = all.slice(0, limit);

  for (const c of kept) {
    await deps.putCandidate(c);
    await deps.touchDedup(c.key, deps.now);
  }

  console.log(
    JSON.stringify({
      job: 'discovery',
      total: all.length,
      kept: kept.length,
      ids: kept.map((k) => k.key),
      ts: deps.now.toISOString(),
    })
  );

  return { total: all.length, kept: kept.length, ids: kept.map((c) => c.key) };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/discovery/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/discovery/index.ts api/test/case-study/discovery/index.test.ts
git commit -m "feat(case-study): add discovery orchestrator"
```

---

## Task 17: Type-specific generation templates

**Files:**

- Create: `api/src/case-study/generation/templates.ts`
- Create: `api/test/case-study/generation/templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/generation/templates.test.ts
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../../src/case-study/generation/templates';

describe('buildPrompt', () => {
  it('CVE prompt contains all required outline sections', () => {
    const { system, user } = buildPrompt({
      type: 'cve',
      title: 'CVE-2026-1234',
      facts: { cveId: 'CVE-2026-1234', vendor: 'Fortinet' },
    });
    expect(system).toMatch(/security analyst/i);
    expect(user).toContain('## Summary');
    expect(user).toContain('## Affected products');
    expect(user).toContain('## Exploitation in the wild');
    expect(user).toContain('## IOCs');
    expect(user).toContain('## References');
    expect(user).toContain('"cveId":"CVE-2026-1234"');
  });

  it('actor prompt has actor-specific outline', () => {
    const { user } = buildPrompt({ type: 'actor', title: 'FIN7', facts: {} });
    expect(user).toContain('## Origin');
    expect(user).toContain('## TTPs');
    expect(user).toContain('## Targeted sectors');
  });

  it('malware prompt has malware-specific outline', () => {
    const { user } = buildPrompt({ type: 'malware', title: 'Lumma', facts: {} });
    expect(user).toContain('## Capabilities');
    expect(user).toContain('## Infrastructure');
    expect(user).toContain('## Detection');
  });

  it('ransom prompt has ransomware-specific outline', () => {
    const { user } = buildPrompt({ type: 'ransom', title: 'Akira', facts: {} });
    expect(user).toContain('## Group profile');
    expect(user).toContain('## Recent victims');
    expect(user).toContain('## Defensive recommendations');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/generation/templates.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/generation/templates.ts
import type { CaseStudyType } from '../types';

const SYSTEM_PROMPT =
  `You are a security analyst writing a technical case study for Pranith Jain's blog. ` +
  `House style: factual, sourced, no hype, no "in today's threat landscape" filler. ` +
  `Output Markdown only. Do not include a preamble like "Here is the case study". ` +
  `Write 800-1200 words. Cite every claim using the FACTS block. ` +
  `If a section has no supporting facts, write "No public reporting yet." rather than fabricating.`;

const OUTLINES: Record<CaseStudyType, string[]> = {
  cve: [
    '## Summary',
    '## Affected products',
    '## How it works',
    '## Exploitation in the wild',
    '## Detection & mitigation',
    '## IOCs',
    '## References',
  ],
  actor: [
    '## Summary',
    '## Origin and attribution',
    '## Known campaigns',
    '## TTPs',
    '## Targeted sectors',
    '## Recent activity',
    '## Defensive guidance',
    '## References',
  ],
  malware: [
    '## Summary',
    '## Capabilities',
    '## Delivery',
    '## Infrastructure',
    '## IOCs',
    '## Detection',
    '## Related families',
    '## References',
  ],
  ransom: [
    '## Group profile',
    '## Recent victims',
    '## Negotiation tactics',
    '## TTPs',
    '## Defensive recommendations',
    '## References',
  ],
};

export interface BuildPromptInput {
  type: CaseStudyType;
  title: string;
  facts: Record<string, unknown>;
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const outline = OUTLINES[input.type].join('\n');
  const factsBlock = JSON.stringify(input.facts);
  const user =
    `TITLE: ${input.title}\n\n` +
    `FACTS (JSON — ground truth; do not invent beyond this):\n${factsBlock}\n\n` +
    `OUTLINE (use these section headings, in this order):\n${outline}\n\n` +
    `Now write the case study in Markdown.`;
  return { system: SYSTEM_PROMPT, user };
}

export function requiredSections(type: CaseStudyType): string[] {
  return OUTLINES[type];
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/generation/templates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/generation/templates.ts api/test/case-study/generation/templates.test.ts
git commit -m "feat(case-study): add type-specific prompt templates"
```

---

## Task 18: Workers AI client with fallback

**Files:**

- Create: `api/src/case-study/generation/ai-client.ts`
- Create: `api/test/case-study/generation/ai-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/generation/ai-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runCompletion } from '../../../src/case-study/generation/ai-client';

describe('runCompletion', () => {
  it('returns text from primary model on success', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'PRIMARY OK' })) };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' });
    expect(out.text).toBe('PRIMARY OK');
    expect(out.modelUsed).toContain('llama-3.3-70b');
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it('falls back to 8B model when primary throws', async () => {
    const ai = {
      run: vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce({ response: 'FALLBACK OK' }),
    };
    const out = await runCompletion(ai as any, { system: 's', user: 'u' });
    expect(out.text).toBe('FALLBACK OK');
    expect(out.modelUsed).toContain('llama-3.1-8b');
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it('throws when both models fail', async () => {
    const ai = { run: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(runCompletion(ai as any, { system: 's', user: 'u' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/generation/ai-client.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/generation/ai-client.ts
import type { Ai } from '@cloudflare/workers-types';

const PRIMARY = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK = '@cf/meta/llama-3.1-8b-instruct';

export interface CompletionInput {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionOutput {
  text: string;
  modelUsed: string;
}

async function runModel(ai: Ai, model: string, input: CompletionInput): Promise<string> {
  const res = (await ai.run(
    model as any,
    {
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_tokens: input.maxTokens ?? 3000,
      temperature: input.temperature ?? 0.4,
    } as any
  )) as { response?: string };
  if (!res || typeof res.response !== 'string' || !res.response.trim()) {
    throw new Error(`Empty response from ${model}`);
  }
  return res.response;
}

export async function runCompletion(ai: Ai, input: CompletionInput): Promise<CompletionOutput> {
  try {
    const text = await runModel(ai, PRIMARY, input);
    return { text, modelUsed: PRIMARY };
  } catch (err) {
    console.warn('runCompletion: primary failed, trying fallback', err);
    const text = await runModel(ai, FALLBACK, input);
    return { text, modelUsed: FALLBACK };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/generation/ai-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/generation/ai-client.ts api/test/case-study/generation/ai-client.test.ts
git commit -m "feat(case-study): add Workers AI client with fallback"
```

---

## Task 19: Post-process (validate, sanitize, IOC extract)

**Files:**

- Create: `api/src/case-study/generation/post-process.ts`
- Create: `api/test/case-study/generation/post-process.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/generation/post-process.test.ts
import { describe, it, expect } from 'vitest';
import { postProcess } from '../../../src/case-study/generation/post-process';

describe('postProcess', () => {
  it('strips preamble and validates required sections', () => {
    const raw = `Here is the case study:\n\n## Summary\n\nText.\n\n## Affected products\n\nText.\n\n## How it works\n\nText.\n\n## Exploitation in the wild\n\nText.\n\n## Detection & mitigation\n\nText.\n\n## IOCs\n\nNone yet.\n\n## References\n\n- https://example.com\n`;
    const out = postProcess({ type: 'cve', raw, factsText: '' });
    expect(out.ok).toBe(true);
    expect(out.body.startsWith('## Summary')).toBe(true);
    expect(out.body).not.toMatch(/Here is the case study/);
  });

  it('fails when a required section is missing', () => {
    const raw = `## Summary\n\nx\n\n## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: '' });
    expect(out.ok).toBe(false);
    expect(out.errors.join('|')).toMatch(/missing section/i);
  });

  it('extracts IOCs from the body', () => {
    const raw =
      `## Summary\n\nx\n\n## Affected products\n\nx\n\n## How it works\n\nx\n\n` +
      `## Exploitation in the wild\n\nC2 1.2.3.4 and badc2.example.com\n\n` +
      `## Detection & mitigation\n\nx\n\n` +
      `## IOCs\n\n- 1.2.3.4\n- abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890\n\n` +
      `## References\n\n- https://example.com\n`;
    const out = postProcess({
      type: 'cve',
      raw,
      factsText: '1.2.3.4 abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890 badc2.example.com',
    });
    expect(out.ok).toBe(true);
    const types = out.iocs.map((i) => i.type).sort();
    expect(types).toContain('ipv4');
    expect(types).toContain('sha256');
  });

  it('flags hallucinated CVE not present in facts', () => {
    const raw = `## Summary\n\nReferences CVE-9999-9999 not in facts.\n\n## Affected products\n\nx\n\n## How it works\n\nx\n\n## Exploitation in the wild\n\nx\n\n## Detection & mitigation\n\nx\n\n## IOCs\n\nNone.\n\n## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-1234 only' });
    expect(out.ok).toBe(false);
    expect(out.errors.join('|')).toMatch(/hallucinated cve/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/generation/post-process.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/generation/post-process.ts
import type { CaseStudyType, PostIOC } from '../types';
import { requiredSections } from './templates';

const PREAMBLE_RE = /^[\s\S]*?(?=##\s)/; // strip anything before first H2
const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/g;
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;
const SHA256_RE = /\b[a-f0-9]{64}\b/gi;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;

export interface PostProcessInput {
  type: CaseStudyType;
  raw: string;
  factsText: string; // stringified FACTS for hallucination checks
}

export interface PostProcessOutput {
  ok: boolean;
  body: string;
  iocs: PostIOC[];
  errors: string[];
}

export function postProcess(input: PostProcessInput): PostProcessOutput {
  const errors: string[] = [];

  // Strip preamble
  let body = input.raw.replace(PREAMBLE_RE, '').trim();
  if (!body.startsWith('##')) {
    errors.push('output did not contain any section headers');
    return { ok: false, body, iocs: [], errors };
  }

  // Verify all required sections present (case-insensitive header startsWith match)
  for (const section of requiredSections(input.type)) {
    const heading = section.replace(/^##\s*/, '').toLowerCase();
    const found = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im').test(body);
    if (!found) errors.push(`missing section: ${section}`);
  }

  // Hallucination check: every CVE mentioned in body must appear in factsText
  const lowerFacts = input.factsText.toLowerCase();
  for (const m of body.match(CVE_RE) ?? []) {
    if (!lowerFacts.includes(m.toLowerCase())) {
      errors.push(`hallucinated CVE not in facts: ${m}`);
    }
  }

  // Extract IOCs (dedup by value)
  const iocs: PostIOC[] = [];
  const seen = new Set<string>();
  const add = (type: PostIOC['type'], value: string) => {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    iocs.push({ type, value });
  };
  for (const m of body.match(IPV4_RE) ?? []) add('ipv4', m);
  for (const m of body.match(SHA256_RE) ?? []) add('sha256', m.toLowerCase());
  for (const m of body.match(DOMAIN_RE) ?? []) {
    // Heuristic: skip obvious non-IOCs like example.com and common doc domains
    if (/^(example\.|www\.example\.|cisa\.gov$|nvd\.nist\.gov$|github\.com$)/i.test(m)) continue;
    add('domain', m.toLowerCase());
  }

  return { ok: errors.length === 0, body, iocs, errors };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/generation/post-process.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/generation/post-process.ts api/test/case-study/generation/post-process.test.ts
git commit -m "feat(case-study): add post-processing with validation and IOC extraction"
```

---

## Task 20: Hero SVG generator

**Files:**

- Create: `api/src/case-study/generation/hero-svg.ts`
- Create: `api/test/case-study/generation/hero-svg.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/generation/hero-svg.test.ts
import { describe, it, expect } from 'vitest';
import { renderHeroSvg } from '../../../src/case-study/generation/hero-svg';

describe('renderHeroSvg', () => {
  it('returns a valid SVG containing the title and type chip', () => {
    const svg = renderHeroSvg({ title: 'CVE-2026-1234 — Fortinet', type: 'cve' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('CVE');
    expect(svg).toContain('CVE-2026-1234');
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
  });

  it('escapes XML special characters in titles', () => {
    const svg = renderHeroSvg({ title: 'Lumma & Co. <evil>', type: 'malware' });
    expect(svg).toContain('Lumma &amp; Co. &lt;evil&gt;');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/generation/hero-svg.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/generation/hero-svg.ts
import type { CaseStudyType } from '../types';

const TYPE_LABEL: Record<CaseStudyType, string> = {
  cve: 'CVE',
  actor: 'THREAT ACTOR',
  malware: 'MALWARE',
  ransom: 'RANSOMWARE',
};

const TYPE_HUE: Record<CaseStudyType, number> = {
  cve: 0, // red
  actor: 30, // orange
  malware: 280, // purple
  ransom: 200, // cyan
};

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function wrapTitle(title: string, max = 30): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3); // cap to 3 lines
}

export interface RenderHeroSvgInput {
  title: string;
  type: CaseStudyType;
}

export function renderHeroSvg({ title, type }: RenderHeroSvgInput): string {
  const hue = TYPE_HUE[type];
  const label = TYPE_LABEL[type];
  const lines = wrapTitle(title).map(xmlEscape);

  const titleLines = lines
    .map(
      (l, i) =>
        `<text x="80" y="${320 + i * 70}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="56" fill="#e8e8ea" font-weight="700">${l}</text>`
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="hex" width="20" height="34" patternUnits="userSpaceOnUse">
      <path d="M10 0 L20 5 L20 17 L10 22 L0 17 L0 5 Z" fill="none" stroke="hsl(${hue} 70% 18%)" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="#0a0a0c"/>
  <rect width="1200" height="630" fill="url(#hex)"/>
  <rect x="80" y="80" width="170" height="44" rx="6" fill="hsl(${hue} 70% 45%)"/>
  <text x="100" y="110" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="20" fill="#0a0a0c" font-weight="700">${label}</text>
  ${titleLines}
  <text x="80" y="560" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="18" fill="#666">pranithjain.qzz.io / blog</text>
</svg>`;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/generation/hero-svg.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/generation/hero-svg.ts api/test/case-study/generation/hero-svg.test.ts
git commit -m "feat(case-study): add procedural SVG hero banner generator"
```

---

## Task 21: Generation orchestrator

**Files:**

- Create: `api/src/case-study/generation/index.ts`
- Create: `api/test/case-study/generation/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/generation/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generatePost } from '../../../src/case-study/generation/index';
import type { Candidate } from '../../../src/case-study/types';

const candidate: Candidate = {
  key: 'cve-2026-1234',
  type: 'cve',
  title: 'CVE-2026-1234 — Fortinet FortiGate Auth Bypass',
  rationale: 'KEV',
  score: 0.9,
  evidence: { cveId: 'CVE-2026-1234', vendor: 'Fortinet', product: 'FortiGate', kev: true },
  discoveredAt: '2026-05-14T06:00:00Z',
  status: 'approved',
};

const goodMd = [
  '## Summary',
  'CVE-2026-1234 affects Fortinet FortiGate.',
  '## Affected products',
  'FortiGate < 7.4.5',
  '## How it works',
  'Auth bypass.',
  '## Exploitation in the wild',
  'In KEV.',
  '## Detection & mitigation',
  'Patch.',
  '## IOCs',
  'None public.',
  '## References',
  '- https://www.cisa.gov/known-exploited-vulnerabilities',
].join('\n\n');

describe('generatePost', () => {
  it('produces a complete Post for an approved candidate', async () => {
    const ai = { run: vi.fn(async () => ({ response: goodMd })) };
    const post = await generatePost({
      candidate,
      ai: ai as any,
      now: new Date('2026-05-19T15:05:00Z'),
    });
    expect(post.slug).toMatch(/^cve-2026-1234/);
    expect(post.type).toBe('cve');
    expect(post.publishedAt).toBe('2026-05-19T15:05:00.000Z');
    expect(post.body).toContain('## Summary');
    expect(post.hero).toContain('<svg');
    expect(post.excerpt.length).toBeGreaterThan(0);
    expect(post.candidateId).toBe('cve-2026-1234');
  });

  it('throws if post-processing rejects the output', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'Garbage with no sections.' })) };
    await expect(generatePost({ candidate, ai: ai as any, now: new Date() })).rejects.toThrow(/validation failed/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/generation/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/generation/index.ts
import type { Ai } from '@cloudflare/workers-types';
import type { Candidate, Post } from '../types';
import { buildPrompt } from './templates';
import { runCompletion } from './ai-client';
import { postProcess } from './post-process';
import { renderHeroSvg } from './hero-svg';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function excerptFrom(body: string, max = 200): string {
  const stripped = body
    .replace(/^##.*$/gm, '')
    .replace(/[`*_>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length <= max ? stripped : stripped.slice(0, max - 1) + '…';
}

function tagsFor(c: Candidate): string[] {
  const t = [c.type];
  const ev = c.evidence as any;
  if (ev?.vendor) t.push(slugify(String(ev.vendor)));
  if (ev?.product) t.push(slugify(String(ev.product)));
  if (ev?.family) t.push(slugify(String(ev.family)));
  if (ev?.group) t.push(slugify(String(ev.group)));
  return Array.from(new Set(t)).filter(Boolean);
}

export interface GeneratePostDeps {
  candidate: Candidate;
  ai: Ai;
  now: Date;
}

export async function generatePost(deps: GeneratePostDeps): Promise<Post> {
  const { candidate, ai, now } = deps;

  const { system, user } = buildPrompt({
    type: candidate.type,
    title: candidate.title,
    facts: candidate.evidence,
  });

  const completion = await runCompletion(ai, { system, user });

  const factsText = JSON.stringify(candidate.evidence);
  const processed = postProcess({ type: candidate.type, raw: completion.text, factsText });
  if (!processed.ok) {
    throw new Error(`validation failed: ${processed.errors.join('; ')}`);
  }

  const slug = `${candidate.key}-${slugify(candidate.title).slice(0, 40)}`.replace(/-+/g, '-');
  const hero = renderHeroSvg({ title: candidate.title, type: candidate.type });

  return {
    slug,
    type: candidate.type,
    title: candidate.title,
    excerpt: excerptFrom(processed.body),
    publishedAt: now.toISOString(),
    candidateId: candidate.key,
    body: processed.body,
    hero,
    iocs: processed.iocs,
    tags: tagsFor(candidate),
    sources: [], // populated from evidence.urls if present in future
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/generation/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/generation/index.ts api/test/case-study/generation/index.test.ts
git commit -m "feat(case-study): add generation orchestrator"
```

---

## Task 22: Schedule planner

**Files:**

- Create: `api/src/case-study/publishing/planner.ts`
- Create: `api/test/case-study/publishing/planner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/publishing/planner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runPlanner } from '../../../src/case-study/publishing/planner';
import type { Candidate } from '../../../src/case-study/types';

const c = (key: string): Candidate => ({
  key,
  type: 'cve',
  title: key,
  rationale: '',
  score: 0.9,
  evidence: {},
  discoveredAt: '',
  status: 'approved',
});

describe('runPlanner', () => {
  it('plans 2-3 slots in the upcoming week', async () => {
    let written: any[] = [];
    await runPlanner({
      listApproved: async () => [c('a'), c('b'), c('c'), c('d')],
      setSchedule: async (slots) => {
        written = slots;
      },
      now: new Date('2026-05-17T23:00:00Z'), // Sunday
      random: () => 0.5, // deterministic
    });
    expect(written.length).toBeGreaterThanOrEqual(2);
    expect(written.length).toBeLessThanOrEqual(3);
    for (const slot of written) {
      const t = new Date(slot.slotAt);
      expect(t.getTime()).toBeGreaterThan(Date.UTC(2026, 4, 17, 23));
      expect(t.getTime()).toBeLessThan(Date.UTC(2026, 4, 24, 23));
    }
  });

  it('produces empty schedule when no approved items', async () => {
    let written: any[] | null = null;
    await runPlanner({
      listApproved: async () => [],
      setSchedule: async (slots) => {
        written = slots;
      },
      now: new Date(),
      random: Math.random,
    });
    expect(written).toEqual([]);
  });

  it('does not exceed approved-queue length', async () => {
    let written: any[] = [];
    await runPlanner({
      listApproved: async () => [c('only-one')],
      setSchedule: async (slots) => {
        written = slots;
      },
      now: new Date('2026-05-17T23:00:00Z'),
      random: () => 0.5,
    });
    expect(written.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/publishing/planner.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/publishing/planner.ts
import type { Candidate, Slot } from '../types';

export interface RunPlannerDeps {
  listApproved: () => Promise<Candidate[]>;
  setSchedule: (slots: Slot[]) => Promise<void>;
  now: Date; // expected to be ~Sunday late UTC
  random: () => number; // injectable for tests; default Math.random
}

// Weighted weekday picking (1=Mon..0=Sun); Tue/Wed/Thu weighted highest.
const WEEKDAY_WEIGHTS: Array<{ dayOffset: number; weight: number }> = [
  { dayOffset: 1, weight: 2 }, // Mon
  { dayOffset: 2, weight: 4 }, // Tue
  { dayOffset: 3, weight: 4 }, // Wed
  { dayOffset: 4, weight: 4 }, // Thu
  { dayOffset: 5, weight: 2 }, // Fri
  { dayOffset: 6, weight: 1 }, // Sat
  { dayOffset: 7, weight: 1 }, // Sun (next)
];

function pickWeightedDistinct(rand: () => number, n: number): number[] {
  const pool = [...WEEKDAY_WEIGHTS];
  const picked: number[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const totalWeight = pool.reduce((s, x) => s + x.weight, 0);
    let r = rand() * totalWeight;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    picked.push(pool[idx].dayOffset);
    pool.splice(idx, 1);
  }
  return picked.sort((a, b) => a - b);
}

export async function runPlanner(deps: RunPlannerDeps): Promise<{ scheduled: number }> {
  const approved = await deps.listApproved();
  if (approved.length === 0) {
    await deps.setSchedule([]);
    console.log(JSON.stringify({ job: 'planner', scheduled: 0, ts: deps.now.toISOString() }));
    return { scheduled: 0 };
  }

  // Target N = randInt(2,3), capped at approved.length
  const targetN = Math.min(approved.length, 2 + Math.floor(deps.random() * 2));
  const dayOffsets = pickWeightedDistinct(deps.random, targetN);
  const baseDay = new Date(
    Date.UTC(deps.now.getUTCFullYear(), deps.now.getUTCMonth(), deps.now.getUTCDate(), 0, 0, 0, 0)
  );

  const fifo = approved.slice(0, targetN);
  const slots: Slot[] = dayOffsets.map((off, i) => {
    const hour = 9 + Math.floor(deps.random() * 9); // 9..17 inclusive
    const minute = Math.floor(deps.random() * 60);
    const t = new Date(baseDay.getTime() + off * 24 * 3600 * 1000);
    t.setUTCHours(hour, minute, 0, 0);
    return { slotAt: t.toISOString(), candidateId: fifo[i].key, status: 'pending' };
  });

  await deps.setSchedule(slots);
  console.log(
    JSON.stringify({
      job: 'planner',
      scheduled: slots.length,
      ids: slots.map((s) => s.candidateId),
      ts: deps.now.toISOString(),
    })
  );
  return { scheduled: slots.length };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/publishing/planner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/publishing/planner.ts api/test/case-study/publishing/planner.test.ts
git commit -m "feat(case-study): add schedule planner"
```

---

## Task 23: Publisher

**Files:**

- Create: `api/src/case-study/publishing/publisher.ts`
- Create: `api/test/case-study/publishing/publisher.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/publishing/publisher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runPublisher } from '../../../src/case-study/publishing/publisher';
import type { Candidate, Post, Slot } from '../../../src/case-study/types';

const cand: Candidate = {
  key: 'cve-2026-1234',
  type: 'cve',
  title: 'X',
  rationale: '',
  score: 0.9,
  evidence: {},
  discoveredAt: '',
  status: 'approved',
};
const fakePost: Post = {
  slug: 'cve-2026-1234-x',
  type: 'cve',
  title: 'X',
  excerpt: 'e',
  publishedAt: '2026-05-19T15:05:00Z',
  candidateId: cand.key,
  body: '## Summary\n\nx',
  hero: '<svg/>',
  iocs: [],
  tags: [],
  sources: [],
};

function deps(overrides: Partial<Parameters<typeof runPublisher>[0]> = {}) {
  const slots: Slot[] = [{ slotAt: '2026-05-19T14:00:00Z', candidateId: cand.key, status: 'pending' }];
  return {
    pickDueSlot: vi.fn(async () => slots.find((s) => s.status === 'pending') ?? null),
    markSlotStatus: vi.fn(async (cid: string, status: Slot['status'], extras?: any) => {
      const i = slots.findIndex((s) => s.candidateId === cid);
      slots[i] = { ...slots[i], status, ...extras };
    }),
    getApproved: vi.fn(async (k: string) => (k === cand.key ? cand : null)),
    unapprove: vi.fn(async () => {}),
    generatePost: vi.fn(async () => fakePost),
    putPost: vi.fn(async () => {}),
    refreshRss: vi.fn(async () => {}),
    touchDedup: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => {}),
    now: new Date('2026-05-19T15:05:00Z'),
    ...overrides,
  };
}

describe('runPublisher', () => {
  it('publishes a due slot end-to-end', async () => {
    const d = deps();
    const result = await runPublisher(d as any);
    expect(result.published).toBe(1);
    expect(d.generatePost).toHaveBeenCalled();
    expect(d.putPost).toHaveBeenCalledWith(fakePost);
    expect(d.refreshRss).toHaveBeenCalled();
    expect(d.unapprove).toHaveBeenCalledWith(cand.key);
    expect(d.markSlotStatus).toHaveBeenCalledWith(cand.key, 'published', { publishedSlug: fakePost.slug });
    expect(d.touchDedup).toHaveBeenCalledWith(cand.key, expect.any(Date), fakePost.slug);
  });

  it('does nothing when no slot is due', async () => {
    const d = deps({ pickDueSlot: vi.fn(async () => null) });
    const result = await runPublisher(d as any);
    expect(result.published).toBe(0);
    expect(d.generatePost).not.toHaveBeenCalled();
  });

  it('records failure when generation throws', async () => {
    const d = deps({
      generatePost: vi.fn(async () => {
        throw new Error('AI down');
      }),
    });
    const result = await runPublisher(d as any);
    expect(result.published).toBe(0);
    expect(d.recordFailure).toHaveBeenCalled();
    expect(d.markSlotStatus).toHaveBeenCalledWith(cand.key, 'failed', expect.any(Object));
  });

  it('skips when approved candidate is missing', async () => {
    const d = deps({ getApproved: vi.fn(async () => null) });
    const result = await runPublisher(d as any);
    expect(result.published).toBe(0);
    expect(d.markSlotStatus).toHaveBeenCalledWith(cand.key, 'failed', expect.any(Object));
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/publishing/publisher.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/publishing/publisher.ts
import type { Candidate, Post, Slot } from '../types';
import { slotIdFor } from '../stable-keys';

export interface RunPublisherDeps {
  pickDueSlot: (now: Date) => Promise<Slot | null>;
  markSlotStatus: (candidateId: string, status: Slot['status'], extras?: Partial<Slot>) => Promise<void>;
  getApproved: (stableKey: string) => Promise<Candidate | null>;
  unapprove: (stableKey: string) => Promise<void>;
  generatePost: (candidate: Candidate, now: Date) => Promise<Post>;
  putPost: (post: Post) => Promise<void>;
  refreshRss: () => Promise<void>;
  touchDedup: (stableKey: string, when: Date, publishedSlug: string) => Promise<void>;
  recordFailure: (rec: {
    slotId: string;
    candidateId: string;
    error: string;
    rawOutput?: string;
    failedAt: string;
    retries: number;
  }) => Promise<void>;
  now: Date;
}

export async function runPublisher(deps: RunPublisherDeps): Promise<{ published: number; slug?: string }> {
  const slot = await deps.pickDueSlot(deps.now);
  if (!slot) {
    console.log(JSON.stringify({ job: 'publisher', published: 0, reason: 'no-due-slot', ts: deps.now.toISOString() }));
    return { published: 0 };
  }

  await deps.markSlotStatus(slot.candidateId, 'publishing');

  const candidate = await deps.getApproved(slot.candidateId);
  if (!candidate) {
    await deps.markSlotStatus(slot.candidateId, 'failed', { error: 'approved candidate missing' });
    await deps.recordFailure({
      slotId: slotIdFor(slot.slotAt),
      candidateId: slot.candidateId,
      error: 'approved candidate missing',
      failedAt: deps.now.toISOString(),
      retries: 0,
    });
    return { published: 0 };
  }

  try {
    const post = await deps.generatePost(candidate, deps.now);
    await deps.putPost(post);
    await deps.refreshRss();
    await deps.unapprove(candidate.key);
    await deps.touchDedup(candidate.key, deps.now, post.slug);
    await deps.markSlotStatus(slot.candidateId, 'published', { publishedSlug: post.slug });

    console.log(
      JSON.stringify({
        job: 'publisher',
        published: 1,
        slug: post.slug,
        candidateId: candidate.key,
        ts: deps.now.toISOString(),
      })
    );
    return { published: 1, slug: post.slug };
  } catch (err: any) {
    await deps.markSlotStatus(slot.candidateId, 'failed', { error: String(err?.message ?? err) });
    await deps.recordFailure({
      slotId: slotIdFor(slot.slotAt),
      candidateId: slot.candidateId,
      error: String(err?.message ?? err),
      failedAt: deps.now.toISOString(),
      retries: 0,
    });
    console.warn('publisher failed', err);
    return { published: 0 };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/publishing/publisher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/publishing/publisher.ts api/test/case-study/publishing/publisher.test.ts
git commit -m "feat(case-study): add publisher with failure handling"
```

---

## Task 24: Markdown rendering with IOC auto-link

**Files:**

- Create: `api/src/case-study/rendering/markdown.ts`
- Create: `api/test/case-study/rendering/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/rendering/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../../src/case-study/rendering/markdown';

describe('renderMarkdown', () => {
  it('converts markdown to HTML', () => {
    const html = renderMarkdown('## Summary\n\nHello.');
    expect(html).toContain('<h2');
    expect(html).toContain('Summary');
    expect(html).toContain('Hello.');
  });

  it('auto-links IPv4 addresses to the IOC checker', () => {
    const html = renderMarkdown('Found at 1.2.3.4 in logs.');
    expect(html).toContain('/dfir/ioc-check?q=1.2.3.4');
  });

  it('auto-links sha256 hashes', () => {
    const sha = 'a'.repeat(64);
    const html = renderMarkdown(`Hash: ${sha}`);
    expect(html).toContain(`/dfir/ioc-check?q=${sha}`);
  });

  it('does not modify text inside code spans', () => {
    const html = renderMarkdown('`1.2.3.4` should stay as code.');
    expect(html).not.toContain('/dfir/ioc-check?q=1.2.3.4');
  });

  it('sanitizes inline scripts', () => {
    const html = renderMarkdown('<script>alert(1)</script> and **bold**');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<strong>');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/rendering/markdown.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/rendering/markdown.ts
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;
const SHA256 = /\b[a-f0-9]{64}\b/gi;
const SHA1 = /\b[a-f0-9]{40}\b/gi;
const MD5 = /\b[a-f0-9]{32}\b/gi;

function linkify(html: string): string {
  // Skip <code>...</code> regions
  const parts = html.split(/(<code[^>]*>[\s\S]*?<\/code>)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // odd indexes are code blocks
      return part
        .replace(SHA256, (m) => `<a class="ioc-link" href="/dfir/ioc-check?q=${m}">${m}</a>`)
        .replace(SHA1, (m) => `<a class="ioc-link" href="/dfir/ioc-check?q=${m}">${m}</a>`)
        .replace(MD5, (m) => `<a class="ioc-link" href="/dfir/ioc-check?q=${m}">${m}</a>`)
        .replace(IPV4, (m) => `<a class="ioc-link" href="/dfir/ioc-check?q=${m}">${m}</a>`);
    })
    .join('');
}

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  const linked = linkify(html);
  return DOMPurify.sanitize(linked, {
    ADD_ATTR: ['class'],
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/rendering/markdown.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/rendering/markdown.ts api/test/case-study/rendering/markdown.test.ts
git commit -m "feat(case-study): add markdown renderer with IOC auto-linking"
```

---

## Task 25: RSS rendering

**Files:**

- Create: `api/src/case-study/rendering/rss.ts`
- Create: `api/test/case-study/rendering/rss.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/case-study/rendering/rss.test.ts
import { describe, it, expect } from 'vitest';
import { renderRss } from '../../../src/case-study/rendering/rss';
import type { Post } from '../../../src/case-study/types';

const post: Post = {
  slug: 'cve-2026-1234',
  type: 'cve',
  title: 'CVE-2026-1234',
  excerpt: 'Auth bypass.',
  publishedAt: '2026-05-19T15:05:00Z',
  candidateId: 'cve-2026-1234',
  body: '## Summary\n\nx',
  hero: '<svg/>',
  iocs: [],
  tags: ['cve'],
  sources: [],
};

describe('renderRss', () => {
  it('emits valid RSS 2.0 with one item', () => {
    const xml = renderRss([post], { siteUrl: 'https://pranithjain.qzz.io' });
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>CVE-2026-1234</title>');
    expect(xml).toContain('https://pranithjain.qzz.io/blog/cve-2026-1234');
    expect(xml).toContain('<pubDate>');
  });

  it('escapes XML entities in title', () => {
    const html = renderRss([{ ...post, title: 'X & Y < Z' }], { siteUrl: 'https://x' });
    expect(html).toContain('X &amp; Y &lt; Z');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/case-study/rendering/rss.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/rendering/rss.ts
import type { Post } from '../types';

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

export interface RenderRssInput {
  siteUrl: string;
}

export function renderRss(posts: Post[], { siteUrl }: RenderRssInput): string {
  const items = posts
    .map((p) => {
      const url = `${siteUrl}/blog/${p.slug}`;
      const pub = new Date(p.publishedAt).toUTCString();
      return `<item>
      <title>${xmlEscape(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pub}</pubDate>
      <category>${xmlEscape(p.type)}</category>
      <description>${xmlEscape(p.excerpt)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Pranith Jain — Case Studies</title>
<link>${siteUrl}/blog</link>
<description>Cybersecurity case studies — CVEs, threat actors, malware, ransomware.</description>
<language>en</language>
${items}
</channel>
</rss>`;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run api/test/case-study/rendering/rss.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/case-study/rendering/rss.ts api/test/case-study/rendering/rss.test.ts
git commit -m "feat(case-study): add RSS renderer"
```

---

## Task 26: Public blog routes

**Files:**

- Create: `api/src/routes/blog-public.ts`
- Create: `api/test/routes/blog-public.test.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/routes/blog-public.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { registerBlogRoutes } from '../../src/routes/blog-public';
import type { Post, PostIndexEntry } from '../../src/case-study/types';

function makeKV(records: Record<string, unknown>): any {
  return {
    async get(key: string, type?: 'json') {
      const v = records[key];
      if (v === undefined) return null;
      return type === 'json' ? v : JSON.stringify(v);
    },
  };
}

const post: Post = {
  slug: 'cve-2026-1234',
  type: 'cve',
  title: 'CVE-2026-1234',
  excerpt: 'X',
  publishedAt: '2026-05-19T15:05:00Z',
  candidateId: 'cve-2026-1234',
  body: '## Summary\n\nText.',
  hero: '<svg/>',
  iocs: [],
  tags: ['cve'],
  sources: [],
};

const index: PostIndexEntry[] = [
  { slug: post.slug, title: post.title, type: 'cve', excerpt: 'X', publishedAt: post.publishedAt, tags: ['cve'] },
];

function setup(records: Record<string, unknown>) {
  const app = new Hono<{ Bindings: { CASE_STUDIES: any } }>();
  registerBlogRoutes(app);
  return { app, env: { CASE_STUDIES: makeKV(records) } };
}

describe('blog public routes', () => {
  it('GET /api/v1/blog/posts returns index JSON', async () => {
    const { app, env } = setup({ 'posts:index': index });
    const r = await app.request('/api/v1/blog/posts', {}, env as any);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.posts).toHaveLength(1);
  });

  it('GET /api/v1/blog/posts/:slug returns the post', async () => {
    const { app, env } = setup({ [`posts:${post.slug}`]: post });
    const r = await app.request(`/api/v1/blog/posts/${post.slug}`, {}, env as any);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.post.slug).toBe(post.slug);
  });

  it('GET /api/v1/blog/posts/:slug returns 404 for missing post', async () => {
    const { app, env } = setup({});
    const r = await app.request('/api/v1/blog/posts/missing', {}, env as any);
    expect(r.status).toBe(404);
  });

  it('GET /blog/rss.xml returns pre-rendered RSS', async () => {
    const { app, env } = setup({ 'meta:rss': '<?xml version="1.0"?><rss/>' });
    const r = await app.request('/blog/rss.xml', {}, env as any);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('xml');
    expect(await r.text()).toContain('<rss');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/routes/blog-public.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/routes/blog-public.ts
import type { Hono } from 'hono';
import type { Env } from '../env';
import type { Post, PostIndexEntry } from '../case-study/types';
import { kv } from '../case-study/kv-keys';

export function registerBlogRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get('/api/v1/blog/posts', async (c) => {
    const index = ((await c.env.CASE_STUDIES.get(kv.postsIndex, 'json')) as PostIndexEntry[]) ?? [];
    const type = c.req.query('type');
    const tag = c.req.query('tag');
    let filtered = index;
    if (type) filtered = filtered.filter((p) => p.type === type);
    if (tag) filtered = filtered.filter((p) => p.tags.includes(tag));
    return c.json({ posts: filtered });
  });

  app.get('/api/v1/blog/posts/:slug', async (c) => {
    const slug = c.req.param('slug');
    const post = (await c.env.CASE_STUDIES.get(kv.post(slug), 'json')) as Post | null;
    if (!post) return c.json({ error: 'not found' }, 404);
    return c.json({ post });
  });

  app.get('/blog/rss.xml', async (c) => {
    const rss =
      (await c.env.CASE_STUDIES.get(kv.metaRss)) ??
      '<?xml version="1.0"?><rss version="2.0"><channel><title>Pranith Jain — Case Studies</title></channel></rss>';
    return new Response(rss, {
      headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  });
}
```

- [ ] **Step 4: Register routes in `api/src/index.ts`**

Open `api/src/index.ts` and add near the other route imports/registrations:

```ts
import { registerBlogRoutes } from './routes/blog-public';
// ... after Hono app is created and other handlers registered:
registerBlogRoutes(app);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run api/test/routes/blog-public.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/blog-public.ts api/test/routes/blog-public.test.ts api/src/index.ts
git commit -m "feat(case-study): add public blog API routes"
```

---

## Task 27: Admin auth middleware + token-gated routes

**Files:**

- Create: `api/src/case-study/auth.ts`
- Create: `api/src/routes/case-study-admin.ts`
- Create: `api/test/routes/case-study-admin.test.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/routes/case-study-admin.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { registerAdminRoutes } from '../../src/routes/case-study-admin';
import type { Candidate } from '../../src/case-study/types';

function mockEnv(): any {
  const store = new Map<string, string>();
  const kv = {
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
    async list(opts: { prefix: string }) {
      return {
        keys: Array.from(store.keys())
          .filter((k) => k.startsWith(opts.prefix))
          .map((name) => ({ name })),
        list_complete: true,
        cursor: '',
      };
    },
  };
  return { CASE_STUDIES: kv, ADMIN_TOKEN: 'sekret', __store: store };
}

function app() {
  const a = new Hono<any>();
  registerAdminRoutes(a);
  return a;
}

const cand: Candidate = {
  key: 'cve-2026-1234',
  type: 'cve',
  title: 'X',
  rationale: 'r',
  score: 0.9,
  evidence: {},
  discoveredAt: '2026-05-14T06:00:00Z',
  status: 'pending',
};

describe('admin routes', () => {
  it('rejects requests without token', async () => {
    const r = await app().request('/api/v1/admin/candidates', {}, mockEnv());
    expect(r.status).toBe(401);
  });

  it('accepts requests with token via header', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      '/api/v1/admin/candidates',
      {
        headers: { 'X-Admin-Token': 'sekret' },
      },
      env
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.pending).toHaveLength(1);
  });

  it('approve moves candidate from pending to approved', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      `/api/v1/admin/candidates/${cand.key}/approve`,
      {
        method: 'POST',
        headers: { 'X-Admin-Token': 'sekret' },
      },
      env
    );
    expect(r.status).toBe(200);
    expect(env.__store.has(`approved:${cand.key}`)).toBe(true);
  });

  it('skip removes a candidate', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      `/api/v1/admin/candidates/${cand.key}/skip?type=cve`,
      {
        method: 'POST',
        headers: { 'X-Admin-Token': 'sekret' },
      },
      env
    );
    expect(r.status).toBe(200);
    expect(env.__store.has(`candidates:cve:${cand.key}`)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run api/test/routes/case-study-admin.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// api/src/case-study/auth.ts
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';

export const requireAdminToken: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = c.req.header('x-admin-token') ?? c.req.query('t');
  if (!token || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
};
```

```ts
// api/src/routes/case-study-admin.ts
import { Hono } from 'hono';
import type { Env } from '../env';
import type { Candidate, CaseStudyType } from '../case-study/types';
import { requireAdminToken } from '../case-study/auth';
import { listCandidates, getCandidate, deleteCandidate } from '../case-study/storage/candidates';
import { approve, unapprove, listApproved } from '../case-study/storage/approved';
import { getSchedule } from '../case-study/storage/schedule';
import { listPostIndex, removePost } from '../case-study/storage/posts';
import { listFailures } from '../case-study/storage/failed';

const TYPES: CaseStudyType[] = ['cve', 'actor', 'malware', 'ransom'];

export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
  // Sub-app pattern: middleware applies only to /api/v1/admin/*, not globally.
  const admin = new Hono<{ Bindings: Env }>();
  admin.use('*', requireAdminToken);

  admin.get('/candidates', async (c) => {
    const all: Candidate[] = [];
    for (const t of TYPES) all.push(...(await listCandidates(c.env.CASE_STUDIES, t)));
    all.sort((a, b) => b.score - a.score);
    return c.json({ pending: all });
  });

  admin.post('/candidates/:id/approve', async (c) => {
    const id = c.req.param('id');
    let found: Candidate | null = null;
    let foundType: CaseStudyType | null = null;
    for (const t of TYPES) {
      const cand = await getCandidate(c.env.CASE_STUDIES, t, id);
      if (cand) {
        found = cand;
        foundType = t;
        break;
      }
    }
    if (!found || !foundType) return c.json({ error: 'not found' }, 404);
    await approve(c.env.CASE_STUDIES, found);
    await deleteCandidate(c.env.CASE_STUDIES, foundType, id);
    return c.json({ ok: true, approved: id });
  });

  admin.post('/candidates/:id/skip', async (c) => {
    const id = c.req.param('id');
    const type = (c.req.query('type') ?? '') as CaseStudyType;
    if (!TYPES.includes(type)) return c.json({ error: 'type required' }, 400);
    await deleteCandidate(c.env.CASE_STUDIES, type, id);
    return c.json({ ok: true });
  });

  admin.get('/approved', async (c) => {
    return c.json({ approved: await listApproved(c.env.CASE_STUDIES) });
  });

  admin.post('/approved/:id/unapprove', async (c) => {
    await unapprove(c.env.CASE_STUDIES, c.req.param('id'));
    return c.json({ ok: true });
  });

  admin.get('/schedule', async (c) => {
    return c.json({ schedule: await getSchedule(c.env.CASE_STUDIES) });
  });

  admin.get('/posts', async (c) => {
    return c.json({ posts: await listPostIndex(c.env.CASE_STUDIES) });
  });

  admin.post('/posts/:slug/unpublish', async (c) => {
    await removePost(c.env.CASE_STUDIES, c.req.param('slug'));
    return c.json({ ok: true });
  });

  admin.get('/failures', async (c) => {
    return c.json({ failures: await listFailures(c.env.CASE_STUDIES) });
  });

  admin.get('/health', async (c) => {
    const pending: Candidate[] = [];
    for (const t of TYPES) pending.push(...(await listCandidates(c.env.CASE_STUDIES, t)));
    return c.json({
      pendingCount: pending.length,
      approvedCount: (await listApproved(c.env.CASE_STUDIES)).length,
      scheduleCount: (await getSchedule(c.env.CASE_STUDIES)).length,
      failureCount: (await listFailures(c.env.CASE_STUDIES)).length,
      postsCount: (await listPostIndex(c.env.CASE_STUDIES)).length,
    });
  });

  // Mount sub-app under /api/v1/admin
  app.route('/api/v1/admin', admin);
}
```

- [ ] **Step 4: Register admin routes in `api/src/index.ts`**

```ts
import { registerAdminRoutes } from './routes/case-study-admin';
// after app is created:
registerAdminRoutes(app);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run api/test/routes/case-study-admin.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/case-study/auth.ts api/src/routes/case-study-admin.ts api/test/routes/case-study-admin.test.ts api/src/index.ts
git commit -m "feat(case-study): add token-gated admin API"
```

---

## Task 28: Define case-study config (RSS feeds + ransomware victim source)

**Files:**

- Create: `api/src/case-study/config.ts`
- Create: `api/src/case-study/ransom-source.ts`

This task creates the two concrete wiring pieces that the scheduled handler needs: a list of vendor RSS feeds for the actor discovery, and a function that returns ransomware victims for the ransom discovery. We isolate them in `config.ts` and `ransom-source.ts` so they can be unit-tested separately and so the scheduled handler in Task 29 stays small.

- [ ] **Step 1: Write `api/src/case-study/config.ts`**

```ts
// api/src/case-study/config.ts

// Vendor threat-intel RSS feeds scanned for actor mentions.
// These are public feeds — no auth required.
export const ACTOR_RSS_FEEDS: string[] = [
  'https://www.mandiant.com/resources/blog/rss.xml',
  'https://www.crowdstrike.com/blog/feed/',
  'https://www.microsoft.com/security/blog/threat-intelligence/feed/',
  'https://blog.talosintelligence.com/feeds/posts/default',
  'https://www.proofpoint.com/us/threat-insight/blog/feed',
];

export const SITE_URL = 'https://pranithjain.qzz.io';
```

- [ ] **Step 2: Look at the existing ransomware-recent route to find the right shape**

```bash
cat /Users/pranith/Documents/portfolio/api/src/routes/ransomware-recent.ts
```

Note the existing data shape (likely something like `{ group, victim, discovered, post_url }` from ransomwhere.live or ransomware.live). We'll map it into the `Victim` shape that `discoverRansomware` expects.

- [ ] **Step 3: Write `api/src/case-study/ransom-source.ts`**

```ts
// api/src/case-study/ransom-source.ts
import type { Victim } from './discovery/ransomware';

// ransomware.live exposes a free public JSON feed of recent victim posts.
// Endpoint: https://api.ransomware.live/v2/recentvictims (no auth)
const RANSOMWARE_LIVE_URL = 'https://api.ransomware.live/v2/recentvictims';

interface RansomwareLiveEntry {
  victim: string;
  group: string;
  attackdate?: string;
  published?: string;
  discovered?: string;
  post_url?: string;
}

export async function fetchRecentVictims(fetchImpl: typeof globalThis.fetch = globalThis.fetch): Promise<Victim[]> {
  try {
    const r = await fetchImpl(RANSOMWARE_LIVE_URL, {
      headers: { 'User-Agent': 'pranithjain.qzz.io case-study-discovery' },
    });
    if (!r.ok) throw new Error(`ransomware.live ${r.status}`);
    const raw = (await r.json()) as RansomwareLiveEntry[];
    return raw
      .filter((e) => e.victim && e.group)
      .map((e) => ({
        group: e.group,
        victim: e.victim,
        postedAt: (e.discovered ?? e.published ?? e.attackdate ?? new Date().toISOString()).replace(' ', 'T'),
        url: e.post_url,
      }));
  } catch (err) {
    console.warn('fetchRecentVictims failed', err);
    return [];
  }
}
```

If your portfolio already proxies a different ransomware feed (check `api/src/routes/ransomware-recent.ts` and `victim-releaks.ts`), reuse that source instead — replace `RANSOMWARE_LIVE_URL` and the mapping accordingly. The function signature stays the same.

- [ ] **Step 4: Add a quick test for the ransom source**

Create `api/test/case-study/ransom-source.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchRecentVictims } from '../../src/case-study/ransom-source';

describe('fetchRecentVictims', () => {
  it('maps raw entries to Victim[]', async () => {
    const fake = [{ victim: 'ACME', group: 'Akira', discovered: '2026-05-13 10:00:00', post_url: 'http://x' }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fake)));
    const victims = await fetchRecentVictims(fetchMock as any);
    expect(victims).toHaveLength(1);
    expect(victims[0].group).toBe('Akira');
    expect(victims[0].victim).toBe('ACME');
    expect(victims[0].url).toBe('http://x');
  });

  it('returns [] when API errors', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    expect(await fetchRecentVictims(fetchMock as any)).toEqual([]);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/pranith/Documents/portfolio
npx vitest run api/test/case-study/ransom-source.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/case-study/config.ts api/src/case-study/ransom-source.ts api/test/case-study/ransom-source.test.ts
git commit -m "feat(case-study): add config and ransomware victim source"
```

---

## Task 29: Wire scheduled handler in worker/index.ts

**Files:**

- Modify: `worker/index.ts`

- [ ] **Step 1: Read worker/index.ts to understand the existing scheduled handler**

```bash
cat /Users/pranith/Documents/portfolio/worker/index.ts | head -120
```

Identify where `scheduled` is exported and what existing cron jobs it dispatches. Do NOT remove or modify any existing dispatch logic — only add to it.

- [ ] **Step 2: Add imports to worker/index.ts**

At the top of `worker/index.ts`, add these imports alongside the existing ones:

```ts
import { runDiscovery } from '../api/src/case-study/discovery';
import { discoverCves } from '../api/src/case-study/discovery/cve';
import { discoverActors } from '../api/src/case-study/discovery/actor';
import { discoverMalware } from '../api/src/case-study/discovery/malware';
import { discoverRansomware } from '../api/src/case-study/discovery/ransomware';
import { runPlanner } from '../api/src/case-study/publishing/planner';
import { runPublisher } from '../api/src/case-study/publishing/publisher';
import { putCandidate } from '../api/src/case-study/storage/candidates';
import { listApproved, getApproved, unapprove } from '../api/src/case-study/storage/approved';
import { setSchedule, markSlotStatus, pickDueSlot } from '../api/src/case-study/storage/schedule';
import { getDedup, touchDedup } from '../api/src/case-study/storage/dedup';
import { putPost, listPostIndex } from '../api/src/case-study/storage/posts';
import { recordFailure } from '../api/src/case-study/storage/failed';
import { renderRss } from '../api/src/case-study/rendering/rss';
import { generatePost } from '../api/src/case-study/generation';
import { kv as kvKeys } from '../api/src/case-study/kv-keys';
import { ACTOR_RSS_FEEDS, SITE_URL } from '../api/src/case-study/config';
import { fetchRecentVictims } from '../api/src/case-study/ransom-source';
import type { Post } from '../api/src/case-study/types';
```

- [ ] **Step 3: Add case-study dispatch inside the existing `scheduled` handler**

Inside the existing `scheduled(event, env, ctx)` function, add the following block. Place it after any existing dispatch logic (do not replace it):

```ts
// === Case-study generator — piggybacks on the existing 3 crons ===
const now = new Date(event.scheduledTime);
const cron = event.cron;

// Hourly cache-warm cron — also run publisher every hour
if (cron === '0 * * * *') {
  ctx.waitUntil(
    runPublisher({
      pickDueSlot: (n) => pickDueSlot(env.CASE_STUDIES, n),
      markSlotStatus: (cid, status, extras) => markSlotStatus(env.CASE_STUDIES, cid, status, extras),
      getApproved: (k) => getApproved(env.CASE_STUDIES, k),
      unapprove: (k) => unapprove(env.CASE_STUDIES, k),
      generatePost: (cand, n) => generatePost({ candidate: cand, ai: env.AI, now: n }),
      putPost: (p) => putPost(env.CASE_STUDIES, p),
      refreshRss: async () => {
        const index = await listPostIndex(env.CASE_STUDIES);
        const posts = await Promise.all(
          index.map(async (e) => (await env.CASE_STUDIES.get(kvKeys.post(e.slug), 'json')) as Post | null)
        );
        const rss = renderRss(
          posts.filter((p): p is Post => p !== null),
          { siteUrl: SITE_URL }
        );
        await env.CASE_STUDIES.put(kvKeys.metaRss, rss);
      },
      touchDedup: (k, when, slug) => touchDedup(env.CASE_STUDIES, k, when, slug),
      recordFailure: (rec) => recordFailure(env.CASE_STUDIES, rec),
      now,
    })
  );
}

// Daily briefing cron — also run case-study discovery
if (cron === '5 0 * * *') {
  ctx.waitUntil(
    runDiscovery({
      runners: {
        cve: () =>
          discoverCves({
            fetch: globalThis.fetch,
            now,
            getDedup: (k) => getDedup(env.CASE_STUDIES, k),
          }),
        actor: () =>
          discoverActors({
            fetch: globalThis.fetch,
            now,
            getDedup: (k) => getDedup(env.CASE_STUDIES, k),
            feeds: ACTOR_RSS_FEEDS,
          }),
        malware: () =>
          discoverMalware({
            fetch: globalThis.fetch,
            now,
            getDedup: (k) => getDedup(env.CASE_STUDIES, k),
            abuseChKey: (env as unknown as { ABUSE_CH_KEY?: string }).ABUSE_CH_KEY ?? '',
          }),
        ransom: () =>
          discoverRansomware({
            fetchVictims: () => fetchRecentVictims(globalThis.fetch),
            now,
            getDedup: (k) => getDedup(env.CASE_STUDIES, k),
          }),
      },
      putCandidate: (c) => putCandidate(env.CASE_STUDIES, c),
      touchDedup: (k, n) => touchDedup(env.CASE_STUDIES, k, n),
      now,
    })
  );
}

// Weekly Mon briefing cron — also run planner for the upcoming week
if (cron === '15 0 * * 1') {
  ctx.waitUntil(
    runPlanner({
      listApproved: () => listApproved(env.CASE_STUDIES),
      setSchedule: (slots) => setSchedule(env.CASE_STUDIES, slots),
      now,
      random: Math.random,
    })
  );
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/pranith/Documents/portfolio
npx tsc --noEmit -p api/tsconfig.json
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts
git commit -m "feat(case-study): wire discovery/planner/publisher into scheduled handler"
```

---

## Task 30: Public blog React pages

**Files:**

- Create: `src/pages/Blog.tsx`
- Create: `src/pages/BlogPost.tsx`
- Modify: `src/App.tsx`
- Create: `src/test/Blog.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
// src/test/Blog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Blog from '../pages/Blog';

describe('Blog index page', () => {
  it('renders the list of posts fetched from API', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            posts: [
              { slug: 'a', title: 'Alpha', type: 'cve', excerpt: 'x', publishedAt: '2026-05-19T15:05:00Z', tags: [] },
            ],
          })
        )
    ) as any;
    render(
      <MemoryRouter>
        <Blog />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/test/Blog.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Write `src/pages/Blog.tsx`**

```tsx
// src/pages/Blog.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface PostEntry {
  slug: string;
  title: string;
  type: string;
  excerpt: string;
  publishedAt: string;
  tags: string[];
}

export default function Blog() {
  const [posts, setPosts] = useState<PostEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/blog/posts')
      .then((r) => r.json())
      .then((d: { posts: PostEntry[] }) => {
        setPosts(d.posts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Case Studies</h1>
      {loading && <p className="text-zinc-400">Loading…</p>}
      {!loading && posts.length === 0 && <p className="text-zinc-400">No posts yet.</p>}
      <ul className="space-y-6">
        {posts.map((p) => (
          <li key={p.slug} className="border-b border-zinc-800 pb-4">
            <span className="text-xs uppercase tracking-wider text-zinc-500">{p.type}</span>
            <h2 className="text-xl font-semibold">
              <Link to={`/blog/${p.slug}`} className="hover:underline">
                {p.title}
              </Link>
            </h2>
            <p className="text-zinc-400 mt-1">{p.excerpt}</p>
            <time className="text-xs text-zinc-500">{new Date(p.publishedAt).toLocaleDateString()}</time>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Write `src/pages/BlogPost.tsx`**

```tsx
// src/pages/BlogPost.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

interface Post {
  slug: string;
  title: string;
  type: string;
  publishedAt: string;
  body: string;
  hero: string;
  iocs: { type: string; value: string }[];
  tags: string[];
}

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/blog/posts/${slug}`).then(async (r) => {
      if (r.status === 404) {
        setNotFound(true);
        return;
      }
      const { post } = await r.json();
      setPost(post);
    });
  }, [slug]);

  if (notFound) return <p className="p-10">Post not found.</p>;
  if (!post) return <p className="p-10">Loading…</p>;

  const html = DOMPurify.sanitize(marked.parse(post.body, { async: false }) as string, { ADD_ATTR: ['class'] });

  return (
    <article className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-6" dangerouslySetInnerHTML={{ __html: post.hero }} />
      <header className="mb-6">
        <span className="text-xs uppercase tracking-wider text-zinc-500">{post.type}</span>
        <h1 className="text-3xl font-bold">{post.title}</h1>
        <time className="text-sm text-zinc-500">{new Date(post.publishedAt).toLocaleDateString()}</time>
      </header>
      <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
      {post.iocs.length > 0 && (
        <aside className="mt-10 border-t border-zinc-800 pt-6">
          <h2 className="text-sm uppercase tracking-wider text-zinc-500 mb-2">IOCs</h2>
          <ul className="text-sm font-mono space-y-1">
            {post.iocs.map((i, k) => (
              <li key={k}>
                <a href={`/dfir/ioc-check?q=${encodeURIComponent(i.value)}`} className="hover:underline">
                  [{i.type}] {i.value}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  );
}
```

- [ ] **Step 5: Register routes in `src/App.tsx`**

Open `src/App.tsx`, add lazy imports alongside existing route imports:

```tsx
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
```

In the `<Routes>` block, add:

```tsx
<Route path="/blog" element={<Blog />} />
<Route path="/blog/:slug" element={<BlogPost />} />
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/test/Blog.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Blog.tsx src/pages/BlogPost.tsx src/App.tsx src/test/Blog.test.tsx
git commit -m "feat(case-study): add public blog index and post pages"
```

---

## Task 31: End-to-end golden path test

**Files:**

- Create: `api/test/case-study/e2e.test.ts`

- [ ] **Step 1: Write the e2e test**

```ts
// api/test/case-study/e2e.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runDiscovery } from '../../src/case-study/discovery';
import { discoverCves } from '../../src/case-study/discovery/cve';
import { runPlanner } from '../../src/case-study/publishing/planner';
import { runPublisher } from '../../src/case-study/publishing/publisher';
import { putCandidate, getCandidate, deleteCandidate, listCandidates } from '../../src/case-study/storage/candidates';
import { approve, listApproved, getApproved, unapprove } from '../../src/case-study/storage/approved';
import { getSchedule, setSchedule, markSlotStatus, pickDueSlot } from '../../src/case-study/storage/schedule';
import { touchDedup, getDedup } from '../../src/case-study/storage/dedup';
import { putPost, getPost, listPostIndex } from '../../src/case-study/storage/posts';
import { recordFailure } from '../../src/case-study/storage/failed';
import { generatePost } from '../../src/case-study/generation';

function makeKv() {
  const store = new Map<string, { value: string; ttl?: number }>();
  return {
    store,
    async get(k: string, t?: 'json') {
      const e = store.get(k);
      if (!e) return null;
      return t === 'json' ? JSON.parse(e.value) : e.value;
    },
    async put(k: string, v: string, opts?: { expirationTtl?: number }) {
      store.set(k, { value: v, ttl: opts?.expirationTtl });
    },
    async delete(k: string) {
      store.delete(k);
    },
    async list(opts: { prefix: string }) {
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(opts.prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: '' };
    },
  } as any;
}

const fakeKev = {
  vulnerabilities: [
    {
      cveID: 'CVE-2026-1234',
      vendorProject: 'Fortinet',
      product: 'FortiGate',
      vulnerabilityName: 'Auth Bypass',
      dateAdded: '2026-05-14',
      shortDescription: 'x',
      knownRansomwareCampaignUse: 'Known',
    },
  ],
};

const goodMd = [
  '## Summary',
  'x',
  '## Affected products',
  'x',
  '## How it works',
  'x',
  '## Exploitation in the wild',
  'x',
  '## Detection & mitigation',
  'x',
  '## IOCs',
  'None.',
  '## References',
  '- https://example.com',
].join('\n\n');

describe('e2e CVE golden path', () => {
  it('discover → approve → plan → publish produces a post', async () => {
    const kv = makeKv();
    const fetch = vi.fn(async () => new Response(JSON.stringify(fakeKev)));
    const ai = { run: vi.fn(async () => ({ response: goodMd })) };

    // 1) Discovery
    const tStart = new Date('2026-05-14T06:00:00Z');
    await runDiscovery({
      runners: {
        cve: () => discoverCves({ fetch: fetch as any, now: tStart, getDedup: (k) => getDedup(kv, k) }),
        actor: async () => [],
        malware: async () => [],
        ransom: async () => [],
      },
      putCandidate: (c) => putCandidate(kv, c),
      touchDedup: (k, n) => touchDedup(kv, k, n),
      now: tStart,
    });
    const cves = await listCandidates(kv, 'cve');
    expect(cves).toHaveLength(1);
    const target = cves[0];

    // 2) Manual approve (simulates POST /admin/candidates/:id/approve)
    await approve(kv, target);
    await deleteCandidate(kv, 'cve', target.key);
    expect((await listApproved(kv))[0].key).toBe(target.key);

    // 3) Planner (treat tPlanner as "Sunday late")
    const tPlanner = new Date('2026-05-17T23:00:00Z');
    await runPlanner({
      listApproved: () => listApproved(kv),
      setSchedule: (slots) => setSchedule(kv, slots),
      now: tPlanner,
      random: () => 0.5,
    });
    const schedule = await getSchedule(kv);
    expect(schedule).toHaveLength(1);

    // 4) Publisher — jump to slot time
    const tPublish = new Date(schedule[0].slotAt);
    const res = await runPublisher({
      pickDueSlot: (n) => pickDueSlot(kv, n),
      markSlotStatus: (cid, status, extras) => markSlotStatus(kv, cid, status, extras),
      getApproved: (k) => getApproved(kv, k),
      unapprove: (k) => unapprove(kv, k),
      generatePost: (cand, n) => generatePost({ candidate: cand, ai: ai as any, now: n }),
      putPost: (p) => putPost(kv, p),
      refreshRss: async () => {
        kv.store.set('meta:rss', { value: '<rss/>' });
      },
      touchDedup: (k, when, slug) => touchDedup(kv, k, when, slug),
      recordFailure: (rec) => recordFailure(kv, rec),
      now: tPublish,
    });
    expect(res.published).toBe(1);

    // 5) Assertions
    const index = await listPostIndex(kv);
    expect(index).toHaveLength(1);
    const post = await getPost(kv, index[0].slug);
    expect(post).toBeTruthy();
    expect(post!.body).toContain('## Summary');
    expect(post!.candidateId).toBe(target.key);
    expect(await listApproved(kv)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run api/test/case-study/e2e.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the entire test suite**

```bash
npx vitest run
```

Expected: every new test in `api/test/case-study/**` and `src/test/Blog.test.tsx` passes; no existing tests regressed.

- [ ] **Step 4: Commit**

```bash
git add api/test/case-study/e2e.test.ts
git commit -m "test(case-study): add e2e golden path for CVE pipeline"
```

---

## Task 32: Manual smoke test + deploy

**Files:**

- None (operational)

- [ ] **Step 1: Lint and typecheck the full project**

```bash
cd /Users/pranith/Documents/portfolio
npm run lint
npx tsc --noEmit -p api/tsconfig.json
npx tsc --noEmit
```

Expected: no errors. Fix any new lint/type issues introduced by the work.

- [ ] **Step 2: Run wrangler dev**

```bash
npx wrangler dev --port 8787
```

Leave this running in one terminal.

- [ ] **Step 3: Trigger discovery cron manually**

In a separate terminal:

```bash
curl -s "http://localhost:8787/__scheduled?cron=5+0+*+*+*"
```

Expected: completes, logs show `{"job":"discovery", ...}`. Then verify candidates wrote to KV:

```bash
curl -s -H "X-Admin-Token: <your-ADMIN_TOKEN>" http://localhost:8787/api/v1/admin/candidates | head -c 500
```

Expected: JSON with `pending: [...]` non-empty (assuming KEV has recent entries).

- [ ] **Step 4: Approve a candidate**

Pick one stable key from the pending list and approve it:

```bash
curl -s -X POST -H "X-Admin-Token: <token>" http://localhost:8787/api/v1/admin/candidates/<stable-key>/approve
```

Verify it appears in approved:

```bash
curl -s -H "X-Admin-Token: <token>" http://localhost:8787/api/v1/admin/approved
```

- [ ] **Step 5: Trigger planner manually**

```bash
curl -s "http://localhost:8787/__scheduled?cron=15+0+*+*+1"
```

Verify schedule:

```bash
curl -s -H "X-Admin-Token: <token>" http://localhost:8787/api/v1/admin/schedule
```

- [ ] **Step 6: Trigger publisher manually (note: only publishes if the scheduled slot has passed)**

Force a publish by setting a slot in the past — for the smoke test, edit the slot in KV via wrangler:

```bash
npx wrangler kv key put --binding=CASE_STUDIES schedule:upcoming '[{"slotAt":"2020-01-01T00:00:00Z","candidateId":"<stable-key>","status":"pending"}]'
curl -s "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

Verify post was created:

```bash
curl -s http://localhost:8787/api/v1/blog/posts | head -c 500
curl -s http://localhost:8787/api/v1/blog/posts/<slug>
curl -s http://localhost:8787/blog/rss.xml | head -c 500
```

- [ ] **Step 7: Visit `/blog` and `/blog/:slug` in a browser**

Verify the page renders, hero SVG displays, IOC chips link to `/dfir/ioc-check`.

- [ ] **Step 8: Deploy**

```bash
npm run deploy
```

After deploy, repeat steps 3-7 against the production URL (`https://pranithjain.qzz.io`) — though wait for the next scheduled cron to run organically rather than triggering manually in prod.

- [ ] **Step 9: Final commit (none expected, but ensure no untracked files)**

```bash
git status
```

If clean, no commit needed.

---

## Done criteria

- All 32 tasks committed
- `npx vitest run` passes with no regressions
- Manual smoke test passes locally
- Site deployed; `/blog` is reachable; `/api/v1/admin/health` returns sensible counts when called with `X-Admin-Token`
- At least one approved candidate has produced a real published post

**Next:** Plan 2 (Admin React UI) replaces curl-based approval with a token-gated web app.

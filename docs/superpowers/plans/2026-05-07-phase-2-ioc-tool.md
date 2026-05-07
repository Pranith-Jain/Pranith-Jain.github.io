# Phase 2: IOC Checker — End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `/dfir/ioc-check` working end-to-end. The user pastes an IOC, the API Worker fans out to 8 threat-intel providers in parallel, results stream back via SSE, and the UI renders per-provider verdict cards in the dfir-lab.ch-inspired dark/cyan aesthetic. The existing tab-based IOC mode in `DFIR.tsx` and the `apiUrl` config UI both go away.

**Architecture:** Vertical slice — backend, frontend, and cleanup all in one plan. Each provider is its own module behind a shared adapter contract. Indicator detection + defang helpers salvaged from existing `DFIR.tsx`. Composite score weighted per indicator type. KV cache with TTL by indicator type, in-memory fallback during local tests. SSE stream `text/event-stream` so fast providers (cache hits) appear in <200ms.

**Tech Stack:**

- Backend: TypeScript + Hono + `@cloudflare/vitest-pool-workers` (existing), no new deps
- Frontend: React 18 + react-router + native `EventSource` for SSE consumption
- All 8 providers: `VirusTotal`, `AbuseIPDB`, `Shodan`, `GreyNoise`, `OTX AlienVault`, `URLScan.io`, `Hybrid Analysis`, `Pulsedive`. API keys via `wrangler secret put` (deferred to a final task — local dev uses mocked HTTP).

---

## Prerequisites

- Plan 1's branch `feature/dfir-integration` is the working branch (do NOT merge to main yet)
- `cd /Users/pranith/Documents/portfolio/api && npm test` passes (the health endpoint test)
- Working tree clean
- The original FastAPI Python is in `docs/dfir-legacy/api-reference/providers.py` — use as porting reference, do NOT copy verbatim

---

## File Structure

After this plan completes:

```
api/src/
├── index.ts                          MODIFIED: register ioc route
├── env.ts                            MODIFIED: add 8 provider key secrets
├── routes/
│   └── ioc.ts                        NEW: SSE handler for /api/v1/ioc/check
├── providers/
│   ├── types.ts                      NEW: ProviderResult, IndicatorType
│   ├── virustotal.ts                 NEW
│   ├── abuseipdb.ts                  NEW
│   ├── shodan.ts                     NEW
│   ├── greynoise.ts                  NEW
│   ├── otx.ts                        NEW
│   ├── urlscan.ts                    NEW
│   ├── hybridanalysis.ts             NEW
│   └── pulsedive.ts                  NEW
└── lib/
    ├── indicator.ts                  NEW: type detection, defang/refang (salvaged)
    ├── scoring.ts                    NEW: composite score
    ├── cache.ts                      NEW: KV cache wrapper, in-memory fallback
    └── sse.ts                        NEW: ReadableStream SSE helpers

api/test/
├── health.test.ts                    existing
├── providers/                        NEW: 8 unit-tested adapters
│   ├── virustotal.test.ts
│   ├── abuseipdb.test.ts
│   ├── shodan.test.ts
│   ├── greynoise.test.ts
│   ├── otx.test.ts
│   ├── urlscan.test.ts
│   ├── hybridanalysis.test.ts
│   └── pulsedive.test.ts
├── lib/
│   ├── indicator.test.ts
│   ├── scoring.test.ts
│   └── cache.test.ts
└── routes/
    └── ioc.test.ts

src/pages/dfir/
├── ComingSoon.tsx                    existing (still used by 6 placeholders)
├── IocCheck.tsx                      NEW: real page, replaces IocCheckPlaceholder
├── IocCheckPlaceholder.tsx           DELETED
├── PhishingPlaceholder.tsx           existing
├── DomainPlaceholder.tsx             existing
├── ExposurePlaceholder.tsx           existing
├── FilePlaceholder.tsx               existing
├── WikiPlaceholder.tsx               existing
└── DashboardPlaceholder.tsx          existing

src/components/dfir/                  NEW: shared dfir-lab-style components
├── IocResultRow.tsx                  per-provider result card
├── VerdictChip.tsx                   clean/suspicious/malicious chip
└── DfirLayout.tsx                    dark page shell, breadcrumb header

src/lib/dfir/                         NEW
├── api.ts                            EventSource wrapper for SSE
└── indicator-client.ts               client-side mirror of api/lib/indicator (lightweight)

src/pages/DFIR.tsx                    MODIFIED: strip 'analysis' tab's IOC mode + analysis nav item
src/components/DFIRNavigation.tsx     MODIFIED: drop 'analysis' nav tab (since IOC moved to /dfir/ioc-check)
src/components/ConnectionStatus.tsx   MODIFIED or DELETED: drop apiUrl edit UI
src/hooks/useDFIRSettings.ts          MODIFIED: drop apiUrl state (keep RSS feed prefs if any)
```

---

## Task 1: Salvage helpers from existing `DFIR.tsx`

**Goal:** extract reusable, working logic (defang/refang, indicator type detection, input validation) from the monolithic `DFIR.tsx` into focused library files. Both backend (Worker) and frontend (browser) need these helpers — they live in two places (`api/src/lib/indicator.ts` and `src/lib/dfir/indicator-client.ts`) but share the same logic.

**Files:**

- Read: `src/pages/DFIR.tsx` (find IOC-related helpers like `sanitizeText`, `isSafeUrl`, `getType`, `getSeverity`, plus any defang/IOC validation)
- Create: `api/src/lib/indicator.ts`
- Create: `src/lib/dfir/indicator-client.ts`
- Create: `api/test/lib/indicator.test.ts`

- [ ] **Step 1: Inventory existing helpers**

```bash
grep -nE "sanitizeText|isSafeUrl|getType|getSeverity|defang|refang|isIPv4|isHash|isDomain|isURL" /Users/pranith/Documents/portfolio/src/pages/DFIR.tsx | head -40
```

Capture the function definitions for any matches. Most likely candidates: `sanitizeText` (line ~40), `isSafeUrl` (~49), `getType` (~201), `getSeverity` (~211).

- [ ] **Step 2: Write failing test for `api/src/lib/indicator.ts`**

Path: `/Users/pranith/Documents/portfolio/api/test/lib/indicator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { detectType, defang, refang } from '../../src/lib/indicator';

describe('detectType', () => {
  it('detects IPv4', () => {
    expect(detectType('8.8.8.8')).toBe('ipv4');
  });
  it('detects IPv6', () => {
    expect(detectType('2001:db8::1')).toBe('ipv6');
  });
  it('detects MD5', () => {
    expect(detectType('d41d8cd98f00b204e9800998ecf8427e')).toBe('hash');
  });
  it('detects SHA-1', () => {
    expect(detectType('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe('hash');
  });
  it('detects SHA-256', () => {
    expect(detectType('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe('hash');
  });
  it('detects domain', () => {
    expect(detectType('example.com')).toBe('domain');
  });
  it('detects URL', () => {
    expect(detectType('https://example.com/foo')).toBe('url');
  });
  it('handles defanged input', () => {
    expect(detectType('8[.]8[.]8[.]8')).toBe('ipv4');
    expect(detectType('hxxps://example[.]com')).toBe('url');
  });
  it('rejects garbage', () => {
    expect(detectType('lol')).toBe('unknown');
    expect(detectType('')).toBe('unknown');
  });
});

describe('defang', () => {
  it('replaces dots in IP', () => {
    expect(defang('8.8.8.8')).toBe('8[.]8[.]8[.]8');
  });
  it('replaces protocol in URL', () => {
    expect(defang('https://example.com/path')).toBe('hxxps://example[.]com/path');
  });
  it('idempotent on defanged input', () => {
    expect(defang('8[.]8[.]8[.]8')).toBe('8[.]8[.]8[.]8');
  });
});

describe('refang', () => {
  it('restores defanged IP', () => {
    expect(refang('8[.]8[.]8[.]8')).toBe('8.8.8.8');
  });
  it('restores defanged URL', () => {
    expect(refang('hxxps://example[.]com')).toBe('https://example.com');
  });
});
```

- [ ] **Step 3: Run, verify fail**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run indicator
```

Expected: fail with "Cannot find module '../../src/lib/indicator'".

- [ ] **Step 4: Write `api/src/lib/indicator.ts`**

Path: `/Users/pranith/Documents/portfolio/api/src/lib/indicator.ts`

```typescript
export type IndicatorType = 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'unknown';

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
const HASH_RE = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/;
const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function refang(input: string): string {
  return input
    .replace(/hxxps?:\/\//gi, (m) => m.replace(/hxxp/i, 'http'))
    .replace(/\[\.\]/g, '.')
    .replace(/\[:\]/g, ':')
    .replace(/\[at\]/gi, '@');
}

export function defang(input: string): string {
  return input.replace(/^https?:\/\//i, (m) => m.replace(/http/i, 'hxxp')).replace(/\./g, '[.]');
}

export function detectType(rawInput: string): IndicatorType {
  const input = refang(rawInput.trim());
  if (!input) return 'unknown';
  if (URL_RE.test(input)) return 'url';
  if (EMAIL_RE.test(input)) return 'email';
  if (IPV4_RE.test(input)) {
    const parts = input.split('.').map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) return 'ipv4';
  }
  if (IPV6_RE.test(input) && input.includes(':')) return 'ipv6';
  if (HASH_RE.test(input)) return 'hash';
  if (DOMAIN_RE.test(input)) return 'domain';
  return 'unknown';
}
```

- [ ] **Step 5: Run, verify pass**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run indicator
```

Expected: all tests pass.

- [ ] **Step 6: Mirror in frontend**

Path: `/Users/pranith/Documents/portfolio/src/lib/dfir/indicator-client.ts`

Same logic as backend. Copy the file content verbatim from Step 4 — no Worker imports, plain TypeScript. The duplication is intentional: the backend Worker can't import from `src/`, and we don't want a shared package for a 50-line file.

- [ ] **Step 7: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add api/src/lib/indicator.ts api/test/lib/indicator.test.ts src/lib/dfir/indicator-client.ts
git commit -m "feat(dfir): add indicator type detection + defang helpers (TS port from DFIR.tsx salvage)"
```

---

## Task 2: Provider adapter contract + scoring lib

**Goal:** define the shared `ProviderResult` shape and weighted-scoring algorithm so all 8 adapters slot into the same fan-out.

**Files:**

- Create: `api/src/providers/types.ts`
- Create: `api/src/lib/scoring.ts`
- Create: `api/test/lib/scoring.test.ts`

- [ ] **Step 1: Write `api/src/providers/types.ts`**

Path: `/Users/pranith/Documents/portfolio/api/src/providers/types.ts`

```typescript
import type { IndicatorType } from '../lib/indicator';

export type ProviderId =
  | 'virustotal'
  | 'abuseipdb'
  | 'shodan'
  | 'greynoise'
  | 'otx'
  | 'urlscan'
  | 'hybridanalysis'
  | 'pulsedive';

export type Verdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';

export interface ProviderResult {
  source: ProviderId;
  status: 'ok' | 'error' | 'unsupported';
  score: number; // 0-100, higher = more malicious
  verdict: Verdict;
  raw_summary: Record<string, unknown>;
  tags: string[];
  error?: string;
  fetched_at: string; // ISO
  cached: boolean;
}

export interface Indicator {
  type: IndicatorType;
  value: string;
}

export interface ProviderEnv {
  VT_API_KEY: string;
  ABUSEIPDB_API_KEY: string;
  SHODAN_API_KEY: string;
  GREYNOISE_API_KEY: string;
  OTX_API_KEY: string;
  URLSCAN_API_KEY: string;
  HYBRID_ANALYSIS_API_KEY: string;
  PULSEDIVE_API_KEY: string;
}

export type ProviderAdapter = (indicator: Indicator, env: ProviderEnv, signal: AbortSignal) => Promise<ProviderResult>;

export const PROVIDER_TIMEOUT_MS = 5000;

/** Which indicator types each provider supports. Used by the route to skip unsupported. */
export const PROVIDER_SUPPORT: Record<ProviderId, IndicatorType[]> = {
  virustotal: ['ipv4', 'ipv6', 'domain', 'url', 'hash'],
  abuseipdb: ['ipv4', 'ipv6'],
  shodan: ['ipv4', 'ipv6', 'domain'],
  greynoise: ['ipv4', 'ipv6'],
  otx: ['ipv4', 'ipv6', 'domain', 'url', 'hash'],
  urlscan: ['url', 'domain'],
  hybridanalysis: ['hash'],
  pulsedive: ['ipv4', 'ipv6', 'domain', 'url', 'hash'],
};
```

- [ ] **Step 2: Write failing test for scoring**

Path: `/Users/pranith/Documents/portfolio/api/test/lib/scoring.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { compositeScore } from '../../src/lib/scoring';
import type { ProviderResult } from '../../src/providers/types';

const ok = (source: ProviderResult['source'], score: number): ProviderResult => ({
  source,
  status: 'ok',
  score,
  verdict: score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean',
  raw_summary: {},
  tags: [],
  fetched_at: new Date().toISOString(),
  cached: false,
});

describe('compositeScore', () => {
  it('returns 0 for empty results', () => {
    const { score, verdict, confidence } = compositeScore('ipv4', []);
    expect(score).toBe(0);
    expect(verdict).toBe('unknown');
    expect(confidence).toBe('low');
  });

  it('weights IP-focused providers higher for IP indicators', () => {
    // For an IP, AbuseIPDB and GreyNoise weigh more than VirusTotal
    const heavy = compositeScore('ipv4', [ok('abuseipdb', 90), ok('greynoise', 80)]);
    const light = compositeScore('ipv4', [ok('virustotal', 90), ok('otx', 80)]);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it('weights hash-focused providers higher for hash indicators', () => {
    const heavy = compositeScore('hash', [ok('virustotal', 90), ok('hybridanalysis', 80)]);
    const light = compositeScore('hash', [ok('otx', 90), ok('pulsedive', 80)]);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it('high confidence with 5+ providers, low with 1', () => {
    const high = compositeScore(
      'ipv4',
      Array.from({ length: 5 }, (_, i) => ok(['virustotal', 'abuseipdb', 'shodan', 'greynoise', 'otx'][i] as never, 30))
    );
    const low = compositeScore('ipv4', [ok('virustotal', 30)]);
    expect(high.confidence).toBe('high');
    expect(low.confidence).toBe('low');
  });

  it('verdict thresholds: <40 clean, 40-69 suspicious, >=70 malicious', () => {
    expect(compositeScore('ipv4', [ok('abuseipdb', 30)]).verdict).toBe('clean');
    expect(compositeScore('ipv4', [ok('abuseipdb', 50)]).verdict).toBe('suspicious');
    expect(compositeScore('ipv4', [ok('abuseipdb', 80)]).verdict).toBe('malicious');
  });
});
```

- [ ] **Step 3: Run, see fail**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run scoring
```

- [ ] **Step 4: Write `api/src/lib/scoring.ts`**

Path: `/Users/pranith/Documents/portfolio/api/src/lib/scoring.ts`

```typescript
import type { ProviderId, ProviderResult, Verdict } from '../providers/types';
import type { IndicatorType } from './indicator';

/** Per-indicator-type provider weights. Higher = more trusted for this type. */
const WEIGHTS: Record<IndicatorType, Partial<Record<ProviderId, number>>> = {
  ipv4: { abuseipdb: 3, greynoise: 3, shodan: 2, virustotal: 1, otx: 1, pulsedive: 1 },
  ipv6: { abuseipdb: 3, greynoise: 3, shodan: 2, virustotal: 1, otx: 1, pulsedive: 1 },
  domain: { virustotal: 2, urlscan: 2, otx: 2, pulsedive: 2, shodan: 1 },
  url: { virustotal: 2, urlscan: 3, otx: 2, pulsedive: 1 },
  hash: { virustotal: 3, hybridanalysis: 3, otx: 2, pulsedive: 1 },
  email: { otx: 1, virustotal: 1 },
  unknown: {},
};

export interface CompositeScore {
  score: number;
  verdict: Verdict;
  confidence: 'low' | 'medium' | 'high';
  contributing: number;
}

export function compositeScore(type: IndicatorType, results: ProviderResult[]): CompositeScore {
  const weights = WEIGHTS[type] ?? {};
  const ok = results.filter((r) => r.status === 'ok');
  if (ok.length === 0) {
    return { score: 0, verdict: 'unknown', confidence: 'low', contributing: 0 };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const r of ok) {
    const w = weights[r.source] ?? 1;
    weightedSum += r.score * w;
    totalWeight += w;
  }
  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  let verdict: Verdict;
  if (score >= 70) verdict = 'malicious';
  else if (score >= 40) verdict = 'suspicious';
  else verdict = 'clean';

  const confidence: CompositeScore['confidence'] = ok.length >= 5 ? 'high' : ok.length >= 3 ? 'medium' : 'low';

  return { score, verdict, confidence, contributing: ok.length };
}
```

- [ ] **Step 5: Run, see pass**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run scoring
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add api/src/providers/types.ts api/src/lib/scoring.ts api/test/lib/scoring.test.ts
git commit -m "feat(api): add provider contract + composite scoring lib"
```

---

## Task 3: KV cache wrapper

**Goal:** read-through cache with per-indicator-type TTL. In-memory mock for local tests; real KV via binding in production.

**Files:**

- Create: `api/src/lib/cache.ts`
- Create: `api/test/lib/cache.test.ts`

- [ ] **Step 1: Write failing test**

Path: `/Users/pranith/Documents/portfolio/api/test/lib/cache.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { ProviderCache } from '../../src/lib/cache';
import type { ProviderResult } from '../../src/providers/types';

const sample: ProviderResult = {
  source: 'virustotal',
  status: 'ok',
  score: 50,
  verdict: 'suspicious',
  raw_summary: { detected: 5 },
  tags: [],
  fetched_at: new Date().toISOString(),
  cached: false,
};

describe('ProviderCache', () => {
  let cache: ProviderCache;
  beforeEach(() => {
    cache = new ProviderCache(env.KV_CACHE);
  });

  it('miss returns null', async () => {
    expect(await cache.get('virustotal', { type: 'ipv4', value: '1.1.1.1' })).toBeNull();
  });

  it('set then get returns the same payload with cached=true', async () => {
    await cache.set('virustotal', { type: 'ipv4', value: '1.1.1.1' }, sample);
    const got = await cache.get('virustotal', { type: 'ipv4', value: '1.1.1.1' });
    expect(got?.score).toBe(50);
    expect(got?.cached).toBe(true);
  });

  it('different indicator -> different cache slot', async () => {
    await cache.set('virustotal', { type: 'ipv4', value: '1.1.1.1' }, sample);
    expect(await cache.get('virustotal', { type: 'ipv4', value: '2.2.2.2' })).toBeNull();
  });

  it('different provider -> different cache slot', async () => {
    await cache.set('virustotal', { type: 'ipv4', value: '1.1.1.1' }, sample);
    expect(await cache.get('abuseipdb', { type: 'ipv4', value: '1.1.1.1' })).toBeNull();
  });

  it('uses 24h TTL for hash, 1h for ipv4', async () => {
    expect(ProviderCache.ttlSeconds('hash')).toBe(86400);
    expect(ProviderCache.ttlSeconds('ipv4')).toBe(3600);
    expect(ProviderCache.ttlSeconds('domain')).toBe(21600);
    expect(ProviderCache.ttlSeconds('url')).toBe(3600);
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run cache
```

Expected: fail. Note: `env.KV_CACHE` requires the test pool's KV binding, which is auto-provided by `@cloudflare/vitest-pool-workers` based on `wrangler.toml`. Plan 1's `wrangler.toml` doesn't yet declare `KV_CACHE` (we deferred Task 5). Add a minimal stub binding **just for tests**.

In `api/wrangler.toml`, append:

```toml
[[kv_namespaces]]
binding = "KV_CACHE"
id = "test-only-not-deployed"
```

The `id` value is a placeholder; the test pool ignores it and uses an in-memory KV. Production deploy still needs Plan 1 Task 5 to provision real namespaces. Leave a comment in the file:

```toml
# NOTE: id "test-only-not-deployed" is a placeholder. The test pool uses in-memory KV.
# Real production id gets set when Plan 1 Task 5 (deferred) is completed.
```

- [ ] **Step 3: Update `api/src/env.ts` to declare `KV_CACHE`**

It already declares `KV_CACHE`, `KV_SHARES`, `R2_FILES` — verify nothing's broken. No edit needed if Plan 1 Task 4 left it intact.

- [ ] **Step 4: Write `api/src/lib/cache.ts`**

Path: `/Users/pranith/Documents/portfolio/api/src/lib/cache.ts`

```typescript
import type { ProviderId, ProviderResult, Indicator } from '../providers/types';
import type { IndicatorType } from './indicator';

const TTL_BY_TYPE: Record<IndicatorType, number> = {
  ipv4: 3600,
  ipv6: 3600,
  domain: 21600,
  url: 3600,
  hash: 86400,
  email: 21600,
  unknown: 3600,
};

export class ProviderCache {
  constructor(private kv: KVNamespace) {}

  static ttlSeconds(type: IndicatorType): number {
    return TTL_BY_TYPE[type];
  }

  static key(provider: ProviderId, indicator: Indicator): string {
    return `prov:${provider}:${indicator.type}:${indicator.value.toLowerCase()}`;
  }

  async get(provider: ProviderId, indicator: Indicator): Promise<ProviderResult | null> {
    const raw = await this.kv.get(ProviderCache.key(provider, indicator));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ProviderResult;
      return { ...parsed, cached: true };
    } catch {
      return null;
    }
  }

  async set(provider: ProviderId, indicator: Indicator, value: ProviderResult): Promise<void> {
    const ttl = ProviderCache.ttlSeconds(indicator.type);
    await this.kv.put(ProviderCache.key(provider, indicator), JSON.stringify(value), {
      expirationTtl: ttl,
    });
  }
}
```

- [ ] **Step 5: Run, see pass**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run cache
```

Expected: 5 tests pass.

- [ ] **Step 6: Verify the existing health test still passes**

```bash
npm test -- --run
```

Expected: all tests in `api/` pass (health + indicator + scoring + cache).

- [ ] **Step 7: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add api/src/lib/cache.ts api/test/lib/cache.test.ts api/wrangler.toml
git commit -m "feat(api): add KV provider cache with per-type TTL"
```

---

## Tasks 4–11: Provider adapters (one per provider)

> **Pattern note:** Tasks 4 through 11 follow an identical TDD pattern. Each writes a test that mocks `globalThis.fetch`, runs to fail, then writes the minimal adapter to pass. Tests should NEVER hit real network. Use `vi.spyOn(globalThis, 'fetch')`.

### Task 4: VirusTotal adapter

**Files:**

- Create: `api/src/providers/virustotal.ts`
- Create: `api/test/providers/virustotal.test.ts`

- [ ] **Step 1: Write failing test**

Path: `/Users/pranith/Documents/portfolio/api/test/providers/virustotal.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { virustotal } from '../../src/providers/virustotal';

const env = {
  VT_API_KEY: 'fake-key',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  GREYNOISE_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  PULSEDIVE_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('virustotal adapter', () => {
  it('returns ok with score derived from detection ratio (IPv4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            attributes: {
              last_analysis_stats: { malicious: 5, suspicious: 2, harmless: 70, undetected: 0 },
              tags: ['suspicious'],
            },
          },
        }),
        { status: 200 }
      )
    );
    const r = await virustotal({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.source).toBe('virustotal');
    expect(r.score).toBeGreaterThan(0);
    expect(r.tags).toContain('suspicious');
  });

  it('returns clean verdict when 0 detections', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 70, undetected: 5 }, tags: [] },
          },
        }),
        { status: 200 }
      )
    );
    const r = await virustotal({ type: 'hash', value: 'a'.repeat(64) }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('clean');
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const r = await virustotal({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/401/);
  });

  it('returns unsupported for email indicator', async () => {
    const r = await virustotal({ type: 'email', value: 'a@b.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('aborts on signal timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('aborted')), 100))
    );
    const r = await virustotal({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(50));
    expect(r.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run virustotal
```

- [ ] **Step 3: Write `api/src/providers/virustotal.ts`**

Reference the FastAPI version: `docs/dfir-legacy/api-reference/providers.py` — find the `check_virustotal` (or similar) function, port the URL-building, scoring, and tag extraction.

Path: `/Users/pranith/Documents/portfolio/api/src/providers/virustotal.ts`

```typescript
import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6', 'domain', 'url', 'hash']);

function endpointFor(type: string, value: string): string {
  const base = 'https://www.virustotal.com/api/v3';
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return `${base}/ip_addresses/${encodeURIComponent(value)}`;
    case 'domain':
      return `${base}/domains/${encodeURIComponent(value)}`;
    case 'url': {
      // VT requires base64url-encoded URL with no padding
      const b64 = btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${base}/urls/${b64}`;
    }
    case 'hash':
      return `${base}/files/${encodeURIComponent(value)}`;
    default:
      throw new Error(`unsupported type ${type}`);
  }
}

export const virustotal: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'virustotal',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');

  try {
    const res = await fetch(endpointFor(indicator.type, indicator.value), {
      headers: { 'x-apikey': env.VT_API_KEY, accept: 'application/json' },
      signal,
    });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}` });

    const json = (await res.json()) as {
      data?: { attributes?: { last_analysis_stats?: Record<string, number>; tags?: string[] } };
    };
    const stats = json.data?.attributes?.last_analysis_stats ?? {};
    const malicious = Number(stats.malicious ?? 0);
    const suspicious = Number(stats.suspicious ?? 0);
    const total = malicious + suspicious + Number(stats.harmless ?? 0) + Number(stats.undetected ?? 0) || 1;
    const score = Math.min(100, Math.round(((malicious * 1.0 + suspicious * 0.5) / total) * 100));
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';
    const tags = json.data?.attributes?.tags ?? [];

    return base('ok', {
      score,
      verdict,
      raw_summary: { malicious, suspicious, total },
      tags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
```

- [ ] **Step 4: Run, see pass**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run virustotal
```

- [ ] **Step 5: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add api/src/providers/virustotal.ts api/test/providers/virustotal.test.ts
git commit -m "feat(api): add VirusTotal provider adapter"
```

### Task 5: AbuseIPDB adapter

Same pattern as Task 4. Reference: `docs/dfir-legacy/api-reference/providers.py:check_abuseipdb`.

**Files:**

- Create: `api/src/providers/abuseipdb.ts`
- Create: `api/test/providers/abuseipdb.test.ts`

Test asserts: status 'ok' for valid IP with `abuseConfidenceScore`, score scales 0-100 from confidence, status 'unsupported' for non-IP types.

API endpoint: `https://api.abuseipdb.com/api/v2/check?ipAddress=<ip>` with header `Key: <env.ABUSEIPDB_API_KEY>` and `Accept: application/json`.

Score formula: `confidence_score` is already 0-100. Use it directly. Tags: include `country_code` if available.

Commit: `feat(api): add AbuseIPDB provider adapter`

### Task 6: Shodan adapter

Same pattern. Reference: `providers.py:check_shodan`. Endpoint: `https://api.shodan.io/shodan/host/<ip>?key=<env.SHODAN_API_KEY>`.

Score: derive from `vulns.length` and open ports count. No straight "score" from Shodan, so:

- `vulns` array length × 10, capped at 60
- Plus 20 if `tags` includes anything malicious-sounding

Tags: include `ports`, `country_name`, `org`.

Commit: `feat(api): add Shodan provider adapter`

### Task 7: GreyNoise adapter

Reference: `providers.py:check_greynoise`. Endpoint: `https://api.greynoise.io/v3/community/<ip>` with `key: <env.GREYNOISE_API_KEY>`.

Score: GreyNoise classification → `malicious` => 80, `suspicious` => 50, `benign` => 5, `unknown` => 30.

Tags: from `tags` array in response.

Commit: `feat(api): add GreyNoise provider adapter`

### Task 8: OTX AlienVault adapter

Reference: `providers.py:check_otx`. Endpoint: `https://otx.alienvault.com/api/v1/indicators/<type>/<value>/general` with header `X-OTX-API-KEY: <env.OTX_API_KEY>`. Type mapping: ipv4 → IPv4, ipv6 → IPv6, domain → domain, url → url, hash → file.

Score: count of pulses ≤ 0 = 0, 1-5 = 30, 6-15 = 60, >15 = 80.

Tags: pulse names (first 5).

Commit: `feat(api): add OTX AlienVault provider adapter`

### Task 9: URLScan adapter

Reference: `providers.py:check_urlscan`. Endpoint: `https://urlscan.io/api/v1/search/?q=<value>` with header `API-Key: <env.URLSCAN_API_KEY>`.

Score: derived from `_score` field in response (already 0-100 in URLScan).

Tags: from `tags` array, limit 10.

Commit: `feat(api): add URLScan provider adapter`

### Task 10: Hybrid Analysis adapter

Reference: `providers.py:check_hybridanalysis`. Endpoint: `https://www.hybrid-analysis.com/api/v2/search/hash` with `POST` body `hash=<sha256>` and header `api-key: <env.HYBRID_ANALYSIS_API_KEY>`.

Score: from `verdict` field — `malicious` => 80, `suspicious` => 50, `no specific threat` => 5.

Tags: from `tags` array if present.

Commit: `feat(api): add Hybrid Analysis provider adapter`

### Task 11: Pulsedive adapter

Reference: `providers.py:check_pulsedive`. Endpoint: `https://pulsedive.com/api/explore.php?q=<indicator>&pretty=1&key=<env.PULSEDIVE_API_KEY>`.

Score: from `risk` field — `critical` => 90, `high` => 70, `medium` => 50, `low` => 20, `none` => 0.

Tags: from `attributes.threats[]` and `factors[]`, deduped, limit 10.

Commit: `feat(api): add Pulsedive provider adapter`

---

## Task 12: SSE helpers + IOC route

**Files:**

- Create: `api/src/lib/sse.ts`
- Create: `api/src/routes/ioc.ts`
- Modify: `api/src/index.ts` (mount the route)
- Create: `api/test/routes/ioc.test.ts`

- [ ] **Step 1: Write `api/src/lib/sse.ts`**

```typescript
export function sseStream<T>(producer: (write: (event: string, data: T) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: string, data: T) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };
      try {
        await producer(write);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
    },
  });
}
```

- [ ] **Step 2: Write failing route test**

Path: `/Users/pranith/Documents/portfolio/api/test/routes/ioc.test.ts`

```typescript
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';

describe('GET /api/v1/ioc/check', () => {
  it('rejects empty indicator', async () => {
    const r = await SELF.fetch('https://x/api/v1/ioc/check');
    expect(r.status).toBe(400);
  });

  it('rejects unknown indicator', async () => {
    const r = await SELF.fetch('https://x/api/v1/ioc/check?indicator=lol');
    expect(r.status).toBe(400);
  });

  it('streams provider events for a valid IPv4', async () => {
    // Mock all 8 fetches to return a generic ok response. The route should
    // emit events for the providers that support 'ipv4'.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 1 }, tags: [] } },
        }),
        { status: 200 }
      )
    );

    const r = await SELF.fetch('https://x/api/v1/ioc/check?indicator=8.8.8.8');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/event-stream');

    const text = await r.text();
    // 'meta' first, then per-provider 'result' events, then 'done'.
    expect(text).toMatch(/event: meta/);
    expect(text).toMatch(/event: result/);
    expect(text).toMatch(/event: done/);
  });
});
```

- [ ] **Step 3: Run, see fail**

- [ ] **Step 4: Write `api/src/routes/ioc.ts`**

```typescript
import type { Context } from 'hono';
import type { Env } from '../env';
import { detectType } from '../lib/indicator';
import { sseStream } from '../lib/sse';
import { compositeScore } from '../lib/scoring';
import { ProviderCache } from '../lib/cache';
import { virustotal } from '../providers/virustotal';
import { abuseipdb } from '../providers/abuseipdb';
import { shodan } from '../providers/shodan';
import { greynoise } from '../providers/greynoise';
import { otx } from '../providers/otx';
import { urlscan } from '../providers/urlscan';
import { hybridanalysis } from '../providers/hybridanalysis';
import { pulsedive } from '../providers/pulsedive';
import {
  PROVIDER_SUPPORT,
  PROVIDER_TIMEOUT_MS,
  type ProviderAdapter,
  type ProviderId,
  type ProviderResult,
} from '../providers/types';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  virustotal,
  abuseipdb,
  shodan,
  greynoise,
  otx,
  urlscan,
  hybridanalysis,
  pulsedive,
};

export async function iocCheckHandler(c: Context<{ Bindings: Env }>) {
  const raw = c.req.query('indicator');
  if (!raw) return c.json({ error: 'missing indicator' }, 400);

  const type = detectType(raw);
  if (type === 'unknown') return c.json({ error: 'unrecognized indicator type' }, 400);

  const indicator = { type, value: raw.trim() };
  const cache = new ProviderCache(c.env.KV_CACHE);

  const eligible = (Object.keys(ADAPTERS) as ProviderId[]).filter((p) => PROVIDER_SUPPORT[p].includes(type));

  return sseStream<unknown>(async (write) => {
    write('meta', { type, value: indicator.value, providers: eligible });

    const env = {
      VT_API_KEY: c.env.VT_API_KEY ?? '',
      ABUSEIPDB_API_KEY: c.env.ABUSEIPDB_API_KEY ?? '',
      SHODAN_API_KEY: c.env.SHODAN_API_KEY ?? '',
      GREYNOISE_API_KEY: c.env.GREYNOISE_API_KEY ?? '',
      OTX_API_KEY: c.env.OTX_API_KEY ?? '',
      URLSCAN_API_KEY: c.env.URLSCAN_API_KEY ?? '',
      HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY ?? '',
      PULSEDIVE_API_KEY: c.env.PULSEDIVE_API_KEY ?? '',
    };

    const collected: ProviderResult[] = [];
    await Promise.all(
      eligible.map(async (p) => {
        const cached = await cache.get(p, indicator);
        if (cached) {
          collected.push(cached);
          write('result', cached);
          return;
        }
        const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
        try {
          const r = await ADAPTERS[p](indicator, env, signal);
          collected.push(r);
          write('result', r);
          if (r.status === 'ok') await cache.set(p, indicator, r);
        } catch (err) {
          const errResult: ProviderResult = {
            source: p,
            status: 'error',
            score: 0,
            verdict: 'unknown',
            raw_summary: {},
            tags: [],
            error: err instanceof Error ? err.message : String(err),
            fetched_at: new Date().toISOString(),
            cached: false,
          };
          collected.push(errResult);
          write('result', errResult);
        }
      })
    );

    write('done', compositeScore(type, collected));
  });
}
```

- [ ] **Step 5: Update `api/src/env.ts` to declare provider key secrets**

```typescript
export interface Env {
  KV_CACHE: KVNamespace;
  KV_SHARES: KVNamespace;
  R2_FILES: R2Bucket;
  VT_API_KEY: string;
  ABUSEIPDB_API_KEY: string;
  SHODAN_API_KEY: string;
  GREYNOISE_API_KEY: string;
  OTX_API_KEY: string;
  URLSCAN_API_KEY: string;
  HYBRID_ANALYSIS_API_KEY: string;
  PULSEDIVE_API_KEY: string;
}
```

- [ ] **Step 6: Wire route into `api/src/index.ts`**

```typescript
import { Hono } from 'hono';
import type { Env } from './env';
import { iocCheckHandler } from './routes/ioc';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/v1/health', (c) => c.json({ ok: true }));
app.get('/api/v1/ioc/check', iocCheckHandler);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
```

- [ ] **Step 7: Run, see all tests pass**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run
```

- [ ] **Step 8: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add api/src/lib/sse.ts api/src/routes/ api/src/index.ts api/src/env.ts api/test/routes/
git commit -m "feat(api): add SSE-streamed /api/v1/ioc/check route"
```

---

## Task 13: Frontend `IocCheck.tsx` page

**Goal:** real page in dfir-lab.ch dark/cyan aesthetic. Replaces `IocCheckPlaceholder.tsx`. Uses `EventSource` for SSE.

**Files:**

- Create: `src/pages/dfir/IocCheck.tsx`
- Create: `src/components/dfir/VerdictChip.tsx`
- Create: `src/components/dfir/IocResultRow.tsx`
- Create: `src/lib/dfir/api.ts`
- Delete: `src/pages/dfir/IocCheckPlaceholder.tsx`
- Modify: `src/App.tsx` (replace lazy import)
- Create: `src/components/__tests__/IocCheck.test.tsx`

- [ ] **Step 1: SSE client wrapper**

Path: `/Users/pranith/Documents/portfolio/src/lib/dfir/api.ts`

```typescript
export interface IocStreamHandlers {
  onMeta: (meta: { type: string; value: string; providers: string[] }) => void;
  onResult: (r: import('./types').ProviderResultWire) => void;
  onDone: (summary: { score: number; verdict: string; confidence: string; contributing: number }) => void;
  onError: (err: string) => void;
}

export function streamIoc(indicator: string, h: IocStreamHandlers): () => void {
  const url = `/api/v1/ioc/check?indicator=${encodeURIComponent(indicator)}`;
  const es = new EventSource(url);
  es.addEventListener('meta', (e) => h.onMeta(JSON.parse((e as MessageEvent).data)));
  es.addEventListener('result', (e) => h.onResult(JSON.parse((e as MessageEvent).data)));
  es.addEventListener('done', (e) => {
    h.onDone(JSON.parse((e as MessageEvent).data));
    es.close();
  });
  es.onerror = () => {
    h.onError('connection error');
    es.close();
  };
  return () => es.close();
}
```

Also create `src/lib/dfir/types.ts` with the `ProviderResultWire` type mirroring backend.

- [ ] **Step 2: VerdictChip component**

Path: `/Users/pranith/Documents/portfolio/src/components/dfir/VerdictChip.tsx`

```tsx
interface Props {
  verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
}

export function VerdictChip({ verdict }: Props): JSX.Element {
  const cls = {
    clean: 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/40',
    suspicious: 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40',
    malicious: 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40',
    unknown: 'bg-[#71717a]/15 text-[#a1a1aa] border-[#71717a]/40',
  }[verdict];
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-mono uppercase tracking-wide rounded border ${cls}`}>
      {verdict}
    </span>
  );
}
```

- [ ] **Step 3: IocResultRow component**

```tsx
import { VerdictChip } from './VerdictChip';
import type { ProviderResultWire } from '../../lib/dfir/types';

export function IocResultRow({ r }: { r: ProviderResultWire }): JSX.Element {
  return (
    <div className="rounded-lg border border-[#1f1f23] bg-[#111113] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display font-semibold text-[#fafafa] capitalize">{r.source}</span>
        <VerdictChip verdict={r.verdict} />
      </div>
      <div className="flex items-center gap-4 text-sm font-mono text-[#a1a1aa]">
        <span>
          score: <span className="text-[#fafafa]">{r.score}</span>
        </span>
        {r.cached && <span className="text-[#00fff9]">cached</span>}
        {r.status === 'error' && <span className="text-[#ef4444]">err: {r.error}</span>}
      </div>
      {r.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.tags.slice(0, 6).map((t) => (
            <span
              key={t}
              className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#0a0a0a] text-[#a1a1aa] border border-[#1f1f23]"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Main IocCheck page**

Path: `/Users/pranith/Documents/portfolio/src/pages/dfir/IocCheck.tsx`

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { detectType } from '../../lib/dfir/indicator-client';
import { streamIoc } from '../../lib/dfir/api';
import type { ProviderResultWire } from '../../lib/dfir/types';
import { IocResultRow } from '../../components/dfir/IocResultRow';
import { VerdictChip } from '../../components/dfir/VerdictChip';

interface Summary {
  score: number;
  verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
  contributing: number;
}

export default function IocCheck(): JSX.Element {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [results, setResults] = useState<ProviderResultWire[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<string[]>([]);
  const detectedType = input ? detectType(input) : 'unknown';

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || detectedType === 'unknown') return;
    setStreaming(true);
    setResults([]);
    setSummary(null);
    setError(null);
    streamIoc(input.trim(), {
      onMeta: (m) => setEligible(m.providers),
      onResult: (r) => setResults((prev) => [...prev, r]),
      onDone: (s) => {
        setSummary(s);
        setStreaming(false);
      },
      onError: (e) => {
        setError(e);
        setStreaming(false);
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir
        </Link>

        <h1 className="text-4xl font-display font-bold mb-2">IOC Checker</h1>
        <p className="text-[#a1a1aa] mb-8 max-w-2xl">
          IPs, domains, URLs, and file hashes — checked across 8 threat intel sources in parallel.
        </p>

        <form onSubmit={onSubmit} className="mb-10">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="paste an IP, domain, URL, or hash"
                className="w-full px-4 py-3 bg-[#111113] border border-[#1f1f23] rounded-lg font-mono text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:border-[#00fff9]/50"
              />
              {input && detectedType !== 'unknown' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#00fff9] uppercase">
                  {detectedType}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={streaming || detectedType === 'unknown'}
              className="px-5 py-3 bg-[#00fff9] text-[#0a0a0a] font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-[#22d3ee]"
            >
              <Search size={16} className="inline mr-2" />
              Check
            </button>
          </div>
          {input && detectedType === 'unknown' && (
            <p className="mt-2 text-xs font-mono text-[#f59e0b]">Unrecognized indicator format.</p>
          )}
        </form>

        {summary && (
          <section className="mb-8 rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-display font-bold text-2xl">Composite verdict</h2>
              <VerdictChip verdict={summary.verdict} />
            </div>
            <div className="flex items-center gap-4 font-mono text-sm text-[#a1a1aa]">
              <span>
                score: <span className="text-[#fafafa]">{summary.score}</span> / 100
              </span>
              <span>
                confidence: <span className="text-[#fafafa]">{summary.confidence}</span>
              </span>
              <span>
                {summary.contributing} of {eligible.length} responding
              </span>
            </div>
          </section>
        )}

        {(streaming || results.length > 0) && (
          <section>
            <h3 className="font-display font-semibold mb-4 text-lg">Per-source</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {eligible.map((p) => {
                const r = results.find((res) => res.source === p);
                if (r) return <IocResultRow key={p} r={r} />;
                return (
                  <div key={p} className="rounded-lg border border-[#1f1f23] bg-[#111113] p-4 animate-pulse">
                    <span className="font-display capitalize text-[#a1a1aa]">{p}</span>
                    <span className="block mt-2 text-xs font-mono text-[#71717a]">querying…</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {error && <p className="mt-6 text-sm font-mono text-[#ef4444]">stream error: {error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update `src/App.tsx`**

Find:

```tsx
const IocCheckPlaceholder = lazy(() => import('./pages/dfir/IocCheckPlaceholder'));
```

Replace with:

```tsx
const IocCheck = lazy(() => import('./pages/dfir/IocCheck'));
```

Find the `<Route path="/dfir/ioc-check" ...>` block, change `<IocCheckPlaceholder />` to `<IocCheck />`.

- [ ] **Step 6: Delete the placeholder**

```bash
rm /Users/pranith/Documents/portfolio/src/pages/dfir/IocCheckPlaceholder.tsx
```

- [ ] **Step 7: Update `DfirRoutes.test.tsx`**

The existing test asserts the IOC route renders with heading "IOC Checker" + "coming soon" text. The new page also has heading "IOC Checker" but **no** "coming soon" — instead it has the form and an empty state. Update that single test case to assert the form is present:

```tsx
{ path: '/dfir/ioc-check', heading: 'IOC Checker', form: true },
```

In the test body, when `form === true`, assert the input placeholder text is rendered, not "coming soon".

- [ ] **Step 8: Run tests**

```bash
cd /Users/pranith/Documents/portfolio && npm test -- --run
```

Expected: all pass (the IOC route test now asserts the real page; 6 placeholder tests stay; baseline 5 fails preserved).

- [ ] **Step 9: Lint + build**

```bash
npm run lint && npm run build
```

- [ ] **Step 10: Commit**

```bash
git add src/pages/dfir/IocCheck.tsx src/components/dfir/ src/lib/dfir/ src/App.tsx src/components/__tests__/DfirRoutes.test.tsx
git rm src/pages/dfir/IocCheckPlaceholder.tsx
git commit -m "feat(dfir): /dfir/ioc-check page with SSE streaming + dfir-lab.ch aesthetic"
```

---

## Task 14: Strip the IOC tab from existing `DFIR.tsx`

**Goal:** the old `analysis` tab in `DFIR.tsx` had an IOC mode + phishing mode. Remove the IOC mode (its functionality moved to `/dfir/ioc-check`). Keep the phishing mode for now — it migrates in Plan 4.

**Files:**

- Modify: `src/pages/DFIR.tsx`
- Modify: `src/components/DFIRNavigation.tsx` (relabel "analysis" if it now only contains phishing)

- [ ] **Step 1: Find the analysis tab block**

```bash
grep -n "activeTab === 'analysis'" /Users/pranith/Documents/portfolio/src/pages/DFIR.tsx
```

Around line 1504 there's a large block. Inside it is `analysisMode === 'ioc'` and `analysisMode === 'phishing'`.

- [ ] **Step 2: Remove the IOC mode**

Within the `activeTab === 'analysis'` block, delete:

- The IOC/Phishing mode toggle UI
- The entire `analysisMode === 'ioc'` JSX block + all `iocInput`, `iocResult`, `iocLoading` state and handlers
- Any imports that become unused

The phishing mode stays — it'll be migrated in Plan 4.

- [ ] **Step 3: Relabel the analysis tab**

In `src/components/DFIRNavigation.tsx`, change the `analysis` tab's `label` from `Analysis` to `Phishing` and its `description` from `IOC + Phishing` to `Email Analysis` (1 tool).

- [ ] **Step 4: Run tests**

The existing baseline of 5 failing tests + 62 passing should be preserved (or slightly different counts if removing IOC code happened to fix or break something — investigate any deltas).

- [ ] **Step 5: Manual smoke**

Run `npm run dev`, click Analysis tab — should now show only Phishing mode, no IOC. Click the new IOC card on /dfir landing — wait, we removed ToolGrid. **Navigate directly to** `/dfir/ioc-check` — should render the new live tool.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DFIR.tsx src/components/DFIRNavigation.tsx
git commit -m "refactor(dfir): remove IOC mode from analysis tab (migrated to /dfir/ioc-check)"
```

---

## Task 15: Remove `apiUrl` config UI

**Goal:** with the API now at the same origin as the SPA (`/api/v1/*`), there's no reason to expose a configurable backend URL. Strip it.

**Files:**

- Modify: `src/hooks/useDFIRSettings.ts` (drop `apiUrl`, keep other settings)
- Modify: `src/components/ConnectionStatus.tsx` (drop the URL editor UI; or delete the whole component if its only purpose was the URL editor)
- Modify: any callers of `apiUrl` from `useDFIRSettings`

- [ ] **Step 1: Find callers**

```bash
grep -rn "apiUrl\|setApiUrl" /Users/pranith/Documents/portfolio/src/ | grep -v __tests__ | head -20
```

- [ ] **Step 2: Update `useDFIRSettings`**

If the hook's only purpose was `apiUrl`, simplify it to just return defaults. If it has other settings (RSS feeds, etc.), drop only `apiUrl` / `setApiUrl`.

- [ ] **Step 3: Update `ConnectionStatus.tsx`**

The component had a label + input bound to `setApiUrl`. Either remove the editor part and keep a passive status indicator (showing online/offline of the configured-now-fixed `/api/v1/health`), or delete the component entirely if it's no longer providing value.

If keeping: change the health URL from `apiUrl + '/health'` to `/api/v1/health`. Same-origin, no CORS.

- [ ] **Step 4: Update callers in `DFIR.tsx`**

Anywhere `apiUrl` was used as the base for fetches (in tabs that haven't been migrated yet — domain, exposure, privacy, threatIntel), replace with relative `/api/v1/...` paths. Those tabs will get fully migrated in later plans, but at least their fetch URLs need to point to the new base. Until those tabs are migrated, those endpoints will 404 (the API Worker only has /health and /ioc/check).

A pragmatic alternative: feature-flag those tabs out for now (return null when `activeTab === 'domain'` etc., showing a "moved to /dfir/<tool>" message). Confirm direction with user during implementation if unclear.

- [ ] **Step 5: Run tests + lint + build**

```bash
cd /Users/pranith/Documents/portfolio && npm test -- --run && npm run lint && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDFIRSettings.ts src/components/ConnectionStatus.tsx src/pages/DFIR.tsx
git commit -m "refactor(dfir): remove apiUrl config (API is now same-origin)"
```

---

## Task 16: Live integration check (manual, no commit)

**Goal:** confirm the local-dev experience works. Two terminals.

- [ ] **Step 1: Terminal A — run the API Worker**

```bash
cd /Users/pranith/Documents/portfolio/api
npx wrangler dev
```

Wait for "Ready on http://localhost:8787". (You'll need API keys to actually get live results — without them, every provider returns a 401 error and the route still emits events with `status: 'error'`. Both states are valid; the UI handles them.)

- [ ] **Step 2: Terminal B — run Vite + proxy `/api/*` to the Worker**

In `vite.config.ts`, add (or verify) a proxy rule:

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:8787',
  },
},
```

Then:

```bash
cd /Users/pranith/Documents/portfolio
npm run dev
```

- [ ] **Step 3: Smoke test in browser**

Visit `http://localhost:5173/dfir/ioc-check`. Type `8.8.8.8`, hit Check. Verify:

- Indicator type chip shows `IPV4`
- 6 provider cards appear (the ones supporting IPv4: VT, AbuseIPDB, Shodan, GreyNoise, OTX, Pulsedive)
- Each fills in as the SSE stream emits
- Composite verdict appears after `done`

If any provider hangs > 5s, the AbortSignal kicks in and emits an error result. That's expected.

- [ ] **Step 4: No commit needed** — this step is observation only.

---

## Task 17: Set up real API keys (user-driven, optional for v1 ship)

**Goal:** populate the 8 provider secrets so production gets real data. Without this, every provider returns 401 errors and the UI shows "all providers failed".

This task is **deferred** by default. The IOC tool ships as "live infrastructure with no live data" until secrets are set. You can run it whenever you've registered for the 8 free-tier accounts.

For each provider, register and get a free-tier API key:

| Provider        | Sign-up URL                      | Free quota        |
| --------------- | -------------------------------- | ----------------- |
| VirusTotal      | https://www.virustotal.com/      | 4 lookups/min     |
| AbuseIPDB       | https://www.abuseipdb.com/       | 1k/day            |
| Shodan          | https://account.shodan.io/       | 100 lookups/month |
| GreyNoise       | https://www.greynoise.io/        | 1k/day community  |
| OTX AlienVault  | https://otx.alienvault.com/      | 10k pulses/month  |
| URLScan         | https://urlscan.io/              | 100/month         |
| Hybrid Analysis | https://www.hybrid-analysis.com/ | 100/month         |
| Pulsedive       | https://pulsedive.com/           | 500 lookups/month |

Then in your terminal (where wrangler is authenticated):

```bash
cd /Users/pranith/Documents/portfolio/api
npx wrangler secret put VT_API_KEY              # paste, hit enter
npx wrangler secret put ABUSEIPDB_API_KEY
npx wrangler secret put SHODAN_API_KEY
npx wrangler secret put GREYNOISE_API_KEY
npx wrangler secret put OTX_API_KEY
npx wrangler secret put URLSCAN_API_KEY
npx wrangler secret put HYBRID_ANALYSIS_API_KEY
npx wrangler secret put PULSEDIVE_API_KEY
```

For local dev, create `api/.dev.vars` (already in `.gitignore` from Plan 1 Task 3):

```
VT_API_KEY=...
ABUSEIPDB_API_KEY=...
...
```

Wrangler dev auto-loads `.dev.vars` into the Worker env.

No commit — secrets never go in git.

---

## Plan 2 exit criteria

- [ ] All 8 provider adapters tested with mocked HTTP, all green
- [ ] `compositeScore` weights tested for IP and hash indicator types
- [ ] `ProviderCache` tested (miss, set, get with cached=true, per-type TTL)
- [ ] `/api/v1/ioc/check` SSE route streams meta → results → done
- [ ] `/dfir/ioc-check` page renders, accepts input, displays results live
- [ ] `IocCheckPlaceholder.tsx` deleted
- [ ] Old IOC mode in `DFIR.tsx` analysis tab removed
- [ ] `apiUrl` config UI removed; `/api/v1/*` is same-origin
- [ ] Lint clean (errors); warning count not increased meaningfully
- [ ] Build succeeds; new bundle size delta documented
- [ ] All tests pass except the 5 known-failing baseline
- [ ] Branch `feature/dfir-integration` pushed
- [ ] Optional: secrets set, integration smoke tested live

---

## Notes for Plan 3 (next)

Plan 3 = Domain Lookup tool, same vertical-slice pattern: port the domain logic from `domain.py` legacy reference, build the page UI, replace `DomainPlaceholder.tsx`, strip the old domain tab. Cycle repeats for Phishing (Plan 4), Exposure (Plan 5), File Analyzer (Plan 6), Wiki (Plan 7), Dashboard (Plan 8). Each plan is small enough to execute in one focused session.

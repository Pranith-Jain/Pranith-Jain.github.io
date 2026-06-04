# Report Engine — Gather / Validate / Rank (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the Plan A planner output into real evidence — fetch the planned sources (cache + live), validate facts against ground truth, detect contradictions, and rank the evidence for the writer.

**Architecture:** Three modules under `api/src/lib/report/`. The gatherer uses a small registry of reusable _fetcher builders_ (one for cache sources, one for providers, plus bespoke ones for CVE/RAG/ransomware.live/MITRE) keyed by the `SOURCE_CATALOG` ids, so adding a source is data, not new control flow. Validator and ranker are pure functions over the gathered `SourceResult[]`.

**Tech Stack:** TypeScript, Cloudflare Workers, Vitest (`@cloudflare/vitest-pool-workers`, run un-sandboxed from `api/`). Reuses Plan A types + `freshnessDecay`, and existing repo helpers (`lookupCve`, `queryCorpus`, `fetchRlUpstream`, provider adapters, `ACTOR_ALIASES`, `ATTACK_ID_INDEX`, `techniquesForGroup`, `mitreGroupRef`).

**Spec:** `docs/superpowers/specs/2026-06-04-copilot-report-generator-design.md` §3.3, §3.4, §3.5.
**Depends on:** Plan A (`types.ts`, `source-planner.ts`, `confidence-ext.ts`). See its carry-forward note about catalog-id vs registry-key.

**Test runner:** `cd api && npx vitest run test/lib/report/<file>` (un-sandbox if the workerd runtime fails to boot).

---

## File structure

| File                              | Responsibility                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `api/src/lib/report/cache.ts`     | `readReportCache<T>(key)` — the Cache-API reader (extracted so gatherer + tests share it). |
| `api/src/lib/report/gatherer.ts`  | `FETCHERS` registry (id → fetcher) + `gatherPhase(plan, phaseIndex, ctx)` orchestration.   |
| `api/src/lib/report/validator.ts` | `validateFacts(input, ctx)` — CVE/MITRE/actor validation + contradiction detection.        |
| `api/src/lib/report/ranker.ts`    | `rankEvidence(sources, subject, nowMs)` — score & order items, trim to budget.             |
| `api/test/lib/report/*.test.ts`   | Unit tests per module (fetch/env mocked).                                                  |

---

## Task 1: Cache reader helper

**Files:** Create `api/src/lib/report/cache.ts`; Test `api/test/lib/report/cache.test.ts`.

- [ ] **Step 1: Failing test**

```ts
// api/test/lib/report/cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readReportCache } from '../../../src/lib/report/cache';

describe('readReportCache', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('returns parsed JSON on a cache hit', async () => {
    const match = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 })));
    vi.stubGlobal('caches', { default: { match } });
    expect(await readReportCache<{ ok: number }>('https://x.internal/k')).toEqual({ ok: 1 });
  });
  it('returns null on a miss', async () => {
    vi.stubGlobal('caches', { default: { match: vi.fn().mockResolvedValue(undefined) } });
    expect(await readReportCache('https://x.internal/k')).toBeNull();
  });
  it('returns null and does not throw when the cache API throws', async () => {
    vi.stubGlobal('caches', { default: { match: vi.fn().mockRejectedValue(new Error('boom')) } });
    expect(await readReportCache('https://x.internal/k')).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`cd api && npx vitest run test/lib/report/cache.test.ts`).

- [ ] **Step 3: Implement** `api/src/lib/report/cache.ts`:

```ts
/** Read a value previously written to the Cloudflare Cache API by a cron job. */
export async function readReportCache<T>(key: string): Promise<T | null> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(new Request(key));
    if (hit) return (await hit.json()) as T;
  } catch {
    /* miss / unavailable */
  }
  return null;
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git add api/src/lib/report/cache.ts api/test/lib/report/cache.test.ts && git commit -m "feat(report): cache reader helper"`.

---

## Task 2: Gatherer context + fetcher builders + registry

**Files:** Create `api/src/lib/report/gatherer.ts`; Test `api/test/lib/report/gatherer.test.ts`.

Background — real repo signatures the fetchers call:

- Cache keys (import from `../routes/<name>`): `RANSOMWARE_RECENT_CACHE_KEY` (`{victims:[{victim,group,discovered,description?,source_url,screen_url?}]}`), `LIVE_IOCS_CACHE_KEY` (`{items:[{value,kind,source,reporter?,context?,reference_url?,observed_at?}]}`), `ACTOR_TIMELINE_CACHE_KEY` (`{groups:[{slug,display_name,...,description?,mitre?}]}`), `WRITEUPS_CACHE_KEY` (`{items:[{title,url,source,published?,description?}]}`), `DETECTIONS_CACHE_KEY` (`{detections:[...]}`), `CYBERCRIME_CACHE_KEY` (`{items:[{title,url,source,category,published?,description?}]}`), `NEGOTIATIONS_CACHE_KEY` (`{negotiations:[{group,date?,initial_ransom?,negotiated_ransom?,paid,discount_pct?}]}`), `CVE_RECENT_CACHE_KEY` (`{cves:[{id,published,description,severity,score,kev}]}`), `IOC_CORRELATION_CACHE_KEY` (`{ips,urls,domains,hashes: [{value,kind,source_count,sources[],context?,last_seen?}]}`). `breach-disclosures` key is internal: `'https://breach-cache.internal/v6-hibp-only'` → `{breaches:[...]}`.
- `lookupCve(cveId)` from `../lib/cve-lookup` → `{ok:true,data:{cvss?,epss?,kev,description?,...}} | {ok:false,error}`.
- `queryCorpus(env, query, topK, typeFilter?)` from `../lib/rag-embedder` → `Array<{score,metadata:{source_id,source_type,title,url?,text,timestamp,...}}>`.
- `fetchRlUpstream(env, path)` from `../routes/ransomwarelive` → `unknown|null`; group profile path `/group/<name>`.
- Providers from `../providers/<name>`: `virustotal, abuseipdb, otx, greynoise, urlscan, malwarebazaar` (each `ProviderAdapter = (indicator,{env},signal)=>Promise<ProviderResult>`). `Indicator = {type,value}`.
- `ACTOR_ALIASES` from `../data/threat-actor-aliases` (`{slug,canonical,aliases[],mitreId?}`); `techniquesForGroup(mitreId)` from `../lib/ransomware-group-techniques` (`{id,name,tactic}[]`); `mitreGroupRef(mitreId)` from `../lib/ransomware-mitre-groups`.

- [ ] **Step 1: Failing test** (`api/test/lib/report/gatherer.test.ts`) — exercises the orchestration + a cache fetcher + a provider fetcher with everything mocked:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gatherPhase, FETCHERS } from '../../../src/lib/report/gatherer';
import { planSources } from '../../../src/lib/report/source-planner';
import type { GatherContext } from '../../../src/lib/report/gatherer';

const ctx = (): GatherContext => ({
  env: {} as never,
  subject: {
    raw: 'LockBit',
    type: 'ransomware',
    canonical: 'LockBit',
    identifiers: { group: 'LockBit' },
    suggestedTemplate: 'ransomware-group',
  },
  signal: AbortSignal.timeout(5000),
});

describe('gatherPhase', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('runs every fetcher in the phase and returns one SourceResult each', async () => {
    // Stub the cache so cache fetchers resolve to empty (status:empty), still one result each.
    vi.stubGlobal('caches', { default: { match: vi.fn().mockResolvedValue(undefined) } });
    const plan = planSources({ template: 'ransomware-group' }, { maxPhaseSubrequests: 40 });
    const results = await gatherPhase(plan, 0, ctx());
    // phase 0 contains all the cache + rag sources for the template
    expect(results.length).toBe(plan.phases[0].length);
    for (const r of results) {
      expect(r).toHaveProperty('id');
      expect(['ok', 'empty', 'error', 'timeout']).toContain(r.status);
      expect(Array.isArray(r.items)).toBe(true);
    }
  });

  it('a missing fetcher id yields an error SourceResult, not a throw', async () => {
    const result = await FETCHERS['__does_not_exist__']?.(
      { ...ctx() },
      {
        id: 'x',
        name: 'X',
        kind: 'live',
        authority: 'F',
        cost: 1,
        phase: 0,
      }
    );
    expect(result).toBeUndefined(); // registry has no such entry
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `api/src/lib/report/gatherer.ts`.** Use builders so each catalog id maps to a real fetch:

```ts
import type { Env } from '../env';
import type { PlannedSource, ResolvedSubject, SourceItem, SourceResult } from './types';
import { readReportCache } from './cache';
import { RANSOMWARE_RECENT_CACHE_KEY } from '../routes/ransomware-recent';
import { LIVE_IOCS_CACHE_KEY } from '../routes/live-iocs';
import { ACTOR_TIMELINE_CACHE_KEY } from '../routes/actor-timeline';
import { WRITEUPS_CACHE_KEY } from '../routes/writeups';
import { DETECTIONS_CACHE_KEY } from '../routes/detections';
import { CYBERCRIME_CACHE_KEY } from '../routes/cybercrime';
import { NEGOTIATIONS_CACHE_KEY } from '../routes/negotiations';
import { CVE_RECENT_CACHE_KEY } from '../routes/cve-recent';
import { IOC_CORRELATION_CACHE_KEY } from '../routes/ioc-correlation';
import { lookupCve } from '../lib/cve-lookup';
import { queryCorpus } from '../lib/rag-embedder';
import { fetchRlUpstream } from '../routes/ransomwarelive';
import { virustotal } from '../providers/virustotal';
import { abuseipdb } from '../providers/abuseipdb';
import { otx } from '../providers/otx';
import { greynoise } from '../providers/greynoise';
import { urlscan } from '../providers/urlscan';
import { malwarebazaar } from '../providers/malwarebazaar';
import type { ProviderAdapter } from '../providers/types';

export interface GatherContext {
  env: Env;
  subject: ResolvedSubject;
  signal: AbortSignal;
}

type Fetcher = (ctx: GatherContext, src: PlannedSource) => Promise<SourceResult>;

const MAX_ITEMS = 50;

function base(src: PlannedSource, status: SourceResult['status'], items: SourceItem[] = []): SourceResult {
  return {
    id: src.id,
    name: src.name,
    authority: src.authority,
    fetched_at: new Date().toISOString(),
    status,
    items: items.slice(0, MAX_ITEMS),
    total: items.length,
  };
}

const needle = (s: GatherContext) => s.subject.canonical.toLowerCase();
const has = (txt: unknown, q: string) => typeof txt === 'string' && txt.toLowerCase().includes(q);

/** Build a fetcher that reads a cache key and maps matching rows to SourceItems. */
function cacheFetcher(key: string, pick: (data: unknown, q: string) => SourceItem[]): Fetcher {
  return async (ctx, src) => {
    const data = await readReportCache<unknown>(key);
    if (!data) return base(src, 'empty');
    const items = pick(data, needle(ctx));
    return base(src, items.length ? 'ok' : 'empty', items);
  };
}

/** Build a fetcher that runs a provider adapter for ip/domain/hash subjects. */
function providerFetcher(adapter: ProviderAdapter): Fetcher {
  return async (ctx, src) => {
    const t = ctx.subject.type;
    const type = t === 'ip' ? 'ipv4' : t === 'domain' ? 'domain' : t === 'hash' ? 'sha256' : null;
    if (!type) return base(src, 'empty');
    try {
      const r = await adapter({ type, value: ctx.subject.canonical } as never, { ...ctx.env } as never, ctx.signal);
      if (r.status !== 'ok') return base(src, r.status === 'error' ? 'error' : 'empty');
      const item: SourceItem = {
        text: `${r.source}: ${r.verdict} (score ${r.score})${r.tags.length ? ' · ' + r.tags.join(', ') : ''}`,
        fields: r.raw_summary,
        observed_at: r.fetched_at,
      };
      return base(src, 'ok', [item]);
    } catch {
      return base(src, 'error');
    }
  };
}

// ---- row pickers (typed loosely; the cache shapes are heterogeneous) ----
type Row = Record<string, unknown>;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export const FETCHERS: Record<string, Fetcher> = {
  'ransomware-recent': cacheFetcher(RANSOMWARE_RECENT_CACHE_KEY, (d, q) =>
    arr((d as Row).victims)
      .filter((v) => has(v.group, q) || has(v.victim, q))
      .map((v) => ({
        text: `${str(v.victim) ?? '?'} claimed by ${str(v.group) ?? '?'} (${str(v.discovered) ?? ''}) ${str(v.description) ?? ''}`.trim(),
        url: str(v.source_url),
        observed_at: str(v.discovered),
        fields: v,
      }))
  ),
  negotiations: cacheFetcher(NEGOTIATIONS_CACHE_KEY, (d, q) =>
    arr((d as Row).negotiations)
      .filter((n) => has(n.group, q))
      .map((n) => ({
        text: `${str(n.group)} negotiation: initial ${String(n.initial_ransom ?? '?')} → ${String(n.negotiated_ransom ?? '?')} (paid: ${String(n.paid)})`,
        observed_at: str(n.date),
        fields: n,
      }))
  ),
  'actor-timeline': cacheFetcher(ACTOR_TIMELINE_CACHE_KEY, (d, q) =>
    arr((d as Row).groups)
      .filter((g) => has(g.slug, q) || has(g.display_name, q))
      .map((g) => ({ text: `${str(g.display_name) ?? str(g.slug)}: ${str(g.description) ?? ''}`.trim(), fields: g }))
  ),
  writeups: cacheFetcher(WRITEUPS_CACHE_KEY, (d, q) =>
    arr((d as Row).items)
      .filter((w) => has(w.title, q) || has(w.description, q))
      .map((w) => ({
        text: `${str(w.title)} — ${str(w.source)}`,
        url: str(w.url),
        observed_at: str(w.published),
        fields: w,
      }))
  ),
  cybercrime: cacheFetcher(CYBERCRIME_CACHE_KEY, (d, q) =>
    arr((d as Row).items)
      .filter((i) => has(i.title, q) || has(i.description, q))
      .map((i) => ({
        text: `${str(i.title)} — ${str(i.source)}`,
        url: str(i.url),
        observed_at: str(i.published),
        fields: i,
      }))
  ),
  detections: cacheFetcher(DETECTIONS_CACHE_KEY, (d, q) =>
    arr((d as Row).detections)
      .filter((x) => has(x.rule_name, q) || has(x.description, q))
      .map((x) => ({ text: `Detection: ${str(x.rule_name) ?? str(x.rule_id)}`, fields: x }))
  ),
  'cve-recent': cacheFetcher(CVE_RECENT_CACHE_KEY, (d, q) =>
    arr((d as Row).cves)
      .filter((c) => has(c.id, q) || has(c.description, q))
      .map((c) => ({
        text: `${str(c.id)} (${str(c.severity) ?? ''} ${String(c.score ?? '')}): ${str(c.description) ?? ''}`.trim(),
        observed_at: str(c.published),
        fields: c,
      }))
  ),
  'breach-disclosures': cacheFetcher('https://breach-cache.internal/v6-hibp-only', (d, q) =>
    arr((d as Row).breaches)
      .filter((b) => has(b.title, q) || has(b.name, q) || has(b.domain, q))
      .map((b) => ({ text: `${str(b.title) ?? str(b.name) ?? '?'}: ${str(b.description) ?? ''}`.trim(), fields: b }))
  ),
  'live-iocs': cacheFetcher(LIVE_IOCS_CACHE_KEY, (d, q) =>
    arr((d as Row).items)
      .filter((i) => has(i.value, q) || has(i.context, q))
      .map((i) => ({
        text: `${str(i.value)} (${str(i.kind)}) — ${str(i.source)} ${str(i.context) ?? ''}`.trim(),
        url: str(i.reference_url),
        observed_at: str(i.observed_at),
        fields: i,
      }))
  ),
  'ioc-correlation': cacheFetcher(IOC_CORRELATION_CACHE_KEY, (d, q) => {
    const buckets = ['ips', 'urls', 'domains', 'hashes'] as const;
    const out: SourceItem[] = [];
    for (const b of buckets)
      for (const row of arr((d as Row)[b]))
        if (has(row.value, q))
          out.push({
            text: `${str(row.value)} seen in ${String(row.source_count ?? 0)} sources`,
            observed_at: str(row.last_seen),
            fields: row,
          });
    return out;
  }),

  // RAG
  'rag-corpus': async (ctx, src) => {
    try {
      const chunks = await queryCorpus(ctx.env, ctx.subject.canonical, 8);
      const items: SourceItem[] = chunks.map((c) => ({
        text: c.metadata.text ?? c.metadata.title ?? '',
        url: c.metadata.url,
        observed_at: c.metadata.timestamp,
        fields: { score: c.score, source_type: c.metadata.source_type, title: c.metadata.title },
      }));
      return base(src, items.length ? 'ok' : 'empty', items);
    } catch {
      return base(src, 'error');
    }
  },

  // CVE live lookup (used by cve template ids nvd/epss/kev — one call covers all three)
  nvd: cveFetcher(),
  epss: cveFetcher(),
  kev: cveFetcher(),

  // ransomware.live group profile
  'ransomwarelive-profile': async (ctx, src) => {
    try {
      const rl = (await fetchRlUpstream(
        ctx.env,
        `/group/${encodeURIComponent(ctx.subject.canonical.toLowerCase())}`
      )) as {
        description?: string;
        ttps?: unknown[];
        vulnerabilities?: { CVE?: string }[];
        tools?: Record<string, string[]>;
        victims?: number;
      } | null;
      if (!rl) return base(src, 'empty');
      const items: SourceItem[] = [];
      if (rl.description) items.push({ text: rl.description, fields: { kind: 'description' } });
      if (typeof rl.victims === 'number')
        items.push({ text: `Victim count: ${rl.victims}`, fields: { kind: 'victims', victims: rl.victims } });
      for (const v of rl.vulnerabilities ?? [])
        if (v.CVE) items.push({ text: `Exploits ${v.CVE}`, fields: { kind: 'cve', cve: v.CVE } });
      for (const [tool, refs] of Object.entries(rl.tools ?? {}))
        items.push({ text: `Tool: ${tool}`, fields: { kind: 'tool', tool, refs } });
      return base(src, items.length ? 'ok' : 'empty', items);
    } catch {
      return base(src, 'error');
    }
  },

  // MITRE techniques for a known group
  'mitre-group': async (ctx, src) => {
    const { ACTOR_ALIASES } = await import('../data/threat-actor-aliases');
    const { techniquesForGroup } = await import('../lib/ransomware-group-techniques');
    const q = needle(ctx);
    const match = ACTOR_ALIASES.find(
      (a) =>
        a.mitreId && (a.slug === q || a.canonical.toLowerCase() === q || a.aliases.some((x) => x.toLowerCase() === q))
    );
    if (!match?.mitreId) return base(src, 'empty');
    const techs = techniquesForGroup(match.mitreId);
    return base(
      src,
      techs.length ? 'ok' : 'empty',
      techs.map((t) => ({ text: `${t.id} ${t.name} (${t.tactic})`, fields: { kind: 'mitre', ...t } }))
    );
  },

  // Providers (ioc template)
  virustotal: providerFetcher(virustotal),
  abuseipdb: providerFetcher(abuseipdb),
  otx: providerFetcher(otx),
  greynoise: providerFetcher(greynoise),
  urlscan: providerFetcher(urlscan),
  malwarebazaar: providerFetcher(malwarebazaar),
};

// Shared CVE fetcher (nvd/epss/kev all resolve from one lookupCve call).
function cveFetcher(): Fetcher {
  return async (ctx, src) => {
    if (ctx.subject.type !== 'cve') return base(src, 'empty');
    const r = await lookupCve(ctx.subject.canonical);
    if (!r.ok) return base(src, r.status === 404 ? 'empty' : 'error');
    const d = r.data;
    const items: SourceItem[] = [
      {
        text: `${d.cve_id}: ${d.description ?? ''}`.trim(),
        observed_at: d.published,
        fields: {
          kind: 'cve',
          cvss: d.cvss?.base_score,
          severity: d.cvss?.severity,
          epss: d.epss?.score,
          kev: d.kev?.in_kev,
        },
      },
    ];
    return base(src, 'ok', items);
  };
}
```

> Note: the `kev-cves`, `malpedia`, `wikipedia`, `actor-kb`, `shodan-cvedb` catalog ids are NOT in `FETCHERS` yet — `gatherPhase` (next) treats a missing fetcher as an `'empty'` SourceResult, so the plan still runs; wiring them is a small follow-up and is intentionally out of this task's minimal scope.

- [ ] **Step 4: Add `gatherPhase` to the same file:**

```ts
/** Run every fetcher in the given phase concurrently; missing fetchers → empty result. */
export async function gatherPhase(
  plan: { phases: PlannedSource[][] },
  phaseIndex: number,
  ctx: GatherContext
): Promise<SourceResult[]> {
  const phase = plan.phases[phaseIndex] ?? [];
  const settled = await Promise.allSettled(
    phase.map((src) => {
      const fetcher = FETCHERS[src.id];
      if (!fetcher) return Promise.resolve(base(src, 'empty'));
      return fetcher(ctx, src);
    })
  );
  return settled.map((s, i) => (s.status === 'fulfilled' ? s.value : base(phase[i], 'error')));
}
```

- [ ] **Step 5: Run → PASS** (`cd api && npx vitest run test/lib/report/gatherer.test.ts`). Then `cd api && npx tsc --noEmit -p tsconfig.json` and `cd .. && npx tsc -p api/tsconfig.worker.json --noEmit` — both clean. If any imported cache-key const name differs from the list above, grep the route file for `export const .*CACHE_KEY` and use the real name.

- [ ] **Step 6: Commit** `git add api/src/lib/report/gatherer.ts api/test/lib/report/gatherer.test.ts && git commit -m "feat(report): source gatherer (cache/provider/cve/rag/ransomware.live/mitre)"`.

---

## Task 3: Validator (fact-grounding + contradictions)

**Files:** Create `api/src/lib/report/validator.ts`; Test `api/test/lib/report/validator.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateMitreIds, validateActorNames, detectContradictions } from '../../../src/lib/report/validator';

describe('validateMitreIds', () => {
  it('keeps catalog IDs and drops unknown ones', () => {
    // T1486 exists in the enterprise catalog; T9999 does not.
    const { valid, rejected } = validateMitreIds(['T1486', 'T9999']);
    expect(valid).toContain('T1486');
    expect(rejected).toContain('T9999');
  });
});

describe('validateActorNames', () => {
  it('confirms a known alias and rejects gibberish', () => {
    const { valid, rejected } = validateActorNames(['LockBit', 'zzqqx-not-an-actor']);
    expect(valid.length).toBe(1);
    expect(rejected).toContain('zzqqx-not-an-actor');
  });
});

describe('detectContradictions', () => {
  it('flags two sources giving different ransom figures for the same victim', () => {
    const conflicts = detectContradictions([
      { sourceId: 'a', claimKey: 'ransom:acme', value: '1000000' },
      { sourceId: 'b', claimKey: 'ransom:acme', value: '2000000' },
      { sourceId: 'c', claimKey: 'ransom:beta', value: '500000' },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].claim).toBe('ransom:acme');
    expect(conflicts[0].positions.sort()).toEqual(['1000000', '2000000']);
  });
  it('returns nothing when sources agree', () => {
    expect(
      detectContradictions([
        { sourceId: 'a', claimKey: 'k', value: 'x' },
        { sourceId: 'b', claimKey: 'k', value: 'x' },
      ])
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `api/src/lib/report/validator.ts`:**

```ts
import { ATTACK_ID_INDEX } from '../data/attack-id-index';
import { ACTOR_ALIASES } from '../data/threat-actor-aliases';

/** Drop MITRE technique IDs not present in the canonical ATT&CK index. */
export function validateMitreIds(ids: string[]): { valid: string[]; rejected: string[] } {
  const valid: string[] = [];
  const rejected: string[] = [];
  for (const raw of ids) {
    const id = raw.trim().toUpperCase();
    (id in ATTACK_ID_INDEX ? valid : rejected).push(id);
  }
  return { valid, rejected };
}

/** Keep only actor names that resolve to a known alias/slug/canonical. */
export function validateActorNames(names: string[]): { valid: string[]; rejected: string[] } {
  const valid: string[] = [];
  const rejected: string[] = [];
  for (const name of names) {
    const q = name.trim().toLowerCase();
    const hit = ACTOR_ALIASES.some(
      (a) => a.slug === q || a.canonical.toLowerCase() === q || a.aliases.some((x) => x.toLowerCase() === q)
    );
    (hit ? valid : rejected).push(name);
  }
  return { valid, rejected };
}

export interface Claim {
  sourceId: string;
  claimKey: string; // canonical key for a fact, e.g. "ransom:acme" or "victims:lockbit"
  value: string;
}

export interface Conflict {
  claim: string;
  positions: string[];
  note: string;
}

/** Group claims by key; any key with ≥2 distinct values across sources is a conflict. */
export function detectContradictions(claims: Claim[]): Conflict[] {
  const byKey = new Map<string, Set<string>>();
  for (const c of claims) {
    if (!byKey.has(c.claimKey)) byKey.set(c.claimKey, new Set());
    byKey.get(c.claimKey)!.add(c.value);
  }
  const conflicts: Conflict[] = [];
  for (const [claim, values] of byKey) {
    if (values.size >= 2) conflicts.push({ claim, positions: [...values], note: 'sources disagree' });
  }
  return conflicts;
}
```

> CVE validation reuses `lookupCve` from the gatherer's CVE fetcher; a separate `validateCveId(id, env)` wrapper is unnecessary in v1 because the gatherer only emits a CVE item when `lookupCve` confirms it. Keep validation focused on MITRE/actor/contradictions here.

- [ ] **Step 4: Run → PASS.** If `T1486` is unexpectedly absent from `ATTACK_ID_INDEX`, open `api/src/data/attack-id-index.ts`, pick any key that IS present, and use it in the test (do not change the data file).
- [ ] **Step 5: Commit** `git add api/src/lib/report/validator.ts api/test/lib/report/validator.test.ts && git commit -m "feat(report): fact validator + contradiction detection"`.

---

## Task 4: Ranker

**Files:** Create `api/src/lib/report/ranker.ts`; Test `api/test/lib/report/ranker.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
import { describe, it, expect } from 'vitest';
import { rankEvidence } from '../../../src/lib/report/ranker';
import type { SourceResult } from '../../../src/lib/report/types';

const now = Date.parse('2026-06-04T00:00:00Z');
const src = (
  id: string,
  authority: SourceResult['authority'],
  observed: string | undefined,
  text: string
): SourceResult => ({
  id,
  name: id,
  authority,
  fetched_at: '2026-06-04T00:00:00Z',
  status: 'ok',
  total: 1,
  items: [{ text, observed_at: observed }],
});

describe('rankEvidence', () => {
  it('ranks a fresh authoritative relevant item above a stale low-authority one', () => {
    const ranked = rankEvidence(
      [
        src('a', 'A', '2026-06-03T00:00:00Z', 'LockBit ransomware activity'),
        src('b', 'E', '2025-01-01T00:00:00Z', 'unrelated note'),
      ],
      { canonical: 'LockBit' },
      now
    );
    expect(ranked[0].sourceId).toBe('a');
  });
  it('trims to maxItems', () => {
    const many: SourceResult[] = Array.from({ length: 30 }, (_, i) =>
      src(`s${i}`, 'C', '2026-06-03T00:00:00Z', 'LockBit item')
    );
    const ranked = rankEvidence(many, { canonical: 'LockBit' }, now, 10);
    expect(ranked).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `api/src/lib/report/ranker.ts`:**

```ts
import type { SourceReliability } from '../confidence';
import type { SourceResult } from './types';
import { freshnessDecay } from './confidence-ext';

export interface RankedItem {
  sourceId: string;
  authority: SourceReliability;
  text: string;
  url?: string;
  observed_at?: string;
  score: number;
}

const authorityWeight = (r: SourceReliability): number =>
  ({ A: 1.0, B: 0.85, C: 0.7, D: 0.5, E: 0.3, F: 0.15 })[r] ?? 0.15;

function relevance(text: string, canonical: string): number {
  const t = text.toLowerCase();
  const q = canonical.toLowerCase();
  if (!q) return 0.5;
  if (t.includes(q)) return 1.0;
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits = tokens.filter((tok) => t.includes(tok)).length;
  return tokens.length ? 0.3 + 0.7 * (hits / tokens.length) : 0.5;
}

/** Flatten source items and order by recency × authority × relevance; trim to maxItems. */
export function rankEvidence(
  sources: SourceResult[],
  subject: { canonical: string },
  nowMs: number,
  maxItems = 40
): RankedItem[] {
  const flat: RankedItem[] = [];
  for (const s of sources) {
    if (s.status !== 'ok') continue;
    for (const item of s.items) {
      const score =
        freshnessDecay(item.observed_at, nowMs) *
        authorityWeight(s.authority) *
        relevance(item.text, subject.canonical);
      flat.push({
        sourceId: s.id,
        authority: s.authority,
        text: item.text,
        url: item.url,
        observed_at: item.observed_at,
        score,
      });
    }
  }
  flat.sort((a, b) => b.score - a.score);
  return flat.slice(0, maxItems);
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git add api/src/lib/report/ranker.ts api/test/lib/report/ranker.test.ts && git commit -m "feat(report): evidence ranker (recency × authority × relevance)"`.

---

## Final verification

```
cd api && npx vitest run test/lib/report
cd .. && npx tsc -p api/tsconfig.worker.json --noEmit
cd api && npx tsc --noEmit -p tsconfig.json
cd .. && npx eslint api/src/lib/report --ext ts
```

All must pass / be clean.

## Leaves out (Plan C)

The writer (`writer.ts`): outline → per-section draft → assemble → hallucination guard, consuming `RankedItem[]` + the `CitationIndex` + `Conflict[]`.

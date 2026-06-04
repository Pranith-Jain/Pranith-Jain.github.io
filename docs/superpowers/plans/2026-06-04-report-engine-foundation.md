# Report Engine Foundation (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-logic foundation of the professional report generator — report types, subject resolver, budgeted source planner, citation index, confidence extensions, and the D1 `reports` table — all unit-tested, with no network or UI.

**Architecture:** A set of small, single-responsibility modules under `api/src/lib/report/` that the later async pipeline (`ReportBuilderDO`) and the existing Copilot both consume. This plan covers only the deterministic, side-effect-free pieces (Plans B–E add the I/O-bound gatherer/validator/ranker, the writer, the Durable Object, and the frontend). Everything here is unit-testable without mocking `fetch` or `env`.

**Tech Stack:** TypeScript, Cloudflare Workers (`api/`), Vitest (`@cloudflare/vitest-pool-workers`), D1 (SQLite migrations). Reuses `api/src/lib/confidence.ts` (Admiralty scoring) and the `detectType` entity classifier currently in `api/src/routes/copilot.ts`.

**Spec:** `docs/superpowers/specs/2026-06-04-copilot-report-generator-design.md` (§3.1, §3.2, §3.6, §3.7, §5).

**How to run tests in this repo (important):** the `api/` suite runs under `@cloudflare/vitest-pool-workers` and must run **un-sandboxed** from the `api/` dir, by directory (never the whole suite at once):

```
cd api && npx vitest run test/lib/report/<file>.test.ts
```

If your shell tool sandboxes Bash, disable the sandbox for these commands. These tests land under `test/lib/`, which CI runs.

---

## File structure

| File                                     | Responsibility                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `api/src/lib/report/types.ts`            | All shared report/engine types (Report, ResolvedSubject, SourcePlan, etc.). Declarations only.                      |
| `api/src/lib/report/subject-resolver.ts` | `detectType` (moved here) + `resolveSubject` — classify & canonicalize a query into a `ResolvedSubject`.            |
| `api/src/routes/copilot.ts`              | Modified: import `detectType` from the new module instead of defining it locally.                                   |
| `api/src/lib/report/source-planner.ts`   | `SOURCE_CATALOG` per template + `planSources` — pack source descriptors into subrequest-budgeted phases.            |
| `api/src/lib/report/citation-index.ts`   | `CitationIndex` — assign stable `[n]` refs, dedupe, expose ordered entries.                                         |
| `api/src/lib/report/confidence-ext.ts`   | `gradeSources` (per-source Admiralty grades) + `freshnessDecay` (temporal decay factor). Wraps `lib/confidence.ts`. |
| `migrations/0014_reports.sql`            | D1 `reports` table for persisted report jobs.                                                                       |
| `api/test/lib/report/*.test.ts`          | Unit tests per module.                                                                                              |

---

## Task 1: Report engine types

**Files:**

- Create: `api/src/lib/report/types.ts`

- [ ] **Step 1: Create the types module**

```ts
// api/src/lib/report/types.ts
import type { ConfidenceScore, SourceReliability, InfoCredibility } from '../confidence';

/** The four v1 report templates. */
export type TemplateId = 'ransomware-group' | 'threat-actor' | 'cve' | 'ioc';

/** Entity class of the report subject (mirrors copilot's QueryType). */
export type SubjectType = 'cve' | 'ip' | 'domain' | 'hash' | 'actor' | 'ransomware' | 'generic';

/** TLP marking shown on the report cover. */
export type Tlp = 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';

/** Output of subject-resolver: a normalized, classified subject. */
export interface ResolvedSubject {
  raw: string;
  type: SubjectType;
  canonical: string;
  identifiers: {
    cve?: string;
    iocType?: 'ipv4' | 'domain' | 'hash';
    group?: string;
    aliases?: string[];
  };
  suggestedTemplate: TemplateId;
}

/** Where a source's data comes from and how expensive it is to fetch. */
export type SourceKind = 'cache' | 'live' | 'rag';

/** A single planned source, before it is fetched. */
export interface SourceDescriptor {
  id: string;
  name: string;
  kind: SourceKind;
  authority: SourceReliability;
  /** Estimated subrequest cost (cache=0, rag=1, live=1+). */
  cost: number;
}

/** A descriptor assigned to an execution phase. */
export interface PlannedSource extends SourceDescriptor {
  phase: number;
}

/** Budget that bounds each execution phase. */
export interface Budget {
  maxPhaseSubrequests: number;
}

/** Result of planning: descriptors grouped into budget-bounded phases. */
export interface SourcePlan {
  template: TemplateId;
  phases: PlannedSource[][];
}

/** A normalized item from a fetched source (populated by the gatherer in Plan B). */
export interface SourceItem {
  text: string;
  url?: string;
  observed_at?: string;
  fields?: Record<string, unknown>;
}

/** A fetched source's results (Plan B). */
export interface SourceResult {
  id: string;
  name: string;
  authority: SourceReliability;
  fetched_at: string;
  status: 'ok' | 'timeout' | 'error' | 'empty';
  items: SourceItem[];
  total: number;
}

/** A single citation: a numbered reference back to an exact source fragment. */
export interface CitationEntry {
  ref: number;
  sourceId: string;
  name: string;
  authority: SourceReliability;
  url?: string;
  fragment: string;
  fetched_at?: string;
}

/** The persisted, structured report. */
export interface Report {
  meta: {
    id: string;
    subject: string;
    subject_type: SubjectType;
    template: TemplateId;
    tlp: Tlp;
    status: 'queued' | 'building' | 'done' | 'error';
    phase: string;
    model_used?: string;
    generated_at: string;
    timings?: Record<string, number>;
  };
  cover: {
    title: string;
    subtitle: string;
    tlp: Tlp;
    subject_badges: string[];
    generated_at: string;
  };
  executive_summary: string;
  key_findings: { text: string; confidence: 'High' | 'Medium' | 'Low'; refs: number[] }[];
  sections: { id: string; heading: string; body_md: string; refs: number[] }[];
  appendices: {
    iocs: { type: string; value: string; verdict?: string; first_seen?: string; refs: number[] }[];
    mitre: { tactic: string; technique_id: string; technique_name: string; refs: number[] }[];
    cves: { id: string; cvss?: number; epss?: number; kev?: boolean; refs: number[] }[];
    sources: {
      ref: number;
      name: string;
      authority: SourceReliability;
      credibility: InfoCredibility;
      url?: string;
      fetched_at?: string;
      freshness?: string;
    }[];
    conflicts: { claim: string; positions: string[]; note: string }[];
  };
  confidence: ConfidenceScore;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd api && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (no errors). The file is declarations only, so tsc is its test.

- [ ] **Step 3: Commit**

```bash
git add api/src/lib/report/types.ts
git commit -m "feat(report): shared report engine types"
```

---

## Task 2: Subject resolver (extract detectType + add resolveSubject)

**Files:**

- Create: `api/src/lib/report/subject-resolver.ts`
- Modify: `api/src/routes/copilot.ts` (remove local `detectType`, import it)
- Test: `api/test/lib/report/subject-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/lib/report/subject-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveSubject, detectType } from '../../../src/lib/report/subject-resolver';

describe('detectType', () => {
  it('classifies by format and keyword', () => {
    expect(detectType('CVE-2024-1709')).toBe('cve');
    expect(detectType('8.8.8.8')).toBe('ip');
    expect(detectType('evil.example.com')).toBe('domain');
    expect(detectType('a'.repeat(64))).toBe('hash');
    expect(detectType('LockBit 3.0')).toBe('ransomware');
    expect(detectType('Scattered Spider')).toBe('actor');
    expect(detectType('what is happening')).toBe('generic');
  });
});

describe('resolveSubject', () => {
  it('canonicalizes a CVE and suggests the cve template', () => {
    const r = resolveSubject('  cve-2024-1709 ');
    expect(r.type).toBe('cve');
    expect(r.canonical).toBe('CVE-2024-1709');
    expect(r.identifiers.cve).toBe('CVE-2024-1709');
    expect(r.suggestedTemplate).toBe('cve');
  });

  it('maps an IP to the ioc template and lowercases', () => {
    const r = resolveSubject('8.8.8.8');
    expect(r.type).toBe('ip');
    expect(r.identifiers.iocType).toBe('ipv4');
    expect(r.suggestedTemplate).toBe('ioc');
  });

  it('maps ransomware keyword to the ransomware-group template', () => {
    const r = resolveSubject('LockBit');
    expect(r.type).toBe('ransomware');
    expect(r.identifiers.group).toBe('LockBit');
    expect(r.suggestedTemplate).toBe('ransomware-group');
  });

  it('maps actor keyword to the threat-actor template', () => {
    expect(resolveSubject('APT29').suggestedTemplate).toBe('threat-actor');
  });

  it('defaults a hash to ioc and lowercases the canonical', () => {
    const h = 'AABBCCDDEEFF00112233445566778899';
    const r = resolveSubject(h);
    expect(r.type).toBe('hash');
    expect(r.canonical).toBe(h.toLowerCase());
    expect(r.identifiers.iocType).toBe('hash');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npx vitest run test/lib/report/subject-resolver.test.ts`
Expected: FAIL — cannot find module `subject-resolver`.

- [ ] **Step 3: Create the resolver (moving detectType verbatim)**

```ts
// api/src/lib/report/subject-resolver.ts
import type { ResolvedSubject, SubjectType, TemplateId } from './types';

const CVE_RE = /^CVE-\d{4}-\d{4,}$/i;
const IP_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const DOMAIN_RE = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const HASH_RE = /^[a-fA-F0-9]{32,64}$/;

/** Classify a free-text query into an entity type. Moved verbatim from copilot.ts. */
export function detectType(query: string): SubjectType {
  if (CVE_RE.test(query.trim())) return 'cve';
  if (IP_RE.test(query.trim())) return 'ip';
  if (DOMAIN_RE.test(query.trim())) return 'domain';
  if (HASH_RE.test(query.trim())) return 'hash';
  const lower = query.toLowerCase();
  if (
    [
      'lockbit',
      'ransom',
      'ransomware',
      'hive',
      'clop',
      'blackcat',
      'alphv',
      'royal',
      'play',
      'akira',
      'bashe',
      'bianlian',
      'cuba',
      'dragonforce',
      '8base',
    ].some((k) => lower.includes(k))
  )
    return 'ransomware';
  if (
    [
      'apt',
      'group',
      'actor',
      'threat',
      'scattered',
      'lazarus',
      'kimsu',
      'fancy',
      'cozy',
      'knotweed',
      'midnight',
      'volt',
      'typhoon',
      'panda',
      'dragon',
    ].some((k) => lower.includes(k))
  )
    return 'actor';
  return 'generic';
}

const TEMPLATE_BY_TYPE: Record<SubjectType, TemplateId> = {
  cve: 'cve',
  ip: 'ioc',
  domain: 'ioc',
  hash: 'ioc',
  actor: 'threat-actor',
  ransomware: 'ransomware-group',
  generic: 'threat-actor',
};

/**
 * Classify + canonicalize a query into a ResolvedSubject. Alias resolution
 * against the actor/ransomware KBs is layered in Plan B; here we only do
 * format-level canonicalization (no network, no catalog imports).
 */
export function resolveSubject(query: string): ResolvedSubject {
  const raw = query;
  const trimmed = query.trim();
  const type = detectType(trimmed);
  const identifiers: ResolvedSubject['identifiers'] = {};
  let canonical = trimmed;

  switch (type) {
    case 'cve':
      canonical = trimmed.toUpperCase();
      identifiers.cve = canonical;
      break;
    case 'ip':
      identifiers.iocType = 'ipv4';
      break;
    case 'domain':
      canonical = trimmed.toLowerCase();
      identifiers.iocType = 'domain';
      break;
    case 'hash':
      canonical = trimmed.toLowerCase();
      identifiers.iocType = 'hash';
      break;
    case 'ransomware':
      identifiers.group = trimmed;
      break;
    case 'actor':
    case 'generic':
      break;
  }

  return { raw, type, canonical, identifiers, suggestedTemplate: TEMPLATE_BY_TYPE[type] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npx vitest run test/lib/report/subject-resolver.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Point copilot.ts at the shared detectType**

In `api/src/routes/copilot.ts`, delete the local `detectType` function (currently lines ~53–100) and the now-unneeded regex consts **only if they are not used elsewhere in the file** (`CVE_RE`, `IP_RE`, `DOMAIN_RE`, `HASH_RE` — grep first; keep any still referenced). Add an import near the top of the file:

```ts
import { detectType } from '../lib/report/subject-resolver';
```

Keep the local `type QueryType` alias OR replace its uses with `SubjectType`; simplest is to leave `QueryType` as a local alias:

```ts
import type { SubjectType } from '../lib/report/types';
type QueryType = SubjectType;
```

- [ ] **Step 6: Verify copilot still compiles and its tests pass**

Run:

```
cd api && npx tsc --noEmit -p tsconfig.json && npx vitest run test/routes/cti.test.ts
cd .. && npx tsc -p api/tsconfig.worker.json --noEmit
```

Expected: all PASS (no unused-var or type errors; copilot route still typechecks under the worker config).

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/report/subject-resolver.ts api/test/lib/report/subject-resolver.test.ts api/src/routes/copilot.ts
git commit -m "feat(report): subject resolver; share detectType with copilot"
```

---

## Task 3: Source planner (budget-bounded phasing)

**Files:**

- Create: `api/src/lib/report/source-planner.ts`
- Test: `api/test/lib/report/source-planner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/lib/report/source-planner.test.ts
import { describe, it, expect } from 'vitest';
import { planSources, packIntoPhases, SOURCE_CATALOG } from '../../../src/lib/report/source-planner';
import type { SourceDescriptor } from '../../../src/lib/report/types';

const d = (id: string, kind: SourceDescriptor['kind'], cost: number): SourceDescriptor => ({
  id,
  name: id,
  kind,
  authority: 'C',
  cost,
});

describe('packIntoPhases', () => {
  it('keeps every phase at or under the budget', () => {
    const descs = [d('a', 'live', 20), d('b', 'live', 20), d('c', 'live', 20)];
    const phases = packIntoPhases(descs, 40);
    expect(phases.length).toBe(2); // 20+20 | 20
    for (const phase of phases) {
      expect(phase.reduce((n, s) => n + s.cost, 0)).toBeLessThanOrEqual(40);
    }
    expect(
      phases
        .flat()
        .map((s) => s.id)
        .sort()
    ).toEqual(['a', 'b', 'c']);
  });

  it('puts all zero-cost (cache) sources in the first phase', () => {
    const descs = [d('c1', 'cache', 0), d('c2', 'cache', 0), d('l1', 'live', 30)];
    const phases = packIntoPhases(descs, 40);
    expect(phases[0].filter((s) => s.kind === 'cache').map((s) => s.id)).toEqual(['c1', 'c2']);
  });

  it('drops a single source that exceeds the budget into its own phase', () => {
    const phases = packIntoPhases([d('big', 'live', 50)], 40);
    expect(phases.length).toBe(1);
    expect(phases[0][0].id).toBe('big');
  });
});

describe('planSources', () => {
  it('produces a plan whose every phase respects the budget', () => {
    const plan = planSources({ template: 'ransomware-group' }, { maxPhaseSubrequests: 40 });
    expect(plan.template).toBe('ransomware-group');
    expect(plan.phases.length).toBeGreaterThan(0);
    for (const phase of plan.phases) {
      expect(phase.reduce((n, s) => n + s.cost, 0)).toBeLessThanOrEqual(40);
    }
    // every catalog source for the template is present exactly once
    const planned = plan.phases
      .flat()
      .map((s) => s.id)
      .sort();
    const catalog = SOURCE_CATALOG['ransomware-group'].map((s) => s.id).sort();
    expect(planned).toEqual(catalog);
  });

  it('assigns ascending phase numbers', () => {
    const plan = planSources({ template: 'ioc' }, { maxPhaseSubrequests: 40 });
    plan.phases.forEach((phase, i) => phase.forEach((s) => expect(s.phase).toBe(i)));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npx vitest run test/lib/report/source-planner.test.ts`
Expected: FAIL — cannot find module `source-planner`.

- [ ] **Step 3: Implement the planner**

```ts
// api/src/lib/report/source-planner.ts
import type { Budget, PlannedSource, SourceDescriptor, SourcePlan, TemplateId } from './types';

/**
 * Per-template source descriptors. `cache` = KV/Cache-API snapshot (≈0 subrequest
 * cost after warm), `rag` = one Vectorize query, `live` = budgeted fetch(es).
 * Authority grades come from the reliability registry in lib/confidence.ts.
 * The gatherer (Plan B) maps each id to an actual fetch.
 */
export const SOURCE_CATALOG: Record<TemplateId, SourceDescriptor[]> = {
  'ransomware-group': [
    { id: 'ransomware-recent', name: 'Ransomware Recent', kind: 'cache', authority: 'B', cost: 0 },
    { id: 'negotiations', name: 'Negotiations', kind: 'cache', authority: 'B', cost: 0 },
    { id: 'actor-timeline', name: 'Actor Timeline', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'writeups', name: 'CTI Writeups', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'ransomwarelive-profile', name: 'ransomware.live profile', kind: 'live', authority: 'B', cost: 4 },
    { id: 'malpedia', name: 'Malpedia', kind: 'live', authority: 'A', cost: 2 },
    { id: 'mitre-group', name: 'MITRE ATT&CK group', kind: 'live', authority: 'A', cost: 2 },
    { id: 'kev-cves', name: 'CISA KEV (group CVEs)', kind: 'live', authority: 'A', cost: 2 },
  ],
  'threat-actor': [
    { id: 'actor-timeline', name: 'Actor Timeline', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'cybercrime', name: 'Cybercrime', kind: 'cache', authority: 'D', cost: 0 },
    { id: 'writeups', name: 'CTI Writeups', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'actor-kb', name: 'Threat Actor KB', kind: 'live', authority: 'B', cost: 1 },
    { id: 'mitre-group', name: 'MITRE ATT&CK group', kind: 'live', authority: 'A', cost: 2 },
    { id: 'malpedia', name: 'Malpedia', kind: 'live', authority: 'A', cost: 2 },
    { id: 'wikipedia', name: 'Wikipedia', kind: 'live', authority: 'D', cost: 2 },
  ],
  cve: [
    { id: 'cve-recent', name: 'CVE Recent', kind: 'cache', authority: 'B', cost: 0 },
    { id: 'detections', name: 'Detections', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'nvd', name: 'NVD', kind: 'live', authority: 'A', cost: 2 },
    { id: 'epss', name: 'EPSS', kind: 'live', authority: 'A', cost: 1 },
    { id: 'kev', name: 'CISA KEV', kind: 'live', authority: 'A', cost: 1 },
    { id: 'shodan-cvedb', name: 'Shodan CVEDB', kind: 'live', authority: 'B', cost: 2 },
  ],
  ioc: [
    { id: 'live-iocs', name: 'Live IOCs', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'ioc-correlation', name: 'IOC Correlation', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'virustotal', name: 'VirusTotal', kind: 'live', authority: 'C', cost: 1 },
    { id: 'abuseipdb', name: 'AbuseIPDB', kind: 'live', authority: 'C', cost: 1 },
    { id: 'greynoise', name: 'GreyNoise', kind: 'live', authority: 'B', cost: 1 },
    { id: 'otx', name: 'AlienVault OTX', kind: 'live', authority: 'C', cost: 1 },
    { id: 'urlscan', name: 'URLScan', kind: 'live', authority: 'C', cost: 1 },
    { id: 'malwarebazaar', name: 'MalwareBazaar', kind: 'live', authority: 'A', cost: 1 },
  ],
};

/**
 * Greedy first-fit bin packing: cache/rag (cheap) sources fill phase 0 first,
 * then live sources are packed so each phase's summed cost stays within `max`.
 * A single source whose cost exceeds `max` gets its own phase (it cannot be
 * split). Order within the input is preserved.
 */
export function packIntoPhases(descriptors: SourceDescriptor[], max: number): PlannedSource[][] {
  const cheap = descriptors.filter((s) => s.cost === 0);
  const costly = descriptors.filter((s) => s.cost > 0);

  const phases: SourceDescriptor[][] = [];
  // Phase 0 seeded with all zero-cost sources.
  let current: SourceDescriptor[] = [...cheap];
  let currentCost = 0;

  for (const src of costly) {
    if (currentCost + src.cost > max && current.length > 0) {
      phases.push(current);
      current = [];
      currentCost = 0;
    }
    current.push(src);
    currentCost += src.cost;
  }
  if (current.length > 0) phases.push(current);
  if (phases.length === 0) phases.push([]);

  return phases.map((phase, i) => phase.map((s) => ({ ...s, phase: i })));
}

/** Build a budgeted execution plan for a template. */
export function planSources(input: { template: TemplateId }, budget: Budget): SourcePlan {
  const descriptors = SOURCE_CATALOG[input.template];
  return { template: input.template, phases: packIntoPhases(descriptors, budget.maxPhaseSubrequests) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npx vitest run test/lib/report/source-planner.test.ts`
Expected: PASS.

> Note on the first test: the `'ransomware-group'` catalog above has cheap sources (phase 0) plus live sources costing 4+2+2+2 = 10, which fits one phase at budget 40 — so a real plan may be a single phase. The `packIntoPhases` unit test uses synthetic 20/20/20 descriptors to exercise the splitting path directly, independent of the catalog.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/report/source-planner.ts api/test/lib/report/source-planner.test.ts
git commit -m "feat(report): budget-bounded source planner + per-template catalog"
```

---

## Task 4: Citation index

**Files:**

- Create: `api/src/lib/report/citation-index.ts`
- Test: `api/test/lib/report/citation-index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/lib/report/citation-index.test.ts
import { describe, it, expect } from 'vitest';
import { CitationIndex } from '../../../src/lib/report/citation-index';

describe('CitationIndex', () => {
  it('assigns stable ascending refs starting at 1', () => {
    const idx = new CitationIndex();
    const a = idx.ref({ sourceId: 'nvd', name: 'NVD', authority: 'A', fragment: 'CVE-2024-1709 CVSS 10.0' });
    const b = idx.ref({ sourceId: 'kev', name: 'CISA KEV', authority: 'A', fragment: 'added 2024-02-22' });
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('dedupes identical (sourceId, fragment) to the same ref', () => {
    const idx = new CitationIndex();
    const first = idx.ref({ sourceId: 'nvd', name: 'NVD', authority: 'A', fragment: 'same' });
    const again = idx.ref({ sourceId: 'nvd', name: 'NVD', authority: 'A', fragment: 'same' });
    expect(again).toBe(first);
    expect(idx.entries()).toHaveLength(1);
  });

  it('returns entries in ref order', () => {
    const idx = new CitationIndex();
    idx.ref({ sourceId: 's1', name: 'S1', authority: 'C', fragment: 'x' });
    idx.ref({ sourceId: 's2', name: 'S2', authority: 'C', fragment: 'y' });
    expect(idx.entries().map((e) => e.ref)).toEqual([1, 2]);
    expect(idx.entries().map((e) => e.sourceId)).toEqual(['s1', 's2']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npx vitest run test/lib/report/citation-index.test.ts`
Expected: FAIL — cannot find module `citation-index`.

- [ ] **Step 3: Implement the citation index**

```ts
// api/src/lib/report/citation-index.ts
import type { CitationEntry } from './types';
import type { SourceReliability } from '../confidence';

type CiteInput = {
  sourceId: string;
  name: string;
  authority: SourceReliability;
  fragment: string;
  url?: string;
  fetched_at?: string;
};

/** Assigns stable [n] citation numbers and dedupes by (sourceId, fragment). */
export class CitationIndex {
  private byKey = new Map<string, number>();
  private list: CitationEntry[] = [];

  ref(input: CiteInput): number {
    const key = `${input.sourceId}::${input.fragment}`;
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;

    const ref = this.list.length + 1;
    this.byKey.set(key, ref);
    this.list.push({
      ref,
      sourceId: input.sourceId,
      name: input.name,
      authority: input.authority,
      fragment: input.fragment,
      url: input.url,
      fetched_at: input.fetched_at,
    });
    return ref;
  }

  entries(): CitationEntry[] {
    return [...this.list];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npx vitest run test/lib/report/citation-index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/report/citation-index.ts api/test/lib/report/citation-index.test.ts
git commit -m "feat(report): stable citation index with dedupe"
```

---

## Task 5: Confidence extensions (per-source grades + temporal decay)

**Files:**

- Create: `api/src/lib/report/confidence-ext.ts`
- Test: `api/test/lib/report/confidence-ext.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/lib/report/confidence-ext.test.ts
import { describe, it, expect } from 'vitest';
import { gradeSources, freshnessDecay } from '../../../src/lib/report/confidence-ext';

describe('gradeSources', () => {
  it('returns a known registry grade and falls back to F for unknown ids', () => {
    const grades = gradeSources(['nvd', 'totally-unknown-source']);
    const nvd = grades.find((g) => g.id === 'nvd');
    const unknown = grades.find((g) => g.id === 'totally-unknown-source');
    expect(nvd).toBeDefined();
    expect(['A', 'B']).toContain(nvd!.reliability); // NVD is a primary source
    expect(unknown!.reliability).toBe('F');
  });
});

describe('freshnessDecay', () => {
  const now = Date.parse('2026-06-04T00:00:00Z');
  it('is 1.0 for a just-fetched source', () => {
    expect(freshnessDecay('2026-06-04T00:00:00Z', now)).toBeCloseTo(1.0, 5);
  });
  it('halves roughly every 30 days', () => {
    const thirtyDaysAgo = '2026-05-05T00:00:00Z';
    expect(freshnessDecay(thirtyDaysAgo, now)).toBeCloseTo(0.5, 1);
  });
  it('clamps undefined/invalid timestamps to a low but non-zero floor', () => {
    expect(freshnessDecay(undefined, now)).toBeGreaterThan(0);
    expect(freshnessDecay('not-a-date', now)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npx vitest run test/lib/report/confidence-ext.test.ts`
Expected: FAIL — cannot find module `confidence-ext`.

- [ ] **Step 3: Implement the extensions**

```ts
// api/src/lib/report/confidence-ext.ts
import { SOURCE_RELIABILITY_REGISTRY, type SourceReliability } from '../confidence';

export interface SourceGrade {
  id: string;
  reliability: SourceReliability;
  description?: string;
}

/** Per-source Admiralty reliability for the report's sources appendix. */
export function gradeSources(sourceIds: string[]): SourceGrade[] {
  return sourceIds.map((id) => {
    const entry = SOURCE_RELIABILITY_REGISTRY[id];
    return {
      id,
      reliability: entry?.reliability ?? 'F',
      description: entry?.description,
    };
  });
}

const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FLOOR = 0.1;

/**
 * Temporal decay factor in (FLOOR, 1] using a 30-day half-life. A freshly
 * fetched/observed claim scores 1.0; a 30-day-old one ≈0.5. Invalid or missing
 * timestamps clamp to FLOOR so stale-but-unknown data is down-weighted, not zeroed.
 */
export function freshnessDecay(observedAt: string | undefined, nowMs: number): number {
  if (!observedAt) return FLOOR;
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return FLOOR;
  const ageMs = Math.max(0, nowMs - t);
  const factor = Math.pow(0.5, ageMs / HALF_LIFE_MS);
  return Math.max(FLOOR, Math.min(1, factor));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npx vitest run test/lib/report/confidence-ext.test.ts`
Expected: PASS.

> If the `nvd` registry key differs from the assumption, open `api/src/lib/confidence.ts`, find the NVD entry in `SOURCE_RELIABILITY_REGISTRY`, and use its exact key in the test. Do not change the registry.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/report/confidence-ext.ts api/test/lib/report/confidence-ext.test.ts
git commit -m "feat(report): per-source grades + temporal decay helpers"
```

---

## Task 6: D1 `reports` table migration

**Files:**

- Create: `migrations/0014_reports.sql`

- [ ] **Step 1: Create the migration**

```sql
-- migrations/0014_reports.sql
-- Persisted report-generation jobs for the Copilot full-report pipeline.
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  template    TEXT NOT NULL,
  tlp         TEXT NOT NULL DEFAULT 'AMBER',
  status      TEXT NOT NULL DEFAULT 'queued',  -- queued | building | done | error
  report_json TEXT,                            -- serialized Report (null until first phase persists)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports (status, created_at);
```

- [ ] **Step 2: Apply locally and verify the schema**

Run (local, non-destructive):

```
npx wrangler d1 migrations apply pranithjain-briefings --local
npx wrangler d1 execute pranithjain-briefings --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='reports';"
```

Expected: the apply reports `0014_reports.sql` applied; the SELECT returns a row with `reports`.

> Do **NOT** run `--remote` here. Remote application is a production change — leave it for the deploy step of a later plan, and only with explicit user confirmation (see the deploy checklist).

- [ ] **Step 3: Commit**

```bash
git add migrations/0014_reports.sql
git commit -m "feat(report): D1 reports table (0014)"
```

---

## Final verification (run after all tasks)

- [ ] **Run the whole report test directory**

```
cd api && npx vitest run test/lib/report
```

Expected: all four test files pass.

- [ ] **Typecheck both projects**

```
cd .. && npx tsc -p api/tsconfig.worker.json --noEmit && cd api && npx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Lint**

```
cd .. && npx eslint api/src/lib/report --ext ts
```

Expected: clean (0 warnings).

---

## What Plan A deliberately leaves out (next plans)

- **Plan B — Gather/Validate/Rank:** `gatherer.ts` (cache + live fetches, `env`/`fetch`-mocked), `validator.ts` (NVD/MITRE/actor validation + contradiction detection), `ranker.ts` (recency×authority×relevance using `freshnessDecay`).
  - **Carry-forward note (from Plan A review):** `SOURCE_CATALOG` ids in `source-planner.ts` (e.g. `kev`, `greynoise`, `shodan-cvedb`) do NOT match `SOURCE_RELIABILITY_REGISTRY` keys (e.g. `cisa-kev`), and several have no registry entry. The catalog carries the correct grade inline in its `authority` field — so the sources appendix MUST use `descriptor.authority`, NOT `gradeSources(catalogId)` (which would silently fall back to `F`). If registry grades are wanted, add an explicit `catalogId → registryId` map in Plan B; do not pass catalog ids straight into `gradeSources`.
- **Plan C — Writer:** outline → per-section draft → assemble → hallucination guard, via `runCompletion`.
- **Plan D — `ReportBuilderDO` + `report.ts` endpoints + WS streaming** (+ wrangler DO binding).
- **Plan E — Frontend:** Copilot mode toggle, template/TLP pickers, phase stepper, Report renderer, PDF export.

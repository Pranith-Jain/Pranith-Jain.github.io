# LLM Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an additive LLM-backed entity-extraction pass (sectors, affected products, MITRE ATT&CK techniques, candidate actor/malware names) to the cron-warmed intel-bundle pipeline. Output is reconciled through strict guardrails so hallucinated attribution can never enter the canonical view.

**Architecture:** A new pure-ish helper `extractLlm()` calls Groq → Workers AI via the existing `runCompletion()` client and parses a strict JSON schema. The cron warmer (`warmIntelBundles`) invokes it in parallel with `enrichBulk` and `enrichCves`. Output threads through `buildStixBundle` — proper `attack-pattern` SDOs go into the bundle; sectors, products, and actor/malware **candidates** ride on `report.x_*` extension fields and on a new section of `IntelView`. The synchronous on-demand intel-bundle routes stay regex/dict-only.

**Tech Stack:** TypeScript, Cloudflare Workers (Hono), D1, Groq + Workers AI (via existing `runCompletion`), vitest with `@cloudflare/vitest-pool-workers`, React 18, Tailwind.

**Reference spec:** `docs/superpowers/specs/2026-05-22-llm-extraction-design.md`

---

## File Structure

| Path                                     | Status | Responsibility                                                                                                                       |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `api/src/lib/extract-llm.ts`             | new    | LLM extractor: types, skip rule, tolerant JSON parser, per-class validators, `extractLlm()` entry point with `runCompletion` DI seam |
| `api/src/lib/stix-build.ts`              | modify | Extended `buildStixBundle` signature, new `attack-pattern` SDOs + relationships, `x_*` extensions on report, new `IntelView` fields  |
| `api/src/lib/intel-bundle-warm.ts`       | modify | Call `extractLlm()` in the `Promise.all` alongside bulk + CVE enrichment, pass `llmEntities` to `buildStixBundle`                    |
| `src/hooks/useIntelBundle.ts`            | modify | `IntelView` type mirror — new optional fields                                                                                        |
| `src/components/intel/IntelCard.tsx`     | modify | Render sectors chip row, affected-products section, attack-pattern chips, candidates `<details>` disclosure, LLM provenance badges   |
| `api/test/lib/extract-llm.test.ts`       | new    | Unit tests for parser / validators / skip / error paths                                                                              |
| `api/test/lib/stix-build.test.ts`        | modify | New `describe('LLM entities')` group                                                                                                 |
| `api/test/lib/intel-bundle-warm.test.ts` | modify | DI-stub the LLM call; assert view fields land on the persisted bundle                                                                |

---

## Task 1: Scaffold extract-llm.ts (types + skip rule + DI shape)

**Files:**

- Create: `api/src/lib/extract-llm.ts`
- Create: `api/test/lib/extract-llm.test.ts`

- [ ] **Step 1: Write the failing test for the skip rule**

Create `api/test/lib/extract-llm.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { env as testEnv } from 'cloudflare:test';
import { extractLlm, EMPTY_LLM_ENTITIES } from '../../src/lib/extract-llm';
import type { Env } from '../../src/env';
import type { ExtractedEntities } from '../../src/lib/extract';

const env = testEnv as unknown as Env;

const emptyEntities: ExtractedEntities = {
  iocs: [],
  actors: [],
  malware: [],
  cves: [],
  tags: [],
  summary: '',
};

describe('extractLlm — skip rule', () => {
  it('returns ran:false and never calls runCompletion when body is under 600 chars', async () => {
    const runCompletion = vi.fn();
    const out = await extractLlm('Short brief', 'Body too short', emptyEntities, env, {
      runCompletion: runCompletion as never,
    });
    expect(out.ran).toBe(false);
    expect(out.sectors).toEqual([]);
    expect(out.actorCandidates).toEqual([]);
    expect(runCompletion).not.toHaveBeenCalled();
  });

  it('returns ran:false when findingsCount is 0 even with a long body', async () => {
    const runCompletion = vi.fn();
    const longBody = 'A'.repeat(2000);
    const out = await extractLlm('Long brief with no findings', longBody, emptyEntities, env, {
      runCompletion: runCompletion as never,
      findingsCount: 0,
    });
    expect(out.ran).toBe(false);
    expect(runCompletion).not.toHaveBeenCalled();
  });

  it('EMPTY_LLM_ENTITIES has every array empty + ran:false', () => {
    expect(EMPTY_LLM_ENTITIES.ran).toBe(false);
    expect(EMPTY_LLM_ENTITIES.partial).toBe(false);
    expect(EMPTY_LLM_ENTITIES.sectors).toEqual([]);
    expect(EMPTY_LLM_ENTITIES.affectedProducts).toEqual([]);
    expect(EMPTY_LLM_ENTITIES.attackPatterns).toEqual([]);
    expect(EMPTY_LLM_ENTITIES.actorCandidates).toEqual([]);
    expect(EMPTY_LLM_ENTITIES.malwareCandidates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd api && npx vitest run test/lib/extract-llm.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/extract-llm'`.

- [ ] **Step 3: Create the scaffolding**

Create `api/src/lib/extract-llm.ts`:

```ts
/**
 * LLM-backed entity extractor (cron-warm path only).
 *
 * Augments the regex/dictionary `extract()` with entities that are stated
 * in prose but missed by pattern matching: industry sectors, affected
 * vendor/product pairs, MITRE ATT&CK techniques, and CANDIDATE actor /
 * malware names worth analyst review.
 *
 * Reconciliation rules (defense in depth against hallucination):
 *   1. Strict JSON schema in the system prompt + low temperature.
 *   2. Tolerant parser — extracts the first balanced `{…}` substring so
 *      fenced/prose-wrapped responses still parse.
 *   3. Per-class validators drop malformed entries silently rather than
 *      rejecting the whole result.
 *   4. ATT&CK IDs must exist in `ATTACK_ID_INDEX` (the canonical MITRE
 *      catalog snapshot). Invented IDs (e.g. T9999) are dropped.
 *   5. Actor / malware candidates must appear VERBATIM (case-insensitive
 *      substring) in `title + body`. The LLM cannot manufacture a name.
 *   6. Candidates already canonicalized by `ACTOR_ALIASES` / `MALWARE_DICT`
 *      are dropped — they would already be in `view.threatActors[]` /
 *      `view.malware[]`.
 *   7. Hard caps on every list.
 *
 * Failure mode: any error (rate limit, parse failure, timeout, schema
 * mismatch) returns `{ ran: true, partial: true, …empty arrays }` with
 * a structured log — never throws.
 */

import type { Env } from '../env';
import type { ExtractedEntities } from './extract';
import { ACTOR_ALIASES } from '../data/threat-actor-aliases';
import { MALWARE_DICT } from '../data/malware-dict';
import { ATTACK_ID_INDEX } from '../data/attack-id-index';
import { runCompletion as defaultRunCompletion } from '../case-study/generation/ai-client';

export interface LlmEntities {
  sectors: { name: string }[];
  affectedProducts: { vendor: string; product: string }[];
  attackPatterns: { id: string; name: string }[];
  actorCandidates: { name: string; rationale: string }[];
  malwareCandidates: { name: string; rationale: string }[];
  /** False when skipped (short body / no findings). True when the call was attempted. */
  ran: boolean;
  /** True when the call ran but parse/schema validation degraded the result. */
  partial: boolean;
  /** Provider:model that produced this result, when known. */
  modelUsed?: string;
}

export const EMPTY_LLM_ENTITIES: LlmEntities = {
  sectors: [],
  affectedProducts: [],
  attackPatterns: [],
  actorCandidates: [],
  malwareCandidates: [],
  ran: false,
  partial: false,
};

export interface ExtractLlmOptions {
  /** DI seam for tests. Defaults to the real runCompletion (Groq → Workers AI). */
  runCompletion?: typeof defaultRunCompletion;
  /** How many findings the source briefing had. 0 → skip the LLM call. */
  findingsCount?: number;
}

const MIN_BODY_CHARS = 600;

/** True when the LLM extractor should be invoked for this input. */
function shouldRunLlm(body: string, findingsCount: number | undefined): boolean {
  if (body.length < MIN_BODY_CHARS) return false;
  if (findingsCount !== undefined && findingsCount === 0) return false;
  return true;
}

export async function extractLlm(
  title: string,
  body: string,
  _entities: ExtractedEntities,
  _env: Env,
  options: ExtractLlmOptions = {}
): Promise<LlmEntities> {
  if (!shouldRunLlm(body, options.findingsCount)) {
    return { ...EMPTY_LLM_ENTITIES };
  }
  // Real LLM call wired in Task 4. Returning a stub for now so the skip-rule
  // tests don't require a real model.
  return { ...EMPTY_LLM_ENTITIES, ran: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
cd api && npx vitest run test/lib/extract-llm.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/extract-llm.ts api/test/lib/extract-llm.test.ts
git commit -m "feat(intel-bundle): scaffold extract-llm (types + skip rule)"
```

---

## Task 2: Tolerant JSON parser

**Files:**

- Modify: `api/src/lib/extract-llm.ts`
- Modify: `api/test/lib/extract-llm.test.ts`

- [ ] **Step 1: Write failing tests for the tolerant parser**

Append to `api/test/lib/extract-llm.test.ts`:

````ts
import { parseLlmJson } from '../../src/lib/extract-llm';

describe('parseLlmJson — tolerant parser', () => {
  it('parses a clean JSON object', () => {
    const out = parseLlmJson('{"sectors": ["healthcare"]}');
    expect(out).toEqual({ sectors: ['healthcare'] });
  });

  it('extracts JSON wrapped in markdown fences', () => {
    const input = '```json\n{"sectors": ["finance"]}\n```';
    const out = parseLlmJson(input);
    expect(out).toEqual({ sectors: ['finance'] });
  });

  it('extracts JSON when the LLM adds a prose preamble', () => {
    const input = 'Sure, here is the JSON:\n{"sectors": ["energy"]}\nLet me know if you need more.';
    const out = parseLlmJson(input);
    expect(out).toEqual({ sectors: ['energy'] });
  });

  it('handles nested braces correctly (balanced extraction)', () => {
    const input = '{"affected_products": [{"vendor":"Fortinet","product":"FortiGate"}]}';
    const out = parseLlmJson(input);
    expect((out as { affected_products: unknown[] }).affected_products).toHaveLength(1);
  });

  it('returns null on malformed input', () => {
    expect(parseLlmJson('not json at all')).toBeNull();
    expect(parseLlmJson('{ bad json }')).toBeNull();
    expect(parseLlmJson('')).toBeNull();
  });

  it('returns null when there is no { in the response', () => {
    expect(parseLlmJson('the LLM forgot the JSON entirely')).toBeNull();
  });
});
````

- [ ] **Step 2: Run tests to verify failures**

```
cd api && npx vitest run test/lib/extract-llm.test.ts
```

Expected: FAIL — `parseLlmJson` not exported.

- [ ] **Step 3: Implement the tolerant parser**

Add to `api/src/lib/extract-llm.ts` (before `export async function extractLlm`):

```ts
/**
 * Extract the first balanced `{...}` substring from `text` and JSON.parse it.
 * Tolerates markdown fences, prose preambles, and trailing text. Returns
 * `null` on any failure — the caller turns that into `partial: true`.
 *
 * Brace-counting (rather than regex) keeps nested objects/arrays balanced.
 */
export function parseLlmJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd api && npx vitest run test/lib/extract-llm.test.ts
```

Expected: PASS (9 tests total — 3 from Task 1 + 6 from Task 2).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/extract-llm.ts api/test/lib/extract-llm.test.ts
git commit -m "feat(intel-bundle): tolerant JSON parser for LLM responses"
```

---

## Task 3: Per-class validators

**Files:**

- Modify: `api/src/lib/extract-llm.ts`
- Modify: `api/test/lib/extract-llm.test.ts`

- [ ] **Step 1: Write failing tests for validators**

Append to `api/test/lib/extract-llm.test.ts`:

```ts
import { validateLlmEntities } from '../../src/lib/extract-llm';

describe('validateLlmEntities — per-class validation', () => {
  const sourceText = 'Microsoft Exchange was targeted by LightSpy v2. APT28 also active.';

  it('trims, lowercase-canonicalizes, dedupes, and caps sectors at 8', () => {
    const raw = {
      sectors: [
        '  Healthcare  ',
        'European Government',
        'healthcare', // duplicate
        'Energy',
        'Finance',
        'Manufacturing',
        'Defense',
        'Education',
        'Retail', // 9 distinct
      ],
    };
    const out = validateLlmEntities(raw, 'title', 'body');
    expect(out.sectors).toHaveLength(8);
    expect(out.sectors.map((s) => s.name)).toContain('healthcare');
    expect(out.sectors.map((s) => s.name)).toContain('european-government');
  });

  it('drops affected_products missing vendor or product, dedupes, caps at 12', () => {
    const raw = {
      affected_products: [
        { vendor: 'Fortinet', product: 'FortiGate' },
        { vendor: 'Fortinet', product: 'FortiGate' }, // duplicate
        { vendor: '', product: 'FortiOS' }, // missing vendor
        { vendor: 'Microsoft', product: '' }, // missing product
        { vendor: 'Microsoft', product: 'Exchange Server' },
      ],
    };
    const out = validateLlmEntities(raw, 'title', 'body');
    expect(out.affectedProducts).toEqual([
      { vendor: 'Fortinet', product: 'FortiGate' },
      { vendor: 'Microsoft', product: 'Exchange Server' },
    ]);
  });

  it('attack_patterns: keeps valid + in ATTACK_ID_INDEX, drops invalid shapes and unknown ids', () => {
    const raw = {
      attack_patterns: [
        { id: 'T1566.001', name: 'Spear-phishing Attachment' },
        { id: 'T9999', name: 'Invented' }, // not in index → dropped
        { id: 'BAD-SHAPE', name: 'Bad' }, // regex fails → dropped
        { id: 'T1003', name: 'OS Credential Dumping' },
        { id: 'T1003', name: 'Dup' }, // dup → dropped
      ],
    };
    const out = validateLlmEntities(raw, 'title', 'body');
    // T1566.001 and T1003 are real ATT&CK techniques — they're in ATTACK_ID_INDEX.
    expect(out.attackPatterns.map((a) => a.id).sort()).toEqual(['T1003', 'T1566.001']);
  });

  it('actor_candidates: drops names already in ACTOR_ALIASES (canonical or alias)', () => {
    const raw = {
      actor_candidates: [
        { name: 'APT28', rationale: 'matches canonical' },
        { name: 'Fancy Bear', rationale: 'matches alias' },
        { name: 'LightSpy', rationale: 'novel' },
      ],
    };
    const out = validateLlmEntities(raw, 'title', sourceText);
    expect(out.actorCandidates.map((c) => c.name)).toEqual(['LightSpy']);
  });

  it('actor_candidates: drops names not appearing verbatim in title+body', () => {
    const raw = {
      actor_candidates: [
        { name: 'LightSpy', rationale: 'in source' },
        { name: 'GhostHacker', rationale: 'not in source — must be dropped' },
      ],
    };
    const out = validateLlmEntities(raw, 'title', sourceText);
    expect(out.actorCandidates.map((c) => c.name)).toEqual(['LightSpy']);
  });

  it('actor_candidates: case-insensitive substring match', () => {
    const raw = { actor_candidates: [{ name: 'lightspy', rationale: '' }] };
    const out = validateLlmEntities(raw, 'title', sourceText);
    expect(out.actorCandidates).toHaveLength(1);
  });

  it('actor_candidates: caps at 4', () => {
    const body = 'A1 A2 A3 A4 A5 A6 are all here.';
    const raw = {
      actor_candidates: [
        { name: 'A1', rationale: '' },
        { name: 'A2', rationale: '' },
        { name: 'A3', rationale: '' },
        { name: 'A4', rationale: '' },
        { name: 'A5', rationale: '' },
      ],
    };
    const out = validateLlmEntities(raw, 'title', body);
    expect(out.actorCandidates).toHaveLength(4);
  });

  it('malware_candidates: same guards as actors', () => {
    const raw = {
      malware_candidates: [
        { name: 'Emotet', rationale: 'in dict' }, // dropped
        { name: 'LightSpy', rationale: 'novel + in source' },
        { name: 'Phantom', rationale: 'not in source' }, // dropped
      ],
    };
    const out = validateLlmEntities(raw, 'title', sourceText);
    expect(out.malwareCandidates.map((c) => c.name)).toEqual(['LightSpy']);
  });

  it('returns empty arrays for every class when raw is null / not an object', () => {
    const out = validateLlmEntities(null, 'title', 'body');
    expect(out.sectors).toEqual([]);
    expect(out.affectedProducts).toEqual([]);
    expect(out.attackPatterns).toEqual([]);
    expect(out.actorCandidates).toEqual([]);
    expect(out.malwareCandidates).toEqual([]);
  });

  it('handles malformed entries inside otherwise valid arrays without rejecting the whole class', () => {
    const raw = {
      sectors: ['healthcare', 42, null, { junk: true }, 'finance'],
    };
    const out = validateLlmEntities(raw, 'title', 'body');
    expect(out.sectors.map((s) => s.name)).toEqual(['healthcare', 'finance']);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

```
cd api && npx vitest run test/lib/extract-llm.test.ts
```

Expected: FAIL — `validateLlmEntities` not exported.

- [ ] **Step 3: Implement the validators**

Add to `api/src/lib/extract-llm.ts` (after `parseLlmJson`):

```ts
const CAPS = {
  sectors: 8,
  affectedProducts: 12,
  attackPatterns: 16,
  actorCandidates: 4,
  malwareCandidates: 4,
} as const;

const ATTACK_ID_RE = /^T\d{4}(\.\d{3})?$/;

/** Build a case-insensitive lookup of every actor canonical + alias. */
const ACTOR_DICT_LOWER: Set<string> = (() => {
  const s = new Set<string>();
  for (const a of ACTOR_ALIASES) {
    s.add(a.canonical.toLowerCase());
    for (const alias of a.aliases) s.add(alias.toLowerCase());
  }
  return s;
})();

const MALWARE_DICT_LOWER: Set<string> = (() => {
  const s = new Set<string>();
  for (const m of MALWARE_DICT) {
    s.add(m.canonical.toLowerCase());
    for (const alias of m.aliases) s.add(alias.toLowerCase());
  }
  return s;
})();

function canonicalSector(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function asObject(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** Validate + reconcile the parsed LLM JSON into a typed `LlmEntities`-shaped slice. */
export function validateLlmEntities(
  raw: unknown,
  title: string,
  body: string
): Omit<LlmEntities, 'ran' | 'partial' | 'modelUsed'> {
  const empty = {
    sectors: [] as LlmEntities['sectors'],
    affectedProducts: [] as LlmEntities['affectedProducts'],
    attackPatterns: [] as LlmEntities['attackPatterns'],
    actorCandidates: [] as LlmEntities['actorCandidates'],
    malwareCandidates: [] as LlmEntities['malwareCandidates'],
  };
  const obj = asObject(raw);
  if (!obj) return empty;

  // Sectors --------------------------------------------------------------
  const seenSectors = new Set<string>();
  const sectors: LlmEntities['sectors'] = [];
  for (const item of asArray(obj.sectors)) {
    if (!isString(item)) continue;
    const slug = canonicalSector(item);
    if (!slug || seenSectors.has(slug)) continue;
    seenSectors.add(slug);
    sectors.push({ name: slug });
    if (sectors.length >= CAPS.sectors) break;
  }

  // Affected products ----------------------------------------------------
  const seenProducts = new Set<string>();
  const affectedProducts: LlmEntities['affectedProducts'] = [];
  for (const item of asArray(obj.affected_products)) {
    const o = asObject(item);
    if (!o) continue;
    const vendor = isString(o.vendor) ? o.vendor.trim() : '';
    const product = isString(o.product) ? o.product.trim() : '';
    if (!vendor || !product) continue;
    const key = `${vendor.toLowerCase()}|${product.toLowerCase()}`;
    if (seenProducts.has(key)) continue;
    seenProducts.add(key);
    affectedProducts.push({ vendor, product });
    if (affectedProducts.length >= CAPS.affectedProducts) break;
  }

  // Attack patterns ------------------------------------------------------
  const seenAttack = new Set<string>();
  const attackPatterns: LlmEntities['attackPatterns'] = [];
  for (const item of asArray(obj.attack_patterns)) {
    const o = asObject(item);
    if (!o) continue;
    const id = isString(o.id) ? o.id.trim() : '';
    const name = isString(o.name) ? o.name.trim() : '';
    if (!ATTACK_ID_RE.test(id)) continue;
    if (!(id in ATTACK_ID_INDEX)) continue;
    if (seenAttack.has(id)) continue;
    seenAttack.add(id);
    attackPatterns.push({ id, name: name || id });
    if (attackPatterns.length >= CAPS.attackPatterns) break;
  }

  // Actor / malware candidates ------------------------------------------
  const haystack = `${title}\n${body}`.toLowerCase();
  const validateCandidates = (
    items: unknown[],
    dictLower: Set<string>,
    cap: number
  ): LlmEntities['actorCandidates'] => {
    const out: LlmEntities['actorCandidates'] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const o = asObject(item);
      if (!o) continue;
      const name = isString(o.name) ? o.name.trim() : '';
      const rationale = isString(o.rationale) ? o.rationale.trim() : '';
      if (!name) continue;
      const lower = name.toLowerCase();
      if (seen.has(lower)) continue;
      if (dictLower.has(lower)) continue; // already canonicalized
      if (!haystack.includes(lower)) continue; // verbatim-in-source guardrail
      seen.add(lower);
      out.push({ name, rationale });
      if (out.length >= cap) break;
    }
    return out;
  };
  const actorCandidates = validateCandidates(asArray(obj.actor_candidates), ACTOR_DICT_LOWER, CAPS.actorCandidates);
  const malwareCandidates = validateCandidates(
    asArray(obj.malware_candidates),
    MALWARE_DICT_LOWER,
    CAPS.malwareCandidates
  );

  return { sectors, affectedProducts, attackPatterns, actorCandidates, malwareCandidates };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd api && npx vitest run test/lib/extract-llm.test.ts
```

Expected: PASS (19 tests total — 3 + 6 + 10).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/extract-llm.ts api/test/lib/extract-llm.test.ts
git commit -m "feat(intel-bundle): per-class validators for LLM output"
```

---

## Task 4: Full extractLlm — happy path (DI stub)

**Files:**

- Modify: `api/src/lib/extract-llm.ts`
- Modify: `api/test/lib/extract-llm.test.ts`

- [ ] **Step 1: Write failing test for the happy path**

Append to `api/test/lib/extract-llm.test.ts`:

```ts
describe('extractLlm — happy path with DI stub', () => {
  const body = 'A'.repeat(800) + '\nMicrosoft Exchange and LightSpy v2 observed.';

  it('returns validated entities when runCompletion succeeds', async () => {
    const runCompletion = vi.fn(async () => ({
      text: JSON.stringify({
        sectors: ['Healthcare', 'Healthcare'],
        affected_products: [{ vendor: 'Microsoft', product: 'Exchange' }],
        attack_patterns: [{ id: 'T1566.001', name: 'Spear-phishing' }],
        actor_candidates: [{ name: 'LightSpy', rationale: 'novel name in source' }],
        malware_candidates: [],
      }),
      modelUsed: 'groq:llama-3.3-70b-versatile',
    }));

    const out = await extractLlm('Brief', body, emptyEntities, env, {
      runCompletion: runCompletion as never,
      findingsCount: 3,
    });
    expect(out.ran).toBe(true);
    expect(out.partial).toBe(false);
    expect(out.modelUsed).toBe('groq:llama-3.3-70b-versatile');
    expect(out.sectors).toEqual([{ name: 'healthcare' }]);
    expect(out.affectedProducts).toEqual([{ vendor: 'Microsoft', product: 'Exchange' }]);
    expect(out.attackPatterns).toEqual([{ id: 'T1566.001', name: 'Spear-phishing' }]);
    expect(out.actorCandidates).toEqual([{ name: 'LightSpy', rationale: 'novel name in source' }]);
    expect(runCompletion).toHaveBeenCalledTimes(1);
  });

  it('passes title + body in the user prompt to runCompletion', async () => {
    let captured: { system: string; user: string } | null = null;
    const runCompletion = vi.fn(async (_ai: unknown, input: { system: string; user: string }) => {
      captured = input;
      return { text: '{}', modelUsed: 'stub' };
    });
    await extractLlm('Brief title', body, emptyEntities, env, {
      runCompletion: runCompletion as never,
      findingsCount: 1,
    });
    expect(captured!.user.startsWith('Brief title')).toBe(true);
    expect(captured!.user).toContain('Microsoft Exchange');
    // System prompt mentions the strict JSON schema.
    expect(captured!.system).toContain('JSON');
    expect(captured!.system).toContain('sectors');
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

```
cd api && npx vitest run test/lib/extract-llm.test.ts
```

Expected: FAIL — `modelUsed` undefined / arrays empty (the stub `extractLlm` still returns `EMPTY_LLM_ENTITIES`).

- [ ] **Step 3: Implement the real extractLlm body**

Replace the stub `extractLlm` in `api/src/lib/extract-llm.ts`:

```ts
const SYSTEM_PROMPT = `You are a defensive cyber-threat-intelligence analyst extracting entities from a security briefing. Respond with ONLY a JSON object matching this schema, no prose, no markdown fences:

{
  "sectors": ["string"],
  "affected_products": [{"vendor": "string", "product": "string"}],
  "attack_patterns": [{"id": "T#### or T####.###", "name": "string"}],
  "actor_candidates": [{"name": "string", "rationale": "string"}],
  "malware_candidates": [{"name": "string", "rationale": "string"}]
}

Rules:
- Use ONLY entities explicitly named in the source text.
- Sectors are industries / verticals affected by the threat (e.g. "european-government", "healthcare", "manufacturing").
- Affected products are software/hardware named as vulnerable or targeted.
- Attack patterns must be MITRE ATT&CK technique IDs (T#### or sub-T####.###).
- actor_candidates and malware_candidates are NEW or unfamiliar names worth analyst review. The rationale must be one sentence quoting or paraphrasing the source.
- Empty arrays are valid. Do not invent.`;

const MAX_BODY_CHARS = 8000;

function clampBody(body: string): string {
  if (body.length <= MAX_BODY_CHARS) return body;
  return body.slice(0, MAX_BODY_CHARS) + '\n…[truncated]';
}

export async function extractLlm(
  title: string,
  body: string,
  _entities: ExtractedEntities,
  env: Env,
  options: ExtractLlmOptions = {}
): Promise<LlmEntities> {
  if (!shouldRunLlm(body, options.findingsCount)) {
    return { ...EMPTY_LLM_ENTITIES };
  }
  const run = options.runCompletion ?? defaultRunCompletion;
  const userPrompt = `${title}\n\n${clampBody(body)}`;

  let text: string;
  let modelUsed: string | undefined;
  try {
    const result = await run(
      env.AI,
      {
        system: SYSTEM_PROMPT,
        user: userPrompt,
        maxTokens: 1500,
        temperature: 0.2,
      },
      { groqKey: env.GROQ_API_KEY }
    );
    text = result.text;
    modelUsed = result.modelUsed;
  } catch (err) {
    console.warn(
      JSON.stringify({
        job: 'extract-llm',
        stage: 'runCompletion',
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return { ...EMPTY_LLM_ENTITIES, ran: true, partial: true };
  }

  const parsed = parseLlmJson(text);
  if (parsed === null) {
    console.warn(JSON.stringify({ job: 'extract-llm', stage: 'parse', error: 'no_balanced_json' }));
    return { ...EMPTY_LLM_ENTITIES, ran: true, partial: true, modelUsed };
  }
  const validated = validateLlmEntities(parsed, title, body);
  return {
    ...validated,
    ran: true,
    partial: false,
    modelUsed,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd api && npx vitest run test/lib/extract-llm.test.ts
```

Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/extract-llm.ts api/test/lib/extract-llm.test.ts
git commit -m "feat(intel-bundle): wire extractLlm against runCompletion"
```

---

## Task 5: Error paths + body truncation

**Files:**

- Modify: `api/test/lib/extract-llm.test.ts`

- [ ] **Step 1: Add failing tests for error / partial paths**

Append to `api/test/lib/extract-llm.test.ts`:

```ts
describe('extractLlm — error / partial paths', () => {
  const body = 'A'.repeat(800);

  it('returns ran:true partial:true with empty arrays when runCompletion throws', async () => {
    const runCompletion = vi.fn(async () => {
      throw new Error('rate-limited');
    });
    const out = await extractLlm('t', body, emptyEntities, env, {
      runCompletion: runCompletion as never,
      findingsCount: 1,
    });
    expect(out.ran).toBe(true);
    expect(out.partial).toBe(true);
    expect(out.sectors).toEqual([]);
    expect(out.actorCandidates).toEqual([]);
  });

  it('returns partial:true when the LLM response has no JSON object', async () => {
    const runCompletion = vi.fn(async () => ({
      text: 'I am sorry, I cannot help with that.',
      modelUsed: 'stub',
    }));
    const out = await extractLlm('t', body, emptyEntities, env, {
      runCompletion: runCompletion as never,
      findingsCount: 1,
    });
    expect(out.ran).toBe(true);
    expect(out.partial).toBe(true);
    expect(out.modelUsed).toBe('stub');
  });

  it('truncates the body at 8000 chars before sending to the LLM', async () => {
    let captured = '';
    const runCompletion = vi.fn(async (_ai: unknown, input: { user: string }) => {
      captured = input.user;
      return { text: '{}', modelUsed: 'stub' };
    });
    const huge = 'x'.repeat(20_000);
    await extractLlm('t', huge, emptyEntities, env, {
      runCompletion: runCompletion as never,
      findingsCount: 1,
    });
    // user prompt = 't\n\n' + clamped body
    expect(captured.length).toBeLessThan(9000);
    expect(captured).toContain('[truncated]');
  });

  it('does NOT flip partial when validation drops entries (strict guardrail working)', async () => {
    const runCompletion = vi.fn(async () => ({
      text: JSON.stringify({
        sectors: ['healthcare'],
        actor_candidates: [{ name: 'APT28', rationale: 'in dict, will drop' }],
      }),
      modelUsed: 'stub',
    }));
    const out = await extractLlm('t', body, emptyEntities, env, {
      runCompletion: runCompletion as never,
      findingsCount: 1,
    });
    expect(out.partial).toBe(false);
    expect(out.sectors).toEqual([{ name: 'healthcare' }]);
    expect(out.actorCandidates).toEqual([]); // dropped by guardrail, no partial
  });
});
```

- [ ] **Step 2: Run tests**

```
cd api && npx vitest run test/lib/extract-llm.test.ts
```

Expected: PASS (25 tests). The implementation from Task 4 already covers these cases — these tests lock in the contract.

- [ ] **Step 3: Commit**

```bash
git add api/test/lib/extract-llm.test.ts
git commit -m "test(intel-bundle): lock in extractLlm error + truncation contract"
```

---

## Task 6: Extend buildStixBundle signature + IntelView shape

**Files:**

- Modify: `api/src/lib/stix-build.ts`
- Modify: `api/test/lib/stix-build.test.ts`

- [ ] **Step 1: Write failing test asserting back-compat + new fields**

Append to `api/test/lib/stix-build.test.ts` inside the outermost `describe`:

```ts
import type { LlmEntities } from '../../src/lib/extract-llm';
import { EMPTY_LLM_ENTITIES } from '../../src/lib/extract-llm';

describe('buildStixBundle — LlmEntities support', () => {
  it('accepts the new llmEntities argument without breaking the existing call shape', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const r = await buildStixBundle(report, entities, emptyBulk, new Map(), EMPTY_LLM_ENTITIES);
    expect(r.bundle.type).toBe('bundle');
    expect(r.view.sectors).toEqual([]);
    expect(r.view.affectedProducts).toEqual([]);
    expect(r.view.actorCandidates).toEqual([]);
    expect(r.view.malwareCandidates).toEqual([]);
    expect(r.view.attackPatterns).toEqual([]);
    expect(r.view.llmEnrichment).toEqual({ ran: false, partial: false });
  });

  it('defaults llmEntities when called with 4 args (existing call sites)', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const r = await buildStixBundle(report, entities, emptyBulk);
    expect(r.view.sectors).toEqual([]);
    expect(r.view.llmEnrichment).toEqual({ ran: false, partial: false });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```
cd api && npx vitest run test/lib/stix-build.test.ts
```

Expected: FAIL — `view.sectors` doesn't exist on `IntelView`.

- [ ] **Step 3: Extend IntelView + buildStixBundle signature**

Modify `api/src/lib/stix-build.ts`:

Add the import at the top:

```ts
import type { LlmEntities } from './extract-llm';
```

Inside the `IntelView` interface, add (after the existing `attackPatterns` line):

```ts
  /** LLM-extracted sectors / industries (canonical-slug form). Populated only on the cron-warm path. */
  sectors: string[];
  /** LLM-extracted affected products. */
  affectedProducts: { vendor: string; product: string }[];
  /** Candidate actors from the LLM extractor — never promoted into `threatActors[]`. */
  actorCandidates: { name: string; rationale: string }[];
  /** Candidate malware from the LLM extractor — never promoted into `malware[]`. */
  malwareCandidates: { name: string; rationale: string }[];
  /** LLM-call provenance for analyst introspection. */
  llmEnrichment: { ran: boolean; partial: boolean; modelUsed?: string };
```

Change the `buildStixBundle` signature (the `export async function buildStixBundle` line):

```ts
export async function buildStixBundle(
  report: ReportInput,
  entities: ExtractedEntities,
  bulk: { enrichments: IocEnrichment[]; partial: boolean; overflow: { type: IndicatorType; value: string }[] },
  cveEnrichments: Map<string, CveEnrichment> = new Map(),
  llmEntities: LlmEntities = {
    sectors: [],
    affectedProducts: [],
    attackPatterns: [],
    actorCandidates: [],
    malwareCandidates: [],
    ran: false,
    partial: false,
  }
): Promise<BuildResult> {
```

Inside the function, in the `view` construction (the `const view: IntelView = {` block), find the existing single line:

```ts
    attackPatterns: [],
```

Replace that ONE line with the following six lines (5 new fields + the now-dynamic `attackPatterns`):

```ts
    sectors: llmEntities.sectors.map((s) => s.name),
    affectedProducts: llmEntities.affectedProducts.map((p) => ({ vendor: p.vendor, product: p.product })),
    actorCandidates: llmEntities.actorCandidates.map((c) => ({ name: c.name, rationale: c.rationale })),
    malwareCandidates: llmEntities.malwareCandidates.map((c) => ({ name: c.name, rationale: c.rationale })),
    attackPatterns: llmEntities.attackPatterns.map((a) => ({ name: a.name, mitreId: a.id })),
    llmEnrichment: {
      ran: llmEntities.ran,
      partial: llmEntities.partial,
      modelUsed: llmEntities.modelUsed,
    },
```

(Keep `tlp`, `partial`, `generatedAt`, `extractedHash` lines exactly as they were.)

- [ ] **Step 4: Run tests to verify pass**

```
cd api && npx vitest run test/lib/stix-build.test.ts
```

Expected: PASS (18 tests — existing 16 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/stix-build.ts api/test/lib/stix-build.test.ts
git commit -m "feat(intel-bundle): thread LlmEntities through buildStixBundle"
```

---

## Task 7: Emit `attack-pattern` SDOs + report→uses→attack-pattern relationships

**Files:**

- Modify: `api/src/lib/stix-build.ts`
- Modify: `api/test/lib/stix-build.test.ts`

- [ ] **Step 1: Write failing test**

Append inside the `describe('buildStixBundle — LlmEntities support')` block:

```ts
it('emits attack-pattern SDOs with external_references for validated MITRE IDs', async () => {
  const llm: LlmEntities = {
    ...EMPTY_LLM_ENTITIES,
    ran: true,
    attackPatterns: [
      { id: 'T1566.001', name: 'Spear-phishing Attachment' },
      { id: 'T1003', name: 'OS Credential Dumping' },
    ],
  };
  const entities = extract(TITLE, APT28_BRIEF_BODY);
  const { bundle } = await buildStixBundle(report, entities, emptyBulk, new Map(), llm);
  const patterns = bundle.objects.filter((o) => o.type === 'attack-pattern') as Array<{
    id: string;
    name?: string;
    external_references?: Array<{ source_name?: string; external_id?: string; url?: string }>;
  }>;
  expect(patterns).toHaveLength(2);
  expect(patterns.map((p) => p.name).sort()).toEqual(['OS Credential Dumping', 'Spear-phishing Attachment']);
  const refIds = patterns.flatMap((p) => p.external_references ?? []).map((r) => r.external_id);
  expect(refIds).toContain('T1566.001');
  expect(refIds).toContain('T1003');
});

it('emits report → uses → attack-pattern relationships', async () => {
  const llm: LlmEntities = {
    ...EMPTY_LLM_ENTITIES,
    ran: true,
    attackPatterns: [{ id: 'T1566.001', name: 'Spear-phishing' }],
  };
  const entities = extract(TITLE, APT28_BRIEF_BODY);
  const { bundle } = await buildStixBundle(report, entities, emptyBulk, new Map(), llm);
  const reportObj = bundle.objects.find((o) => o.type === 'report') as { id: string };
  const patternObj = bundle.objects.find((o) => o.type === 'attack-pattern') as { id: string };
  const rel = bundle.objects.find(
    (o) =>
      o.type === 'relationship' &&
      (o as { source_ref?: string }).source_ref === reportObj.id &&
      (o as { target_ref?: string }).target_ref === patternObj.id
  ) as { relationship_type?: string } | undefined;
  expect(rel?.relationship_type).toBe('uses');
});

it('view.attackPatterns mirrors the emitted SDOs', async () => {
  const llm: LlmEntities = {
    ...EMPTY_LLM_ENTITIES,
    ran: true,
    attackPatterns: [{ id: 'T1003', name: 'OS Credential Dumping' }],
  };
  const entities = extract(TITLE, APT28_BRIEF_BODY);
  const { view } = await buildStixBundle(report, entities, emptyBulk, new Map(), llm);
  expect(view.attackPatterns).toEqual([{ name: 'OS Credential Dumping', mitreId: 'T1003' }]);
});
```

- [ ] **Step 2: Run tests to verify failure**

```
cd api && npx vitest run test/lib/stix-build.test.ts
```

Expected: FAIL — no `attack-pattern` SDOs are emitted.

- [ ] **Step 3: Emit attack-pattern SDOs + relationships**

In `api/src/lib/stix-build.ts`, locate the existing CVE-objects block (right after `cveIdByName` is built). Add **after** the CVE block and **before** the indicator-objects block:

```ts
// Attack patterns (LLM-extracted, allowlist-validated upstream by validateLlmEntities).
const attackPatternObjs: StixCommon[] = await Promise.all(
  llmEntities.attackPatterns.map(async (ap) => {
    const id = await stixId('attack-pattern', `attack-pattern|${ap.id}`);
    return {
      type: 'attack-pattern',
      spec_version: '2.1',
      id,
      ...timeFields(t),
      name: ap.name || ap.id,
      external_references: [
        {
          source_name: 'mitre-attack',
          external_id: ap.id,
          url: `https://attack.mitre.org/techniques/${ap.id.replace('.', '/')}/`,
        },
      ],
      created_by_ref: identityId,
    } as StixCommon;
  })
);
```

In the `object_refs` builder block (the `const object_refs: string[] = [identityId, ...` array), add the attack-pattern ids:

Find the existing line:

```ts
    ...cveObjs.map((o) => o.id),
    ...indicatorObjs.map((o) => o.id),
```

Change it to:

```ts
    ...cveObjs.map((o) => o.id),
    ...attackPatternObjs.map((o) => o.id),
    ...indicatorObjs.map((o) => o.id),
```

In the bundle assembly block at the end (the `const bundle: StixBundle = {` line), do the same insert:

Find:

```ts
    objects: [identity, reportObj, ...actorObjs, ...malwareObjs, ...cveObjs, ...indicatorObjs, ...relationships],
```

Change to:

```ts
    objects: [
      identity,
      reportObj,
      ...actorObjs,
      ...malwareObjs,
      ...cveObjs,
      ...attackPatternObjs,
      ...indicatorObjs,
      ...relationships,
    ],
```

(The existing `report → refers-to → everything` loop already covers the attack-pattern refs, but we want a stronger `uses` relationship for them. Add that right after the existing actor→uses→malware block.)

After the actor→uses→malware loop:

```ts
// report → uses → attack-pattern (separate from refers-to so consumers can
// distinguish "this report talks about X" from "this report says X was used").
for (const ap of attackPatternObjs) {
  await rel(reportRefId, 'uses', ap.id);
}
```

- [ ] **Step 4: Run tests to verify pass**

```
cd api && npx vitest run test/lib/stix-build.test.ts
```

Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/stix-build.ts api/test/lib/stix-build.test.ts
git commit -m "feat(intel-bundle): emit attack-pattern SDOs from LLM extraction"
```

---

## Task 8: Add `x_*` extension fields on the report object

**Files:**

- Modify: `api/src/lib/stix-build.ts`
- Modify: `api/test/lib/stix-build.test.ts`

- [ ] **Step 1: Write failing test**

Append inside the `describe('buildStixBundle — LlmEntities support')` block:

```ts
it('attaches x_sectors / x_affected_products / x_llm_*_candidates / x_llm_enrichment to the report object', async () => {
  const llm: LlmEntities = {
    sectors: [{ name: 'healthcare' }, { name: 'finance' }],
    affectedProducts: [{ vendor: 'Microsoft', product: 'Exchange' }],
    attackPatterns: [],
    actorCandidates: [{ name: 'LightSpy', rationale: 'novel name in source' }],
    malwareCandidates: [],
    ran: true,
    partial: false,
    modelUsed: 'groq:llama-3.3-70b-versatile',
  };
  const entities = extract(TITLE, APT28_BRIEF_BODY);
  const { bundle } = await buildStixBundle(report, entities, emptyBulk, new Map(), llm);
  const r = bundle.objects.find((o) => o.type === 'report') as Record<string, unknown>;
  expect(r.x_sectors).toEqual(['healthcare', 'finance']);
  expect(r.x_affected_products).toEqual([{ vendor: 'Microsoft', product: 'Exchange' }]);
  expect(r.x_llm_actor_candidates).toEqual([{ name: 'LightSpy', rationale: 'novel name in source' }]);
  expect(r.x_llm_malware_candidates).toEqual([]);
  expect(r.x_llm_enrichment).toEqual({
    ran: true,
    partial: false,
    modelUsed: 'groq:llama-3.3-70b-versatile',
  });
});

it('does NOT promote LLM candidates into threat-actor / malware SDOs', async () => {
  const llm: LlmEntities = {
    ...EMPTY_LLM_ENTITIES,
    ran: true,
    actorCandidates: [{ name: 'LightSpy', rationale: '' }],
    malwareCandidates: [{ name: 'PhantomLoader', rationale: '' }],
  };
  const entities = extract(TITLE, APT28_BRIEF_BODY);
  const { bundle } = await buildStixBundle(report, entities, emptyBulk, new Map(), llm);
  const actorNames = bundle.objects.filter((o) => o.type === 'threat-actor').map((o) => (o as { name?: string }).name);
  const malwareNames = bundle.objects.filter((o) => o.type === 'malware').map((o) => (o as { name?: string }).name);
  expect(actorNames).not.toContain('LightSpy');
  expect(malwareNames).not.toContain('PhantomLoader');
});
```

- [ ] **Step 2: Run tests to verify failure**

```
cd api && npx vitest run test/lib/stix-build.test.ts
```

Expected: FAIL — `x_sectors` etc. undefined on the report.

- [ ] **Step 3: Add the `x_*` fields to the report object**

In `api/src/lib/stix-build.ts`, find the `const reportObj: StixCommon = {` block. After the existing `external_references` line and before `labels:`, insert:

```ts
    x_sectors: llmEntities.sectors.map((s) => s.name),
    x_affected_products: llmEntities.affectedProducts.map((p) => ({
      vendor: p.vendor,
      product: p.product,
    })),
    x_llm_actor_candidates: llmEntities.actorCandidates.map((c) => ({
      name: c.name,
      rationale: c.rationale,
    })),
    x_llm_malware_candidates: llmEntities.malwareCandidates.map((c) => ({
      name: c.name,
      rationale: c.rationale,
    })),
    x_llm_enrichment: {
      ran: llmEntities.ran,
      partial: llmEntities.partial,
      modelUsed: llmEntities.modelUsed,
    },
```

- [ ] **Step 4: Run tests to verify pass**

```
cd api && npx vitest run test/lib/stix-build.test.ts
```

Expected: PASS (23 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/stix-build.ts api/test/lib/stix-build.test.ts
git commit -m "feat(intel-bundle): x_* report extensions for LLM-extracted entities"
```

---

## Task 9: Wire extractLlm into warmIntelBundles

**Files:**

- Modify: `api/src/lib/intel-bundle-warm.ts`
- Modify: `api/test/lib/intel-bundle-warm.test.ts`

- [ ] **Step 1: Write failing test**

In `api/test/lib/intel-bundle-warm.test.ts`, add a new test that DI-stubs `runCompletion` indirectly by passing an option. We need to extend the warmer's signature first to accept an LLM-extractor override. Add the test after the existing `'continues past a per-row failure'` test, **inside** `describe('warmIntelBundles', …)`:

```ts
it('persists LLM-extracted sectors / candidates when extractLlm is wired', { timeout: 30_000 }, async () => {
  // Build a briefing whose intel body comfortably exceeds the 600-char
  // threshold so the LLM is NOT skipped.
  const bigBlurb = 'Microsoft Exchange was extensively targeted in this campaign. '.repeat(20);
  await insertBriefing(
    env.BRIEFINGS_DB!,
    fakeBriefing({
      slug: 'daily-2026-05-22',
      sections: [
        {
          id: 'sec-1',
          title: 'Exchange exploitation',
          blurb: bigBlurb,
          count: 1,
          findings: [
            {
              id: 'f-1',
              title: 'CVE-2024-21762 in the wild',
              description: 'Operators leveraging LightSpy v2 against Microsoft Exchange.',
              severity: 'critical',
              source: 'unit42',
              mitre_techniques: [],
            },
          ],
        },
      ],
    })
  );

  const llmStub: typeof import('../../src/lib/extract-llm').extractLlm = async (
    _title,
    _body,
    _entities,
    _env,
    _opts
  ) => ({
    sectors: [{ name: 'healthcare' }],
    affectedProducts: [{ vendor: 'Microsoft', product: 'Exchange' }],
    attackPatterns: [{ id: 'T1566.001', name: 'Spear-phishing Attachment' }],
    actorCandidates: [{ name: 'LightSpy', rationale: 'observed in source' }],
    malwareCandidates: [],
    ran: true,
    partial: false,
    modelUsed: 'stub:test',
  });

  const r = await warmIntelBundles(env, { maxItems: 1, extractLlm: llmStub });
  expect(r.built).toEqual(['daily-2026-05-22']);

  const row = await env
    .BRIEFINGS_DB!.prepare(
      `SELECT view_json FROM intel_bundles WHERE source_id = 'briefings' AND item_ref = 'daily-2026-05-22'`
    )
    .first<{ view_json: string }>();
  const view = JSON.parse(row!.view_json) as {
    sectors: string[];
    affectedProducts: { vendor: string; product: string }[];
    actorCandidates: { name: string }[];
    attackPatterns: { mitreId: string }[];
    llmEnrichment: { ran: boolean; modelUsed: string };
  };
  expect(view.sectors).toEqual(['healthcare']);
  expect(view.affectedProducts).toEqual([{ vendor: 'Microsoft', product: 'Exchange' }]);
  expect(view.actorCandidates.map((c) => c.name)).toEqual(['LightSpy']);
  expect(view.attackPatterns).toEqual([{ name: 'Spear-phishing Attachment', mitreId: 'T1566.001' }]);
  expect(view.llmEnrichment.ran).toBe(true);
  expect(view.llmEnrichment.modelUsed).toBe('stub:test');
});

it('when extractLlm is NOT provided, the warmer still ships a bundle with ran:false', { timeout: 20_000 }, async () => {
  await insertBriefing(env.BRIEFINGS_DB!, fakeBriefing());
  const r = await warmIntelBundles(env, {
    maxItems: 1,
    extractLlm: async () => ({
      sectors: [],
      affectedProducts: [],
      attackPatterns: [],
      actorCandidates: [],
      malwareCandidates: [],
      ran: false,
      partial: false,
    }),
  });
  expect(r.built).toHaveLength(1);
  const row = await env
    .BRIEFINGS_DB!.prepare(`SELECT view_json FROM intel_bundles WHERE source_id = 'briefings' AND item_ref = ?`)
    .bind(r.built[0])
    .first<{ view_json: string }>();
  const view = JSON.parse(row!.view_json) as { llmEnrichment: { ran: boolean } };
  expect(view.llmEnrichment.ran).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify failures**

```
cd api && npx vitest run test/lib/intel-bundle-warm.test.ts
```

Expected: FAIL — `extractLlm` is not yet a recognised option on `WarmOptions`.

- [ ] **Step 3: Wire extractLlm into the warmer**

In `api/src/lib/intel-bundle-warm.ts`, add at the top with other imports:

```ts
import { extractLlm as defaultExtractLlm, type LlmEntities } from './extract-llm';
```

Extend `WarmOptions`:

```ts
export interface WarmOptions {
  /** Max briefings to process per invocation. Default 1 (subrequest-budget safe). */
  maxItems?: number;
  /** How far back to look for un-warmed briefings. Default 7 days. */
  lookbackDays?: number;
  /** DI seam for the LLM extractor. Tests pass a stub here. */
  extractLlm?: typeof defaultExtractLlm;
}
```

Inside the per-row build loop in `warmIntelBundles`, locate the block:

```ts
const entities = extract(report.title, report.body);
const [bulk, cveEnrichments] = await Promise.all([
  enrichBulk(
    entities.iocs.map((i) => ({ type: i.type, value: i.value })),
    env
  ),
  enrichCves(entities.cves),
]);
const built = await buildStixBundle(report, entities, bulk, cveEnrichments);
```

Replace it with:

```ts
const entities = extract(report.title, report.body);
const findingsCount = briefing.sections.reduce((n, s) => n + (s.findings?.length ?? 0), 0);
const extractLlmFn = options.extractLlm ?? defaultExtractLlm;
const [bulk, cveEnrichments, llmEntities] = await Promise.all([
  enrichBulk(
    entities.iocs.map((i) => ({ type: i.type, value: i.value })),
    env
  ),
  enrichCves(entities.cves),
  extractLlmFn(report.title, report.body, entities, env, { findingsCount }),
]);
const built = await buildStixBundle(report, entities, bulk, cveEnrichments, llmEntities);
```

Also extend the per-row log line (in the catch block, `out.failed.push` is already structured; nothing to do there) and the cron-summary log line in `worker/index.ts` — but that's its own task (Task 11). For this task, the warmer's data flow is what matters.

- [ ] **Step 4: Run tests to verify pass**

```
cd api && npx vitest run test/lib/intel-bundle-warm.test.ts
```

Expected: PASS (9 tests — existing 7 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/intel-bundle-warm.ts api/test/lib/intel-bundle-warm.test.ts
git commit -m "feat(intel-bundle): wire LLM extractor into cron warmer"
```

---

## Task 10: Mirror IntelView additions in the frontend hook

**Files:**

- Modify: `src/hooks/useIntelBundle.ts`

- [ ] **Step 1: Extend `IntelView`**

In `src/hooks/useIntelBundle.ts`, find the `IntelView` interface. Add the following optional fields (optional for back-compat with bundles persisted before this lands) anywhere within the interface body:

```ts
  /** LLM-extracted sectors. Optional for back-compat with pre-LLM bundles. */
  sectors?: string[];
  /** LLM-extracted affected products. Optional for back-compat. */
  affectedProducts?: { vendor: string; product: string }[];
  /** LLM candidate actors — never promoted into threatActors. Optional for back-compat. */
  actorCandidates?: { name: string; rationale: string }[];
  /** LLM candidate malware — never promoted into malware. Optional for back-compat. */
  malwareCandidates?: { name: string; rationale: string }[];
  /** Provenance for the LLM enrichment call (or skipped). Optional for back-compat. */
  llmEnrichment?: { ran: boolean; partial: boolean; modelUsed?: string };
```

(`attackPatterns` already exists on the interface and stays the same.)

- [ ] **Step 2: Verify the frontend typecheck**

```
cd /Users/pranith/Documents/portfolio && npx tsc --noEmit
```

Expected: clean (no output / exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useIntelBundle.ts
git commit -m "feat(intel-bundle): expose LLM-enriched view fields on the hook"
```

---

## Task 11: Render the new view fields on IntelCard

**Files:**

- Modify: `src/components/intel/IntelCard.tsx`

- [ ] **Step 1: Add the rendering blocks**

In `src/components/intel/IntelCard.tsx`, locate the `CardChrome` component. Add the following sections inside the returned `<article>`:

**(a) Sectors chip row** — insert before the existing keywords section (or above the `iocsByType` rendering — whichever comes first in the current layout). Use the same chip-style components already present in the file. Skip when empty:

```tsx
{
  view.sectors && view.sectors.length > 0 && (
    <Section title="Sectors">
      <div className="flex flex-wrap gap-1.5">
        {view.sectors.map((s) => (
          <span
            key={s}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            {s}
          </span>
        ))}
      </div>
    </Section>
  );
}
```

**(b) Affected products** — under the CVEs section. Skip when empty:

```tsx
{
  view.affectedProducts && view.affectedProducts.length > 0 && (
    <Section title="Affected products">
      <ul className="space-y-1 text-xs">
        {view.affectedProducts.map((p) => (
          <li key={`${p.vendor}|${p.product}`} className="font-mono text-slate-700 dark:text-slate-300">
            <span className="text-slate-500 dark:text-slate-400">{p.vendor}</span> · {p.product}
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

**(c) Attack patterns** — the `view.attackPatterns` slot already exists in the type but was never rendered. Add (alongside CVEs):

```tsx
{
  view.attackPatterns && view.attackPatterns.length > 0 && (
    <Section title="Attack patterns">
      <div className="flex flex-wrap gap-1.5">
        {view.attackPatterns.map((a) => (
          <span
            key={a.mitreId}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            {a.name} · {a.mitreId}
          </span>
        ))}
      </div>
    </Section>
  );
}
```

**(d) Candidates disclosure** — at the bottom of the article body, just above the footer. Skip when both arrays empty:

```tsx
{
  ((view.actorCandidates?.length ?? 0) > 0 || (view.malwareCandidates?.length ?? 0) > 0) && (
    <details className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50/50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
      <summary className="cursor-pointer font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Suggested (unverified, LLM)
      </summary>
      <div className="mt-3 space-y-3">
        {view.actorCandidates && view.actorCandidates.length > 0 && (
          <div>
            <h5 className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500">
              Candidate actors
            </h5>
            <ul className="space-y-1">
              {view.actorCandidates.map((c) => (
                <li key={c.name}>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{c.name}</span>
                  {c.rationale && <span className="text-slate-500 dark:text-slate-400"> — {c.rationale}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {view.malwareCandidates && view.malwareCandidates.length > 0 && (
          <div>
            <h5 className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500">
              Candidate malware
            </h5>
            <ul className="space-y-1">
              {view.malwareCandidates.map((c) => (
                <li key={c.name}>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{c.name}</span>
                  {c.rationale && <span className="text-slate-500 dark:text-slate-400"> — {c.rationale}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
```

**(e) Provenance badges** — alongside the existing TLP badge in the `<header>`:

First, just above the `return (` of `CardChrome`, add the local that captures the optional `llmEnrichment` once (so TS narrows correctly when we use it inside the JSX — `view.llmEnrichment?.ran` does NOT narrow subsequent `view.llmEnrichment.modelUsed` accesses):

```tsx
const llm = view.llmEnrichment;
const llmModelTail = llm?.modelUsed ? llm.modelUsed.split(':').pop() : null;
```

Then locate the `<Badge tone="mono" size="xs">TLP:{view.tlp}</Badge>` line and add immediately after:

```tsx
{
  llm?.ran && (
    <Badge tone="mono" size="xs">
      LLM{llmModelTail ? `: ${llmModelTail}` : ''}
    </Badge>
  );
}
{
  llm?.partial && (
    <Badge tone="warning" size="xs">
      partial LLM
    </Badge>
  );
}
```

- [ ] **Step 2: Verify frontend typecheck**

```
cd /Users/pranith/Documents/portfolio && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/intel/IntelCard.tsx
git commit -m "feat(intel-bundle): render LLM-enriched sectors / candidates / patterns on IntelCard"
```

---

## Task 12: Final gates — full test suite + lint

**Files:** (none modified — verification only)

- [ ] **Step 1: Run the api test subset that exercises everything touched**

```
cd /Users/pranith/Documents/portfolio/api && npx vitest run test/lib/ test/routes/intel-bundle.test.ts
```

Expected: PASS — totals **~28 new tests added on top of the existing 327** (extract-llm ~25, stix-build ~7, intel-bundle-warm ~2). Final count should be ≥ 355 tests, all green.

- [ ] **Step 2: Typecheck both workspaces**

```
cd /Users/pranith/Documents/portfolio/api && npx tsc --noEmit
cd /Users/pranith/Documents/portfolio && npx tsc --noEmit
```

Expected: both exit 0 with no output.

- [ ] **Step 3: Lint**

```
cd /Users/pranith/Documents/portfolio && npm run lint -- --max-warnings 100 2>&1 | grep -E "(extract-llm|stix-build|intel-bundle|useIntelBundle|IntelCard)"
```

Expected: no output (no new lint warnings/errors in our touched files). The repo has ~89 pre-existing warnings in other files — those are out of scope.

- [ ] **Step 4: If everything passes, no commit needed; the gates are pass/fail only.**

---

## Self-Review

**Spec coverage check** (each spec section → task that implements it):

| Spec section                                                                           | Task                                                                                   |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Cron-warm path only                                                                    | Task 9 (warmer wiring), no changes to on-demand routes — covered                       |
| Additive, never overrides                                                              | Task 6/8 (LLM goes to `x_*` / candidates only) + Task 3 (verbatim guardrail)           |
| Bundle never blocked by LLM                                                            | Task 5 (error path returns partial:true, never throws)                                 |
| Skip rule (body < 600 OR 0 findings)                                                   | Task 1 (skip rule test) + Task 9 (findingsCount wiring)                                |
| Tolerant JSON parser                                                                   | Task 2                                                                                 |
| Per-class validation + caps + ATT&CK allowlist + verbatim check                        | Task 3                                                                                 |
| System prompt verbatim                                                                 | Task 4                                                                                 |
| 8K char body cap + maxTokens 1500 + temp 0.2 + 8s timeout                              | Task 4 + Task 5 truncation test                                                        |
| `attack-pattern` SDOs + report→uses→attack-pattern relationships                       | Task 7                                                                                 |
| Candidates NOT promoted to threat-actor / malware SDOs                                 | Task 8                                                                                 |
| `report.x_sectors` / `x_affected_products` / `x_llm_*_candidates` / `x_llm_enrichment` | Task 8                                                                                 |
| IntelView additions                                                                    | Task 6 (sectors/products/candidates/llmEnrichment) + Task 7 (attackPatterns populated) |
| Frontend hook mirror                                                                   | Task 10                                                                                |
| IntelCard rendering (sectors / products / patterns / candidates / provenance)          | Task 11                                                                                |
| Tests on parser / validators / skip / error paths                                      | Tasks 1–5                                                                              |
| Tests on stix-build integration                                                        | Tasks 6–8                                                                              |
| Tests on warmer DI                                                                     | Task 9                                                                                 |
| Typecheck + lint gates                                                                 | Task 12                                                                                |

**Placeholder scan:** clean. Every step has actual code, exact commands, exact expected output. No "TBD" or "similar to" hand-waves.

**Type consistency:** `LlmEntities`, `extractLlm`, `EMPTY_LLM_ENTITIES`, `parseLlmJson`, `validateLlmEntities`, `WarmOptions.extractLlm`, `buildStixBundle(..., llmEntities?)`, `IntelView.sectors`/`.affectedProducts`/`.actorCandidates`/`.malwareCandidates`/`.llmEnrichment`/`.attackPatterns`, `report.x_sectors`/`x_affected_products`/`x_llm_actor_candidates`/`x_llm_malware_candidates`/`x_llm_enrichment` — names consistent across tasks. Verified.

**Scope check:** single sub-project. 12 tasks, ~3–10 minutes each. Single PR.

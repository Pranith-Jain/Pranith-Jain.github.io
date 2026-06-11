# Supply-Chain Intelligence Upgrade — Implementation Plan (Phases 4–5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock the DEFERRED copilot gatherers from Phases 1–3 by giving the report engine two new subject types + templates — `package` and `crypto-address` — then register the software gatherers (`osv-package`, `depsdev`, `ossf-malicious-package`) under `package` and the crypto gatherers (`chainalysis-oracle`, `tornado-cash-mixers`, `goplus-token-security`, `honeypot-is`, `ethlist-label`, and key-gated `arkham-attribution`/`misttrack-risk`) under `crypto-address`. Phase 5 is the ops runbook for provisioning the key-gated sources (Arkham, MistTrack) and proving them with one live call.

**Architecture:** No new lib functions — every Phase 4 gatherer imports the SAME pure lib fn already built in Phases 2–3 (`api/src/lib/supply-chain/*`) and calls it directly with `ctx.signal`, wrapping the result via the existing `base(src, status, items)` helper (`api/src/lib/report/gatherer.ts:36`). The P0 unblock is purely in the report engine's resolver/catalog: `detectType()` + `TEMPLATE_BY_TYPE` + `SOURCE_CATALOG` + `SubjectType`/`TemplateId` unions. A gatherer is wired ONLY because a subject now genuinely resolves to a template that lists it — this is the hard "no silently-empty stubs" rule (design §1 goal 3, §5.2, P0) finally satisfied for software + crypto-address subjects.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono routes, vitest / vitest-pool-workers, D1 (`BRIEFINGS_DB`), KV + Cache-API. Wrangler secrets (`wrangler secret put`) for Phase 5.

**Scope this plan:** Phase 4 (new `package`/`crypto-address` templates + resolver branches + register all §5.2 deferred gatherers) and Phase 5 (key-gated provisioning runbook for Arkham/MistTrack + CI-skipped live smokes). Phases 1–3 (the lib fns, agent tools, tracer integration, key-gated build-behind-guard) are a separate, already-executing plan: `docs/superpowers/plans/2026-06-11-supply-chain-intel.md`. Full design: `docs/superpowers/specs/2026-06-11-supply-chain-intel-design.md` (read §5.2, §9 Phase 4/5, §11).

> **Phasing honesty (design §9 / P0).** This is the genuine cost of full copilot coverage and lands as its own PR after the zero-auth phases. Phase 4 is a LARGER surface than the stub fixes because it touches the resolver — the single most load-bearing routing decision in the report engine — so the P0 regression test (Task 31g) is a merge gate, not optional.

> **Concurrency caveat (READ FIRST).** Phases 1–3 are being built concurrently in the same worktree, so `subject-resolver.ts`, `source-planner.ts`, `gatherer.ts`, and `types.ts` may be mid-change when this plan executes. **Plan by symbol name, not by line number.** Every line number below is a 2026-06-11 snapshot — the implementer MUST re-confirm exact insertion points (`grep -n` the named symbol) at implementation time. In particular, Phases 2/2b add infra gatherers to `FETCHERS` and `SOURCE_CATALOG['ioc']`; do not assume the surrounding lines are unchanged.

---

## Conventions (read first)

These mirror the Phases 1–3 plan's conventions exactly — re-read them there if needed. Phase 4 specifics:

- **No new lib fns, no new routes, no new schemas.** Phase 4 is resolver + catalog + gatherer registration only. Every gatherer imports an existing `api/src/lib/supply-chain/*` lib fn (built in Phases 2–3) and calls it directly with `{ signal: ctx.signal }`. If a depended-on lib fn is not yet merged when a Task runs, that Task is blocked on the corresponding Phase-2/3 Task (cross-references are called out per-Task).
- **The 5-layer chain collapses to layer 5 here.** Layers 1–4 (lib fn, schema, route, agent tool) already exist from Phases 2–3. Phase 4 adds ONLY layer 5 (the copilot gatherer) plus the resolver/catalog plumbing that lets a subject reach it.
- **`base(src, status, items)`** (`api/src/lib/report/gatherer.ts:36`) wraps every gatherer result. Non-matching `subject.type` self-skips with `return base(src, 'empty')` BEFORE any fetch. Map one `SourceItem` per discrete citable fact, carrying the structured object in `fields` (mirrors `cveFetcher`, `gatherer.ts:275`, and the `malpedia` fetcher, `gatherer.ts:253`).
- **FETCHERS key MUST equal the SOURCE_CATALOG id EXACTLY** — a typo silently re-stubs the gatherer (design §7). Both edits land in the SAME task.
- **Honest `cost`.** Each new descriptor declares the true subrequest cost of its lib fn (design §8.2 / §8.3). Recompute the `crypto-address` round budget in Task 32 / §8.2 (P5 #14) — the old "EVM-address fires crypto gatherers in the ioc round" math was deleted as moot for the prior branch.
- **Keyed gatherers (`arkham-attribution`, `misttrack-risk`) need `ctx.env`.** Their lib fns (`lookupArkhamEntity(address, env, opts)`, `lookupMisttrack(address, env, opts)`) take a typed `env` second arg and return `status:'needs-key'` with ZERO network when the key is unset. The gatherer passes `ctx.env`; it is safe to register them unconditionally in `SOURCE_CATALOG` because they self-skip to `'empty'`/`'needs-key'` (NOT the silently-empty anti-pattern — they are honestly `needs-key`, and Phase 5 flips them live). Confirm with the maintainer whether to gate the CATALOG descriptor on the key too; default here is "register, self-no-op" since the gatherer path has no planner-slot cost like the agent registry does.
- **Run all three typecheckers before any commit** (esbuild deploys past tsc): `tsc -p tsconfig.json && tsc -p api/tsconfig.json && tsc -p api/tsconfig.worker.json`. `subject-resolver.ts`/`types.ts` are imported worker-side via the report engine, so the worker config must stay green.
- **Test commands:** lib + gatherer tests run with the sandbox disabled (`dangerouslyDisableSandbox: true` on the Bash tool — there is no `--no-sandbox` flag) because vitest-pool-workers needs it; they otherwise need no network (inject/stub fetch). Route tests (none new in Phase 4) are CI-skipped. Plain `tsc` runs do NOT need the sandbox disabled.

### Lib fn signatures the Phase 4 gatherers call (from the Phases 1–3 plan — confirm at impl time)

```ts
// software
queryOsvPackage(name: string, ecosystem: string, version?: string, opts?): Promise<SCSoftwareResult>   // NAME-FIRST
fetchDepsDev(system: string, name: string, version: string | undefined, opts?): Promise<SCSoftwareResult>
checkMaliciousPackage(name: string, ecosystem: string, version?: string, opts?): Promise<SCSoftwareResult>
// crypto
checkChainalysisOracle(address: string, chain?: OracleChain /* 'eth' default */, opts?): Promise<SCAddressSignal>
checkTornadoCash(address: string): boolean                                  // SYNC, zero-subrequest, embedded set
fetchTokenSecurity(contract: string, opts?: { chain?: string }): Promise<SCAddressSignal>
checkHoneypot(address: string, chain?: HoneypotChain /* 'ethereum' default */, opts?): Promise<SCAddressSignal>
lookupEthList(address: string, opts?: { chainId?: number }): Promise<SCAddressSignal>
// key-gated (env second arg; returns needs-key with zero network when unset)
lookupArkhamEntity(address: string, env: Pick<Env,'ARKHAM_API_KEY'|'ARKHAM_API_BASE'>, opts?): Promise<SCAddressSignal>
lookupMisttrack(address: string, env: Pick<Env,'MISTTRACK_API_KEY'>, opts?): Promise<SCAddressSignal>
```

`SCSoftwareResult` carries `{ package, ecosystem, version?, total, malicious_count, findings: SCFinding[], status, ... }`; `SCAddressSignal` carries `{ address, chain?, category, sanctioned, risk_flags, risk_score?, label?, detail?, status, ... }` (design §2.3). All return an honest `status` and never throw.

---

## Phase 4 — New `package` + `crypto-address` templates (unblock all deferred gatherers)

### Task 28: Extend `SubjectType` + `TemplateId` unions

Add `package` and `crypto-address` to both union types in `api/src/lib/report/types.ts`. This is the foundation — every later Task in Phase 4 depends on it. Adding to `SubjectType` forces `TEMPLATE_BY_TYPE` (a `Record<SubjectType, TemplateId>` in `subject-resolver.ts`) to gain the two new keys, which `tsc` will flag if missing — that compile error is expected and is fixed in Task 29.

**Files:**

- Modify: `api/src/lib/report/types.ts` — the `TemplateId` union (line 5) and the `SubjectType` union (line 8). Re-confirm both lines (`grep -n "export type TemplateId\|export type SubjectType" api/src/lib/report/types.ts`).
- Test: `api/test/lib/report/subject-resolver.test.ts` (create if absent; otherwise append). This is a TYPE-level + behavior change; the load-bearing assertion lives in Task 29's resolver test, but add a minimal type-smoke here so the union extension has a red→green of its own.

- [ ] **Step 1: Write the failing test.** Create or append to `api/test/lib/report/subject-resolver.test.ts`. Assert that the two new `TemplateId`/`SubjectType` literals are assignable (a `satisfies`-style smoke that fails to compile / fails at runtime today). Because the unions are not yet extended, importing a value typed to the new literal will not compile — so make the test a runtime one that will pass only after Tasks 28+29:

```ts
import { describe, it, expect } from 'vitest';
import { resolveSubject } from '../../../src/lib/report/subject-resolver';
import type { SubjectType, TemplateId } from '../../../src/lib/report/types';

describe('subject-resolver: new package/crypto-address types', () => {
  it('SubjectType + TemplateId include package and crypto-address', () => {
    // These assignments only compile once the unions are extended (Task 28).
    const subjectTypes: SubjectType[] = ['package', 'crypto-address'];
    const templateIds: TemplateId[] = ['package', 'crypto-address'];
    expect(subjectTypes).toContain('package');
    expect(templateIds).toContain('crypto-address');
  });
});
```

- [ ] **Step 2: Run it, expecting failure.** Pre-edit, the literal assignments do not compile, so the test file fails to typecheck / vitest errors. Sandbox disabled:

```
cd api && npx vitest run test/lib/report/subject-resolver.test.ts
```

- [ ] **Step 3: Write the minimal implementation.** In `api/src/lib/report/types.ts` extend both unions exactly:

```ts
/** The v1 report templates (+ package & crypto-address, Phase 4). */
export type TemplateId = 'ransomware-group' | 'threat-actor' | 'cve' | 'ioc' | 'package' | 'crypto-address';

/** Entity class of the report subject (mirrors copilot's QueryType). */
export type SubjectType =
  | 'cve'
  | 'ip'
  | 'domain'
  | 'hash'
  | 'actor'
  | 'ransomware'
  | 'generic'
  | 'package'
  | 'crypto-address';
```

> Do NOT touch `ResolvedSubject.identifiers` shape yet unless Task 29 needs a new field (it adds `purl`/`ecosystem`/`chain` — keep that edit in Task 29 to keep this task atomic). Adding to `SubjectType` will make `TEMPLATE_BY_TYPE` in `subject-resolver.ts` a type error (missing keys) and `SOURCE_CATALOG` in `source-planner.ts` a type error (missing `Record<TemplateId,...>` keys); those are fixed in Tasks 29 and 30. If the implementer runs `tsc` now it WILL be red on those two files — that is expected; commit happens after Step 4 once this task's own test is green and the rest of Phase 4's tasks are NOT yet started, OR (preferred) fold Tasks 28+29+30 into one commit. **Recommended: do Tasks 28, 29, 30 back-to-back and commit once** so the tree never has a non-compiling intermediate state (the per-edit hook blocks on type errors — see CLAUDE.md). The steps below keep them as separate red/green cycles for TDD clarity; combine the commits.

- [ ] **Step 4: Run the test, expecting pass** (sandbox disabled). The two new literals now compile + the runtime assertions pass:

```
cd api && npx vitest run test/lib/report/subject-resolver.test.ts
```

> Defer the full 3× `tsc` + commit to Task 30 (the unions are not self-consistent until `TEMPLATE_BY_TYPE` and `SOURCE_CATALOG` gain their keys). If executing tasks strictly separately, expect `tsc` red here and proceed to Task 29 immediately.

### Task 29: `detectType` regex branches + `TEMPLATE_BY_TYPE` mappings

Add resolver support so a package/purl string resolves to `package` and an EVM/TRON address resolves to `crypto-address`. **Ordering is load-bearing (the P0 fix):** the `crypto-address` branch MUST run BEFORE the keyword/generic fall-through so a `0x…40hex` address no longer falls to `generic → threat-actor`. The EVM branch must also come after `HASH_RE` is irrelevant (a `0x`-prefixed 42-char string is NOT matched by `HASH_RE = /^[a-fA-F0-9]{32,64}$/` because of the `0x` prefix and the 40-not-64 hex length — verified in the spec P0 note), so order it cleanly after the existing IP/DOMAIN/HASH branches and before the keyword lists. Add the matching `TEMPLATE_BY_TYPE` entries.

**Files:**

- Modify: `api/src/lib/report/subject-resolver.ts` — add `EVM_RE`/`TRON_RE`/`PACKAGE_RE` consts near the other REs (lines 3–6); add two branches in `detectType()` (after the `HASH_RE` branch at line 13, before `const lower = …` at line 14); add `package`/`crypto-address` to `TEMPLATE_BY_TYPE` (lines 58–66); add canonicalization cases in `resolveSubject()`'s `switch` (lines 80–102) + the new identifier fields. Re-confirm all line numbers.
- Modify: `api/src/lib/report/types.ts` — extend `ResolvedSubject.identifiers` with optional `purl?`, `ecosystem?`, `packageName?`, `chain?`, `address?` fields (the `crypto-address`/`package` branches populate them so gatherers can read structured identifiers instead of re-parsing `canonical`).
- Test: `api/test/lib/report/subject-resolver.test.ts` (append).

- [ ] **Step 1: Write the failing test.** Append cases asserting: an EVM `0x`+40hex address → `type:'crypto-address'`, `suggestedTemplate:'crypto-address'` (NOT `generic`/`threat-actor`); a TRON `T…34char` address → `crypto-address`; a purl/package string (e.g. `pkg:npm/left-pad@1.3.0` and a bare `npm:lodash`) → `package`; and a guard that a plain 64-hex SHA-256 STILL resolves to `hash` (not crypto-address) and a CVE/IP/domain are unchanged (no regression in the existing branches). Append to `api/test/lib/report/subject-resolver.test.ts`:

```ts
describe('detectType: crypto-address + package branches (P0 fix)', () => {
  it('an EVM 0x+40hex address resolves to crypto-address, never generic/threat-actor', () => {
    const r = resolveSubject('0x8589427373D6D84E98730D7795D8f6f8731FDA16');
    expect(r.type).toBe('crypto-address');
    expect(r.suggestedTemplate).toBe('crypto-address');
    expect(r.identifiers.address).toBe('0x8589427373d6d84e98730d7795d8f6f8731fda16'); // lowercased
    expect(r.identifiers.chain).toBe('evm');
  });

  it('a TRON T-prefixed base58 address resolves to crypto-address', () => {
    const r = resolveSubject('TJRabPrwbZy45sbavfcjinPJC18kjpRTv8');
    expect(r.type).toBe('crypto-address');
    expect(r.suggestedTemplate).toBe('crypto-address');
    expect(r.identifiers.chain).toBe('tron');
  });

  it('a purl resolves to package', () => {
    const r = resolveSubject('pkg:npm/left-pad@1.3.0');
    expect(r.type).toBe('package');
    expect(r.suggestedTemplate).toBe('package');
    expect(r.identifiers.ecosystem).toBe('npm');
    expect(r.identifiers.packageName).toBe('left-pad');
  });

  it('a bare eco:name form resolves to package', () => {
    const r = resolveSubject('npm:lodash');
    expect(r.type).toBe('package');
    expect(r.identifiers.ecosystem).toBe('npm');
    expect(r.identifiers.packageName).toBe('lodash');
  });

  it('a 64-hex SHA-256 still resolves to hash (no crypto-address regression)', () => {
    const r = resolveSubject('a'.repeat(64));
    expect(r.type).toBe('hash');
  });

  it('CVE/IP/domain branches are unchanged', () => {
    expect(resolveSubject('CVE-2024-1709').type).toBe('cve');
    expect(resolveSubject('8.8.8.8').type).toBe('ip');
    expect(resolveSubject('example.com').type).toBe('domain');
  });
});
```

- [ ] **Step 2: Run it, expecting failure** (the EVM address resolves to `generic`/`threat-actor` today; purl resolves to `generic`). Sandbox disabled:

```
cd api && npx vitest run test/lib/report/subject-resolver.test.ts
```

- [ ] **Step 3: Write the minimal implementation.** In `api/src/lib/report/subject-resolver.ts` add the REs and branches. **The crypto branch MUST precede the keyword/generic fall-through.** Insert after the `HASH_RE` const and after the `HASH_RE` branch:

```ts
// near the other REs (lines 3-6)
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const TRON_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
// purl (pkg:eco/name@ver) OR a bare "eco:name@ver" spec. Kept narrow so it never
// eats domains/hashes (those branches run first) — eco is a known-ish token, name required.
const PURL_RE = /^pkg:([a-z]+)\/([^@\s]+)(?:@(.+))?$/i;
const PKG_SPEC_RE =
  /^(npm|pypi|pip|maven|cargo|go|gem|rubygems|nuget|composer|packagist|hex|pub):([^@\s]+)(?:@(.+))?$/i;
```

```ts
// inside detectType(), AFTER the HASH_RE branch (line 13) and BEFORE `const lower = …` (line 14):
if (EVM_RE.test(query.trim()) || TRON_RE.test(query.trim())) return 'crypto-address';
if (PURL_RE.test(query.trim()) || PKG_SPEC_RE.test(query.trim())) return 'package';
```

```ts
// extend TEMPLATE_BY_TYPE (lines 58-66): add the two keys (tsc requires them now).
const TEMPLATE_BY_TYPE: Record<SubjectType, TemplateId> = {
  cve: 'cve',
  ip: 'ioc',
  domain: 'ioc',
  hash: 'ioc',
  actor: 'threat-actor',
  ransomware: 'ransomware-group',
  generic: 'threat-actor',
  package: 'package',
  'crypto-address': 'crypto-address',
};
```

```ts
// add canonicalization cases in resolveSubject()'s switch (lines 80-102):
case 'crypto-address': {
  const isTron = TRON_RE.test(trimmed);
  canonical = isTron ? trimmed : trimmed.toLowerCase(); // EVM lowercased; TRON base58 is case-sensitive
  identifiers.address = canonical;
  identifiers.chain = isTron ? 'tron' : 'evm';
  break;
}
case 'package': {
  const m = PURL_RE.exec(trimmed) ?? PKG_SPEC_RE.exec(trimmed);
  if (m) {
    identifiers.ecosystem = m[1]!.toLowerCase();
    identifiers.packageName = m[2]!;
    if (m[3]) identifiers.purl = trimmed;
  }
  canonical = trimmed;
  break;
}
```

And in `api/src/lib/report/types.ts` extend `ResolvedSubject.identifiers`:

```ts
  identifiers: {
    cve?: string;
    iocType?: 'ipv4' | 'domain' | 'hash';
    group?: string;
    aliases?: string[];
    // Phase 4:
    address?: string;
    chain?: 'evm' | 'tron';
    ecosystem?: string;
    packageName?: string;
    purl?: string;
  };
```

> **Note on TRON length:** a TRON address is `T` + 33 base58 chars = 34 total. The test literal `TJRabPrwbZy45sbavfcjinPJC18kjpRTv8` is 34 chars — confirm the implementer's literal is exactly 34. If the chosen fixture differs, fix the regex count, not the test intent.

- [ ] **Step 4: Run the test, expecting pass** (sandbox disabled):

```
cd api && npx vitest run test/lib/report/subject-resolver.test.ts
```

> Defer 3× `tsc` + commit to Task 30 (SOURCE_CATALOG still lacks the two new template keys → `tsc` red on `source-planner.ts`). If combining commits as recommended, this is one logical change with Task 28.

### Task 30: `SOURCE_CATALOG` entries for `package` + `crypto-address`

Add the two new template buckets to `SOURCE_CATALOG` (a `Record<TemplateId, SourceDescriptor[]>` in `source-planner.ts`) with descriptors for every deferred gatherer. **No FETCHERS yet** — this task only adds catalog descriptors so `SOURCE_CATALOG` satisfies the now-extended `Record<TemplateId,...>` (the missing-key `tsc` error from Tasks 28/29 is resolved here). Each descriptor's `cost` is the true subrequest cost of its lib fn (design §8.2/§8.3). The FETCHERS that back these ids land in Tasks 31a–31g; until then a planned-but-unwired id yields a `'empty'`/missing-fetcher result (the existing engine handles an absent `FETCHERS[id]` gracefully — see `gatherer.test.ts:35`'s "missing fetcher id" case). To avoid shipping a window where the catalog lists an id with no fetcher in a deployable state, **commit Task 30 together with Tasks 31a–31g** (the catalog + its fetchers as one PR), even though each fetcher keeps its own red/green test cycle.

**Files:**

- Modify: `api/src/lib/report/source-planner.ts` — add `package` and `crypto-address` keys to `SOURCE_CATALOG` (after the `ioc` block, ~line 54). Re-confirm.
- Test: `api/test/lib/report/source-planner.test.ts` (create/append).

- [ ] **Step 1: Write the failing test.** Assert `planSources({ template: 'package' }, …)` and `planSources({ template: 'crypto-address' }, …)` return plans whose flattened descriptor ids include exactly the expected sets, and that the summed `live` cost of the `crypto-address` template fits a single ≤40 round (the P5 #14 budget recompute). Create/append `api/test/lib/report/source-planner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planSources, SOURCE_CATALOG } from '../../../src/lib/report/source-planner';

const ids = (t: 'package' | 'crypto-address') => SOURCE_CATALOG[t].map((d) => d.id);

describe('SOURCE_CATALOG: package + crypto-address', () => {
  it('package template lists the 3 software sources', () => {
    expect(ids('package')).toEqual(expect.arrayContaining(['osv-package', 'depsdev', 'ossf-malicious-package']));
  });

  it('crypto-address template lists the zero-auth + keyed crypto sources', () => {
    expect(ids('crypto-address')).toEqual(
      expect.arrayContaining([
        'chainalysis-oracle',
        'tornado-cash-mixers',
        'goplus-token-security',
        'honeypot-is',
        'ethlist-label',
        'arkham-attribution',
        'misttrack-risk',
      ])
    );
  });

  it('crypto-address round packs into ≤40 subrequests (P5 #14 budget)', () => {
    const total = SOURCE_CATALOG['crypto-address'].reduce((s, d) => s + d.cost, 0);
    expect(total).toBeLessThanOrEqual(40);
    const plan = planSources({ template: 'crypto-address' }, { maxPhaseSubrequests: 40 });
    for (const phase of plan.phases) {
      expect(phase.reduce((s, d) => s + d.cost, 0)).toBeLessThanOrEqual(40);
    }
  });
});
```

- [ ] **Step 2: Run it, expecting failure** (`SOURCE_CATALOG['package']` is undefined → throws). Sandbox disabled:

```
cd api && npx vitest run test/lib/report/source-planner.test.ts
```

- [ ] **Step 3: Write the minimal implementation.** Add the two buckets to `SOURCE_CATALOG`. Costs match each lib fn's design §8 cost (tornado=0 embedded; ethlist=1; goplus/honeypot/oracle 1–3 → declare the warm-cache cost the design table uses; arkham/misttrack=1, KV-cached). Budget check: `tornado-cash-mixers(0) + chainalysis-oracle(1) + goplus-token-security(1) + honeypot-is(1) + ethlist-label(1) + arkham-attribution(1) + misttrack-risk(1) = 6` live cost — far under 40 (P5 #14 satisfied; the design's "EVM-address fires crypto gatherers in the ioc round" math is moot — the crypto round is its OWN template now). Append after the `ioc` array:

```ts
  package: [
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'osv-package', name: 'OSV.dev (package vulns + MAL-)', kind: 'live', authority: 'A', cost: 1 },
    { id: 'depsdev', name: 'deps.dev (Scorecard + dep-graph)', kind: 'live', authority: 'A', cost: 4 },
    { id: 'ossf-malicious-package', name: 'OpenSSF malicious-packages', kind: 'live', authority: 'A', cost: 1 },
  ],
  'crypto-address': [
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'tornado-cash-mixers', name: 'Tornado Cash pool list', kind: 'cache', authority: 'A', cost: 0 },
    { id: 'chainalysis-oracle', name: 'Chainalysis Sanctions Oracle', kind: 'live', authority: 'A', cost: 1 },
    { id: 'goplus-token-security', name: 'GoPlus token-security', kind: 'live', authority: 'B', cost: 1 },
    { id: 'honeypot-is', name: 'Honeypot.is', kind: 'live', authority: 'B', cost: 1 },
    { id: 'ethlist-label', name: 'ethereum-lists label', kind: 'live', authority: 'A', cost: 1 },
    { id: 'arkham-attribution', name: 'Arkham Intelligence', kind: 'live', authority: 'B', cost: 1 },
    { id: 'misttrack-risk', name: 'MistTrack AML risk', kind: 'live', authority: 'B', cost: 1 },
  ],
```

> Reuse `rag-corpus` (already a real, shippable id with a wired fetcher) so each new template has at least one cheap phase-0 source. If the maintainer prefers NOT to surface keyed sources in the catalog while unkeyed, drop `arkham-attribution`/`misttrack-risk` here and add them in Phase 5 — note the tradeoff in the PR (default: keep them, they self-no-op to `needs-key`).

- [ ] **Step 4: Run the test, expecting pass** (sandbox disabled):

```
cd api && npx vitest run test/lib/report/source-planner.test.ts
```

- [ ] **Step 5: Typecheck.** With Tasks 28+29+30 applied the unions are now self-consistent (`TEMPLATE_BY_TYPE` + `SOURCE_CATALOG` both have all keys). Run all three (no sandbox needed):

```
tsc -p tsconfig.json && tsc -p api/tsconfig.json && tsc -p api/tsconfig.worker.json
```

- [ ] **Step 6: Commit Tasks 28+29+30 as one resolver+catalog change.**

```
git add api/src/lib/report/types.ts api/src/lib/report/subject-resolver.ts api/src/lib/report/source-planner.ts api/test/lib/report/subject-resolver.test.ts api/test/lib/report/source-planner.test.ts
git commit -m "feat(report): package + crypto-address subject types/templates (Phase 4 P0 unblock)

detectType gains EVM/TRON address + purl/package branches ordered BEFORE the
keyword/generic fall-through, so a 0x..40hex address resolves to crypto-address
(not generic->threat-actor). TEMPLATE_BY_TYPE + SOURCE_CATALOG gain both new
templates with honest costs (crypto-address round packs to <=6 live subreq).
No gatherers wired yet (Tasks 31a-31g).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 31a: `osv-package` gatherer (`package` template)

Wire the deferred `osv-package` gatherer into `FETCHERS`, importing `queryOsvPackage` (Phase 2, `api/src/lib/supply-chain/osv.ts`). Guards `type === 'package'`; reads `ctx.subject.identifiers.{ecosystem,packageName}` (populated by Task 29); maps each `SCFinding` to one `SourceItem` (mirrors `cveFetcher`). **DEPENDS ON Phase 2 Task ~21 (`queryOsvPackage`) being merged.**

**Files:**

- Modify: `api/src/lib/report/gatherer.ts` — add the import near the other lib imports (after line 23) and the `osv-package` Fetcher to `FETCHERS` (opened line 87). FETCHERS key MUST equal the catalog id `'osv-package'`.
- Test: `api/test/lib/supply-chain/osv-package-gatherer.test.ts` (new).

- [ ] **Step 1: Write the failing gatherer test.** Build a minimal `GatherContext`; call `FETCHERS['osv-package'](ctx, planned)` directly. Inject a fake fetch (via stubbing `globalThis.fetch`, since the gatherer calls the lib's default fetch) returning a captured OSV `/v1/query` body with one MAL- and one CVE finding. Assert: a `package` subject maps each finding to a `SourceItem` with `fields.kind` + the structured finding; a wrong subject type (`'cve'`) self-skips to `'empty'` with ZERO fetches. Create the file:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FETCHERS } from '../../../src/lib/report/gatherer';
import type { GatherContext } from '../../../src/lib/report/gatherer';

const planned = {
  id: 'osv-package',
  name: 'OSV.dev',
  kind: 'live' as const,
  authority: 'A' as const,
  cost: 1,
  phase: 1,
};

const ctx = (type = 'package', canonical = 'npm:left-pad'): GatherContext => ({
  env: {} as never,
  subject: {
    raw: canonical,
    type: type as never,
    canonical,
    identifiers: type === 'package' ? { ecosystem: 'npm', packageName: 'left-pad' } : {},
    suggestedTemplate: 'package',
  },
  signal: AbortSignal.timeout(5000),
});

describe('osv-package gatherer (package template)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('wrong subject type self-skips to empty with zero fetches', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await FETCHERS['osv-package']!(ctx('cve', 'CVE-2024-1709'), planned);
    expect(r.status).toBe('empty');
    expect(f).not.toHaveBeenCalled();
  });

  it('maps OSV findings to SourceItems for a package subject', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              vulns: [
                { id: 'MAL-2024-0001', summary: 'evil', aliases: [] },
                { id: 'CVE-2024-9999', summary: 'vuln', aliases: [] },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
      )
    );
    const r = await FETCHERS['osv-package']!(ctx(), planned);
    expect(r.status).toBe('ok');
    expect(r.total).toBeGreaterThanOrEqual(1);
    expect(r.items.some((i) => i.text.includes('MAL-2024-0001'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expecting failure** (`FETCHERS['osv-package']` is undefined → throws). Sandbox disabled:

```
cd api && npx vitest run test/lib/supply-chain/osv-package-gatherer.test.ts
```

- [ ] **Step 3: Add the gatherer.** Import + Fetcher in `gatherer.ts`. Self-skip non-`package`, read structured identifiers, map findings:

```ts
import { queryOsvPackage } from '../supply-chain/osv';
```

```ts
  'osv-package': async (ctx, src) => {
    if (ctx.subject.type !== 'package') return base(src, 'empty');
    const eco = ctx.subject.identifiers.ecosystem;
    const name = ctx.subject.identifiers.packageName;
    if (!eco || !name) return base(src, 'empty');
    const r = await queryOsvPackage(name, eco, undefined, { signal: ctx.signal });
    if (r.status === 'error') return base(src, 'error');
    if (r.status !== 'ok' || r.findings.length === 0) return base(src, 'empty');
    const items: SourceItem[] = r.findings.map((f) => ({
      text: `OSV.dev: ${f.id}${f.malicious ? ' (MALICIOUS)' : ''}${f.severity ? ` · ${f.severity}` : ''}${f.summary ? ` — ${f.summary}` : ''}`,
      url: f.references?.[0],
      observed_at: f.modified,
      fields: { kind: 'osv-finding', package: r.package, ecosystem: r.ecosystem, ...f },
    }));
    return base(src, 'ok', items);
  },
```

- [ ] **Step 4: Run the test, expecting pass** (sandbox disabled):

```
cd api && npx vitest run test/lib/supply-chain/osv-package-gatherer.test.ts
```

- [ ] **Step 5: Typecheck + commit** (defer the single Phase-4 typecheck+commit to Task 31g if executing 30+31a–g as one PR; otherwise run the 3× tsc here). See Task 31g for the combined commit.

### Task 31b: `depsdev` gatherer (`package` template)

As Task 31a, importing `fetchDepsDev` (Phase 2, `api/src/lib/supply-chain/depsdev.ts`, signature `fetchDepsDev(system, name, version, opts)`). Guards `type === 'package'`. Emits Scorecard/dep-graph/license facts as `SourceItem`s. **DEPENDS ON Phase 2 Task ~22 (`fetchDepsDev`).**

**Files:**

- Modify: `api/src/lib/report/gatherer.ts` (import `fetchDepsDev`; add `depsdev` Fetcher).
- Test: `api/test/lib/supply-chain/depsdev-gatherer.test.ts` (new).

- [ ] **Step 1: Write the failing gatherer test.** Same shape as 31a: wrong-type (`'crypto-address'`) → `'empty'` zero-fetch; a `package` subject with a stubbed deps.dev response → items. Assert the `fetchDepsDev` call is `system`-first (`'npm'`, `'left-pad'`) — guard the arg-order footgun (deps.dev is `system, name`, unlike `queryOsvPackage` which is `name, ecosystem`). Create the file (mirror 31a; for arg-order, stub `globalThis.fetch` and assert the request URL contains `/npm/` then `left-pad`).

- [ ] **Step 2: Run it, expecting failure** (sandbox disabled):

```
cd api && npx vitest run test/lib/supply-chain/depsdev-gatherer.test.ts
```

- [ ] **Step 3: Add the gatherer.**

```ts
import { fetchDepsDev } from '../supply-chain/depsdev';
```

```ts
  depsdev: async (ctx, src) => {
    if (ctx.subject.type !== 'package') return base(src, 'empty');
    const eco = ctx.subject.identifiers.ecosystem;
    const name = ctx.subject.identifiers.packageName;
    if (!eco || !name) return base(src, 'empty');
    const r = await fetchDepsDev(eco, name, undefined, { signal: ctx.signal }); // system-first!
    if (r.status === 'error') return base(src, 'error');
    if (r.status !== 'ok') return base(src, 'empty');
    const items: SourceItem[] = [];
    // one item per citable fact (version, scorecard, license, dep-graph) — read from r/detail
    items.push({
      text: `deps.dev: ${r.package}@${r.version ?? '?'} (${r.ecosystem})${r.total ? ` · ${r.total} known advisories` : ''}`,
      fields: { kind: 'depsdev', package: r.package, ecosystem: r.ecosystem, version: r.version, total: r.total },
    });
    return base(src, items.length ? 'ok' : 'empty', items);
  },
```

> Confirm `SCSoftwareResult` fields actually carry deps.dev's Scorecard/license/dep-graph (the design §2.3 envelope is `findings`-centric; deps.dev's richer object may live in `detail` or a source-specific shape). Read the merged `depsdev.ts` and map whatever fields it exposes — do NOT invent fields. The text above is a minimal honest item; expand per the real shape.

- [ ] **Step 4: Run the test, expecting pass** (sandbox disabled).
- [ ] **Step 5: Commit with Task 31g.**

### Task 31c: `ossf-malicious-package` gatherer (`package` template)

As 31a, importing `checkMaliciousPackage` (Phase 2, `api/src/lib/supply-chain/malicious-packages.ts`, signature `checkMaliciousPackage(name, ecosystem, version?, opts)` — NAME-FIRST). Guards `type === 'package'`. Only emits items when `malicious_count > 0` (else `'empty'` — a clean package is honestly empty, not an error). **DEPENDS ON Phase 2 Task ~? (`checkMaliciousPackage`).**

**Files:**

- Modify: `api/src/lib/report/gatherer.ts` (import `checkMaliciousPackage`; add `ossf-malicious-package` Fetcher).
- Test: `api/test/lib/supply-chain/ossf-malicious-gatherer.test.ts` (new).

- [ ] **Step 1: Write the failing gatherer test.** wrong-type → `'empty'` zero-fetch; a package with a stubbed MAL- response → `'ok'` with a malicious item; a clean package (no MAL-) → `'empty'`. Assert the call is NAME-first (`checkMaliciousPackage('left-pad','npm',...)`).
- [ ] **Step 2: Run it, expecting failure** (sandbox disabled):

```
cd api && npx vitest run test/lib/supply-chain/ossf-malicious-gatherer.test.ts
```

- [ ] **Step 3: Add the gatherer.**

```ts
import { checkMaliciousPackage } from '../supply-chain/malicious-packages';
```

```ts
  'ossf-malicious-package': async (ctx, src) => {
    if (ctx.subject.type !== 'package') return base(src, 'empty');
    const eco = ctx.subject.identifiers.ecosystem;
    const name = ctx.subject.identifiers.packageName;
    if (!eco || !name) return base(src, 'empty');
    const r = await checkMaliciousPackage(name, eco, undefined, { signal: ctx.signal }); // name-first!
    if (r.status === 'error') return base(src, 'error');
    if (r.malicious_count === 0) return base(src, 'empty');
    const items: SourceItem[] = r.findings
      .filter((f) => f.malicious)
      .map((f) => ({
        text: `OpenSSF malicious-packages: ${f.id} flags ${r.package} (${r.ecosystem}) as MALICIOUS${f.summary ? ` — ${f.summary}` : ''}`,
        url: f.references?.[0],
        fields: { kind: 'malicious-package', package: r.package, ecosystem: r.ecosystem, ...f },
      }));
    return base(src, items.length ? 'ok' : 'empty', items);
  },
```

- [ ] **Step 4: Run the test, expecting pass** (sandbox disabled).
- [ ] **Step 5: Commit with Task 31g.**

### Task 31d: zero-auth crypto gatherers — `chainalysis-oracle`, `tornado-cash-mixers`, `goplus-token-security`, `honeypot-is`, `ethlist-label` (`crypto-address` template)

Wire the five zero-auth crypto gatherers in one task (they share the `type === 'crypto-address'` guard + the `SCAddressSignal` mapping shape). Import the lib fns from Phase 3 (`chainalysis-oracle.ts`, `tornado-cash.ts`, `goplus.ts`, `honeypot.ts`, `ethereum-lists.ts`). **DEPENDS ON Phase 3 Tasks 22/23/24/25/26.** Note: `checkTornadoCash` is SYNC and returns a `boolean` (embedded set, zero subrequest) — its gatherer does NOT await a fetch.

**Files:**

- Modify: `api/src/lib/report/gatherer.ts` (5 imports; 5 Fetchers).
- Test: `api/test/lib/supply-chain/crypto-gatherers.test.ts` (new).

- [ ] **Step 1: Write the failing gatherer test.** For EACH of the five ids: a wrong subject type (`'package'` or `'ip'`) self-skips to `'empty'` with ZERO fetches; the right subject (`crypto-address`) with a stubbed lib response maps to `SourceItem`s. For `tornado-cash-mixers`, assert it does NOT call fetch at all (sync embedded set) and that a known TC address → `'ok'`, a random address → `'empty'`. Create `api/test/lib/supply-chain/crypto-gatherers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FETCHERS } from '../../../src/lib/report/gatherer';
import type { GatherContext } from '../../../src/lib/report/gatherer';

const planned = (id: string) => ({ id, name: id, kind: 'live' as const, authority: 'A' as const, cost: 1, phase: 1 });
const ctx = (type = 'crypto-address', canonical = '0x' + 'a'.repeat(40)): GatherContext => ({
  env: {} as never,
  subject: {
    raw: canonical,
    type: type as never,
    canonical,
    identifiers: type === 'crypto-address' ? { address: canonical, chain: 'evm' } : {},
    suggestedTemplate: 'crypto-address',
  },
  signal: AbortSignal.timeout(5000),
});

const CRYPTO_IDS = [
  'chainalysis-oracle',
  'tornado-cash-mixers',
  'goplus-token-security',
  'honeypot-is',
  'ethlist-label',
];

describe('crypto-address gatherers', () => {
  beforeEach(() => vi.restoreAllMocks());

  for (const id of CRYPTO_IDS) {
    it(`${id}: wrong subject type self-skips to empty with zero fetches`, async () => {
      const f = vi.fn();
      vi.stubGlobal('fetch', f);
      const r = await FETCHERS[id]!(ctx('package', 'npm:left-pad'), planned(id));
      expect(r.status).toBe('empty');
      expect(f).not.toHaveBeenCalled();
    });
  }

  it('tornado-cash-mixers makes ZERO network calls (embedded set)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await FETCHERS['tornado-cash-mixers']!(ctx(), planned('tornado-cash-mixers'));
    expect(['ok', 'empty']).toContain(r.status);
    expect(f).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, expecting failure** (the five ids are absent → throws). Sandbox disabled:

```
cd api && npx vitest run test/lib/supply-chain/crypto-gatherers.test.ts
```

- [ ] **Step 3: Add the five gatherers.** Imports + Fetchers in `gatherer.ts`. Map `SCAddressSignal` → `SourceItem`s (one per `risk_flag` + a verdict line). The shared mapper convention:

```ts
import { checkChainalysisOracle } from '../supply-chain/chainalysis-oracle';
import { checkTornadoCash } from '../supply-chain/tornado-cash';
import { fetchTokenSecurity } from '../supply-chain/goplus';
import { checkHoneypot } from '../supply-chain/honeypot';
import { lookupEthList } from '../supply-chain/ethereum-lists';
```

```ts
  // helper (place near base()) — map an SCAddressSignal into SourceItems
  // (inline per-gatherer is fine too; keep it honest about status)

  'chainalysis-oracle': async (ctx, src) => {
    if (ctx.subject.type !== 'crypto-address') return base(src, 'empty');
    if (ctx.subject.identifiers.chain !== 'evm') return base(src, 'empty'); // EVM-only oracle (TRON/BTC excluded)
    const r = await checkChainalysisOracle(ctx.subject.canonical, 'eth', { signal: ctx.signal });
    if (r.status === 'error') return base(src, 'error');
    if (r.status !== 'ok' || r.sanctioned === null) return base(src, 'empty'); // null = inconclusive (RPC rejected eth_call)
    if (!r.sanctioned) return base(src, 'empty'); // not sanctioned = honestly empty for a report section
    return base(src, 'ok', [{
      text: `Chainalysis Sanctions Oracle: ${ctx.subject.canonical} is SANCTIONED (on-chain isSanctioned=true)`,
      observed_at: r.fetched_at,
      fields: { kind: 'sanctions-oracle', sanctioned: true, ...r.detail },
    }]);
  },

  'tornado-cash-mixers': async (ctx, src) => {
    if (ctx.subject.type !== 'crypto-address') return base(src, 'empty');
    const hit = checkTornadoCash(ctx.subject.canonical); // sync, embedded, zero subrequest
    if (!hit) return base(src, 'empty');
    return base(src, 'ok', [{
      text: `Tornado Cash pool list: ${ctx.subject.canonical} is a known TC mixer instance (AML/laundering signal, ofac_status: delisted_2025-03-21 — NOT a sanctions hit)`,
      fields: { kind: 'tornado-cash', mixer: true, ofac_status: 'delisted_2025-03-21' },
    }]);
  },

  'goplus-token-security': async (ctx, src) => {
    if (ctx.subject.type !== 'crypto-address') return base(src, 'empty');
    const r = await fetchTokenSecurity(ctx.subject.canonical, { signal: ctx.signal });
    if (r.status === 'error') return base(src, 'error');
    if (r.status !== 'ok' || r.risk_flags.length === 0) return base(src, 'empty');
    const items: SourceItem[] = r.risk_flags.map((flag) => ({
      text: `GoPlus token-security: ${ctx.subject.canonical} flagged "${flag}"${r.risk_score != null ? ` (risk ${r.risk_score})` : ''}`,
      observed_at: r.fetched_at,
      fields: { kind: 'goplus', flag, risk_score: r.risk_score, label: r.label },
    }));
    return base(src, 'ok', items);
  },

  'honeypot-is': async (ctx, src) => {
    if (ctx.subject.type !== 'crypto-address') return base(src, 'empty');
    const r = await checkHoneypot(ctx.subject.canonical, 'ethereum', { signal: ctx.signal });
    if (r.status === 'error') return base(src, 'error');
    if (r.status !== 'ok' || r.risk_flags.length === 0) return base(src, 'empty'); // 429/null → empty, never "safe"
    const items: SourceItem[] = r.risk_flags.map((flag) => ({
      text: `Honeypot.is: ${ctx.subject.canonical} — ${flag}`,
      observed_at: r.fetched_at,
      fields: { kind: 'honeypot', flag, risk_score: r.risk_score },
    }));
    return base(src, 'ok', items);
  },

  'ethlist-label': async (ctx, src) => {
    if (ctx.subject.type !== 'crypto-address') return base(src, 'empty');
    if (ctx.subject.identifiers.chain !== 'evm') return base(src, 'empty'); // ethereum-lists is EVM-keyed
    const r = await lookupEthList(ctx.subject.canonical, { signal: ctx.signal });
    if (r.status === 'error') return base(src, 'error');
    if (r.status !== 'ok' || !r.label) return base(src, 'empty');
    return base(src, 'ok', [{
      text: `ethereum-lists: ${ctx.subject.canonical} = ${r.label}${r.category ? ` (${r.category})` : ''}`,
      observed_at: r.fetched_at,
      fields: { kind: 'ethlist', label: r.label, category: r.category },
    }]);
  },
```

> **Confirm field names against the merged libs.** The `SCAddressSignal` fields (`sanctioned`, `risk_flags`, `risk_score`, `label`, `category`, `detail`) are from design §2.3, but read the actual Phase-3 `chainalysis-oracle.ts`/`goplus.ts`/`honeypot.ts`/`ethereum-lists.ts` to confirm exact shapes (e.g. honeypot's `null` vs `false` semantics, the design §6(c) "degrade to isHoneypot:null on 429, never infer safe"). Do NOT invent fields. The honeypot gatherer must NOT emit a "safe" item — only risk flags.

- [ ] **Step 4: Run the test, expecting pass** (sandbox disabled).
- [ ] **Step 5: Commit with Task 31g.**

### Task 31e: key-gated crypto gatherers — `arkham-attribution`, `misttrack-risk` (`crypto-address` template)

Wire the two keyed gatherers. Their lib fns take `ctx.env` as a typed second arg and return `status:'needs-key'` with ZERO network when the key is unset, so the gatherer is honest (NOT silently-empty — it's explicitly `needs-key`, which maps to `'empty'` in the SourceResult status enum but carries the distinction in `fields`/logs). **DEPENDS ON Phase 3 Task 27 (`lookupArkhamEntity`/`lookupMisttrack`).** Phase 5 provisions the keys.

**Files:**

- Modify: `api/src/lib/report/gatherer.ts` (2 imports; 2 Fetchers).
- Test: `api/test/lib/supply-chain/keyed-crypto-gatherers.test.ts` (new).

- [ ] **Step 1: Write the failing gatherer test.** For each id: wrong subject type → `'empty'` zero-fetch; right subject with `ctx.env` lacking the key → `'empty'` (needs-key) with ZERO network; right subject WITH a fake key + stubbed lib response → `'ok'`. The key-absent path is the load-bearing assertion (proves the no-op guard). Create the file:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FETCHERS } from '../../../src/lib/report/gatherer';
import type { GatherContext } from '../../../src/lib/report/gatherer';

const planned = (id: string) => ({ id, name: id, kind: 'live' as const, authority: 'B' as const, cost: 1, phase: 1 });
const ctx = (
  env: Record<string, unknown>,
  type = 'crypto-address',
  canonical = '0x' + 'b'.repeat(40)
): GatherContext => ({
  env: env as never,
  subject: {
    raw: canonical,
    type: type as never,
    canonical,
    identifiers: { address: canonical, chain: 'evm' },
    suggestedTemplate: 'crypto-address',
  },
  signal: AbortSignal.timeout(5000),
});

describe('keyed crypto gatherers (needs-key no-op)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('arkham-attribution returns empty + ZERO network when ARKHAM_API_KEY unset', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await FETCHERS['arkham-attribution']!(ctx({}), planned('arkham-attribution'));
    expect(r.status).toBe('empty');
    expect(f).not.toHaveBeenCalled();
  });

  it('misttrack-risk returns empty + ZERO network when MISTTRACK_API_KEY unset', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await FETCHERS['misttrack-risk']!(ctx({}), planned('misttrack-risk'));
    expect(r.status).toBe('empty');
    expect(f).not.toHaveBeenCalled();
  });

  it('arkham-attribution wrong subject type self-skips with zero fetches', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await FETCHERS['arkham-attribution']!(
      ctx({ ARKHAM_API_KEY: 'k' }, 'ip', '8.8.8.8'),
      planned('arkham-attribution')
    );
    expect(r.status).toBe('empty');
    expect(f).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, expecting failure** (ids absent → throws). Sandbox disabled:

```
cd api && npx vitest run test/lib/supply-chain/keyed-crypto-gatherers.test.ts
```

- [ ] **Step 3: Add the two gatherers.** Pass `ctx.env`; the lib returns `needs-key` (zero network) when unset, mapped to `'empty'`:

```ts
import { lookupArkhamEntity } from '../supply-chain/arkham';
import { lookupMisttrack } from '../supply-chain/misttrack';
```

```ts
  'arkham-attribution': async (ctx, src) => {
    if (ctx.subject.type !== 'crypto-address') return base(src, 'empty');
    const r = await lookupArkhamEntity(ctx.subject.canonical, ctx.env, { signal: ctx.signal });
    if (r.status === 'needs-key') return base(src, 'empty'); // dormant until Phase 5 key
    if (r.status === 'error') return base(src, 'error');
    if (r.status !== 'ok' || !r.label) return base(src, 'empty');
    return base(src, 'ok', [{
      text: `Arkham: ${ctx.subject.canonical} attributed to ${r.label}${r.category ? ` (${r.category})` : ''}`,
      observed_at: r.fetched_at,
      fields: { kind: 'arkham', label: r.label, category: r.category, sanctioned: r.sanctioned, ...r.detail },
    }]);
  },

  'misttrack-risk': async (ctx, src) => {
    if (ctx.subject.type !== 'crypto-address') return base(src, 'empty');
    const r = await lookupMisttrack(ctx.subject.canonical, ctx.env, { signal: ctx.signal });
    if (r.status === 'needs-key') return base(src, 'empty'); // dormant until Phase 5 key
    if (r.status === 'error') return base(src, 'error');
    if (r.status !== 'ok') return base(src, 'empty');
    const items: SourceItem[] = (r.risk_flags.length ? r.risk_flags : ['risk_score']).map((flag) => ({
      text: `MistTrack: ${ctx.subject.canonical}${r.risk_score != null ? ` risk ${r.risk_score}` : ''}${flag !== 'risk_score' ? ` · ${flag}` : ''}`,
      observed_at: r.fetched_at,
      fields: { kind: 'misttrack', flag, risk_score: r.risk_score, category: r.category },
    }));
    return base(src, 'ok', items);
  },
```

- [ ] **Step 4: Run the test, expecting pass** (sandbox disabled).
- [ ] **Step 5: Commit with Task 31g.**

### Task 31f: end-to-end resolve→plan→gather smoke (package + crypto-address)

A single integration-ish test (still pure — stubbed fetch) proving the full chain: `resolveSubject('0x…') → planSources('crypto-address') → gatherPhase` runs every wired crypto gatherer and returns one `SourceResult` each (no throw, honest statuses), and likewise for a package subject. This is the "the deferred gatherers can finally fire" proof.

**Files:**

- Test: `api/test/lib/report/phase4-e2e.test.ts` (new).

- [ ] **Step 1: Write the failing test.** Use `resolveSubject` + `planSources` + `gatherPhase` together (mirror `gatherer.test.ts:24-32`). Stub `caches` + `fetch` so cache/rag/live sources all resolve without network. Assert: a `crypto-address` plan's gather returns a `SourceResult` for each crypto id with a status in the valid enum; a `package` plan likewise; and that NONE of them throw. Create the file:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSubject } from '../../../src/lib/report/subject-resolver';
import { planSources } from '../../../src/lib/report/source-planner';
import { gatherPhase } from '../../../src/lib/report/gatherer';

describe('Phase 4 e2e: deferred gatherers now fire', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('caches', { default: { match: vi.fn().mockResolvedValue(undefined), put: vi.fn() } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    );
  });

  it('a crypto-address subject resolves to crypto-address and gathers without throwing', async () => {
    const subject = resolveSubject('0x' + 'a'.repeat(40));
    expect(subject.type).toBe('crypto-address');
    const plan = planSources({ template: subject.suggestedTemplate }, { maxPhaseSubrequests: 40 });
    for (let p = 0; p < plan.phases.length; p++) {
      const results = await gatherPhase(plan, p, { env: {} as never, subject, signal: AbortSignal.timeout(5000) });
      for (const r of results) expect(['ok', 'empty', 'error', 'timeout']).toContain(r.status);
    }
  });

  it('a package subject resolves to package and gathers without throwing', async () => {
    const subject = resolveSubject('npm:left-pad');
    expect(subject.type).toBe('package');
    const plan = planSources({ template: subject.suggestedTemplate }, { maxPhaseSubrequests: 40 });
    for (let p = 0; p < plan.phases.length; p++) {
      const results = await gatherPhase(plan, p, { env: {} as never, subject, signal: AbortSignal.timeout(5000) });
      for (const r of results) expect(['ok', 'empty', 'error', 'timeout']).toContain(r.status);
    }
  });
});
```

- [ ] **Step 2: Run it, expecting failure** (pre-Task-28/29 the EVM subject is `generic` and there's no `crypto-address` template; if run after 28–31e it should pass — order this test LAST). Sandbox disabled:

```
cd api && npx vitest run test/lib/report/phase4-e2e.test.ts
```

- [ ] **Step 3: No new impl** — this is a green-by-construction integration test once 28–31e are done. If it fails, the failure points at a real gap (a gatherer that throws on a stubbed response, or a planner phase exceeding budget). Fix the offending gatherer, not the test.
- [ ] **Step 4: Run, expecting pass** (sandbox disabled).
- [ ] **Step 5: Commit with Task 31g.**

### Task 31g: P0 regression guard + full Phase-4 verification + commit

The spec's P0 guard (design §10.4): assert a `0x…40hex` and a TRON `T…` address resolve to the `crypto-address` template (NOT generic/threat-actor), and a purl/package string resolves to `package`. This is the merge gate. Then run the full Phase-4 test set + all three typecheckers and commit Tasks 30+31a–31g as one PR.

**Files:**

- Test: `api/test/lib/report/subject-resolver.test.ts` (append the explicit P0 guard block if not already covered by Task 29 — make it a named, standalone `describe('P0 guard …')` so it is grep-findable as the merge gate).

- [ ] **Step 1: Add the explicit P0 guard test.** Append:

```ts
describe('P0 guard: crypto/package subjects never fall to generic->threat-actor', () => {
  it('EVM address does NOT resolve to threat-actor', () => {
    const r = resolveSubject('0x8589427373D6D84E98730D7795D8f6f8731FDA16');
    expect(r.suggestedTemplate).not.toBe('threat-actor');
    expect(r.suggestedTemplate).toBe('crypto-address');
  });
  it('TRON address does NOT resolve to threat-actor', () => {
    const r = resolveSubject('TJRabPrwbZy45sbavfcjinPJC18kjpRTv8');
    expect(r.suggestedTemplate).toBe('crypto-address');
  });
  it('package string does NOT resolve to threat-actor', () => {
    expect(resolveSubject('pkg:npm/left-pad@1.3.0').suggestedTemplate).toBe('package');
  });
});
```

- [ ] **Step 2: Run the full Phase-4 lib + gatherer test set, expecting all green** (sandbox disabled):

```
cd api && npx vitest run \
  test/lib/report/subject-resolver.test.ts \
  test/lib/report/source-planner.test.ts \
  test/lib/report/phase4-e2e.test.ts \
  test/lib/supply-chain/osv-package-gatherer.test.ts \
  test/lib/supply-chain/depsdev-gatherer.test.ts \
  test/lib/supply-chain/ossf-malicious-gatherer.test.ts \
  test/lib/supply-chain/crypto-gatherers.test.ts \
  test/lib/supply-chain/keyed-crypto-gatherers.test.ts
```

- [ ] **Step 3: Run all three typecheckers** (esbuild deploys past tsc; `report/*` is reachable worker-side):

```
tsc -p tsconfig.json && tsc -p api/tsconfig.json && tsc -p api/tsconfig.worker.json
```

- [ ] **Step 4: Commit Tasks 30+31a–31g (catalog + all gatherers + P0 guard) as one PR-able change.**

```
git add api/src/lib/report/gatherer.ts api/src/lib/report/source-planner.ts api/test/lib/report/subject-resolver.test.ts api/test/lib/report/source-planner.test.ts api/test/lib/report/phase4-e2e.test.ts api/test/lib/supply-chain/osv-package-gatherer.test.ts api/test/lib/supply-chain/depsdev-gatherer.test.ts api/test/lib/supply-chain/ossf-malicious-gatherer.test.ts api/test/lib/supply-chain/crypto-gatherers.test.ts api/test/lib/supply-chain/keyed-crypto-gatherers.test.ts
git commit -m "feat(report): register deferred package + crypto-address gatherers (Phase 4)

Wires osv-package/depsdev/ossf-malicious-package (package template) and
chainalysis-oracle/tornado-cash-mixers/goplus-token-security/honeypot-is/
ethlist-label + key-gated arkham-attribution/misttrack-risk (crypto-address
template) into FETCHERS, each importing its Phase 2/3 lib fn. P0 regression
guard: 0x..40hex + TRON addresses resolve to crypto-address, not threat-actor.
Honest needs-key no-op for the keyed gatherers (dormant until Phase 5).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Review checkpoint.** Phase 4 is a self-contained PR. Stop here for review before Phase 5 (which is ops + secrets, no app code beyond CI-skipped smokes). Confirm with the maintainer that the catalog costs and the keyed-gatherer "register + self-no-op" choice are acceptable.

---

## Phase 5 — Key-gated provisioning runbook (Arkham + MistTrack)

> **This is ops, not much code.** The libs (`lookupArkhamEntity`, `lookupMisttrack`), the conditionally-registered AGENT tools, and the now-registered copilot GATHERERS all already exist (Phases 3 + 4) and self-no-op to `needs-key` until a secret is set. Phase 5 provisions the secrets, VERIFIES conditional registration flips on, and gates the "it works" claim on ONE live call per source. Per the design's hard rule (§1 goal 4, §3.4, §11): **do not claim a keyed source works until one live call confirms host + field shapes.**

### Task 32: Provision secrets + verify conditional registration + live-call gate + CI-skipped live smokes

**Files:**

- Test: `api/test/lib/supply-chain/arkham.live.test.ts`, `api/test/lib/supply-chain/misttrack.live.test.ts` — these already exist as `describe.skip` from Phase 3 Task 27 (per that plan's Steps 16–17). **Confirm they exist** (`ls api/test/lib/supply-chain/*.live.test.ts`); if Phase 3 created them, this task only ADDS the assertions that confirm host+fields against a real response, kept `describe.skip` so CI never runs them. If absent, create them here.
- Modify (docs only): the secrets note in `docs/superpowers/specs/2026-06-11-supply-chain-intel-design.md` §11 (or the repo secrets doc if one exists — `ls docs/ | grep -i secret || grep -rln "wrangler secret put" docs/`).

- [ ] **Step 1: Document + run the secret-provisioning commands.** These are server-side Worker secrets, set from the REPO ROOT (the production Worker `pranithjain`, NOT `api/` — see CLAUDE.md "two wranglers"). Record the exact commands in the runbook:

```
wrangler secret put ARKHAM_API_KEY
wrangler secret put ARKHAM_API_BASE     # host is ambiguous (api.arkhamintelligence.com vs api.arkm.com); do NOT hardcode. lib defaults to https://api.arkm.com if unset
wrangler secret put MISTTRACK_API_KEY
```

> `ARKHAM_API_BASE` is REQUIRED to be settable (not hardcoded) per design §3.2/§11 — the base URL is genuinely unverifiable without a key. Confirm the deployed Worker name with `wrangler whoami` / the root `wrangler.jsonc` before running. Secrets are write-only; `wrangler secret list` shows names but not values.

- [ ] **Step 2: Verify conditional AGENT-tool registration flips on.** The two agent tools (`arkham_attribute_address`, `check_crypto_address_risk`) register ONLY when their key is set (Phase 3 Task 27, via the `buildToolRegistry` opts guard + the DO call site passing `{ hasArkhamKey, hasMisttrackKey }`). Verify BOTH states. There is an existing registry test pattern from Phase 3 — extend or add a test asserting:
  - with `{ hasArkhamKey: false, hasMisttrackKey: false }` → neither tool name is in `buildToolRegistry(...).map(t => t.name)`;
  - with `{ hasArkhamKey: true, hasMisttrackKey: true }` → both names are present.

```
cd api && npx vitest run test/lib/agent/keyed-tool-registration.test.ts
```

> If Phase 3 Task 27 already added this test, just RE-RUN it post-provisioning as the verification step — do not duplicate. The point of this step is to PROVE the planner now sees the tools, not to re-implement the guard.

- [ ] **Step 3: The live-call gate (the "claim it works only after one live call" rule).** With a real key provisioned, make ONE live call per source against the actual upstream and CONFIRM host + field shapes match the lib's parsing (design §3.2/§3.4/§11 — Arkham `/intelligence/address/{addr}/all` → `arkhamEntity.name/type`; MistTrack `risk_score` → `{success,msg,data}` envelope, `risk_score` v2-vs-v3 unconfirmed). Two ways to run the gate:
  - **(a) the CI-skipped live smoke** (preferred, reproducible): un-skip locally with the key in env, run it, confirm green, re-skip. The smoke asserts the EXACT fields the lib reads (not just HTTP 200) — an HTTP-200-with-wrong-shape is the silent-rot failure this whole initiative exists to kill (design §10.5).
  - **(b) a one-off `wrangler tail` + a real `/api/v1/supply-chain/arkham?address=…` / `/address-risk?address=…` request** against the deployed Worker, eyeballing the JSON.

  Until ONE of these confirms host+fields, the source stays "unverified — do not advertise" in the spec. Update §11 to flip the source from "unverified" to "verified YYYY-MM-DD against <host>" ONLY after the gate passes.

- [ ] **Step 4: Write/confirm the CI-skipped live smokes.** Each keyed source gets ONE network-gated, `describe.skip` smoke that asserts host + the exact fields the lib reads. Confirm they exist from Phase 3; if not, create them. The Arkham smoke (`api/test/lib/supply-chain/arkham.live.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { lookupArkhamEntity } from '../../../src/lib/supply-chain/arkham';

// CI-SKIPPED. Un-skip locally with ARKHAM_API_KEY (+ ARKHAM_API_BASE) in env to run the live-call gate.
describe.skip('lookupArkhamEntity (LIVE — confirms host + fields, design §3.2/§11)', () => {
  it('returns ok with an entity/label for a well-known address', async () => {
    const env = { ARKHAM_API_KEY: process.env.ARKHAM_API_KEY!, ARKHAM_API_BASE: process.env.ARKHAM_API_BASE };
    const r = await lookupArkhamEntity('0x28c6c06298d514db089934071355e5743bf21d60', env); // Binance hot wallet
    expect(r.status).toBe('ok');
    expect(typeof r.label === 'string' || r.category !== null).toBe(true);
  });
});
```

The MistTrack smoke (`api/test/lib/supply-chain/misttrack.live.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { lookupMisttrack } from '../../../src/lib/supply-chain/misttrack';

// CI-SKIPPED. Un-skip locally with MISTTRACK_API_KEY in env. Confirms the {success,msg,data}
// envelope + risk_score version (v2-vs-v3 was unconfirmed without a key — design §3.2).
describe.skip('lookupMisttrack (LIVE — confirms envelope + risk_score field)', () => {
  it('returns ok with a risk_score for a known address', async () => {
    const env = { MISTTRACK_API_KEY: process.env.MISTTRACK_API_KEY! };
    const r = await lookupMisttrack('0x28c6c06298d514db089934071355e5743bf21d60', env, { coin: 'ETH' });
    expect(['ok', 'empty']).toContain(r.status);
    expect(r.status === 'ok' ? typeof r.risk_score : 'skip').not.toBe('undefined');
  });
});
```

- [ ] **Step 5: Confirm the smokes are inert by default** (no network in a normal run — `describe.skip`). Sandbox disabled:

```
cd api && npx vitest run test/lib/supply-chain/arkham.live.test.ts test/lib/supply-chain/misttrack.live.test.ts
```

- [ ] **Step 6: Update the spec's §11 secret-management note** with the provisioning + verification record. State verbatim: all three are server-side Worker secrets via `wrangler secret put` from the repo root; both agent tools AND both copilot gatherers self-no-op (`needs-key`) until keyed; the conditional AGENT registration is verified by the keyed-tool-registration test; and the sources are "unverified — do not advertise" until the live-call gate (Step 3) passes, at which point flip to "verified YYYY-MM-DD against <host>".

- [ ] **Step 7: Typecheck + commit** (docs + smokes only; no app-code change in Phase 5):

```
tsc -p tsconfig.json && tsc -p api/tsconfig.json && tsc -p api/tsconfig.worker.json
git add api/test/lib/supply-chain/arkham.live.test.ts api/test/lib/supply-chain/misttrack.live.test.ts docs/superpowers/specs/2026-06-11-supply-chain-intel-design.md
git commit -m "chore(supply-chain): Phase 5 key provisioning runbook + CI-skipped live smokes

Documents wrangler secret put for ARKHAM_API_KEY/ARKHAM_API_BASE/MISTTRACK_API_KEY,
the conditional-registration verification, and the 'claim it works only after one
live call confirms host+fields' gate. Live smokes stay describe.skip (CI never runs).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Deploy note (CLAUDE.md).** Provisioning a secret does NOT deploy code; the conditionally-registered tools/gatherers only appear after the next deploy that reads the secret. Deploy from the REPO ROOT (`npm run deploy`), rebase onto `origin/main` first (main moves fast), run all three `tsc`. Phase 5 ships no new app code, so a deploy is only needed if Phase 4 is not yet live.

---

## Verification (all phases)

- **Per task:** the failing→passing test cycle above + all three `tsc` projects before each commit.
- **Phase 4 merge gate:** the P0 regression guard (Task 31g Step 1) MUST be green — a `0x…40hex` and a TRON `T…` resolve to `crypto-address`, a purl/package to `package`, neither to `generic/threat-actor`.
- **Budget:** the `crypto-address` round packs to ≤6 live subrequests (Task 30 test), far under the 40/round cap (design §8.2 / P5 #14).
- **No silently-empty stubs:** every wired gatherer self-skips wrong subjects to `'empty'` with ZERO fetches (asserted per gatherer) and only fires because its subject now genuinely resolves to a listed template (the §5.2/P0 rule satisfied).
- **Phase 5 gate:** no keyed source is advertised as "verified" until the Task 32 Step 3 live-call gate confirms host + fields; the live smokes stay `describe.skip` so CI never makes a network call.

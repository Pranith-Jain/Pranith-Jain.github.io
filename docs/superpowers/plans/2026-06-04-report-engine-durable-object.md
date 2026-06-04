# Report Engine — Durable Object Orchestrator + Endpoints (Plan D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Wire the Plan A–C modules into an alarm-driven `ReportBuilderDO` that builds a full `Report` across phases (each with its own subrequest budget), persists it to D1, and exposes `/api/v1/report/*` endpoints with progress streaming.

**Architecture:** A pure `assembleReport()` (testable) composes engine outputs into a `Report`. A pure `advance()` step function runs ONE pipeline phase and returns the next state (testable with mocks). `ReportBuilderDO` is a thin wrapper: `fetch()` seeds a job and schedules an alarm; `alarm()` calls `advance()`, persists, and reschedules until done. Routes call the DO and stream progress via SSE polling the D1 row.

**Tech Stack:** TypeScript, Workers Durable Objects (SQLite-backed), D1, Hono, SSE. Reuses the `LiveFeedDO`/`CronLockDO` patterns, `sseStream` (`api/src/lib/sse.ts`), `requireAdminMiddleware` (`api/src/lib/admin-auth.ts`), `validate` (`api/src/lib/validate.ts`).

**Spec:** §5, §6. **Depends on:** Plans A, B, C + the `reports` D1 table (Plan A migration 0014).

**Run tests:** `cd api && npx vitest run test/lib/report/<file>` and `test/routes/report.test.ts` (un-sandboxed).

---

## File structure

| File                                       | Responsibility                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `api/src/lib/report/assemble.ts`           | `assembleReport(parts)` — compose `Report` (cover/TLP, key findings, appendices, confidence). |
| `api/src/lib/report/pipeline.ts`           | `ReportState`, `advance(state, deps)` — run one phase, return next state.                     |
| `worker/durable-objects/report-builder.ts` | `ReportBuilderDO` — storage + alarm wrapper around `advance()`, persists to D1.               |
| `api/src/routes/report.ts`                 | `buildReportHandler`, `getReportHandler`, `streamReportHandler`.                              |
| `api/src/lib/validation-schemas.ts`        | add `reportBuildSchema` (modify).                                                             |
| `api/src/index.ts`                         | mount routes + admin gate (modify).                                                           |
| `wrangler.jsonc`                           | add `REPORT_BUILDER` DO binding + migration `v4` (modify).                                    |
| `worker/env.ts`, `api/src/env.ts`          | add `REPORT_BUILDER` binding type (modify).                                                   |
| `worker/index.ts`                          | export `ReportBuilderDO` (modify).                                                            |

---

## Task 1: `assembleReport` (pure)

**Files:** Create `api/src/lib/report/assemble.ts`; Test `api/test/lib/report/assemble.test.ts`.

Build a `Report` (Plan A `types.ts`) from: resolved subject, template, tlp, writer output (`executive_summary`, `sections`, `citations`), gathered `SourceResult[]` (for appendix extraction), validated mitre/cve lists, `Conflict[]`, and a `ConfidenceScore` from `computeConfidence`.

- [ ] **Step 1: Failing test** asserts: cover.tlp defaults to input tlp; `meta.status==='done'`; appendices.sources has one row per cited source with an Admiralty grade (use `gradeSources` from `confidence-ext`); mitre/cve appendices reflect validated inputs; key_findings derived from section bodies are non-empty. (Write 3–4 focused assertions over a small hand-built input.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Key logic:
  - `cover = { title: REPORT_TEMPLATES[template].title(subject.canonical), subtitle, tlp, subject_badges: [subject.type, template], generated_at }`.
  - `appendices.sources`: from `writer.citations`, dedupe by `sourceId`, attach `gradeSources([sourceId])[0].reliability` for `authority` and a credibility derived from how many citations share that source.
  - `appendices.mitre`: from validated mitre ids + (optional) names pulled from gathered `mitre-group` items' fields.
  - `appendices.cves`: from gathered cve items' `fields` (`cvss`, `epss`, `kev`).
  - `appendices.iocs`: from gathered `live-iocs`/`ioc-correlation` items' fields (`value`,`kind`).
  - `appendices.conflicts = conflicts`.
  - `key_findings`: take the first sentence of each section body with its `refs`, capped to ~5, confidence parsed from any `[High|Medium|Low]` tag (default 'Medium').
  - `confidence`: pass the cited `sourceId`s + `conflicts.length` into `computeConfidence({ sourceIds, contradictorySourceIds: [], findingType })` where `findingType` maps from template (`ransomware-group`→`ransomware_claim`, `threat-actor`→`attribution`, `cve`→`vulnerability`, `ioc`→`ioc`).
  - `meta`: `{ id, subject, subject_type, template, tlp, status:'done', phase:'done', model_used, generated_at, timings }`.
  - **Note the carry-forward from Plan A:** use the gathered source's own `authority` (already an A–F grade from the catalog) for the sources appendix; only call `gradeSources` for ids that ARE registry keys, else fall back to the catalog authority. Implement a tiny `gradeFor(sourceId, fallback)` helper.

- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -m "feat(report): assemble Report from engine outputs"`.

---

## Task 2: Pipeline step function (pure, testable)

**Files:** Create `api/src/lib/report/pipeline.ts`; Test `api/test/lib/report/pipeline.test.ts`.

- [ ] **Step 1: Failing test** drives the state machine with mocked deps (resolveSubject is real; planSources real; a fake gatherer/writer injected). Assert: starting from `{phase:'resolve'}`, repeated `advance()` walks `resolve → plan → gather → validate → rank → write → assemble → done`, never skipping, and the final state has `report.meta.status==='done'`. Assert each `gather:N` advance only touches one phase index.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.**

```ts
import type { Env } from '../env';
import type { Report, ResolvedSubject, SourcePlan, SourceResult, TemplateId, Tlp } from './types';
import { resolveSubject } from './subject-resolver';
import { planSources } from './source-planner';
import { gatherPhase, type GatherContext } from './gatherer';
import { validateMitreIds, validateActorNames, detectContradictions, type Conflict } from './validator';
import { rankEvidence } from './ranker';
import { writeReport, type WriteDeps } from './writer';
import { assembleReport } from './assemble';

export type Phase = 'resolve' | 'plan' | 'gather' | 'validate' | 'rank' | 'write' | 'assemble' | 'done' | 'error';

export interface ReportState {
  id: string;
  input: { subject: string; template?: TemplateId; tlp: Tlp };
  phase: Phase;
  gatherIndex: number;
  pct: number;
  detail: string;
  subject?: ResolvedSubject;
  plan?: SourcePlan;
  sources: SourceResult[];
  conflicts: Conflict[];
  validatedMitre: string[];
  validatedActors: string[];
  report?: Report;
  error?: string;
}

export interface PipelineDeps {
  env: Env;
  write: WriteDeps; // { ai, groqKey, runCompletion? }
  gather?: typeof gatherPhase; // injectable for tests
  now?: () => number;
}

export function initState(id: string, subject: string, template: TemplateId | undefined, tlp: Tlp): ReportState {
  return {
    id,
    input: { subject, template, tlp },
    phase: 'resolve',
    gatherIndex: 0,
    pct: 0,
    detail: 'queued',
    sources: [],
    conflicts: [],
    validatedMitre: [],
    validatedActors: [],
  };
}

const MITRE_RE = /\bT\d{4}(?:\.\d{3})?\b/g;

/** Advance ONE phase. Pure: returns the next state; the DO persists it. */
export async function advance(s: ReportState, deps: PipelineDeps): Promise<ReportState> {
  const gather = deps.gather ?? gatherPhase;
  const now = deps.now ?? Date.now;
  try {
    switch (s.phase) {
      case 'resolve': {
        const subject = resolveSubject(s.input.subject);
        const template = s.input.template ?? subject.suggestedTemplate;
        return {
          ...s,
          subject: { ...subject },
          input: { ...s.input, template },
          phase: 'plan',
          pct: 10,
          detail: `Resolved ${subject.type}`,
        };
      }
      case 'plan': {
        const plan = planSources({ template: s.input.template! }, { maxPhaseSubrequests: 40 });
        return {
          ...s,
          plan,
          phase: 'gather',
          gatherIndex: 0,
          pct: 20,
          detail: `Planned ${plan.phases.length} phase(s)`,
        };
      }
      case 'gather': {
        const ctx: GatherContext = { env: deps.env, subject: s.subject!, signal: AbortSignal.timeout(20000) };
        const results = await gather(s.plan!, s.gatherIndex, ctx);
        const sources = [...s.sources, ...results];
        const nextIdx = s.gatherIndex + 1;
        const more = nextIdx < s.plan!.phases.length;
        return {
          ...s,
          sources,
          gatherIndex: nextIdx,
          phase: more ? 'gather' : 'validate',
          pct: more ? 30 : 50,
          detail: `Gathered phase ${s.gatherIndex + 1}/${s.plan!.phases.length}`,
        };
      }
      case 'validate': {
        const text = s.sources.flatMap((r) => r.items.map((i) => i.text)).join(' ');
        const mitre = validateMitreIds([...new Set(text.match(MITRE_RE) ?? [])]).valid;
        const actors = validateActorNames([s.subject!.canonical]).valid;
        // contradiction claims: ransom figures keyed by victim (from negotiation/ransomware items)
        const claims = s.sources.flatMap((r) =>
          r.items.flatMap((i) => {
            const f = i.fields as Record<string, unknown> | undefined;
            const victim = typeof f?.victim === 'string' ? f.victim : null;
            const ransom = f?.negotiated_ransom ?? f?.initial_ransom;
            return victim && ransom != null
              ? [{ sourceId: r.id, claimKey: `ransom:${victim.toLowerCase()}`, value: String(ransom) }]
              : [];
          })
        );
        return {
          ...s,
          validatedMitre: mitre,
          validatedActors: actors,
          conflicts: detectContradictions(claims),
          phase: 'rank',
          pct: 60,
          detail: `Validated ${mitre.length} techniques`,
        };
      }
      case 'rank': {
        // ranking happens inside write input; just transition (kept explicit for progress UX)
        return { ...s, phase: 'write', pct: 70, detail: 'Ranking evidence' };
      }
      case 'write': {
        const ranked = rankEvidence(s.sources, { canonical: s.subject!.canonical }, now());
        const wout = await writeReport(
          {
            subject: s.subject!.canonical,
            template: s.input.template!,
            evidence: ranked,
            conflicts: s.conflicts,
            allowlist: { cves: [], mitre: s.validatedMitre, actors: s.validatedActors },
          },
          deps.write
        );
        return {
          ...s,
          phase: 'assemble',
          pct: 90,
          detail: 'Drafted sections',
          report: { ...(s.report ?? {}), __wout: wout, __ranked: ranked } as never,
        };
      }
      case 'assemble': {
        const wout = (s.report as never as { __wout: Awaited<ReturnType<typeof writeReport>> }).__wout;
        const report = assembleReport({
          subject: s.subject!,
          template: s.input.template!,
          tlp: s.input.tlp,
          writer: wout,
          sources: s.sources,
          validatedMitre: s.validatedMitre,
          conflicts: s.conflicts,
          generatedAt: new Date(now()).toISOString(),
          id: s.id,
        });
        return { ...s, phase: 'done', pct: 100, detail: 'Done', report };
      }
      default:
        return s;
    }
  } catch (e) {
    return { ...s, phase: 'error', error: e instanceof Error ? e.message : String(e), detail: 'error' };
  }
}
```

> The transient `__wout`/`__ranked` carry between write→assemble; keep them off the persisted `Report` by stripping before D1 write (the DO persists `state.report` only when `phase==='done'`).

- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -m "feat(report): pipeline state machine (advance per phase)"`.

---

## Task 3: `ReportBuilderDO`

**Files:** Create `worker/durable-objects/report-builder.ts`.

Follow `worker/durable-objects/cron-lock.ts` (storage/alarm) + `live-feed.ts` (fetch) patterns. Behavior:

- `POST /build` body `{ id, subject, template?, tlp }` → store `initState(...)` under `state:<id>`, write a `reports` D1 row (`status='building'`), `storage.setAlarm(Date.now()+1)`, return `{ id }`.
- `GET /state?id=<id>` → return the stored `ReportState` (progress + partial).
- `alarm()` → load the in-flight state(s), call `advance(state, deps)`, persist updated state; if `phase==='done'` write `report_json` + `status='done'` to D1 (strip `__wout`/`__ranked`); if `phase==='error'` set `status='error'`; if not terminal, `setAlarm(now+1)` to run the next phase.
- Build `deps` from `this.env`: `{ env: this.env, write: { ai: this.env.AI, groqKey: this.env.GROQ_API_KEY } }`.

- [ ] **Step 1: Write the class** (no DO-internal unit test — it's covered via the route integration test in Task 6). Skeleton:

```ts
import type { Env } from '../env';
import { advance, initState, type ReportState } from '../../api/src/lib/report/pipeline';

export class ReportBuilderDO {
  private ctx: DurableObjectState;
  private env: Env;
  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/build' && request.method === 'POST') {
      const body = (await request.json()) as {
        id: string;
        subject: string;
        template?: ReportState['input']['template'];
        tlp: ReportState['input']['tlp'];
      };
      const state = initState(body.id, body.subject, body.template, body.tlp);
      await this.ctx.storage.put(`state:${body.id}`, state);
      await this.persist(state);
      await this.ctx.storage.setAlarm(Date.now() + 1);
      return Response.json({ id: body.id });
    }
    if (url.pathname === '/state') {
      const id = url.searchParams.get('id') ?? '';
      const state = await this.ctx.storage.get<ReportState>(`state:${id}`);
      return state ? Response.json(state) : Response.json({ error: 'not found' }, { status: 404 });
    }
    return new Response('not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    const all = await this.ctx.storage.list<ReportState>({ prefix: 'state:' });
    let anyPending = false;
    for (const [key, state] of all) {
      if (state.phase === 'done' || state.phase === 'error') continue;
      const next = await advance(state, { env: this.env, write: { ai: this.env.AI, groqKey: this.env.GROQ_API_KEY } });
      await this.ctx.storage.put(key, next);
      if (next.phase === 'done' || next.phase === 'error') await this.persist(next);
      else anyPending = true;
    }
    if (anyPending) await this.ctx.storage.setAlarm(Date.now() + 1);
  }

  private async persist(state: ReportState): Promise<void> {
    const db = this.env.BRIEFINGS_DB;
    if (!db) return;
    const status = state.phase === 'done' ? 'done' : state.phase === 'error' ? 'error' : 'building';
    let json: string | null = null;
    if (state.phase === 'done' && state.report) {
      const r = { ...state.report } as Record<string, unknown>;
      delete (r as { __wout?: unknown }).__wout;
      delete (r as { __ranked?: unknown }).__ranked;
      json = JSON.stringify(r);
    }
    await db
      .prepare(
        `INSERT INTO reports (id, subject, template, tlp, status, report_json, created_at, updated_at) VALUES (?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(id) DO UPDATE SET status=excluded.status, report_json=COALESCE(excluded.report_json, reports.report_json), updated_at=datetime('now')`
      )
      .bind(state.id, state.input.subject, state.input.template ?? 'auto', state.input.tlp, status, json)
      .run();
  }
}
```

- [ ] **Step 2: Register the DO.** In `worker/index.ts` add `import { ReportBuilderDO } from './durable-objects/report-builder';` and add it to the `export { ... }` line. In `worker/env.ts` add `REPORT_BUILDER: DurableObjectNamespace;`. In `api/src/env.ts` add `REPORT_BUILDER?: DurableObjectNamespace;`.
- [ ] **Step 3: wrangler.jsonc** — add `{ "name": "REPORT_BUILDER", "class_name": "ReportBuilderDO" }` to `durable_objects.bindings` and `{ "tag": "v4", "new_sqlite_classes": ["ReportBuilderDO"] }` to `migrations`.
- [ ] **Step 4: Typecheck** `cd .. && npx tsc -p api/tsconfig.worker.json --noEmit` — clean (this covers worker/ + api/src). Commit `git commit -m "feat(report): ReportBuilderDO alarm-driven pipeline + binding"`.

---

## Task 4: Validation schema

**Files:** Modify `api/src/lib/validation-schemas.ts`.

- [ ] Add:

```ts
export const reportBuildSchema = z.object({
  subject: z.string().min(1).max(200),
  template: z.enum(['ransomware-group', 'threat-actor', 'cve', 'ioc']).optional(),
  tlp: z.enum(['CLEAR', 'GREEN', 'AMBER', 'RED']).optional().default('AMBER'),
});
```

Commit with Task 5.

---

## Task 5: Routes (`api/src/routes/report.ts`)

**Files:** Create `api/src/routes/report.ts`; Modify `api/src/index.ts`.

- [ ] **Handlers:**

```ts
import type { Context } from 'hono';
import type { Env } from '../env';
import { sseStream } from '../lib/sse';

const ORIGIN = 'https://report-builder.internal';
const stub = (env: Env) => env.REPORT_BUILDER!.get(env.REPORT_BUILDER!.idFromName('global'));

export async function buildReportHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!c.env.REPORT_BUILDER) return c.json({ error: 'report builder unavailable' }, 503);
  const body = (c as never as { parsed: { subject: string; template?: string; tlp: string } }).parsed;
  const id = crypto.randomUUID();
  await stub(c.env).fetch(`${ORIGIN}/build`, { method: 'POST', body: JSON.stringify({ id, ...body }) });
  return c.json({ report_id: id }, 202);
}

export async function getReportHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  // Prefer the live DO state (has progress); fall back to D1 if the DO has GC'd it.
  if (c.env.REPORT_BUILDER) {
    const res = await stub(c.env).fetch(`${ORIGIN}/state?id=${encodeURIComponent(id)}`);
    if (res.ok) return new Response(res.body, { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const row = await c.env.BRIEFINGS_DB?.prepare('SELECT report_json, status FROM reports WHERE id = ?')
    .bind(id)
    .first<{ report_json: string | null; status: string }>();
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({ status: row.status, report: row.report_json ? JSON.parse(row.report_json) : null });
}

export function streamReportHandler(c: Context<{ Bindings: Env }>): Response {
  const id = c.req.param('id');
  return sseStream(async (write) => {
    for (let i = 0; i < 120; i++) {
      // ~2 min cap
      const res = await stub(c.env).fetch(`${ORIGIN}/state?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        write('error', { error: 'not found' });
        return;
      }
      const s = (await res.json()) as { phase: string; pct: number; detail: string };
      write('progress', { phase: s.phase, pct: s.pct, detail: s.detail });
      if (s.phase === 'done' || s.phase === 'error') return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  });
}
```

- [ ] **Mount in `api/src/index.ts`:** add `'/api/v1/report'` to `ADMIN_GATED_PREFIXES`; then:

```ts
app.post('/api/v1/report/build', validate('json', reportBuildSchema), buildReportHandler);
app.get('/api/v1/report/:id', getReportHandler);
app.get('/api/v1/report/:id/stream', streamReportHandler);
```

(import the handlers + `reportBuildSchema` + `validate`).

- [ ] **Commit** `git add api/src/routes/report.ts api/src/index.ts api/src/lib/validation-schemas.ts && git commit -m "feat(report): /api/v1/report build/get/stream routes"`.

---

## Task 6: Route integration test

**Files:** Create `api/test/routes/report.test.ts`.

- [ ] Using the vitest-pool-workers harness (mirror an existing `test/routes/*.test.ts` for app setup + admin auth header), assert: `POST /api/v1/report/build` with a valid body + admin token returns `202 {report_id}`; `GET /api/v1/report/:id` returns a status; an unauthenticated build returns `401`; an invalid body (`subject` missing) returns `400`. Mock `env.AI` and outbound `fetch` so the pipeline completes without live calls (or assert the building→done transition by polling `GET` a few times). Run un-sandboxed: `cd api && npx vitest run test/routes/report.test.ts`.
- [ ] **Commit** `git commit -m "test(report): build/get/stream route integration"`.

---

## Final verification

```
cd api && npx vitest run test/lib/report test/routes/report.test.ts
cd .. && npx tsc -p api/tsconfig.worker.json --noEmit && npx eslint api/src/lib/report api/src/routes/report.ts --ext ts
npx wrangler deploy --dry-run   # confirms the new DO binding + migration parse
```

## Leaves out (Plan E)

Frontend: Copilot mode toggle, template/TLP pickers, phase stepper consuming `/stream`, Report renderer, PDF export.

# Loop Engineering Upgrade — Design

**Date:** 2026-06-10
**Status:** Approved (brainstorming → ready for implementation plan)

## Summary

Adopt the "loop engineering" pattern from <https://loops.elorm.xyz/loops> across this
repo in three workstreams. A "loop" is an **agentic workflow template** with a fixed
schema:

```
Goal: <desired end state>
Max iterations: <N>
Between iterations run: <check command>
Exit when: <exit condition>
Steps: <focused work per iteration>
Guardrails: <anti-gaming rules — never weaken the check to force success>
```

These templates are prompts for an agent (e.g. Claude Code's `/loop` skill, already
available in this repo), **not** an importable code library. We apply the _one_
consistent pattern in three places, deepest to shallowest.

## Goals

- Give the repo a reusable, repo-tailored library of loop templates for recurring dev
  workflows (deploy, provider-verify, build/test, cron-safety, MCP-mirror).
- Re-seat the runtime CTI investigator agent on an explicit, typed loop engine so its
  goal / max-iterations / exit-conditions / guardrails are declarative rather than
  scattered prose + ad-hoc filtering — **without changing its tuned behavior**.
- Document the unified pattern so templates and runtime stay conceptually aligned.

## Non-Goals

- No new external dependencies.
- No change to investigator agent _behavior_ (synthesis, QA, prompts, heuristics stay
  identical; only the control-flow structure is refactored).
- No harness/`/loop` skill modification — templates are plain markdown the user/agent
  copies into `/loop`.

---

## Workstream 1 — Repo loop templates (`docs/loops/`)

A directory of markdown loop templates in the site's exact schema, plus a `README.md`
index. Location is `docs/loops/` (human + agent reference material, not harness config,
so not `.claude/`).

Each template encodes a real, documented pain point from the project's auto-memory:

| File                       | Goal                                                             | Exit when                                                    |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `deploy-from-root.md`      | Both workers deployed from repo root, smoke green                | Both `wrangler deploy` succeed from root + smoke passes      |
| `provider-verify-live.md`  | Every touched provider adapter returns real upstream data        | No adapter returns status-ok-but-empty against live upstream |
| `build-until-green.md`     | Production build + typecheck pass (incl. `tsconfig.worker.json`) | Build exits 0, `tsc -p api/tsconfig.worker.json` clean       |
| `api-tests-unsandboxed.md` | `api/test/routes/` pass locally                                  | vitest-pool-workers exits 0 with `dangerouslyDisableSandbox` |
| `briefing-cron-safety.md`  | Briefing cron stays within limits                                | ≤1 build/invocation verified + ≤50 subrequests               |
| `mcp-mirror.md`            | MCP change mirrored to standalone repo                           | Branch+PR opened on `dfir-mcp-server` with mirrored diff     |

Every template includes the **Guardrails / anti-gaming** block (do not modify the check
command or exit criteria to force success; stop and report blockers if stuck).

**Risk:** none — documentation only, no runtime impact.

---

## Workstream 2 — Full loop-engine rewrite (runtime)

### Current state

The investigator agent loop (`PLAN → ACT → OBSERVE → DECIDE`, one iteration per Durable
Object invocation) already embodies loop engineering informally:

- **Goal** — analyst-grade report.
- **Max iterations** — `AgentState.maxSteps` (1–10, default 6).
- **Exit conditions** — split between `planner.ts` (lines 33–54: `totalResults >= 6`,
  `currentStep >= maxSteps` with data, near-limit-with-data) and
  `InvestigatorAgentDO.advanceOneStep` (`plan.shouldSynthesize || stepNum >= maxSteps`).
- **Guardrails** — partly prose in the planner prompt (`<critical_rules>`), partly
  ad-hoc dedup/filter in `parsePlannerOutput`.

### Target architecture

- **`api/src/lib/agent/loop-engine.ts`** — generic, typed engine.
  - `interface ExitCondition<TState> { name: string; met(state: TState): boolean; reason(state: TState): string }`
  - `interface Guardrail<TState> { name: string; apply(proposed, state): { allowed; filtered; reason } }`
  - `interface LoopDefinition<TState> { goal: string; maxIterations(state): number; exitConditions: ExitCondition<TState>[]; guardrails: Guardrail<TState>[] }`
  - `class LoopEngine<TState>` — `evaluateExit(state)` returns the first matching
    condition `{ name, reason }` or `null`; `applyGuardrails(proposed, state)` runs all
    guardrails in sequence. The engine decides; it does not prompt or execute tools.

- **`api/src/lib/agent/cti-loop.ts`** — the CTI investigation expressed as a concrete
  `LoopDefinition<AgentState>`:
  - Exit conditions, **named**, evaluated in this order (preserving current precedence):
    1. `planner-requested-synthesis` — planner returned `shouldSynthesize`.
    2. `enough-results` — `totalOkResults >= 6`.
    3. `near-limit-with-data` — `currentStep >= maxSteps - 1 && totalOkResults >= 3`.
    4. `max-iterations-reached` — `currentStep >= maxSteps`.
  - Guardrails, **explicit objects** (moved out of `parsePlannerOutput` prose/filtering):
    - `no-duplicate-tool-args` — drop a call whose `tool:args` was already executed.
    - `no-banned-tools` — drop `get_live_iocs`, `get_today_briefing`, `get_feed_status`,
      `get_feed_catalog`.
    - `max-tools-per-step` — cap at 2.

- **`planner.ts`** — keeps LLM prompting + JSON parsing, but **returns proposals only**.
  Exit decisions and guardrail filtering move to the engine. The `<critical_rules>`
  prose stays in the prompt (it shapes the LLM), but enforcement is now also structural.

- **`InvestigatorAgentDO.advanceOneStep`** — thin adapter: ask the engine
  `evaluateExit(state)`; if a condition fires → `doSynthesize`; else plan → guardrail-
  filter via engine → act → observe. Synthesis + QA phases unchanged.

### Behavior-parity safety net (required, built first)

`api/test/agent/loop-parity.test.ts` — with mocked AI + tools, drive the loop across
representative query types (`cve`, `ip`, `actor`, `generic`) and record a **decision
trace**: for each step, which exit condition fired (or none) and which tool calls
survived guardrail filtering. Snapshot this trace **against the current, pre-refactor
code first**. The rewrite must reproduce the identical trace. This is the gate that lets
us rewrite tuned code without silent regression.

**Risk:** medium (tuned, working code). Mitigated entirely by the parity test, which is
authored and green on current code before any refactor begins.

---

## Workstream 3 — Process docs

`docs/LOOP-ENGINEERING.md` — short. Defines the loop pattern for this repo, links the
`docs/loops/` templates, and documents the runtime `LoopEngine` so templates and runtime
share one vocabulary. A map, not a manual.

**Risk:** none.

---

## Sequencing

1. **Workstream 1** — templates (`docs/loops/`). Immediate value, zero risk; pins the
   vocabulary.
2. **Workstream 3** — `docs/LOOP-ENGINEERING.md`. Cheap glue; references #1.
3. **Workstream 2** — runtime engine, parity-test-first:
   1. Author `loop-parity.test.ts`, run green on current code, snapshot the trace.
   2. Add `loop-engine.ts` + `cti-loop.ts`.
   3. Re-seat `planner.ts` + `InvestigatorAgentDO` on the engine.
   4. Confirm parity trace identical + existing agent route tests still pass.

## Testing

- Workstreams 1 & 3: markdown only — verify each template matches the schema and the
  index links resolve.
- Workstream 2: `loop-parity.test.ts` (new) must be byte-identical trace before/after;
  existing `api/test/routes/agent*` and any agent unit tests must stay green. Run API
  tests locally with `dangerouslyDisableSandbox` (CI skips `test/routes/`).

## Deployment

Per repo deploy rules: deploy from repo root (two wranglers). Workstream 2 touches
`worker/` and `api/src/lib/agent/` — run `tsc -p api/tsconfig.worker.json` after editing
`worker/`. No DO migration (state shape unchanged). Workstreams 1 & 3 need no deploy.

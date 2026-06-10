# Loop Engineering

This repo uses one consistent **loop** pattern in two layers: as agentic dev-workflow
templates, and as the runtime structure of the CTI investigator agent. Both share the
same vocabulary, borrowed from [loops.elorm.xyz](https://loops.elorm.xyz/loops).

## The pattern

A loop is iterative work with a hard ceiling and an honest exit:

```
Goal:                  the desired end state
Max iterations:        N (a hard ceiling — stop even if not "done")
Between iterations run: the check that decides whether to continue
Exit when:             the condition that ends the loop
Guardrails:            anti-gaming rules — never weaken the check to force success
```

The discipline that makes it work: **self-pace** (run the check each pass, only continue
if the exit condition is unmet), and **never game the metric** (don't disable the check,
relax the exit criteria, or fake success — if stuck, stop and report blockers).

## Layer 1 — Dev-workflow templates (`docs/loops/`)

Prompt templates you hand to an agent (e.g. Claude Code's `/loop` skill) to run a
recurring repo workflow. Each encodes a documented operational lesson so the agent
inherits this repo's footguns. See [`loops/README.md`](loops/README.md). Current set:

- **Deploy From Root** — dual-worker deploy from the repo root + smoke.
- **Provider Verify Live** — catch silent provider rot against live upstream.
- **Build Until Green** — build + budgets + both typecheck passes.
- **API Tests Unsandboxed** — run `test/routes/` locally (CI skips them).
- **Briefing Cron Safety** — ≤1 build/invocation, <50 subrequests.
- **MCP Mirror** — mirror `/api/mcp` changes to the standalone repo via PR.
- **Typecheck Until Clean** — flush latent `tsc` debt that esbuild deploys past.
- **Route Schema Contract** — keep `validate()` schemas mirroring handler reads.
- **Upload Route Hardening** — multipart + own cap + real-middleware integration test.
- **IOC Subrequest Budget** — batched KV fan-out under the 50-subrequest cap.
- **CSP Nonce Sanity** — verify nonce-based CSP still lets JS run.
- **Lighthouse Until Budget** — measure-first CWV + bundle budgets, revert regressions.
- **Security Review The Diff** — review the branch diff for this app's exposure classes.
- **D1 Migration Apply & Verify** — new forward migration, verify schema, gated remote apply.
- **Rebase Before Deploy** — refresh onto fast-moving `origin/main` before shipping.

Plus generic loops that apply to most projects (Ship PR Until Green, De-Sloppify Pass,
Coverage Until Threshold, PR Self-Review, Spec-First Ship), and CTI/DFIR development
loops tied to this repo's surfaces (Debug Systematically, Add Agent Tool, Add Provider,
Add CTI Endpoint, Audit Provider Coverage, Audit Security Posture, Detection Rule
Quality, Optimize Hot Path, Report Quality QA, Prompt Injection Resist, Incident
Rollback, Feed Onboarding, STIX Roundtrip, A11y Until Clean, Dependency Bump) — see
`loops/README.md`.

## Layer 2 — Runtime loop engine (`api/src/lib/agent/`)

The CTI investigator agent IS a loop, and its control flow is built from the same parts.

- **`loop-engine.ts`** — a generic, typed engine. A `LoopDefinition<TState>` declares the
  `goal`, `maxIterations`, an ordered list of named `ExitCondition`s, and a list of
  `Guardrail`s. `LoopEngine.evaluateExit(state)` returns the first matching exit
  condition (or `null`); `LoopEngine.applyGuardrails(proposed, state)` filters proposed
  actions through every guardrail. The engine **decides**; it never prompts an LLM or
  executes a tool.
- **`cti-loop.ts`** — the CTI investigation as a concrete `LoopDefinition<AgentState>`.
  - Exit conditions (in precedence order): `planner-requested-synthesis`,
    `enough-results`, `near-limit-with-data`, `max-iterations-reached`.
  - Guardrails: `no-duplicate-tool-args`, `no-banned-tools`, `max-tools-per-step`.
- **`planner.ts`** — prompts the LLM and parses its JSON, returning _proposals_. It no
  longer owns exit/guardrail decisions; the engine does.
- **`worker/durable-objects/investigator-agent.ts`** — `InvestigatorAgentDO.advanceOneStep`
  is the loop body (PLAN → ACT → OBSERVE → DECIDE), one iteration per DO invocation. It
  asks the engine to evaluate exit and to filter the planner's proposed tool calls.

### Why the two layers share vocabulary

A template's `Exit when` and the runtime's `ExitCondition` are the same idea at two
altitudes. Keeping one vocabulary means a contributor who reads a `docs/loops/` template
already understands the runtime engine, and vice versa.

### Changing the runtime loop safely

The runtime loop is tuned. Its behavior is pinned by a behavior-parity golden test
(`api/test/agent/loop-parity.test.ts`) that records the decision trace (which exit
condition fires, which tool calls survive guardrails) across query types. Any change to
`loop-engine.ts`, `cti-loop.ts`, or the planner's exit/guardrail handling must keep that
trace identical unless the behavior change is intentional and the snapshot is updated
deliberately.

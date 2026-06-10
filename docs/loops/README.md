# Loop Templates

Reusable **agentic workflow templates** for this repo's recurring dev workflows, in the
[loops.elorm.xyz](https://loops.elorm.xyz/loops) schema. Each loop is a goal + max
iterations + a between-iteration check + an exit condition + anti-gaming guardrails,
designed to be driven by an agent (e.g. Claude Code's `/loop` skill).

See [`../LOOP-ENGINEERING.md`](../LOOP-ENGINEERING.md) for how these relate to the
runtime loop engine in `api/src/lib/agent/`.

## How to use

Copy a loop's **Kickoff Prompt** into the agent (e.g. `/loop` in Claude Code). The agent
self-paces, running the between-iteration check each pass and stopping when the exit
condition is met or max iterations is reached. **Never weaken the check command or exit
criteria to force success** — if stuck, the loop says to stop and report blockers.

## Templates

| Loop                                                  | When to run                                   | Exit when                                                             |
| ----------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| [Deploy From Root](deploy-from-root.md)               | Any frontend / prod change                    | Deploy succeeded from repo root + `smoke --slow` green                |
| [Provider Verify Live](provider-verify-live.md)       | After editing `api/src/providers/`            | No adapter returns status-ok-but-empty against live upstream          |
| [Build Until Green](build-until-green.md)             | Before shipping                               | Build + budgets + both `tsc` passes clean                             |
| [API Tests Unsandboxed](api-tests-unsandboxed.md)     | After editing `api/src/routes/`               | `api/` vitest (incl. `test/routes/`) exits 0 locally                  |
| [Briefing Cron Safety](briefing-cron-safety.md)       | After touching briefing crons                 | ≤1 build/invocation + <50 subrequests                                 |
| [MCP Mirror](mcp-mirror.md)                           | After editing `worker/mcp-server.ts`          | PR open on standalone `dfir-mcp-server` with mirrored diff            |
| [Typecheck Until Clean](typecheck-until-clean.md)     | Before shipping / clearing type debt          | All three `tsc` projects report 0 errors                              |
| [Route Schema Contract](route-schema-contract.md)     | After editing an `api/src/routes/` handler    | `validate()` schema mirrors handler reads; contract test green        |
| [Upload Route Hardening](upload-route-hardening.md)   | After adding/changing a file-upload route     | Multipart + own cap; integration test mounts real middleware, exits 0 |
| [IOC Subrequest Budget](ioc-subrequest-budget.md)     | After changing the IOC fan-out                | <50 subrequests + one `primeBatch` / one `flushBatch`                 |
| [CSP Nonce Sanity](csp-nonce-sanity.md)               | After touching `worker/csp.ts` / `index.html` | Page hydrates, zero CSP console violations                            |
| [Lighthouse Until Budget](lighthouse-until-budget.md) | Perf work on the frontend                     | Bundle budgets pass + CWV within target, no metric regressed          |

Each template encodes a documented operational lesson for this repo, so the agent
inherits the footguns (dual-worker deploy, silent provider rot, sandbox-only API tests,
50-subrequest cron cap, blocked MCP-repo main) instead of rediscovering them.

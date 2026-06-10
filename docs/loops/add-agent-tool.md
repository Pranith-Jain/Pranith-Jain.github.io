# Add Agent Tool

**Category:** Feature / manual

## Loop Description

Add a new tool to the autonomous CTI investigator end-to-end and prove the agent can pick
and run it. A tool is not "added" until it is registered, described to the planner,
allowed by the loop guardrails, selected by the planner for the right query type, and
executes against real data — loop until an agent run actually invokes it and uses the
result.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT add a tool that returns a broad dump — those are banned by the loop's
  `no-banned-tools` guardrail for a reason (subrequest budget + report quality).
- Do NOT skip wiring it into the planner's `tool_selection_rules`; an unreferenced tool
  the planner never selects is dead weight.
- Respect the per-step cap and dedup guardrails (`cti-loop.ts`) — the new tool must behave
  under them, not around them.
- The tool's `execute` must handle upstream failure gracefully (return a typed error, not
  throw past the 20s timeout) so one tool can't sink a whole agent run.
- If the tool should be publicly callable, mirror it into the MCP server too — otherwise
  state that it's internal-only.

## Kickoff Prompt

```
Start the "Add Agent Tool" loop.

Goal: An agent run selects and successfully uses the new tool for its query type
Max iterations: 8
Between iterations run: an investigator agent run for a query the tool should serve (inspect the steps for the tool call + result)
Exit when: the planner selects the tool, it executes against real data, and the synthesizer uses the result

Step 1: Add the tool's execute + registry entry (buildToolRegistry) and describeTools
metadata, reference it in the planner's tool_selection_rules for the right query type, and
add a unit test. Run an agent investigation and confirm the tool is actually chosen and
used.

Self-pace this loop. After each iteration, run an investigation and read the steps, and
only continue if the tool isn't selected/used yet. Stop when it is or max iterations is
reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Implement** — `execute` fn + entry in `buildToolRegistry` + `describeTools` metadata (`api/src/lib/agent/tools.ts`).
2. **Teach the planner** — add it to `tool_selection_rules` for the relevant query type (`planner.ts`); confirm it isn't banned by `cti-loop.ts` guardrails.
3. **Test** — unit test the `execute` happy path + upstream-failure path; assert typed error, no throw.
4. **Prove in a run** — run an investigation; confirm the planner selects it and the synthesizer uses the result. Mirror to MCP if public.

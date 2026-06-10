/**
 * The CTI investigator agent expressed as a concrete {@link LoopDefinition}.
 *
 * This re-seats the previously-scattered control flow of the investigator on
 * the generic loop engine. The behavior is identical to the pre-refactor code
 * (planner.ts exit blocks + InvestigatorAgentDO exit check + parsePlannerOutput
 * dedup/filter); a behavior-parity test pins it (test/lib/loop-engine.test.ts).
 *
 * Exit conditions and guardrails that were prose-in-prompt or ad-hoc inline are
 * now named, ordered, and individually testable.
 */
import type { AgentStep, AgentToolCall } from './types';
import { LoopEngine, type ExitCondition, type Guardrail, type ExitResult } from './loop-engine';

/**
 * The slice of agent state the loop's exit/guardrail logic reasons about.
 * `stepNum` is the 1-based number of the step about to run (i.e.
 * `AgentState.currentStep + 1`), matching the pre-refactor planner contract.
 */
export interface CtiLoopView {
  stepNum: number;
  maxSteps: number;
  steps: AgentStep[];
}

/** Broad "dump" tools the planner must never call (was prose in the prompt). */
export const BANNED_TOOLS = new Set(['get_live_iocs', 'get_today_briefing', 'get_feed_status', 'get_feed_catalog']);

/** Max tool calls executed per step (was prose: "Maximum 2 tool calls per step"). */
export const MAX_TOOLS_PER_STEP = 2;

/** Count of successful (status==='ok') results collected so far. */
export function countOkResults(steps: AgentStep[]): number {
  return steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'ok').length, 0);
}

// ── Exit conditions ────────────────────────────────────────────────────────
// Order preserves the pre-refactor precedence (planner.ts cond1 → cond2 → cond3,
// with the DO's `stepNum >= maxSteps` fallback folded into max-iterations-reached).

const maxIterationsReached: ExitCondition<CtiLoopView> = {
  name: 'max-iterations-reached',
  met: (v) => v.stepNum >= v.maxSteps,
  reason: (v) => `Step ${v.stepNum}/${v.maxSteps} — synthesizing report.`,
};

const nearLimitWithData: ExitCondition<CtiLoopView> = {
  name: 'near-limit-with-data',
  met: (v) => v.stepNum >= v.maxSteps - 1 && countOkResults(v.steps) >= 3,
  reason: (v) => `${countOkResults(v.steps)} successful results — synthesizing to preserve context.`,
};

const enoughResults: ExitCondition<CtiLoopView> = {
  name: 'enough-results',
  met: (v) => countOkResults(v.steps) >= 6,
  reason: (v) => `${countOkResults(v.steps)} results collected — enough for a comprehensive report.`,
};

// ── Guardrails ─────────────────────────────────────────────────────────────

/** Drop calls to tools that don't exist in the registry (was in parsePlannerOutput). */
function noUnknownTools(validToolNames: Set<string>): Guardrail<CtiLoopView, AgentToolCall> {
  return {
    name: 'no-unknown-tools',
    filter: (calls) => calls.filter((tc) => tc.tool && validToolNames.has(tc.tool)),
  };
}

/**
 * Drop a call whose `tool:args` was already executed in a prior step, or that
 * repeats within the same batch. Mirrors the `called` Set logic in the
 * pre-refactor parsePlannerOutput exactly (prior keys use `r.args`; proposed
 * keys use `args ?? {}`).
 */
const noDuplicateToolArgs: Guardrail<CtiLoopView, AgentToolCall> = {
  name: 'no-duplicate-tool-args',
  filter: (calls, view) => {
    const called = new Set<string>();
    for (const s of view.steps) {
      for (const r of s.results) called.add(`${r.tool}:${JSON.stringify(r.args)}`);
    }
    const out: AgentToolCall[] = [];
    for (const tc of calls) {
      const key = `${tc.tool}:${JSON.stringify(tc.args ?? {})}`;
      if (called.has(key)) continue;
      called.add(key);
      out.push(tc);
    }
    return out;
  },
};

/** Drop broad "dump" tools (defense-in-depth for the prompt's NEVER-call rule). */
const noBannedTools: Guardrail<CtiLoopView, AgentToolCall> = {
  name: 'no-banned-tools',
  filter: (calls) => calls.filter((tc) => !BANNED_TOOLS.has(tc.tool)),
};

/** Cap the batch at MAX_TOOLS_PER_STEP (structural form of the prompt rule). */
const maxToolsPerStep: Guardrail<CtiLoopView, AgentToolCall> = {
  name: 'max-tools-per-step',
  filter: (calls) => calls.slice(0, MAX_TOOLS_PER_STEP),
};

// ── Engine assembly ────────────────────────────────────────────────────────

/**
 * Build the CTI loop engine for the current step. The tool registry varies per
 * invocation, so valid tool names are injected here rather than baked in.
 */
export function buildCtiLoopEngine(validToolNames: Set<string>): LoopEngine<CtiLoopView, AgentToolCall> {
  return new LoopEngine<CtiLoopView, AgentToolCall>({
    goal: 'Produce an analyst-grade CTI report from collected, enriched, and analyzed data.',
    maxIterations: (v) => v.maxSteps,
    exitConditions: [maxIterationsReached, nearLimitWithData, enoughResults],
    guardrails: [noUnknownTools(validToolNames), noDuplicateToolArgs, noBannedTools, maxToolsPerStep],
  });
}

/**
 * Evaluate the pre-plan exit decision for the step about to run. Returns the
 * first matching exit condition, or `null` to keep investigating.
 *
 * Tool names are irrelevant to exit conditions, so an empty set is fine.
 */
export function evaluateCtiExit(view: CtiLoopView): ExitResult | null {
  return buildCtiLoopEngine(new Set()).evaluateExit(view);
}

/**
 * Filter the planner's proposed tool calls through every guardrail
 * (unknown → duplicate → banned → max-per-step).
 */
export function filterCtiToolCalls(
  calls: readonly AgentToolCall[],
  view: CtiLoopView,
  validToolNames: Set<string>
): AgentToolCall[] {
  return buildCtiLoopEngine(validToolNames).applyGuardrails(calls, view);
}

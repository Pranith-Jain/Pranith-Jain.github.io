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

/**
 * Drop tools with a high recent failure rate (from D1-backed tool-health stats).
 * Preventive — stops the planner from proposing a tool that's been failing this
 * session/colo, before it wastes a step. The degraded set is injected by the
 * caller (the DO reads it from observability.selectDegradedTools); an empty
 * set (the default) disables the guardrail so the parity test is unaffected.
 */
function noDegradedTools(degraded: Set<string>): Guardrail<CtiLoopView, AgentToolCall> {
  return {
    name: 'no-degraded-tools',
    filter: (calls) => (degraded.size === 0 ? [...calls] : calls.filter((tc) => !degraded.has(tc.tool))),
  };
}

/** Cap the batch at MAX_TOOLS_PER_STEP (structural form of the prompt rule). */
const maxToolsPerStep: Guardrail<CtiLoopView, AgentToolCall> = {
  name: 'max-tools-per-step',
  filter: (calls) => calls.slice(0, MAX_TOOLS_PER_STEP),
};

// ── Engine assembly ────────────────────────────────────────────────────────

/**
 * Build the CTI loop engine for the current step. The tool registry varies per
 * invocation, so valid tool names are injected here rather than baked in.
 *
 * `degradedTools` (optional) is the set of tools with a high recent failure
 * rate (from observability.selectDegradedTools). When non-empty, a
 * `no-degraded-tools` guardrail drops them before the planner's calls reach
 * execution — preventive rather than advisory. Defaults to empty so callers
 * that don't supply it (incl. the parity test) are unaffected.
 */
export function buildCtiLoopEngine(
  validToolNames: Set<string>,
  degradedTools: Set<string> = new Set()
): LoopEngine<CtiLoopView, AgentToolCall> {
  return new LoopEngine<CtiLoopView, AgentToolCall>({
    goal: 'Produce an analyst-grade CTI report from collected, enriched, and analyzed data.',
    maxIterations: (v) => v.maxSteps,
    exitConditions: [maxIterationsReached, nearLimitWithData, enoughResults],
    guardrails: [
      noUnknownTools(validToolNames),
      noDuplicateToolArgs,
      noBannedTools,
      noDegradedTools(degradedTools),
      maxToolsPerStep,
    ],
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
 * Minimum-data floor: the prompt says "a defensible report requires at least 3
 * successful tool calls". The exit conditions only enforce this near the step
 * ceiling (`nearLimitWithData`), so a model that sets `shouldSynthesize: true`
 * after 1–2 tool calls would otherwise end the investigation early with a thin
 * report. This guard blocks early synthesis unless we're at the max-iteration
 * ceiling (where there's no budget left anyway).
 *
 * Returns true when synthesis is ALLOWED (enough data, or no budget left).
 */
export function canSynthesizeNow(view: CtiLoopView): boolean {
  if (view.stepNum >= view.maxSteps) return true; // at the ceiling — must synthesize
  return countOkResults(view.steps) >= MIN_OK_RESULTS_FOR_SYNTHESIS;
}

/** Minimum successful tool results required before allowing voluntary synthesis. */
export const MIN_OK_RESULTS_FOR_SYNTHESIS = 3;

/**
 * Filter the planner's proposed tool calls through every guardrail
 * (unknown → duplicate → banned → degraded → max-per-step).
 */
export function filterCtiToolCalls(
  calls: readonly AgentToolCall[],
  view: CtiLoopView,
  validToolNames: Set<string>,
  degradedTools: Set<string> = new Set()
): AgentToolCall[] {
  return buildCtiLoopEngine(validToolNames, degradedTools).applyGuardrails(calls, view);
}

/**
 * Compute the tool calls the guardrails dropped from a proposed batch — the
 * complement of {@link filterCtiToolCalls}. Returned in proposed order so the
 * observer/planner can see which intents were silently rejected (unknown tool,
 * duplicate args, banned dump tool, degraded, or beyond the per-step cap) and
 * re-propose the legitimate ones on the next turn.
 */
export function getDroppedCalls(
  calls: readonly AgentToolCall[],
  view: CtiLoopView,
  validToolNames: Set<string>,
  degradedTools: Set<string> = new Set()
): AgentToolCall[] {
  const survived = filterCtiToolCalls(calls, view, validToolNames, degradedTools);
  const survivedKeys = new Set(survived.map((tc) => `${tc.tool}:${JSON.stringify(tc.args ?? {})}`));
  return calls.filter((tc) => !survivedKeys.has(`${tc.tool}:${JSON.stringify(tc.args ?? {})}`));
}

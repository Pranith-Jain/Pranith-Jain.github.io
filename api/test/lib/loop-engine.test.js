import { describe, it, expect } from 'vitest';
import {
  evaluateCtiExit,
  filterCtiToolCalls,
  countOkResults,
  BANNED_TOOLS,
  MAX_TOOLS_PER_STEP,
} from '../../src/lib/agent/cti-loop';
import { LoopEngine } from '../../src/lib/agent/loop-engine';
// ─────────────────────────────────────────────────────────────────────────────
// Behavior-parity gate for the loop-engine rewrite.
//
// The two `reference*` functions below are faithful copies of the PRE-REFACTOR
// control flow, so this is a true differential test rather than a self-fulfilling
// characterization:
//   - referenceExit  = planner.ts lines 33-54 (synthesis early-returns)
//                      + InvestigatorAgentDO line 150 (`stepNum >= maxSteps`).
//   - referenceFilter = parsePlannerOutput lines 259-276 (unknown-tool filter
//                       + `called` Set dedup).
// We assert the new engine reproduces both across the full small input space.
// ─────────────────────────────────────────────────────────────────────────────
/** Pre-refactor exit decision, combining planner early-returns + DO fallback. */
function referenceExit(stepNum, maxSteps, ok) {
  if (stepNum >= maxSteps && ok > 0) return true; // planner cond1
  if (stepNum >= maxSteps - 1 && ok >= 3) return true; // planner cond2
  if (ok >= 6) return true; // planner cond3
  if (stepNum >= maxSteps) return true; // DO fallback (ok === 0 at the ceiling)
  return false;
}
/** Pre-refactor unknown-tool filter + dedup, from parsePlannerOutput. */
function referenceFilter(proposed, steps, toolNames) {
  const called = new Set();
  for (const s of steps) {
    for (const r of s.results) called.add(`${r.tool}:${JSON.stringify(r.args)}`);
  }
  const out = [];
  for (const tc of proposed) {
    if (!tc.tool || !toolNames.has(tc.tool)) continue;
    const key = `${tc.tool}:${JSON.stringify(tc.args ?? {})}`;
    if (called.has(key)) continue;
    called.add(key);
    out.push({ tool: tc.tool, args: tc.args ?? {}, reasoning: tc.reasoning ?? '' });
  }
  return out;
}
/** Build N steps each holding `okPerStep` successful results (distinct args). */
function stepsWithOk(totalOk) {
  const results = Array.from({ length: totalOk }, (_, i) => ({
    tool: `t${i}`,
    args: { i },
    status: 'ok',
    durationMs: 1,
    data: { x: i },
  }));
  return totalOk === 0 ? [] : [{ stepNumber: 1, plan: 'p', toolCalls: [], results, status: 'done' }];
}
describe('LoopEngine — generic', () => {
  it('evaluateExit returns the first matching condition by order', () => {
    const engine = new LoopEngine({
      goal: 'g',
      maxIterations: () => 5,
      exitConditions: [
        { name: 'a', met: (n) => n >= 10, reason: () => 'a' },
        { name: 'b', met: (n) => n >= 5, reason: () => 'b' },
      ],
      guardrails: [],
    });
    expect(engine.evaluateExit(4)).toBeNull();
    expect(engine.evaluateExit(7)?.name).toBe('b');
    expect(engine.evaluateExit(12)?.name).toBe('a'); // first match wins
  });
  it('applyGuardrails chains filters in order and never mutates input', () => {
    const input = [1, 2, 3, 4];
    const engine = new LoopEngine({
      goal: 'g',
      maxIterations: () => 0,
      exitConditions: [],
      guardrails: [
        { name: 'evens', filter: (xs) => xs.filter((x) => x % 2 === 0) },
        { name: 'first', filter: (xs) => xs.slice(0, 1) },
      ],
    });
    expect(engine.applyGuardrails(input, null)).toEqual([2]);
    expect(input).toEqual([1, 2, 3, 4]); // untouched
  });
});
describe('CTI exit conditions — parity with pre-refactor decision', () => {
  it('matches referenceExit across the full small input space', () => {
    for (let maxSteps = 1; maxSteps <= 10; maxSteps++) {
      for (let stepNum = 1; stepNum <= 12; stepNum++) {
        for (let ok = 0; ok <= 8; ok++) {
          const view = { stepNum, maxSteps, steps: stepsWithOk(ok) };
          const engineExits = evaluateCtiExit(view) !== null;
          expect(engineExits, `mismatch at stepNum=${stepNum} maxSteps=${maxSteps} ok=${ok}`).toBe(
            referenceExit(stepNum, maxSteps, ok)
          );
        }
      }
    }
  });
  it('names the highest-precedence condition (max → near-limit → enough)', () => {
    // max-iterations dominates even when enough-results also holds.
    expect(evaluateCtiExit({ stepNum: 6, maxSteps: 6, steps: stepsWithOk(7) })?.name).toBe('max-iterations-reached');
    // near-limit before enough when both could match.
    expect(evaluateCtiExit({ stepNum: 5, maxSteps: 6, steps: stepsWithOk(6) })?.name).toBe('near-limit-with-data');
    expect(evaluateCtiExit({ stepNum: 2, maxSteps: 6, steps: stepsWithOk(6) })?.name).toBe('enough-results');
    expect(evaluateCtiExit({ stepNum: 2, maxSteps: 6, steps: stepsWithOk(2) })).toBeNull();
  });
  it('countOkResults ignores error results', () => {
    const steps = [
      {
        stepNumber: 1,
        plan: 'p',
        toolCalls: [],
        status: 'done',
        results: [
          { tool: 'a', args: {}, status: 'ok', durationMs: 1 },
          { tool: 'b', args: {}, status: 'error', error: 'x', durationMs: 1 },
        ],
      },
    ];
    expect(countOkResults(steps)).toBe(1);
  });
});
describe('CTI guardrails — dedup + unknown-tool parity', () => {
  const valid = new Set(['check_ioc', 'lookup_cve', 'enrich_actor', 'unified_search']);
  function priorSteps(executed) {
    return [
      {
        stepNumber: 1,
        plan: 'p',
        toolCalls: [],
        status: 'done',
        results: executed.map((e) => ({ tool: e.tool, args: e.args, status: 'ok', durationMs: 1 })),
      },
    ];
  }
  it('drops unknown tools, prior-step dupes, and in-batch dupes — matching reference', () => {
    const steps = priorSteps([{ tool: 'check_ioc', args: { ioc: '1.1.1.1' } }]);
    const view = { stepNum: 2, maxSteps: 6, steps };
    const proposed = [
      { tool: 'check_ioc', args: { ioc: '1.1.1.1' }, reasoning: 'dup of prior step' },
      { tool: 'lookup_cve', args: { cve: 'CVE-2024-1' }, reasoning: 'new' },
      { tool: 'lookup_cve', args: { cve: 'CVE-2024-1' }, reasoning: 'in-batch dup' },
      { tool: 'not_a_tool', args: {}, reasoning: 'unknown' },
    ];
    // Reference (unknown + dedup only) keeps just the one new lookup_cve.
    const expected = referenceFilter(proposed, steps, valid);
    expect(expected.map((c) => c.tool)).toEqual(['lookup_cve']);
    // Engine (with banned + max-2 added on top) must agree here since none of
    // the survivors are banned and there are ≤2 of them.
    const got = filterCtiToolCalls(proposed, view, valid);
    expect(got).toEqual(expected);
  });
  it('passes a well-formed call through untouched (normalization is the planner-parse contract, not the guardrail layer)', () => {
    // parsePlannerOutput normalizes raw JSON into typed AgentToolCalls
    // (args ?? {}, reasoning ?? ''). By the time calls reach the guardrails they
    // are already well-formed, so the guardrails must preserve every field.
    const view = { stepNum: 1, maxSteps: 6, steps: [] };
    const proposed = [{ tool: 'unified_search', args: {}, reasoning: 'find it' }];
    const got = filterCtiToolCalls(proposed, view, valid);
    expect(got).toEqual([{ tool: 'unified_search', args: {}, reasoning: 'find it' }]);
  });
});
describe('CTI guardrails — new structural enforcement (banned + max-per-step)', () => {
  const valid = new Set([...BANNED_TOOLS, 'check_ioc', 'lookup_cve', 'enrich_actor']);
  const view = { stepNum: 1, maxSteps: 6, steps: [] };
  it('drops banned dump tools even though they are valid registry entries', () => {
    const proposed = [
      { tool: 'get_live_iocs', args: {}, reasoning: 'banned' },
      { tool: 'check_ioc', args: { ioc: '8.8.8.8' }, reasoning: 'ok' },
    ];
    const got = filterCtiToolCalls(proposed, view, valid);
    expect(got.map((c) => c.tool)).toEqual(['check_ioc']);
  });
  it(`caps the batch at ${MAX_TOOLS_PER_STEP} calls`, () => {
    const proposed = [
      { tool: 'check_ioc', args: { ioc: 'a' }, reasoning: '1' },
      { tool: 'lookup_cve', args: { cve: 'b' }, reasoning: '2' },
      { tool: 'enrich_actor', args: { actor: 'c' }, reasoning: '3' },
    ];
    const got = filterCtiToolCalls(proposed, view, valid);
    expect(got).toHaveLength(MAX_TOOLS_PER_STEP);
    expect(got.map((c) => c.tool)).toEqual(['check_ioc', 'lookup_cve']);
  });
});

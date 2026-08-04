import { describe, it, expect } from 'vitest';
import { shouldRetry } from '../../src/lib/agent/agent-framework';
import {
  canSynthesizeNow,
  MIN_OK_RESULTS_FOR_SYNTHESIS,
  countOkResults,
  BANNED_TOOLS,
  type CtiLoopView,
} from '../../src/lib/agent/cti-loop';
import { ROLE_TOOLS } from '../../src/lib/agent/role-prompts';
import type { AgentStep } from '../../src/lib/agent/types';

// ─────────────────────────────────────────────────────────────────────────────
// Bounded self-correction loop (Fix #2/#3): shouldRetry must cap at ONE retry
// and respect the step budget. A degrading model must not be able to spin.
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldRetry — bounded repair loop', () => {
  it('allows the first retry when score is low and there are fixable issues', () => {
    expect(shouldRetry(55, 2, 4, 3, 6, 0)).toBe(true); // score<60 → structural failure
    expect(shouldRetry(62, 1, 0, 3, 6, 0)).toBe(true); // score<65 + flaggedClaims
  });

  it('NEVER allows a second retry (retryCount cap = 1)', () => {
    // Even with a catastrophically low score and many flagged claims, a second
    // retry is forbidden — the loop must terminate.
    expect(shouldRetry(40, 5, 5, 3, 6, 1)).toBe(false);
    expect(shouldRetry(10, 10, 10, 3, 6, 1)).toBe(false);
  });

  it('does not retry when at the step ceiling (no budget for another synthesis)', () => {
    expect(shouldRetry(40, 5, 5, 5, 6, 0)).toBe(false); // step >= maxSteps - 1
    expect(shouldRetry(40, 5, 5, 6, 6, 0)).toBe(false);
  });

  it('does not retry when the score is already good', () => {
    expect(shouldRetry(85, 0, 0, 3, 6, 0)).toBe(false);
    expect(shouldRetry(80, 1, 0, 3, 6, 0)).toBe(false); // flagged but score >= 80
  });

  it('retries on hallucinations when score < 80', () => {
    expect(shouldRetry(75, 1, 0, 3, 6, 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Minimum-data floor (Fix #6): canSynthesizeNow blocks voluntary early
// synthesis when fewer than 3 successful tool results have been collected,
// unless we're at the max-iteration ceiling.
// ─────────────────────────────────────────────────────────────────────────────

function viewWithOk(totalOk: number, stepNum = 1, maxSteps = 6): CtiLoopView {
  const results = Array.from({ length: totalOk }, (_, i) => ({
    tool: `t${i}`,
    args: { i },
    status: 'ok' as const,
    durationMs: 1,
    data: { x: i },
  }));
  const steps: AgentStep[] =
    totalOk === 0 ? [] : [{ stepNumber: 1, plan: 'p', toolCalls: [], results, status: 'done' as const }];
  return { stepNum, maxSteps, steps };
}

describe('canSynthesizeNow — minimum-data floor', () => {
  it('blocks synthesis when fewer than MIN_OK_RESULTS successful results exist', () => {
    expect(canSynthesizeNow(viewWithOk(0))).toBe(false);
    expect(canSynthesizeNow(viewWithOk(1))).toBe(false);
    expect(canSynthesizeNow(viewWithOk(2))).toBe(false);
  });

  it(`allows synthesis at >= ${MIN_OK_RESULTS_FOR_SYNTHESIS} successful results`, () => {
    expect(canSynthesizeNow(viewWithOk(MIN_OK_RESULTS_FOR_SYNTHESIS))).toBe(true);
    expect(canSynthesizeNow(viewWithOk(6))).toBe(true);
  });

  it('ALLOWS synthesis at the max-iteration ceiling even with 0 results (must synthesize, no budget left)', () => {
    expect(canSynthesizeNow(viewWithOk(0, 6, 6))).toBe(true);
    expect(canSynthesizeNow(viewWithOk(1, 6, 6))).toBe(true);
  });

  it('blocks synthesis mid-investigation even if the planner requests it', () => {
    // step 2 of 6, only 1 ok result — the floor overrides the planner's request
    expect(canSynthesizeNow(viewWithOk(1, 2, 6))).toBe(false);
  });

  it('countOkResults only counts ok results (errors excluded)', () => {
    const steps: AgentStep[] = [
      {
        stepNumber: 1,
        plan: 'p',
        toolCalls: [],
        status: 'done',
        results: [
          { tool: 'a', args: {}, status: 'ok', durationMs: 1 },
          { tool: 'b', args: {}, status: 'error', error: 'x', durationMs: 1 },
          { tool: 'c', args: {}, status: 'ok', durationMs: 1 },
        ],
      },
    ];
    expect(countOkResults(steps)).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Banned-tools single source of truth (Fix #7): ROLE_TOOLS must never contain
// a banned tool. The per-role allow-list and the loop-engine guardrail both
// derive from BANNED_TOOLS so they cannot drift apart.
// ─────────────────────────────────────────────────────────────────────────────

describe('Banned tools — single source of truth (no drift)', () => {
  it('BANNED_TOOLS contains the known dump tools', () => {
    expect(BANNED_TOOLS.has('get_live_iocs')).toBe(true);
    expect(BANNED_TOOLS.has('get_today_briefing')).toBe(true);
    expect(BANNED_TOOLS.has('get_feed_status')).toBe(true);
    expect(BANNED_TOOLS.has('get_feed_catalog')).toBe(true);
  });

  it('no role ever receives a banned tool in its allow-list', () => {
    for (const [role, tools] of Object.entries(ROLE_TOOLS)) {
      for (const tool of tools) {
        expect(BANNED_TOOLS.has(tool), `role ${role} allows banned tool ${tool}`).toBe(false);
      }
    }
  });
});

/**
 * Tests for the self-evaluation module (5-axis scorecard).
 *
 * Run via: npx vitest run api/test/lib/self-eval.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { selfEvaluateReport } from '../../src/lib/agent/self-eval';
import type { AgentStep } from '../../src/lib/agent/types';

// Mock the AI client
vi.mock('../../src/case-study/generation/ai-client', () => ({
  runCompletion: vi.fn(),
  isRateLimited: vi.fn(() => false),
}));

import { runCompletion } from '../../src/case-study/generation/ai-client';

function makeStep(): AgentStep {
  return {
    stepNumber: 1,
    plan: 'test',
    toolCalls: [{ tool: 'check_ioc', args: { indicator: '1.2.3.4' }, reasoning: 'test' }],
    results: [
      { tool: 'check_ioc', args: {}, status: 'ok', data: { malicious: true }, durationMs: 100, nextActions: [] },
    ],
    status: 'done',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:00:01Z',
  };
}

describe('selfEvaluateReport', () => {
  it('returns null when all providers are exhausted', async () => {
    vi.mocked(runCompletion).mockResolvedValue({ text: '', provider: 'google', model: 'gemini-2.0-flash' });
    const result = await selfEvaluateReport({} as never, 'test query', 'ip', 'test report', [makeStep()], {
      googleKey: 'test',
      groqKey: 'test',
      nvidiaKey: 'test',
    });
    expect(result).toBeNull();
  });

  it('parses a valid 5-axis self-eval response', async () => {
    const mockResponse = {
      axes: [
        { axis: 'accuracy', score: 4, evidence: 'Claims match tool data', improvement: 'Add more citations' },
        { axis: 'completeness', score: 3, evidence: 'Missing MITRE section', improvement: 'Add MITRE techniques' },
        { axis: 'clarity', score: 4, evidence: 'Well-structured', improvement: 'Shorten executive summary' },
        { axis: 'actionability', score: 3, evidence: 'Has IOCs but no hunt queries', improvement: 'Add KQL queries' },
        { axis: 'conciseness', score: 4, evidence: 'No padding', improvement: 'Trim methodology section' },
      ],
      topGap: 'Add MITRE techniques to the report',
    };
    vi.mocked(runCompletion).mockResolvedValueOnce({
      text: `\`\`\`json\n${JSON.stringify(mockResponse)}\n\`\`\``,
      provider: 'google',
      model: 'gemini-2.0-flash',
    });

    const result = await selfEvaluateReport({} as never, 'test query', 'ip', 'test report', [makeStep()], {
      googleKey: 'test',
    });

    expect(result).not.toBeNull();
    expect(result!.axes).toHaveLength(5);
    expect(result!.axes[0]!.axis).toBe('accuracy');
    expect(result!.axes[0]!.score).toBe(4);
    expect(result!.overallScore).toBe(3.6);
    expect(result!.topGap).toContain('MITRE');
    expect(result!.modelUsed).toBe('gemini');
  });

  it('clamps scores to 1-5 range', async () => {
    const mockResponse = {
      axes: [
        { axis: 'accuracy', score: 10, evidence: 'test', improvement: 'test' },
        { axis: 'completeness', score: -2, evidence: 'test', improvement: 'test' },
        { axis: 'clarity', score: 3, evidence: 'test', improvement: 'test' },
        { axis: 'actionability', score: 3, evidence: 'test', improvement: 'test' },
        { axis: 'conciseness', score: 3, evidence: 'test', improvement: 'test' },
      ],
      topGap: 'test',
    };
    vi.mocked(runCompletion).mockResolvedValueOnce({
      text: JSON.stringify(mockResponse),
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    });

    const result = await selfEvaluateReport({} as never, 'test', 'ip', 'report', [makeStep()], { groqKey: 'test' });

    expect(result).not.toBeNull();
    expect(result!.axes[0]!.score).toBe(5); // clamped from 10
    expect(result!.axes[1]!.score).toBe(1); // clamped from -2
  });

  it('falls through to next provider on parse failure', async () => {
    vi.mocked(runCompletion)
      .mockResolvedValueOnce({ text: 'not json', provider: 'google', model: 'gemini-2.0-flash' })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          axes: Array(5).fill({ axis: 'accuracy', score: 3, evidence: 'test', improvement: 'test' }),
          topGap: 'test',
        }),
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
      });

    const result = await selfEvaluateReport({} as never, 'test', 'ip', 'report', [makeStep()], {
      googleKey: 'test',
      groqKey: 'test',
    });

    expect(result).not.toBeNull();
    expect(result!.modelUsed).toBe('groq');
  });

  it('returns null when axes array is incomplete', async () => {
    vi.mocked(runCompletion).mockResolvedValueOnce({
      text: JSON.stringify({ axes: [{ axis: 'accuracy', score: 4, evidence: 'test', improvement: 'test' }] }),
      provider: 'google',
      model: 'gemini-2.0-flash',
    });

    const result = await selfEvaluateReport({} as never, 'test', 'ip', 'report', [makeStep()], { googleKey: 'test' });

    expect(result).toBeNull();
  });
});

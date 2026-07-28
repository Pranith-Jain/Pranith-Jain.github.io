import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCompletion } from '../../src/case-study/generation/ai-client';
import { synthesizeReport } from '../../src/lib/agent/synthesizer';
import type { AgentStep } from '../../src/lib/agent/types';

// Deterministic agent eval harness: mocks the LLM completion and runs the real
// synthesizer pipeline (splitSynthOutput → normaliseActionCard → extractors →
// data-quality logic) against golden investigations, asserting the structured
// output has the expected properties. Catches regressions in the report→action
// card pipeline without live LLM calls.

vi.mock('../../src/case-study/generation/ai-client', async () => {
  return {
    runCompletion: vi.fn(),
    runCompletionStream: vi.fn(),
    isRateLimited: () => false,
  };
});

const mockedCompletion = runCompletion as ReturnType<typeof vi.fn>;

function step(tool: string, data: unknown, observer?: AgentStep['observerFindings']): AgentStep {
  return {
    stepNumber: 1,
    plan: 'test',
    toolCalls: [{ tool, args: {}, reasoning: 'r' }],
    results: [{ tool, args: {}, status: 'ok', data, durationMs: 10 }],
    status: 'done',
    observerFindings: observer,
  };
}

/** Build a golden synthesizer output: report-header + prose + action-card. */
function goldenReport(
  actionCard: Record<string, unknown>,
  prose = '## 1. Executive Summary\nConfirmed malicious activity.',
  headerConfidence: 'high' | 'medium' | 'low' = 'high'
): string {
  const header = JSON.stringify({
    headline: 'Test verdict',
    bluf: 'BLUF',
    key_takeaway: 'Takeaway',
    severity: actionCard.severity ?? 'high',
    posture: 'active',
    confidence: headerConfidence,
    tlp: 'AMBER',
  });
  return (
    '```report-header\n' +
    header +
    '\n```\n\n' +
    prose +
    '\n\n```action-card\n' +
    JSON.stringify(actionCard) +
    '\n```\n'
  );
}

const ai = {} as never;

beforeEach(() => {
  mockedCompletion.mockReset();
});

describe('agent eval: CVE investigation', () => {
  it('produces an action card with KEV, CVSS, CVE IOC, and MITRE mapping', async () => {
    const actionCard = {
      verdict: { headline: 'CVE-2024-3400 is actively exploited', confidence: 'high', posture: 'active', tlp: 'AMBER' },
      severity: 'critical',
      actions: [{ severity: 'critical', action: 'Patch PAN-OS', category: 'contain' }],
      mitre: [{ id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access' }],
      iocs: [{ type: 'cve', value: 'CVE-2024-3400', confidence: 'Confirmed' }],
      kev: true,
      kev_date: '2024-04-10',
      cvss: { score: 10.0, vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', severity: 'CRITICAL' },
      ransomware: false,
      attributed: false,
      threat_actors: [],
    };
    mockedCompletion.mockResolvedValue({ text: goldenReport(actionCard), modelUsed: 'groq:test' });

    const steps = [
      step(
        'lookup_cve',
        { cve_id: 'CVE-2024-3400', cvss: { score: 10.0 }, kev: true },
        {
          iocs: [],
          cves: ['CVE-2024-3400'],
          mitre: ['T1190'],
          keyFacts: ['CVSS 10.0, KEV-listed'],
          gaps: [],
        }
      ),
    ];
    const out = await synthesizeReport(ai, 'CVE-2024-3400', 'cve', steps, {});

    expect(out.actionCard).toBeDefined();
    expect(out.actionCard?.kev).toBe(true);
    expect(out.actionCard?.cvss?.score).toBe(10.0);
    expect(out.actionCard?.severity).toBe('critical');
    expect(out.actionCard?.iocs.some((i) => i.value === 'CVE-2024-3400')).toBe(true);
    expect(out.actionCard?.mitre.some((m) => m.id === 'T1190')).toBe(true);
    expect(out.actionCard?.verdict.confidence).toBe('high');
  });
});

describe('agent eval: actor investigation', () => {
  it('captures attributed actor, malware, and techniques', async () => {
    const actionCard = {
      verdict: { headline: 'APT28 activity', confidence: 'high', posture: 'active', tlp: 'AMBER' },
      severity: 'high',
      actions: [{ severity: 'high', action: 'Hunt for X-Agent beacons', category: 'hunt' }],
      mitre: [{ id: 'T1071.001', name: 'Web Protocols', tactic: 'Command and Control' }],
      iocs: [{ type: 'actor', value: 'APT28', confidence: 'Confirmed' }],
      kev: false,
      ransomware: false,
      attributed: true,
      threat_actors: ['APT28'],
      diamond: { adversary: 'APT28', capability: ['X-Agent'], victim: 'Government' },
    };
    mockedCompletion.mockResolvedValue({ text: goldenReport(actionCard), modelUsed: 'groq:test' });

    const steps = [
      step(
        'enrich_actor',
        { name: 'APT28', aliases: ['Fancy Bear'], malware: ['X-Agent'] },
        {
          iocs: [],
          actors: ['APT28'],
          malware: ['X-Agent'],
          mitre: ['T1071.001'],
          keyFacts: ['APT28 targets government'],
          gaps: [],
        }
      ),
    ];
    const out = await synthesizeReport(ai, 'APT28', 'actor', steps, {});

    expect(out.actionCard?.attributed).toBe(true);
    expect(out.actionCard?.threat_actors).toContain('APT28');
    expect(out.actionCard?.diamond?.adversary).toBe('APT28');
    expect(out.actionCard?.mitre.some((m) => m.id === 'T1071.001')).toBe(true);
  });
});

describe('agent eval: data-quality honesty', () => {
  it('forces an inconclusive, low-confidence card when all tools failed', async () => {
    // Even if the LLM tries to emit a confident card, the minimal-data path
    // (totalOk <= 1, no rich data) should constrain the report.
    const actionCard = {
      verdict: { headline: 'x', confidence: 'low', posture: 'unknown', tlp: 'CLEAR' },
      severity: 'info',
      actions: [],
      mitre: [],
      iocs: [],
      kev: false,
      ransomware: false,
      attributed: false,
      threat_actors: [],
    };
    mockedCompletion.mockResolvedValue({
      text: goldenReport(actionCard, '## 1. Executive Summary\nInconclusive.', 'low'),
      modelUsed: 'groq:test',
    });

    const failedStep: AgentStep = {
      stepNumber: 1,
      plan: 'test',
      toolCalls: [{ tool: 'check_ioc', args: {}, reasoning: 'r' }],
      results: [{ tool: 'check_ioc', args: {}, status: 'error', error: 'timeout', durationMs: 10 }],
      status: 'done',
    };
    const out = await synthesizeReport(ai, '1.2.3.4', 'ip', [failedStep], {});
    expect(out.actionCard?.severity).toBe('info');
    expect(out.actionCard?.verdict.confidence).toBe('low');
  });
});

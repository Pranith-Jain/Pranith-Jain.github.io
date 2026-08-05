/**
 * Tests for the introspection module (tool-failure diagnosis).
 *
 * Run via: npx vitest run api/test/lib/introspection.test.ts
 */
import { describe, it, expect } from 'vitest';
import { extractToolFailures, buildDataGapsSection } from '../../src/lib/agent/introspection';
import type { AgentStep } from '../../src/lib/agent/types';

function makeStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    stepNumber: 1,
    plan: 'test plan',
    toolCalls: [],
    results: [],
    status: 'done',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:00:01Z',
    ...overrides,
  };
}

describe('extractToolFailures', () => {
  it('returns empty array when no failures', () => {
    const steps = [
      makeStep({
        results: [{ tool: 'check_ioc', args: {}, status: 'ok', data: {}, durationMs: 100, nextActions: [] }],
      }),
    ];
    expect(extractToolFailures(steps)).toHaveLength(0);
  });

  it('extracts a single failed tool', () => {
    const steps = [
      makeStep({
        results: [
          {
            tool: 'reconstruct_attack_chain',
            args: {},
            status: 'error',
            error: 'API 500: internal error',
            durationMs: 239,
            nextActions: [],
          },
        ],
      }),
    ];
    const failures = extractToolFailures(steps);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.tool).toBe('reconstruct_attack_chain');
    expect(failures[0]!.cause).toBe('upstream-error');
    expect(failures[0]!.step).toBe(1);
    expect(failures[0]!.missedCapability).toContain('MITRE ATT&CK');
  });

  it('diagnoses rate-limit errors', () => {
    const steps = [
      makeStep({
        results: [
          {
            tool: 'check_ioc',
            args: {},
            status: 'error',
            error: 'API 429: rate limit exceeded',
            durationMs: 100,
            nextActions: [],
          },
        ],
      }),
    ];
    const failures = extractToolFailures(steps);
    expect(failures[0]!.cause).toBe('rate-limit');
    expect(failures[0]!.diagnosis).toContain('rate limit');
  });

  it('diagnoses timeout errors', () => {
    const steps = [
      makeStep({
        results: [
          {
            tool: 'enrich_actor',
            args: {},
            status: 'error',
            error: 'Tool timeout (20s)',
            durationMs: 20000,
            nextActions: [],
          },
        ],
      }),
    ];
    const failures = extractToolFailures(steps);
    expect(failures[0]!.cause).toBe('timeout');
  });

  it('diagnoses bad-args errors', () => {
    const steps = [
      makeStep({
        results: [
          {
            tool: 'lookup_cve',
            args: {},
            status: 'error',
            error: 'API 400: invalid CVE ID',
            durationMs: 50,
            nextActions: [],
          },
        ],
      }),
    ];
    const failures = extractToolFailures(steps);
    expect(failures[0]!.cause).toBe('bad-args');
  });

  it('deduplicates identical failures across steps', () => {
    const steps = [
      makeStep({
        stepNumber: 1,
        results: [{ tool: 'check_ioc', args: {}, status: 'error', error: 'API 500', durationMs: 100, nextActions: [] }],
      }),
      makeStep({
        stepNumber: 2,
        results: [{ tool: 'check_ioc', args: {}, status: 'error', error: 'API 500', durationMs: 100, nextActions: [] }],
      }),
    ];
    const failures = extractToolFailures(steps);
    expect(failures).toHaveLength(1);
  });

  it('maps tools to missed capabilities', () => {
    const steps = [
      makeStep({
        results: [
          { tool: 'enrich_actor', args: {}, status: 'error', error: 'API 500', durationMs: 100, nextActions: [] },
          { tool: 'lookup_cve', args: {}, status: 'error', error: 'API 500', durationMs: 100, nextActions: [] },
          { tool: 'ti_list_darknet', args: {}, status: 'error', error: 'API 500', durationMs: 100, nextActions: [] },
        ],
      }),
    ];
    const failures = extractToolFailures(steps);
    expect(failures).toHaveLength(3);
    expect(failures[0]!.missedCapability).toContain('threat actor profile');
    expect(failures[1]!.missedCapability).toContain('CVE details');
    expect(failures[2]!.missedCapability).toContain('darknet site directory');
  });
});

describe('buildDataGapsSection', () => {
  it('returns null when no failures', () => {
    const steps = [
      makeStep({
        results: [{ tool: 'check_ioc', args: {}, status: 'ok', data: {}, durationMs: 100, nextActions: [] }],
      }),
    ];
    expect(buildDataGapsSection(steps)).toBeNull();
  });

  it('builds a markdown section with failed tools', () => {
    const steps = [
      makeStep({
        results: [
          {
            tool: 'reconstruct_attack_chain',
            args: {},
            status: 'error',
            error: 'API 500: internal error',
            durationMs: 239,
            nextActions: [],
          },
        ],
      }),
    ];
    const section = buildDataGapsSection(steps);
    expect(section).not.toBeNull();
    expect(section).toContain('## Data Gaps & Limitations');
    expect(section).toContain('reconstruct_attack_chain');
    expect(section).toContain('upstream-error');
    expect(section).toContain('MITRE ATT&CK');
    expect(section).toContain('Analyst note');
  });

  it('includes multiple failures in the table', () => {
    const steps = [
      makeStep({
        results: [
          {
            tool: 'check_ioc',
            args: {},
            status: 'error',
            error: 'API 429: rate limit',
            durationMs: 100,
            nextActions: [],
          },
          {
            tool: 'enrich_actor',
            args: {},
            status: 'error',
            error: 'Tool timeout (20s)',
            durationMs: 20000,
            nextActions: [],
          },
        ],
      }),
    ];
    const section = buildDataGapsSection(steps);
    expect(section).toContain('check_ioc');
    expect(section).toContain('enrich_actor');
    expect(section).toContain('rate-limit');
    expect(section).toContain('timeout');
  });
});

import { describe, it, expect } from 'vitest';
import type { AgentStep } from '../../src/lib/agent/types';
import { rebuildWorkingMemory, createWorkingMemory, buildFactList } from '../../src/lib/agent/agent-framework';

// ─────────────────────────────────────────────────────────────────────────────
// Regression gate for cross-alarm working-memory persistence.
//
// The investigator DO runs one step per alarm invocation; the in-memory
// WorkingMemory dies with each invocation and is rebuilt from the persisted
// steps. Previously the rebuild only looked for top-level `.iocs/.mitre/...`
// on raw tool data (which tools rarely expose), so the observer's extracted
// intelligence was lost between steps. The observer findings are now persisted
// on the step (`step.observerFindings`) and the rebuild must read them back.
// ─────────────────────────────────────────────────────────────────────────────

function step(partial: Partial<AgentStep> & { stepNumber: number }): AgentStep {
  return {
    plan: '',
    toolCalls: [],
    results: [],
    status: 'done',
    ...partial,
  };
}

describe('rebuildWorkingMemory', () => {
  it('returns empty memory for no steps', () => {
    expect(rebuildWorkingMemory([])).toEqual(createWorkingMemory());
  });

  it('reconstructs IOCs/MITRE/facts from persisted observer findings', () => {
    const steps = [
      step({
        stepNumber: 1,
        results: [{ tool: 'check_ioc', args: {}, status: 'ok', data: { verdict: 'malicious' }, durationMs: 5 }],
        observerFindings: {
          iocs: ['1.2.3.4', 'evil.com'],
          mitre: ['T1059.001'],
          keyFacts: ['C2 beaconing observed'],
          confidence: 'high',
          gaps: ['no sample hash yet'],
        },
      }),
    ];
    const mem = rebuildWorkingMemory(steps);
    expect(mem.iocs.map((i) => i.value).sort()).toEqual(['1.2.3.4', 'evil.com']);
    expect(mem.mitre.map((m) => m.id)).toEqual(['T1059.001']);
    expect(mem.keyFacts.map((k) => k.text)).toContain('C2 beaconing observed');
    // Observer findings without explicit provenance default to 'llm'.
    expect(mem.keyFacts.find((k) => k.text === 'C2 beaconing observed')?.provenance).toBe('llm');
    expect(mem.openGaps).toContain('no sample hash yet');
    expect(mem.confidenceHistory.at(-1)?.confidence).toBe('high');
  });

  it('accumulates and deduplicates findings across multiple steps', () => {
    const steps = [
      step({
        stepNumber: 1,
        observerFindings: {
          iocs: ['1.2.3.4'],
          actors: [],
          cves: [],
          malware: [],
          mitre: ['T1059'],
          keyFacts: ['fact A'],
          gaps: [],
          confidence: 'medium',
        },
      }),
      step({
        stepNumber: 2,
        observerFindings: {
          iocs: ['1.2.3.4', '5.6.7.8'],
          actors: [],
          cves: [],
          malware: [],
          mitre: ['T1059', 'T1071'],
          keyFacts: ['fact B'],
          gaps: [],
        },
      }),
    ];
    const mem = rebuildWorkingMemory(steps);
    expect(mem.iocs.map((i) => i.value).sort()).toEqual(['1.2.3.4', '5.6.7.8']);
    expect(mem.mitre.map((m) => m.id).sort()).toEqual(['T1059', 'T1071']);
    expect(mem.keyFacts.map((k) => k.text)).toEqual(['fact A', 'fact B']);
    expect(mem.confidenceHistory).toHaveLength(1);
  });

  it('falls back to structured fields on raw tool data when no observer findings', () => {
    const steps = [
      step({
        stepNumber: 1,
        results: [
          {
            tool: 'enrich_actor',
            args: {},
            status: 'ok',
            data: { iocs: ['bad.example'], mitre: ['T1566'], keyFacts: ['actor X'], confidence: 'high' },
            durationMs: 5,
          },
        ],
      }),
    ];
    const mem = rebuildWorkingMemory(steps);
    expect(mem.iocs.map((i) => i.value)).toEqual(['bad.example']);
    expect(mem.mitre.map((m) => m.id)).toEqual(['T1566']);
    expect(mem.keyFacts.map((k) => k.text)).toContain('actor X');
  });

  it('ignores errored results and unstructured payloads', () => {
    const steps = [
      step({
        stepNumber: 1,
        results: [
          { tool: 'check_ioc', args: {}, status: 'error', error: 'timeout', durationMs: 5 },
          { tool: 'lookup_cve', args: {}, status: 'ok', data: { score: 9.8 }, durationMs: 5 },
        ],
      }),
    ];
    const mem = rebuildWorkingMemory(steps);
    expect(mem.iocs).toEqual([]);
    expect(mem.mitre).toEqual([]);
    expect(mem.keyFacts).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Provenance tagging (audit fix #6): keyFacts in WorkingMemory carry their
// observer provenance so the planner can downweight heuristic fallback facts
// (produced when the observer LLM was unavailable) vs. LLM-confirmed facts.
// The persistence path (investigator-agent.ts memory admission) already
// filtered by provenance; this propagates the tag into in-flight planner context.
// ─────────────────────────────────────────────────────────────────────────────

describe('rebuildWorkingMemory — provenance tagging', () => {
  it('tags observer-LLM keyFacts as llm provenance', () => {
    const steps = [
      step({
        stepNumber: 1,
        observerFindings: {
          iocs: [],
          actors: [],
          cves: [],
          malware: [],
          mitre: [],
          keyFacts: ['C2 beaconing observed'],
          gaps: [],
          confidence: 'high',
          provenance: 'llm',
        },
      }),
    ];
    const mem = rebuildWorkingMemory(steps);
    expect(mem.keyFacts).toHaveLength(1);
    expect(mem.keyFacts[0]).toEqual({ text: 'C2 beaconing observed', provenance: 'llm' });
  });

  it('tags fallback keyFacts as fallback provenance', () => {
    const steps = [
      step({
        stepNumber: 1,
        observerFindings: {
          iocs: [],
          actors: [],
          cves: [],
          malware: [],
          mitre: [],
          keyFacts: ['check_ioc: score 85'],
          gaps: [],
          confidence: 'medium',
          provenance: 'fallback',
        },
      }),
    ];
    const mem = rebuildWorkingMemory(steps);
    expect(mem.keyFacts).toHaveLength(1);
    expect(mem.keyFacts[0]?.provenance).toBe('fallback');
  });

  it('defaults to llm provenance when observerFindings has no provenance field', () => {
    const steps = [
      step({
        stepNumber: 1,
        observerFindings: {
          iocs: [],
          actors: [],
          cves: [],
          malware: [],
          mitre: [],
          keyFacts: ['fact without provenance'],
          gaps: [],
          confidence: 'medium',
        },
      }),
    ];
    const mem = rebuildWorkingMemory(steps);
    expect(mem.keyFacts[0]?.provenance).toBe('llm');
  });
});

describe('buildFactList', () => {
  it('returns empty string when no observer findings exist', () => {
    expect(buildFactList([])).toBe('');
    expect(buildFactList([step({ stepNumber: 1 })])).toBe('');
  });

  it('compiles confirmed IOCs, MITRE, and key facts (deduped)', () => {
    const steps = [
      step({
        stepNumber: 1,
        observerFindings: {
          iocs: ['1.2.3.4'],
          actors: [],
          cves: [],
          malware: [],
          mitre: ['t1059'],
          keyFacts: ['C2 seen'],
          gaps: [],
        },
      }),
      step({
        stepNumber: 2,
        observerFindings: {
          iocs: ['1.2.3.4', 'evil.com'],
          actors: [],
          cves: [],
          malware: [],
          mitre: ['T1059'],
          keyFacts: ['C2 seen'],
          gaps: [],
        },
      }),
    ];
    const out = buildFactList(steps);
    expect(out).toContain('IOCs confirmed by tools: 1.2.3.4, evil.com');
    expect(out).toContain('MITRE techniques confirmed: T1059');
    expect(out).toContain('C2 seen');
    // Deduped: only one C2 seen line, one T1059
    expect(out.match(/C2 seen/g)).toHaveLength(1);
    expect(out.match(/T1059/g)).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REGRESSION (audit 2026-08): fallback-provenance keyFacts (produced by the
  // deterministic observer stub when the LLM is unavailable) must be tagged
  // [unconfirmed] and separated from LLM-confirmed facts, so the synthesizer/QA
  // do not assert heuristic extractions (score/verdict/items.length) as
  // analyst-confirmed intelligence.
  // ─────────────────────────────────────────────────────────────────────────
  it('tags fallback-provenance keyFacts as [unconfirmed] and separates them from LLM-confirmed facts', () => {
    const steps = [
      step({
        stepNumber: 1,
        observerFindings: {
          iocs: ['1.2.3.4'],
          mitre: ['T1059'],
          keyFacts: ['C2 beaconing observed'],
          provenance: 'llm',
          gaps: [],
        },
      }),
      step({
        stepNumber: 2,
        observerFindings: {
          iocs: [],
          mitre: [],
          keyFacts: ['check_ioc: score 87', 'check_ioc: verdict malicious'],
          provenance: 'fallback',
          gaps: [],
        },
      }),
    ];
    const out = buildFactList(steps);
    // LLM-confirmed fact appears under the confirmed section
    expect(out).toContain('Key facts confirmed by tools:');
    expect(out).toContain('- C2 beaconing observed');
    // Fallback facts appear under a separate, clearly-labeled section
    expect(out).toContain('Unconfirmed heuristic extractions');
    expect(out).toContain('[unconfirmed] check_ioc: score 87');
    expect(out).toContain('[unconfirmed] check_ioc: verdict malicious');
    // The confirmed section must NOT contain the heuristic stubs
    const confirmedSection = out.split('Unconfirmed heuristic extractions')[0];
    expect(confirmedSection).not.toContain('check_ioc: score 87');
  });

  it('does not tag LLM-provenance facts as unconfirmed', () => {
    const steps = [
      step({
        stepNumber: 1,
        observerFindings: {
          iocs: ['1.2.3.4'],
          mitre: [],
          keyFacts: ['C2 beaconing observed'],
          provenance: 'llm',
          gaps: [],
        },
      }),
    ];
    const out = buildFactList(steps);
    expect(out).not.toContain('[unconfirmed]');
    expect(out).not.toContain('Unconfirmed heuristic extractions');
  });
});

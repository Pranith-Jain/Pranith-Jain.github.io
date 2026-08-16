/**
 * Multi-agent orchestrator.
 *
 * Routes a user query to the appropriate specialist agents, dispatches them
 * (potentially in parallel), collects findings, and merges into a unified
 * investigation state. The orchestrator tracks which specialist is active
 * and switches when exit conditions fire.
 */

import type { AgentStep, AgentTool, AgentToolCall, AgentToolResult } from './types';
import {
  type SpecialistRole,
  type OrchestratorPlan,
  type SpecialistDispatch,
  type SpecialistFinding,
  type SpecialistView,
  SPECIALIST_REGISTRY,
  getSpecialistsForQueryType,
} from './specialist-types';

/**
 * Build an orchestration plan: which specialists to call, in what order,
 * and with what context.
 */
export async function buildOrchestratorPlan(
  query: string,
  queryType: string,
  _opts: { infronKey?: string; groqKey?: string; googleKey?: string; nvidiaKey?: string }
): Promise<OrchestratorPlan> {
  const specialistRoles = getSpecialistsForQueryType(queryType, query);

  const specialistCalls: SpecialistDispatch[] = specialistRoles.map((role, i) => {
    const def = SPECIALIST_REGISTRY[role];
    const context: Record<string, unknown> = {};
    if (i > 0) {
      context.previousSpecialists = specialistRoles.slice(0, i);
    }
    return {
      role,
      query,
      queryType,
      context,
      maxSteps: def.maxSteps,
    };
  });

  return {
    specialistCalls,
    reasoning: `Routing ${queryType} query through ${specialistRoles.map((r) => SPECIALIST_REGISTRY[r].label).join(' → ')}`,
  };
}

/**
 * Check if the current specialist's exit conditions have fired.
 * Returns the next specialist role to switch to, or null if staying.
 */
export function checkSpecialistExit(
  currentRole: SpecialistRole,
  steps: AgentStep[],
  stepNum: number,
  maxSteps: number,
  queryType?: string,
  query?: string
): { shouldSwitch: boolean; nextRole: SpecialistRole | null; reason: string } {
  const def = SPECIALIST_REGISTRY[currentRole];
  const view: SpecialistView = { stepNum, maxSteps, steps, role: currentRole };

  for (const cond of def.exitConditions) {
    if (cond.met(view)) {
      // Find next specialist in the routing chain
      const specialistRoles = getSpecialistsForQueryType(queryType ?? 'generic', query);
      const currentIdx = specialistRoles.indexOf(currentRole);
      const nextRole =
        currentIdx >= 0 && currentIdx < specialistRoles.length - 1 ? specialistRoles[currentIdx + 1]! : null;
      return { shouldSwitch: true, nextRole, reason: cond.reason(view) };
    }
  }

  return { shouldSwitch: false, nextRole: null, reason: '' };
}

/**
 * Get the specialist-specific planner prompt for a given specialist.
 */
export function getSpecialistPrompt(
  role: SpecialistRole,
  tools: AgentTool[],
  step: number,
  maxSteps: number,
  query: string,
  steps: AgentStep[]
): string {
  const def = SPECIALIST_REGISTRY[role];
  return def.buildPlannerPrompt(tools, step, maxSteps, query, steps);
}

/**
 * Get the guardrails for a given specialist and apply them to tool calls.
 */
export function applySpecialistGuardrails(
  role: SpecialistRole,
  calls: AgentToolCall[],
  view: { stepNum: number; maxSteps: number; steps: AgentStep[] }
): AgentToolCall[] {
  const def = SPECIALIST_REGISTRY[role];
  let filtered = [...calls];
  for (const guardrail of def.guardrails) {
    filtered = guardrail.filter(filtered, { ...view, role });
  }
  return filtered;
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function extractFindings(
  result: AgentToolResult,
  _role: SpecialistRole | undefined,
  stepNum: number
): SpecialistFinding[] {
  const findings: SpecialistFinding[] = [];
  if (!result.data || typeof result.data !== 'object') return findings;

  const data = result.data as Record<string, unknown> & {
    kev?: boolean;
    cvss?: { score?: number };
    epss?: { score?: number };
    verdict?: string;
  };

  // Extract IOCs from check_ioc / enrich_ioc_deep results
  if (result.tool === 'check_ioc' || result.tool === 'enrich_ioc_deep') {
    const indicator = result.args.indicator ?? result.args.query ?? '';
    if (indicator) {
      findings.push({
        type: 'ioc',
        value: String(indicator),
        confidence: data.malicious === true || data.verdict === 'malicious' ? 'high' : 'medium',
        source: result.tool,
        detail: `Step ${stepNum}: ${result.tool} → ${data.verdict ?? 'unknown'}`,
      });
    }
  }

  // Extract CVEs from lookup_cve
  if (result.tool === 'lookup_cve') {
    const cveId = result.args.cve_id ?? result.args.id ?? '';
    if (cveId) {
      findings.push({
        type: 'cve',
        value: String(cveId),
        confidence: data.kev === true ? 'high' : 'medium',
        source: result.tool,
        detail: `CVSS: ${data.cvss?.score ?? 'N/A'}, EPSS: ${data.epss?.score ?? 'N/A'}`,
      });
    }
  }

  // Extract actors from enrich_actor
  if (result.tool === 'enrich_actor') {
    const actor = result.args.name ?? result.args.actor ?? '';
    if (actor) {
      findings.push({
        type: 'actor',
        value: String(actor),
        confidence: 'high',
        source: result.tool,
        detail: `Step ${stepNum}: actor profile collected`,
      });
    }
  }

  // Extract domains from lookup_domain
  if (result.tool === 'lookup_domain') {
    const domain = result.args.domain ?? result.args.query ?? '';
    if (domain) {
      findings.push({
        type: 'domain',
        value: String(domain),
        confidence: 'high',
        source: result.tool,
        detail: `Step ${stepNum}: domain profile collected`,
      });
    }
  }

  // Extract hashes from sample_scan
  if (result.tool === 'sample_scan') {
    const hash = result.args.hash ?? '';
    if (hash) {
      findings.push({
        type: 'hash',
        value: String(hash),
        confidence: data.verdict === 'malicious' ? 'high' : 'medium',
        source: result.tool,
        detail: `Step ${stepNum}: ${result.tool} → ${data.verdict ?? 'unknown'}`,
      });
    }
  }

  return findings;
}

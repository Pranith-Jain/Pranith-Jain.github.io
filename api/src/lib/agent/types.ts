/** Core types for the autonomous DFIR/ThreatIntel investigator agent. */

// ── Tool definitions ─────────────────────────────────────────────────────

export interface AgentToolParam {
  name: string;
  type: 'string' | 'number' | 'enum' | 'boolean';
  description: string;
  required: boolean;
  enum?: string[];
}

export interface AgentTool {
  name: string;
  description: string;
  params: AgentToolParam[];
  /** Execute the tool via the API. Returns arbitrary JSON. */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// ── Agent state ──────────────────────────────────────────────────────────

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'error';
export type AgentSessionStatus = 'running' | 'done' | 'error';

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
  reasoning: string;
}

export interface AgentStep {
  stepNumber: number;
  plan: string;
  toolCalls: AgentToolCall[];
  results: AgentToolResult[];
  status: AgentStepStatus;
  startedAt?: string;
  completedAt?: string;
  /** LLM's observation after seeing results */
  observation?: string;
  /** Whether the agent decided to continue or synthesize */
  nextAction?: 'continue' | 'synthesize';
}

export interface AgentToolResult {
  tool: string;
  args: Record<string, unknown>;
  status: 'ok' | 'error';
  data?: unknown;
  error?: string;
  durationMs: number;
}

export interface AgentState {
  id: string;
  query: string;
  queryType: string;
  status: AgentSessionStatus;
  steps: AgentStep[];
  currentStep: number;
  maxSteps: number;
  report: string | null;
  modelUsed: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

// ── Planner output ───────────────────────────────────────────────────────

export interface PlannerOutput {
  /** What the agent plans to do and why */
  reasoning: string;
  /** Tools to call in this step (1-3 for parallel execution) */
  toolCalls: AgentToolCall[];
  /** Whether the agent has enough info to synthesize */
  shouldSynthesize: boolean;
}

// ── Synthesizer output ───────────────────────────────────────────────────

export interface SynthesizerOutput {
  report: string;
  modelUsed: string;
  keyFindings: string[];
  confidence: 'high' | 'medium' | 'low';
  iocsExtracted: string[];
  mitreTechniques: string[];
}

// ── D1 row shape ─────────────────────────────────────────────────────────

export interface AgentSessionRow {
  id: string;
  query: string;
  query_type: string;
  status: string;
  steps_json: string | null;
  report_json: string | null;
  model_used: string | null;
  total_steps: number;
  created_at: string;
  updated_at: string;
}

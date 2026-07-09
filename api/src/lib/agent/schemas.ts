/**
 * Zod validation schemas for all LLM output parsing in the agent system.
 *
 * These schemas catch malformed LLM output at parse time instead of
 * downstream. Each schema has safe defaults so partial/malformed output
 * still produces a valid object — the schema never throws on missing
 * fields, only on structurally invalid data.
 */
import { z } from 'zod';

// ── Planner output ────────────────────────────────────────────────────────

const ToolCallSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional().default({}),
  reasoning: z.string().optional().default(''),
});

export const PlannerOutputSchema = z.object({
  reasoning: z.string().optional().default(''),
  toolCalls: z.array(ToolCallSchema).optional().default([]),
  shouldSynthesize: z.boolean().optional().default(false),
});

export type PlannerOutputValidated = z.infer<typeof PlannerOutputSchema>;

// ── Observer output ───────────────────────────────────────────────────────

export const ObserverOutputSchema = z.object({
  observation: z.string().optional().default(''),
  keyFacts: z.array(z.string()).optional().default([]),
  iocs: z.array(z.string()).optional().default([]),
  mitre: z.array(z.string()).optional().default([]),
  confidence: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  gaps: z.array(z.string()).optional().default([]),
});

export type ObserverOutputValidated = z.infer<typeof ObserverOutputSchema>;

// ── Report header (synthesizer) ──────────────────────────────────────────

export const ReportHeaderSchema = z.object({
  headline: z.string().optional().default(''),
  bluf: z.string().optional().default(''),
  key_takeaway: z.string().optional().default(''),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional().default('medium'),
  posture: z
    .enum(['active', 'reconnaissance', 'post-exploit', 'informational', 'unknown'])
    .optional()
    .default('unknown'),
  confidence: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  tlp: z.enum(['CLEAR', 'GREEN', 'AMBER', 'RED']).optional().default('AMBER'),
  tlp_rationale: z.string().optional(),
  actor: z.string().nullable().optional(),
  campaign: z.string().nullable().optional(),
  primary_indicator: z.object({ type: z.string(), value: z.string() }).nullable().optional(),
  time_to_act: z.string().nullable().optional(),
});

export type ReportHeaderValidated = z.infer<typeof ReportHeaderSchema>;

// ── QA verifier output ───────────────────────────────────────────────────

const FlaggedClaimSchema = z.object({
  claim: z.string(),
  reason: z.string(),
  evidence: z.string(),
});

const MissingFactSchema = z.object({
  fact: z.string(),
  source: z.string(),
  importance: z.string(),
});

const CorrectionSchema = z.object({
  original: z.string(),
  corrected: z.string(),
  reason: z.string(),
});

export const QaOutputSchema = z.object({
  flagged_claims: z.array(FlaggedClaimSchema).optional().default([]),
  missing_facts: z.array(MissingFactSchema).optional().default([]),
  corrections: z.array(CorrectionSchema).optional().default([]),
  quality_score: z.number().min(0).max(100).optional().default(50),
  quality_notes: z.string().optional().default(''),
});

export type QaOutputValidated = z.infer<typeof QaOutputSchema>;

// ── Shared JSON extraction helper ─────────────────────────────────────────

/**
 * Extract the first JSON object from LLM text that may contain markdown
 * code fences or surrounding prose. Returns the raw string slice ready
 * for schema parsing, or throws if no JSON object is found.
 */
export function extractJsonObject(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON object found in LLM output');
  return cleaned.slice(firstBrace, lastBrace + 1);
}

/**
 * Safely parse LLM JSON through a Zod schema. Returns the validated
 * result on success, or the provided fallback on any error (parse,
 * validation, or schema mismatch). Never throws.
 */
export function safeParseWithFallback<T>(raw: string, schema: z.ZodSchema<T>, fallback: T): T {
  try {
    const json = extractJsonObject(raw);
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    // Schema validation failed — log and return fallback
    console.warn(
      'schema validation failed:',
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    );
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Parse LLM JSON through a Zod schema with structured error info.
 * Returns { ok: true, data } on success, or { ok: false, errors } on failure.
 * The errors string can be appended to the retry prompt.
 */
export function parseWithErrors<T>(
  raw: string,
  schema: z.ZodSchema<T>
): { ok: true; data: T } | { ok: false; errors: string } {
  try {
    const json = extractJsonObject(raw);
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);
    if (result.success) return { ok: true, data: result.data };
    const errors = result.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n');
    return { ok: false, errors };
  } catch (err) {
    return { ok: false, errors: err instanceof Error ? err.message : String(err) };
  }
}

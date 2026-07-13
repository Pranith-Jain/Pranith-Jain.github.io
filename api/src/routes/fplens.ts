import type { Context } from 'hono';
import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';

/**
 * FPLENS — False Positive Likelihood Analyzer.
 *
 * Takes a detection rule (Sigma, KQL, SPL, XQL, Snort) plus optional
 * sample hits / environment context, returns a structured verdict on
 * whether the rule is more likely to fire as a true positive or a
 * false positive in the operator's environment, with concrete tuning
 * guidance.
 *
 * POST /api/v1/fplens/analyze
 *   { rule, sample_hits?, env_context? }
 *
 * Returns JSON with the following shape (validated with a defensive
 * type guard — the LLM can still misbehave on edge cases):
 *   {
 *     fp_risk_level: 'HIGH' | 'MEDIUM' | 'LOW',
 *     fp_risk_summary: string,
 *     fp_patterns: Array<{ scenario: string, signals: string }>,
 *     tp_signals: string[],
 *     suggested_exclusions: string[],
 *     tuning_guidance: string[],
 *   }
 *
 * The LLM is instructed to return RAW JSON only (no markdown fences,
 * no preamble). We strip any backticks defensively before parsing.
 */
export interface FpLensRequest {
  rule: string;
  sample_hits?: string;
  env_context?: string;
}

export interface FpPattern {
  scenario: string;
  signals: string;
}

export interface FpLensResult {
  fp_risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  fp_risk_summary: string;
  fp_patterns: FpPattern[];
  tp_signals: string[];
  suggested_exclusions: string[];
  tuning_guidance: string[];
}

const MAX_RULE_LENGTH = 8000;
const MAX_SAMPLES_LENGTH = 4000;
const MAX_ENV_LENGTH = 1000;

const SYSTEM_PROMPT = `You are an L3 SOC detection engineer specializing in false positive analysis and rule tuning.
CRITICAL: Return ONLY raw JSON. No markdown fences, no preamble, no explanation. Invalid JSON breaks the tool.

INPUT TYPE — auto-detect and adapt your analysis:
- Alert name only (e.g., "Suspicious PowerShell Encoded Command"): Infer the detection logic this alert implies. Analyze what legitimate activity would trigger a rule with this name.
- Alert details / description: Extract the core detection conditions. Analyze FPs based on what the alert evaluates.
- Detection rule (KQL, SPL, Sigma, XQL, Snort): Base analysis directly on the rule logic provided.
- Raw log events / sample logs: Identify the pattern a detection rule would match in these events. Analyze FPs for that detection.
- Threat scenario description: Identify legitimate behaviors that overlap with the attacker behavior described. Analyze FPs for a detection rule covering this scenario.

STRICT DATA DISCIPLINE:
- Base FP analysis strictly on the actual input — no generic advice ungrounded in the input
- Suggested exclusions: if a rule is provided, match its query language exactly; otherwise write pseudo-conditions that capture the exclusion intent
- Only flag FP scenarios plausible given the input
- TP signals must be specific and observable, directly tied to the input
- FP risk level: HIGH = fires constantly on benign activity; MEDIUM = regular FP noise expected; LOW = well-scoped
- No filler, no generic SOC advice, no em dashes. Short, precise, active voice.

Return JSON with exactly these six keys:
{
  "fp_risk_level": "HIGH or MEDIUM or LOW",
  "fp_risk_summary": "2-3 sentences on why this detection has this FP risk level, grounded in the specific input.",
  "fp_patterns": [
    { "scenario": "Specific legitimate activity that would trigger this detection", "signals": "Observable indicators that identify this hit as a FP" }
  ],
  "tp_signals": ["Specific observable indicator confirming a hit is malicious — directly derivable from the input"],
  "suggested_exclusions": ["Condition or filter to add as exclusion — match the rule's query language if provided, otherwise pseudo-condition. Be specific."],
  "tuning_guidance": ["Specific actionable recommendation to reduce FP noise — e.g., add thresholds, scope to asset groups, add entity allowlisting"]
}
Write 3-6 FP patterns, 3-5 TP signals, 2-4 exclusions, 2-4 tuning items.`;

function clamp(value: string | undefined, max: number): string {
  if (!value) return '';
  return value.length > max ? value.slice(0, max) + '\n[truncated]' : value;
}

/** Strip any markdown fences / preamble the LLM may have added defensively. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Try the whole string first.
  try {
    return JSON.parse(trimmed);
  } catch (_catchErr) {
    console.error('extractJson failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    // Fall back to extracting the first {...} block.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('LLM response did not contain a JSON object');
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function normalizeRiskLevel(value: unknown): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (typeof value !== 'string') return 'MEDIUM';
  const upper = value.trim().toUpperCase();
  if (upper === 'HIGH' || upper === 'LOW' || upper === 'MEDIUM') return upper;
  return 'MEDIUM';
}

function asStringArray(value: unknown, min: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
  if (out.length < min) {
    // pad with a generic placeholder so the front-end can still render
    while (out.length < min) out.push('(insufficient detail from the model)');
  }
  return out.slice(0, max);
}

function asFpPatterns(value: unknown): FpPattern[] {
  if (!Array.isArray(value)) return [];
  const out: FpPattern[] = [];
  for (const item of value) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const scenario = typeof obj.scenario === 'string' ? obj.scenario.trim() : '';
      const signals = typeof obj.signals === 'string' ? obj.signals.trim() : '';
      if (scenario && signals) out.push({ scenario, signals });
    }
  }
  if (out.length < 3) {
    while (out.length < 3) {
      out.push({ scenario: '(insufficient detail from the model)', signals: '(insufficient detail from the model)' });
    }
  }
  return out.slice(0, 6);
}

export function normalizeFpLensResult(raw: unknown): FpLensResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    fp_risk_level: normalizeRiskLevel(obj.fp_risk_level),
    fp_risk_summary:
      typeof obj.fp_risk_summary === 'string' && obj.fp_risk_summary.trim().length > 0
        ? obj.fp_risk_summary.trim()
        : 'No summary returned by the model.',
    fp_patterns: asFpPatterns(obj.fp_patterns),
    tp_signals: asStringArray(obj.tp_signals, 3, 5),
    suggested_exclusions: asStringArray(obj.suggested_exclusions, 2, 4),
    tuning_guidance: asStringArray(obj.tuning_guidance, 2, 4),
  };
}

export async function fplensAnalyzeHandler(c: Context<{ Bindings: Env }>) {
  let body: FpLensRequest;
  try {
    body = (await c.req.json()) as FpLensRequest;
  } catch (_catchErr) {
    console.error('fplensAnalyzeHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'invalid_json', message: 'request body must be JSON' }, 400);
  }
  if (!body.rule || typeof body.rule !== 'string' || body.rule.trim().length === 0) {
    return c.json({ error: 'missing_rule', message: 'rule is required' }, 400);
  }
  const rule = clamp(body.rule, MAX_RULE_LENGTH);
  const hits = clamp(body.sample_hits, MAX_SAMPLES_LENGTH);
  const env = clamp(body.env_context, MAX_ENV_LENGTH);

  const userMessage = [
    `Detection rule / alert:\n${rule}`,
    hits ? `\n\nSample hits / additional logs:\n${hits}` : '',
    env ? `\n\nEnvironment context:\n${env}` : '',
  ]
    .filter(Boolean)
    .join('');

  try {
    const llmOut = await Promise.race([
      runCompletion(
        c.env.AI,
        {
          system: SYSTEM_PROMPT,
          user: userMessage,
          maxTokens: 1800,
          temperature: 0.2,
        },
        {
          googleKey: c.env.GOOGLE_AI_STUDIO_API_KEY,
          groqKey: c.env.GROQ_API_KEY,
          nvidiaKey: c.env.NVIDIA_API_KEY as string | undefined,
          quality: true,
        }
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('fplens-timeout')), 20_000)),
    ]);
    const text = llmOut.text?.trim();
    if (!text) {
      return c.json({ error: 'empty_response', message: 'LLM returned no text' }, 502);
    }
    const parsed = extractJson(text);
    const result = normalizeFpLensResult(parsed);
    return c.json(result, 200, { 'cache-control': 'no-store' });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'fplens-timeout') {
      return c.json({ error: 'timeout', message: 'FP analysis timed out' }, 504);
    }
    console.error('fplens analyze failed:', msg);
    return c.json({ error: 'analysis_failed', message: msg }, 500);
  }
}

/**
 * Conclusion extraction — generates executive conclusions with recommended
 * actions from threat reports.
 * Retries once with a simplified prompt if the first attempt fails.
 */

import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';
import { extractJson } from './llm-json';

export interface RecommendedAction {
  priority: 'immediate' | 'short-term' | 'long-term';
  action: string;
  rationale?: string;
}

export interface Conclusion {
  keyTakeaways: string[];
  recommendedActions: RecommendedAction[];
  riskAssessment: string;
  model?: string;
}

const EMPTY: Conclusion = { keyTakeaways: [], recommendedActions: [], riskAssessment: '' };

const SYSTEM = `You are a senior threat intelligence analyst. Given a threat report, write an executive conclusion with actionable recommendations.

Return JSON with this exact structure:
{
  "keyTakeaways": ["takeaway 1", "takeaway 2", "takeaway 3"],
  "recommendedActions": [
    {
      "priority": "immediate|short-term|long-term",
      "action": "specific action to take",
      "rationale": "why this matters"
    }
  ],
  "riskAssessment": "1-2 sentence overall risk assessment"
}

Generate 3-6 key takeaways and 4-8 recommended actions. Be specific and actionable.
Output JSON only. No prose, no markdown fences.`;

const RETRY_SYSTEM = `Return a JSON object with keys: keyTakeaways (array of strings), recommendedActions (array of objects with priority/action/rationale), riskAssessment (string).`;

const TIMEOUT_MS = 22_000;
const MAX_INPUT_CHARS = 4000;

export async function extractConclusion(text: string, summary: string, env: Env): Promise<Conclusion> {
  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) + '\n…[truncated]' : text;
  const context = `Summary:\n${summary.slice(0, 2000)}\n\nReport text:\n${input}`;

  const result = await tryExtract(SYSTEM, context, env);
  if (result && (result.keyTakeaways.length > 0 || result.riskAssessment)) return result;

  const retry = await tryExtract(RETRY_SYSTEM, context, env);
  return retry ?? result ?? EMPTY;
}

async function tryExtract(system: string, context: string, env: Env): Promise<Conclusion | null> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('conclusion timeout')), TIMEOUT_MS)
    );
    const r = await Promise.race([
      runCompletion(
        env.AI,
        {
          system,
          user: `Write an executive conclusion for this threat report.\n\n${context}`,
          maxTokens: 2000,
          temperature: 0.3,
        },
        { googleKey: env.GOOGLE_AI_STUDIO_API_KEY, groqKey: env.GROQ_API_KEY }
      ),
      timeout,
    ]);
    const raw = typeof r.text === 'string' ? r.text : '';
    const parsed = extractJson<Record<string, unknown>>(raw);
    if (!parsed) return null;
    return {
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? (parsed.keyTakeaways as string[]).slice(0, 6) : [],
      recommendedActions: Array.isArray(parsed.recommendedActions)
        ? (parsed.recommendedActions as RecommendedAction[]).slice(0, 8)
        : [],
      riskAssessment: typeof parsed.riskAssessment === 'string' ? parsed.riskAssessment : '',
      model: r.modelUsed,
    };
  } catch {
    return null;
  }
}

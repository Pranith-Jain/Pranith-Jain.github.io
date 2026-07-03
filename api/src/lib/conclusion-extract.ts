/**
 * Conclusion extraction — generates executive conclusions with recommended
 * actions from threat reports.
 */

import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';

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

const SYSTEM = `You are a senior threat intelligence analyst. Given a threat report, write an executive conclusion with actionable recommendations.

Return JSON with this exact structure:
{
  "keyTakeaways": [
    "takeaway 1",
    "takeaway 2",
    "takeaway 3",
    "takeaway 4",
    "takeaway 5"
  ],
  "recommendedActions": [
    {
      "priority": "immediate|short-term|long-term",
      "action": "specific action to take",
      "rationale": "why this matters"
    }
  ],
  "riskAssessment": "1-2 sentence overall risk assessment of this threat"
}

Focus on:
1. 3-6 key takeaways that capture the most important findings
2. 4-8 recommended actions prioritized by urgency (immediate = now, short-term = this week, long-term = this quarter)
3. Each action should be specific and actionable, not generic
4. Risk assessment should consider likelihood and impact

Be direct and actionable. Avoid vague recommendations like "improve security posture".
Output JSON only. No prose, no markdown fences.`;

const TIMEOUT_MS = 18_000;
const MAX_INPUT_CHARS = 4000;

export async function extractConclusion(text: string, summary: string, env: Env): Promise<Conclusion> {
  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) + '\n…[truncated]' : text;

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('conclusion timeout')), TIMEOUT_MS)
    );
    const r = await Promise.race([
      runCompletion(
        env.AI,
        {
          system: SYSTEM,
          user: `Write an executive conclusion for this threat report.\n\nSummary:\n${summary.slice(0, 2000)}\n\nReport text:\n${input}`,
          maxTokens: 2000,
          temperature: 0.3,
        },
        { googleKey: env.GOOGLE_AI_STUDIO_API_KEY, groqKey: env.GROQ_API_KEY }
      ),
      timeout,
    ]);

    const raw = typeof r.text === 'string' ? r.text.trim() : '';
    const i = raw.indexOf('{');
    const j = raw.lastIndexOf('}');
    if (i < 0 || j <= i) {
      return { keyTakeaways: [], recommendedActions: [], riskAssessment: '' };
    }

    const parsed = JSON.parse(raw.slice(i, j + 1)) as Record<string, unknown>;
    return {
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? (parsed.keyTakeaways as string[]).slice(0, 6) : [],
      recommendedActions: Array.isArray(parsed.recommendedActions)
        ? (parsed.recommendedActions as RecommendedAction[]).slice(0, 8)
        : [],
      riskAssessment: typeof parsed.riskAssessment === 'string' ? parsed.riskAssessment : '',
      model: r.modelUsed,
    };
  } catch {
    return {
      keyTakeaways: [],
      recommendedActions: [],
      riskAssessment: '',
    };
  }
}

/**
 * AI-powered threat-intelligence summary generator.
 *
 * Given a collection of feed items (writeups, cybercrime, signals, etc.),
 * produces a concise analyst-grade summary covering:
 *   - Key themes and trends
 *   - Notable threat actors / campaigns
 *   - Critical CVEs or vulnerabilities
 *   - Recommended actions
 *
 * Uses the same LLM client as the case-study generator (Groq → Workers AI).
 * Gracefully degrades: on any failure returns null so the caller can skip
 * the summary card without blocking the page.
 */

import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';

export interface SummaryInput {
  /** Page surface name (e.g. "CTI Writeups", "Cybercrime", "Signal"). */
  surface: string;
  /** ISO date the summary covers. */
  date: string;
  /** Items to summarize. title + body are joined; source is metadata. */
  items: Array<{ title: string; body: string; source?: string }>;
  /** Max items to feed into the prompt. Default 30. */
  maxItems?: number;
}

export interface SummaryResult {
  summary: string;
  modelUsed: string;
  itemCount: number;
}

const SYSTEM_PROMPT = `You are a senior cyber-threat-intelligence analyst. Given a list of security items from a specific feed surface, write a concise operational summary (150-300 words) for a CTI team.

Structure your summary as:
1. **Headline**: One sentence capturing the most important development.
2. **Key themes**: 2-4 bullet points of the dominant trends or topics.
3. **Notable entities**: Mention specific threat actors, malware families, CVEs, or campaigns if present.
4. **Analyst takeaway**: One sentence on what defenders should focus on.

Rules:
- Be specific and factual. Reference actual names, CVE IDs, and actors from the items.
- Do not invent or speculate beyond what the items state.
- Use professional CTI language suitable for a SOC or threat-intel team.
- If the items are thin or low-signal, say so honestly rather than padding.
- Do not use markdown headers (#). Use bold (**) for emphasis only.
- Output plain text, no markdown fences.`;

const MAX_BODY_CHARS = 12000;
const CALL_TIMEOUT_MS = 12000;

function buildUserPrompt(input: SummaryInput): string {
  const items = input.items.slice(0, input.maxItems ?? 30);
  const lines: string[] = [
    `Surface: ${input.surface}`,
    `Date: ${input.date}`,
    `Items (${items.length} of ${input.items.length}):`,
    '',
  ];
  for (const item of items) {
    const src = item.source ? ` [${item.source}]` : '';
    const body = item.body.replace(/\s+/g, ' ').trim().slice(0, 300);
    lines.push(`- ${item.title}${src}: ${body}`);
  }
  const joined = lines.join('\n');
  return joined.length > MAX_BODY_CHARS ? joined.slice(0, MAX_BODY_CHARS) + '\n…[truncated]' : joined;
}

/**
 * Generate an AI summary for a feed surface. Returns null on any failure
 * (rate limit, timeout, parse error) so callers can skip gracefully.
 */
export async function generateAiSummary(input: SummaryInput, env: Env): Promise<SummaryResult | null> {
  if (input.items.length === 0) return null;

  const userPrompt = buildUserPrompt(input);

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ai-summary timeout')), CALL_TIMEOUT_MS)
    );
    const result = await Promise.race([
      runCompletion(
        env.AI,
        {
          system: SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: 800,
          temperature: 0.3,
        },
        { groqKey: env.GROQ_API_KEY }
      ),
      timeoutPromise,
    ]);

    const text = typeof result.text === 'string' ? result.text.trim() : '';
    if (!text || text.length < 50) return null;

    return {
      summary: text,
      modelUsed: result.modelUsed,
      itemCount: Math.min(input.items.length, input.maxItems ?? 30),
    };
  } catch (err) {
    console.warn(
      JSON.stringify({
        job: 'ai-summary',
        surface: input.surface,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return null;
  }
}

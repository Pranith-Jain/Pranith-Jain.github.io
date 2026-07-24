import type { Context } from 'hono';
import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';

const SYSTEM_PROMPT = `You are a CTI analyst mentor. Given a user's query and the assistant's response, suggest 3 short follow-up questions the analyst could ask next.

Rules:
- Each follow-up must be a standalone question (max 80 chars).
- Lead with the most operationally relevant question (what should the analyst act on first?).
- Questions should dig deeper: ask about specific TTPs, related threat actors, detection engineering, remediation, or intelligence gaps.
- Do NOT suggest re-asking the same query or generic questions like "tell me more".
- If the response mentions specific IOCs, actors, or CVEs, ask about specific next steps related to them.
- Return ONLY a JSON array of strings: ["question 1", "question 2", "question 3"]`;

export async function copilotFollowUpsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{ query: string; responseContent: string }>();
    const query = body.query?.trim();
    const responseContent = body.responseContent?.trim();

    if (!responseContent) return c.json({ suggestions: [] });

    const userPrompt = `Original query: "${query ?? '(first message)'}"\n\nAssistant response:\n${responseContent.slice(0, 3000)}`;

    const result = await runCompletion(
      c.env.AI,
      { system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 500, temperature: 0.5 },
      {
        groqKey: c.env.GROQ_API_KEY,
        googleKey: c.env.GOOGLE_AI_STUDIO_API_KEY,
        nvidiaKey: c.env.NVIDIA_API_KEY,
        preferGroq: true,
      }
    );

    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(result.text) as string[];
      suggestions = Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch {
      const m = result.text.match(/\[([\s\S]*?)\]/);
      if (m) {
        try { suggestions = (JSON.parse(m[0]) as string[]).slice(0, 3); } catch { /* fall through */ }
      }
    }

    if (suggestions.length === 0) {
      suggestions = ['What are the key TTPs involved?', 'What detection rules can I write for this?', 'What related threats should I investigate?'];
    }

    return c.json({ suggestions });
  } catch (e) {
    console.error('copilotFollowUpsHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({
      suggestions: ['What are the key TTPs involved?', 'What detection rules can I write for this?', 'What related threats should I investigate?'],
    });
  }
}

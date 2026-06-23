import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const ALERT_SYSTEM = `You are a threat alert engine. Given a user's watchlist keywords and a batch of recent events, identify matches and assess relevance.
Return ONLY valid JSON:
{
  "alerts": [
    {
      "event_index": 0,
      "matched_keywords": ["keyword1"],
      "relevance": "critical|high|medium|low",
      "reason": "1-2 sentence explanation of why this matches the watchlist",
      "suggested_action": "suggested response"
    }
  ],
  "total_checked": 20,
  "alert_count": 3
}
Only include events that match at least one keyword.`;

interface AlertCheckRequest {
  keywords: string[];
  events: Array<{ title: string; description?: string; kind: string; severity: string; source: string }>;
}

export async function alertCheckHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<AlertCheckRequest>();
    if (!body.keywords?.length) return c.json({ error: 'no keywords' }, 400);
    if (!body.events?.length) return c.json({ alerts: [], total_checked: 0, alert_count: 0 });

    const eventList = body.events
      .slice(0, 30)
      .map((e, i) => `[${i}] [${e.severity}] ${e.title} (${e.kind}, ${e.source})`)
      .join('\n');

    const { text, model } = await runAi(c.env.AI, c.env.GROQ_API_KEY, {
      system: ALERT_SYSTEM,
      user: `Watchlist keywords: ${body.keywords.join(', ')}\n\nEvents:\n${eventList}`,
      maxTokens: 2000,
    }, c.env.GOOGLE_AI_STUDIO_API_KEY);

    const result = parseJson(text) as Record<string, unknown>;
    return c.json({ ...result, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('alert-check error:', e);
    return c.json({ error: 'alert check failed' }, 500);
  }
}

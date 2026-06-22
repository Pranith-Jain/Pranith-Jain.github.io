import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const DARKWEB_SYSTEM = `You are a dark web intelligence analyst. Given a list of dark web monitoring items (leak site posts, forum discussions, marketplace listings), produce a structured intelligence brief.
Return ONLY valid JSON:
{
  "executive_summary": "2-3 sentence overview of dark web activity",
  "threat_level": "critical|high|medium|low",
  "active_leak_sites": [
    {
      "name": "Group/site name",
      "recent_activity": "What they posted recently",
      "victim_count": "Number of victims mentioned",
      "sectors_targeted": ["sector1"],
      "threat_assessment": "high|medium|low"
    }
  ],
  "forum_chatter": [
    {
      "topic": "Discussion topic",
      "platform": "Forum name",
      "sentiment": "planning|trading|celebrating|recruiting",
      "threat_relevance": "high|medium|low"
    }
  ],
  "emerging_threats": ["threat1"],
  "recommended_monitoring": ["item1"]
}
Be specific about real threat actor names and platforms when identifiable.`;

interface DarkwebRequest {
  items: Array<{ title: string; source: string; description?: string; category?: string }>;
}

export async function darkwebIntelHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<DarkwebRequest>();
    if (!body.items?.length) return c.json({ error: 'no items' }, 400);

    const list = body.items
      .slice(0, 30)
      .map(
        (a, i) =>
          `[${i}] ${a.title} (${a.source})${a.category ? ` [${a.category}]` : ''}${a.description ? `\n    ${a.description.slice(0, 200)}` : ''}`
      )
      .join('\n');

    const { text, model } = await runAi(c.env.AI, c.env.GROQ_API_KEY, {
      system: DARKWEB_SYSTEM,
      user: `Dark web monitoring items:\n${list}`,
      maxTokens: 2500,
    });

    const intel = parseJson(text);
    return c.json({ intel, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('darkweb-intel error:', e);
    return c.json({ error: 'analysis failed' }, 500);
  }
}

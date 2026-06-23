import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const DIGEST_SYSTEM = `You are a senior threat intelligence analyst producing a daily intelligence digest. Given a list of recent security articles, produce a structured digest.
Return ONLY valid JSON:
{
  "date": "YYYY-MM-DD",
  "executive_summary": "3-4 sentence overview of the day's most significant developments",
  "top_stories": [
    {
      "headline": "Concise headline",
      "summary": "2-3 sentence summary",
      "significance": "Why this matters",
      "category": "vulnerability|campaign|breach|malware|geopolitical|policy",
      "urgency": "critical|high|medium|low"
    }
  ],
  "trending_threats": ["threat1", "threat2"],
  "sector_impact": {
    "critical_infrastructure": "summary",
    "financial": "summary",
    "technology": "summary",
    "healthcare": "summary"
  },
  "iotd_ioc": "Indicator of the Day — one IOC worth blocking now",
  "iotd_rationale": "Why this IOC matters",
  "watchlist": ["Item to monitor in the next 24-48h"]
}
Select 5-8 top stories from the input. Be specific and actionable.`;

interface DigestRequest {
  items: Array<{ title: string; description?: string; source: string; pubDate?: string }>;
  period?: 'daily' | 'weekly';
}

export async function feedDigestHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<DigestRequest>();
    if (!body.items?.length) return c.json({ error: 'no items provided' }, 400);

    const itemList = body.items
      .slice(0, 50)
      .map(
        (item, i) =>
          `[${i + 1}] ${item.title} (${item.source})${item.description ? `\n    ${item.description.slice(0, 300)}` : ''}`
      )
      .join('\n');

    const { text, model } = await runAi(c.env.AI, c.env.GROQ_API_KEY, {
      system: DIGEST_SYSTEM,
      user: `Period: ${body.period ?? 'daily'}\n\nArticles:\n${itemList}`,
      maxTokens: 3000,
      temperature: 0.3,
    }, c.env.GOOGLE_AI_STUDIO_API_KEY);

    const digest = parseJson(text);
    return c.json({ digest, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('feed-digest error:', e);
    return c.json({ error: 'digest generation failed' }, 500);
  }
}

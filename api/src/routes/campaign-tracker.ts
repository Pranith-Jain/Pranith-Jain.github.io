import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const CAMPAIGN_SYSTEM = `You are a threat intelligence campaign tracker. Given a collection of related threat articles/events, construct a campaign timeline and analysis.
Return ONLY valid JSON:
{
  "campaign_name": "Descriptive name for this campaign",
  "actor": "Threat actor or group if identifiable",
  "status": "active|dormant|concluded",
  "first_seen": "Approximate start date or time period",
  "last_seen": "Most recent activity",
  "targets": ["sector1", "sector2"],
  "geography": ["country1", "country2"],
  "timeline": [
    {
      "date": "YYYY-MM-DD or approximate",
      "event": "What happened",
      "source": "Source name",
      "significance": "high|medium|low"
    }
  ],
  "ttps": ["T1566: Phishing", "T1059: Command and Scripting Interpreter"],
  "indicators": ["ioc1", "ioc2"],
  "attribution_confidence": "high|medium|low",
  "attribution_rationale": "Why this actor is attributed",
  "executive_summary": "3-4 sentence campaign overview",
  "recommended_actions": ["action1", "action2"]
}
Build a coherent narrative from the provided events.`;

interface CampaignRequest {
  title: string;
  events: Array<{ title: string; description?: string; source: string; date?: string }>;
}

export async function campaignTrackerHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<CampaignRequest>();
    if (!body.events?.length) return c.json({ error: 'no events' }, 400);

    const eventList = body.events
      .map(
        (e, i) =>
          `[${i}] ${e.title} (${e.source})${e.date ? ` — ${e.date}` : ''}${e.description ? `\n    ${e.description.slice(0, 200)}` : ''}`
      )
      .join('\n');

    const { text, model } = await runAi(c.env.AI, c.env.GROQ_API_KEY, {
      system: CAMPAIGN_SYSTEM,
      user: `Campaign: ${body.title}\n\nEvents:\n${eventList}`,
      maxTokens: 3000,
    }, c.env.GOOGLE_AI_STUDIO_API_KEY);

    const campaign = parseJson(text);
    return c.json({ campaign, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('campaign-tracker error:', e);
    return c.json({ error: 'campaign analysis failed' }, 500);
  }
}

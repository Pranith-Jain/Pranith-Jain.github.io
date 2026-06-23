import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const CORRELATE_SYSTEM = `You are a CTI correlation engine. Given a list of recent threat events, identify related events that likely belong to the same campaign, actor, or incident.
Return ONLY valid JSON:
{
  "clusters": [
    {
      "id": "cluster-1",
      "label": "Concise cluster name (e.g., 'LockBit automotive campaign')",
      "confidence": "high|medium|low",
      "event_indices": [0, 3, 7],
      "relationship": "same_actor|same_campaign|same_victim|same_ttp|cascading",
      "narrative": "2-3 sentence explanation of how these events are connected",
      "actor": "Threat actor if identifiable, else null",
      "campaign": "Campaign name if identifiable, else null"
    }
  ],
  "uncorrelated_count": 5,
  "summary": "1-2 sentence overview of the correlation findings"
}
Group events into 2-5 clusters. Only cluster events with strong evidence of connection.`;

interface CorrelateRequest {
  events: Array<{
    title: string;
    description?: string;
    kind: string;
    severity: string;
    source: string;
    country?: string;
  }>;
}

export async function eventCorrelationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<CorrelateRequest>();
    if (!body.events?.length) return c.json({ error: 'no events' }, 400);

    const eventList = body.events
      .slice(0, 30)
      .map((e, i) => `[${i}] [${e.severity}] ${e.title} (${e.kind}, ${e.source})${e.country ? ` [${e.country}]` : ''}`)
      .join('\n');

    const { text, model } = await runAi(c.env.AI, c.env.GROQ_API_KEY, {
      system: CORRELATE_SYSTEM,
      user: `Events:\n${eventList}`,
      maxTokens: 2500,
    }, c.env.GOOGLE_AI_STUDIO_API_KEY);

    const correlation = parseJson(text);
    return c.json({ correlation, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('event-correlation error:', e);
    return c.json({ error: 'correlation failed' }, 500);
  }
}

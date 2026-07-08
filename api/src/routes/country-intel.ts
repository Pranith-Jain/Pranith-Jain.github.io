import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const INTEL_SYSTEM = `You are a senior CTI analyst specializing in geopolitical and cyber-threat intelligence. Given a country name and optionally a list of recent threat events, produce a comprehensive threat intelligence brief.
Return ONLY valid JSON:
{
  "country": "country name",
  "overall_threat_level": "critical|high|medium|low",
  "executive_summary": "2-3 sentence overview of the current threat landscape",
  "cyber_threats": "Assessment of cyber threats targeting or originating from this country",
  "geopolitical_risks": "Key geopolitical tensions and risks",
  "key_actors": ["Notable threat actors or groups"],
  "active_conflicts": ["Active conflicts, tensions, or disputes"],
  "critical_infrastructure": "Assessment of critical infrastructure risks",
  "recommended_posture": "Recommended security posture for organizations with exposure to this region",
  "trend": "improving|stable|deteriorating",
  "trend_rationale": "1 sentence explaining the trend",
  "watch_items": ["Specific things to watch for in the next 30 days"]
}
Be specific and cite real threat actors, campaigns, and events. No generic filler.`;

interface CountryIntelRequest {
  country: string;
  events?: Array<{ title: string; kind: string; severity: string; source: string }>;
}

export async function countryIntelHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<CountryIntelRequest>();
    if (!body.country?.trim()) return c.json({ error: 'missing country' }, 400);

    const lines = [`Country: ${body.country}`];
    if (body.events?.length) {
      lines.push('', 'Recent threat events:');
      for (const e of body.events.slice(0, 20)) {
        lines.push(`- [${e.severity}] ${e.title} (${e.kind}, ${e.source})`);
      }
    }

    const { text, model } = await runAi(
      c.env.AI,
      c.env.GROQ_API_KEY,
      {
        system: INTEL_SYSTEM,
        user: lines.join('\n'),
        maxTokens: 2500,
      },
      c.env.GOOGLE_AI_STUDIO_API_KEY,
      c.env.NVIDIA_API_KEY
    );

    const intel = parseJson(text);
    return c.json({ intel, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('country-intel error:', e);
    return c.json({ error: 'analysis failed' }, 500);
  }
}

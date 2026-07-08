import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const QUALITY_SYSTEM = `You are a source reliability analyst. Assess the quality of the given feed sources based on their output.
Return ONLY valid JSON:
{
  "sources": [
    {
      "name": "source name",
      "reliability": "A|B|C|D|E",
      "reliability_label": "Reliable|Usually Reliable|Fairly Reliable|Unreliable|Reliability cannot be judged",
      "information_quality": "1|2|3|4|5|6",
      "information_label": "Confirmed|Probably True|Possibly True|Doubtful|Improbably True|Cannot be judged",
      "strengths": ["strength1"],
      "weaknesses": ["weakness1"],
      "notes": "1-2 sentence assessment"
    }
  ],
  "overall_assessment": "Brief assessment of the overall feed quality"
}
NATO reliability scale: A=Reliable, B=Usually Reliable, C=Fairly Reliable, D=Unreliable, E=Cannot judge
Information scale: 1=Confirmed, 2=Probably True, 3=Possibly True, 4=Doubtful, 5=Improbable, 6=Cannot judge`;

interface QualityRequest {
  sources: Array<{ name: string; recent_titles: string[]; error_rate?: number }>;
}

export async function feedQualityHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<QualityRequest>();
    if (!body.sources?.length) return c.json({ error: 'no sources' }, 400);

    const sourceList = body.sources
      .map(
        (s) =>
          `${s.name}:\n  Recent articles: ${s.recent_titles.slice(0, 5).join(' | ')}${s.error_rate !== undefined ? `\n  Error rate: ${(s.error_rate * 100).toFixed(1)}%` : ''}`
      )
      .join('\n\n');

    const { text, model } = await runAi(
      c.env.AI,
      c.env.GROQ_API_KEY,
      {
        system: QUALITY_SYSTEM,
        user: `Source reliability assessment:\n\n${sourceList}`,
        maxTokens: 2500,
      },
      c.env.GOOGLE_AI_STUDIO_API_KEY,
      c.env.NVIDIA_API_KEY
    );

    const quality = parseJson(text);
    return c.json({ quality, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('feed-quality error:', e);
    return c.json({ error: 'quality assessment failed' }, 500);
  }
}

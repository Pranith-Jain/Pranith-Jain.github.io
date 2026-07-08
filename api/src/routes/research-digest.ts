import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const RESEARCH_SYSTEM = `You are a senior threat intelligence researcher producing a weekly research digest. Given a list of research articles/posts, produce a curated weekly report.
Return ONLY valid JSON:
{
  "week_of": "YYYY-MM-DD",
  "executive_summary": "3-4 sentence overview of the week's most significant research",
  "top_research": [
    {
      "title": "Article title",
      "source": "Source name",
      "summary": "2-3 sentence summary of findings",
      "key_finding": "The single most important takeaway",
      "novelty": "novel|incremental|confirmation",
      "actionability": "high|medium|low"
    }
  ],
  "trending_techniques": ["TTP1", "TTP2"],
  "emerging_threats": ["threat1", "threat2"],
  "defensive_recommendations": ["rec1", "rec2", "rec3"],
  "research_gaps": ["gap1", "gap2"]
}
Select 5-8 top research items. Be specific and cite real findings.`;

interface ResearchDigestRequest {
  articles: Array<{ title: string; description?: string; source: string; url?: string }>;
}

export async function researchDigestHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<ResearchDigestRequest>();
    if (!body.articles?.length) return c.json({ error: 'no articles' }, 400);

    const list = body.articles
      .slice(0, 40)
      .map((a, i) => `[${i}] ${a.title} (${a.source})${a.description ? `\n    ${a.description.slice(0, 300)}` : ''}`)
      .join('\n');

    const { text, model } = await runAi(
      c.env.AI,
      c.env.GROQ_API_KEY,
      {
        system: RESEARCH_SYSTEM,
        user: `Research articles:\n${list}`,
        maxTokens: 3000,
        temperature: 0.3,
      },
      c.env.GOOGLE_AI_STUDIO_API_KEY,
      c.env.NVIDIA_API_KEY
    );

    const digest = parseJson(text);
    return c.json({ digest, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('research-digest error:', e);
    return c.json({ error: 'digest generation failed' }, 500);
  }
}

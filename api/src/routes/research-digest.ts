import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError } from '../lib/api-error';
import { runAi, parseJson } from '../lib/ai';
import { NO_EM_DASH_RULE, stripConnectorEmDashes } from '../lib/prose-style';

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
Select 5-8 top research items. Be specific and cite real findings.
${NO_EM_DASH_RULE}`;

interface ResearchDigestRequest {
  articles: Array<{ title: string; description?: string; source: string; url?: string }>;
}

export async function researchDigestHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<ResearchDigestRequest>();
    if (!body.articles?.length) return badRequest(c, 'no articles');

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

    // Style pass over the prose-bearing fields only. Identifiers
    // (`week_of`, `novelty`, `actionability`, source names, URLs) are left
    // untouched: an em dash in a headline is quoted from the source and must
    // survive verbatim.
    if (digest && typeof digest === 'object') {
      const d = digest as Record<string, unknown>;
      if (typeof d.executive_summary === 'string') {
        d.executive_summary = stripConnectorEmDashes(d.executive_summary);
      }
      if (Array.isArray(d.top_research)) {
        d.top_research = d.top_research.map((r: Record<string, unknown>) =>
          typeof r?.summary === 'string'
            ? { ...r, summary: stripConnectorEmDashes(r.summary) }
            : typeof r?.key_finding === 'string'
              ? { ...r, key_finding: stripConnectorEmDashes(r.key_finding) }
              : r
        );
      }
      for (const key of [
        'trending_techniques',
        'emerging_threats',
        'defensive_recommendations',
        'research_gaps',
      ] as const) {
        if (Array.isArray(d[key])) {
          d[key] = d[key].map((v) => (typeof v === 'string' ? stripConnectorEmDashes(v) : v));
        }
      }
    }

    return c.json({ digest, model, generated_at: new Date().toISOString() });
  } catch (e) {
    logError('research-digest error:', e);
    return internalError(c, 'digest generation failed');
  }
}

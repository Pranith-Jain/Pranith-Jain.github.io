import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const CLUSTER_SYSTEM = `You are a deduplication engine for security news. Given a list of articles, identify groups covering the same underlying incident/story.
Return ONLY valid JSON:
{
  "clusters": [
    {
      "id": "cluster-1",
      "label": "Concise incident name",
      "indices": [0, 3, 7],
      "confidence": "high|medium|low",
      "incident_summary": "2-3 sentence summary of the underlying incident",
      "best_source_index": 0,
      "coverage_quality": "comprehensive|partial|surface"
    }
  ],
  "unique_stories": 5,
  "total_deduplicated": 12
}
Group articles covering the same incident. Only cluster with confidence >= medium.`;

interface ClusterRequest {
  articles: Array<{ title: string; description?: string; source: string }>;
}

export async function storyClusterHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<ClusterRequest>();
    if (!body.articles?.length) return c.json({ error: 'no articles' }, 400);

    const list = body.articles
      .slice(0, 60)
      .map((a, i) => `[${i}] ${a.title} (${a.source})${a.description ? `\n    ${a.description.slice(0, 200)}` : ''}`)
      .join('\n');

    const { text, model } = await runAi(c.env.AI, c.env.GROQ_API_KEY, {
      system: CLUSTER_SYSTEM,
      user: `Articles:\n${list}`,
      maxTokens: 2500,
    });

    const clusters = parseJson(text);
    return c.json({ clusters, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('story-cluster error:', e);
    return c.json({ error: 'clustering failed' }, 500);
  }
}

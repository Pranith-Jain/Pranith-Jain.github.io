import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const KNOWLEDGE_SYSTEM = `You are a threat intelligence knowledge graph builder. Given a set of threat actors, campaigns, and TTPs, produce a structured relationship graph.
Return ONLY valid JSON:
{
  "nodes": [
    {
      "id": "node-1",
      "type": "actor|campaign|ttp|victim|infrastructure",
      "label": "Display name",
      "properties": {}
    }
  ],
  "edges": [
    {
      "source": "node-1",
      "target": "node-2",
      "relationship": "uses|targets|attributed_to|communicates_with|employs",
      "confidence": "high|medium|low"
    }
  ],
  "clusters": [
    {
      "label": "Cluster name",
      "node_ids": ["node-1", "node-2"]
    }
  ]
}
Build a coherent graph with 10-30 nodes and matching edges.`;

interface GraphRequest {
  actors?: string[];
  campaigns?: string[];
  ttps?: string[];
  context?: string;
}

export async function knowledgeGraphHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<GraphRequest>();

    const lines: string[] = [];
    if (body.actors?.length) lines.push(`Actors: ${body.actors.join(', ')}`);
    if (body.campaigns?.length) lines.push(`Campaigns: ${body.campaigns.join(', ')}`);
    if (body.ttps?.length) lines.push(`TTPs: ${body.ttps.join(', ')}`);
    if (body.context) lines.push(`Context: ${body.context}`);

    if (!lines.length) return c.json({ error: 'no input data' }, 400);

    const { text, model } = await runAi(c.env.AI, c.env.GROQ_API_KEY, {
      system: KNOWLEDGE_SYSTEM,
      user: lines.join('\n'),
      maxTokens: 3000,
    });

    const graph = parseJson(text);
    return c.json({ graph, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('knowledge-graph error:', e);
    return c.json({ error: 'graph generation failed' }, 500);
  }
}

import type { Context } from 'hono';
import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';

/**
 * POST /api/v1/hunting-queries/generate
 * Generate hunting queries for multiple SIEM platforms based on a threat description.
 */

interface HuntingQuery {
  siem: string;
  query: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

interface HuntingResult {
  threat: string;
  queries: HuntingQuery[];
  mitre_techniques: string[];
  recommended_actions: string[];
}

const SYSTEM_PROMPT = `You are a senior detection engineer. Given a threat description, generate hunting queries for the requested SIEM platforms.

Respond with ONLY a JSON object matching this schema, no prose:

{
  "queries": [
    {
      "siem": "Splunk",
      "query": "actual query here",
      "description": "what this query detects",
      "confidence": "high|medium|low"
    }
  ],
  "mitre_techniques": ["T1059.001"],
  "recommended_actions": ["action 1", "action 2"]
}

Rules:
- Generate queries for ALL requested platforms.
- Use each platform's native syntax (Splunk SPL, KQL, Sigma YAML, Elastic EQL/QL, YARA, Snort rules, Suricata rules).
- Base queries on real detection logic, not placeholder patterns.
- Include MITRE ATT&CK technique IDs where applicable.
- Keep queries practical and deployable.
- 2-3 recommended actions for the analyst.`;

const MAX_CALL_TIMEOUT = 15000;

export async function huntingQueryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { threat?: string; platforms?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', message: 'invalid JSON' }, 400);
  }

  const threat = body.threat?.trim();
  if (!threat) return c.json({ error: 'bad_request', message: 'threat description required' }, 400);

  const platforms = (body.platforms ?? ['Splunk', 'KQL', 'Sigma', 'Elastic']).slice(0, 7);
  const userPrompt = `Threat: ${threat}\n\nGenerate hunting queries for: ${platforms.join(', ')}`;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), MAX_CALL_TIMEOUT)
    );
    const result = await Promise.race([
      runCompletion(
        c.env.AI,
        { system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 2000, temperature: 0.3 },
        { groqKey: c.env.GROQ_API_KEY }
      ),
      timeoutPromise,
    ]);

    const text = typeof result.text === 'string' ? result.text : '';
    // Extract JSON from response
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd < 0) throw new Error('no JSON in response');

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      queries?: Array<{ siem?: string; query?: string; description?: string; confidence?: string }>;
      mitre_techniques?: string[];
      recommended_actions?: string[];
    };

    const queries: HuntingQuery[] = (parsed.queries ?? [])
      .filter((q) => q.siem && q.query)
      .map((q) => ({
        siem: q.siem!,
        query: q.query!,
        description: q.description ?? '',
        confidence: (['high', 'medium', 'low'].includes(q.confidence ?? '') ? q.confidence : 'medium') as 'high' | 'medium' | 'low',
      }));

    const response: HuntingResult = {
      threat,
      queries,
      mitre_techniques: (parsed.mitre_techniques ?? []).filter((t) => /^T\d{4}(\.\d{3})?$/.test(t)),
      recommended_actions: (parsed.recommended_actions ?? []).slice(0, 5),
    };

    return c.json(response, 200, { 'cache-control': 'public, max-age=3600' });
  } catch (err) {
    console.error(JSON.stringify({ job: 'hunting-queries', error: err instanceof Error ? err.message : String(err) }));
    return c.json({ error: 'generation_failed', message: 'Failed to generate hunting queries' }, 503);
  }
}

import type { Context } from 'hono';
import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';
import { extractEntities } from '../lib/entity-extractor';

interface PivotSuggestion {
  label: string;
  query: string;
  category: 'actor' | 'cve' | 'malware' | 'ioc' | 'campaign' | 'sector' | 'technique' | 'general';
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

interface PivotResult {
  query: string;
  queryType: string;
  suggestions: PivotSuggestion[];
  entities: {
    cves: string[];
    ips: string[];
    domains: string[];
    hashes: string[];
    emails: string[];
    urls: string[];
    namedEntities: string[];
  };
  _error?: string;
}

const SYSTEM_PROMPT = `You are a CTI investigation path recommender. Given a user's query, the query type, and entities extracted from the investigation response, suggest the most useful next investigation pivots.

A good pivot is:
- **Specific** (not "investigate more" or "look at other sources")
- **Actionable** (the analyst can immediately search for it)
- **Relevant** (connected to the current investigation)
- **Priority-aware** (lead with the highest-risk or most time-sensitive pivot)

Return a JSON object (NO PROSE, NO MARKDOWN, JUST JSON):

{
  "suggestions": [
    {
      "label": "Brief display text for the button (max 60 chars)",
      "query": "The exact query string the analyst should search (max 200 chars)",
      "category": "actor|cve|malware|ioc|campaign|sector|technique|general",
      "confidence": "high|medium|low",
      "rationale": "Why this pivot is useful (max 120 chars)"
    }
  ]
}

Rules:
- Return 2-5 suggestions.
- Each query should be a standalone search (not dependent on the previous response).
- Prefer concrete entity names, CVE IDs, technique IDs over vague terms.
- If the query is about a CVE, suggest pivoting to the threat actor who exploits it, related CVEs, EPSS/KEV status.
- If the query is about a threat actor, suggest pivoting to their TTPs, related CVEs, recent victims, associated malware.
- If the query is about an IP/domain/hash, suggest pivoting to associated malware family, threat actor attribution, related IOCs.
- For ransomware queries, suggest pivoting to leak site, negotiation patterns, affiliate program details.
- Do NOT suggest "search more on [source]" or "check other tools". Suggest concrete, specific investigation paths.
- Confidence: high = well-known relationship, medium = plausible link, low = speculative.`;

export async function copilotPivotHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{
      query: string;
      queryType?: string;
      responseContent?: string;
      responseSources?: Array<{ name: string }>;
    }>();
    const query = body.query?.trim();
    if (!query) return c.json({ error: 'bad_request', message: 'query required' }, 400);

    const queryType = body.queryType ?? 'generic';
    const responseContent = body.responseContent ?? query;
    const sources = (body.responseSources ?? []).map((s) => s.name).join(', ');

    const entities = extractEntities(responseContent);

    const userPrompt = [
      `Original query: "${query}"`,
      `Query type: ${queryType}`,
      entities.cves.length > 0 ? `CVEs found: ${entities.cves.join(', ')}` : null,
      entities.ips.length > 0 ? `IPs found: ${entities.ips.join(', ')}` : null,
      entities.domains.length > 0 ? `Domains found: ${entities.domains.join(', ')}` : null,
      entities.hashes.length > 0 ? `Hashes found: ${entities.hashes.join(', ')}` : null,
      entities.namedEntities.length > 0 ? `Named entities: ${entities.namedEntities.join(', ')}` : null,
      sources ? `Data sources used: ${sources}` : null,
      responseContent !== query ? `\nFull response content for context:\n${responseContent.slice(0, 3000)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await runCompletion(
      c.env.AI,
      { system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 2000, temperature: 0.4 },
      {
        groqKey: c.env.GROQ_API_KEY,
        googleKey: c.env.GOOGLE_AI_STUDIO_API_KEY,
        nvidiaKey: c.env.NVIDIA_API_KEY,
        preferGroq: true,
      }
    );

    let suggestions: PivotSuggestion[] = [];
    try {
      const parsed = JSON.parse(result.text) as { suggestions: PivotSuggestion[] };
      suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [];
    } catch {
      return c.json({
        query,
        queryType,
        suggestions: [],
        entities,
        _error: 'parse-failed',
      } satisfies PivotResult);
    }

    const response: PivotResult = { query, queryType, suggestions, entities };
    return c.json(response);
  } catch (e) {
    console.error('copilotPivotHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'internal', message: 'Pivot generation failed' }, 500);
  }
}

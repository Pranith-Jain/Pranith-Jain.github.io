import type { Context } from 'hono';
import type { Env } from '../env';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

interface ThreatAnalysisRequest {
  type: 'event' | 'country' | 'indicator';
  title?: string;
  description?: string;
  country?: string;
  indicator?: string;
  severity?: string;
  kind?: string;
  source?: string;
  events?: Array<{ title: string; kind: string; severity: string; source: string; country?: string }>;
}

const EVENT_SYSTEM = `You are a senior CTI analyst. Given a threat event, produce a concise intelligence assessment.
Return ONLY valid JSON with these fields:
{
  "summary": "1-2 sentence executive summary",
  "threat_level": "critical|high|medium|low",
  "confidence": "high|medium|low",
  "impact": "Brief assessment of potential impact",
  "recommended_actions": ["action1", "action2"],
  "related_ttps": ["MITRE TTP if identifiable, else null"],
  "context": "1-2 sentences of geopolitical/cyber context"
}
No markdown. No explanation outside the JSON.`;

const COUNTRY_SYSTEM = `You are a senior geopolitical and cyber-threat intelligence analyst. Given a country and its recent threat events, produce a comprehensive threat profile.
Return ONLY valid JSON with these fields:
{
  "country": "country name",
  "overall_threat_level": "critical|high|medium|low",
  "executive_summary": "2-3 sentence overview of the threat landscape",
  "cyber_threats": "Assessment of cyber threats targeting or originating from this country",
  "geopolitical_risks": "Key geopolitical tensions and risks",
  "key_actors": ["Notable threat actors or groups if relevant"],
  "active_conflicts": ["Active conflicts or tensions"],
  "recommended_posture": "Recommended security posture for organizations with exposure to this region",
  "trend": "improving|stable|deteriorating"
}
No markdown. No explanation outside the JSON.`;

const INDICATOR_SYSTEM = `You are a threat intelligence analyst. Given an indicator (IP, domain, hash, URL), assess its threat context.
Return ONLY valid JSON with these fields:
{
  "indicator": "the indicator",
  "type": "ip|domain|hash|url|unknown",
  "assessment": "1-2 sentence threat assessment",
  "risk_level": "critical|high|medium|low|unknown",
  "confidence": "high|medium|low",
  "possibleAttribution": "Known threat actor or campaign if attributable, else null",
  "recommendedActions": ["action1", "action2"]
}
No markdown. No explanation outside the JSON.`;

async function callGroq(key: string, system: string, user: string, maxTokens = 1500): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: maxTokens,
      temperature: 0.2,
      reasoning_effort: 'medium',
    }),
  });
  if (res.status === 429) throw new Error('groq rate-limited');
  if (!res.ok) throw new Error(`groq HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('groq empty response');
  return text.trim();
}

async function callWorkersAI(ai: Env['AI'], system: string, user: string, maxTokens = 1500): Promise<string> {
  const result = (await ai.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any,
    {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    } as any
  )) as any;
  // Workers AI returns { response: string } for instruct models
  if (typeof result?.response === 'string') return result.response;
  if (typeof result === 'string') return result;
  // Some models return { messages: [...] } format
  if (result?.choices?.[0]?.message?.content) return result.choices[0].message.content;
  console.warn('threat-analysis: unexpected Workers AI response format:', JSON.stringify(result).slice(0, 500));
  return JSON.stringify(result);
}

async function callAi(
  ai: Env['AI'],
  groqKey: string | undefined,
  system: string,
  user: string,
  maxTokens = 1500
): Promise<{ text: string; model: string }> {
  if (groqKey) {
    try {
      const text = await callGroq(groqKey, system, user, maxTokens);
      return { text, model: `groq:${GROQ_MODEL}` };
    } catch (e) {
      console.warn('threat-analysis: groq failed, falling back to Workers AI', e);
    }
  }
  const text = await callWorkersAI(ai, system, user, maxTokens);
  return { text, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' };
}

function buildEventPrompt(body: ThreatAnalysisRequest): string {
  return [
    `Event: ${body.title || 'Unknown'}`,
    body.description ? `Description: ${body.description}` : '',
    body.country ? `Country: ${body.country}` : '',
    body.severity ? `Reported severity: ${body.severity}` : '',
    body.kind ? `Category: ${body.kind}` : '',
    body.source ? `Source: ${body.source}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildCountryPrompt(body: ThreatAnalysisRequest): string {
  const lines = [`Country: ${body.country || 'Unknown'}`];
  if (body.events?.length) {
    lines.push('', 'Recent threat events:');
    for (const e of body.events.slice(0, 15)) {
      lines.push(`- [${e.severity}] ${e.title} (${e.kind}, ${e.source})`);
    }
  }
  return lines.join('\n');
}

function buildIndicatorPrompt(body: ThreatAnalysisRequest): string {
  return `Indicator: ${body.indicator || 'Unknown'}`;
}

export async function threatAnalysisHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<ThreatAnalysisRequest>();
    if (!body.type) {
      return c.json({ error: 'missing type field' }, 400);
    }

    let system: string;
    let user: string;
    let maxTokens: number;

    switch (body.type) {
      case 'event':
        system = EVENT_SYSTEM;
        user = buildEventPrompt(body);
        maxTokens = 1200;
        break;
      case 'country':
        system = COUNTRY_SYSTEM;
        user = buildCountryPrompt(body);
        maxTokens = 2000;
        break;
      case 'indicator':
        system = INDICATOR_SYSTEM;
        user = buildIndicatorPrompt(body);
        maxTokens = 1000;
        break;
      default:
        return c.json({ error: `unknown type: ${body.type}` }, 400);
    }

    const key = c.env.GROQ_API_KEY;

    const { text, model } = await callAi(c.env.AI, key, system, user, maxTokens);

    // Try to extract JSON from the response
    let analysis: unknown;
    try {
      analysis = JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch?.[1]) {
        analysis = JSON.parse(jsonMatch[1]);
      } else {
        analysis = { raw: text };
      }
    }

    return c.json({
      analysis,
      model,
      type: body.type,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('rate-limited')) {
      return c.json({ error: 'rate-limited', message: 'Groq API rate limit exceeded' }, 429);
    }
    console.error('threat-analysis error:', msg);
    return c.json({ error: 'analysis failed', message: msg }, 500);
  }
}

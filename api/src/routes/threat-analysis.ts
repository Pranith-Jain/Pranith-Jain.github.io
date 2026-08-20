import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, tooManyRequests } from '../lib/api-error';
import { runCompletion } from '../case-study/generation/ai-client';

// ── Per-IP rate limiter (in-memory, per-isolate) ──────────────────────
// Every hit is an LLM call — unbounded public POSTs would burn the free-tier
// provider quotas. 15 req/min/IP is generous for the human click-path
// (analysis panels + GlobalPulse) while blocking scripted abuse.
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
let lastCleanup = Date.now();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  if (now - lastCleanup > 300_000) {
    lastCleanup = now;
    for (const [key, entry] of rateLimitMap) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) rateLimitMap.delete(key);
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// ── Cache-API cache keyed by payload content hash ─────────────────────
// Same (type, title, country, …) click from two tabs / re-opens served the
// first LLM result instead of firing a second call. 6h TTL — analyses are
// event-scoped and stale surprisingly slowly for a firehose surface.
const CACHE_TTL = 6 * 3600;

async function contentHash(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 16; i += 1) hex += bytes[i]!.toString(16).padStart(2, '0');
  return hex;
}

function cacheKey(req: ThreatAnalysisRequest): Request {
  return new Request(`https://threat-analysis.internal/v1/${req.type}`);
}

interface ThreatAnalysisRequest {
  type: 'event' | 'country' | 'indicator' | 'research';
  title?: string;
  description?: string;
  country?: string;
  indicator?: string;
  severity?: string;
  kind?: string;
  source?: string;
  url?: string;
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
  "context": "1-2 sentences of geopolitical/cyber context",
  "tweet": "A single tweet-ready line (max 280 chars) summarizing this threat for a security audience. Include 1-2 hashtags (#ThreatIntel, #CyberSecurity, etc). Punchy and specific."
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
  "trend": "improving|stable|deteriorating",
  "tweet": "A single tweet-ready line (max 280 chars) summarizing this country's threat profile for a security audience. Include 1-2 hashtags (#ThreatIntel, #CyberSecurity, etc). Punchy and specific."
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
  "recommendedActions": ["action1", "action2"],
  "tweet": "A single tweet-ready line (max 280 chars) summarizing this indicator assessment for a security audience. Include 1-2 hashtags (#ThreatIntel, #CyberSecurity, etc). Punchy and specific."
}
No markdown. No explanation outside the JSON.`;

const RESEARCH_SYSTEM = `You are a senior threat intelligence researcher analyzing a security research post or feed article. Produce a deep analytical assessment.
Return ONLY valid JSON with these fields:
{
  "summary": "2-3 sentence executive summary of the research findings",
  "key_findings": ["finding1", "finding2", "finding3"],
  "threat_level": "critical|high|medium|low",
  "confidence": "high|medium|low",
  "novelty": "Is this novel research or known TTPs? Explain briefly.",
  "affected_sectors": ["sector1", "sector2"],
  "indicators_of_compromise": ["ioc1", "ioc2"],
  "mitre_ttps": ["T####: description"],
  "attribution": "Threat actor attribution if identifiable, else null",
  "recommendations": ["recommendation1", "recommendation2"],
  "sources_cited": ["source1", "source2"],
  "quality_assessment": "Assessment of the research quality — methodology, evidence, timeliness",
  "tweet": "A single tweet-ready line (max 280 chars) summarizing this research for a security audience. Include 1-2 hashtags (#ThreatIntel, #CyberSecurity, etc). Punchy and specific."
}
No markdown. No explanation outside the JSON.`;

async function callAi(
  ai: Env['AI'],
  groqKey: string | undefined,
  nvidiaKey: string | undefined,
  system: string,
  user: string,
  maxTokens = 1500
): Promise<{ text: string; model: string }> {
  // Shared multi-provider chain (Groq → Gemini → NVIDIA → Infron → Workers AI)
  // with circuit-breaker + cooldown tracking, so this route inherits the same
  // resilience as every other AI surface instead of the old groq-only custom
  // chain (which 429'd into 500s whenever Groq's free tier throttled).
  const result = await runCompletion(
    ai,
    { system, user, maxTokens, temperature: 0.2 },
    {
      infronKey: undefined,
      googleKey: undefined,
      groqKey: groqKey,
      nvidiaKey: nvidiaKey as string | undefined,
      preferGroq: true,
    }
  );
  return { text: result.text, model: result.modelUsed };
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

function buildResearchPrompt(body: ThreatAnalysisRequest): string {
  return [
    `Title: ${body.title || 'Unknown'}`,
    body.description ? `Content: ${body.description.slice(0, 3000)}` : '',
    body.source ? `Source: ${body.source}` : '',
    body.url ? `URL: ${body.url}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Validate AI output for hallucination signals and structural completeness. */
function validateAnalysis(analysis: Record<string, unknown>, type: string): string[] {
  const issues: string[] = [];

  // Check required fields exist
  const requiredFields: Record<string, string[]> = {
    event: ['summary', 'threat_level', 'confidence'],
    country: ['country', 'overall_threat_level', 'executive_summary'],
    indicator: ['indicator', 'assessment', 'risk_level'],
    research: ['summary', 'threat_level', 'key_findings'],
  };
  for (const field of requiredFields[type] ?? []) {
    if (!analysis[field]) issues.push(`missing required field: ${field}`);
  }

  // Check threat_level is valid
  const level = (analysis.threat_level ?? analysis.overall_threat_level ?? analysis.risk_level) as string;
  if (level && !['critical', 'high', 'medium', 'low', 'unknown'].includes(level)) {
    issues.push(`invalid threat level: ${level}`);
  }

  // Check for hallucination signals: repeated text, very long strings, or empty arrays where content expected
  const summary = (analysis.summary ?? analysis.executive_summary ?? analysis.assessment ?? '') as string;
  if (summary && summary.length > 2000) issues.push('summary suspiciously long (>2000 chars)');
  if (summary) {
    const words = summary.split(/\s+/);
    if (words.length > 5) {
      const unique = new Set(words.map((w) => w.toLowerCase()));
      if (unique.size < words.length * 0.3) issues.push('summary appears repetitive (low vocabulary diversity)');
    }
  }

  // Check arrays are actually arrays and non-empty where expected
  for (const field of ['recommended_actions', 'key_findings', 'recommendations']) {
    const val = analysis[field];
    if (val !== undefined && val !== null) {
      if (!Array.isArray(val)) issues.push(`${field} should be an array`);
      else if (val.length === 0) issues.push(`${field} is empty`);
    }
  }

  return issues;
}

export async function threatAnalysisHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<ThreatAnalysisRequest>();
    if (!body.type) {
      return badRequest(c, 'missing type field');
    }

    // Rate-limit the LLM spend per client IP.
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return tooManyRequests(c, 'Rate limit exceeded — try again in a moment', { windowSeconds: 60 });
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
      case 'research':
        system = RESEARCH_SYSTEM;
        user = buildResearchPrompt(body);
        maxTokens = 2000;
        break;
      default:
        return badRequest(c, `unknown type: ${body.type}`);
    }

    // Content-hash cache: identical clicks (re-opens, re-renders, two tabs)
    // hit the Cache-API instead of re-invoking an LLM.
    const cache = (caches as unknown as { default: Cache }).default;
    const hash = await contentHash(
      JSON.stringify({
        type: body.type,
        title: body.title,
        description: body.description,
        country: body.country,
        indicator: body.indicator,
        severity: body.severity,
        kind: body.kind,
        source: body.source,
        url: body.url,
        events: body.events?.length,
      })
    );
    const key = new Request(`${cacheKey(body).url}?h=${hash}`);
    try {
      const cached = await cache.match(key);
      if (cached) {
        const data = await cached.json<Record<string, unknown>>();
        if (data && data.analysis && !data.parse_failed) {
          return c.json(data, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
        }
      }
    } catch {
      /* cache miss — proceed */
    }

    const { text, model } = await callAi(c.env.AI, c.env.GROQ_API_KEY, c.env.NVIDIA_API_KEY, system, user, maxTokens);

    // Try to extract JSON from the response
    let analysis: unknown;
    let parseFailed = false;
    try {
      analysis = JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch?.[1]) {
        try {
          analysis = JSON.parse(jsonMatch[1]);
        } catch {
          parseFailed = true;
          analysis = { raw: text };
        }
      } else {
        parseFailed = true;
        analysis = { raw: text };
      }
    }

    // Validate output quality
    const validationIssues = validateAnalysis(analysis as Record<string, unknown>, body.type);

    const response = c.json({
      analysis,
      model,
      type: body.type,
      generated_at: new Date().toISOString(),
      ...(validationIssues.length > 0 ? { quality_warnings: validationIssues } : {}),
      ...(parseFailed ? { parse_failed: true } : {}),
    });

    // Cache successful structured analyses only — a transient provider hiccup
    // must not pin a bad/raw payload for 6 hours.
    if (!parseFailed && validationIssues.filter((i) => i.startsWith('missing required field')).length === 0) {
      try {
        const value = await response.clone().json();
        await cache.put(
          key,
          new Response(JSON.stringify(value), {
            headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_TTL}` },
          })
        );
      } catch {
        /* best-effort cache write */
      }
    }

    return response;
  } catch (e) {
    logError('handler failed', e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('rate-limited')) {
      return tooManyRequests(c, 'Groq API rate limit exceeded');
    }
    logError('threat-analysis error', msg);
    return internalError(c, msg);
  }
}

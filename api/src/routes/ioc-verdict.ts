import type { Context } from 'hono';
import type { Env } from '../env';
import { detectType } from '../lib/indicator';
import type { Indicator, ProviderResult, ProviderId } from '../providers/types';
import { ADAPTERS, buildProviderEnv, PROVIDER_LABELS, PROVIDER_SUPPORT, PROVIDER_TIMEOUT_MS } from '../providers';
import { ProviderCache } from '../lib/cache';
import { isCircuitOpen, recordProviderFailure, recordProviderSuccess } from '../lib/circuit-breaker';
import { compositeScore } from '../lib/scoring';

type RuleFormat = 'kql' | 'sigma' | 'yara';
type VerdictLabel = 'malicious' | 'suspicious' | 'clean' | 'unknown';

async function runChunked<T>(items: T[], fn: (item: T) => Promise<void>, size: number): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.allSettled(chunk.map(fn));
  }
}

interface VerdictExplainRequest {
  indicator: string;
}

interface VerdictExplainResponse {
  indicator: string;
  type: string;
  verdict: VerdictLabel;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  explanation: string;
  top_evidence: Array<{ source: string; finding: string; score: number }>;
  contributed_providers: number;
  generated_at: string;
}

interface RuleGenRequest {
  indicator: string;
  format?: RuleFormat;
}

interface RuleGenResponse {
  indicator: string;
  type: string;
  format: RuleFormat;
  rule_text: string;
  rule_name: string;
  description: string;
  generated_at: string;
}

function extractEvidence(results: ProviderResult[]): Array<{ source: string; finding: string; score: number }> {
  const evidence: Array<{ source: string; finding: string; score: number }> = [];
  for (const r of results) {
    if (r.status !== 'ok' || r.score < 30) continue;
    const label = PROVIDER_LABELS[r.source] ?? r.source;
    const tags = (r.tags ?? []).slice(0, 3).join(', ');
    const finding = tags ? `${label}: ${tags}` : `${label}: score ${r.score}/100`;
    evidence.push({ source: r.source, finding, score: r.score });
  }
  evidence.sort((a, b) => b.score - a.score);
  return evidence.slice(0, 8);
}

async function runProviders(
  raw: string,
  env: Env
): Promise<{
  type: string;
  results: ProviderResult[];
  composite: { score: number; verdict: VerdictLabel; confidence: 'low' | 'medium' | 'high'; contributing: number };
}> {
  const type = detectType(raw);
  const indicator: Indicator = { type, value: raw.trim() };
  const eligible = (Object.keys(ADAPTERS) as ProviderId[]).filter((p) => (PROVIDER_SUPPORT[p] ?? []).includes(type));
  const providerEnv = buildProviderEnv(env);
  const cache = new ProviderCache(env.KV_CACHE!);
  const collected: ProviderResult[] = [];

  await cache.primeBatch(indicator);

  await runChunked(
    eligible,
    async (p) => {
      if (isCircuitOpen(p)) return;
      const cached = cache.getBatched(p);
      if (cached) {
        collected.push(cached);
        await recordProviderSuccess(p);
        return;
      }
      const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
      try {
        const r = await ADAPTERS[p](indicator, providerEnv, signal);
        collected.push(r);
        if (r.status === 'ok') {
          cache.stageBatched(p, indicator, r);
          await recordProviderSuccess(p);
        } else {
          await recordProviderFailure(p);
        }
      } catch {
        await recordProviderFailure(p);
      }
    },
    10
  );

  await cache.flushBatch(indicator);
  const comp = compositeScore(type, collected);

  return {
    type,
    results: collected,
    composite: {
      score: comp.score,
      verdict: comp.verdict as VerdictLabel,
      confidence: comp.confidence,
      contributing: comp.contributing,
    },
  };
}

async function callAi(env: Env, system: string, user: string): Promise<string> {
  const key = env.GROQ_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_completion_tokens: 2000,
          temperature: 0.2,
          reasoning_effort: 'low',
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json<{ choices?: Array<{ message?: { content?: string } }> }>();
        if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
      }
    } catch {
      /* fall through */
    }
  }

  const fallback = (await env.AI.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any,
    {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 2000,
      temperature: 0.2,
    } as any
  )) as { response?: string };
  return fallback.response ?? 'No response.';
}

export async function iocExplainHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<VerdictExplainRequest>();
    if (!body.indicator?.trim()) return c.json({ error: 'missing indicator' }, 400);

    const { type, composite, results } = await runProviders(body.indicator.trim(), c.env);
    const evidence = extractEvidence(results);
    const evidenceText =
      evidence.length > 0
        ? evidence.map((e, i) => `[${i + 1}] ${e.finding}`).join('\n')
        : 'No providers returned significant signals.';

    const systemPrompt =
      'You are a threat intelligence analyst. Given IOC enrichment data, produce a concise verdict explanation.\n\n' +
      'Rules:\n' +
      '- State the verdict clearly at the start: MALICIOUS, SUSPICIOUS, or CLEAN.\n' +
      '- Explain WHY in 2-4 sentences, referencing specific provider signals.\n' +
      '- If malicious, name the threat type / malware family if identifiable.\n' +
      '- If clean, note whether it is known-good or simply not found on any blocklist.\n' +
      '- Be precise and factual. Do not fabricate evidence.\n' +
      '- Keep the total response under 150 words.';

    const userPrompt = `Indicator: ${body.indicator.trim()}\nType: ${type}\nComposite Score: ${composite.score}/100\nVerdict: ${composite.verdict}\nConfidence: ${composite.confidence}\nContributing Sources: ${composite.contributing}\n\nTop Evidence:\n${evidenceText}\n\nProduce a verdict explanation.`;

    const explanation = await callAi(c.env, systemPrompt, userPrompt);

    return c.json(
      {
        indicator: body.indicator.trim(),
        type,
        verdict: composite.verdict,
        score: composite.score,
        confidence: composite.confidence,
        explanation,
        top_evidence: evidence,
        contributed_providers: composite.contributing,
        generated_at: new Date().toISOString(),
      } satisfies VerdictExplainResponse,
      { headers: { 'cache-control': 'public, max-age=60' } }
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'internal error' }, 500);
  }
}

export async function iocRuleHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<RuleGenRequest>();
    if (!body.indicator?.trim()) return c.json({ error: 'missing indicator' }, 400);
    const format: RuleFormat = body.format ?? 'kql';
    if (!['kql', 'sigma', 'yara'].includes(format)) {
      return c.json({ error: 'unsupported format. Use kql, sigma, or yara.' }, 400);
    }

    const { type, composite, results } = await runProviders(body.indicator.trim(), c.env);
    const evidence = extractEvidence(results);
    const evidenceText =
      evidence.length > 0
        ? evidence.map((e, i) => `[${i + 1}] ${e.finding}`).join('\n')
        : 'No significant signals detected.';

    const formatGuides: Record<string, string> = {
      kql: 'Kusto Query Language (Microsoft Sentinel / Defender). Use let syntax, table names like DeviceNetworkEvents, DeviceProcessEvents.',
      sigma:
        'Sigma rule format (yaml). Include title, id, status, description, logsource, detection, falsepositive sections.',
      yara: 'YARA rule format. Include meta, strings, and condition sections. Use the indicator value as a string pattern where appropriate.',
    };

    const systemPrompt = `You are a detection engineer. Generate a production-quality ${format.toUpperCase()} detection rule for the given IOC.\n\nThe rule should detect the specific threat described.\n${formatGuides[format]}\n\nRules:\n- Output ONLY the raw rule text. No explanations, no markdown formatting, no code fences.\n- The rule must be syntactically valid ${format.toUpperCase()}.\n- Include a meaningful rule name and description referencing the indicator.\n- Make the rule specific enough to avoid false positives.`;

    const userPrompt = `Indicator: ${body.indicator.trim()}\nType: ${type}\nComposite Score: ${composite.score}/100\nVerdict: ${composite.verdict}\n\nEvidence:\n${evidenceText}\n\nGenerate a ${format.toUpperCase()} detection rule for this indicator.`;

    let ruleText = await callAi(c.env, systemPrompt, userPrompt);
    ruleText = ruleText.trim();
    const ruleName = `detect_${body.indicator
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()
      .slice(0, 48)}`;

    return c.json(
      {
        indicator: body.indicator.trim(),
        type,
        format,
        rule_text: ruleText,
        rule_name: ruleName,
        description: `Detection rule for ${body.indicator.trim()} (${composite.verdict}, score ${composite.score})`,
        generated_at: new Date().toISOString(),
      } satisfies RuleGenResponse,
      { headers: { 'cache-control': 'public, max-age=60' } }
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'internal error' }, 500);
  }
}

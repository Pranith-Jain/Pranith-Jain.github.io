import type { Indicator, ProviderResult, CompositeScore } from '../entities';
import type { IProviderAdapter } from '../ports';

export interface CheckIocInput {
  indicator: Indicator;
  providers: IProviderAdapter[];
  env: Record<string, string | undefined>;
}

export interface CheckIocOutput {
  indicator: Indicator;
  results: ProviderResult[];
  composite: CompositeScore;
  elapsed: number;
}

function computeComposite(results: ProviderResult[]): CompositeScore {
  const ok = results.filter((r) => r.status === 'ok');
  if (ok.length === 0) {
    return { score: 0, verdict: 'unknown', confidence: 'low', providerCount: 0 };
  }
  const avgScore = ok.reduce((s, r) => s + r.score, 0) / ok.length;
  const maliciousCount = ok.filter((r) => r.verdict === 'malicious').length;
  const ratio = maliciousCount / ok.length;

  let verdict: CompositeScore['verdict'] = 'unknown';
  if (ratio >= 0.3) verdict = 'malicious';
  else if (ratio >= 0.1) verdict = 'suspicious';
  else if (avgScore < 20) verdict = 'clean';

  let confidence: CompositeScore['confidence'] = 'low';
  if (ok.length >= 5) confidence = 'high';
  else if (ok.length >= 3) confidence = 'medium';

  return { score: Math.round(avgScore), verdict, confidence, providerCount: ok.length };
}

export async function checkIoc(input: CheckIocInput): Promise<CheckIocOutput> {
  const start = Date.now();
  const supported = input.providers.filter((p) => p.supportedTypes.includes(input.indicator.type));
  const results = await Promise.allSettled(supported.map((p) => p.check(input.indicator, input.env)));
  const resolved = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          source: 'unknown',
          status: 'error' as const,
          score: 0,
          verdict: 'unknown' as const,
          raw_summary: {},
          tags: [],
          error: r.reason?.message ?? String(r.reason),
          fetched_at: new Date().toISOString(),
          cached: false,
        }
  );
  return {
    indicator: input.indicator,
    results: resolved,
    composite: computeComposite(resolved),
    elapsed: Date.now() - start,
  };
}

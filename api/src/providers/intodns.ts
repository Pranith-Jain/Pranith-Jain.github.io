import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

/**
 * IntoDNS.ai — free public DNS and email security scanner.
 *
 * Base URL: https://intodns.ai/api
 * Free, no API key required. Public diagnostic endpoints are openly
 * accessible; the LLM-targeted docs (https://intodns.ai/llm/api.md) are
 * static and cacheable. We use the agent fast-path `/scan/quick` which
 * returns score, grade, categorized checks, issues, and recommendations
 * in one call.
 *
 * Score inversion: IntoDNS reports `percentage` where 100 = A+ (best).
 * Our `ProviderResult.score` is "0–100, higher = more malicious" so we
 * invert to `100 - pct` and map to verdict:
 *   - percentage 90+ → risk 0–9, verdict `clean`
 *   - percentage 70–89 → risk 11–29, verdict `clean` (still healthy)
 *   - percentage 50–69 → risk 31–49, verdict `suspicious`
 *   - percentage 30–49 → risk 51–69, verdict `suspicious`
 *   - percentage <30 → risk 70+, verdict `malicious`
 *
 * We also surface the per-category percentages as `tags` and the issues
 * list (severity / category / title / fixable) inside `raw_summary` so
 * the UI can render them as actionable remediation without re-calling
 * the API.
 *
 * Honors `Retry-After` on 429 by surfacing a structured `rate_limited`
 * error — the parent route will see it and the UI can group it.
 */

const supports = new Set(['domain']);

interface IntodnsCategory {
  score: number;
  maxScore: number;
  percentage: number;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
}

interface IntodnsIssue {
  id?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category?: string;
  title?: string;
  description?: string;
  fixable?: boolean;
}

interface IntodnsRecommendation {
  id?: string;
  priority?: 'high' | 'medium' | 'low';
  title?: string;
  description?: string;
  impact?: string;
}

interface IntodnsGradeInfo {
  grade?: string;
  label?: string;
  description?: string;
}

interface IntodnsQuickResponse {
  domain?: string;
  timestamp?: string;
  score?: number;
  maxScore?: number;
  percentage?: number;
  grade?: string;
  gradeInfo?: IntodnsGradeInfo;
  categories?: {
    dns?: IntodnsCategory;
    email?: IntodnsCategory;
    security?: IntodnsCategory;
    [k: string]: IntodnsCategory | undefined;
  };
  issues?: IntodnsIssue[];
  recommendations?: IntodnsRecommendation[];
}

const BASE = 'https://intodns.ai/api';

export const intodns: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'intodns',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'pranithjain.qzz.io DFIR toolkit (+intodns.ai provider)',
  };
  // Optional key for higher abuse-protection ceiling. Anonymous tier is
  // functional; the LLM docs explicitly call out generous limits on
  // read-only diagnostic endpoints.
  const key = env.INTODNS_API_KEY;
  if (key) headers['Authorization'] = `Bearer ${key}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/scan/quick?domain=${encodeURIComponent(indicator.value)}`, {
      headers,
      signal,
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }

  if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
  if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

  let data: IntodnsQuickResponse;
  try {
    data = (await res.json()) as IntodnsQuickResponse;
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }

  const pct = typeof data.percentage === 'number' ? data.percentage : null;
  if (pct === null) {
    return base('error', {
      error: 'parse: no percentage in response',
      error_code: 'parse',
      error_tags: ['parse', 'malformed-response'],
    });
  }

  // Invert: intodns reports 100=best, our score is 100=worst.
  const risk = Math.max(0, Math.min(100, 100 - pct));
  let verdict: Verdict;
  if (pct >= 70) verdict = 'clean';
  else if (pct >= 30) verdict = 'suspicious';
  else verdict = 'malicious';

  // Surface the grade and per-category breakdowns as tags the UI can
  // show without re-fetching.
  const tags: string[] = [];
  if (data.grade) tags.push(`grade:${data.grade}`);
  if (data.gradeInfo?.label) tags.push(`grade-label:${data.gradeInfo.label.toLowerCase().replace(/\s+/g, '-')}`);

  // Pass/fail rollup for quick scanning.
  const categories = data.categories ?? {};
  for (const [name, cat] of Object.entries(categories)) {
    if (!cat) continue;
    if (cat.status === 'pass') tags.push(`${name}:pass`);
    else if (cat.status === 'warn') tags.push(`${name}:warn`);
    else if (cat.status === 'fail') tags.push(`${name}:fail`);
  }

  // Issue severity count.
  const issues = Array.isArray(data.issues) ? data.issues : [];
  const criticalIssues = issues.filter((i) => i.severity === 'critical').length;
  if (criticalIssues > 0) tags.push(`critical-issues:${criticalIssues}`);

  return base('ok', {
    score: risk,
    verdict,
    tags,
    raw_summary: {
      domain: data.domain ?? indicator.value,
      scannedAt: data.timestamp ?? now,
      intodnsPercentage: pct,
      intodnsGrade: data.grade,
      intodnsGradeLabel: data.gradeInfo?.label,
      categories: data.categories,
      issues: issues.map((i) => ({
        id: i.id,
        severity: i.severity,
        category: i.category,
        title: i.title,
        fixable: i.fixable,
      })),
      recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      // Canonical citation links per the LLM doc — agents / UI can deep-link.
      citations: {
        liveReport: `${BASE}/report/everything?domain=${encodeURIComponent(indicator.value)}`,
        liveReportMarkdown: `${BASE}/report/everything?domain=${encodeURIComponent(indicator.value)}&format=markdown`,
        snapshotCreate: `${BASE}/report/snapshot?domain=${encodeURIComponent(indicator.value)}`,
        methodology: 'https://intodns.ai/methodology',
        apiDocs: 'https://intodns.ai/api-docs',
        llmApi: 'https://intodns.ai/llm/api.md',
      },
    },
  });
};

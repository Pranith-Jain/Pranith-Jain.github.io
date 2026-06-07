import type { ProviderAdapter, ProviderResult } from './types';
import { runSecretScan, type SecretFinding } from '../lib/secrets-regex';

const supports = new Set(['url']);

/**
 * Synchronous, no-network secrets-in-URL provider.
 *
 * Runs the SCOPTIX-derived regex bank (api/src/lib/secrets-regex.ts)
 * over the URL string itself — a `?api_key=…` query parameter, an
 * embedded basic-auth credential, or a leaked Slack webhook URL all
 * count as a finding.
 *
 * The provider is intentionally local-only:
 *   - no fetch, so no timeout, no circuit-breaker, no upstream error
 *   - every supported input is parsed in microseconds
 *   - findings are redacted before surfacing to the UI
 *
 * For non-URL indicators (IPs, hashes, domains) we return
 * `unsupported` so the registry filters it out.
 */
export const secrets: ProviderAdapter = async (indicator) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'secrets',
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

  try {
    const findings: SecretFinding[] = runSecretScan(indicator.value, { source: 'url_string' });

    if (findings.length === 0) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['secrets-scan'],
        raw_summary: {
          finding_count: 0,
          findings: [],
          scanned_chars: indicator.value.length,
        },
      });
    }

    // 25 per finding, capped at 100. A single leaked AWS key is
    // already critical, so 4+ findings saturate the score.
    const score = Math.min(100, findings.length * 25);
    const types = Array.from(new Set(findings.map((f) => f.type))).sort();
    const tags = ['secrets-detected', ...types.map((t) => `secret:${t}`)];

    return base('ok', {
      score,
      verdict: 'malicious',
      tags,
      raw_summary: {
        finding_count: findings.length,
        finding_types: types,
        findings: findings.slice(0, 10).map((f) => ({
          type: f.type,
          redacted: f.redacted,
          // snippet is omitted from the wire payload — only the
          // redacted form is surfaced, so the live credential never
          // leaves the server. Operators can re-scan with the regex
          // bank directly if they need the full text.
          source: f.source,
        })),
        scanned_chars: indicator.value.length,
      },
    });
  } catch (err) {
    // The regex bank is pure; an exception here means an internal
    // bug, not an upstream failure. Surface as a generic error.
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};

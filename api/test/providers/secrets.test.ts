import { describe, it, expect } from 'vitest';
import { secrets } from '../../src/providers/secrets';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  CENSYS_PAT: '',
  CENSYS_ORG_ID: '',
  NETLAS_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
};

describe('secrets adapter', () => {
  it('returns unsupported for non-URL indicator types', async () => {
    const r = await secrets({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(1000));
    expect(r.status).toBe('unsupported');
    expect(r.source).toBe('secrets');
  });

  it('returns ok/clean for a URL with no leaked credentials', async () => {
    const r = await secrets(
      { type: 'url', value: 'https://example.com/safe/path?ok=1' },
      env,
      AbortSignal.timeout(1000)
    );
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('clean');
    expect(r.score).toBe(0);
    expect(r.tags).toContain('secrets-scan');
    const summary = r.raw_summary as { finding_count: number; findings: unknown[] };
    expect(summary.finding_count).toBe(0);
    expect(summary.findings).toEqual([]);
  });

  it('returns ok/malicious with redacted findings for a URL with a leaked AWS key', async () => {
    const r = await secrets(
      { type: 'url', value: 'https://attacker.example/log?k=AKIAIOSFODNN7EXAMPLE' },
      env,
      AbortSignal.timeout(1000)
    );
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBeGreaterThan(0);
    expect(r.tags).toContain('secrets-detected');
    expect(r.tags.some((t) => t === 'secret:aws-key')).toBe(true);

    const summary = r.raw_summary as {
      finding_count: number;
      finding_types: string[];
      findings: Array<{ type: string; redacted: string; source: string }>;
    };
    expect(summary.finding_count).toBeGreaterThan(0);
    expect(summary.finding_types).toContain('aws-key');
    const aws = summary.findings.find((f) => f.type === 'aws-key');
    expect(aws).toBeDefined();
    // The live credential value MUST NOT appear on the wire.
    expect(JSON.stringify(summary.findings)).not.toContain('AKIAIOSFODNN7EXAMPLE');
    // 20-char key → AKIA + 12 stars + MPLE.
    expect(aws!.redacted).toMatch(/^AKIA\*+MPLE$/);
    expect(aws!.source).toBe('url_string');
  });

  it('caps the score at 100 even with many findings', async () => {
    const url =
      'https://x.example/?a=AKIAIOSFODNN7EXAMPLE&b=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&c=sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL&d=sk_test_fakeKey00000000000000000000000000';
    const r = await secrets({ type: 'url', value: url }, env, AbortSignal.timeout(1000));
    expect(r.score).toBeLessThanOrEqual(100);
    const summary = r.raw_summary as { finding_count: number };
    expect(summary.finding_count).toBeGreaterThanOrEqual(4);
  });

  it('truncates to at most 10 findings on the wire', async () => {
    // Build a URL with >10 leaked AWS keys. Each key is 20 chars total
    // (AKIA + 16 chars of [A-Z0-9]) to satisfy the regex anchor. We
    // expect exactly 10 surfaced, with the count being the real total.
    const params: string[] = [];
    for (let i = 0; i < 12; i++) {
      params.push(`t${i}=AKIAIOSFODNN${i.toString().padStart(8, '0')}`);
    }
    const r = await secrets(
      { type: 'url', value: `https://x.example/?${params.join('&')}` },
      env,
      AbortSignal.timeout(1000)
    );
    const summary = r.raw_summary as { finding_count: number; findings: unknown[] };
    expect(summary.finding_count).toBeGreaterThanOrEqual(12);
    expect(summary.findings.length).toBeLessThanOrEqual(10);
  });

  it('does not perform any network call (synchronous, timeout-safe)', async () => {
    // Pass a signal that aborts immediately; if the provider tried to
    // fetch, the abort would surface. Since it doesn't, the result
    // must come back ok with no error.
    const ctrl = new AbortController();
    ctrl.abort();
    const r = await secrets({ type: 'url', value: 'https://example.com/' }, env, ctrl.signal);
    expect(r.status).toBe('ok');
  });
});

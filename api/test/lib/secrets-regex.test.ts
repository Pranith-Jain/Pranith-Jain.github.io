import { describe, it, expect } from 'vitest';
import { runSecretScan, redactSecret, SECRET_RULE_TYPES } from '../../src/lib/secrets-regex';

describe('runSecretScan', () => {
  it('returns an empty array for clean text', () => {
    expect(runSecretScan('https://example.com/safe/path')).toEqual([]);
  });

  it('detects an AWS access key in a query string', () => {
    const findings = runSecretScan('https://example.com/?key=AKIAIOSFODNN7EXAMPLE');
    const aws = findings.find((f) => f.type === 'aws-key');
    expect(aws).toBeDefined();
    expect(aws!.snippet).toBe('AKIAIOSFODNN7EXAMPLE');
    // 20-char key → 20-8=12 stars between prefix(4) and suffix(4).
    expect(aws!.redacted).toBe('AKIA************MPLE');
    expect(aws!.source).toBe('url_string');
  });

  it('detects GitHub personal access tokens', () => {
    const findings = runSecretScan('https://api.github.com/?token=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abc');
    const gh = findings.find((f) => f.type === 'github-token');
    expect(gh).toBeDefined();
    expect(gh!.snippet.startsWith('ghp_')).toBe(true);
  });

  it('detects Slack webhooks in a pasted URL', () => {
    const url = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXTEST00000000000TEST';
    const findings = runSecretScan(url);
    const slack = findings.find((f) => f.type === 'slack-webhook');
    expect(slack).toBeDefined();
  });

  it('detects JWTs with three dot-separated base64url segments', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const findings = runSecretScan(`https://x.example/?t=${jwt}`);
    const token = findings.find((f) => f.type === 'jwt-token');
    expect(token).toBeDefined();
    expect(token!.snippet).toBe(jwt);
  });

  it('detects basic-auth credentials embedded in a URL', () => {
    const url = 'https://admin:hunter2@example.com/';
    const findings = runSecretScan(url);
    const basic = findings.find((f) => f.type === 'basic-auth-url');
    expect(basic).toBeDefined();
    expect(basic!.snippet).toBe('hunter2');
    // Length 7 → 7-3=4 stars between prefix(2) and suffix(1) → "hu****2"
    expect(basic!.redacted).toBe('hu****2');
  });

  it('detects database connection strings', () => {
    const findings = runSecretScan('mongodb://user:pass@cluster0.mongodb.net/mydb');
    const db = findings.find((f) => f.type === 'db-connection');
    expect(db).toBeDefined();
  });

  it('detects a credit card number', () => {
    // The regex requires contiguous digits (no spaces/dashes), matching
    // the SCOPTIX original. We feed it the contiguous form.
    const findings = runSecretScan('Card: 4111111111111111');
    const cc = findings.find((f) => f.type === 'credit-card');
    expect(cc).toBeDefined();
  });

  it('detects OpenAI keys', () => {
    const findings = runSecretScan('sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL');
    const oai = findings.find((f) => f.type === 'openai-key');
    expect(oai).toBeDefined();
  });

  it('detects Stripe live keys', () => {
    const findings = runSecretScan('sk_test_fakeKey00000000000000000000000000');
    const stripe = findings.find((f) => f.type === 'stripe-key');
    expect(stripe).toBeDefined();
  });

  it('detects GCP service-account JSON markers', () => {
    const json = '{"type": "service_account", "project_id": "victim-prod"}';
    const findings = runSecretScan(json);
    const gcp = findings.find((f) => f.type === 'gcp-service-account');
    expect(gcp).toBeDefined();
  });

  it('detects a PEM private-key header', () => {
    const findings = runSecretScan('-----BEGIN RSA PRIVATE KEY-----');
    const pk = findings.find((f) => f.type === 'private-key');
    expect(pk).toBeDefined();
  });

  it('does NOT fire generic credential-like on text that already matched a specific rule', () => {
    // The AKIA key in the URL should match `aws-key` (priority 10), not
    // also match the generic `credential-like` (priority 100). Overlap
    // protection kicks in.
    const findings = runSecretScan('https://x.example/?key=AKIAIOSFODNN7EXAMPLE');
    const types = findings.map((f) => f.type);
    expect(types).toContain('aws-key');
    expect(types).not.toContain('credential-like');
  });

  it('redacts by default (redact=false would expose the raw snippet)', () => {
    const a = runSecretScan('AKIAIOSFODNN7EXAMPLE')[0]!;
    expect(a.redacted).not.toBe(a.snippet);
  });

  it('respects the `only` filter', () => {
    const findings = runSecretScan('AKIAIOSFODNN7EXAMPLE', { only: new Set(['jwt-token']) });
    expect(findings).toEqual([]);
    const found = runSecretScan('AKIAIOSFODNN7EXAMPLE', { only: new Set(['aws-key']) });
    expect(found.length).toBe(1);
  });

  it('attaches the configured source label', () => {
    const fromUrl = runSecretScan('AKIAIOSFODNN7EXAMPLE', { source: 'url_string' });
    expect(fromUrl[0]!.source).toBe('url_string');
    const fromBody = runSecretScan('AKIAIOSFODNN7EXAMPLE', { source: 'response_body' });
    expect(fromBody[0]!.source).toBe('response_body');
  });

  it('clips snippets longer than 240 chars', () => {
    // A real JWT shape: two `eyJ` segments around three dot-separated
    // base64url blocks. We stretch the middle block past 240 chars.
    const long = 'eyJ' + 'A'.repeat(20) + '.eyJ' + 'B'.repeat(300) + '.' + 'C'.repeat(20);
    const f = runSecretScan(long)[0]!;
    expect(f).toBeDefined();
    expect(f.snippet.length).toBeLessThanOrEqual(241); // 240 + trailing ellipsis
    expect(f.snippet.endsWith('…')).toBe(true);
  });

  it('exposes the canonical rule-type list', () => {
    expect(SECRET_RULE_TYPES).toContain('aws-key');
    expect(SECRET_RULE_TYPES).toContain('jwt-token');
    expect(SECRET_RULE_TYPES).toContain('github-token');
    expect(SECRET_RULE_TYPES).toContain('private-key');
    expect(new Set(SECRET_RULE_TYPES).size).toBe(SECRET_RULE_TYPES.length); // unique
  });
});

describe('redactSecret', () => {
  it('leaves ≤4 char strings untouched (too short to mask safely)', () => {
    expect(redactSecret('abc')).toBe('abc');
    expect(redactSecret('abcd')).toBe('abcd');
  });

  it('masks 5–8 char strings as prefix(2) + (length-3) stars + suffix(1)', () => {
    // Length 7 → 4 stars; length 7 → prefix(2) + 4 stars + suffix(1) → 7 chars
    expect(redactSecret('hunter2')).toBe('hu****2');
    expect(redactSecret('abcdefg')).toBe('ab****g');
  });

  it('masks >8 char strings as prefix(4) + (length-8) stars + suffix(4)', () => {
    // Length 20 → 12 stars; preserves AKIA prefix and MPLE suffix.
    expect(redactSecret('AKIAIOSFODNN7EXAMPLE')).toBe('AKIA************MPLE');
    // Prefix + 4-char numeric tail, masked.
    expect(redactSecret('super-secret-token-value-1234')).toMatch(/^supe\*+1234$/);
  });
});

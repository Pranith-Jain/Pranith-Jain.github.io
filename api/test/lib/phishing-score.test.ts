import { describe, it, expect } from 'vitest';
import { phishingScore } from '../../src/lib/phishing-score';

describe('phishingScore', () => {
  it('low score for clean email (auth pass + no anomalies)', () => {
    const r = phishingScore({
      headers: { from: 'a@example.com', 'reply-to': 'a@example.com', _received_hops: 2 },
      auth: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      urls: ['https://example.com'],
    });
    expect(r.score).toBeLessThan(30);
    expect(r.verdict).toBe('clean');
  });

  it('high score on auth fail + reply-to mismatch + many URLs', () => {
    const r = phishingScore({
      headers: { from: 'support@bank.com', 'reply-to': 'attacker@evil.ru', _received_hops: 7 },
      auth: { spf: 'fail', dkim: 'fail', dmarc: 'fail' },
      urls: Array.from({ length: 12 }, (_, i) => `https://link-${i}.example`),
    });
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.verdict).toBe('malicious');
    expect(r.flags.length).toBeGreaterThan(0);
  });

  it('flags reply-to domain mismatch', () => {
    const r = phishingScore({
      headers: { from: 'security@apple.com', 'reply-to': 'attacker@bad.com', _received_hops: 2 },
      auth: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      urls: [],
    });
    expect(r.flags.some((f) => f.toLowerCase().includes('reply-to'))).toBe(true);
  });
});

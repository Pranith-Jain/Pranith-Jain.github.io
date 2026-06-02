import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTestApiKey } from '../test-helpers';

afterEach(() => vi.restoreAllMocks());

const SAMPLE = `From: "Bank" <noreply@bank.com>
To: victim@gmail.com
Subject: Urgent: verify your account
Reply-To: attacker@evil.ru
Authentication-Results: mx.gmail.com; spf=fail; dkim=fail; dmarc=fail
Received: from mail (mail [1.2.3.4]) by mx; Mon, 01 Jan 2024 10:00:00 +0000
Date: Mon, 01 Jan 2024 10:00:00 +0000

Click here: https://verify-bank-now.evil.ru/login
`;

describe('POST /api/v1/phishing/analyze', () => {
  it('rejects empty body', async () => {
    const f = await withTestApiKey();
    const r = await f('https://x/api/v1/phishing/analyze', { method: 'POST', body: '' });
    expect(r.status).toBe(400);
  });

  it('analyzes malicious-looking email', async () => {
    // The handler cross-checks extracted URLs against 5 live TI providers
    // (AbortSignal.timeout 8s). With no network in the test env those fetches
    // hang to the timeout and blow the 5s test budget. Make them fail fast —
    // each provider call is already individually .catch()'d, so the verdict
    // falls back to the header/auth heuristic (which flags this SAMPLE).
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline (test)'));
    const f = await withTestApiKey();
    const r = await f('https://x/api/v1/phishing/analyze', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: SAMPLE,
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.headers).toBeDefined();
    expect(body.auth).toBeDefined();
    expect(body.urls).toBeDefined();
    expect(body.score).toBeDefined();
    expect((body as { verdict?: string }).verdict).toMatch(/malicious|suspicious/);
  });

  it('rejects oversize body (>64 KB)', async () => {
    const huge = 'x'.repeat(70000);
    const f = await withTestApiKey();
    const r = await f('https://x/api/v1/phishing/analyze', {
      method: 'POST',
      body: huge,
    });
    expect(r.status).toBe(413);
  });
});

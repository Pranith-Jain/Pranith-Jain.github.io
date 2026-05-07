import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

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
    const r = await SELF.fetch('https://x/api/v1/phishing/analyze', { method: 'POST', body: '' });
    expect(r.status).toBe(400);
  });

  it('analyzes malicious-looking email', async () => {
    const r = await SELF.fetch('https://x/api/v1/phishing/analyze', {
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
    expect((body as any).verdict).toMatch(/malicious|suspicious/);
  });

  it('rejects oversize body (>64 KB)', async () => {
    const huge = 'x'.repeat(70000);
    const r = await SELF.fetch('https://x/api/v1/phishing/analyze', {
      method: 'POST',
      body: huge,
    });
    expect(r.status).toBe(413);
  });
});

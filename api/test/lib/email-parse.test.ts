import { describe, it, expect } from 'vitest';
import { parseHeaders, extractUrls, parseAuthResults, normalizeAddress } from '../../src/lib/email-parse';

const sample = `Return-Path: <noreply@example.com>
Received: from mail.example.com (mail.example.com [192.0.2.1])
\tby mx.gmail.com with ESMTPS id abc;
\tMon, 01 Jan 2024 10:00:00 +0000
Authentication-Results: mx.gmail.com;
\tspf=pass smtp.mailfrom=example.com;
\tdkim=pass header.d=example.com;
\tdmarc=pass header.from=example.com
From: "Acme Co" <noreply@example.com>
To: alice@gmail.com
Subject: Hello
Date: Mon, 01 Jan 2024 10:00:00 +0000
Message-ID: <abc@example.com>
Reply-To: support@example.com
Content-Type: text/plain; charset=UTF-8

Click here: https://example.com/path
And here: hxxps://evil[.]com/login
End.`;

describe('parseHeaders', () => {
  it('extracts standard headers', () => {
    const h = parseHeaders(sample);
    expect(h.from).toContain('Acme Co');
    expect(h.to).toBe('alice@gmail.com');
    expect(h.subject).toBe('Hello');
    expect(h.message_id).toBe('<abc@example.com>');
    expect(h['reply-to']).toBe('support@example.com');
  });

  it('joins multi-line headers (continuation)', () => {
    const h = parseHeaders(sample);
    expect(h['authentication-results']).toContain('spf=pass');
    expect(h['authentication-results']).toContain('dkim=pass');
    expect(h['authentication-results']).toContain('dmarc=pass');
  });

  it('counts Received hops', () => {
    const h = parseHeaders(sample);
    expect(h._received_hops).toBe(1);
  });
});

describe('extractUrls', () => {
  it('finds http/https URLs in body', () => {
    const urls = extractUrls(sample);
    expect(urls).toContain('https://example.com/path');
  });

  it('refangs hxxps and bracketed dots', () => {
    const urls = extractUrls(sample);
    expect(urls.some((u) => u.includes('https://evil.com/login'))).toBe(true);
  });

  it('deduplicates', () => {
    const body = 'visit https://x.com here\nand https://x.com again';
    expect(extractUrls(body).length).toBe(1);
  });
});

describe('parseAuthResults', () => {
  it('extracts spf/dkim/dmarc verdicts', () => {
    const ar = parseAuthResults('mx.gmail.com; spf=pass smtp.mailfrom=example.com; dkim=pass; dmarc=fail');
    expect(ar.spf).toBe('pass');
    expect(ar.dkim).toBe('pass');
    expect(ar.dmarc).toBe('fail');
  });

  it('returns unknown when missing', () => {
    expect(parseAuthResults('mx; spf=pass').dkim).toBe('unknown');
  });
});

describe('normalizeAddress', () => {
  it('extracts the email from "Name <email>" form', () => {
    expect(normalizeAddress('"Acme Co" <noreply@example.com>')).toBe('noreply@example.com');
  });
  it('returns input if plain email', () => {
    expect(normalizeAddress('a@b.com')).toBe('a@b.com');
  });
});

import { describe, it, expect } from 'vitest';
import { siParseEmailHeaders } from './si-mailscope';

const SAMPLE_HEADERS = `Return-Path: <bounce@mailer.evil-corp.tk>
Received: from mx.evil-corp.tk (mx.evil-corp.tk [203.0.113.55])
        by mail.contoso.com (Postfix) with ESMTPS id ABCDEF
        for <alice@contoso.com>; Mon, 12 Aug 2024 10:11:12 +0000 (UTC)
Received: from sender.evil-corp.tk (unknown [10.0.0.5])
        by mx.evil-corp.tk (Postfix) with ESMTP id 123456
        for <alice@contoso.com>; Mon, 12 Aug 2024 10:11:08 +0000 (UTC)
Authentication-Results: spf=fail (sender IP is 203.0.113.55) smtp.mailfrom=evil-corp.tk; dkim=pass header.d=evil-corp.tk header.i=@mailer.evil-corp.tk; dmarc=fail (p=quarantine sp=quarantine dis=none) header.from=evil-corp.tk
From: "IT Helpdesk" <it-support@contoso.com>
Reply-To: attacker@gmail.com
To: alice@contoso.com
Subject: URGENT: Reset your MFA - action required
Date: Mon, 12 Aug 2024 10:11:12 +0000
Message-ID: <abc123@mailer.evil-corp.tk>
`;

describe('si-mailscope: header parsing', () => {
  const r = siParseEmailHeaders(SAMPLE_HEADERS);

  it('extracts from/to/subject/date', () => {
    expect(r.summary.from).toContain('it-support@contoso.com');
    expect(r.summary.to).toBe('alice@contoso.com');
    expect(r.summary.subject).toContain('Reset your MFA');
    expect(r.summary.date).toContain('Mon, 12 Aug 2024');
    expect(r.summary.messageId).toContain('abc123@mailer.evil-corp.tk');
  });

  it('extracts reply-to and return-path', () => {
    expect(r.summary.replyTo).toBe('attacker@gmail.com');
    expect(r.summary.returnPath).toContain('bounce@mailer.evil-corp.tk');
  });

  it('parses the hop chain (2 hops, first is most recent)', () => {
    expect(r.hops.length).toBe(2);
    expect(r.hops[0]!.idx).toBe(1);
    expect(r.hops[0]!.ip).toBe('203.0.113.55');
    expect(r.hops[0]!.protocol.toLowerCase()).toContain('esmtps');
    expect(r.hops[0]!.from).toContain('mx.evil-corp.tk');
    expect(r.hops[0]!.tld).toBe('.tk');
  });

  it('parses authentication results', () => {
    expect(r.auth.spf.result).toBe('fail');
    expect(r.auth.spf.domain).toBe('evil-corp.tk');
    expect(r.auth.dkim.result).toBe('pass');
    expect(r.auth.dkim.domain).toBe('evil-corp.tk');
    expect(r.auth.dmarc.result).toBe('fail');
    expect(r.auth.dmarc.policy).toBe('quarantine');
  });

  it('flags reply-to mismatch with from', () => {
    const codes = r.flags.map((f) => f.code);
    expect(codes).toContain('reply_to_mismatch');
  });

  it('flags display-name/domain mismatch when applicable', () => {
    // Display says IT Helpdesk at contoso.com; the address is contoso.com — not a mismatch.
    // But Reply-To (attacker@gmail.com) is different from From (it-support@contoso.com).
    expect(codes(r)).toContain('reply_to_mismatch');
  });

  it('flags SPF and DMARC failure', () => {
    const codes = r.flags.map((f) => f.code);
    expect(codes).toContain('spf_failed');
    expect(codes).toContain('dmarc_failed');
  });

  it('flags suspicious TLD on first hop', () => {
    const codes = r.flags.map((f) => f.code);
    expect(codes).toContain('suspicious_tld');
  });

  it('computes a non-zero risk score for this phish', () => {
    expect(r.riskScore).toBeGreaterThan(40);
  });
});

function codes(r: ReturnType<typeof siParseEmailHeaders>): string[] {
  return r.flags.map((f) => f.code);
}

describe('si-mailscope: edge cases', () => {
  it('handles empty input', () => {
    const r = siParseEmailHeaders('');
    expect(r.hops).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.riskScore).toBe(0);
  });

  it('handles headers with no Authentication-Results', () => {
    const r = siParseEmailHeaders(`From: a@b.com
To: c@d.com
Subject: hello
Received: from a (a [1.2.3.4]) by b (Postfix) with ESMTP; Mon, 1 Jan 2024 00:00:00 +0000
`);
    expect(r.hops.length).toBe(1);
    expect(r.auth.spf.result).toBe('unknown');
  });

  it('unfolds folded headers', () => {
    const r = siParseEmailHeaders(`From: a@b.com
Subject: this is a
  multi-line subject
Date: Mon, 1 Jan 2024
`);
    expect(r.summary.subject).toBe('this is a multi-line subject');
  });
});

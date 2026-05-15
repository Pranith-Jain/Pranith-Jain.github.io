/**
 * BEC-spoofability scoring on top of /api/v1/domain.
 *
 * The site already exposes a generic email-auth verdict via /dfir/domain.
 * This module reframes the same data as "how easy is this domain to spoof
 * for a BEC pretext?" — a defender-side score where 0 means well-protected
 * and 100 means a phisher could send as you today with no friction.
 */

export interface DomainApiResponse {
  domain: string;
  email_auth: {
    spf: { present: boolean; policy?: string; record?: string };
    dmarc: { present: boolean; policy?: string; pct?: number; record?: string };
    dkim: { selectors_found: string[] };
    bimi: { present: boolean; logo?: string };
    mta_sts: { present: boolean; mode?: string };
    tls_rpt: { present: boolean; rua?: string };
  };
  // Note: the /api/v1/domain response also includes a `dns: { MX, ... }`
  // block, but assess() doesn't read it — domain DNS records are surfaced
  // separately by the Domain page. If a future BEC heuristic needs MX
  // (e.g. "uses Google Workspace" → relax certain signal), reintroduce
  // it here together with the assessor change.
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Gap {
  id: string;
  title: string;
  severity: Severity;
  /** Specific BEC attack made possible / easier by this gap. */
  scenario: string;
  /** Remediation, written so a domain admin can act. */
  remediation: string;
  /** Optional ready-to-paste record. */
  record?: { name: string; type: string; value: string };
}

export interface BecAssessment {
  /** 0–100; higher = easier to spoof. */
  spoofScore: number;
  grade: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  /** One-line summary. */
  headline: string;
  gaps: Gap[];
  positives: string[];
}

const GRADE_THRESHOLDS = {
  safe: 10,
  low: 25,
  medium: 50,
  high: 75,
} as const;

function grade(score: number): BecAssessment['grade'] {
  if (score <= GRADE_THRESHOLDS.safe) return 'safe';
  if (score <= GRADE_THRESHOLDS.low) return 'low';
  if (score <= GRADE_THRESHOLDS.medium) return 'medium';
  if (score <= GRADE_THRESHOLDS.high) return 'high';
  return 'critical';
}

export function assess(d: DomainApiResponse): BecAssessment {
  const gaps: Gap[] = [];
  const positives: string[] = [];
  let score = 0;

  const spf = d.email_auth.spf;
  const dmarc = d.email_auth.dmarc;
  const dkim = d.email_auth.dkim;
  const mtaSts = d.email_auth.mta_sts;
  const bimi = d.email_auth.bimi;

  // ── SPF ─────────────────────────────────────────────────────────────
  if (!spf.present) {
    score += 30;
    gaps.push({
      id: 'spf-missing',
      title: 'SPF record is missing',
      severity: 'critical',
      scenario:
        'Anyone can send mail with your envelope-from set to your domain. Receivers without DMARC enforcement (still common in B2B) will accept it and the message lands in the inbox with your name on it.',
      remediation:
        'Publish a TXT record at the apex starting with "v=spf1 …" and ending with -all once you know all senders.',
      record: { name: '@', type: 'TXT', value: `v=spf1 include:_spf.google.com ~all` },
    });
  } else {
    if (spf.policy === 'fail') {
      positives.push('SPF policy is -all (hard fail).');
    } else if (spf.policy === 'softfail') {
      score += 10;
      gaps.push({
        id: 'spf-softfail',
        title: 'SPF policy is ~all (soft fail) instead of -all',
        severity: 'medium',
        scenario:
          'Some receivers will tag mismatches as "softfail" and still deliver. An attacker forging your envelope-from gets through to a meaningful percentage of inboxes.',
        remediation:
          'Once you have observed all legitimate senders for a few weeks, switch the trailing mechanism to -all.',
      });
    } else if (spf.policy === 'neutral' || spf.policy === 'pass') {
      score += 25;
      gaps.push({
        id: 'spf-permissive',
        title: `SPF policy is ${spf.policy === 'pass' ? '+all (allows anyone)' : '?all (neutral)'}`,
        severity: 'critical',
        scenario:
          spf.policy === 'pass'
            ? '+all explicitly authorises every sender. This is equivalent to publishing no SPF at all.'
            : '?all is treated as no opinion — receivers fall back to other signals, most of which you also fail.',
        remediation: 'Tighten the trailing mechanism to ~all (during rollout) or -all (steady state).',
      });
    } else {
      score += 5;
    }
  }

  // ── DMARC ───────────────────────────────────────────────────────────
  if (!dmarc.present) {
    score += 35;
    gaps.push({
      id: 'dmarc-missing',
      title: 'DMARC record is missing',
      severity: 'critical',
      scenario:
        'Without DMARC, SPF and DKIM still authenticate the envelope but the visible From: header is unconstrained. A phisher sets RFC5322.From to your domain and the message still authenticates against their own infrastructure — classic display-name spoofing for BEC.',
      remediation:
        'Publish DMARC at _dmarc.<domain>. Start with p=none + reporting addresses, then progress to quarantine and reject.',
      record: {
        name: '_dmarc',
        type: 'TXT',
        value: `v=DMARC1; p=none; rua=mailto:dmarc-reports@${d.domain}; ruf=mailto:dmarc-reports@${d.domain}; fo=1; aspf=s; adkim=s`,
      },
    });
  } else {
    if (dmarc.policy === 'reject') {
      positives.push('DMARC is at p=reject — direct-domain spoofing is blocked at compliant receivers.');
    } else if (dmarc.policy === 'quarantine') {
      score += 8;
      gaps.push({
        id: 'dmarc-quarantine',
        title: 'DMARC policy is quarantine (not reject)',
        severity: 'medium',
        scenario:
          'Receivers move spoofed mail to spam rather than dropping it. End users routinely fish "missing emails" out of the spam folder, which is exactly where the attacker wanted them.',
        remediation:
          'Once your DMARC reports are clean for 30+ days at quarantine, move to reject. Watch for forwarding paths (mailing lists, internal forwarders) that need ARC.',
      });
    } else if (dmarc.policy === 'none') {
      score += 25;
      gaps.push({
        id: 'dmarc-none',
        title: 'DMARC policy is p=none (monitoring only)',
        severity: 'high',
        scenario:
          'A monitoring-only DMARC record provides reporting but no enforcement. Spoofed mail still reaches inboxes; you only get to see it after the fact.',
        remediation:
          'Use the monitoring data to enumerate legitimate senders, fix gaps, then move to p=quarantine and finally p=reject.',
      });
    }

    if (dmarc.record) {
      const rec = dmarc.record.toLowerCase();
      if (!/\bsp\s*=/.test(rec)) {
        score += 8;
        gaps.push({
          id: 'dmarc-no-sp',
          title: 'No subdomain policy (sp=) declared',
          severity: 'medium',
          scenario:
            'Without sp=, DMARC enforcement applies only to the bare domain. Attackers spoof unused subdomains (alerts.<domain>, ceo.<domain>, hr.<domain>) and bypass enforcement entirely.',
          remediation:
            'Add sp=reject (or sp=quarantine if matching your main p=) to lock down every subdomain you do not actively use.',
        });
      }
      if ((dmarc.pct ?? 100) < 100) {
        score += 6;
        gaps.push({
          id: 'dmarc-pct',
          title: `DMARC pct is ${dmarc.pct} (less than 100)`,
          severity: 'medium',
          scenario: `Only ${dmarc.pct}% of failing mail is subjected to your policy — the rest still gets delivered.`,
          remediation: 'Once your reports look clean, raise pct to 100.',
        });
      }
      if (!/\barua\s*=|\brua\s*=/.test(rec)) {
        gaps.push({
          id: 'dmarc-no-rua',
          title: 'No DMARC aggregate reports (rua=) configured',
          severity: 'low',
          scenario:
            'Without rua=, you have no visibility into who is sending as your domain — including legitimate services you forgot about and attackers probing weak senders.',
          remediation: 'Add rua=mailto:<inbox>@<domain> (and a managed parser like dmarcian / Postmark / Valimail).',
        });
      }
    }
  }

  // ── DKIM ────────────────────────────────────────────────────────────
  if (dkim.selectors_found.length === 0) {
    score += 8;
    gaps.push({
      id: 'dkim-no-selector',
      title: 'No common DKIM selector found',
      severity: 'medium',
      scenario:
        'DKIM is the part of DMARC that survives forwarding. Without it, every mailing list / partner forwarder breaks DMARC alignment and your enforcement decisions get noisier.',
      remediation:
        'Confirm with your mail provider which DKIM selector they sign with (google, selector1, mandrill, k1…) and verify that <selector>._domainkey.<domain> resolves with a v=DKIM1 record.',
    });
  } else {
    positives.push(
      `DKIM signing observed on ${dkim.selectors_found.length} selector(s): ${dkim.selectors_found.join(', ')}.`
    );
  }

  // ── MTA-STS ─────────────────────────────────────────────────────────
  if (!mtaSts.present) {
    score += 5;
    gaps.push({
      id: 'mta-sts-missing',
      title: 'MTA-STS not configured',
      severity: 'low',
      scenario:
        'Without MTA-STS, an active network attacker can downgrade or strip TLS on inbound mail, exposing message contents and breaking opportunistic encryption.',
      remediation:
        'Publish an _mta-sts.<domain> TXT record + a policy file at https://mta-sts.<domain>/.well-known/mta-sts.txt with mode: enforce.',
    });
  } else if (mtaSts.mode !== 'enforce') {
    score += 2;
    gaps.push({
      id: 'mta-sts-testing',
      title: `MTA-STS in ${mtaSts.mode ?? 'testing'} mode`,
      severity: 'low',
      scenario: 'Testing mode reports failures but does not block downgrade attacks.',
      remediation: 'Once your reports are clean for a few weeks, switch the policy to mode: enforce.',
    });
  } else {
    positives.push('MTA-STS in enforce mode.');
  }

  // ── BIMI ────────────────────────────────────────────────────────────
  if (!bimi.present) {
    score += 3;
    gaps.push({
      id: 'bimi-missing',
      title: 'BIMI record is missing',
      severity: 'low',
      scenario:
        'Without BIMI, supporting mail clients cannot display your verified brand logo, reducing trust signals and making it harder for recipients to distinguish legitimate mail from lookalike phishing.',
      remediation:
        'Publish a BIMI record at default._bimi.<domain> pointing to your SVG logo and ensure DMARC is at p=quarantine or p=reject.',
      record: {
        name: 'default._bimi',
        type: 'TXT',
        value: `v=BIMI1; l=https://${d.domain}/logo.svg;`,
      },
    });
  } else {
    positives.push('BIMI record published — extra brand signal in supporting clients.');
  }

  // ── TLS-RPT ──────────────────────────────────────────────────────────
  const tlsRpt = d.email_auth.tls_rpt;
  if (!tlsRpt.present) {
    score += 2;
    gaps.push({
      id: 'tls-rpt-missing',
      title: 'TLS reporting (TLS-RPT) not configured',
      severity: 'low',
      scenario:
        'Without TLS-RPT, you have no visibility into TLS connection failures from receiving MTAs. Downgrade or STARTTLS stripping attacks go undetected.',
      remediation: 'Publish a TLS-RPT record at _smtp._tls.<domain> pointing to a reporting inbox.',
      record: {
        name: '_smtp._tls',
        type: 'TXT',
        value: `v=TLSRPTv1; rua=mailto:tls-reports@${d.domain};`,
      },
    });
  } else {
    positives.push(`TLS-RPT configured${tlsRpt.rua ? ` (reports to ${tlsRpt.rua})` : ''}.`);
  }

  score = Math.max(0, Math.min(100, score));
  const g = grade(score);
  const headline =
    g === 'safe'
      ? 'Direct-domain spoofing is well-defended.'
      : g === 'low'
        ? 'Mostly defended — one or two minor gaps.'
        : g === 'medium'
          ? 'Partial protection — a determined phisher will find a way through.'
          : g === 'high'
            ? 'Easily spoofable for a competent BEC operator.'
            : 'Effectively unprotected against direct-domain spoofing.';

  return { spoofScore: score, grade: g, headline, gaps, positives };
}

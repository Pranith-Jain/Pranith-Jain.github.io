import type { ParsedHeaders, AuthResults } from './email-parse';
import { normalizeAddress } from './email-parse';

export interface PhishingInputs {
  headers: ParsedHeaders;
  auth: AuthResults;
  urls: string[];
}

export interface PhishingScoreResult {
  score: number; // 0-100
  verdict: 'clean' | 'suspicious' | 'malicious';
  flags: string[];
}

function domainOf(email: string): string | undefined {
  const at = email.indexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : undefined;
}

export function phishingScore(i: PhishingInputs): PhishingScoreResult {
  let score = 0;
  const flags: string[] = [];

  // Authentication
  if (i.auth.spf === 'fail') {
    score += 25;
    flags.push('SPF failed');
  } else if (i.auth.spf === 'softfail') {
    score += 10;
    flags.push('SPF soft-fail');
  }
  if (i.auth.dkim === 'fail') {
    score += 20;
    flags.push('DKIM failed');
  }
  if (i.auth.dmarc === 'fail') {
    score += 25;
    flags.push('DMARC failed');
  }
  if (i.auth.spf === 'unknown' && i.auth.dkim === 'unknown' && i.auth.dmarc === 'unknown') {
    score += 10;
    flags.push('No Authentication-Results header');
  }

  // Reply-to mismatch
  const fromEmail = i.headers.from ? normalizeAddress(String(i.headers.from)) : undefined;
  const replyToEmail = i.headers['reply-to'] ? normalizeAddress(String(i.headers['reply-to'])) : undefined;
  if (fromEmail && replyToEmail) {
    const fromDomain = domainOf(fromEmail);
    const replyDomain = domainOf(replyToEmail);
    if (fromDomain && replyDomain && fromDomain !== replyDomain) {
      score += 20;
      flags.push(`Reply-To domain (${replyDomain}) differs from From domain (${fromDomain})`);
    }
  }

  // Hop anomaly
  const hops = i.headers._received_hops as number;
  if (hops > 8) {
    score += 10;
    flags.push(`Excessive Received hops (${hops})`);
  } else if (hops === 0) {
    score += 5;
    flags.push('No Received headers');
  }

  // URL volume
  if (i.urls.length > 10) {
    score += 15;
    flags.push(`Many URLs (${i.urls.length})`);
  } else if (i.urls.length > 5) {
    score += 8;
    flags.push(`Multiple URLs (${i.urls.length})`);
  }

  score = Math.min(100, score);
  const verdict: PhishingScoreResult['verdict'] = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

  return { score, verdict, flags };
}

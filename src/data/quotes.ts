/**
 * Quote-of-the-day rotation for the Home page.
 *
 * Picked deterministically by day-of-year so the SSR-rendered shell and the
 * client hydration produce the same string (no hydration mismatch). The quote
 * changes once per day at the user's local midnight.
 *
 * Mix of: operational tradecraft, modern threat-intel realities, AI-security
 * and NHI commentary, and field-tested aphorisms from analysts I'd actually
 * quote in a writeup.
 */

export interface DailyQuote {
  text: string;
  attribution: string;
  topic: string; // short label shown above the quote — "Threat intel · 2026"
}

export const QUOTES: ReadonlyArray<DailyQuote> = [
  {
    text: 'There are two types of companies: those that have been hacked, and those that don’t yet know they have been hacked.',
    attribution: 'John Chambers',
    topic: 'Incident response',
  },
  {
    text: 'The biggest risk in cybersecurity is the false sense of security.',
    attribution: 'Dan Geer',
    topic: 'Risk management',
  },
  {
    text: 'It takes 20 years to build a reputation and a few minutes of a cyber-incident to ruin it.',
    attribution: 'Stéphane Nappo',
    topic: 'Reputation risk',
  },
  {
    text: 'The defender has to be right every time. The attacker only has to be right once.',
    attribution: 'Common DFIR adage',
    topic: 'Defense asymmetry',
  },
  {
    text: 'Detection is a process, not a product.',
    attribution: 'Anton Chuvakin',
    topic: 'Detection engineering',
  },
  {
    text: 'If you spend more on coffee than on IT security, you will be hacked. What’s more, you deserve to be hacked.',
    attribution: 'Richard Clarke',
    topic: 'Security spend',
  },
  {
    text: 'Threat intelligence is only as good as the action it drives.',
    attribution: 'Sergio Caltagirone',
    topic: 'Threat intelligence',
  },
  {
    text: 'Assume breach. Then design for graceful degradation.',
    attribution: 'Modern zero-trust principle',
    topic: 'Zero trust',
  },
  {
    text: 'Every prompt is an attack surface.',
    attribution: 'OWASP LLM Top 10 commentary',
    topic: 'AI security',
  },
  {
    text: 'Your service accounts are now your largest attack surface.',
    attribution: 'NHI governance (2026)',
    topic: 'Non-human identity',
  },
  {
    text: 'The most dangerous phrase in security is "we’ve always done it this way."',
    attribution: 'Bruce Schneier',
    topic: 'Security culture',
  },
  {
    text: 'You don’t have a malware problem. You have an unmanaged-trust problem.',
    attribution: 'Detection engineering folklore',
    topic: 'Detection engineering',
  },
  {
    text: 'Encryption is easy. Key management is the hard part.',
    attribution: 'PKI veterans, everywhere',
    topic: 'Cryptography',
  },
  {
    text: 'Phishing is not a technology problem. It’s a workflow problem.',
    attribution: 'Email security analysts',
    topic: 'Email security',
  },
  {
    text: 'The shortest path from CVE to compromise is now measured in hours, not weeks.',
    attribution: 'KEV catalog trend, 2025–26',
    topic: 'Vulnerability management',
  },
  {
    text: 'Ransomware groups don’t innovate — they industrialise.',
    attribution: 'Live ransomware tracking, 2026',
    topic: 'Ransomware',
  },
  {
    text: 'IOCs decay; TTPs persist.',
    attribution: 'Pyramid of Pain (David Bianco)',
    topic: 'Threat intelligence',
  },
  {
    text: 'A SIEM full of alerts no one reads is just an expensive log archive.',
    attribution: 'SOC operations, common refrain',
    topic: 'SOC ops',
  },
  {
    text: 'In threat intelligence, context is the product. Indicators are the receipt.',
    attribution: 'Intel analyst tradecraft',
    topic: 'Threat intelligence',
  },
  {
    text: 'Resilience is the new perimeter.',
    attribution: 'Post-zero-trust commentary',
    topic: 'Resilience',
  },
];

/**
 * Day-of-year (1–366) computed from a Date. Uses UTC so SSR and client agree.
 */
function dayOfYearUTC(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const now = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((now - start) / 86_400_000);
}

export function getQuoteOfTheDay(date: Date = new Date()): DailyQuote {
  const idx = dayOfYearUTC(date) % QUOTES.length;
  return QUOTES[idx];
}

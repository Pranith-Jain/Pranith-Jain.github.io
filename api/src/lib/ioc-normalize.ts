/**
 * IOC normalization, allowlisting, and confidence scoring.
 *
 * This module addresses the most common AI-extraction false positives in
 * threat intel — see ti-mindmap-hub's "Known Limitations" doc:
 *
 *   - Defanged indicators (hxxp://, [.] , { . } ) that regex parsers miss
 *     or store verbatim.
 *   - Documentation / example IPs and domains (RFC 5737, example.com,
 *     test.com, .local, RFC 6762 mDNS, etc.) that should NEVER make it
 *     into a live IOC feed.
 *   - Vendor / well-known infrastructure domains that get mentioned in
 *     reports as "this is what the legitimate service looks like" but
 *     look like malicious indicators to a regex.
 *
 * Every public function is pure and synchronous — safe to call inline
 * from any feed parser or LLM-extraction step.
 */

/* ──────────────────────────── Defang / Refang ─────────────────────── */

/**
 * Reverse common defanging patterns so a regex can pick the indicator up.
 * Order matters: do the URL scheme first (it contains slashes), then the
 * host separators, then any remaining braces.
 *
 * Patterns handled:
 *   hxxp / hxxps / hXXp / HXXP           → http / https
 *   [.] , {.} , (.) , [dot] , (dot)      → .
 *   ://                                   → ://  (already canonical, no-op)
 *   [:]                                   → :
 *   [@]                                   → @
 *   Defanged IPv6 colons handled by the host normalizer, not here.
 */
const DEFANG_SCHEMES: RegExp[] = [/\bhxxps?\b/gi, /\bHXXPS?\b/g];
const DEFANG_DOTS: RegExp[] = [
  /\[\s*\.\s*\]/g,
  /\{\s*\.\s*\}/g,
  /\(\s*\.\s*\)/g,
  /\[\s*dot\s*\]/gi,
  /\(\s*dot\s*\)/gi,
  /\s+dot\s+/gi,
];
const DEFANG_AT: RegExp[] = [/\[\s*@\s*\]/g, /\(\s*@\s*\)/g];
const DEFANG_COLON: RegExp[] = [/\[\s*:\s*\]/g];

export function refang(input: string): string {
  if (!input) return input;
  let s = input;
  for (const re of DEFANG_SCHEMES) s = s.replace(re, (m: string) => m.toLowerCase().replace('xx', 'tt'));
  for (const re of DEFANG_DOTS) s = s.replace(re, '.');
  for (const re of DEFANG_AT) s = s.replace(re, '@');
  for (const re of DEFANG_COLON) s = s.replace(re, ':');
  return s;
}

/**
 * Defang a value for safe rendering in HTML (defangs the inverse direction).
 * Used by the UI to display raw IOCs without making them clickable.
 */
export function defang(input: string): string {
  if (!input) return input;
  return input
    .replace(/^https?:\/\//i, (m) => m.toLowerCase().replace('tt', 'xx'))
    .replace(/\./g, '[.]')
    .replace(/@/g, '[@]');
}

/* ──────────────────────────── Allowlist (benign) ───────────────────── */

/** RFC 5737 documentation ranges (TEST-NET-1/2/3, 192.0.2.x, 198.51.100.x, 203.0.113.x) */
const DOC_IPV4_PREFIXES = ['192.0.2.', '198.51.100.', '203.0.113.'];

/** Loopback, link-local, multicast, reserved. Excluded entirely. */
const PRIVATE_IPV4_PREFIXES = [
  '127.', // loopback
  '0.', // "this network"
  '10.', // RFC 1918
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.2', // catches 172.20-29
  '172.30.',
  '172.31.',
  '192.168.', // RFC 1918
  '169.254.', // link-local
  '224.0.',
  '239.', // multicast
  '255.255.255.255',
];

/** Well-known TLDs that should never appear in a public IOC feed */
const BENIGN_TLDS = new Set([
  'local',
  'localhost',
  'test',
  'invalid',
  'example',
  'reserved',
  // RFC 6762 mDNS
  'internal',
  'private',
  'corp',
  'home',
  'lan',
]);

/** Domains used in documentation / examples (RFC 2606, 6761) and a
 *  short vendor / infrastructure list. The lists are intentionally short
 *  and conservative — false negatives (a real indicator we filter out)
 *  are MUCH worse than false positives (an indicator we let through). */
const BENIGN_DOMAINS = new Set([
  // RFC 2606 / 6761
  'example.com',
  'example.net',
  'example.org',
  'example.io',
  'example',
  'example.test',
  // Common vendor / CDN / cloud that get mentioned in reports as "legit"
  'cloudflare.com',
  'cloudfront.net',
  'amazonaws.com',
  'googleapis.com',
  'gstatic.com',
  'googleusercontent.com',
  'googledomains.com',
  'github.com',
  'githubusercontent.com',
  'github.io',
  'microsoft.com',
  'microsoftonline.com',
  'office.com',
  'office365.com',
  'windows.com',
  'windows.net',
  'azure.com',
  'azureedge.net',
  'akamaiedge.net',
  'akamai.net',
  'akamai.com',
  'edgesuite.net',
  'apple.com',
  'appleid.com',
  'icloud.com',
  'w3.org',
  'iana.org',
  'ieta.org',
  'ietf.org',
  'icann.org',
  'mozilla.org',
  'mozilla.net',
  // Common email / dns providers that look phishy when scraped
  'gmail.com',
  'outlook.com',
  'yahoo.com',
  'hotmail.com',
  'protonmail.com',
  'proton.me',
  'mailgun.org',
  'sendgrid.net',
  'postmarkapp.com',
  // Malware-analysis sandboxes & security vendors — these get scraped as
  // IOCs when a sandbox report shows "this file called out to <vendor>"
  'virustotal.com',
  'urlscan.io',
  'abuseipdb.com',
  'hybrid-analysis.com',
  'any.run',
  'joesandbox.com',
  'tria.ge',
  'cape sandbox.com',
  'capesandbox.com',
  'shodan.io',
  'censys.io',
  'greynoise.io',
  'binaryedge.io',
  // Your own platform's domains — would be embarrassing to flag
  'pranithjain.qzz.io',
  'pranithjain.github.io',
  // ti-mindmap-hub (since we just looked at it)
  'ti-mindmap-hub.com',
]);

/**
 * Heuristic allowlist: is this value a benign / docs / vendor indicator
 * that should never enter a live IOC feed?
 *
 * Returns `{ allow: boolean, reason?: string }` — `allow: true` means
 * the value passes the filter (could still be benign, but not
 * definitely-benign-by-list).
 */
export function isBenign(
  value: string,
  kind: 'ipv4' | 'domain' | 'url' | 'hash' | 'cve' | 'email' | 'unknown'
): { allow: boolean; reason?: string } {
  if (!value) return { allow: false, reason: 'empty' };
  const v = value.trim().toLowerCase();

  if (kind === 'ipv4') {
    for (const p of DOC_IPV4_PREFIXES) {
      if (v.startsWith(p)) return { allow: false, reason: 'rfc5737-documentation' };
    }
    for (const p of PRIVATE_IPV4_PREFIXES) {
      if (v.startsWith(p)) return { allow: false, reason: 'private-reserved' };
    }
    return { allow: true };
  }

  if (kind === 'domain' || kind === 'url') {
    const host = (kind === 'url' ? safeHostname(v) : v).toLowerCase();
    if (!host) return { allow: false, reason: 'unparsable-host' };
    // Strip trailing dot (FQDN canonicalization)
    const h = host.endsWith('.') ? host.slice(0, -1) : host;
    if (BENIGN_DOMAINS.has(h)) return { allow: false, reason: 'vendor-or-docs' };
    const tld = h.split('.').pop() ?? '';
    if (BENIGN_TLDS.has(tld)) return { allow: false, reason: 'benign-tld' };
    // IP-as-host in a URL field — defer to ipv4 check
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isBenign(h, 'ipv4');
    return { allow: true };
  }

  if (kind === 'email') {
    const at = v.lastIndexOf('@');
    if (at < 0) return { allow: false, reason: 'no-at' };
    const domain = v.slice(at + 1);
    return isBenign(domain, 'domain');
  }

  if (kind === 'hash') {
    // A hash that exactly matches a 32-byte all-zero string is obviously
    // a placeholder; same for 0xDEADBEEF style markers.
    if (/^0+$/.test(v)) return { allow: false, reason: 'all-zero-hash' };
    if (/^(0x)?dead+beef+$/i.test(v)) return { allow: false, reason: 'test-marker' };
    return { allow: true };
  }

  if (kind === 'cve') {
    if (!/^cve-\d{4}-\d{4,}$/i.test(v)) return { allow: false, reason: 'malformed-cve' };
    return { allow: true };
  }

  return { allow: true };
}

function safeHostname(url: string): string {
  try {
    // If the value doesn't have a scheme, URL.parse will throw. Prefix
    // a dummy scheme so we can pull the host cleanly.
    const withScheme = /^https?:\/\//i.test(url) ? url : `http://${url}`;
    return new URL(withScheme).hostname;
  } catch {
    return '';
  }
}

/* ──────────────────────────── Confidence scoring ──────────────────── */

/**
 * Heuristic confidence score for an IOC extracted from free text or a
 * feed. Range [0, 1]. NOT a real "is this indicator true" signal — that
 * requires cross-feed corroboration, which the enrichment endpoint
 * already does. This is a "how confident are we that the *extraction*
 * was right and the value is actionable".
 *
 * Heuristics, in rough priority order:
 *   - 0.9  : well-formed value matching a known indicator pattern,
 *            corroborated by context keywords ("C2", "phishing", "payload")
 *   - 0.75 : well-formed value with neutral context
 *   - 0.5  : well-formed value, no context, OR weakly-formed value
 *            with strong context
 *   - 0.25 : weakly-formed value with no context
 *   - 0.0  : didn't survive normalization / allowlist
 *
 * The score is deliberately NOT calibrated for ranking across types —
 * a 0.7 confidence IP is much more "real" than a 0.7 confidence email.
 * The UI shows the score verbatim with a per-type legend.
 */
const CONTEXT_POSITIVE = [
  'c2',
  'c&c',
  'command and control',
  'callback',
  'beacon',
  'exfil',
  'phish',
  'phishing',
  'smish',
  'vish',
  'typosquat',
  'look-alike',
  'payload',
  'dropper',
  'stager',
  'loader',
  'implant',
  'malware',
  'ransomware',
  'stealer',
  'rat',
  'backdoor',
  'trojan',
  'botnet',
  'cobalt strike',
  'cobalt-strike',
  'mimikatz',
  'brute ratel',
  'apt',
  'threat actor',
  'campaign',
  'intrusion',
  'compromise',
  'exploit',
  'cve-',
  'vulnerability',
  'rce',
  'lpe',
  'sqli',
  'ioc',
  'indicator',
  'observed',
  'detected',
  'malicious',
  'suspicious',
  'sinkhole',
  'blocklist',
  'denylist',
  'defang',
];
const CONTEXT_NEGATIVE = [
  'example',
  'placeholder',
  'documentation',
  'sample',
  'demo',
  'test',
  'lorem ipsum',
  'todo',
  'fixme',
  'screenshot',
  'tutorial',
  'wiki',
  'reference',
  'see also',
  'fictional',
];

export interface ConfidenceResult {
  score: number;
  band: 'high' | 'medium' | 'low' | 'rejected';
  reasons: string[];
}

export function scoreConfidence(
  value: string,
  kind: 'ipv4' | 'domain' | 'url' | 'hash' | 'cve' | 'email' | 'unknown',
  context?: string
): ConfidenceResult {
  const reasons: string[] = [];
  let score = 0.5;

  // Kind-specific shape checks bump / drop the base.
  switch (kind) {
    case 'ipv4':
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
        score = 0.75;
        reasons.push('well-formed-ipv4');
      } else {
        score = 0.25;
        reasons.push('malformed-ipv4');
      }
      break;
    case 'domain':
      if (/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value)) {
        score = 0.75;
        reasons.push('well-formed-domain');
      } else {
        score = 0.25;
        reasons.push('malformed-domain');
      }
      break;
    case 'url':
      try {
        const u = new URL(value);
        if (u.hostname && u.protocol === 'http:') {
          score = 0.8;
          reasons.push('well-formed-http-url');
        } else if (u.hostname) {
          score = 0.7;
          reasons.push('well-formed-url-non-http');
        }
      } catch {
        score = 0.2;
        reasons.push('unparsable-url');
      }
      break;
    case 'hash':
      if (/^[a-f0-9]{32}$/i.test(value)) {
        score = 0.8;
        reasons.push('md5');
      } else if (/^[a-f0-9]{40}$/i.test(value)) {
        score = 0.85;
        reasons.push('sha1');
      } else if (/^[a-f0-9]{64}$/i.test(value)) {
        score = 0.9;
        reasons.push('sha256');
      } else if (/^[a-f0-9]{128}$/i.test(value)) {
        score = 0.9;
        reasons.push('sha512');
      } else {
        score = 0.2;
        reasons.push('hash-length-unknown');
      }
      break;
    case 'cve':
      if (/^CVE-\d{4}-\d{4,}$/i.test(value)) {
        score = 0.9;
        reasons.push('well-formed-cve');
      } else {
        score = 0.2;
        reasons.push('malformed-cve');
      }
      break;
    case 'email':
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        score = 0.6;
        reasons.push('well-formed-email');
      } else {
        score = 0.15;
        reasons.push('malformed-email');
      }
      break;
    default:
      score = 0.4;
      reasons.push('unknown-kind');
  }

  // Allowlist vetoes: if isBenign says no, the IOC is a false positive.
  const benign = isBenign(value, kind);
  if (!benign.allow) {
    return { score: 0, band: 'rejected', reasons: [...reasons, `allowlist:${benign.reason}`] };
  }

  // Context nudge (cap to ±0.2).
  if (context) {
    const ctx = context.toLowerCase();
    const positiveHits = CONTEXT_POSITIVE.filter((k) => ctx.includes(k)).length;
    const negativeHits = CONTEXT_NEGATIVE.filter((k) => ctx.includes(k)).length;
    if (positiveHits > 0) {
      const bump = Math.min(0.2, 0.05 * positiveHits);
      score = Math.min(1, score + bump);
      reasons.push(`context+${positiveHits}`);
    }
    if (negativeHits > 0) {
      const drop = Math.min(0.3, 0.1 * negativeHits);
      score = Math.max(0, score - drop);
      reasons.push(`context-${negativeHits}`);
    }
  }

  const band: ConfidenceResult['band'] =
    score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : score >= 0.2 ? 'low' : 'rejected';

  return { score: Math.round(score * 100) / 100, band, reasons };
}

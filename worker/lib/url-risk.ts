/**
 * URL risk correlation — TS port of the IntelX Phishing Intelligence
 * Framework (github.com/Zep11/IntelX-Phishing-Intelligence-Framework, MIT).
 *
 * Two pieces, mirroring the upstream Python modules:
 *   1. `analyzeUrlSignals` — static URL heuristic inspection (upstream
 *      `signals.py`): URL length, `@` symbol, suspicious keywords,
 *      punycode/IDN hosts, URL shorteners, IP hostnames, subdomain bloat,
 *      non-standard ports, plain-HTTP scheme.
 *   2. `calculateUrlRisk` — multi-source evidence correlation (upstream
 *      `Risk_Engine/risk_engine.py`): weighted per-provider scores
 *      (VirusTotal 35 / Google Safe Browsing 30 / URLScan 30 / AbuseIPDB
 *      20 / WHOIS 20, capped at 100), verdict bands, confidence
 *      (coverage 40 + agreement 50 + strength 10), and a readable
 *      evidence chain.
 *
 * Pure module — no Cloudflare bindings — so it runs in the unit tests and
 * is symlinked into the API project (`api/src/lib/url-risk.ts`).
 */

export const SUSPICIOUS_KEYWORDS = [
  'login',
  'verify',
  'secure',
  'account',
  'update',
  'password',
  'signin',
  'payment',
  'banking',
  'wallet',
  'confirm',
] as const;

export const URL_SHORTENERS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'is.gd',
  'ow.ly',
  'buff.ly',
  'cutt.ly',
  'rebrand.ly',
  'shorturl.at',
] as const;

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Provider payloads carrying any of these statuses are treated as unavailable. */
const UNAVAILABLE_STATUSES = new Set([
  'error',
  'no api key',
  'no api-key configured',
  'no domain provided',
  'no ip provided',
  'pending',
  'timeout',
]);

// ────────────────────────────────────────────────────────────────────────
// Static URL signals analysis (upstream signals.py, hardened)
// ────────────────────────────────────────────────────────────────────────

export interface UrlStaticAnalysis {
  /** Lowercased hostname with IPv6 brackets stripped. */
  hostname: string;
  /** Port as explicitly written in the URL, or null when absent. */
  port: number | null;
  scheme: string;
  url_length: number;
  long_url: boolean;
  has_at_symbol: boolean;
  suspicious_keywords: string[];
  punycode: boolean;
  shortener: boolean;
  shortener_name: string | null;
  ip_hostname: boolean;
  subdomain_count: number;
  many_subdomains: boolean;
  non_standard_port: boolean;
  /** Stable machine-readable signal names. */
  flags: string[];
  /** 0–10 heuristic weight of the static signals. */
  static_score: number;
}

/**
 * Static/high-level URL analysis — runs before any external provider
 * call. Faithful port of upstream `signals.py` with null-safe parsing and
 * the upstream punycode bug fixed (upstream checked `"xn--" in domain`
 * via an inverted `in` test; we test hostname inclusion properly).
 */
export function analyzeUrlSignals(raw: string): UrlStaticAnalysis {
  let hostname = '';
  let scheme = 'unknown';
  let port: number | null = null;
  try {
    const u = new URL(raw);
    scheme = u.protocol.replace(/:$/, '');
    if (u.port) port = Number(u.port);
    hostname = u.hostname.toLowerCase();
  } catch {
    // unparseable — still score the raw string heuristics below
  }

  // IPv6 literals arrive bracket-wrapped in `URL.hostname`; strip brackets
  // and never treat hextets as subdomains.
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }
  const isIpv6 = hostname.includes(':');

  const urlLength = raw.length;
  const hasAtSymbol = raw.includes('@');
  const keywords = SUSPICIOUS_KEYWORDS.filter((k) => raw.toLowerCase().includes(k));
  const punycode = hostname.includes('xn--');
  const shortener = URL_SHORTENERS.find((s) => hostname === s || hostname.endsWith(`.${s}`)) ?? null;
  const ipHostname = isIpv6 || IPV4_RE.test(hostname);
  const manySubdomains = !isIpv6 && hostname.split('.').length >= 4;
  const schemeIsHttp = scheme === 'http';
  const nonStandardPort = port !== null && port !== 80 && port !== 443;
  const longUrl = urlLength > 75;

  const flags: string[] = [];
  if (longUrl) flags.push('long-url');
  if (hasAtSymbol) flags.push('at-symbol');
  if (schemeIsHttp) flags.push('http-scheme');
  if (punycode) flags.push('punycode-host');
  if (shortener) flags.push('url-shortener');
  if (ipHostname) flags.push('ip-hostname');
  if (manySubdomains) flags.push('subdomain-bloat');
  if (nonStandardPort) flags.push('nonstandard-port');
  if (keywords.length > 0) flags.push('suspicious-keywords');

  // Heuristic weight, capped at 10. Long URLs, @ symbols, and "verify" are
  // common in legitimate mail too — the cap keeps the static list from
  // saturating the verdict by itself; the engine does the talking.
  let staticScore = 0;
  staticScore += longUrl ? 1 : 0;
  staticScore += hasAtSymbol ? 1 : 0;
  staticScore += schemeIsHttp ? 1 : 0;
  staticScore += punycode ? 2 : 0;
  staticScore += shortener ? 2 : 0;
  staticScore += ipHostname ? 2 : 0;
  staticScore += nonStandardPort ? 1 : 0;
  staticScore += manySubdomains ? 1 : 0;
  staticScore += Math.min(keywords.length, 3);
  staticScore = Math.min(staticScore, 10);

  return {
    hostname,
    port,
    scheme,
    url_length: urlLength,
    long_url: longUrl,
    has_at_symbol: hasAtSymbol,
    suspicious_keywords: keywords,
    punycode,
    shortener: shortener !== null,
    shortener_name: shortener,
    ip_hostname: ipHostname,
    subdomain_count: isIpv6 ? 0 : hostname.split('.').length,
    many_subdomains: manySubdomains,
    non_standard_port: nonStandardPort,
    flags,
    static_score: staticScore,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Risk correlation engine (upstream Risk_Engine/risk_engine.py)
// ────────────────────────────────────────────────────────────────────────

export interface UrlRiskInput {
  /** VirusTotal url report: { malicious, suspicious, total_vendors, threat_names?, targeted_brand? } */
  virustotal?: Record<string, unknown>;
  /** urlscan.io: { verdict?, engines_malicious?, overall_malicious?, brand?, page_domain?, redirects?, domain_age_days? } */
  urlscan?: Record<string, unknown>;
  /** AbuseIPDB: { abuse_confidence, total_reports?, is_tor?, usage_type? } */
  abuseipdb?: Record<string, unknown>;
  /** WHOIS/RDAP: { creation_date?, registrar?, dnssec? } */
  whois?: Record<string, unknown>;
  /** Google Safe Browsing: { detected, matches?: Array<{ threatType }> } */
  google_safe_browsing?: Record<string, unknown>;
}

export type UrlRiskVerdict = 'Critical Risk' | 'High Risk' | 'Suspicious' | 'Low Risk' | 'No Strong Threat Evidence';

export type RiskProviderName = 'virustotal' | 'urlscan' | 'abuseipdb' | 'whois' | 'google_safe_browsing';

export interface UrlRiskResult {
  risk_score: number;
  verdict: UrlRiskVerdict;
  confidence: number;
  recommendation: string;
  evidence: string[];
  positive_findings: string[];
  informational_findings: string[];
  provider_status: Record<RiskProviderName, boolean>;
  score_breakdown: Record<RiskProviderName, number>;
  domain_age_days: number | null;
}

function safeInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toDict(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function firstValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : undefined;
  return value;
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/**
 * Parse common WHOIS/RDAP date formats into a Date (UTC). Returns null
 * when the value cannot be understood. Naive (TZ-less) dates are treated
 * as UTC, matching upstream's `tzinfo=timezone.utc` normalization.
 */
function parseDate(value: unknown): Date | null {
  const first = firstValue(value);
  if (first === undefined || first === null) return null;
  if (typeof first !== 'string' && typeof first !== 'number') return null;

  const text = String(first).trim();
  if (!text) return null;

  // Handle the formats upstream's strptime list covers:
  // "%Y-%m-%d %H:%M:%S", ISO-8601 with T/Z/offset, "%Y-%m-%d",
  // "%d-%b-%Y", "%Y.%m.%d".
  const dotted = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(text);
  if (dotted) {
    const iso = `${dotted[1]}-${dotted[2]}-${dotted[3]}`;
    return new Date(`${iso}T00:00:00Z`);
  }

  const named = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text);
  if (named) {
    const month = MONTHS[named[2]!.toLowerCase()] ?? '01';
    const day = named[1]!.padStart(2, '0');
    return new Date(`${named[3]}-${month}-${day}T00:00:00Z`);
  }

  const ts = Date.parse(text);
  if (Number.isNaN(ts)) return null;

  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeAgeInDays(createdAt: unknown, now: Date = new Date()): number | null {
  const parsed = parseDate(createdAt);
  if (!parsed) return null;
  const ms = now.getTime() - parsed.getTime();
  return Math.max(Math.floor(ms / 86_400_000), 0);
}

/** Always-available object check mirroring upstream `_provider_available`. */
function providerAvailable(payload: Record<string, unknown>): boolean {
  if (!payload || Object.keys(payload).length === 0) return false;
  const status = String(payload['status'] ?? '')
    .trim()
    .toLowerCase();
  return !UNAVAILABLE_STATUSES.has(status);
}

/**
 * Correlate parsed results from all threat-intelligence providers and
 * produce the final assessment. Faithful port of upstream
 * `calculate_risk()` — score bands, verdict thresholds, confidence
 * formula and evidence strings carried over 1:1 so hand-computed results
 * match.
 */
export function calculateUrlRisk(input: UrlRiskInput = {}): UrlRiskResult {
  const vt = toDict(input.virustotal);
  const us = toDict(input.urlscan);
  const ab = toDict(input.abuseipdb);
  const wi = toDict(input.whois);
  const gs = toDict(input.google_safe_browsing);

  let riskScore = 0;
  const evidence: string[] = [];
  const positiveFindings: string[] = [];
  const informationalFindings: string[] = [];

  const scoreBreakdown: Record<RiskProviderName, number> = {
    virustotal: 0,
    urlscan: 0,
    abuseipdb: 0,
    whois: 0,
    google_safe_browsing: 0,
  };

  const providerStatus: Record<RiskProviderName, boolean> = {
    virustotal: providerAvailable(vt),
    urlscan: providerAvailable(us),
    abuseipdb: providerAvailable(ab),
    whois: providerAvailable(wi),
    google_safe_browsing: providerAvailable(gs),
  };

  // ── VirusTotal — max 35 points ──────────────────────────────────────
  const vtMalicious = safeInt(vt.malicious);
  const vtSuspicious = safeInt(vt.suspicious);
  const vtDetected = vtMalicious + vtSuspicious;
  const vtTotal = safeInt(vt.total_vendors);

  let points = 0;
  if (vtMalicious >= 20) points = 35;
  else if (vtMalicious >= 10) points = 30;
  else if (vtMalicious >= 5) points = 22;
  else if (vtMalicious >= 1) points = 12;
  else if (vtSuspicious >= 1) points = 7;

  if (points > 0) {
    riskScore += points;
    scoreBreakdown.virustotal += points;
    const ratio = vtTotal ? `${vtDetected}/${vtTotal}` : String(vtDetected);
    evidence.push(
      `+${points} VirusTotal: detection ratio ${ratio}; ${vtMalicious} malicious and ${vtSuspicious} suspicious classifications.`
    );
    positiveFindings.push(`VirusTotal identified ${vtMalicious} malicious and ${vtSuspicious} suspicious detections.`);
  } else if (providerStatus.virustotal) {
    informationalFindings.push('VirusTotal did not report malicious or suspicious detections.');
  }

  const threatNames = Array.isArray(vt.threat_names) ? vt.threat_names.map(String) : [];
  if (threatNames.length > 0) {
    informationalFindings.push(`VirusTotal threat names: ${threatNames.join(', ')}.`);
  }
  const targetedBrand = vt.targeted_brand;
  if (targetedBrand !== undefined && targetedBrand !== null && targetedBrand !== '') {
    informationalFindings.push(`VirusTotal targeted-brand information: ${String(targetedBrand)}.`);
  }

  // ── Google Safe Browsing — max 30 points ────────────────────────────
  if (gs.detected === true) {
    const matches = Array.isArray(gs.matches)
      ? (gs.matches.filter(
          (m): m is Record<string, unknown> => !!m && typeof m === 'object' && !Array.isArray(m)
        ) as Array<Record<string, unknown>>)
      : [];
    const threatTypes = [
      ...new Set(
        matches
          .map((m) => String(m.threatType ?? m.threat_type ?? ''))
          .filter((t) => t.length > 0)
          .sort()
      ),
    ];
    const description = threatTypes.length > 0 ? threatTypes.join(', ') : 'a Google threat list';
    const pts = 30;
    riskScore += pts;
    scoreBreakdown.google_safe_browsing += pts;
    evidence.push(`+${pts} Google Safe Browsing: URL matched ${description}.`);
    positiveFindings.push('Google Safe Browsing listed the URL as unsafe.');
  } else if (providerStatus.google_safe_browsing) {
    informationalFindings.push('Google Safe Browsing returned no threat-list match.');
  }

  // ── URLScan — max 30 points ─────────────────────────────────────────
  const usVerdict = String(us.verdict ?? '')
    .trim()
    .toLowerCase();
  if (usVerdict === 'malicious' || us.engines_malicious === true || us.overall_malicious === true) {
    const pts = 22;
    riskScore += pts;
    scoreBreakdown.urlscan += pts;
    evidence.push(`+${pts} URLScan: browser analysis classified the page as malicious.`);
    positiveFindings.push('URLScan dynamic analysis produced a malicious verdict.');
  }

  const brand = us.brand;
  if (typeof brand === 'string' && brand.trim() !== '') {
    const brandText = brand.trim();
    const normalizedBrand = brandText.toLowerCase().replace(/\s+/g, '');
    const pageDomain = String(us.page_domain ?? '').toLowerCase();
    // Only score brand impersonation when the brand does not appear to
    // match the investigated domain.
    if (normalizedBrand && !pageDomain.replace(/\./g, '').includes(normalizedBrand)) {
      const pts = 5;
      riskScore += pts;
      scoreBreakdown.urlscan += pts;
      evidence.push(`+${pts} URLScan: possible brand impersonation detected (${brandText}).`);
      positiveFindings.push(`Possible brand impersonation: ${brandText}.`);
    } else {
      informationalFindings.push(`URLScan identified the visible brand as ${brandText}.`);
    }
  }

  const redirects = Array.isArray(us.redirects) ? us.redirects : [];
  if (redirects.length >= 4) {
    const pts = 3;
    riskScore += pts;
    scoreBreakdown.urlscan += pts;
    evidence.push(`+${pts} URLScan: ${redirects.length} redirects were observed.`);
  }

  const usAgeRaw = us.domain_age_days;
  if (usAgeRaw !== undefined && usAgeRaw !== null) {
    const usAge = safeInt(usAgeRaw);
    if (usAge >= 0 && usAge <= 30) {
      const pts = 5;
      riskScore += pts;
      scoreBreakdown.urlscan += pts;
      evidence.push(`+${pts} URLScan: domain age is approximately ${usAge} days.`);
    }
  }

  // ── AbuseIPDB — max 20 points ───────────────────────────────────────
  const abuseScore = safeInt(ab.abuse_confidence);
  const totalReports = safeInt(ab.total_reports);

  let abusePts = 0;
  if (abuseScore >= 75) abusePts = 18;
  else if (abuseScore >= 50) abusePts = 13;
  else if (abuseScore >= 25) abusePts = 8;
  else if (abuseScore > 0) abusePts = 3;

  if (abusePts > 0) {
    riskScore += abusePts;
    scoreBreakdown.abuseipdb += abusePts;
    evidence.push(`+${abusePts} AbuseIPDB: IP abuse-confidence score is ${abuseScore}% with ${totalReports} reports.`);
    positiveFindings.push(`AbuseIPDB reported an abuse-confidence score of ${abuseScore}%.`);
  }

  if (ab.is_tor === true) {
    riskScore += 2;
    scoreBreakdown.abuseipdb += 2;
    evidence.push('+2 AbuseIPDB: IP is associated with a TOR exit node.');
    positiveFindings.push('The investigated IP is associated with a TOR exit node.');
  }

  const usageType = String(ab.usage_type ?? '').toLowerCase();
  if (usageType.includes('content delivery') || usageType.includes('cdn')) {
    informationalFindings.push(
      'The checked IP belongs to a CDN or reverse-proxy provider; a low IP-reputation score may not represent the hidden origin server.'
    );
  } else if (providerStatus.abuseipdb && abuseScore === 0) {
    informationalFindings.push('AbuseIPDB reported no recent abuse confidence for the checked IP.');
  }

  // ── WHOIS — max 20 points ───────────────────────────────────────────
  const domainAgeDays = computeAgeInDays(wi.creation_date ?? wi.created);
  if (domainAgeDays !== null) {
    let whoisPts = 0;
    if (domainAgeDays <= 7) whoisPts = 20;
    else if (domainAgeDays <= 30) whoisPts = 15;
    else if (domainAgeDays <= 90) whoisPts = 10;
    else if (domainAgeDays <= 180) whoisPts = 5;

    if (whoisPts > 0) {
      riskScore += whoisPts;
      scoreBreakdown.whois += whoisPts;
      evidence.push(`+${whoisPts} WHOIS: domain is approximately ${domainAgeDays} days old.`);
      positiveFindings.push(`The domain was registered approximately ${domainAgeDays} days ago.`);
    } else {
      informationalFindings.push(`WHOIS domain age is approximately ${domainAgeDays} days.`);
    }
  } else if (providerStatus.whois) {
    informationalFindings.push('WHOIS domain creation date was unavailable or could not be parsed.');
  }

  const registrar = wi.registrar;
  if (typeof registrar === 'string' && registrar.trim() !== '') {
    informationalFindings.push(`WHOIS registrar: ${registrar}.`);
  }

  const dnssec = String(wi.dnssec ?? '').toLowerCase();
  if (['unsigned', 'false', 'no', 'none'].includes(dnssec)) {
    informationalFindings.push('WHOIS indicates that DNSSEC is not enabled.');
  }

  // ── Final score, verdict and recommendation ─────────────────────────
  riskScore = Math.min(riskScore, 100);

  let verdict: UrlRiskVerdict;
  let recommendation: string;
  if (riskScore >= 80) {
    verdict = 'Critical Risk';
    recommendation =
      'Block the URL immediately, isolate affected systems, reset exposed credentials, and begin incident-response procedures.';
  } else if (riskScore >= 60) {
    verdict = 'High Risk';
    recommendation = 'Block or quarantine the URL and perform immediate analyst review.';
  } else if (riskScore >= 35) {
    verdict = 'Suspicious';
    recommendation = 'Do not trust the URL until it has been manually reviewed.';
  } else if (riskScore >= 15) {
    verdict = 'Low Risk';
    recommendation = 'Use caution and continue monitoring for new threat intelligence.';
  } else {
    verdict = 'No Strong Threat Evidence';
    recommendation = 'No strong evidence was found, but this does not guarantee that the URL is safe.';
  }

  // ── Confidence: coverage (40) + agreement (50) + strength (10) ──────
  const availableCount = Object.values(providerStatus).filter(Boolean).length;
  const supportingCount = Object.values(scoreBreakdown).filter((v) => v > 0).length;

  let confidence = 0;
  if (availableCount > 0) {
    const coverageScore = (availableCount / 5) * 40;
    const agreementScore = (supportingCount / availableCount) * 50;
    const strengthScore = Math.min(riskScore, 100) * 0.1;
    confidence = Math.max(0, Math.min(100, Math.round(coverageScore + agreementScore + strengthScore)));
  }

  if (evidence.length === 0) {
    evidence.push('No provider contributed a positive risk-scoring indicator.');
  }

  return {
    risk_score: riskScore,
    verdict,
    confidence,
    recommendation,
    evidence,
    positive_findings: positiveFindings,
    informational_findings: informationalFindings,
    provider_status: providerStatus,
    score_breakdown: scoreBreakdown,
    domain_age_days: domainAgeDays,
  };
}

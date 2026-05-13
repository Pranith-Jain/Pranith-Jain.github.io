/**
 * Threat briefing builder.
 *
 * Aggregates CISA KEV + NVD + abuse.ch over a time window, categorises
 * findings, and produces a structured briefing object. Stored in KV under
 *   briefing:daily:YYYY-MM-DD
 *   briefing:weekly:YYYY-Www
 *
 * Narrative is templated — no LLM. Source data already contains the descriptions;
 * we format and group, we don't invent.
 */

import { FEED_SOURCES, UNCAPPED, buildSummary, type IocEntry, type SourceId } from './ioc-feed-parsers';

const NVD_UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';
const NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const KEV_FEED = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

// ---- types --------------------------------------------------------------

export type BriefingType = 'daily' | 'weekly';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export interface BriefingFinding {
  id: string; // CVE-XXXX-NNNN or feed-derived id
  title: string;
  description: string;
  severity: Severity;
  cvss?: number;
  cwes?: string[];
  source: string;
  source_url?: string;
  mitre_techniques: string[];
  added?: string;
  vendor?: string;
  product?: string;
  /**
   * Auto-extracted tags. Populated lazily on read by routes/briefings.ts via
   * lib/briefing-tags.ts — not stored in KV. Frontend uses these to render
   * filter pills on the briefing detail page.
   */
  tags?: {
    cves: string[];
    actors: Array<{ slug: string; mitre_id?: string }>;
    sectors: string[];
  };
}

export interface BriefingSection {
  id: string;
  title: string;
  count: number;
  blurb: string;
  findings: BriefingFinding[];
}

export interface BriefingIocBuckets {
  urls: IocEntry[];
  domains: IocEntry[];
  ipv4s: IocEntry[];
  hashes: IocEntry[];
}

export interface BriefingStats {
  findings: number;
  sections: number;
  cves: number;
  kevs: number;
  iocs: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface Briefing {
  slug: string;
  type: BriefingType;
  title: string;
  date: string; // ISO YYYY-MM-DD (the briefing date — anchor)
  date_range: string; // human display
  range_start: string; // ISO YYYY-MM-DD
  range_end: string; // ISO YYYY-MM-DD (exclusive)
  generated_at: string;
  executive_summary: string;
  stats: BriefingStats;
  sections: BriefingSection[];
  iocs: BriefingIocBuckets;
  mitre_techniques: string[];
  sources: string[];
}

interface KevEntry {
  cveID: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  dateAdded: string;
  shortDescription?: string;
  requiredAction?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
  notes?: string;
}

interface KevDoc {
  vulnerabilities: KevEntry[];
}

interface NvdCvssMetric {
  cvssData: { baseScore: number; baseSeverity?: string };
}

interface NvdCve {
  id: string;
  descriptions?: Array<{ lang: string; value: string }>;
  metrics?: {
    cvssMetricV31?: NvdCvssMetric[];
    cvssMetricV30?: NvdCvssMetric[];
    cvssMetricV2?: NvdCvssMetric[];
  };
  weaknesses?: Array<{
    description?: Array<{ lang: string; value: string }>;
  }>;
}

interface NvdResponse {
  vulnerabilities?: Array<{ cve: NvdCve }>;
}

// ---- categorisation -----------------------------------------------------

interface CategoryRule {
  id: string;
  title: string;
  blurb: string;
  cwes?: string[]; // matched first (deterministic from NVD)
  match?: RegExp; // fallback keyword match in title/description
}

// Order matters — first match wins. CWE matches take precedence over keyword matches per rule.
const CATEGORY_RULES: CategoryRule[] = [
  {
    id: 'rce',
    title: 'Critical Remote Code Execution Vulnerabilities',
    blurb: 'Vulnerabilities allowing arbitrary code execution on affected systems — patch immediately.',
    cwes: ['CWE-94', 'CWE-913', 'CWE-1336'],
    match:
      /\b(remote code execution|\bRCE\b|arbitrary code execution|unauthenticated code execution|pre-?auth(?:entication)? rce|code injection|template injection|expression language injection)\b/i,
  },
  {
    id: 'command-injection',
    title: 'Command Injection',
    blurb: 'OS / shell command injection enabling attacker-controlled execution.',
    cwes: ['CWE-77', 'CWE-78', 'CWE-88'],
    match: /\b(command injection|os command|shell injection|argument injection|special elements used in a command)\b/i,
  },
  {
    id: 'auth-bypass',
    title: 'Authentication & Authorization Bypass',
    blurb: 'Missing or broken authentication / authorisation enabling unauthorised actions.',
    cwes: [
      'CWE-287',
      'CWE-288',
      'CWE-289',
      'CWE-290',
      'CWE-294',
      'CWE-303',
      'CWE-304',
      'CWE-305',
      'CWE-306',
      'CWE-862',
      'CWE-863',
      'CWE-639',
    ],
    match:
      /\b(authentication bypass|auth(?:orisation| bypass)|missing authorization|missing authentication|improper access control|insecure direct object reference|broken access control|IDOR)\b/i,
  },
  {
    id: 'privesc',
    title: 'Privilege Escalation',
    blurb: 'Vulnerabilities enabling escalation to higher privileges.',
    cwes: ['CWE-269', 'CWE-250', 'CWE-272', 'CWE-273'],
    match:
      /\b(privilege escalation|priv(?:ilege)? esc|elevation of privilege|escalate privileges|incorrect privilege assignment)\b/i,
  },
  {
    id: 'sql-injection',
    title: 'SQL & NoSQL Injection',
    blurb: 'Database injection vulnerabilities exposing or modifying stored data.',
    cwes: ['CWE-89', 'CWE-943'],
    match: /\b(sql injection|sqli|nosql injection|blind sql|database injection)\b/i,
  },
  {
    id: 'xss',
    title: 'Cross-Site Scripting',
    blurb: 'Reflected, stored, or DOM-based XSS in web applications.',
    cwes: ['CWE-79', 'CWE-80', 'CWE-83', 'CWE-87'],
    match: /\b(cross-?site scripting|\bXSS\b|stored xss|reflected xss|html injection)\b/i,
  },
  {
    id: 'memory-corruption',
    title: 'Memory Corruption',
    blurb: 'Buffer overflows, use-after-free, type confusion enabling crashes or RCE.',
    cwes: [
      'CWE-119',
      'CWE-120',
      'CWE-121',
      'CWE-122',
      'CWE-125',
      'CWE-787',
      'CWE-415',
      'CWE-416',
      'CWE-476',
      'CWE-843',
      'CWE-190',
      'CWE-191',
      'CWE-200',
      'CWE-787',
    ],
    match:
      /\b(buffer overflow|heap overflow|stack overflow|use-after-free|use after free|type confusion|out-of-bounds (read|write)|double free|integer overflow|null pointer dereference)\b/i,
  },
  {
    id: 'deserialization',
    title: 'Insecure Deserialization',
    blurb: 'Unsafe deserialization of attacker-controlled data leading to RCE.',
    cwes: ['CWE-502'],
    match: /\b(deserialization|deserialisation|insecure (un|de)?serialization|unsafe object creation)\b/i,
  },
  {
    id: 'path-traversal',
    title: 'Path Traversal & File Disclosure',
    blurb: 'Directory traversal and arbitrary file read/write vulnerabilities.',
    cwes: [
      'CWE-22',
      'CWE-23',
      'CWE-24',
      'CWE-25',
      'CWE-26',
      'CWE-27',
      'CWE-28',
      'CWE-29',
      'CWE-30',
      'CWE-31',
      'CWE-32',
      'CWE-33',
      'CWE-34',
      'CWE-35',
      'CWE-36',
      'CWE-37',
      'CWE-38',
      'CWE-39',
      'CWE-40',
      'CWE-41',
      'CWE-73',
      'CWE-98',
    ],
    match:
      /\b(path traversal|directory traversal|arbitrary file (read|write|disclosure|upload|delete)|local file inclusion|remote file inclusion|\bLFI\b|\bRFI\b)\b/i,
  },
  {
    id: 'ssrf-csrf',
    title: 'SSRF, CSRF & Open Redirect',
    blurb: 'Server-side request forgery, cross-site request forgery, and redirect issues.',
    cwes: ['CWE-352', 'CWE-918', 'CWE-601'],
    match:
      /\b(server-?side request forgery|\bSSRF\b|cross-?site request forgery|\bCSRF\b|open redirect|url redirect)\b/i,
  },
  {
    id: 'crypto',
    title: 'Cryptographic Weaknesses',
    blurb: 'Broken cryptography, weak hashes, or insecure key management.',
    cwes: [
      'CWE-310',
      'CWE-326',
      'CWE-327',
      'CWE-328',
      'CWE-329',
      'CWE-330',
      'CWE-331',
      'CWE-335',
      'CWE-340',
      'CWE-916',
      'CWE-321',
    ],
    match:
      /\b(weak (cryptography|cipher|hash)|broken (cryptography|encryption)|insecure (random|prng)|hardcoded (key|password|credentials)|use of (hard-?coded )?credentials)\b/i,
  },
  {
    id: 'info-disclosure',
    title: 'Information Disclosure',
    blurb: 'Exposure of sensitive information through error messages, logs, or responses.',
    cwes: ['CWE-200', 'CWE-201', 'CWE-209', 'CWE-532', 'CWE-538', 'CWE-548'],
    match: /\b(information (disclosure|exposure|leak)|sensitive data exposure|verbose error|debug (output|info))\b/i,
  },
  {
    id: 'dos',
    title: 'Denial of Service',
    blurb: 'Vulnerabilities causing service disruption, resource exhaustion, or crashes.',
    cwes: ['CWE-400', 'CWE-401', 'CWE-770', 'CWE-834', 'CWE-835', 'CWE-674', 'CWE-1325'],
    match:
      /\b(denial of service|\bDoS\b|resource exhaustion|infinite loop|stack overflow loop|uncontrolled recursion)\b/i,
  },
  {
    id: 'iot-network',
    title: 'Network Infrastructure & IoT Device Vulnerabilities',
    blurb: 'Vulnerabilities in routers, firewalls, and IoT devices on the network edge.',
    match:
      /\b(router|firewall|edge gateway|VPN gateway|gateway appliance|D-Link|TP-Link|Netgear|Tenda|Cisco|Juniper|Fortinet|Palo Alto|SonicWall|MikroTik|IoT|embedded device|firmware)\b/i,
  },
  {
    id: 'browser',
    title: 'Browser & Application Memory Corruption',
    blurb: 'Memory-corruption vulnerabilities specific to browsers and rendering engines.',
    match:
      /\b(Chrome|Chromium|Firefox|Safari|WebKit|Blink|Gecko|V8|JavaScriptCore|browser)\b.*\b(memory|corruption|use-after-free|type confusion)\b/i,
  },
  {
    id: 'social-eng',
    title: 'Social Engineering & Phishing',
    blurb: 'Active phishing campaigns, lures, and social-engineering tradecraft.',
    match: /\b(phish(ing)?|social engineering|impersonation lure|smishing|quishing)\b/i,
  },
];

// Severity-only fallbacks — used when no specific category matches but we still want a meaningful bucket.
const SEVERITY_CATEGORIES: Record<Severity, { id: string; title: string; blurb: string } | null> = {
  critical: {
    id: 'critical-other',
    title: 'Critical-Severity Vulnerabilities',
    blurb: 'Critical-severity issues that did not fit a more specific category — review urgently.',
  },
  high: {
    id: 'high-other',
    title: 'High-Severity Vulnerabilities',
    blurb: 'High-severity vulnerabilities across miscellaneous products and services.',
  },
  medium: {
    id: 'medium-other',
    title: 'Medium-Severity Vulnerabilities',
    blurb: 'Medium-severity issues across miscellaneous products and services.',
  },
  low: {
    id: 'low-other',
    title: 'Low-Severity Vulnerabilities',
    blurb: 'Low-severity issues across miscellaneous products and services.',
  },
  unknown: null,
};

const FALLBACK_CATEGORY = {
  id: 'other',
  title: 'Other Vulnerabilities',
  blurb: 'Additional vulnerabilities observed across products and services.',
};

// Naive CVE→MITRE technique mapping by description keywords. Imperfect but useful.
const MITRE_RULES: Array<{ pattern: RegExp; technique: string }> = [
  { pattern: /\b(remote code execution|\bRCE\b|arbitrary code|public-?facing|exploit public)\b/i, technique: 'T1190' },
  { pattern: /\b(command injection|os command)\b/i, technique: 'T1059' },
  { pattern: /\b(privilege escalation|elevation of privilege)\b/i, technique: 'T1068' },
  { pattern: /\b(authentication bypass|missing authentication)\b/i, technique: 'T1078' },
  { pattern: /\b(deserialization|insecure deserialization)\b/i, technique: 'T1059.007' },
  { pattern: /\b(buffer overflow|memory corruption)\b/i, technique: 'T1203' },
  { pattern: /\b(sql injection)\b/i, technique: 'T1190' },
  { pattern: /\b(cross-?site scripting|\bxss\b)\b/i, technique: 'T1059.007' },
  { pattern: /\bphishing\b/i, technique: 'T1566' },
  { pattern: /\bbotnet\b/i, technique: 'T1583.005' },
];

function severityFromCvss(score: number | undefined): Severity {
  if (score === undefined) return 'unknown';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  return 'low';
}

function extractCwes(nvd: NvdCve | undefined): string[] {
  if (!nvd?.weaknesses) return [];
  const out = new Set<string>();
  for (const w of nvd.weaknesses) {
    for (const d of w.description ?? []) {
      const m = /CWE-\d+/i.exec(d.value);
      if (m) out.add(m[0].toUpperCase());
    }
  }
  return Array.from(out);
}

function categorizeFinding(args: { title: string; description: string; severity: Severity; cwes: string[] }) {
  const haystack = `${args.title} ${args.description}`;
  // 1. CWE-based match (deterministic from NVD)
  if (args.cwes.length > 0) {
    for (const rule of CATEGORY_RULES) {
      if (!rule.cwes) continue;
      if (rule.cwes.some((c) => args.cwes.includes(c))) return rule;
    }
  }
  // 2. Keyword-based match (broader keyword regex coverage)
  for (const rule of CATEGORY_RULES) {
    if (rule.match && rule.match.test(haystack)) return rule;
  }
  // 3. Severity-only fallback (so Critical/High/Medium CVEs don't end up in "Other")
  const sevBucket = SEVERITY_CATEGORIES[args.severity];
  if (sevBucket) return sevBucket;
  return FALLBACK_CATEGORY;
}

function deriveMitreTechniques(description: string): string[] {
  const found = new Set<string>();
  for (const r of MITRE_RULES) if (r.pattern.test(description)) found.add(r.technique);
  return Array.from(found);
}

// ---- date helpers -------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoYearWeek(d: Date): string {
  // ISO 8601 week year
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function startOfIsoWeek(d: Date): Date {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (day - 1));
  return dt;
}

// ---- fetchers -----------------------------------------------------------

async function fetchKev(): Promise<KevEntry[]> {
  const res = await fetch(KEV_FEED, {
    headers: { 'user-agent': NVD_UA, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
    cf: { cacheTtlByStatus: { '200-299': 1800, '400-599': 0 }, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`KEV fetch failed: ${res.status}`);
  const doc = (await res.json()) as KevDoc;
  return doc.vulnerabilities ?? [];
}

/**
 * Fetch every NVD CVE published within [start, end). Used to back-fill findings
 * on days when CISA didn't add anything to KEV. The NVD API supports an
 * extended ISO-8601 timestamp with explicit offset (no Z suffix) for the
 * `pubStartDate` / `pubEndDate` params, and returns up to 2000 entries per
 * page. We page until exhausted, with a hard cap so a runaway pagination
 * loop can't blow the briefing budget.
 */
async function fetchNvdRecent(start: Date, end: Date): Promise<NvdCve[]> {
  const fmt = (d: Date) => d.toISOString().replace(/Z$/, '+00:00');
  const out: NvdCve[] = [];
  const PAGE = 2000;
  const HARD_CAP = 4000; // 2 pages — enough headroom for any 7-day window
  let startIndex = 0;
  for (let i = 0; i < 4 && out.length < HARD_CAP; i++) {
    const url =
      `${NVD_API}?pubStartDate=${encodeURIComponent(fmt(start))}` +
      `&pubEndDate=${encodeURIComponent(fmt(end))}` +
      `&resultsPerPage=${PAGE}&startIndex=${startIndex}`;
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': NVD_UA, accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
        cf: { cacheTtlByStatus: { '200-299': 1800, '400-599': 0 }, cacheEverything: true },
      } as RequestInit);
      if (!res.ok) break;
      const json = (await res.json()) as NvdResponse & { totalResults?: number };
      const batch = json.vulnerabilities ?? [];
      for (const v of batch) if (v.cve) out.push(v.cve);
      if (batch.length < PAGE) break;
      startIndex += PAGE;
    } catch {
      break;
    }
  }
  return out;
}

async function fetchNvdByIds(cveIds: string[]): Promise<Map<string, NvdCve>> {
  // NVD doesn't support bulk by-ID; query one at a time but cache aggressively.
  // Limit: 5 req per 30s anonymous. Cap at 30 lookups per briefing to stay under budget.
  const out = new Map<string, NvdCve>();
  const ids = cveIds.slice(0, 30);
  for (const id of ids) {
    try {
      const url = `${NVD_API}?cveId=${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        headers: { 'user-agent': NVD_UA, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        cf: { cacheTtlByStatus: { '200-299': 86400, '400-599': 0 }, cacheEverything: true },
      } as RequestInit);
      if (!res.ok) continue;
      const json = (await res.json()) as NvdResponse;
      const cve = json.vulnerabilities?.[0]?.cve;
      if (cve) out.set(id, cve);
    } catch {
      // Skip on failure — best effort
    }
  }
  return out;
}

async function fetchAbuseFeed(source: SourceId, timeoutMs = 15_000): Promise<IocEntry[]> {
  try {
    const meta = FEED_SOURCES[source];
    // No Cloudflare edge caching here. Briefings run daily / weekly (not
    // bursty user traffic), and a stale-by-30-min CSV body can MASSIVELY
    // under-count what's actually in the window — the 2026-04-27→
    // 2026-05-03 weekly briefing matched only 90 IOCs because the edge
    // had served a stale URLhaus snapshot whose tail predated the window
    // start. Force a fresh upstream fetch each briefing run.
    //
    // We add a per-run cache buster as belt-and-braces — if Cloudflare ever
    // ignores `cacheEverything: false`, the query param still bypasses it.
    const sep = meta.url.includes('?') ? '&' : '?';
    const url = `${meta.url}${sep}_briefing=${Date.now()}`;
    const res = await fetch(url, {
      headers: { 'user-agent': NVD_UA },
      signal: AbortSignal.timeout(timeoutMs),
      cf: { cacheEverything: false },
    } as RequestInit);
    if (!res.ok) return [];
    const body = await res.text();
    // Pass UNCAPPED — the briefing-builder needs the full feed so it can filter
    // by the briefing's date window before display-capping (display cap is applied
    // in bucketIocs at 30 per type). Without this, the default cap-100 would only
    // ever return the most recent 100 entries — fine for "live IOC stream" but
    // disastrous for backfilled briefings that need yesterday's IOCs.
    const summary = buildSummary(source, body, UNCAPPED);
    return summary.entries;
  } catch {
    return [];
  }
}

// ---- builders -----------------------------------------------------------

function withinRange(timestamp: string | undefined, startMs: number, endMs: number): boolean {
  if (!timestamp) return false;
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return false;
  return t >= startMs && t < endMs;
}

function findingFromNvd(nvd: NvdCve): BriefingFinding {
  const cvss =
    nvd.metrics?.cvssMetricV31?.[0]?.cvssData.baseScore ??
    nvd.metrics?.cvssMetricV30?.[0]?.cvssData.baseScore ??
    nvd.metrics?.cvssMetricV2?.[0]?.cvssData.baseScore;
  const description = nvd.descriptions?.find((d) => d.lang === 'en')?.value ?? '';
  // Compose a readable title from the first sentence of the description.
  // NVD doesn't ship vendor/product as structured fields the way KEV does, so
  // a 90-char excerpt is the best heuristic we have without per-CVE CPE parsing.
  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  const excerpt = firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}…` : firstSentence;
  const title = excerpt ? `${nvd.id}: ${excerpt}` : nvd.id;
  return {
    id: nvd.id,
    title,
    description,
    severity: severityFromCvss(cvss),
    cvss,
    cwes: extractCwes(nvd),
    source: 'NVD',
    source_url: `https://nvd.nist.gov/vuln/detail/${nvd.id}`,
    mitre_techniques: deriveMitreTechniques(`${title} ${description}`),
  };
}

function findingFromKev(kev: KevEntry, nvd: NvdCve | undefined): BriefingFinding {
  const cvss =
    nvd?.metrics?.cvssMetricV31?.[0]?.cvssData.baseScore ??
    nvd?.metrics?.cvssMetricV30?.[0]?.cvssData.baseScore ??
    nvd?.metrics?.cvssMetricV2?.[0]?.cvssData.baseScore;
  const description =
    nvd?.descriptions?.find((d) => d.lang === 'en')?.value ?? kev.shortDescription ?? kev.vulnerabilityName ?? '';
  const title =
    `${kev.cveID}: ${kev.vendorProject ?? ''} ${kev.product ?? ''} — ${kev.vulnerabilityName ?? 'Vulnerability'}`
      .replace(/\s+/g, ' ')
      .trim();
  const cwes = extractCwes(nvd);
  return {
    id: kev.cveID,
    title,
    description,
    severity: severityFromCvss(cvss),
    cvss,
    cwes,
    source: 'CISA KEV',
    source_url: `https://nvd.nist.gov/vuln/detail/${kev.cveID}`,
    mitre_techniques: deriveMitreTechniques(`${title} ${description}`),
    added: kev.dateAdded,
    vendor: kev.vendorProject,
    product: kev.product,
  };
}

function buildSections(findings: BriefingFinding[]): BriefingSection[] {
  const groups = new Map<string, { rule: { id: string; title: string; blurb: string }; findings: BriefingFinding[] }>();
  for (const f of findings) {
    const cat = categorizeFinding({
      title: f.title,
      description: f.description,
      severity: f.severity,
      cwes: f.cwes ?? [],
    });
    const slot = groups.get(cat.id) ?? { rule: cat, findings: [] };
    slot.findings.push(f);
    groups.set(cat.id, slot);
  }
  // Severity priority for ordering findings within a section
  const sevRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
  // Section ordering: specific categories first, then severity-only buckets, then catch-all
  const sectionOrder = [
    ...CATEGORY_RULES.map((r) => r.id),
    'critical-other',
    'high-other',
    'medium-other',
    'low-other',
    FALLBACK_CATEGORY.id,
  ];
  return sectionOrder
    .map((id) => groups.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s && s.findings.length > 0)
    .map((s) => ({
      id: s.rule.id,
      title: s.rule.title,
      blurb: s.rule.blurb,
      count: s.findings.length,
      findings: s.findings.slice().sort((a, b) => sevRank[a.severity] - sevRank[b.severity]),
    }));
}

function bucketIocs(entries: IocEntry[]): BriefingIocBuckets {
  const buckets: BriefingIocBuckets = { urls: [], domains: [], ipv4s: [], hashes: [] };
  for (const e of entries) {
    if (e.type === 'url') buckets.urls.push(e);
    else if (e.type === 'domain') buckets.domains.push(e);
    else if (e.type === 'ipv4') buckets.ipv4s.push(e);
    else if (e.type === 'hash') buckets.hashes.push(e);
  }
  // Cap each bucket at 30 to keep payload manageable
  for (const k of Object.keys(buckets) as Array<keyof BriefingIocBuckets>) buckets[k] = buckets[k].slice(0, 30);
  return buckets;
}

function topVendors(findings: BriefingFinding[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const f of findings) {
    if (!f.vendor) continue;
    counts.set(f.vendor, (counts.get(f.vendor) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => v);
}

function buildExecutiveSummary(args: {
  type: BriefingType;
  range_label: string;
  findings: BriefingFinding[];
  iocs: BriefingIocBuckets;
  iocsRawTotal: number;
  iocSources: string[];
  /** Map of source-label → matched-in-window count, for transparent reporting. */
  iocPerSource?: Record<string, number>;
}): string {
  const { type, range_label, findings, iocs, iocsRawTotal, iocSources, iocPerSource } = args;
  const span = type === 'weekly' ? 'This week' : 'In the past 24 hours';
  const critCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const vendors = topVendors(findings, 3);
  const vendorStr = vendors.length > 0 ? `affecting ${vendors.join(', ')}` : 'across multiple vendors';

  const kevCount = findings.filter((f) => f.source === 'CISA KEV').length;
  const nvdOnlyCount = findings.length - kevCount;

  const parts: string[] = [];
  if (findings.length > 0) {
    const severityClause =
      critCount > 0
        ? `, including ${critCount} critical-severity`
        : highCount > 0
          ? `, with ${highCount} high-severity`
          : '';
    if (kevCount > 0 && nvdOnlyCount > 0) {
      parts.push(
        `${span} (${range_label}), CISA added ${kevCount} new KEV ${kevCount === 1 ? 'entry' : 'entries'} and NVD published ${nvdOnlyCount} additional high/critical ${nvdOnlyCount === 1 ? 'CVE' : 'CVEs'}${severityClause} ${vendorStr}.`
      );
    } else if (kevCount > 0) {
      parts.push(
        `${span} (${range_label}), CISA's Known Exploited Vulnerabilities catalog added ${kevCount} new ${kevCount === 1 ? 'entry' : 'entries'}${severityClause} ${vendorStr}.`
      );
    } else {
      parts.push(
        `${span} (${range_label}), NVD published ${nvdOnlyCount} high/critical ${nvdOnlyCount === 1 ? 'CVE' : 'CVEs'}${severityClause}; none have been added to CISA KEV yet.`
      );
    }
  } else {
    parts.push(
      `${span} (${range_label}), no new high/critical CVEs were published to NVD and no entries were added to CISA's Known Exploited Vulnerabilities catalog.`
    );
  }

  const sampledBits: string[] = [];
  if (iocs.urls.length > 0) sampledBits.push(`${iocs.urls.length} malware-distribution URLs`);
  if (iocs.domains.length > 0) sampledBits.push(`${iocs.domains.length} malicious domains`);
  if (iocs.ipv4s.length > 0) sampledBits.push(`${iocs.ipv4s.length} suspicious IPs`);
  if (iocs.hashes.length > 0) sampledBits.push(`${iocs.hashes.length} malware sample hashes`);
  if (iocsRawTotal > 0) {
    // Prefer per-source breakdown when available — makes the number
    // self-verifiable ("URLhaus 4,712; ThreatFox 215; …" beats a single
    // round total). Falls back to the source-list when the per-source
    // map wasn't computed.
    const breakdown = iocPerSource
      ? Object.entries(iocPerSource)
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${k} ${n.toLocaleString()}`)
          .join(', ')
      : iocSources.length === 0
        ? 'tracked feeds'
        : iocSources.length <= 3
          ? iocSources.join(', ')
          : `${iocSources.slice(0, -1).join(', ')}, and ${iocSources[iocSources.length - 1]}`;
    const sampledTotal = iocs.urls.length + iocs.domains.length + iocs.ipv4s.length + iocs.hashes.length;
    parts.push(
      `Active threat indicators ${iocPerSource ? 'per source' : 'across'} ${breakdown} — total ${iocsRawTotal.toLocaleString()} entries; this briefing samples the top ${sampledTotal} (${sampledBits.join(', ')}, capped at 30 per type).`
    );
  }

  parts.push(
    'Reference only — verify all indicators in your own environment and apply vendor patches per CISA KEV due-date guidance.'
  );

  return parts.join(' ');
}

function buildStats(findings: BriefingFinding[], sections: BriefingSection[], iocsTotal: number): BriefingStats {
  return {
    findings: findings.length,
    sections: sections.length,
    cves: findings.length,
    kevs: findings.filter((f) => f.source === 'CISA KEV').length,
    iocs: iocsTotal,
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };
}

// ---- main entry points --------------------------------------------------

export async function buildBriefing(type: BriefingType, anchor: Date = new Date()): Promise<Briefing> {
  // Compute window
  let rangeStart: Date;
  let rangeEnd: Date;
  let dateLabel: string;
  let rangeLabel: string;
  let slug: string;
  let title: string;

  if (type === 'daily') {
    // Daily: covers the previous calendar day (UTC)
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
    const start = new Date(end.getTime() - 86400_000);
    rangeStart = start;
    rangeEnd = end;
    dateLabel = isoDate(start);
    rangeLabel = dateLabel;
    slug = `daily-${dateLabel}`;
    title = `Daily Threat Briefing — ${dateLabel}`;
  } else {
    // Weekly: prior ISO week (Mon→Sun) ending the day before anchor
    const end = startOfIsoWeek(anchor); // start of *current* ISO week — exclusive end
    const start = new Date(end.getTime() - 7 * 86400_000);
    rangeStart = start;
    rangeEnd = end;
    dateLabel = isoDate(start);
    rangeLabel = `${isoDate(start)} – ${isoDate(new Date(end.getTime() - 86400_000))}`;
    slug = `weekly-${isoYearWeek(start)}`;
    title = `Weekly Threat Briefing — ${rangeLabel}`;
  }

  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();

  // Fetch in parallel. Each feed is independent; one failure should not break the briefing.
  //
  // Live-only policy (2026-05-11): every feed here must carry per-entry timestamps so
  // the briefing window can date-filter it. Snapshot blocklists (Blocklist.de, Binary
  // Defense, Ipsum, Phishing Army, Bitwire) were removed because they publish a
  // current-state list with no per-IP "first seen" — they inflated IOC counts on quiet
  // KEV days and made daily briefings look richer than they were. Feodo Tracker
  // (2026-05-12) was removed for the same reason: upstream publication had stopped.
  // OpenPhish (2026-05-13) was removed because parseOpenPhish emits no per-entry
  // timestamps — every entry was silently dropped by matchTimestamp, so the fetch
  // was wasted latency that never contributed to a single briefing.
  const [kev, urlhaus, malwarebazaar, threatfox, tweetfeed, nvdRecent] = await Promise.all([
    fetchKev().catch(() => [] as KevEntry[]),
    fetchAbuseFeed('urlhaus').catch(() => [] as IocEntry[]),
    fetchAbuseFeed('malwarebazaar').catch(() => [] as IocEntry[]),
    fetchAbuseFeed('threatfox').catch(() => [] as IocEntry[]),
    fetchAbuseFeed('tweetfeed').catch(() => [] as IocEntry[]),
    fetchNvdRecent(rangeStart, rangeEnd).catch(() => [] as NvdCve[]),
  ]);

  // Findings: KEV-added-in-window first (these are the high-signal items —
  // CISA only adds a CVE to KEV when active exploitation is observed), then
  // NVD-published-in-window CVEs of CVSS >= 7.0 (high+critical) that aren't
  // already covered by KEV. This is what fixes the "0 findings" daily briefing
  // on KEV-quiet days while still keeping the bar high — we don't surface
  // every newly-published CVE, only the ones that matter.
  const kevWindow = kev.filter((k) => withinRange(k.dateAdded, startMs, endMs));
  const nvdMap = await fetchNvdByIds(kevWindow.map((k) => k.cveID));
  const kevFindings = kevWindow.map((k) => findingFromKev(k, nvdMap.get(k.cveID)));
  const kevIds = new Set(kevFindings.map((f) => f.id));
  const nvdFindings = nvdRecent
    .filter((c) => !kevIds.has(c.id))
    .map(findingFromNvd)
    .filter((f) => f.severity === 'critical' || f.severity === 'high');
  const findings = [...kevFindings, ...nvdFindings];

  // Per-source counts for transparent reporting — match-in-window only.
  // Helps a future reader verify "URLhaus 4,712; ThreatFox 215; …" instead
  // of trusting a single total that could be wildly off.
  const matchTimestamp = (e: IocEntry) =>
    e.timestamp ? withinRange(e.timestamp.replace(' ', 'T'), startMs, endMs) : false;
  const iocPerSource: Record<string, number> = {};
  const urlhausMatched = urlhaus.filter(matchTimestamp);
  const malwarebazaarMatched = malwarebazaar.filter(matchTimestamp);
  const threatfoxMatched = threatfox.filter(matchTimestamp);
  const tweetfeedMatched = tweetfeed.filter(matchTimestamp);
  if (urlhausMatched.length > 0) iocPerSource['URLhaus'] = urlhausMatched.length;
  if (malwarebazaarMatched.length > 0) iocPerSource['MalwareBazaar'] = malwarebazaarMatched.length;
  if (threatfoxMatched.length > 0) iocPerSource['ThreatFox'] = threatfoxMatched.length;
  if (tweetfeedMatched.length > 0) iocPerSource['TweetFeed'] = tweetfeedMatched.length;

  // Windowed feeds only — every entry carries a per-IOC timestamp inside the
  // briefing window. Snapshot blocklists were removed in the live-only refactor.
  const allIocs = [...urlhausMatched, ...malwarebazaarMatched, ...threatfoxMatched, ...tweetfeedMatched];

  // Pre-cap total — what's actually visible upstream in this window. The
  // served `iocs` payload below is then capped per-bucket so the briefing
  // JSON stays small, but the summary string reports the real volume so
  // readers don't mistake the cap for the count.
  const iocsRawTotal = allIocs.length;
  const iocs = bucketIocs(allIocs);

  // IOC source attribution — only feeds that actually returned data this run.
  // KEV/NVD belong to the findings half of the briefing, not the IOC half.
  // Live windowed feeds only (post-2026-05-11 refactor).
  const iocSources: string[] = [];
  if (urlhausMatched.length > 0) iocSources.push('URLhaus');
  if (malwarebazaarMatched.length > 0) iocSources.push('MalwareBazaar');
  if (threatfoxMatched.length > 0) iocSources.push('ThreatFox');
  if (tweetfeedMatched.length > 0) iocSources.push('TweetFeed');

  const sections = buildSections(findings);
  const stats = buildStats(findings, sections, iocsRawTotal);
  const executive_summary = buildExecutiveSummary({
    type,
    range_label: rangeLabel,
    findings,
    iocs,
    iocsRawTotal,
    iocSources,
    iocPerSource,
  });

  const techniqueSet = new Set<string>();
  for (const f of findings) for (const t of f.mitre_techniques) techniqueSet.add(t);

  const sources: string[] = [];
  if (findings.some((f) => f.source === 'CISA KEV')) sources.push('CISA KEV');
  if (findings.length > 0) sources.push('NVD');
  sources.push(...iocSources);

  return {
    slug,
    type,
    title,
    date: dateLabel,
    date_range: rangeLabel,
    range_start: isoDate(rangeStart),
    range_end: isoDate(new Date(rangeEnd.getTime() - 86400_000)),
    generated_at: new Date().toISOString(),
    executive_summary,
    stats,
    sections,
    iocs,
    mitre_techniques: Array.from(techniqueSet).sort(),
    sources,
  };
}

/**
 * Hard retention ceiling for briefings — and for any source/findings data
 * derived per briefing. 30 days. After that, the KV entry expires and the
 * sweep deletes any straggler entries that pre-date the TTL.
 *
 * If you're tempted to bump this higher: don't. The portfolio publishes a
 * 30-day retention promise; longer storage requires reopening that
 * decision. Edge-cached upstream responses (Cache API) have their own
 * shorter TTLs and are unaffected by this constant.
 */
export const BRIEFING_TTL_SECONDS = 30 * 86400;
export const BRIEFING_MAX_AGE_DAYS = 30;

export async function writeBriefing(
  kv: KVNamespace,
  briefing: Briefing,
  options?: { skipIfExists?: boolean }
): Promise<{ written: boolean; reason?: string }> {
  if (options?.skipIfExists) {
    const existing = await kv.get(`briefing:${briefing.slug}`);
    if (existing) {
      return { written: false, reason: 'already_exists' };
    }
  }
  await kv.put(`briefing:${briefing.slug}`, JSON.stringify(briefing), {
    expirationTtl: BRIEFING_TTL_SECONDS,
    metadata: {
      type: briefing.type,
      title: briefing.title,
      date: briefing.date,
      // range_end is the last day the briefing covers (inclusive). For dailies
      // it equals `date`; for weeklies it's the Sunday of the week. Sorting by
      // range_end gives a coherent newest-first ordering across both types.
      range_end: briefing.range_end,
      date_range: briefing.date_range,
      stats: briefing.stats,
      sources: briefing.sources,
    },
  });
  return { written: true };
}

/**
 * Delete briefings whose `date` metadata is older than `maxAgeDays`.
 * Belt-and-braces alongside KV's expirationTtl: handles entries that pre-date
 * the TTL change (which lack expiration) and any other stragglers. Default
 * matches BRIEFING_MAX_AGE_DAYS (30); the admin handler can override but the
 * default and the TTL must stay aligned.
 */
export async function sweepOldBriefings(
  kv: KVNamespace,
  maxAgeDays = BRIEFING_MAX_AGE_DAYS,
  now: Date = new Date()
): Promise<{ deleted: string[]; kept: number }> {
  const cutoffMs = now.getTime() - maxAgeDays * 86400_000;
  const list = await kv.list({ prefix: 'briefing:', limit: 1000 });
  const deleted: string[] = [];
  let kept = 0;
  for (const k of list.keys) {
    const meta = k.metadata as { date?: string } | undefined;
    const dateStr = meta?.date;
    if (!dateStr) {
      // No date metadata — be conservative, keep it.
      kept += 1;
      continue;
    }
    const t = Date.parse(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(t)) {
      kept += 1;
      continue;
    }
    if (t < cutoffMs) {
      await kv.delete(k.name);
      deleted.push(k.name.replace(/^briefing:/, ''));
    } else {
      kept += 1;
    }
  }
  return { deleted, kept };
}

export async function listBriefings(
  kv: KVNamespace,
  filter?: { type?: BriefingType; limit?: number }
): Promise<Array<{ slug: string; metadata: unknown }>> {
  const limit = filter?.limit ?? 50;
  const list = await kv.list({ prefix: 'briefing:', limit: 200 });
  const items = list.keys
    .map((k) => ({ slug: k.name.replace(/^briefing:/, ''), metadata: k.metadata }))
    .filter((k) => {
      if (!filter?.type) return true;
      return k.slug.startsWith(filter.type);
    })
    .slice()
    .sort((a, b) => {
      // Sort by range_end (newest first) so weeklies and dailies interleave
      // by the actual end-of-period rather than weekly's Monday-as-date.
      const am = a.metadata as { range_end?: string; date?: string } | undefined;
      const bm = b.metadata as { range_end?: string; date?: string } | undefined;
      const aKey = am?.range_end ?? am?.date ?? '';
      const bKey = bm?.range_end ?? bm?.date ?? '';
      return bKey.localeCompare(aKey);
    })
    .slice(0, limit);
  return items;
}

export async function readBriefing(kv: KVNamespace, slug: string): Promise<Briefing | null> {
  const body = await kv.get(`briefing:${slug}`, 'json');
  return (body as Briefing | null) ?? null;
}

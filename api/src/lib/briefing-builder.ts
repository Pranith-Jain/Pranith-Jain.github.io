/**
 * Threat briefing builder.
 *
 * Aggregates CISA KEV + NVD + abuse.ch over a time window, categorises
 * findings, and produces a structured briefing object. Stored in D1 under
 * the `briefings` table.
 *
 * Executive summary uses LLM when available (Groq → Workers AI), falling
 * back to a deterministic template when the LLM is unavailable.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { FEED_SOURCES, UNCAPPED, buildSummary, type IocEntry, type SourceId } from './ioc-feed-parsers';
import { fetchResilient } from './fetch-resilient';
import { readLastGood, writeLastGood } from './lastgood';
import type { Env } from '../env';
import { fetchMtiSource, type MtiCveRecord } from './mythreatintel-api';
import { fetchRansomwareRecent, type RansomwareVictim } from '../routes/ransomware-recent';
import { fetchCveFeedHighSeverity, type CveFeedEntry } from '../routes/cve-recent';
import { runCompletion } from '../case-study/generation/ai-client';

const NVD_UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';
const NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

/**
 * NVD request headers. An optional API key (NVD_API_KEY Worker secret) raises
 * the anonymous rate limit ~10x (5→50 req/30s) — the durable fix for the
 * shared-Worker-IP throttling that produced empty briefings. Sent via the
 * `apiKey` header per NVD docs.
 */
function nvdHeaders(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { 'user-agent': NVD_UA, accept: 'application/json' };
  if (apiKey) h.apiKey = apiKey;
  return h;
}
const KEV_FEED = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

/**
 * Last-good source cache. CISA KEV / NVD are reachable from the Cloudflare
 * edge but flaky from the shared egress IP — a single slow/blocked cron fire
 * (NVD+KEV both miss in the same run) produced an EMPTY briefing for the day
 * with nothing to fall back to. This write-through cache keeps the most
 * recent successful KEV/NVD payload for 14 days: any one success (cron,
 * hourly catch-up, or manual build) keeps every subsequent briefing
 * populated with real data through a two-week run of transient blocks,
 * instead of degrading to a blank "both unreachable" briefing.
 *
 * Implementation: persisted to KV via `readLastGood`/`writeLastGood` (see
 * `api/src/lib/lastgood.ts`). KV is durable and cross-colo, so a single
 * success in ANY colo benefits every other colo. The previous
 * `caches.default` implementation was per-colo and could be evicted under
 * pressure — which left the self-heal running the same cold-cache retry
 * hour after hour whenever the upstream had a multi-hour outage (the
 * 2026-05-25→05-31 weekly briefing was degraded for >8h even after the
 * feeds came back because every colo's `caches.default` had been cold
 * through the outage).
 *
 * Writes are debounced inside `writeLastGood` (1 KV write / 6h / key) so
 * the cost of durable last-good is the same as the old in-memory version.
 */
const LASTGOOD_TTL_SEC = 60 * 60 * 24 * 14;
/**
 * Run `live()`. On success, persist the result as last-good (debounced)
 * and return it. On failure, return the cached last-good if present;
 * otherwise re-throw so the caller's degrade path still fires when there
 * has never been a success.
 *
 * Exported so the briefing-builder test can verify the live↔last-good
 * round-trip without standing up the full build pipeline.
 */
export async function withLastGood<T>(env: Env | undefined, cacheKey: string, live: () => Promise<T>): Promise<T> {
  try {
    const v = await live();
    // Awaited (not fire-and-forget) so a subsequent call in the same request
    // — or the very next request landing in a different colo — can rely on
    // the last-good being present. The debounce inside `writeLastGood` keeps
    // the KV-write cost to 1 put / 6h / key, so awaiting is cheap.
    if (env) await writeLastGood(env, cacheKey, v, { ttlSeconds: LASTGOOD_TTL_SEC });
    return v;
  } catch (err) {
    // env-less callers (unit tests with no bindings) get the live result or
    // the live error — no last-good to read or write.
    if (!env) throw err;
    const hit = await readLastGood<T>(env, cacheKey);
    if (hit !== null) return hit;
    throw err;
  }
}

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
  /**
   * True when BOTH primary finding sources (CISA KEV + NVD) were unreachable
   * at build time. The briefing is persisted anyway (so the page is never
   * blank) but honestly labelled as incomplete — and the hourly catch-up
   * keeps rebuilding it until upstreams recover and a real one replaces it.
   */
  degraded?: boolean;
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

/**
 * The slug `buildBriefing('weekly', anchor)` will produce — i.e. the
 * just-completed ISO week. Exported so the hourly catch-up can self-heal a
 * missing/degraded weekly the same way it does the daily (the weekly cron
 * only fires Mondays, so without this a failed weekly was stuck for 7 days).
 */
export function expectedWeeklySlug(anchor: Date = new Date()): string {
  const start = new Date(startOfIsoWeek(anchor).getTime() - 7 * 86400_000);
  return `weekly-${isoYearWeek(start)}`;
}

// ---- fetchers -----------------------------------------------------------

async function fetchKev(): Promise<KevEntry[]> {
  // KEV is a reliable static CISA file, but a single transient timeout/5xx
  // from the shared Worker IP used to drop it entirely — and if NVD also
  // hiccupped the same run, the briefing degraded. Retry (no signal in init
  // so fetchResilient owns the per-attempt 20s timeout; passing a caller
  // signal would break retries once it aborts).
  const res = await fetchResilient(
    KEV_FEED,
    {
      headers: { 'user-agent': NVD_UA, accept: 'application/json' },
      cf: { cacheTtlByStatus: { '200-299': 1800, '400-599': 0 }, cacheEverything: true },
    } as RequestInit,
    { attempts: 3, timeoutMs: 20_000 }
  );
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
/**
 * NVD anonymous access is aggressively throttled (and the shared Cloudflare
 * egress IP gets 403/503 bursts). A swallowed failure here used to surface as
 * a briefing that falsely says "no high/critical CVEs published". So: retry
 * each page with backoff, and if the FIRST page never succeeds, THROW — the
 * caller distinguishes "NVD genuinely empty" (resolved []) from "NVD
 * unreachable" (rejected) and refuses to persist a false all-clear.
 */
async function fetchNvdRecent(start: Date, end: Date, apiKey?: string): Promise<NvdCve[]> {
  const fmt = (d: Date) => d.toISOString().replace(/Z$/, '+00:00');
  const out: NvdCve[] = [];
  const PAGE = 2000;
  const HARD_CAP = 4000; // 2 pages — enough headroom for any 7-day window
  let startIndex = 0;
  let anyPageOk = false;
  for (let i = 0; i < 4 && out.length < HARD_CAP; i++) {
    const url =
      `${NVD_API}?pubStartDate=${encodeURIComponent(fmt(start))}` +
      `&pubEndDate=${encodeURIComponent(fmt(end))}` +
      `&resultsPerPage=${PAGE}&startIndex=${startIndex}`;
    let pageOk = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt + Math.random() * 800));
      try {
        const res = await fetch(url, {
          headers: nvdHeaders(apiKey),
          signal: AbortSignal.timeout(20_000),
          cf: { cacheTtlByStatus: { '200-299': 1800, '400-599': 0 }, cacheEverything: true },
        } as RequestInit);
        if (!res.ok) {
          lastErr = new Error(`NVD ${res.status}`);
          // 4xx other than 429 won't fix on retry; 429/5xx might.
          if (res.status !== 429 && res.status < 500) break;
          continue;
        }
        const json = (await res.json()) as NvdResponse & { totalResults?: number };
        const batch = json.vulnerabilities ?? [];
        for (const v of batch) if (v.cve) out.push(v.cve);
        pageOk = true;
        anyPageOk = true;
        if (batch.length < PAGE) return out;
        startIndex += PAGE;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!pageOk) {
      if (!anyPageOk) throw lastErr instanceof Error ? lastErr : new Error('NVD unreachable');
      break; // a later page failed but we have earlier data — return partial
    }
  }
  return out;
}

/**
 * NVD fallback via CIRCL cve-search. services.nvd.nist.gov throttles/blocks
 * the shared Worker egress IP; cve.circl.lu does not, and its `api/last`
 * items embed the full CVE 5.1 record (containers.cna.metrics) so this is a
 * NON-lossy fallback — real CVSS, not just the OSV vector. Used only when
 * the NVD paging path returns nothing.
 */
async function fetchCirclRecent(start: Date, end: Date): Promise<NvdCve[]> {
  // Size the window: ~weekly windows need a deeper pull than daily ones.
  const days = Math.ceil((end.getTime() - start.getTime()) / 86400_000);
  const limit = Math.min(2000, Math.max(300, days * 220));
  const res = await fetchResilient(
    `https://cve.circl.lu/api/last/${limit}`,
    { headers: { 'user-agent': NVD_UA, accept: 'application/json' } } as RequestInit,
    { attempts: 2, timeoutMs: 15_000 }
  );
  if (!res.ok) throw new Error(`CIRCL last ${res.status}`);
  const items = (await res.json()) as Record<string, unknown>[];
  const out: NvdCve[] = [];
  for (const it of Array.isArray(items) ? items : []) {
    const aliases = Array.isArray(it.aliases) ? (it.aliases as string[]) : [];
    const cveId =
      aliases.find((a) => /^CVE-\d{4}-\d+$/.test(a)) ??
      (typeof it.id === 'string' && /^CVE-/.test(it.id) ? it.id : null);
    if (!cveId) continue;
    const ds = (it.database_specific ?? {}) as { nvd_published_at?: string; cwe_ids?: string[] };
    const pub = new Date(String(ds.nvd_published_at ?? it.published ?? ''));
    if (Number.isNaN(pub.getTime()) || pub < start || pub >= end) continue;
    // CVSS from the embedded CVE 5.1 cna metrics (real base score).
    const cna = ((it.containers as Record<string, unknown>)?.cna ?? {}) as Record<string, unknown>;
    let baseScore: number | undefined;
    let baseSeverity: string | undefined;
    for (const m of (cna.metrics as Record<string, unknown>[]) ?? []) {
      const v = (m.cvssV3_1 ?? m.cvssV3_0) as { baseScore?: number; baseSeverity?: string } | undefined;
      if (v?.baseScore != null) {
        baseScore = v.baseScore;
        baseSeverity = v.baseSeverity;
        break;
      }
    }
    if (baseScore == null) continue; // briefing only surfaces CVSS-scored CVEs
    out.push({
      id: cveId,
      descriptions: [{ lang: 'en', value: String(it.details ?? '') }],
      metrics: { cvssMetricV31: [{ cvssData: { baseScore, ...(baseSeverity ? { baseSeverity } : {}) } }] },
      weaknesses: (ds.cwe_ids ?? []).map((c) => ({ description: [{ lang: 'en', value: c }] })),
    });
  }
  return out;
}

async function fetchNvdByIds(cveIds: string[], apiKey?: string): Promise<Map<string, NvdCve>> {
  // NVD doesn't support bulk by-ID; query one at a time but cache aggressively.
  // Limit: 5 req per 30s anonymous (≈50 with an API key). Cap at 30 lookups.
  const out = new Map<string, NvdCve>();
  const ids = cveIds.slice(0, 30);
  for (const id of ids) {
    try {
      const url = `${NVD_API}?cveId=${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        headers: nvdHeaders(apiKey),
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

/**
 * Common corporate suffixes that should NOT participate in dedupe. Anchored
 * at the end of the (lowercased, single-spaced) string and stripped before
 * the alphanumeric collapse. Sorted longest-first so e.g. "co., inc." gets
 * stripped as a unit rather than just "inc.".
 */
const VICTIM_CORPORATE_SUFFIXES = [
  's.a. de c.v.',
  'pte. ltd.',
  'pte ltd',
  'co., inc.',
  'co., ltd.',
  'co. ltd.',
  ', inc.',
  ', llc.',
  ', llc',
  ', ltd.',
  ', ltd',
  ', s.a.',
  ', s.r.l.',
  ' inc.',
  ' inc',
  ' llc',
  ' ltd.',
  ' ltd',
  ' gmbh',
  ' corp.',
  ' corp',
  ' s.a.',
  ' s.r.l.',
  ' srl',
  ' sas',
  ' sa',
];

/** Trailing descriptors the upstream feed appends to some claims, e.g.
 *  "Bni.co.id bank of indonesia free data." — these are not part of the
 *  victim's identity and should not anchor the dedupe key. */
const VICTIM_TRAILING_DESCRIPTORS = [
  'free data',
  'leaked data',
  'data leak',
  'data dump',
  'all data',
  'full database',
  'database leak',
];

function stripVictimNoise(lower: string): string {
  let s = lower.replace(/\s+/g, ' ').trim();
  // Two passes so a descriptor + corporate suffix nested together
  // (e.g. "acme corp. all data") gets fully unwrapped.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const desc of VICTIM_TRAILING_DESCRIPTORS) {
      // Whole-word at end, allowing trailing punctuation.
      const escaped = desc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|\\s)${escaped}[\\s.,;:!?]*$`);
      s = s.replace(re, '').trim();
    }
    for (const suffix of VICTIM_CORPORATE_SUFFIXES) {
      if (s.endsWith(suffix)) {
        s = s.slice(0, -suffix.length).trim();
      }
    }
    s = s.replace(/[.,;:!?\s]+$/, '');
  }
  return s;
}

/**
 * Normalize a victim name into a stable dedupe key. Handles:
 *   - HTML entities ("Vernon &amp; Ginsburg" matches "Vernon & Ginsburg";
 *     "Sid Harvey&#39;s" matches "Sid Harvey's")
 *   - Casing + whitespace ("ROTO Immobilien" → "rotoimmobilien")
 *   - Corporate suffixes ("Apex Maritime Co., Inc." matches "Apex Maritime")
 *   - Trailing descriptors ("Bni.co.id … free data." → "bnicoidbankofindonesia")
 *   - Residual punctuation collapsed last
 * Exported for test coverage.
 */
export function normalizeVictimKey(raw: string): string {
  const decoded = raw
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  const stripped = stripVictimNoise(decoded.toLowerCase());
  return stripped.replace(/[^a-z0-9]/g, '');
}

/**
 * Normalize a gang name into one or more canonical dedupe keys.
 *
 * Real-world MyThreatIntel data shows the same operator under multiple
 * presentations: `"eraleign (apt73)"` and `"Apt73"` are the same gang;
 * `"the gentlemen"` and `"Thegentlemen"` are the same; `"brain cipher"`
 * and `"Braincipher"` are the same. To catch all of them, we extract
 * BOTH the outer name AND any parenthetical alias as separate keys; the
 * caller checks all (gang, victim) permutations against the seen set.
 */
export function canonicalGangKeys(raw: string): string[] {
  const lower = raw.toLowerCase().trim();
  if (!lower) return [];
  const keys = new Set<string>();
  // Outer name with parenthetical content removed.
  const outer = lower
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const outerKey = outer.replace(/[^a-z0-9]/g, '');
  if (outerKey) keys.add(outerKey);
  // Every parenthetical group as its own key — typically the "formerly known
  // as" alias the feed annotates the new name with.
  for (const m of lower.matchAll(/\(([^)]+)\)/g)) {
    const inner = m[1]!.replace(/[^a-z0-9]/g, '');
    if (inner) keys.add(inner);
  }
  return [...keys];
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
  /** Top in-window ransomware groups (from the merged ransomware-recent feed). */
  ransomwareGroups?: Array<{ group: string; count: number }>;
  /** Top in-window ransomware sectors (from the merged ransomware-recent feed). */
  ransomwareSectors?: Array<{ sector: string; count: number; pct: number }>;
  /** Total in-window ransomware victim claims (matches the section count). */
  ransomwareTotal?: number;
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
        `${span} (${range_label}), CISA added ${kevCount} new KEV ${kevCount === 1 ? 'entry' : 'entries'} and ${nvdOnlyCount} additional high/critical ${nvdOnlyCount === 1 ? 'CVE was' : 'CVEs were'} published (NVD, cvefeed.io, MyThreatIntel)${severityClause} ${vendorStr}.`
      );
    } else if (kevCount > 0) {
      parts.push(
        `${span} (${range_label}), CISA's Known Exploited Vulnerabilities catalog added ${kevCount} new ${kevCount === 1 ? 'entry' : 'entries'}${severityClause} ${vendorStr}.`
      );
    } else {
      parts.push(
        `${span} (${range_label}), ${nvdOnlyCount} high/critical ${nvdOnlyCount === 1 ? 'CVE was' : 'CVEs were'} published across NVD, cvefeed.io and MyThreatIntel${severityClause}; none have been added to CISA KEV yet.`
      );
    }
  } else {
    parts.push(
      `${span} (${range_label}), no new high/critical CVEs were observed across NVD, cvefeed.io, MyThreatIntel, and no entries were added to CISA's Known Exploited Vulnerabilities catalog.`
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
      `Active threat indicators ${iocPerSource ? 'per source' : 'across'} ${breakdown} — ${iocsRawTotal.toLocaleString()} unique after cross-source dedup; this briefing samples the top ${sampledTotal} (${sampledBits.join(', ')}, capped at 30 per type).`
    );
  }

  parts.push(
    'Reference only — verify all indicators in your own environment and apply vendor patches per CISA KEV due-date guidance.'
  );

  return parts.join(' ');
}

/**
 * LLM-powered executive summary. Attempts to generate a richer, more
 * analyst-grade summary using the LLM (Groq → Workers AI). Falls back
 * to the deterministic template on any failure.
 *
 * The LLM summary references specific CVE IDs, vendor names, and severity
 * counts from the actual findings — it doesn't invent data.
 */
async function buildLlmExecutiveSummary(args: Parameters<typeof buildExecutiveSummary>[0], env?: Env): Promise<string> {
  const templateSummary = buildExecutiveSummary(args);
  if (!env) return templateSummary;

  const {
    type,
    range_label,
    findings,
    iocsRawTotal,
    iocSources,
    ransomwareGroups,
    ransomwareSectors,
    ransomwareTotal,
  } = args;
  const critCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const kevCount = findings.filter((f) => f.source === 'CISA KEV').length;

  // Build a concise context for the LLM.
  const topFindings = findings.slice(0, 15).map((f) => {
    const parts = [f.id];
    if (f.cvss) parts.push(`CVSS ${f.cvss}`);
    parts.push(f.severity);
    if (f.vendor) parts.push(f.vendor);
    parts.push(f.title.slice(0, 120));
    return parts.join(' | ');
  });

  const iocSummary =
    iocSources.length > 0
      ? `IoC feeds: ${iocSources.join(', ')} — ${iocsRawTotal} unique indicators.`
      : 'No IoC data this window.';

  // Ransomware activity context (merged ransomware.live + 7 peer trackers).
  // Only included when the section actually has rows — keeps the prompt
  // honest about which windows had no claim activity.
  const ransomwareSummary =
    ransomwareTotal && ransomwareTotal > 0
      ? `Ransomware activity: ${ransomwareTotal} in-window victim claims across ` +
        (ransomwareGroups
          ?.slice(0, 5)
          .map((g) => `${g.group} (${g.count})`)
          .join(', ') ?? 'multiple groups') +
        (ransomwareSectors && ransomwareSectors.length > 0
          ? `. Top sectors: ${ransomwareSectors
              .filter((s) => s.sector !== 'Unknown')
              .slice(0, 3)
              .map((s) => `${s.sector} ${s.pct}%`)
              .join(', ')}.`
          : '.')
      : 'No in-window ransomware victim claims.';

  const userPrompt = [
    `Generate a 2-3 sentence executive summary for a ${type} threat intelligence briefing (${range_label}).`,
    ``,
    `Stats: ${findings.length} findings (${critCount} critical, ${highCount} high), ${kevCount} CISA KEV entries. ${iocSummary}`,
    ``,
    `${ransomwareSummary}`,
    ``,
    `Top findings:`,
    ...topFindings.map((f) => `- ${f}`),
    ``,
    `Requirements: Be specific — cite CVE IDs and vendor names. If there is ransomware activity, name the most active groups and the top targeted sectors. Professional CTI tone. No speculation.`,
  ].join('\n');

  try {
    const result = await Promise.race([
      runCompletion(
        env.AI,
        {
          system:
            'You are a senior CTI analyst writing executive summaries for threat intelligence briefings. Be concise, specific, and actionable. Reference actual CVE IDs and vendor names from the data. 2-3 sentences maximum.',
          user: userPrompt,
          maxTokens: 400,
          temperature: 0.3,
        },
        { groqKey: env.GROQ_API_KEY }
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('llm-summary-timeout')), 8000)),
    ]);

    const text = result.text?.trim();
    if (text && text.length > 50 && text.length < 2000) {
      return text;
    }
  } catch {
    // Fall through to template.
  }
  return templateSummary;
}

function buildStats(findings: BriefingFinding[], sections: BriefingSection[], iocsTotal: number): BriefingStats {
  // `findings` is the CVE-derived findings array (KEV + NVD + MTI CVE).
  // The rendered briefing has MORE findings than that: the ransomware
  // activity section (ransomware.live + peers) is pushed in separately
  // and never enters the `findings` array, so counting `findings.length`
  // for the top-line total mislabeled the briefing. May-20-2026: stats
  // reported 92 findings while sections actually carried 106 (92 CVE +
  // 14 ransomware claims). Sum from the actual sections instead so the
  // top-line matches what the body renders.
  const totalFindings = sections.reduce((n, s) => n + (s.findings?.length ?? 0), 0);
  return {
    // True total — every finding that appears in any rendered section.
    findings: totalFindings,
    sections: sections.length,
    // CVE-only count stays anchored to the CVE-derived array. The CVE
    // sections that get bucketed in buildSections all draw from this
    // same array, so the number is honest about the CVE subset.
    cves: findings.length,
    kevs: findings.filter((f) => f.source === 'CISA KEV').length,
    iocs: iocsTotal,
    // Severity rollup covers the CVE findings only because the ransomware
    // activity findings are all assigned severity='high' boilerplate;
    // including them would inflate the high count in a way that misleads
    // a reader who expects severity to mean CVSS-derived severity.
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };
}

// ---- weekly rollup ------------------------------------------------------
//
// Weekly briefings cover a 7-day historical window, but the abuse.ch / cvefeed
// / NVD-recent feeds are recent-only — a weekly rebuilt even a day late (e.g.
// the W22 cron that fired 2026-06-02 for the 2026-05-25→31 week) re-queries
// those feeds for a window they no longer cover and collapses to KEV-only with
// unknown severities. The faithful record of that week already lives in the 7
// daily briefings, so the weekly folds them in. See
// docs/superpowers/specs/2026-06-02-weekly-briefing-rollup-design.md.

export interface WeeklyDailyRollup {
  /** CVE-derived findings across the week, deduped by uppercased CVE id. */
  findings: BriefingFinding[];
  /** Ransomware-activity findings across the week, deduped by id. */
  ransomwareFindings: BriefingFinding[];
  /** Sum of each daily's unique IOC count (indicators observed across the week). */
  iocsTotal: number;
  /** Merged + capped IOC display buckets from the dailies. */
  iocBuckets: BriefingIocBuckets;
  /** Union of every daily's source labels. */
  sources: string[];
  /** How many daily rows contributed (0 ⇒ nothing to roll up). */
  dailyCount: number;
}

export interface WeeklyMergeInput {
  findings: BriefingFinding[];
  ransomwareFindings: BriefingFinding[];
  iocsRawTotal: number;
  iocBuckets: BriefingIocBuckets;
  sources: string[];
}

/** Source labels that denote IOC feeds (vs CVE/finding sources). */
const IOC_FEED_SOURCES = new Set(['URLhaus', 'MalwareBazaar', 'ThreatFox', 'TweetFeed']);

function isRansomwareFinding(sectionId: string, f: BriefingFinding): boolean {
  return sectionId === 'ransomware-activity' || f.id.startsWith('rw-') || f.source === 'ransomware.live';
}

/** Dedupe CVE findings by uppercased id, keeping the copy that carries a real CVSS. */
function dedupeCveFindings(findings: BriefingFinding[]): BriefingFinding[] {
  const byId = new Map<string, BriefingFinding>();
  for (const f of findings) {
    const key = f.id.toUpperCase();
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, f);
      continue;
    }
    // A KEV row whose NVD CVSS lookup failed has severity 'unknown' and no
    // cvss; the daily copy of the same CVE usually has a real score. Prefer it.
    if (!Number.isFinite(existing.cvss) && Number.isFinite(f.cvss)) byId.set(key, f);
  }
  return [...byId.values()];
}

function dedupeFindingsById(findings: BriefingFinding[]): BriefingFinding[] {
  const seen = new Set<string>();
  const out: BriefingFinding[] = [];
  for (const f of findings) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}

/** Union two bucket sets per type, dedupe by type|value, re-cap at 30. */
function mergeIocBuckets(a: BriefingIocBuckets, b: BriefingIocBuckets): BriefingIocBuckets {
  const merge = (xs: IocEntry[], ys: IocEntry[]): IocEntry[] => {
    const seen = new Set<string>();
    const out: IocEntry[] = [];
    for (const e of [...xs, ...ys]) {
      const k = `${e.type}|${e.value.trim().toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
      if (out.length >= 30) break;
    }
    return out;
  };
  return {
    urls: merge(a.urls, b.urls),
    domains: merge(a.domains, b.domains),
    ipv4s: merge(a.ipv4s, b.ipv4s),
    hashes: merge(a.hashes, b.hashes),
  };
}

/**
 * Fold the rolled-up dailies into the live weekly build. The result is always
 * a superset of the live build: an on-time weekly (live ≈ dailies) is barely
 * changed, a late/stale one inherits the dailies' richness. A rollup with no
 * dailies returns the live input untouched.
 */
export function mergeWeeklyWithDailies(live: WeeklyMergeInput, rollup: WeeklyDailyRollup): WeeklyMergeInput {
  if (rollup.dailyCount === 0) return live;
  return {
    findings: dedupeCveFindings([...live.findings, ...rollup.findings]),
    ransomwareFindings: dedupeFindingsById([...live.ransomwareFindings, ...rollup.ransomwareFindings]).slice(0, 60),
    // Raw indicators aren't recoverable from stored daily bodies (capped at 30
    // /type), so the honest weekly volume is the sum of daily unique counts.
    // max() keeps an on-time weekly's live dedup count when it happens to win.
    iocsRawTotal: Math.max(live.iocsRawTotal, rollup.iocsTotal),
    iocBuckets: mergeIocBuckets(live.iocBuckets, rollup.iocBuckets),
    sources: [...new Set([...live.sources, ...rollup.sources])],
  };
}

/** Read the 7 daily briefings inside [rangeStartIso, rangeEndIso] and roll them up. */
export async function aggregateWeeklyFromDailies(
  db: D1Database,
  rangeStartIso: string,
  rangeEndIso: string
): Promise<WeeklyDailyRollup> {
  const res = await db
    .prepare(
      'SELECT slug, stats_json, body FROM briefings WHERE type = ? AND date >= ? AND date <= ? ORDER BY date ASC'
    )
    .bind('daily', rangeStartIso, rangeEndIso)
    .all<{ slug: string; stats_json: string; body: string }>();
  const rows = res.results ?? [];

  const cveFindings: BriefingFinding[] = [];
  const ransomwareFindings: BriefingFinding[] = [];
  const sources = new Set<string>();
  let iocsTotal = 0;
  let iocBuckets: BriefingIocBuckets = { urls: [], domains: [], ipv4s: [], hashes: [] };

  for (const row of rows) {
    const b = safeJsonParse<Briefing | null>(row.body, null);
    if (!b) continue;
    for (const section of b.sections ?? []) {
      for (const f of section.findings ?? []) {
        if (isRansomwareFinding(section.id, f)) ransomwareFindings.push(f);
        else cveFindings.push(f);
      }
    }
    iocsTotal += b.stats?.iocs ?? 0;
    if (b.iocs) iocBuckets = mergeIocBuckets(iocBuckets, b.iocs);
    for (const s of b.sources ?? []) sources.add(s);
  }

  return {
    findings: dedupeCveFindings(cveFindings),
    ransomwareFindings: dedupeFindingsById(ransomwareFindings),
    iocsTotal,
    iocBuckets,
    sources: [...sources],
    dailyCount: rows.length,
  };
}

/**
 * True when a stored weekly is materially sparser than its constituent dailies
 * — the stale-rebuild signature. Lets the hourly self-heal re-build a weekly
 * the richness check (`isBriefingRich`) wrongly considers complete (e.g. W22's
 * 5 findings). Returns false when there's no weekly row (the build path handles
 * that) or no dailies to compare against.
 */
export async function weeklyUndercountsDailies(
  db: D1Database,
  weeklySlug: string,
  rangeStartIso: string,
  rangeEndIso: string
): Promise<boolean> {
  const weeklyRow = await db
    .prepare('SELECT stats_json FROM briefings WHERE slug = ?')
    .bind(weeklySlug)
    .first<{ stats_json?: string }>();
  if (!weeklyRow) return false;
  const weekly = safeJsonParse<{ findings?: number; iocs?: number }>(weeklyRow.stats_json, {});

  const res = await db
    .prepare('SELECT stats_json FROM briefings WHERE type = ? AND date >= ? AND date <= ?')
    .bind('daily', rangeStartIso, rangeEndIso)
    .all<{ stats_json: string }>();
  const rows = res.results ?? [];
  if (rows.length === 0) return false;

  let sumFindings = 0;
  let sumIocs = 0;
  for (const r of rows) {
    const s = safeJsonParse<{ findings?: number; iocs?: number }>(r.stats_json, {});
    sumFindings += s.findings ?? 0;
    sumIocs += s.iocs ?? 0;
  }

  const wFindings = weekly.findings ?? 0;
  const wIocs = weekly.iocs ?? 0;
  // A weekly is a near-superset of its dailies (cross-day dedup only shrinks it
  // modestly). Carrying <25% of the daily finding volume — or zero IOCs while
  // the week clearly had thousands — is the stale-rebuild bug, not a quiet week.
  return wFindings * 4 < sumFindings || (wIocs === 0 && sumIocs > 0);
}

// ---- main entry points --------------------------------------------------

export async function buildBriefing(
  type: BriefingType,
  anchor: Date = new Date(),
  opts: { nvdApiKey?: string; env?: Env } = {}
): Promise<Briefing> {
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
  const wrap = <T>(p: Promise<T>, fallback: T) =>
    p.then((v) => ({ ok: true, v })).catch(() => ({ ok: false, v: fallback }));
  const mtiEnv = opts.env;
  const [kevR, urlhaus, malwarebazaar, threatfox, tweetfeed, nvdR, ransomwareBundle, mtiCveItems, cvefeedItems] =
    await Promise.all([
      // KEV is the full catalog (window filtering happens below) — one key.
      // NVD is window-specific, so the cache key carries the range; the hourly
      // catch-up rebuilds the same slug/window and reuses any prior success.
      wrap(withLastGood(mtiEnv, 'briefing-kev', fetchKev), [] as KevEntry[]),
      fetchAbuseFeed('urlhaus').catch(() => [] as IocEntry[]),
      fetchAbuseFeed('malwarebazaar').catch(() => [] as IocEntry[]),
      fetchAbuseFeed('threatfox').catch(() => [] as IocEntry[]),
      fetchAbuseFeed('tweetfeed').catch(() => [] as IocEntry[]),
      wrap(
        withLastGood(mtiEnv, `briefing-nvd?s=${startMs}&e=${endMs}`, async () => {
          // NVD first; on throw OR empty, fall back to CIRCL exactly ONCE
          // (the old .then/.catch chain could call CIRCL twice). If CIRCL
          // also throws it propagates to withLastGood, which backstops with
          // the 14-day last-good cache (or rethrows → honest degrade).
          try {
            const r = await fetchNvdRecent(rangeStart, rangeEnd, opts.nvdApiKey);
            if (r.length > 0) return r;
          } catch {
            /* NVD unreachable — fall through to CIRCL */
          }
          return fetchCirclRecent(rangeStart, rangeEnd);
        }),
        [] as NvdCve[]
      ),
      // Ransomware activity — merged feed from 8 trackers (ransomware.live
      // public JSON dump + Ransomlook + cti.fyi + ransomfeed + ransomwatch +
      // andreafortuna + MTI REST + MTI scraper). Own briefing section (kept
      // out of `findings` so the CVE-oriented stats stay clean). The
      // previous MTI-only source silently zeroed out when
      // MYTHREATINTEL_API_TOKEN was unset; this one has no token
      // requirement (ransomware.live's free static dump is the primary)
      // and gives richer rows (country, sector, description, screenshot
      // links). MTI remains in the merge as one of the 8 sources.
      //
      // Never throws; on env-less / upstream failure returns the structured
      // empty body. We only need `.victims` for the section; groups +
      // sectors are forwarded to the LLM summary so the narrative can
      // highlight top active gangs.
      mtiEnv
        ? fetchRansomwareRecent(mtiEnv)
            .then((r) => r?.body)
            .catch(() => ({
              generated_at: '',
              source: '',
              count: 0,
              groups: [],
              sectors: [],
              victims: [] as RansomwareVictim[],
            }))
        : Promise.resolve({
            generated_at: '',
            source: '',
            count: 0,
            groups: [],
            sectors: [],
            victims: [] as RansomwareVictim[],
          }),
      mtiEnv
        ? fetchMtiSource(mtiEnv, 'cve', { limit: 200 })
            .then((r) => (r.ok ? (r.items as MtiCveRecord[]) : []))
            .catch(() => [] as MtiCveRecord[])
        : Promise.resolve([] as MtiCveRecord[]),
      // cvefeed.io high-severity RSS — 4th gap-filler. NVD/CIRCL have a 12-24h
      // indexer lag on very recent dates that used to silently produce a
      // "no high/critical CVEs published" briefing on days when CVEs DID
      // exist (e.g. 2026-05-23 where NVD returned totalResults=41 but an
      // empty vulnerabilities array). cvefeed publishes faster and never
      // had this issue.
      fetchCveFeedHighSeverity().catch(() => [] as CveFeedEntry[]),
    ]);
  // If BOTH primary finding sources are unreachable, this isn't a quiet day,
  // it's an outage. Earlier this threw and persisted NOTHING — but a
  // sustained NVD/KEV block then meant "no briefing at all" for the day
  // (worse UX, and the hourly catch-up could never make progress). Instead:
  // persist a clearly-degraded briefing (truthful summary, never a false
  // "all clear"), and let the hourly catch-up keep rebuilding it until
  // upstreams recover and a real briefing overwrites it.
  // `let` because the weekly daily-rollup below can clear it: if live KEV+NVD
  // were both unreachable but the rollup supplies the full week from the
  // persisted dailies, the briefing is NOT incomplete and must not carry the
  // "both sources unreachable" summary.
  let degraded = !kevR.ok && !nvdR.ok;
  const kev = kevR.v;
  const nvdRecent = nvdR.v;

  // Findings: KEV-added-in-window first (these are the high-signal items —
  // CISA only adds a CVE to KEV when active exploitation is observed), then
  // NVD-published-in-window CVEs of CVSS >= 7.0 (high+critical) that aren't
  // already covered by KEV. This is what fixes the "0 findings" daily briefing
  // on KEV-quiet days while still keeping the bar high — we don't surface
  // every newly-published CVE, only the ones that matter.
  const kevWindow = kev.filter((k) => withinRange(k.dateAdded, startMs, endMs));
  const nvdMap = await fetchNvdByIds(
    kevWindow.map((k) => k.cveID),
    opts.nvdApiKey
  );
  const kevFindings = kevWindow.map((k) => findingFromKev(k, nvdMap.get(k.cveID)));
  const kevIds = new Set(kevFindings.map((f) => f.id));
  const nvdFindings = nvdRecent
    .filter((c) => !kevIds.has(c.id))
    .map(findingFromNvd)
    .filter((f) => f.severity === 'critical' || f.severity === 'high');
  // MyThreatIntel CVE alerts published in-window, not already covered by
  // KEV/NVD, held to the same critical|high bar as the NVD additions.
  const existingCveIds = new Set([...kevFindings, ...nvdFindings].map((f) => f.id.toUpperCase()));
  const mtiCveFindings: BriefingFinding[] = [];
  for (const m of mtiCveItems) {
    const id = m.cve?.trim().toUpperCase();
    if (!id || existingCveIds.has(id)) continue;
    const pub = m.published?.trim();
    if (!pub || !withinRange(pub.replace(' ', 'T'), startMs, endMs)) continue;
    const score = m.score != null && m.score !== '' ? Number.parseFloat(String(m.score)) : NaN;
    const sevText = String(m.severity ?? '').toLowerCase();
    const severity: Severity = Number.isFinite(score)
      ? severityFromCvss(score)
      : sevText === 'critical' || sevText === 'high' || sevText === 'medium' || sevText === 'low'
        ? (sevText as Severity)
        : 'unknown';
    if (severity !== 'critical' && severity !== 'high') continue;
    existingCveIds.add(id);
    const desc = m.description?.trim() || id;
    mtiCveFindings.push({
      id,
      title: desc.length > 90 ? `${id}: ${desc.slice(0, 87)}…` : `${id}: ${desc}`,
      description: desc,
      severity,
      ...(Number.isFinite(score) ? { cvss: score } : {}),
      source: 'MyThreatIntel',
      source_url: m.url || 'https://mythreatintel.com/',
      mitre_techniques: [],
    });
  }
  // cvefeed.io entries — RSS feed is severity/high.xml so all entries are
  // implicitly high-severity. Filter to in-window and dedupe against existing
  // CVE IDs from KEV / NVD / MTI. cvefeed lacks a CVSS score, so we set
  // severity='high' to honour the bar without inventing a number.
  const cvefeedFindings: BriefingFinding[] = [];
  for (const e of cvefeedItems) {
    const id = e.cve_id.toUpperCase();
    if (existingCveIds.has(id)) continue;
    if (!withinRange(e.published, startMs, endMs)) continue;
    existingCveIds.add(id);
    const titleText = e.title?.trim() || id;
    cvefeedFindings.push({
      id,
      title: titleText.length > 90 ? `${id}: ${titleText.slice(0, 87)}…` : `${id}: ${titleText}`,
      description: `[cvefeed.io] ${titleText}`,
      severity: 'high',
      source: 'cvefeed.io',
      source_url: e.link,
      mitre_techniques: deriveMitreTechniques(titleText),
    });
  }
  let findings = [...kevFindings, ...nvdFindings, ...mtiCveFindings, ...cvefeedFindings];

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
  // Cross-source dedup: the same indicator (e.g. an IP in ThreatFox AND
  // TweetFeed, or a URL in URLhaus AND ThreatFox) must count ONCE. The old
  // code concatenated the four feeds raw, so the headline "IOCs" stat was
  // inflated by the cross-source overlap. Keep first occurrence — feeds are
  // concatenated in source-priority order (URLhaus → MB → ThreatFox →
  // TweetFeed). Per-source counts above stay raw (accurate per feed).
  const seenIoc = new Set<string>();
  const allIocs = [...urlhausMatched, ...malwarebazaarMatched, ...threatfoxMatched, ...tweetfeedMatched].filter((e) => {
    const k = `${e.type}|${e.value.trim().toLowerCase()}`;
    if (seenIoc.has(k)) return false;
    seenIoc.add(k);
    return true;
  });

  // Unique indicators in this window after cross-source dedup. The served
  // `iocs` payload below is then capped per-bucket so the briefing JSON
  // stays small, but the summary reports this real unique volume so readers
  // don't mistake the cap for the count.
  let iocsRawTotal = allIocs.length;
  let iocs = bucketIocs(allIocs);

  // IOC source attribution — only feeds that actually returned data this run.
  // KEV/NVD belong to the findings half of the briefing, not the IOC half.
  // Live windowed feeds only (post-2026-05-11 refactor).
  const iocSources: string[] = [];
  if (urlhausMatched.length > 0) iocSources.push('URLhaus');
  if (malwarebazaarMatched.length > 0) iocSources.push('MalwareBazaar');
  if (threatfoxMatched.length > 0) iocSources.push('ThreatFox');
  if (tweetfeedMatched.length > 0) iocSources.push('TweetFeed');

  // Ransomware victim claims → a dedicated section (kept out of `findings`
  // so the CVE-oriented stats stay clean). In-window only, sorted
  // newest-first, capped at 60 to keep payload bounded.
  //
  // Source: `fetchRansomwareRecent()` — 8 trackers merged (ransomware.live
  // free public JSON dump is the primary; Ransomlook, cti.fyi, ransomfeed,
  // ransomwatch, andreafortuna, MTI REST, MTI scraper fill gaps). Dedupe
  // already happens upstream in `mergeVictims()` by (group + victim + day),
  // so we can trust the input list.
  //
  // Dedupe key here is (group + victim + day) — guards against the rare
  // case where two trackers surfaced the same claim with slightly different
  // timestamps (merges that didn't catch them upstream).
  const ransomwareVictims = ransomwareBundle.victims;
  const ransomwareGroups = ransomwareBundle.groups;
  const ransomwareSectors = ransomwareBundle.sectors;
  let ransomwareFindings: BriefingFinding[] = [];
  const seenRwVictim = new Set<string>();
  for (const v of ransomwareVictims) {
    const discovered = v.discovered;
    if (!discovered) continue;
    if (!withinRange(discovered, startMs, endMs)) continue;
    const victim = v.victim?.trim();
    const group = v.group?.trim();
    if (!victim || !group) continue;
    const day = discovered.slice(0, 10); // YYYY-MM-DD
    const dedupeKey = `${group.toLowerCase()}|${victim.toLowerCase()}|${day}`;
    if (seenRwVictim.has(dedupeKey)) continue;
    seenRwVictim.add(dedupeKey);
    const desc = v.description?.trim();
    const location = v.country ? ` (${v.country})` : '';
    ransomwareFindings.push({
      id: `rw-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${victim
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40)}-${day}`,
      title: `${victim} — claimed by ${group}${location}`,
      description: desc && desc.length > 280 ? `${desc.slice(0, 277)}…` : desc || `${victim} listed by ${group}.`,
      severity: 'high',
      source: 'ransomware.live',
      source_url: v.source_url || 'https://www.ransomware.live/',
      mitre_techniques: [],
    });
    if (ransomwareFindings.length >= 60) break;
  }
  // Newest-first by claim date. The day is encoded as the id's trailing
  // `-YYYY-MM-DD`. The old `(b.title < a.title ? 0 : 1)` was not a valid
  // comparator — it never returned a negative, so TimSort left the array
  // effectively unsorted — and it keyed on victim name, not date.
  ransomwareFindings.sort((a, b) => {
    const dayA = a.id.slice(-10);
    const dayB = b.id.slice(-10);
    if (dayA === dayB) return a.title.localeCompare(b.title);
    return dayA < dayB ? 1 : -1; // newest day first
  });

  // Weekly briefings fold in the already-persisted daily briefings for the
  // window (see the "weekly rollup" block above). The live weekly feeds are
  // recent-only, so a weekly built even a day late re-queries a window they no
  // longer cover and collapses (the W22 bug). The dailies are the faithful
  // record, so merge them in: the result is always a superset of the live
  // build. On-time weeklies are unaffected; stale ones inherit the richness.
  if (type === 'weekly' && opts.env?.BRIEFINGS_DB) {
    const rollup = await aggregateWeeklyFromDailies(
      opts.env.BRIEFINGS_DB,
      isoDate(rangeStart),
      isoDate(new Date(rangeEnd.getTime() - 86400_000))
    );
    if (rollup.dailyCount > 0) {
      const merged = mergeWeeklyWithDailies(
        { findings, ransomwareFindings, iocsRawTotal, iocBuckets: iocs, sources: iocSources },
        rollup
      );
      findings = merged.findings;
      ransomwareFindings = merged.ransomwareFindings;
      iocsRawTotal = merged.iocsRawTotal;
      iocs = merged.iocBuckets;
      // Surface the daily IOC feeds in the source badges — the live weekly
      // window found none, but the dailies did.
      for (const s of rollup.sources) {
        if (IOC_FEED_SOURCES.has(s) && !iocSources.includes(s)) iocSources.push(s);
      }
      // The rollup supplied the full week from the dailies, so the briefing is
      // complete even if live KEV+NVD were unreachable at this rebuild. Clear
      // the degraded flag so it doesn't render the "both sources unreachable /
      // incomplete" summary over a briefing that actually has 700+ findings.
      if (findings.length > 0) degraded = false;
    }
  }

  const sections = buildSections(findings);
  if (ransomwareFindings.length > 0) {
    // Slice top groups/sectors (already top-N in the bundle) for the blurb.
    const topGroups = ransomwareGroups
      .slice(0, 3)
      .map((g) => `${g.group} (${g.count})`)
      .join(', ');
    const topSectors = ransomwareSectors
      .filter((s) => s.sector && s.sector !== 'Unknown' && s.count > 0)
      .slice(0, 3)
      .map((s) => `${s.sector} ${s.pct}%`)
      .join(', ');
    const blurbParts = [
      'Victim claims observed across ransomware.live, Ransomlook, cti.fyi, ransomfeed, ransomwatch, andreafortuna, and MyThreatIntel CTI feeds within this window.',
    ];
    if (topGroups) blurbParts.push(`Most active groups: ${topGroups}.`);
    if (topSectors) blurbParts.push(`Top sectors: ${topSectors}.`);
    sections.push({
      id: 'ransomware-activity',
      title: 'Ransomware activity (ransomware.live + peers)',
      count: ransomwareFindings.length,
      blurb: blurbParts.join(' '),
      findings: ransomwareFindings,
    });
  }

  const stats = buildStats(findings, sections, iocsRawTotal);
  const summaryArgs = {
    type,
    range_label: rangeLabel,
    findings,
    iocs,
    iocsRawTotal,
    iocSources,
    iocPerSource,
    // For the LLM narrative: top ransomware groups + sectors in the window.
    // Omitted from the deterministic template fallback (it already covers
    // CVEs and IoCs) but the LLM uses them to weave a "ransomware activity"
    // sentence when there are findings.
    ransomwareGroups,
    ransomwareSectors,
    ransomwareTotal: ransomwareFindings.length,
  };
  const executive_summary = degraded
    ? `This ${type} briefing is incomplete: both CISA KEV and NVD were unreachable from the edge at build time (${rangeLabel}). This is an upstream-availability gap, NOT an all-clear — do not read the absence of findings as "no new vulnerabilities". The briefing rebuilds automatically every hour and will be replaced as soon as the feeds respond.`
    : await buildLlmExecutiveSummary(summaryArgs, opts.env);

  const techniqueSet = new Set<string>();
  for (const f of findings) for (const t of f.mitre_techniques) techniqueSet.add(t);

  const sources: string[] = [];
  // Derive source badges from the final `findings` (which, for weeklies, has
  // the dailies merged in) rather than the live-only arrays — otherwise a
  // stale weekly that inherited NVD/cvefeed/MTI findings from its dailies would
  // drop those badges. "NVD" means CVE rows from NVD/CIRCL specifically;
  // cvefeed alone shouldn't masquerade as NVD. Each is listed independently.
  if (findings.some((f) => f.source === 'CISA KEV')) sources.push('CISA KEV');
  if (findings.some((f) => f.source === 'NVD')) sources.push('NVD');
  if (findings.some((f) => f.source === 'cvefeed.io')) sources.push('cvefeed.io');
  if (findings.some((f) => f.source === 'MyThreatIntel')) sources.push('MyThreatIntel');
  if (ransomwareFindings.length > 0) sources.push('ransomware.live');
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
    ...(degraded ? { degraded: true } : {}),
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
export const BRIEFING_MAX_AGE_DAYS = 30;

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** A briefing is "rich" if it carries any finding or any IOC. */
export function isBriefingRich(statsJson: string | null | undefined): boolean {
  const s = safeJsonParse<{ findings?: number; iocs?: number }>(statsJson, {});
  return (s.findings ?? 0) > 0 || (s.iocs ?? 0) > 0;
}

/** True when the stored briefing body is flagged `degraded` (KEV+NVD unreachable at build). */
export function isBriefingDegraded(body: string | null | undefined): boolean {
  return safeJsonParse<{ degraded?: boolean }>(body, {}).degraded === true;
}

/**
 * Decide whether the hourly self-heal should (re)build a briefing slug given
 * the row currently stored for it.
 *
 * The non-obvious case this exists for: a DEGRADED briefing (CISA KEV + NVD
 * both unreachable at build time) still carries IOCs from the abuse.ch feeds,
 * which are fetched independently of the CVE sources. A naive "has findings or
 * IOCs" richness check therefore reports a degraded briefing as complete and
 * the self-heal skips it — so once a weekly degraded (e.g. weekly-2026-W22) it
 * stayed degraded indefinitely even after upstreams recovered, because the
 * hourly catch-up saw iocs>0 and short-circuited. A degraded row must keep
 * being eligible for rebuild, subject only to a cooldown so back-to-back hours
 * don't hammer the build while upstreams are still down.
 */
export function briefingNeedsHeal(
  row: { stats_json?: string | null; body?: string | null } | null | undefined,
  opts: { now: number; cooldownMs?: number }
): boolean {
  if (!row) return true; // nothing stored yet — build it
  if (!isBriefingDegraded(row.body)) {
    // Healthy row: only rebuild if it's empty (no findings and no IOCs).
    return !isBriefingRich(row.stats_json);
  }
  // Degraded row: rebuild unless we tried within the cooldown window. The
  // build timestamp lives INSIDE the body JSON (the briefings table has no
  // generated_at column — reading a non-existent column made the old cooldown
  // a silent no-op).
  const cooldownMs = opts.cooldownMs ?? 0;
  if (cooldownMs <= 0) return true;
  const last = Date.parse(safeJsonParse<{ generated_at?: string }>(row.body, {}).generated_at ?? '');
  if (!Number.isFinite(last)) return true;
  return opts.now - last >= cooldownMs;
}

/**
 * True when a daily carries IOCs but ZERO findings — the NVD-indexer-lag
 * signature. NVD (and occasionally cvefeed.io) hadn't indexed the day's CVEs
 * when the daily was first built at 00:30; by a later hourly catch-up they
 * usually have, and since live IOC/CVE feeds still cover *yesterday*, a rebuild
 * recovers the missing high/critical findings. `isBriefingRich` counts iocs>0
 * as complete and `briefingNeedsHeal` would therefore skip these forever
 * (that's why early-May dailies froze at 0 findings), so the daily self-heal
 * needs this extra signal. Cooldown-gated so a genuinely CVE-quiet day (IOCs
 * but no high/critical CVEs) doesn't trigger an hourly rebuild storm. Only
 * meaningful for *recent* dailies — re-running it on an old window can't help
 * because the live feeds have rolled past it (the caller scopes it to
 * yesterday).
 */
export function dailyNeedsCveReenrich(
  row: { stats_json?: string | null; body?: string | null } | null | undefined,
  opts: { now: number; cooldownMs?: number }
): boolean {
  if (!row) return false; // no row → briefingNeedsHeal builds it from scratch
  const s = safeJsonParse<{ findings?: number; iocs?: number }>(row.stats_json, {});
  if ((s.findings ?? 0) > 0 || (s.iocs ?? 0) <= 0) return false;
  const cooldownMs = opts.cooldownMs ?? 0;
  if (cooldownMs <= 0) return true;
  const last = Date.parse(safeJsonParse<{ generated_at?: string }>(row.body, {}).generated_at ?? '');
  if (!Number.isFinite(last)) return true;
  return opts.now - last >= cooldownMs;
}

export async function writeBriefing(
  db: D1Database,
  briefing: Briefing,
  options?: { skipIfExists?: boolean }
): Promise<{ written: boolean; reason?: string }> {
  if (options?.skipIfExists) {
    const existing = await db.prepare('SELECT 1 FROM briefings WHERE slug = ?').bind(briefing.slug).first();
    if (existing) return { written: false, reason: 'already_exists' };
  }

  // Don't clobber a good briefing with an empty one. The daily cron rebuilds
  // a slug from live KEV/NVD/abuse.ch; if those feeds are quiet or time out
  // at build time the result is 0 findings / 0 IOCs. INSERT OR REPLACE would
  // overwrite the previously-rich briefing for that slug with the empty
  // rebuild — which is exactly how daily-2026-05-16 lost its 29 findings.
  // An empty briefing is only persisted when no row exists yet (a genuinely
  // quiet day still gets a placeholder), never as a downgrade.
  const isEmpty = briefing.stats.findings === 0 && briefing.stats.iocs === 0;
  if (isEmpty) {
    const prior = await db
      .prepare('SELECT stats_json FROM briefings WHERE slug = ?')
      .bind(briefing.slug)
      .first<{ stats_json: string }>();
    if (prior) {
      const ps = safeJsonParse<Partial<BriefingStats>>(prior.stats_json, {});
      if ((ps.findings ?? 0) > 0 || (ps.iocs ?? 0) > 0) {
        return { written: false, reason: 'kept_richer_existing' };
      }
    }
  }

  await db
    .prepare(
      `INSERT OR REPLACE INTO briefings (slug, type, title, date, date_range, range_start, range_end, stats_json, sources_json, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      briefing.slug,
      briefing.type,
      briefing.title,
      briefing.date,
      briefing.date_range,
      briefing.range_start,
      briefing.range_end,
      JSON.stringify(briefing.stats),
      JSON.stringify(briefing.sources),
      JSON.stringify(briefing)
    )
    .run();

  // Invalidate the per-briefing intel-bundle (the IntelCard on the detail
  // page). It's cached in `intel_bundles` by (source_id, item_ref), and
  // NOTHING refreshes it when the briefing is rebuilt: the warmer skips slugs
  // that already have a bundle, and the POST handler returns the cached row
  // without comparing body hashes. So a rebuilt briefing (W22 degraded→rich, a
  // daily NVD-lag re-enrich, any heal) keeps serving the OLD bundle summary —
  // e.g. the stale "this briefing is incomplete" card over a 728-finding week.
  // Drop the row so the card recomputes fresh on the next view / warm pass.
  // Best-effort: a failure here must never fail the briefing write.
  try {
    await db
      .prepare(`DELETE FROM intel_bundles WHERE source_id = 'briefings' AND item_ref = ?`)
      .bind(briefing.slug)
      .run();
  } catch {
    /* intel_bundles table may not exist in some envs (e.g. tests) — non-fatal */
  }
  return { written: true };
}

export async function sweepOldBriefings(
  db: D1Database,
  maxAgeDays = BRIEFING_MAX_AGE_DAYS,
  now: Date = new Date()
): Promise<{ deleted: string[]; kept: number }> {
  const cutoff = new Date(now.getTime() - maxAgeDays * 86400_000).toISOString().slice(0, 10);
  const toDelete = await db.prepare('SELECT slug FROM briefings WHERE date < ?').bind(cutoff).all<{ slug: string }>();
  const deleted = (toDelete.results ?? []).map((r) => r.slug);
  if (deleted.length > 0) {
    await db.prepare('DELETE FROM briefings WHERE date < ?').bind(cutoff).run();
  }
  const remaining = await db.prepare('SELECT COUNT(*) as count FROM briefings').first<{ count: number }>();
  return { deleted, kept: (remaining as { count: number } | null)?.count ?? 0 };
}

export async function listBriefings(
  db: D1Database,
  filter?: { type?: 'daily' | 'weekly' | 'landscape'; q?: string; limit?: number; offset?: number }
): Promise<{ items: Array<{ slug: string; metadata: Record<string, unknown> }>; total: number }> {
  const limit = filter?.limit ?? 50;
  const offset = filter?.offset ?? 0;

  // One WHERE clause shared by the COUNT and the page query, so `total` always
  // reflects the same (filtered) universe as the rows — otherwise the client
  // paginates/searches against a count that doesn't match what it can see.
  const where: string[] = [];
  const whereParams: unknown[] = [];
  if (filter?.type) {
    where.push('type = ?');
    whereParams.push(filter.type);
  }
  const q = filter?.q?.trim();
  if (q) {
    // Escape LIKE wildcards in user input, then match title / date_range / slug.
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push("(title LIKE ? ESCAPE '\\' OR date_range LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')");
    whereParams.push(like, like, like);
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const countRow = await db
    .prepare(`SELECT COUNT(*) as cnt FROM briefings${whereSql}`)
    .bind(...whereParams)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  const result = await db
    .prepare(
      `SELECT slug, type, title, date, date_range, range_end, stats_json, sources_json FROM briefings${whereSql} ORDER BY range_end DESC LIMIT ? OFFSET ?`
    )
    .bind(...whereParams, limit, offset)
    .all<{
      slug: string;
      type: string;
      title: string;
      date: string;
      date_range: string;
      range_end: string;
      stats_json: string;
      sources_json: string;
    }>();
  return {
    items: (result.results ?? []).map((row) => ({
      slug: row.slug,
      metadata: {
        type: row.type,
        title: row.title,
        date: row.date,
        range_end: row.range_end,
        date_range: row.date_range,
        stats: safeJsonParse(row.stats_json, {}),
        sources: safeJsonParse(row.sources_json, []),
      },
    })),
    total,
  };
}

export async function readBriefing(db: D1Database, slug: string): Promise<Briefing | null> {
  const row = await db.prepare('SELECT body FROM briefings WHERE slug = ?').bind(slug).first<{ body: string }>();
  if (!row) return null;
  return safeJsonParse((row as { body: string }).body, null);
}

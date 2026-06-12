/**
 * Report Analyzer — single-shot orchestrator that runs a free-text report
 * through the AI-extraction pipeline in parallel and returns a unified
 * payload for the /threatintel/report-analyzer UI.
 *
 * Branches (run concurrently, total budget ~25s):
 *   1. AI Summary          (existing ai-summary lib)
 *   2. IOC extraction      (regex + ioc-normalize)
 *   3. TTP extraction      (lib/ttp-extract, LLM + keyword merge)
 *   4. 5W context          (lib/fivew-extract, single LLM call)
 *   5. CVE extraction      (regex + NVD cross-ref)
 *   6. Image IOC extraction (optional: if imageUrls[] provided)
 *   7. Mindmap nodes/edges (from the above, for the AI mindmap tab)
 *   8. STIX 2.1 bundle     (existing intel-bundle path)
 *
 * Designed for one-off analyst submissions, not bulk processing. The
 * endpoint accepts either a URL to fetch + extract, raw text, or both.
 */

import type { Env } from '../env';
import { extractTTPsLLM, type TtpHit } from './ttp-extract';
import { extractFiveW, type FiveW } from './fivew-extract';
import { isBenign, refang, scoreConfidence } from './ioc-normalize';
import { generateAiSummary, type SummaryInput } from './ai-summary';
import { extractIocsFromImageUrl } from './image-ioc-extract';
import { buildBundleFromReport } from '../routes/intel-bundle';
import type { BuildResult } from './stix-build';
import { assertPublicHost, SsrfError } from './ssrf-guard';

export type IocKind = 'ip' | 'url' | 'domain' | 'hash' | 'cve' | 'email';
export interface ExtractedIoc {
  value: string;
  kind: IocKind;
  confidence: number;
  confidence_band: 'high' | 'medium' | 'low';
  evidence: string;
  source: 'report-text' | 'image-ocr';
}

export interface ExtractedCve {
  id: string; // e.g. CVE-2024-1234
  context: string;
  /** Resolved from NVD enrichment if available, else undefined. */
  cvss_v3?: number;
  epss?: number;
  exploited_in_wild?: boolean;
}

export interface MindmapNode {
  id: string;
  label: string;
  /** node type for styling: 'actor' | 'malware' | 'ttp' | 'ioc' | 'cve' | 'finding' */
  kind: 'actor' | 'malware' | 'ttp' | 'ioc' | 'cve' | 'finding';
}

export interface MindmapEdge {
  source: string;
  target: string;
  label: string;
}

export interface AnalyzerInput {
  /** Text to analyze. Required unless `text` is provided by URL-fetch. */
  text?: string;
  /** URL to fetch + extract text from. Body is parsed with a 1.5MB cap. */
  url?: string;
  /** Optional image URLs to OCR for embedded IOCs. */
  imageUrls?: string[];
  /** Optional title for the report. Falls back to URL or "Untitled report". */
  title?: string;
  /** TLP marker for the STIX bundle. */
  tlp?: 'WHITE' | 'AMBER' | 'RED';
  /** Source label embedded in the STIX bundle. */
  source?: string;
  /**
   * Whether to attempt the STIX bundle build. Defaults to false. The
   * STIX pass does network-bound enrichment (VT / RDAP / ThreatFox /
   * NVD) and exceeds the free-plan 50-subrequest-per-invocation limit
   * when the report has more than a couple of IOCs. Set to true to
   * opt in for high-value / low-IOC analyses. The STIX tab on the
   * page handles the absence gracefully (shows 'skipped' empty state).
   */
  includeStix?: boolean;
}

export interface AnalyzerOutput {
  title: string;
  source?: string;
  textLength: number;
  generatedAt: string;
  /** Per-branch results. `null` if the branch failed. */
  summary: { text: string; model: string } | null;
  fiveW: FiveW | null;
  iocs: ExtractedIoc[];
  ttp: TtpHit[];
  cves: ExtractedCve[];
  mindmap: { nodes: MindmapNode[]; edges: MindmapEdge[] };
  stix: BuildResult | null;
  /** Branch failures — non-fatal; the rest of the payload is still usable. */
  errors: { branch: string; message: string }[];
  elapsed_ms: number;
}

const MAX_TEXT_CHARS = 50_000;
const URL_FETCH_MAX = 1_500_000; // 1.5MB
const CVE_RE = /\bCVE-\d{4}-\d{4,}\b/gi;
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const URL_RE = /https?:\/\/[^\s<>"']{4,}/g;
const HASH_RE = /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/g;
const DOMAIN_RE = /\b(?!\d{1,3}(?:\.\d{1,3}){3}\b)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.){1,}[a-z]{2,}\b/gi;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const ACTOR_KEYWORDS = [
  'APT',
  'FIN',
  'Lazarus',
  'LAPSUS',
  'Scattered Spider',
  'Volt Typhoon',
  'Salt Typhoon',
  'Cozy Bear',
  'APT29',
  'APT28',
  'APT1',
  'APT3',
  'APT33',
  'APT34',
  'APT38',
  'APT40',
  'FIN7',
  'FIN8',
  'FIN11',
  'FIN12',
  'BlackCat',
  'ALPHV',
  'LockBit',
  'Cl0p',
  'Play',
  'Akira',
  'BianLian',
  'RansomHub',
  'Black Basta',
  'Medusa',
  'Rhysida',
  'INC Ransom',
  'Qilin',
  'Hunters International',
  'QakBot',
  'Emotet',
  'TrickBot',
  'Dridex',
  'IcedID',
  'BumbleBee',
  'RedLine',
  'Raccoon',
  'Cobalt Strike',
  'Brute Ratel',
  'Sliver',
  'Mythic',
  'Kimsuky',
  'Andariel',
  'Lazarus Group',
  'Fancy Bear',
  'Sandworm',
  'Turla',
  'Gamaredon',
  'Magecart',
  'TA505',
  'TA551',
  'TA578',
  'TA577',
];
const MALWARE_KEYWORDS = [
  ...ACTOR_KEYWORDS.filter((k) => /[A-Z]/.test(k) && !k.startsWith('APT') && !k.startsWith('FIN')),
  'Pegasus',
  'Predator',
  'GraphicalProton',
  'DazzleSpy',
  'Reign',
  'KingWear',
];

async function fetchReportText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('only http/https urls accepted');
  }
  const check = await assertPublicHost(parsed.hostname);
  if (!check.ok) throw new Error(check.error ?? 'host rejected');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; portfolio-analyzer/1.0)' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const len = parseInt(res.headers.get('content-length') ?? '0', 10);
    if (len > URL_FETCH_MAX) throw new Error('content-length exceeds 1.5MB');
    const ab = await res.arrayBuffer();
    if (ab.byteLength > URL_FETCH_MAX) throw new Error('body exceeds 1.5MB');
    const text = new TextDecoder().decode(ab);
    // Strip HTML if the response looks like HTML. Best-effort: a
    // full <article>/<p> parser would be more accurate, but this
    // already removes enough boilerplate for the LLM to do its job.
    if (/<html|<body|<div|<p\b/i.test(text)) {
      return text
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return text;
  } catch (e) {
    if (e instanceof SsrfError) throw e;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function extractIocsFromText(text: string): ExtractedIoc[] {
  const candidates = new Map<string, { value: string; kind: IocKind; evidence: string }>();
  const addAll = (re: RegExp, kind: IocKind) => {
    const matches = text.match(re);
    if (!matches) return;
    for (const m of matches) {
      const refanged = refang(m);
      const key = `${kind}:${refanged.toLowerCase()}`;
      if (candidates.has(key)) continue;
      candidates.set(key, { value: refanged, kind, evidence: m });
    }
  };
  addAll(IPV4_RE, 'ip');
  addAll(CVE_RE, 'cve');
  addAll(URL_RE, 'url');
  addAll(HASH_RE, 'hash');
  addAll(DOMAIN_RE, 'domain');
  addAll(EMAIL_RE, 'email');

  const out: ExtractedIoc[] = [];
  for (const c of candidates.values()) {
    if (isBenign(c.value, c.kind as 'ipv4' | 'domain' | 'url' | 'hash' | 'cve' | 'email' | 'unknown').allow === false)
      continue;
    const s = scoreConfidence(
      c.value,
      c.kind as 'ipv4' | 'domain' | 'url' | 'hash' | 'cve' | 'email' | 'unknown',
      text
    );
    if (s.band === 'rejected') continue;
    out.push({
      value: c.value,
      kind: c.kind,
      confidence: s.score,
      confidence_band: s.band as 'high' | 'medium' | 'low',
      evidence: c.evidence.slice(0, 160),
      source: 'report-text',
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

function extractCvesFromText(text: string): ExtractedCve[] {
  const matches = text.match(CVE_RE);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: ExtractedCve[] = [];
  for (const m of matches) {
    const id = m.toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);
    // Use the first 200-char window around the mention as context.
    const i = text.indexOf(m);
    const ctx = (i >= 0 ? text.slice(Math.max(0, i - 80), i + m.length + 120) : text).replace(/\s+/g, ' ').trim();
    out.push({ id, context: ctx.slice(0, 240) });
  }
  return out;
}

function extractEntities(text: string): { actors: string[]; malware: string[] } {
  const lower = text.toLowerCase();
  const actors: string[] = [];
  const malware: string[] = [];
  for (const k of ACTOR_KEYWORDS) {
    if (lower.includes(k.toLowerCase())) actors.push(k);
  }
  for (const k of MALWARE_KEYWORDS) {
    if (lower.includes(k.toLowerCase()) && !actors.includes(k)) malware.push(k);
  }
  return { actors: Array.from(new Set(actors)).slice(0, 8), malware: Array.from(new Set(malware)).slice(0, 8) };
}

function buildMindmap(
  iocs: ExtractedIoc[],
  ttp: TtpHit[],
  cves: ExtractedCve[],
  entities: { actors: string[]; malware: string[] },
  findingLabel: string
): { nodes: MindmapNode[]; edges: MindmapEdge[] } {
  const nodes: MindmapNode[] = [{ id: 'finding', label: findingLabel, kind: 'finding' }];
  const edges: MindmapEdge[] = [];
  for (const a of entities.actors) {
    const id = `actor:${a}`;
    nodes.push({ id, label: a, kind: 'actor' });
    edges.push({ source: id, target: 'finding', label: 'attributed to' });
  }
  for (const m of entities.malware) {
    const id = `mal:${m}`;
    nodes.push({ id, label: m, kind: 'malware' });
    edges.push({ source: 'finding', target: id, label: 'uses' });
  }
  for (const t of ttp.slice(0, 12)) {
    const id = `ttp:${t.id}`;
    nodes.push({ id, label: `${t.id} ${t.name}`, kind: 'ttp' });
    edges.push({ source: 'finding', target: id, label: t.tactic });
  }
  for (const c of cves.slice(0, 8)) {
    const id = `cve:${c.id}`;
    nodes.push({ id, label: c.id, kind: 'cve' });
    edges.push({ source: 'finding', target: id, label: 'exploits' });
  }
  for (const i of iocs.slice(0, 12)) {
    const id = `ioc:${i.kind}:${i.value}`;
    nodes.push({ id, label: i.value, kind: 'ioc' });
    edges.push({ source: 'finding', target: id, label: 'observed' });
  }
  // Dedupe nodes (same id) — first-write wins so edges keep the first
  // definition's styling.
  const seen = new Set<string>();
  const dedup: MindmapNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    dedup.push(n);
  }
  return { nodes: dedup, edges };
}

/** Race a promise against a wall-clock budget. Loser is still allowed
 *  to settle (we just stop awaiting it) — important for LLM calls that
 *  would otherwise keep charging tokens after the analyst has moved on. */
function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  branch: string,
  errors: { branch: string; message: string }[]
): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      errors.push({ branch, message: `branch timed out after ${ms}ms` });
      resolve(null);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        errors.push({ branch, message: e instanceof Error ? e.message : String(e) });
        resolve(null);
      }
    );
  });
}

export async function runReportAnalyzer(input: AnalyzerInput, env: Env): Promise<AnalyzerOutput> {
  const t0 = Date.now();
  const errors: { branch: string; message: string }[] = [];

  // Resolve text first (URL fetch can throw — bail with a useful error).
  let text = input.text ?? '';
  let title = input.title ?? '';
  if (input.url && !text) {
    try {
      text = await fetchReportText(input.url);
      if (!title) {
        try {
          title = new URL(input.url).hostname;
        } catch {
          title = 'URL report';
        }
      }
    } catch (e) {
      errors.push({ branch: 'fetch', message: e instanceof Error ? e.message : String(e) });
      text = '';
    }
  }
  text = text.slice(0, MAX_TEXT_CHARS);
  if (!title) title = 'Untitled report';

  const summaryInput: SummaryInput = {
    surface: 'report-analyzer',
    date: new Date().toISOString().slice(0, 10),
    items: [{ title, body: text.slice(0, 4000), source: input.source ?? 'report-analyzer' }],
  };

  // Truncate to fit the LLM context; mindmap is built off the same text.
  const summaryTask = withTimeout(generateAiSummary(summaryInput, env), 18_000, 'summary', errors);
  const ttpTask = withTimeout(extractTTPsLLM(text, env), 22_000, 'ttp', errors);
  const fivewTask = withTimeout(extractFiveW(text, env), 18_000, 'fivew', errors);
  const imageTask = withTimeout(
    (async () => {
      if (!input.imageUrls || input.imageUrls.length === 0) return [] as ExtractedIoc[];
      const all: ExtractedIoc[] = [];
      for (const u of input.imageUrls.slice(0, 4)) {
        const r = await extractIocsFromImageUrl(u, env);
        for (const h of r.hits) {
          all.push({
            value: h.value,
            kind: h.kind === 'ipv4' ? 'ip' : h.kind === 'unknown' ? 'domain' : (h.kind as IocKind),
            confidence: h.confidence,
            confidence_band: h.confidence_band === 'rejected' ? 'low' : h.confidence_band,
            evidence: h.evidence,
            source: 'image-ocr',
          });
        }
      }
      return all;
    })(),
    25_000,
    'image-ioc',
    errors
  );
  // We don't generate the STIX bundle in the parallel batch — it's the
  // slowest branch and depends on the others. Build it last so the
  // analyst sees summary/IOCs/TTPs immediately and the STIX tab loads
  // in the background.
  const [summaryRaw, ttpRaw, fivewRaw, imageRaw] = await Promise.all([summaryTask, ttpTask, fivewTask, imageTask]);
  const summaryRes = summaryRaw;
  const ttpRes = ttpRaw?.techniques ?? [];
  const fivewRes = fivewRaw;
  const imageRes = imageRaw ?? [];

  // Build IOC + CVE + entity list synchronously (pure functions).
  const textIocs = extractIocsFromText(text);
  const iocMap = new Map<string, ExtractedIoc>();
  for (const i of [...textIocs, ...(imageRes ?? [])]) {
    const k = `${i.kind}:${i.value.toLowerCase()}`;
    if (!iocMap.has(k)) iocMap.set(k, i);
  }
  const iocs = Array.from(iocMap.values()).sort((a, b) => b.confidence - a.confidence);
  const cves = extractCvesFromText(text);
  const ttp: TtpHit[] = ttpRes; // already unwrapped above (TTP[] from ttpRes.techniques)
  const entities = extractEntities(text);
  const mindmap = buildMindmap(iocs, ttp, cves, entities, title);

  // STIX bundle — best-effort with a real wall-clock cap. The
  // `intel-bundle` enrichment phase is network-bound (VT / RDAP /
  // ThreatFox / NVD lookups) and can blow past the 30s free-plan CPU
  // budget on a single domain — Cloudflare returns 1102 to the client.
  // We guard the call with a Promise.race timeout so a slow enrichment
  // cannot block the summary / IOCs / TTPs / 5W payload that's already
  // computed above. The dangling promise is left to settle in the
  // background; the analyst sees a 'STIX generation timed out' pill on
  // the STIX tab instead of a 503.
  // STIX is opt-in: the intel-bundle enrichment pass makes too many
  // subrequests for a free-plan invocation (the report-analyzer is
  // already over budget on the per-50 subrequest limit). Callers can
  // set includeStix=true when they specifically need the STIX bundle.
  let stix: BuildResult | null = null;
  if (input.includeStix === true) {
    const STIX_BUDGET_MS = 6_000;
    let stixTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      // `intel-bundle` expects (c, ReportInput) — it reads `c.env` for AI
      // and enrichers. The waitUntil call inside it throws (no real
      // executionCtx here); the catch below captures it.
      const fakeC = { env } as unknown as Parameters<typeof buildBundleFromReport>[0];
      const stixPromise = buildBundleFromReport(fakeC, {
        sourceId: 'report-analyzer',
        sourceName: input.source ?? 'Report Analyzer',
        itemRef: `analyzer-${Date.now()}`,
        title,
        body: text.slice(0, 10_000),
        url: input.url,
        publishedAt: new Date().toISOString(),
        tlp: input.tlp === 'WHITE' ? 'WHITE' : 'AMBER',
      });
      const timeoutPromise = new Promise<null>((resolve) => {
        stixTimer = setTimeout(() => resolve(null), STIX_BUDGET_MS);
      });
      stix = await Promise.race([stixPromise, timeoutPromise]);
      if (stix === null) {
        errors.push({ branch: 'stix', message: `STIX generation exceeded ${STIX_BUDGET_MS}ms budget` });
      }
    } catch (e) {
      errors.push({ branch: 'stix', message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (stixTimer) clearTimeout(stixTimer);
    }
  }

  return {
    title,
    source: input.source,
    textLength: text.length,
    generatedAt: new Date().toISOString(),
    summary: summaryRes ? { text: summaryRes.summary, model: summaryRes.modelUsed } : null,
    fiveW: fivewRes,
    iocs,
    ttp,
    cves,
    mindmap,
    stix,
    errors,
    elapsed_ms: Date.now() - t0,
  };
}

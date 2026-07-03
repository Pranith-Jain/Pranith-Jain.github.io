/**
 * Report Analyzer — single-shot orchestrator that runs a free-text report
 * through the AI-extraction pipeline in parallel and returns a unified
 * payload for the /threatintel/report-analyzer UI.
 *
 * Branches (run concurrently, total budget ~30s):
 *   1. AI Summary          (existing ai-summary lib)
 *   2. IOC extraction      (regex + ioc-normalize)
 *   3. TTP extraction      (lib/ttp-extract, LLM + keyword merge)
 *   4. 5W context          (lib/fivew-extract, single LLM call)
 *   5. CVE extraction      (regex + NVD cross-ref)
 *   6. Image IOC extraction (optional: if imageUrls[] provided)
 *   7. Mindmap nodes/edges (from the above, for the AI mindmap tab)
 *   8. Detection Opportunities (lib/detection-extract, LLM call)
 *   9. Conclusion           (lib/conclusion-extract, LLM call)
 *  10. STIX 2.1 bundle     (existing intel-bundle path)
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
import { extractDetectionOpportunities, type DetectionOpportunities } from './detection-extract';
import { extractConclusion, type Conclusion } from './conclusion-extract';
import { buildBundleFromReport } from '../routes/intel-bundle';
import type { BuildResult } from './stix-build';
import { pinnedFetchFollow, SsrfError } from './ssrf-guard';

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
   * STIX pass does network-bound enrichment (Maltiverse / RDAP / NVD)
   * and exceeds the free-plan 50-subrequest-per-invocation limit
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
  /** Diamond Model — derived from extracted entities + TTPs + IOCs + 5W. */
  diamond: DiamondModel | null;
  /** Attack Flow (kill chain phases) — TTPs bucketed by MITRE tactic. */
  attackFlow: AttackFlowPhase[];
  /** Detection Opportunities — SIEM rules, monitoring, CLI commands. */
  detection: DetectionOpportunities | null;
  /** Conclusion — key takeaways, recommended actions, risk assessment. */
  conclusion: Conclusion | null;
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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    // SSRF-safe: pinnedFetchFollow re-validates + IP-pins EVERY hop, so a
    // public URL that 302s to a private/metadata host (or DNS-rebinds between
    // check and fetch) is blocked. Do NOT swap this for a raw fetch() — the
    // raw `assertPublicHost(host) + fetch(url, {redirect:'follow'})` pattern
    // it replaced was a full read-SSRF (TOCTOU + unvalidated redirect target).
    const res = await pinnedFetchFollow(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; portfolio-analyzer/1.0)' },
      signal: ctrl.signal,
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

  // Detection and Conclusion run AFTER summary/TTP resolve so they get
  // proper context. They fan out in parallel with each other.
  const detectionTask = withTimeout(
    extractDetectionOpportunities(text, ttpRes, env).catch(() => null),
    22_000,
    'detection',
    errors
  );
  const conclusionTask = withTimeout(
    extractConclusion(text, summaryRes?.summary ?? '', env).catch(() => null),
    18_000,
    'conclusion',
    errors
  );
  const [detectionRes, conclusionRes] = await Promise.all([detectionTask, conclusionTask]);

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
  // `intel-bundle` enrichment phase is network-bound (Maltiverse / RDAP /
  // NVD lookups) and can blow past the 30s free-plan CPU
  // budget on a single domain — Cloudflare returns 1102 to the client.
  // We guard the call with a Promise.race timeout so a slow enrichment
  // cannot block the summary / IOCs / TTPs / 5W payload that's already
  // computed above. The dangling promise is left to settle in the
  // background; the analyst sees a 'STIX generation timed out' pill on
  // the STIX tab instead of a 503.
  // STIX is opt-in: the intel-bundle enrichment pass (Maltiverse bulk)
  // makes subrequests for a free-plan invocation (the report-analyzer is
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
    diamond: buildDiamondModel(entities, ttp, iocs, fivewRes, text),
    attackFlow: buildAttackFlow(ttp),
    detection: detectionRes,
    conclusion: conclusionRes,
    stix,
    errors,
    elapsed_ms: Date.now() - t0,
  };
}

/* ─── Diamond Model + Attack Flow derivations ──────────────────────────
 * Both are pure derivations from the already-extracted TTP / IOC / 5W /
 * entity data. No new LLM calls. The Diamond Model and Attack Flow are
 * standard CTI views; the PDF the user shared (TI-Mindmap-HUB Lazarus
 * report) uses them as section 4 and section 8, so we mirror that shape
 * to keep the in-platform report visually equivalent to the upstream
 * reference.
 */

/** Tactic order matching the MITRE ATT&CK Enterprise matrix left-to-right
 *  (Initial Access → Exfiltration). Used to bucket TTPs into Kill Chain
 *  phases for the Attack Flow view. TTPs whose tactic isn't in this list
 *  fall into a "Other" bucket sorted after the canonical phases. */
const TACTIC_ORDER = [
  'Reconnaissance',
  'Resource Development',
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command and Control',
  'Exfiltration',
  'Impact',
] as const;

export interface DiamondFacet {
  /** Adversary / Capability / Infrastructure / Victim. */
  pillar: 'adversary' | 'capability' | 'infrastructure' | 'victim';
  /** A short list of bullet items belonging to this facet. */
  items: string[];
}

export interface DiamondModel {
  adversary: string[];
  capability: { id: string; name: string; tactic: string; evidence: string }[];
  infrastructure: string[];
  victim: { sector: string; geography: string; asset: string };
}

export interface AttackFlowPhase {
  /** Phase label, e.g. "Initial Access". */
  phase: string;
  /** MITRE techniques observed in this phase, in document order. */
  techniques: { id: string; name: string; evidence: string }[];
}

/** Build the Diamond Model from the extracted entities + TTPs + IOCs + 5W.
 *  The four pillars map to:
 *    adversary      ← entities.actors (or the 5W 'who' field as fallback)
 *    capability     ← entities.malware + extracted TTPs
 *    infrastructure ← network-shaped IOCs (ip, domain, url)
 *    victim         ← 5W 'where' and 'why' fields
 *  The intent is to give the analyst a 4-axis pivot view in a single frame. */
export function buildDiamondModel(
  entities: { actors: string[]; malware: string[] },
  ttp: TtpHit[],
  iocs: ExtractedIoc[],
  fiveW: FiveW | null,
  text: string
): DiamondModel {
  const adversary =
    entities.actors.length > 0
      ? entities.actors
      : fiveW?.who
        ? [fiveW.who.replace(/\s+/g, ' ').trim().split(/[.,;]/)[0]!.trim()].filter(Boolean)
        : [];
  // Capability = malware + techniques, deduped.
  const capability: DiamondModel['capability'] = [];
  for (const m of entities.malware) {
    capability.push({ id: m, name: m, tactic: 'tooling', evidence: 'mentioned in report' });
  }
  for (const t of ttp) {
    if (capability.some((c) => c.id === t.id)) continue;
    capability.push({ id: t.id, name: t.name, tactic: t.tactic, evidence: t.evidence.slice(0, 160) });
  }
  // Infrastructure = network-shaped IOCs.
  const infraSet = new Set<string>();
  for (const i of iocs) {
    if (i.kind === 'ip' || i.kind === 'domain' || i.kind === 'url') {
      if (!infraSet.has(i.value) && i.confidence_band !== 'low') {
        infraSet.add(i.value);
      }
    }
  }
  const infrastructure = Array.from(infraSet).slice(0, 12);
  // Victim: 5W 'where' is the source of truth; fall back to sector
  // keywords in the report text.
  const where = fiveW?.where?.trim() ?? '';
  const why = fiveW?.why?.trim() ?? '';
  const sector = inferSector(text);
  return {
    adversary,
    capability: capability.slice(0, 16),
    infrastructure,
    victim: {
      sector: sector ?? (where ? where.split(/[.,;]/)[0]!.trim() : 'unspecified'),
      geography: where || 'unspecified',
      asset: why ? why.split(/[.,;]/)[0]!.trim() : 'unspecified',
    },
  };
}

/** Build the Attack Flow (kill-chain) view by bucketing the extracted TTPs
 *  into MITRE ATT&CK tactic phases, in document order. Returns one phase
 *  per tactic that has at least one TTP, plus an "Other" phase for any
 *  TTPs whose tactic isn't in TACTIC_ORDER. */
export function buildAttackFlow(ttp: TtpHit[]): AttackFlowPhase[] {
  if (ttp.length === 0) return [];
  const buckets = new Map<string, AttackFlowPhase>();
  for (const t of ttp) {
    const tactic = t.tactic || 'Other';
    if (!buckets.has(tactic)) buckets.set(tactic, { phase: tactic, techniques: [] });
    buckets.get(tactic)!.techniques.push({ id: t.id, name: t.name, evidence: t.evidence.slice(0, 160) });
  }
  // Stable sort: TACTIC_ORDER first, then "Other" last.
  const out: AttackFlowPhase[] = [];
  for (const tactic of TACTIC_ORDER) {
    const phase = buckets.get(tactic);
    if (phase) out.push(phase);
  }
  const other = buckets.get('Other');
  if (other) out.push(other);
  return out;
}

const SECTOR_KEYWORDS: Array<[string, RegExp]> = [
  ['financial', /\b(financial|bank|banking|swift|atm|payment|credit.card|finance|fintech)\b/i],
  ['healthcare', /\b(hospital|clinic|patient|medical|healthcare|pharma|hhs)\b/i],
  ['government', /\b(government|federal|state|dod|defense|ministry|diplomat|embassy|sector|agency)\b/i],
  ['energy', /\b(energy|oil|gas|petrochemical|electric|grid|utility|pipeline)\b/i],
  ['technology', /\b(software|saas|cloud|hosting|cdn|tech|startup|platform|api|developer)\b/i],
  ['retail', /\b(retail|e-?commerce|shop|store|merchant|point.of.sale|pos)\b/i],
  ['education', /\b(university|college|school|education|academic|research.student)\b/i],
  ['manufacturing', /\b(manufacturing|factory|industrial|ics|scada|ot\b|plc)\b/i],
  ['telecommunications', /\b(telecom|isp|mobile|carrier|5g|voip)\b/i],
  ['media', /\b(media|news|press|journalist|broadcaster|publishing)\b/i],
];

function inferSector(text: string): string | null {
  for (const [name, re] of SECTOR_KEYWORDS) {
    if (re.test(text)) return name;
  }
  return null;
}

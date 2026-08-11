import type { Candidate, DedupRecord, CaseStudyType } from '../types';
import { topicKey } from '../stable-keys';
import { severityScore, noveltyScore, finalScore } from '../scoring';
import { dayOfYear } from './rotation';
import { verifyUrl, verifyUrls, type LinkStatus } from '../../lib/verify-url';

export interface AgenticTrendsDeps {
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
  groqKey?: string;
  googleKey?: string;
  infronKey?: string;
  /** Opt into the deep soft-404 probe (one extra ranged GET per HEAD-200
   *  source URL, sniffing the <title> for not-found markers). Catches
   *  fabricated article slugs on WAF-fronted hosts that answer HEAD 200
   *  for any path. Costs ~1 extra subrequest per source URL, so it is
   *  OFF by default for the discovery cron's 50-subrequest budget. */
  deepVerify?: boolean;
  /** Optional real trending data to ground the LLM response (recent CVEs,
   *  ransomware victims, breach headlines, etc.). When absent the LLM
   *  hallucinates from training data, producing similar output every day. */
  trendingContext?: string;
  /** List of dedup keys surfaced in the last 14 days. The LLM is instructed
   *  to actively avoid these topics, ensuring genuinely fresh suggestions. */
  alreadyCoveredTopics?: string[];
}

interface TrendCandidate {
  title: string;
  type: CaseStudyType;
  rationale: string;
  hook: string;
  angle: string;
  evidence: Record<string, unknown>;
  trendingSignal: number;
}

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GOOGLE_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];

const CATEGORY_POOLS = [
  ['ransomware-evolution', 'supply-chain-attacks', 'mobile-threats'],
  ['cloud-security', 'identity-theft', 'cryptocurrency-crime'],
  ['ics-scada-ot', 'ai-ml-security', 'data-breach'],
  ['state-sponsored-apt', 'phishing-campaigns', 'vulnerability-exploitation'],
  ['iot-security', 'malware-evolution', 'cyber-policy-regulation'],
  ['critical-infrastructure', 'attack-technique-innovation', 'dark-web-forums'],
  ['threat-intel-tradecraft', 'incident-response', 'zero-day-exploits'],
  ['c2-infrastructure', 'info-stealer-malware', 'ransomware-extortion'],
  ['social-engineering', 'network-perimeter', 'supply-chain-pipeline'],
  ['bug-bounty-disclosure', 'api-security', 'container-kubernetes'],
];

const DIVERSITY_SEEDS = [
  'Focus on stories from non-English sources or regions outside the US/Europe.',
  'Find stories involving lesser-known threat groups or niche malware families.',
  'Look for positive developments: new defenses, takedowns, indictments, patches.',
  'Highlight stories with measurable impact: numbers affected, financial loss, downtime.',
  'Find stories about novel TTPs or attacker tradecraft shifts (not just new vulns).',
  'Look for stories involving critical infrastructure or government targets.',
  'Focus on supply chain and third-party risk stories.',
  'Find stories about emerging attack surfaces: AI agents, edge computing, SaaS.',
  'Look for stories about cyber insurance, disclosure norms, or regulatory action.',
  'Find stories with actionable IOCs or detection rules practitioners can use today.',
];

const SYSTEM_PROMPT = `You are a cybersecurity threat-intel analyst scanning for trending stories.

Today's date: {DATE}
Diversity challenge: {DIVERSITY_SEED}
Focus categories for today: {CATEGORIES}

Your task: Create 3 cybersecurity story ideas that would make high-quality blog content. Each must be DIFFERENT from any of these recently-covered topics: {ALREADY_COVERED}

If ALL categories or angles look like they'd overlap with covered topics, pivot HARD to a different angle, region, or threat type. Repetition is the single worst failure mode.

{TRENDING_CONTEXT}

CRITICAL UNIQUENESS RULES:
- Every story MUST be distinct from the recently-covered list above
- If you cannot find a truly unique angle, skip that slot rather than repeating
- The same CVE ID, group name, or malware family must NOT appear in your output if it was recently covered
- Geographical and sector diversity matters: don't always pick US healthcare or European tech
- Each story must target a different primary audience (SOC, DFIR, CISO, dev, researcher)

CRITERIA for each story:
- Specific, real details (not vague "cyber threats are rising")
- Affects multiple organizations or individuals
- Practitioner would benefit TODAY
- If a recent CVE, include its CVE ID
- If a ransomware group, name the group and victim

GROUNDING REQUIREMENT (HARD FILTER — non-negotiable):
Each story MUST include in evidence.sources at least one real, working URL of a published source covering the story (vendor advisory, news outlet, official advisory, government alert, or research blog). A story with no real source URL AND no real CVE id will be silently dropped at the gate — do not generate such a story. If you cannot find a real source for a story idea, SKIP that slot rather than inventing a URL or fabricating the story.

evidence.sources is a list of full URLs (https://...). Examples of acceptable source hosts: cisa.gov, nvd.nist.gov, attack.mitre.org, bleepingcomputer.com, krebsonsecurity.com, thehackernews.com, therecord.media, microsoft.com, cloud.google.com, unit42.paloaltonetworks.com, crowdstrike.com, mandiant.com, securelist.com, blog.talosintelligence.com, malpedia.caad.fkie.fraunhofer.de, ransomlook.io, abuse.ch. Do NOT use example.com, example.org, yourdomain.com, or any "placeholder" host — those are the exact hosts the gate will reject on.

For each story, output a JSON object with these fields:
{
  "title": "Specific, compelling title (like a blog post title)",
  "type": "cve | actor | ransomware | breach | trend | analysis | aisec",
  "rationale": "One-line why this matters right now",
  "hook": "A strong, specific hook sentence that would stop a practitioner mid-scroll",
  "angle": "The unique analytical angle — what makes THIS story different from similar ones",
  "evidence": {
    "entities": ["specific actor names, CVE IDs, malware families"],
    "sources": ["likely sources covering this"],
    "impact": "specific impact description",
    "urgency": "why now — e.g. 'exploitation observed in the wild', 'new variant detected'"
  },
  "trendingSignal": 0.85
}

Return ONLY a valid JSON array of exactly 3 items. No markdown, no commentary.`;

function parseTrendResponse(text: string): TrendCandidate[] {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.trends && Array.isArray(parsed.trends)) return parsed.trends;
    if (parsed.candidates && Array.isArray(parsed.candidates)) return parsed.candidates;
    return [];
  } catch {
    const matches = cleaned.match(/\[[\s\S]*?\]/);
    if (matches) {
      try {
        return JSON.parse(matches[0]);
      } catch {
        return [];
      }
    }
    return [];
  }
}

const TYPE_MAP: Record<string, CaseStudyType> = {
  cve: 'cve',
  actor: 'actor',
  ransomware: 'ransom',
  breach: 'breach',
  trend: 'trend',
  analysis: 'analysis',
  aisec: 'aisec',
  malware: 'malware',
  agentic: 'agentic',
  hunting: 'hunting',
  report: 'report',
};

// Hosts that the LLM is most likely to invent when asked for "any
// cybersecurity source" with no real ground truth. Anything in this list
// gets stripped from a candidate's `sources` / `evidence.sources` before
// we check for grounding — a candidate that points ONLY at a fabricated
// host is rejected at the door (it would otherwise sail through to the
// blog generator as "authoritative"). Mirrors the post-process
// REFERENCE_HOST_ALLOWLIST but in the inverse direction: this is what
// *not* to trust, not what *to* trust.
const FABRICATED_HOST_BLOCKLIST = new Set<string>([
  'example.com',
  'example.org',
  'example.net',
  'yourdomain.com',
  'domain.com',
  'sample.com',
  'test.com',
  'somerandomsite.com',
  'securitynews.example',
  'threatintel.example',
  'cyberblog.example',
  'securityweekly.example',
  'thehackernews.example',
  'bleepingcomputer.example',
  'krebsonsecurity.example',
]);

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

interface GroundingResult {
  hasRealSource: boolean;
  hasRealCve: boolean;
  realSources: string[];
  rejectedReason?: string;
}

/**
 * Decide whether a LLM-generated trend is "grounded" enough to publish.
 *
 * The trends runner is the ONLY discovery runner whose candidates are not
 * anchored to a real intel source. Every other runner pulls from a feed
 * or API. The post-process layer cannot recover from a candidate whose
 * evidence is invented top-to-bottom — it can strip example.com URLs and
 * warn about ungrounded CVEs, but it cannot fabricate the facts that the
 * body of the case study needs. So we reject hallucinated candidates at
 * the source, before they ever become a published post.
 *
 * A candidate is grounded when AT LEAST ONE of:
 *   1. It cites at least one source URL whose host is not in the
 *      fabrication blocklist (a real, published security outlet / blog
 *      the writer actually found). The LLM is instructed to provide such
 *      URLs in `evidence.sources` and `evidence.urls`; if it can't, the
 *      candidate is speculative.
 *   2. It names at least one well-formed CVE id (CVE-YYYY-NNNNN, year
 *      2020..current+1) so the post-process layer has something real
 *      to ground on.
 *
 * If neither holds, the candidate is dropped with a logged reason. This
 * is the change that closes the "agentic-trends hallucination" gap that
 * produced the bogus North-Korean-APT-Indian-government post.
 */
function evaluateGrounding(t: TrendCandidate): GroundingResult {
  const evidence = (t.evidence ?? {}) as Record<string, unknown>;
  const sources: string[] = [];
  if (Array.isArray(evidence.sources)) {
    for (const s of evidence.sources) if (typeof s === 'string') sources.push(s);
  }
  if (Array.isArray(evidence.urls)) {
    for (const u of evidence.urls) if (typeof u === 'string') sources.push(u);
  }
  if (Array.isArray(evidence.links)) {
    for (const l of evidence.links) if (typeof l === 'string') sources.push(l);
  }
  if (Array.isArray(evidence.entities)) {
    for (const e of evidence.entities) {
      if (typeof e === 'string' && /^https?:\/\//i.test(e)) sources.push(e);
    }
  }
  if (typeof evidence.url === 'string' && /^https?:\/\//i.test(evidence.url)) {
    sources.push(evidence.url);
  }
  if (typeof evidence.source_url === 'string' && /^https?:\/\//i.test(evidence.source_url)) {
    sources.push(evidence.source_url);
  }
  for (const blob of [t.rationale, t.hook, t.angle, typeof evidence.impact === 'string' ? evidence.impact : '']) {
    for (const m of blob.match(/https?:\/\/[^\s)"'<>]+/gi) ?? []) {
      sources.push(m);
    }
  }

  const realSources: string[] = [];
  for (const s of sources) {
    const h = hostOf(s);
    if (!h) continue;
    if (FABRICATED_HOST_BLOCKLIST.has(h)) continue;
    realSources.push(s);
  }

  const entities = Array.isArray(evidence.entities)
    ? evidence.entities.filter((x): x is string => typeof x === 'string')
    : [];
  const currentYear = new Date().getUTCFullYear();
  const cveRe = /CVE-(\d{4})-(\d{4,7})/g;
  let hasRealCve = false;
  const blobText = [
    t.title,
    t.rationale,
    t.hook,
    t.angle,
    entities.join(' '),
    typeof evidence.impact === 'string' ? evidence.impact : '',
  ].join(' ');
  for (const m of blobText.matchAll(cveRe)) {
    const year = Number(m[1]);
    const seq = Number(m[2]);
    if (year >= 2020 && year <= currentYear + 1 && seq > 0) {
      hasRealCve = true;
      break;
    }
  }

  if (realSources.length === 0 && !hasRealCve) {
    return {
      hasRealSource: false,
      hasRealCve: false,
      realSources: [],
      rejectedReason: 'no real source URL and no well-formed CVE id (ungrounded trend candidate)',
    };
  }
  return { hasRealSource: realSources.length > 0, hasRealCve, realSources };
}

/**
 * Build the canonical `sources` list stored on a candidate's evidence,
 * dropping any URL whose HEAD check came back 'broken' (a confirmed
 * 4xx/5xx — a fabricated path on a real host). These URLs flow straight
 * into `extractSources` → `post.sources` → clickable citations, so a
 * broken one must never survive to a published post. 'ok' and 'unchecked'
 * (transient network/timeout) URLs are kept, de-duped, order-preserved.
 */
function buildStoredSources(realSources: string[], statuses: Record<string, LinkStatus>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of realSources) {
    if (statuses[u] === 'broken') continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/**
 * Well-formed CVE ids extracted from a trend candidate's blob (title,
 * rationale, hook, angle, entities, impact). Used by the CVE-existence
 * probe so a candidate whose ONLY grounding is a made-up CVE id is
 * rejected instead of sailing through to a dead NVD citation.
 */
function extractCveIds(t: TrendCandidate): string[] {
  const evidence = (t.evidence ?? {}) as Record<string, unknown>;
  const entities = Array.isArray(evidence.entities)
    ? evidence.entities.filter((x): x is string => typeof x === 'string')
    : [];
  const blob = [
    t.title,
    t.rationale,
    t.hook,
    t.angle,
    entities.join(' '),
    typeof evidence.impact === 'string' ? evidence.impact : '',
    typeof evidence.cveId === 'string' ? evidence.cveId : '',
  ].join(' ');
  const out: string[] = [];
  const seen = new Set<string>();
  const currentYear = new Date().getUTCFullYear();
  for (const m of blob.matchAll(/CVE-(\d{4})-(\d{4,7})/g)) {
    const year = Number(m[1]);
    const seq = Number(m[2]);
    if (year < 2020 || year > currentYear + 1 || seq <= 0) continue;
    const id = `CVE-${m[1]}-${m[2]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Decision gate for a trend candidate, kept pure so the tests can pin the
 * exact acceptance rules. A candidate is accepted when:
 *
 *   1. It has at least one source URL verified 'ok' (the LLM's story is
 *      anchored to a URL that actually resolves), OR
 *   2. It has no real source URLs but names CVE ids, and at least one of
 *      those CVEs exists (NVD probe came back 'ok' or 'unchecked' — a
 *      transient probe failure keeps the candidate on the benefit of the
 *      doubt, only a confirmed NXDOMAIN/404 drops it), OR
 *   3. It has neither sources nor CVEs — rejected (ungrounded).
 *
 * Previously the gate only rejected when a URL was CONFIRMED broken AND
 * none verified ok. A WAF-blocked 403 (classified 'unchecked') or a
 * HEAD-200-any-path host let fabricated article slugs and invented CVEs
 * (e.g. CVE-2025-1234) sail through to published posts as dead citations.
 * The trends runner is the ONLY runner whose candidates are not anchored
 * to a real intel feed, so it is the cheapest place to be strict: a
 * rejected candidate costs one LLM call, not a published broken link.
 */
export function decideTrendAcceptance(input: {
  hasRealSource: boolean;
  hasRealCve: boolean;
  /** URL → linkStatus from the discovery-time verification pass. */
  sourceStatuses: Record<string, LinkStatus>;
  /** CVE id → linkStatus from the NVD existence probe (only populated
   *  when the candidate has no ok-verified source URL). */
  cveStatuses?: Record<string, LinkStatus>;
}): { accepted: boolean; reason?: string } {
  const statuses = Object.values(input.sourceStatuses);
  const hasOk = statuses.some((s) => s === 'ok');
  const hasBroken = statuses.some((s) => s === 'broken');

  // Rule 1: at least one verified-ok source URL anchors the story.
  if (input.hasRealSource && hasOk) return { accepted: true };

  // Rule 2: no OK source, but the candidate names CVE ids — ground it on
  // a real CVE instead. A candidate whose only anchor is a made-up CVE
  // (e.g. CVE-2025-1234 — well-formed but nonexistent) must not produce a
  // dead NVD citation, so probe NVD for the named ids. 'unchecked' (probe
  // timeout / NVD hiccup) keeps the candidate on the benefit of the doubt;
  // a confirmed 404 for EVERY named CVE drops it.
  if (input.hasRealCve) {
    const cveStatuses = Object.values(input.cveStatuses ?? {});
    if (cveStatuses.length === 0) return { accepted: true }; // no probe ran
    if (cveStatuses.every((s) => s === 'broken')) {
      return { accepted: false, reason: 'no verified-ok source and every named CVE missing from NVD' };
    }
    return { accepted: true };
  }

  // Rule 3: source URLs exist but none verified ok. 'unchecked'-only (WAF
  // block / timeout / HEAD-200 soft-404 hosts) is NOT good enough for an
  // LLM-invented candidate — the model is instructed to provide real URLs,
  // and a URL we could not confirm is exactly where fabrication hides. The
  // LLM picks different URLs next run; the alternative is another dead
  // citation on a published post.
  if (input.hasRealSource) {
    return {
      accepted: false,
      reason: hasBroken
        ? 'no verified-ok source (at least one URL confirmed broken)'
        : 'no verified-ok source (all sources unchecked)',
    };
  }

  // Rule 4: neither sources nor CVEs — ungrounded hallucination.
  return { accepted: false, reason: 'no real source URL and no well-formed CVE id (ungrounded trend candidate)' };
}

async function callGoogle(key: string, prompt: string, userMsg: string): Promise<string> {
  let lastError: Error | null = null;
  for (const model of GOOGLE_MODELS) {
    try {
      const res = await fetch(`${GOOGLE_BASE}/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents: [{ role: 'user', parts: [{ text: userMsg }] }],
          generationConfig: {
            maxOutputTokens: 4000,
            temperature: 0.9,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const msg = `google HTTP ${res.status}: ${body.slice(0, 200)}`;
        if (res.status === 401 || res.status === 403) throw new Error(msg);
        lastError = new Error(msg);
        continue;
      }
      const j = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string' || !text.trim()) throw new Error('google empty response');
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error('google all models failed');
}

export async function discoverAgenticTrends(deps: AgenticTrendsDeps): Promise<Candidate[]> {
  const { googleKey, now, getDedup, trendingContext, alreadyCoveredTopics, deepVerify } = deps;

  if (!googleKey) {
    return [];
  }

  try {
    // Multi-axis diversity to ensure genuinely different content every run:
    // 1. Category pool rotation (10 pools, cycles every 10 days)
    // 2. Diversity seed rotation (10 seeds, changes daily angle)
    // 3. Already-covered list from dedup (LLM actively avoids these)
    // 4. Real trending context from platform feeds
    // 5. High temperature (0.9) for LLM output variance
    const dayOfYear_ = dayOfYear(now);
    const poolIndex = dayOfYear_ % CATEGORY_POOLS.length;
    const seedIndex = dayOfYear_ % DIVERSITY_SEEDS.length;
    const todaysCategories = CATEGORY_POOLS[poolIndex]!.join(', ');
    const todaysSeed = DIVERSITY_SEEDS[seedIndex]!;
    // Format recently-covered topics as a compact list for the LLM prompt.
    // Limit to ~2000 chars to avoid blowing the token budget.
    const coveredList = alreadyCoveredTopics?.length
      ? alreadyCoveredTopics.slice(0, 80).join(', ').slice(0, 2000)
      : 'none yet today';
    const trendingSnippet = trendingContext
      ? `\nRecent data from platform feeds:\n${trendingContext.slice(0, 2000)}`
      : '';

    const prompt = SYSTEM_PROMPT.replace('{DATE}', now.toISOString().slice(0, 10))
      .replace('{DIVERSITY_SEED}', todaysSeed)
      .replace('{CATEGORIES}', todaysCategories)
      .replace('{ALREADY_COVERED}', coveredList)
      .replace('{TRENDING_CONTEXT}', trendingSnippet);
    const userMsg = `Generate 3 unique cybersecurity story ideas for ${now.toISOString().slice(0, 10)} that are COMPLETELY different from these recently-covered topics: ${coveredList.slice(0, 500)}. Each must target a different audience and angle.`;

    const text = await callGoogle(googleKey, prompt, userMsg);
    const trends = parseTrendResponse(text);
    if (trends.length === 0) {
      return [];
    }

    const candidates: Candidate[] = [];
    const seenKeys = new Set<string>();

    for (const t of trends) {
      const title = t.title || 'untitled';
      // Grounding gate. The trends runner is the only discovery runner
      // whose candidates are not anchored to a real intel source — every
      // other runner pulls from a feed or API. We must reject candidates
      // that the LLM invented wholesale, otherwise the blog generator
      // happily produces a confident case study about fake APT groups and
      // invented CVEs (the root cause of the bogus
      // north-korean-apt-indian-government post). The grounding check
      // requires at least one real source URL or one well-formed CVE.
      const grounding = evaluateGrounding(t);
      if (!grounding.hasRealSource && !grounding.hasRealCve) {
        continue;
      }

      // Verify source URLs actually resolve. HEAD check with 3s timeout per URL.
      // verifyUrl now returns a nuanced `linkStatus`: 'broken' only for a
      // confirmed-dead URL (404/410, soft-404, or NXDOMAIN). WAF blocks
      // (403/429), 5xx, and timeouts come back 'unchecked' so a live source
      // behind a bot-wall isn't wrongly dropped. When `deepVerify` is on,
      // HEAD-200 URLs get an extra ranged GET whose <title> is sniffed for
      // not-found markers — the only probe that catches fabricated article
      // slugs on hosts that answer HEAD 200 for ANY path.
      const sourceLinkStatuses: Record<string, LinkStatus> = {};
      if (grounding.realSources.length > 0) {
        const statuses = await verifyUrls(grounding.realSources, 3000, {
          deepSoft404: deepVerify === true,
        });
        for (const [url, result] of statuses) {
          sourceLinkStatuses[url] = result.linkStatus;
        }
      }

      // NVD existence probe: when NO source URL verified ok, the only
      // remaining anchor for this candidate is a CVE id — but "well-formed"
      // ids are trivially fake (CVE-2025-1234 passes the regex). Probe NVD's
      // canonical detail page for each named CVE; a confirmed 404 means the
      // CVE does not exist and the candidate's grounding was a hallucination.
      // Costs ≤1 subrequest per named CVE, only for candidates whose sources
      // did not verify ok (the common fabrication pattern). NVD answers HEAD
      // 404 for unknown ids, so a 'broken' verdict here is reliable; timeouts
      // come back 'unchecked' and keep the candidate on benefit of the doubt.
      const cveStatuses: Record<string, LinkStatus> = {};
      const hasOkSource = Object.values(sourceLinkStatuses).some((s) => s === 'ok');
      if (!hasOkSource && grounding.hasRealCve) {
        for (const cve of extractCveIds(t)) {
          const url = `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`;
          if (!(url in cveStatuses)) {
            const r = await verifyUrl(url, 3000);
            cveStatuses[cve] = r.linkStatus;
          }
        }
      }

      // Hard acceptance gate — see decideTrendAcceptance. Root-cause fix for
      // fabricated trend stories: previously a candidate was only rejected
      // when a URL came back CONFIRMED broken AND none verified ok, so an
      // LLM-invented slug on a WAF-fronted host (HEAD 200 for any path, or
      // 403 datacenter egress ⇒ 'unchecked') sailed straight through to a
      // published post as a dead citation. Now a trend candidate must be
      // anchored to at least one verified-ok source URL, or to a CVE id
      // that NVD confirms exists.
      const acceptance = decideTrendAcceptance({
        hasRealSource: grounding.hasRealSource,
        hasRealCve: grounding.hasRealCve,
        sourceStatuses: sourceLinkStatuses,
        cveStatuses: cveStatuses,
      });
      if (!acceptance.accepted) {
        continue;
      }

      // Normalize the title to create a stable key that doesn't change
      // between LLM runs. Strip common filler words, keep only the core
      // topic (e.g., "prompt injection", "blacksuit ransomware", "eu cyber").
      const coreTopic = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, '')
        .replace(
          /\b(new|novel|emergence|attack|technique|vulnerability|threat|actor|ransomware|group|targets|targeting|sector|sectors|regulations|directive|powered|systems|capabilities|tactics|victims|manipulation|integrity|across|continent|introduces|stricter|disclosure|requirements|organizations|allows|for|of|the|a|an|in|on|to|with|and|or|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|can|shall)\b/g,
          ''
        )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      const seed = coreTopic.replace(/\s+/g, '-');
      if (!seed || seed.length < 3) continue;
      const key = topicKey('agentic', seed);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const dedup = await getDedup(key);
      const trendingBoost = Math.min(1, Math.max(0, t.trendingSignal ?? 0.5));
      const score = finalScore({
        recency: 1.0,
        severity: severityScore({}),
        novelty: noveltyScore(dedup, now),
        sourceWeight: 0.8,
      });
      const adjustedScore = Number((score * 0.6 + trendingBoost * 0.4).toFixed(4));
      const type = TYPE_MAP[t.type?.toLowerCase()] ?? 'trend';

      candidates.push({
        key,
        type,
        title,
        rationale: t.rationale || title,
        score: adjustedScore,
        evidence: {
          ...(t.evidence || {}),
          // Surface the real sources we extracted at the grounding check
          // so the post-process layer's `stripDisallowedRefs` can
          // whitelist them (otherwise the URLs the LLM cited would be
          // stripped as "disallowed hosts" even though they're real).
          // `sources` is the canonical field the post-process scrapes
          // for the factsText hostnames. Confirmed-broken URLs are
          // dropped here — they would otherwise sail into post.sources as
          // dead citation links. Only blocklist-filtered realSources are
          // stored (the raw LLM `evidence.sources` may still hold
          // placeholder hosts that the grounding pass already rejected).
          sources: buildStoredSources(grounding.realSources, sourceLinkStatuses),
          sourceLinkStatuses,
          // NVD existence-probe verdicts per named CVE (only populated when
          // the candidate's sources had no ok verdict). The admin Pending tab
          // renders this so an operator can see the anchor that got the
          // candidate accepted.
          cveStatuses,
          hook: t.hook || '',
          angle: t.angle || '',
          trendingSignal: t.trendingSignal ?? trendingBoost,
          grounding: {
            hasRealSource: grounding.hasRealSource,
            hasRealCve: grounding.hasRealCve,
            realSourceCount: grounding.realSources.length,
            acceptanceReason: acceptance.accepted ? undefined : acceptance.reason,
          },
          source: 'agentic-trends',
          generatedAt: now.toISOString(),
        },
        discoveredAt: now.toISOString(),
        status: 'pending',
      });
    }
    return candidates;
  } catch {
    return [];
  }
}
// Exported only for unit tests — see
// api/test/case-study/discovery/agentic-trends.test.ts. Production code
// imports `discoverAgenticTrends` and never touches this directly.
export const _test_evaluateGrounding = evaluateGrounding;
export const _test_buildStoredSources = buildStoredSources;
export const _test_extractCveIds = extractCveIds;
export const _test_decideTrendAcceptance = decideTrendAcceptance;

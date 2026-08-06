/**
 * Atomic claim extraction + ranking.
 *
 * The content-engine skill's repurposing flow:
 *   1. Pick the anchor asset. (the published post / candidate evidence)
 *   2. Extract 3 to 7 atomic claims or scenes.
 *   3. Rank them by sharpness, novelty, and proof.
 *   4. Assign one strong idea per output.
 *
 * The existing social generator feeds the whole post body to each platform
 * prompt and lets the LLM pick its own angle. That works, but it means
 * Twitter / LinkedIn / Instagram can all converge on the same claim (the
 * most obvious one) — which is exactly the "no duplicated copy across
 * platforms" failure the skill's quality gate catches.
 *
 * This module extracts atomic claims deterministically (no LLM call — pure
 * regex + scoring on the post body), ranks them, and assigns the strongest
 * distinct claim to each platform. The platform prompts can then be told
 * "lead with THIS claim" so the three outputs diverge by design, not by
 * luck.
 *
 * The extraction is deliberately conservative: it only pulls claims that
 * have a concrete anchor (a number, a CVE, a named entity, a detection
 * artifact). Vague sentences are skipped — the skill says "specificity
 * beats adjectives," so a claim without a concrete anchor isn't a claim
 * worth assigning.
 */

import type { CaseStudyType } from '../types';

export interface AtomicClaim {
  /** The claim text (1-2 sentences, as it appears in the source). */
  text: string;
  /** What kind of claim — drives the ranking. */
  kind: 'stat' | 'cve' | 'actor' | 'detection' | 'timeline' | 'contrast' | 'takeaway';
  /** 0-1. How sharp / scroll-stopping this claim is. */
  sharpness: number;
  /** 0-1. How novel / non-obvious. */
  novelty: number;
  /** 0-1. How much proof backs it (numbers, named entities, citations). */
  proof: number;
  /** Composite score: weighted average used for ranking. */
  score: number;
  /** The concrete anchors that make this claim assignable. */
  anchors: string[];
}

export interface ClaimAssignment {
  /** Which platform this claim is assigned to. */
  platform: 'twitter' | 'linkedin' | 'instagram';
  /** The claim to lead with. */
  claim: AtomicClaim;
  /** Why this claim fits this platform. */
  rationale: string;
}

// ── Claim extraction ──────────────────────────────────────────────────────

/** Patterns that signal a concrete, assignable claim.
 *  Non-global (no `g` flag) so .test() is stateless — avoids the lastIndex
 *  bug where a global regex alternates true/false across calls. */
const STAT_RE_TEST =
  /\b(\d+(?:\.\d+)?)\s*(%|percent|million|billion|thousand|days?|hours?|minutes?|victims?|attacks?|breaches?|records?|accounts?|servers?|endpoints?)\b/i;
const CVE_RE_TEST = /\bCVE-\d{4}-\d{4,7}\b/i;
const ACTOR_RE_TEST =
  /\b(APT\d+|LockBit|Cl0p|Black Basta|ALPHV|Rhysida|Akira|Play|Royal|Conti|REvil|Maze|Ryuk|Emotet|TrickBot|Lazarus|FIN\d+|TA\d+)\b/i;
const DETECTION_RE_TEST =
  /\b(Sigma|YARA|KQL|SPL|Splunk|detection rule|detection|hunt query|alert|IOC|indicator|EDR|SIEM|XDR)\b/i;
const TIMELINE_RE_TEST =
  /\b(day \d+|hour \d+|within \d+|after \d+|first \d+ (?:hours?|days?)|median dwell|dwell time)\b/i;

/** Global (g-flag) versions for matchAll() anchor extraction. */
const STAT_RE_G =
  /\b(\d+(?:\.\d+)?)\s*(%|percent|million|billion|thousand|days?|hours?|minutes?|victims?|attacks?|breaches?|records?|accounts?|servers?|endpoints?)\b/gi;
const CVE_RE_G = /\bCVE-\d{4}-\d{4,7}\b/gi;
const ACTOR_RE_G =
  /\b(APT\d+|LockBit|Cl0p|Black Basta|ALPHV|Rhysida|Akira|Play|Royal|Conti|REvil|Maze|Ryuk|Emotet|TrickBot|Lazarus|FIN\d+|TA\d+)\b/gi;
const MITRE_RE = /\bT\d{4}(?:\.\d{3})?\b/g;
const CVSS_RE = /\bCVSS\s*(?:v?\d(?:\.\d)?)?\s*(\d{1,2}(?:\.\d)?)\b/gi;

/** Sentence splitter that respects abbreviations minimally. */
function sentences(text: string): string[] {
  // Strip markdown headings, code blocks, and reference lists — we want prose.
  const cleaned = text
    .replace(/^##\s+.+$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*+]\s.*$/gm, '') // bullet lists
    .replace(/\[[^\]]*\]\([^)]+\)/g, '$1') // markdown links → label
    .replace(/FIRST (COMMENT|REPLY):\s*https?:\/\/\S+/gi, '')
    .replace(/#{1,6}\s+/g, '');
  return cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400);
}

/** Classify a sentence into a claim kind, or null if it's not a claim.
 *  Order matters: detection artifacts and stats are checked first (they're
 *  the highest-value, most concrete claims), then CVE/actor/timeline, then
 *  the analytical kinds (contrast/takeaway) which are softer. */
function classifyClaim(sentence: string): AtomicClaim['kind'] | null {
  if (DETECTION_RE_TEST.test(sentence)) return 'detection';
  if (STAT_RE_TEST.test(sentence) && /(%|million|billion|victims?|breaches?|records?|accounts?)/i.test(sentence)) {
    return 'stat';
  }
  if (CVE_RE_TEST.test(sentence)) return 'cve';
  if (ACTOR_RE_TEST.test(sentence)) return 'actor';
  if (TIMELINE_RE_TEST.test(sentence)) return 'timeline';
  // Contrast: "but", "however", "unlike", "while", "despite" — the analytical take.
  if (/\b(but|however|unlike|while|despite|whereas|contrast|gap|missed|overlooked)\b/i.test(sentence)) {
    return 'contrast';
  }
  // Takeaway: "should", "must", "need to", "the lesson" — the Monday-morning step.
  if (/\b(should|must|need to|the (lesson|key|takeaway)|if you|your (team|soc|ir))\b/i.test(sentence)) {
    return 'takeaway';
  }
  return null;
}

/** Extract concrete anchors from a sentence (proof points). */
function extractAnchors(sentence: string): string[] {
  const anchors: string[] = [];
  for (const m of sentence.matchAll(STAT_RE_G)) anchors.push(m[0]);
  for (const m of sentence.matchAll(CVE_RE_G)) anchors.push(m[0]);
  for (const m of sentence.matchAll(ACTOR_RE_G)) anchors.push(m[0]);
  for (const m of sentence.matchAll(MITRE_RE)) anchors.push(m[0]);
  for (const m of sentence.matchAll(CVSS_RE)) anchors.push(`CVSS ${m[1]}`);
  return [...new Set(anchors)].slice(0, 5);
}

/** Score sharpness: does the claim have a hard number or a named entity up front? */
function scoreSharpness(sentence: string, kind: AtomicClaim['kind']): number {
  let score = 0;
  // Hard number in the first 80 chars = sharp hook material.
  if (STAT_RE_TEST.test(sentence.slice(0, 80))) score += 0.4;
  if (CVE_RE_TEST.test(sentence)) score += 0.3;
  if (ACTOR_RE_TEST.test(sentence)) score += 0.3;
  if (CVSS_RE.test(sentence)) score += 0.2;
  // Contrast/takeaway claims are sharp by nature (they have a point of view).
  if (kind === 'contrast' || kind === 'takeaway') score += 0.3;
  // Detection artifacts are the highest-save content.
  if (kind === 'detection') score += 0.4;
  // Shorter = punchier for social.
  if (sentence.length < 120) score += 0.1;
  return Math.min(1, score);
}

/** Score novelty: does the claim use contrast / non-obvious language? */
function scoreNovelty(sentence: string, kind: AtomicClaim['kind']): number {
  let score = 0.2; // baseline
  if (kind === 'contrast') score += 0.5; // "but / however / unlike" = non-obvious
  if (kind === 'takeaway') score += 0.3;
  if (kind === 'detection') score += 0.3; // detection gaps are novel by definition
  if (kind === 'timeline') score += 0.2;
  // "Not / never / only / first / new" signal novelty.
  if (/\b(not|never|only|first|new|unlike|missed|overlooked|gap|silent)\b/i.test(sentence)) score += 0.2;
  return Math.min(1, score);
}

/** Score proof: how many concrete anchors back the claim? */
function scoreProof(anchors: string[], kind: AtomicClaim['kind']): number {
  let score = anchors.length * 0.25;
  if (kind === 'stat') score += 0.2; // numbers are self-proving
  if (kind === 'cve') score += 0.3; // CVE IDs are verifiable
  if (kind === 'detection') score += 0.3; // detection artifacts are copy-pasteable proof
  return Math.min(1, score);
}

/**
 * Extract 3-7 atomic claims from a post body, ranked by composite score.
 * Returns the top claims — the ones worth leading a platform post with.
 */
export function extractAtomicClaims(body: string, _type?: CaseStudyType): AtomicClaim[] {
  const sents = sentences(body);
  const claims: AtomicClaim[] = [];

  for (const s of sents) {
    const kind = classifyClaim(s);
    if (!kind) continue;
    const anchors = extractAnchors(s);
    // A claim needs a concrete anchor (number, CVE, actor, detection artifact)
    // OR a contrast marker to be assignable. Pure filler like "organizations
    // should stay vigilant" has neither — it's a vague recommendation with
    // no proof point, exactly the "specificity beats adjectives" failure the
    // content-engine skill flags.
    //
    // Detection claims are self-proving: the detection keyword (KQL, Sigma,
    // EDR, YARA) IS the concrete anchor — a claim like "One KQL field exposes
    // this whole campaign" has no number but is exactly the kind of save-magnet
    // content we want to assign. Same for contrast/takeaway with a contrast word.
    const hasContrast = /\b(but|however|unlike|while|despite|whereas|contrast|gap|missed|overlooked)\b/i.test(s);
    if (anchors.length === 0 && kind !== 'contrast' && kind !== 'detection' && !(hasContrast && kind === 'takeaway'))
      continue;

    const sharpness = scoreSharpness(s, kind);
    const novelty = scoreNovelty(s, kind);
    const proof = scoreProof(anchors, kind);
    // Weighted: sharpness matters most for social, then proof, then novelty.
    const score = sharpness * 0.45 + proof * 0.35 + novelty * 0.2;

    claims.push({ text: s, kind, sharpness, novelty, proof, score, anchors });
  }

  // Deduplicate by kind — keep the highest-scoring claim of each kind so
  // the assignment has variety (one stat, one detection, one contrast, etc.).
  const byKind = new Map<AtomicClaim['kind'], AtomicClaim>();
  for (const c of claims.sort((a, b) => b.score - a.score)) {
    if (!byKind.has(c.kind)) byKind.set(c.kind, c);
  }

  // Return top 7, sorted by score. Cap at 7 per the skill's "3 to 7" range.
  return [...byKind.values()].sort((a, b) => b.score - a.score).slice(0, 7);
}

// ── Platform assignment ───────────────────────────────────────────────────

/**
 * Assign the strongest distinct claim to each platform. The content-engine
 * skill says "Assign one strong idea per output" — so each platform leads
 * with a different claim, not the same obvious one.
 *
 * Platform-claim fit:
 *   - Twitter: stat or contrast (short, punchy, scroll-stopper)
 *   - LinkedIn: takeaway or detection (save-magnet, dwell-time)
 *   - Instagram: stat or actor (visual, concrete)
 *
 * Falls back to the highest-scoring unassigned claim when the preferred
 * kind isn't available.
 */
export function assignClaimsToPlatforms(claims: AtomicClaim[]): ClaimAssignment[] {
  if (claims.length === 0) return [];

  const platformPrefs: Array<{ platform: ClaimAssignment['platform']; kinds: AtomicClaim['kind'][] }> = [
    { platform: 'twitter', kinds: ['stat', 'contrast', 'timeline', 'cve'] },
    { platform: 'linkedin', kinds: ['takeaway', 'detection', 'contrast', 'stat'] },
    { platform: 'instagram', kinds: ['stat', 'actor', 'cve', 'timeline'] },
  ];

  const used = new Set<number>();
  const assignments: ClaimAssignment[] = [];

  for (const { platform, kinds } of platformPrefs) {
    // Find the highest-scoring unused claim of a preferred kind.
    let chosen: AtomicClaim | undefined;
    for (const kind of kinds) {
      const idx = claims.findIndex((c, i) => !used.has(i) && c.kind === kind);
      if (idx >= 0) {
        chosen = claims[idx];
        used.add(idx);
        break;
      }
    }
    // Fallback: highest-scoring unused claim of any kind.
    if (!chosen) {
      for (let i = 0; i < claims.length; i++) {
        if (!used.has(i)) {
          chosen = claims[i];
          used.add(i);
          break;
        }
      }
    }
    if (chosen) {
      const rationale = `${platform} leads with a ${chosen.kind} claim (score ${chosen.score.toFixed(2)}): ${chosen.anchors.length} concrete anchor(s)`;
      assignments.push({ platform, claim: chosen, rationale });
    }
  }

  return assignments;
}

/**
 * Build a prompt hint for a platform's generator, telling it which claim
 * to lead with. Returns an empty string when no claims were extracted
 * (the generator falls back to its own angle selection).
 */
export function buildClaimHint(assignment: ClaimAssignment | undefined): string {
  if (!assignment) return '';
  const { claim, platform } = assignment;
  const platformNote =
    platform === 'twitter'
      ? 'Lead the thread with this specific claim. Make tweet 1 carry this exact angle.'
      : platform === 'linkedin'
        ? 'Lead the LinkedIn post with this specific claim above the fold. The hook must carry this angle, not a generic one.'
        : 'Lead the Instagram caption with this specific claim.';
  return (
    `\n\n<assigned_claim>\n` +
    `${platformNote}\n` +
    `Claim kind: ${claim.kind}\n` +
    `Claim text (adapt the angle, don't copy verbatim): ${claim.text}\n` +
    `Concrete anchors to use: ${claim.anchors.join(', ') || 'none — lead with the analytical take'}\n` +
    `This claim was selected because it scored highest on sharpness + proof for this platform. ` +
    `The other platforms are leading with DIFFERENT claims so the three posts don't read as copies.\n` +
    `</assigned_claim>`
  );
}

/**
 * Full repurposing flow: extract claims, rank, assign to platforms.
 * Returns the claim assignments + a hint per platform. The caller feeds
 * each hint into the corresponding platform prompt.
 */
export function planRepurposing(
  body: string,
  type?: CaseStudyType
): { claims: AtomicClaim[]; assignments: ClaimAssignment[] } {
  const claims = extractAtomicClaims(body, type);
  const assignments = assignClaimsToPlatforms(claims);
  return { claims, assignments };
}

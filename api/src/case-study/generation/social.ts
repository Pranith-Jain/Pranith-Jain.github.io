import type { Ai } from '@cloudflare/workers-types';
import type { Candidate, Post } from '../types';
import { runCompletion } from './ai-client';
import { VOICE_IDENTITY, COPYWRITING_RULES, PIPELINE_OUTPUT_GUARDRAIL } from './copywriting';
import { stripUntrustedUrls, findUngroundedCves, detectSlop } from '../../lib/ai-output-validator';

export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  generatedAt: string;
  _validation?: {
    twitter_quality?: SocialQuality;
    linkedin_quality?: SocialQuality;
  };
}

export interface SocialQuality {
  char_count: number;
  over_limit: boolean;
  ungrounded_cves: string[];
  untrusted_urls: number;
  slop_count: number;
  score: number; // 0-100
  issues: string[];
}

/** Minimal content source for social generation — works from published
 *  posts, candidate evidence, or user-provided notes. */
export interface SocialSource {
  slug: string;
  title: string;
  /** Post body or candidate evidence formatted as text for the LLM. */
  body: string;
}

const SOCIAL_SYSTEM =
  VOICE_IDENTITY +
  `<task>Content repurposing. You turn one piece of analysis into platform-native posts. ` +
  `Not reformatting — rewriting for how each platform's algorithm thinks and how each audience consumes. ` +
  `Same practitioner voice, shorter form. Never sound like a brand account.</task>\n\n` +
  COPYWRITING_RULES +
  `\n\n` +
  PIPELINE_OUTPUT_GUARDRAIL;

/**
 * Social prompts only need the substance, not the whole article. Capping
 * the body keeps the prompt well under the model context window (the same
 * class of overflow that broke case-study generation) and forces the model
 * to work from the lede + structure rather than regurgitate.
 */
const BODY_CAP = 6000;
function gist(body: string): string {
  const b = body.trim();
  return b.length <= BODY_CAP ? b : `${b.slice(0, BODY_CAP)}\n…[article continues — summarise from the above]`;
}

/**
 * Tidy generated social copy: strip trailing spaces, collapse runs of spaces,
 * cap consecutive blank lines at ONE, and replace em/en dashes with commas.
 */
function tidySocial(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/[ \t]{2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(?<!\d)\s*[—–]\s*(?!\d)/g, ', ')
    .trim();
}

/**
 * LinkedIn-specific tidy: collapse consecutive tight blocks into dense paragraphs.
 */
function tidyLinkedin(text: string): string {
  const base = tidySocial(text);
  const blocks = base.split(/\n\n+/);
  const merged: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    merged.push(buffer.join('\n'));
    buffer = [];
  };
  const isTight = (block: string): boolean => {
    const lines = block.split('\n');
    if (lines.length !== 1) return false;
    const line = lines[0] ?? '';
    if (line === '') return false;
    if (line.length > 110) return false;
    if (line.startsWith('- ') || /^\d+\.\s/.test(line)) return false;
    if (line.startsWith('#')) return false;
    if (line.startsWith('**') || line.startsWith('>')) return false;
    if (/^(FIRST (COMMENT|REPLY):|CAROUSEL OUTLINE:)/i.test(line)) return false;
    return true;
  };
  for (const block of blocks) {
    if (isTight(block)) {
      buffer.push(block);
    } else {
      flush();
      merged.push(block);
    }
  }
  flush();
  return merged.join('\n\n');
}

// ── Post-processing validation ──────────────────────────────────────────

const TWITTER_HARD_LIMIT = 280;
const LINKEDIN_HARD_LIMIT = 3000;

/**
 * Validate social content against the source case study.
 * Checks: character limits, CVE grounding, URL allowlisting, slop detection.
 */
function validateSocial(text: string, platform: 'twitter' | 'linkedin', sourceBody: string): SocialQuality {
  const issues: string[] = [];

  // For Twitter threads, we check individual posts, not the whole thread
  let maxPostLength = 0;
  if (platform === 'twitter') {
    const posts = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
    for (const post of posts) {
      // Strip counter suffix like " (1/6)" before measuring
      const clean = post.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
      if (clean.length > maxPostLength) maxPostLength = clean.length;
    }
    if (maxPostLength > TWITTER_HARD_LIMIT) {
      issues.push(`Post exceeds ${TWITTER_HARD_LIMIT} chars (${maxPostLength})`);
    }
  } else {
    // LinkedIn: check body before FIRST COMMENT
    const bodyPart = text.split(/FIRST COMMENT:/i)[0]?.trim() ?? text;
    if (bodyPart.length > LINKEDIN_HARD_LIMIT) {
      issues.push(`LinkedIn body exceeds ${LINKEDIN_HARD_LIMIT} chars (${bodyPart.length})`);
    }
    maxPostLength = bodyPart.length;
  }

  // CVE grounding: check CVEs in social exist in source
  const ungrounded = findUngroundedCves(text, sourceBody);
  if (ungrounded.length > 0) {
    issues.push(`${ungrounded.length} ungrounded CVE(s): ${ungrounded.slice(0, 3).join(', ')}`);
  }

  // URL allowlisting
  const { stripped } = stripUntrustedUrls(text);
  if (stripped.length > 0) {
    issues.push(`${stripped.length} untrusted URL(s)`);
  }

  // Slop detection
  const slop = detectSlop(text);
  if (slop.length > 1) {
    issues.push(`${slop.length} AI-slop phrases`);
  }

  // Score: start at 100, deduct for issues
  let score = 100;
  if (platform === 'twitter' && maxPostLength > TWITTER_HARD_LIMIT) score -= 30;
  if (platform === 'linkedin' && maxPostLength > LINKEDIN_HARD_LIMIT) score -= 20;
  score -= Math.min(30, ungrounded.length * 15);
  score -= Math.min(15, stripped.length * 5);
  score -= Math.min(15, slop.length * 7);
  score = Math.max(0, Math.min(100, score));

  return {
    char_count: maxPostLength,
    over_limit: platform === 'twitter' ? maxPostLength > TWITTER_HARD_LIMIT : maxPostLength > LINKEDIN_HARD_LIMIT,
    ungrounded_cves: ungrounded,
    untrusted_urls: stripped.length,
    slop_count: slop.length,
    score,
    issues,
  };
}

/**
 * Strip untrusted URLs and ungrounded CVEs from social content.
 * Returns cleaned text.
 */
function cleanSocial(text: string, sourceBody: string): string {
  let cleaned = text;

  // Strip untrusted URLs
  const { cleaned: urlCleaned } = stripUntrustedUrls(cleaned);
  cleaned = urlCleaned;

  // Remove ungrounded CVE references (replace with generic phrasing)
  const ungrounded = findUngroundedCves(cleaned, sourceBody);
  for (const cve of ungrounded) {
    // Replace "CVE-2024-1234" with "the vulnerability" or similar
    cleaned = cleaned.replace(new RegExp(cve.replace('-', '\\-'), 'gi'), 'the vulnerability');
  }

  return cleaned;
}

// ── Self-heal loop ──────────────────────────────────────────────────────

const MAX_SOCIAL_RETRIES = 1;

async function generateWithValidation(
  ai: Ai,
  system: string,
  userPrompt: string,
  platform: 'twitter' | 'linkedin',
  sourceBody: string,
  groqKey?: string,
  maxTokens = 1200
): Promise<{ text: string; quality: SocialQuality }> {
  let lastText = '';
  let lastQuality: SocialQuality | undefined;

  for (let attempt = 0; attempt <= MAX_SOCIAL_RETRIES; attempt++) {
    let prompt = userPrompt;

    // On retry, add validation feedback
    if (attempt > 0 && lastQuality) {
      const feedback = lastQuality.issues.map((i) => `- ${i}`).join('\n');
      prompt = `${userPrompt}\n\n---\nPREVIOUS ATTEMPT HAD ISSUES:\n${feedback}\n\nFix these issues. Return ONLY the corrected content.`;
    }

    const result = await runCompletion(
      ai,
      { system, user: prompt, temperature: 0.7, maxTokens },
      { groqKey, quality: true }
    );

    lastText = platform === 'twitter' ? tidySocial(result.text) : tidyLinkedin(result.text);
    lastQuality = validateSocial(lastText, platform, sourceBody);

    // If quality is acceptable, break
    if (lastQuality.score >= 60 && !lastQuality.over_limit) break;

    // Clean the output for the next attempt
    lastText = cleanSocial(lastText, sourceBody);
    lastQuality = validateSocial(lastText, platform, sourceBody);
    if (lastQuality.score >= 60 && !lastQuality.over_limit) break;
  }

  return { text: lastText, quality: lastQuality! };
}

// ── Prompt builders ─────────────────────────────────────────────────────

function buildTwitterPrompt(src: SocialSource): string {
  const postUrl = src.slug.startsWith('http') ? src.slug : `https://pranithjain.qzz.io/blog/${src.slug}`;
  return (
    `<format name="X/Twitter thread">\n` +
    `- 5-7 posts for a technical breakdown. A single post for breaking news or one sharp take. Use only what the facts justify.\n` +
    `- Post 1 (<=280 chars): Hook that stops the scroll. Use PAS. NO "1/" prefix. NO link (kills reach). NO teaser framing.\n` +
    `- Posts 2-5: One clear idea per post. Examples, data points, or analysis. Each standalone-valuable.\n` +
    `- Post 6 (or last): Insight or revelation — the analytical take that makes this thread worth reading.\n` +
    `- Final post: CTA that invites reply. Not "thoughts?".\n` +
    `- LINK in a separate final line: "FIRST REPLY: ${postUrl}"\n` +
    `- Each post <280 characters. Append " (n/N)" at the END of each post.\n` +
    `- Lowercase optional for personal tone. Fragments ok.\n` +
    `- Include ONE bookmark-worthy post: a reusable artifact (IOC list, affected versions, CVE list).\n` +
    `- At most ONE hashtag (if genuinely specific). At most ONE warning-level emoji (🔴 ⚠️), never decorative.\n` +
    `- CRITICAL: Every CVE ID, statistic, and IOC must come from the input data. Do not invent.\n` +
    `</format>\n\n` +
    `<examples>\n` +
    `GOOD post 1: "Lockbit5 posted 15 victims in 7 days. 4 already appeared under other affiliates this quarter. Same haul, second auction. Affiliate movement, not new compromise. (1/6)"\n` +
    `BAD:   "1/ Today I want to talk about the Lockbit5 leak site activity. Let's dive in."\n` +
    `</examples>\n\n` +
    `<input>\n` +
    `Title: ${src.title}\n\n` +
    `Details:\n${gist(src.body)}\n` +
    `</input>`
  );
}

function buildLinkedinPrompt(src: SocialSource): string {
  const postUrl = src.slug.startsWith('http') ? src.slug : `https://pranithjain.qzz.io/blog/${src.slug}`;
  return (
    `<format name="LinkedIn post">\n` +
    `- 1300-2000 characters (body only, before FIRST COMMENT and hashtags). Best length is around 1600.\n` +
    `- HOOK in first 2 lines. PAS structure: name the problem, agitate, tease the solution. ` +
    `No throat-clearing, no "New post!", no "I've been thinking about".\n` +
    `- BODY: story or insight in the middle. 2-3 short paragraphs, each 1-3 sentences. ` +
    `Lead with the insight, then context, then what it means. "Here's what caught my eye -> here's why it matters -> here's what I'd do about it".\n` +
    `- VOICE: Use "I" naturally, have a point of view. Professional but human.\n` +
    `- DETAILS: One specific number, CVE, or named entity from the data. Be precise.\n` +
    `- LINK: NEVER in body. Final line: "FIRST COMMENT: ${postUrl}"\n` +
    `- CLOSE: Strong CTA — one substantive question that invites practitioner experience. Not "Thoughts?" or "Let me know".\n` +
    `- HASHTAGS: 3-5 on their own final line. Specific to this post (#Log4Shell #DFIR), not generic (#CyberSecurity).\n` +
    `- NO emojis. Bold at most ONE phrase with **asterisks**, only if it earns it.\n` +
    `- NO carousel outlines, no section labels, no "CAROUSEL OUTLINE:" blocks.\n` +
    `- CRITICAL: Every CVE ID, statistic, and named entity must come from the input data. Do not invent.\n` +
    `</format>\n\n` +
    `<examples>\n` +
    `HOOK — GOOD: "Lockbit5 listed 15 victims this week. 4 of those targets already appeared on a different affiliate's site this quarter. That's not new compromise — that's affiliate churn."\n` +
    `HOOK — BAD: "🚨 The ransomware landscape is evolving. Lockbit5 is back and more dangerous than ever. Let's break it down."\n` +
    `CLOSE — GOOD: "If your IR retainer treats every extortion note as a fresh compromise, how are you handling the re-victimisation angle?"\n` +
    `CLOSE — BAD: "What do you think? Let me know in the comments!"\n` +
    `</examples>\n\n` +
    `<input>\n` +
    `Title: ${src.title}\n\n` +
    `Details:\n${gist(src.body)}\n` +
    `</input>`
  );
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Extract verified facts from text to ground social content generation.
 * This prevents hallucination by giving the model explicit facts to reference.
 */
function extractVerifiedFacts(body: string): string {
  const facts: string[] = [];

  // Extract CVEs
  const cves = body.match(/CVE-\d{4}-\d{4,}/g) ?? [];
  if (cves.length > 0) facts.push(`CVEs mentioned: ${[...new Set(cves)].slice(0, 8).join(', ')}`);

  // Extract IPs
  const ips = body.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? [];
  const realIps = ips.filter((ip) => !ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('172.'));
  if (realIps.length > 0) facts.push(`IOCs (IPs): ${[...new Set(realIps)].slice(0, 5).join(', ')}`);

  // Extract hashes
  const hashes = body.match(/\b[a-fA-F0-9]{64}\b/g) ?? [];
  if (hashes.length > 0) facts.push(`Hashes: ${[...new Set(hashes)].slice(0, 3).join(', ')}`);

  // Extract actor/group names (common patterns)
  const actorPatterns =
    body.match(
      /\b(APT\d+|Lazarus|FIN\d+|TA\d+|LockBit|Cl0p|Black Basta|ALPHV|Rhysida|Akira|Play|Royal|Conti|REvil|Maze|Ryuk|Emotet|TrickBot|Cobalt Strike)\b/gi
    ) ?? [];
  if (actorPatterns.length > 0)
    facts.push(`Actors/groups: ${[...new Set(actorPatterns.map((a) => a.toLowerCase()))].slice(0, 5).join(', ')}`);

  // Extract MITRE techniques
  const techniques = body.match(/T\d{4}(?:\.\d{3})?/g) ?? [];
  if (techniques.length > 0) facts.push(`MITRE techniques: ${[...new Set(techniques)].slice(0, 5).join(', ')}`);

  // Extract sectors
  const sectorPatterns =
    body.match(
      /\b(healthcare|manufacturing|finance|government|education|energy|retail|technology|transportation|media)\b/gi
    ) ?? [];
  if (sectorPatterns.length > 0)
    facts.push(`Sectors: ${[...new Set(sectorPatterns.map((s) => s.toLowerCase()))].slice(0, 5).join(', ')}`);

  // Extract victim counts
  const victimCounts = body.match(/\b(\d+)\s*(?:victims?|targets?|organizations?|companies?)\b/gi) ?? [];
  if (victimCounts.length > 0) facts.push(`Victim counts: ${victimCounts.slice(0, 3).join(', ')}`);

  if (facts.length === 0) return '';
  return `\n<verified_facts from_case_study>\n${facts.join('\n')}\nUse ONLY these facts when making specific claims in the social post. Do NOT invent numbers, CVEs, or statistics.\n</verified_facts>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Convert a Post to a SocialSource (backward compat). */
function postToSource(post: Post): SocialSource {
  return { slug: post.slug, title: post.title, body: post.body };
}

/** Format candidate evidence as a text body for the LLM. */
export function formatEvidenceText(evidence: Record<string, unknown>): string {
  const parts: string[] = [];
  const add = (label: string, val: unknown) => {
    if (val === undefined || val === null) return;
    const s = typeof val === 'string' ? val : JSON.stringify(val);
    if (s.length > 0) parts.push(`${label}: ${s}`);
  };
  if (evidence.hook) add('Hook', evidence.hook);
  if (evidence.angle) add('Angle', evidence.angle);
  if (evidence.rationale) add('Rationale', evidence.rationale);
  if (evidence.impact) add('Impact', evidence.impact);
  if (evidence.urgency) add('Urgency', evidence.urgency);
  if (Array.isArray(evidence.entities)) add('Entities', evidence.entities.join(', '));
  if (Array.isArray(evidence.sources) && (evidence.sources as string[]).some((s) => s.startsWith('http'))) {
    add('Sources', (evidence.sources as string[]).filter((s) => s.startsWith('http')).join(', '));
  }
  // Fallback: dump the whole evidence as formatted JSON
  if (parts.length === 0) {
    const { hook, angle, trendingSignal, generatedAt, source, ...rest } = evidence as Record<string, unknown>;
    return JSON.stringify(rest, null, 2);
  }
  return parts.join('\n');
}

// ── Internal generators (accept SocialSource) ────────────────────────────

async function generateTwitterFromSource(
  src: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ twitter: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  const factNote = extractVerifiedFacts(src.body);
  const { text, quality } = await generateWithValidation(
    ai,
    SOCIAL_SYSTEM,
    buildTwitterPrompt(src) + factNote,
    'twitter',
    src.body,
    groqKey,
    1200
  );
  return { twitter: text, generatedAt: now.toISOString(), _validation: { quality } };
}

async function generateLinkedinFromSource(
  src: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ linkedin: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  const factNote = extractVerifiedFacts(src.body);
  const { text, quality } = await generateWithValidation(
    ai,
    SOCIAL_SYSTEM,
    buildLinkedinPrompt(src) + factNote,
    'linkedin',
    src.body,
    groqKey,
    1400
  );
  return { linkedin: text, generatedAt: now.toISOString(), _validation: { quality } };
}

async function generateSocialFromSource(
  src: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<SocialContent> {
  const factNote = extractVerifiedFacts(src.body);

  const [twitterRes, linkedinRes] = await Promise.allSettled([
    generateWithValidation(ai, SOCIAL_SYSTEM, buildTwitterPrompt(src) + factNote, 'twitter', src.body, groqKey, 1200),
    generateWithValidation(ai, SOCIAL_SYSTEM, buildLinkedinPrompt(src) + factNote, 'linkedin', src.body, groqKey, 1400),
  ]);

  return {
    slug: src.slug,
    twitter: twitterRes.status === 'fulfilled' ? twitterRes.value.text : '',
    linkedin: linkedinRes.status === 'fulfilled' ? linkedinRes.value.text : '',
    generatedAt: now.toISOString(),
    _validation: {
      twitter_quality: twitterRes.status === 'fulfilled' ? twitterRes.value.quality : undefined,
      linkedin_quality: linkedinRes.status === 'fulfilled' ? linkedinRes.value.quality : undefined,
    },
  };
}

// ── Public API (backward compat — accept Post) ───────────────────────────

export async function generateSocialContent(post: Post, ai: Ai, now: Date, groqKey?: string): Promise<SocialContent> {
  return generateSocialFromSource(postToSource(post), ai, now, groqKey);
}

export async function generateTwitterContent(
  post: Post,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ twitter: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  return generateTwitterFromSource(postToSource(post), ai, now, groqKey);
}

export async function generateLinkedinContent(
  post: Post,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ linkedin: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  return generateLinkedinFromSource(postToSource(post), ai, now, groqKey);
}

// ── New Public API (accept raw content) ──────────────────────────────────

/** Generate LinkedIn+Twitter from a candidate's evidence. */
export async function generateSocialFromCandidate(
  candidate: Candidate,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<SocialContent> {
  const src: SocialSource = {
    slug: candidate.key,
    title: candidate.title,
    body: formatEvidenceText(candidate.evidence),
  };
  return generateSocialFromSource(src, ai, now, groqKey);
}

/** Generate Twitter from a candidate's evidence. */
export async function generateTwitterFromCandidate(
  candidate: Candidate,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ twitter: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  const src: SocialSource = {
    slug: candidate.key,
    title: candidate.title,
    body: formatEvidenceText(candidate.evidence),
  };
  return generateTwitterFromSource(src, ai, now, groqKey);
}

/** Generate LinkedIn from a candidate's evidence. */
export async function generateLinkedinFromCandidate(
  candidate: Candidate,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ linkedin: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  const src: SocialSource = {
    slug: candidate.key,
    title: candidate.title,
    body: formatEvidenceText(candidate.evidence),
  };
  return generateLinkedinFromSource(src, ai, now, groqKey);
}

/** Generate social content from user-provided notes/text. */
export async function generateSocialFromNotes(
  notes: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<SocialContent> {
  return generateSocialFromSource(notes, ai, now, groqKey);
}

/** Generate Twitter from user-provided notes/text. */
export async function generateTwitterFromNotes(
  notes: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ twitter: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  return generateTwitterFromSource(notes, ai, now, groqKey);
}

/** Generate LinkedIn from user-provided notes/text. */
export async function generateLinkedinFromNotes(
  notes: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ linkedin: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  return generateLinkedinFromSource(notes, ai, now, groqKey);
}

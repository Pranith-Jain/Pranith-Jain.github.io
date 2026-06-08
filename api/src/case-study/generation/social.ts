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
  `<task>You are a security practitioner writing platform-native posts. ` +
  `Same person, same voice, shorter form. Never sound like a brand account.</task>\n\n` +
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
    `<voice>\n` +
    `Practitioner sharing a finding. Not hot takes, not brand voice. ` +
    `The kind of thread you'd bookmark because it has actual signal.\n` +
    `</voice>\n\n` +
    `<format name="X/Twitter thread">\n` +
    `- Post 1 (<=280 chars): The single sharpest observation. A number, a named entity, a contrast. ` +
    `NO "1/" prefix. NO link in post 1 (kills reach). NO teaser framing ("let's dive in", "big news").\n` +
    `- Thread body: 3-6 posts. Each post is one concrete point — a data point, an observation, a question. ` +
    `Append " (n/N)" at the END of each post (not the start).\n` +
    `- LINK in the final "FIRST REPLY:" block on its own line: "FIRST REPLY: ${postUrl}"\n` +
    `- Include ONE bookmark-worthy post: a reusable artifact (IOC list, affected versions, Sigma one-liner, CVE list).\n` +
    `- End with a question or an analytical take that invites reply. Not "thoughts?".\n` +
    `- At most ONE hashtag, only if genuinely specific (a campaign or CVE tag). At most ONE warning-level emoji (🔴 ⚠️), never decorative.\n` +
    `- CRITICAL: Every CVE ID, statistic, and IOC must come from the input data. Do not invent.\n` +
    `</format>\n\n` +
    `<input>\n` +
    `Title: ${src.title}\n\n` +
    `Details:\n${gist(src.body)}\n` +
    `</input>`
  );
}

function buildLinkedinPrompt(src: SocialSource): string {
  const postUrl = src.slug.startsWith('http') ? src.slug : `https://pranithjain.qzz.io/blog/${src.slug}`;
  return (
    `<voice>\n` +
    `You're an experienced DFIR/threat-intel practitioner sharing something you actually found interesting. ` +
    `Not a reporter, not a brand. Someone who's been in the trenches and noticed a pattern worth flagging. ` +
    `Write the way you'd talk to a peer at a conference — informed, specific, no fluff.\n` +
    `</voice>\n\n` +
    `<format name="LinkedIn post">\n` +
    `- HOOK (first 2 lines): One specific, surprising observation. A number, a contrast, a named entity. ` +
    `Something that makes a defence practitioner stop scrolling. No throat-clearing, no "New post!", no "I've been thinking about".\n` +
    `- BODY: 3-5 short paragraphs. Each paragraph is ONE idea, 1-3 sentences. ` +
    `Lead with the insight (not the background). Then context, then what it means. ` +
    `Think: "Here's what caught my eye → here's why it matters → here's what I'd do about it".\n` +
    `- VOICE: Use "I" naturally ("I've been watching", "what stood out to me"). ` +
    `Have a point of view — state your take, don't just describe. It's okay to say "I'm not sure this matters yet" or "this changes how I think about X".\n` +
    `- DETAILS: Include ONE specific number, CVE, or named entity from the data. Be precise ("CVE-2026-42607 in Grav CMS, CVSS 9.1" not "a critical vuln").\n` +
    `- LINK: NEVER in body. Final line: "FIRST COMMENT: ${postUrl}"\n` +
    `- CLOSE: One substantive question that invites practitioner experience ("Has anyone else seen this pattern?", "How are you handling the affiliate-handoff case?"). Not "Thoughts?" or "Let me know".\n` +
    `- HASHTAGS: 3-5 on their own final line. Specific to this post (#Log4Shell #DFIR — NOT #CyberSecurity #Tech).\n` +
    `- LENGTH: 1200-1800 characters for the body (before FIRST COMMENT and tags).\n` +
    `- NO emojis. Bold at most ONE phrase with **asterisks**, only if it earns it.\n` +
    `- NO carousel outlines, no "CAROUSEL OUTLINE:" blocks. Just the post.\n` +
    `- CRITICAL: Every CVE ID, statistic, and named entity must come from the input data. Do not invent.\n` +
    `</format>\n\n` +
    `<examples>\n` +
    `HOOK — GOOD: "Lockbit5 listed 15 victims this week. 4 of those targets already appeared on a different affiliate's site this quarter. Same victims, second auction. That's not new compromise — that's affiliate churn."\n` +
    `HOOK — BAD: "🚨 The ransomware landscape is evolving. Lockbit5 is back and more dangerous than ever. Let's break it down."\n` +
    `CLOSE — GOOD: "If your IR retainer treats every extortion note as a fresh compromise, how are you handling the re-victimisation angle? Curious how others are triaging this."\n` +
    `CLOSE — BAD: "What do you think? Let me know in the comments!"\n` +
    `LINK BLOCK: "FIRST COMMENT: ${postUrl}"\n` +
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

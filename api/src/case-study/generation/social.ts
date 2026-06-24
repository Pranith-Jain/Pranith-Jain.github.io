import type { Ai } from '@cloudflare/workers-types';
import type { Candidate, Post } from '../types';
import { runCompletion } from './ai-client';
import { VOICE_IDENTITY, COPYWRITING_RULES, PIPELINE_OUTPUT_GUARDRAIL, QUALITY_CHECKS } from './copywriting';
import { stripUntrustedUrls, findUngroundedCves, detectSlop } from '../../lib/ai-output-validator';
import { slugify } from '../stable-keys';
import type { CarouselSpec, ContentSlide } from '../social/slide-spec';
import { buildCarouselSlides } from '../social/carousel-build';
import { buildHashtags } from './hashtags';
import { generateHookVariants } from './hook-variants';

export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  instagram?: string;
  carousel?: CarouselSpec;
  /** Alternative opening hooks (different angles) for A/B / manual selection. */
  hooks?: string[];
  generatedAt: string;
  _validation?: {
    twitter_quality?: SocialQuality;
    linkedin_quality?: SocialQuality;
    instagram_quality?: SocialQuality;
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
  /** Entity-derived hashtags (from `buildHashtags`) the prompts instruct the
   *  model to end with — specific, on-topic tags instead of generic stacks. */
  hashtags?: string[];
}

const SOCIAL_SYSTEM =
  VOICE_IDENTITY +
  `<task>Content repurposing. You turn one piece of analysis into platform-native posts. ` +
  `Not reformatting — rewriting for how each platform's algorithm thinks and how each audience consumes. ` +
  `Same practitioner voice, shorter form. Never sound like a brand account.</task>\n\n` +
  COPYWRITING_RULES +
  `\n\n` +
  PIPELINE_OUTPUT_GUARDRAIL +
  `\n\n` +
  QUALITY_CHECKS;

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
const INSTAGRAM_HARD_LIMIT = 2200;
// LinkedIn soft floor. The 4-block structure the prompt requires needs
// 1500+ characters to deliver substance (hook + insight + specifics list +
// close). A post under 1300 chars almost always means the
// model skipped the SPECIFICS list or the INSIGHT block. Treat it as a
// quality issue that will trigger a retry rather than a length cap.
const LINKEDIN_SOFT_FLOOR = 1300;
const LINKEDIN_HARD_FLOOR = 900;

/**
 * Validate social content against the source case study.
 * Checks: character limits, CVE grounding, URL allowlisting, slop detection.
 */
function validateSocial(
  text: string,
  platform: 'twitter' | 'linkedin' | 'instagram',
  sourceBody: string
): SocialQuality {
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
  } else if (platform === 'instagram') {
    // Instagram: simple char-count check against the 2200 limit
    if (text.length > INSTAGRAM_HARD_LIMIT) {
      issues.push(`Instagram caption exceeds ${INSTAGRAM_HARD_LIMIT} chars (${text.length})`);
    }
    maxPostLength = text.length;
  } else {
    // LinkedIn: check body before FIRST COMMENT
    const bodyPart = text.split(/FIRST COMMENT:/i)[0]?.trim() ?? text;
    if (bodyPart.length > LINKEDIN_HARD_LIMIT) {
      issues.push(`LinkedIn body exceeds ${LINKEDIN_HARD_LIMIT} chars (${bodyPart.length})`);
    }
    if (bodyPart.length < LINKEDIN_HARD_FLOOR) {
      issues.push(
        `LinkedIn body is below ${LINKEDIN_HARD_FLOOR}-char floor (${bodyPart.length}); the post is too thin to be useful`
      );
    } else if (bodyPart.length < LINKEDIN_SOFT_FLOOR) {
      issues.push(
        `LinkedIn body is under the ${LINKEDIN_SOFT_FLOOR}-char target (${bodyPart.length}); pad with substance, not restatement`
      );
    }
    maxPostLength = bodyPart.length;
  }

  // CVE grounding: check CVEs in social exist in source
  const ungrounded = findUngroundedCves(text, sourceBody);
  if (ungrounded.length > 0) {
    issues.push(`${ungrounded.length} ungrounded CVE(s): ${ungrounded.slice(0, 3).join(', ')}`);
  }

  // Concrete-specifics check (LinkedIn only). The post must name
  // concrete entities (CVE ids, version numbers, regions, sectors, named
  // vendors or actors) or it falls into the "generic prose" failure
  // mode the user has been seeing — long, fluent, but says nothing the
  // reader can act on or quote. We count distinctive tokens that are
  // LIKELY to indicate a concrete entity without false-positiving on
  // ordinary English. Sources are NOT in the body (the link lives in
  // the first comment) so we count from the body only.
  let concreteHits = 0;
  if (platform === 'linkedin') {
    const bodyOnly = text.split(/FIRST COMMENT:/i)[0] ?? text;
    const cves = bodyOnly.match(/\bCVE-\d{4}-\d{4,7}\b/g) ?? [];
    const versionish = bodyOnly.match(/\bv?\d+\.\d+(?:\.\d+)?\b/g) ?? [];
    // Common CTI vendor / sector / region vocabulary. Curated short list.
    // NOTE: matched on WORD BOUNDARIES (see matchConcrete below), never as raw
    // substrings — substring matching let filler words satisfy the gate
    // ("beca-us-e" hit "us", "dis-play" hit "play", "go to" hit "go "), which
    // defeated the whole point of the concrete-specifics check. Ambiguous
    // short tokens ('us'/'uk'/'eu'/'go'/'play'/bare 'actor'/'soc'/'spring'/
    // 'node'/'rust') were dropped; full names ('india', 'threat actor') stay.
    const concreteWords = [
      'ransomware',
      'malware',
      'phishing',
      'apt',
      'threat actor',
      'cve',
      'cvss',
      'cwe',
      'mitre',
      'att&ck',
      'healthcare',
      'manufacturing',
      'financial',
      'energy',
      'government',
      'india',
      'japan',
      'germany',
      'france',
      'brazil',
      'aws',
      'azure',
      'gcp',
      'kubernetes',
      'linux',
      'windows',
      'macos',
      'firewall',
      'edr',
      'siem',
      'vpn',
      'okta',
      'office 365',
      'cisco',
      'fortinet',
      'palo alto',
      'vmware',
      'citrix',
      'ivanti',
      'apache',
      'nginx',
      'wordpress',
      'joomla',
      'drupal',
      'magento',
      'log4j',
      'log4shell',
      'tomcat',
      'jenkins',
      'gitlab',
      'python',
      'php',
      'ruby',
      'lockbit',
      'cl0p',
      'clop',
      'blackcat',
      'alphv',
      'akira',
      'ragnar',
      'medusa',
      'inc ransom',
      '8base',
      'bianlian',
      'qilin',
    ];
    const lc = bodyOnly.toLowerCase();
    // Boundary-aware match: the token must sit between non-alphanumerics (or
    // string edges) so 'us' matches "us" / "the US" but not "because".
    const matchConcrete = (w: string): boolean => {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`).test(lc);
    };
    concreteHits = cves.length;
    for (const w of concreteWords) {
      if (matchConcrete(w)) concreteHits += 1;
    }
    // Version numbers count as concrete on their own (e.g. "iOS 17.4",
    // "Apache 2.4.57") but only when they look anchored to a product
    // — we just count them, since false-positives on dates are fine.
    concreteHits += Math.min(versionish.length, 3);
    // 3 is the absolute minimum for a post that's "about something".
    if (concreteHits < 3) {
      issues.push(
        `body has only ${concreteHits} concrete specifics (named CVE / vendor / version / sector / actor / region). Add at least 3 to be useful.`
      );
    } else if (concreteHits < 5) {
      issues.push(
        `body has ${concreteHits} concrete specifics — fine but the SPECIFICS list is the scan path; aim for 5-8.`
      );
    }
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

  // Reuse the concrete-specifics count from the issues check above (which
  // uses the same concreteWords list + version counting) so scoring always
  // agrees with the issues detection. 0 for Twitter (not checked).
  const concreteSpecifics = platform === 'linkedin' ? concreteHits : 0;

  // Score: start at 100, deduct for issues
  let score = 100;
  if (platform === 'twitter' && maxPostLength > TWITTER_HARD_LIMIT) score -= 30;
  if (platform === 'linkedin' && maxPostLength > LINKEDIN_HARD_LIMIT) score -= 20;
  if (platform === 'linkedin' && maxPostLength < LINKEDIN_HARD_FLOOR) score -= 50;
  else if (platform === 'linkedin' && maxPostLength < LINKEDIN_SOFT_FLOOR) score -= 25;
  // Generic-prose failure mode. The post says nothing concrete the
  // reader can act on — common when the model pads with hedge words.
  if (platform === 'linkedin' && concreteSpecifics < 3) score -= 40;
  else if (platform === 'linkedin' && concreteSpecifics < 5) score -= 15;
  score -= Math.min(30, ungrounded.length * 15);
  score -= Math.min(15, stripped.length * 5);
  score -= Math.min(15, slop.length * 7);
  score = Math.max(0, Math.min(100, score));

  return {
    char_count: maxPostLength,
    over_limit:
      platform === 'twitter'
        ? maxPostLength > TWITTER_HARD_LIMIT
        : platform === 'instagram'
          ? maxPostLength > INSTAGRAM_HARD_LIMIT
          : maxPostLength > LINKEDIN_HARD_LIMIT,
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
    cleaned = cleaned.replace(new RegExp('\\b' + cve.replace(/-/g, '\\-') + '\\b', 'gi'), 'the vulnerability');
  }

  return cleaned;
}

// ── Self-heal loop ──────────────────────────────────────────────────────

const MAX_SOCIAL_RETRIES = 1;

async function generateWithValidation(
  ai: Ai,
  system: string,
  userPrompt: string,
  platform: 'twitter' | 'linkedin' | 'instagram',
  sourceBody: string,
  groqKey?: string,
  googleKey?: string,
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
      { googleKey, groqKey, quality: true }
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

function buildTwitterPrompt(src: SocialSource, includeLink = true): string {
  const postUrl = `https://pranithjain.qzz.io/blog/${src.slug}`;
  return (
    `<format name="X/Twitter thread">\n` +
    `- Before writing, think through 5 different hook options silently. Pick the strongest one — the one that stops the scroll. Output ONLY the final thread — no reasoning, no option list, no commentary.\n` +
    `- 5-8 posts for a technical breakdown. A single post for breaking news or one sharp take. Use only what the facts justify.\n` +
    `- Tweet 1 (<= 280 chars): Hook that stops the scroll, built from THIS case's facts. It does NOT start with "1/". NO link (kills reach). NO teaser framing. Lead with a named entity, a hard number, or a sharp contrast. Vary the form from your other threads.\n` +
    `- Tweets 2-5: One clear idea per tweet. Examples, data points, or analysis. Each tweet stands alone and carries its own value. Include ONE bookmark-worthy post (IOC list, affected versions, CVE list).\n` +
    `- Tweet 6 (or last): Insight or revelation — the analytical take that makes this thread worth reading. End with a twist or perspective shift, not a summary.\n` +
    `- Final tweet: CTA that invites reply. Use an open loop or a substantive question. Not "thoughts?" or "retweet if".\n` +
    (includeLink
      ? `- LINK in a separate final line: "FIRST REPLY: ${postUrl}"\n`
      : `- Do NOT include a FIRST REPLY or FIRST COMMENT link.\n`) +
    `- Each post < 280 chars. Append " (n/N)" at the END of each post.\n` +
    `- Lowercase optional for personal tone. Fragments ok. Run-ons... human texture.\n` +
    `- At most ONE hashtag (if genuinely specific)${
      src.hashtags?.length ? `; if you use one, prefer: ${src.hashtags.slice(0, 3).join(' ')}` : ''
    }. At most ONE warning-level emoji (🔴 ⚠️), never decorative.\n` +
    `- CRITICAL: Every CVE ID, statistic, and IOC must come from the input data. Do not invent.\n` +
    `</format>\n\n` +
    `<examples>\n` +
    `GOOD post 1: "Lockbit5 posted 15 victims in 7 days. 4 already appeared under other affiliates this quarter. Same haul, second auction. Affiliate movement, not new compromise. (1/6)"\n` +
    `BAD:   "1/ Today I want to talk about the Lockbit5 leak site activity. Let's dive in."\n` +
    `NOTE: the numbers in the GOOD example ("15 victims", "4 affiliates") show the FORM of a concrete hook, not data to reuse. Use ONLY figures present in the input below. If the data has no number for a point, cut the point rather than invent one.\n` +
    `</examples>\n\n` +
    `<input>\n` +
    `Title: ${src.title}\n\n` +
    `Details:\n${gist(src.body)}\n` +
    `</input>`
  );
}

function buildLinkedinPrompt(src: SocialSource, includeLink = true): string {
  const postUrl = `https://pranithjain.qzz.io/blog/${src.slug}`;
  return (
    `<format name="LinkedIn post — practitioner thought-leadership (2026)">\n` +
    `- Before writing, think through 5 different hook options silently. Pick the strongest one — the one that stops the scroll. Output ONLY the final post — no reasoning, no option list, no commentary.\n` +
    `RANGE: 1300-2000 characters in the body (the first three lines, ~210 characters, are THE FOLD — everything before that is mobile-first feed preview and decides the click).\n` +
    `RULES — non-negotiable:\n` +
    `- THE FOLD (first 3 lines, <= 210 characters) MUST contain a complete, standalone point. Not a teaser. The reader who never clicks should still learn one specific thing. Lead with a named entity, a hard number, or a sharp contrast, pulled from THIS case.\n` +
    (includeLink
      ? `- The body must contain NO link. Putting a URL in the post body cuts reach 50-60%. The link goes on its own final line: "FIRST COMMENT: ${postUrl}".\n`
      : `- Do NOT include a FIRST COMMENT or link in the post.\n`) +
    `- Mobile-first formatting: short paragraphs (1-3 sentences), single blank line between paragraphs, generous white space. No walls of text. No paragraphs over 3 lines on a phone.\n` +
    `- Voice: first-person practitioner. Dry, opinionated, specific. Have a point of view. Professional but human. Specific results and numbers when relevant.\n` +
    `- Bold at most ONE phrase with **asterisks**, only if it earns the emphasis. No bolded sentences, no bolded lists.\n` +
    `- 3-5 specific, on-topic hashtags on the final line. Specific to the case (campaign name, vulnerability class, sector) — never a generic stack like #CyberSecurity #InfoSec.${
      src.hashtags?.length ? ` Use these (drop any that don't fit): ${src.hashtags.join(' ')}` : ''
    }\n` +
    `- Every CVE id, statistic, named victim, and named entity MUST come from the input data. Inventing a number is the fastest way to lose credibility.\n` +
    `\n` +
    `STRUCTURE — four blocks, each earns its place. Use a single blank line between blocks:\n` +
    `  1. HOOK (first 1-2 lines, <= 210 chars, entirely inside THE FOLD): a specific fact, a hard number, a sharp contrast, or a contrarian read, taken from THIS case. NOT a teaser. The reader should be able to stop here and still have learned something concrete. Do not reuse a hook shape you would use on another post.\n` +
    `  2. STORY OR INSIGHT (1-2 paragraphs, the analytical core): the pattern, the contrast, the technical detail other coverage missed. Lead with the take, then support it with data. Include a scannable 4-8 item bulleted list of concrete facts (named CVE / vendor / version / sector / IOC). One bullet = one fact.\n` +
    `  3. CLOSE (1-2 lines): the takeaway and one substantive practitioner question — the kind a SOC lead or IR consultant would actually answer. Not "Thoughts?" or "What do you think?".\n` +
    `  4. CAROUSEL OUTLINE: — optional but high-reach. When the case is a meaty technical breakdown (CVE chain, IOC dump, APT tradecraft, threat-actor profile), append a separate block on its own line: "CAROUSEL OUTLINE:" followed by 5-8 one-line slide titles (slide 1 = the hook, slides 2-7 = one specific idea each, slide 8 = the takeaway). Skip the block entirely for thin or breaking items — it should not appear at all if you have nothing to carousel.\n` +
    (includeLink
      ? `End the post (after any carousel block) with the FIRST COMMENT link and the hashtags:\nFIRST COMMENT: ${postUrl}\n#HashtagOne #HashtagTwo #HashtagThree\n`
      : `End the post with the hashtags on their own line.\n`) +
    `\n` +
    (includeLink
      ? `OUTPUT BLOCK ORDER (strict): HOOK -> INSIGHT + BULLETS -> CLOSE -> (optional) CAROUSEL OUTLINE: -> FIRST COMMENT: -> hashtags.\n`
      : `OUTPUT BLOCK ORDER (strict): HOOK -> INSIGHT + BULLETS -> CLOSE -> (optional) CAROUSEL OUTLINE: -> hashtags.\n`) +
    `</format>\n\n` +
    `<examples>\n` +
    `GOOD — full post (the kind that gets saved and quoted):\n` +
    `\n` +
    `LockBit listed 14 new victims last week. 4 of those companies already appeared on a different affiliate's site earlier this quarter.\n` +
    `Same haul, second auction. That's affiliate churn, not fresh compromise.\n` +
    `\n` +
    `Most coverage reads this as "LockBit is back, again." The story underneath is operational: affiliates rotate the same victim pool across leak sites to pressure payment. The encryptor and the negotiator are differentiators the public reporting doesn't separate.\n` +
    `\n` +
    `If your IR retainer treats every extortion note as a fresh compromise, you've already lost the timing advantage.\n` +
    `\n` +
    `- 14 victims listed, 6 in healthcare, 3 in manufacturing\n` +
    `- 4 re-victimisations traced to a single haul across two affiliates\n` +
    `- Median dwell time on the leak site before takedown: 11 days\n` +
    `- Negotiation tactic: affiliate-A publishes, affiliate-B counters at lower price\n` +
    `- Detection gap: most EDR rules key on encryptor hash, not on the handoff\n` +
    `\n` +
    `If your extortion playbook doesn't cover the re-victimisation case, what does your IR retainer actually hand off between attempts?\n` +
    `\n` +
    `CAROUSEL OUTLINE:\n` +
    `1. The 14-victim week that wasn't 14 new compromises\n` +
    `2. Re-victimisation rate across LockBit affiliates this quarter\n` +
    `3. Why affiliates rotate the same pool, not new ones\n` +
    `4. The encryptor-vs-negotiator split the leak sites don't show\n` +
    `5. Detection gap: keys on hash, misses the handoff\n` +
    `6. IR retainer patterns that fail this case\n` +
    `7. What to change in the extortion playbook this quarter\n` +
    `\n` +
    (includeLink ? `FIRST COMMENT: ${postUrl}\n` : ``) +
    `#LockBit #Ransomware #DFIR #ThreatIntel\n` +
    `\n` +
    `↑ Notes: 14 named victims, 4 re-victimisations, dwell time, named tactic — every number is in the case. Hook lands the whole point above the fold in two lines. Insight block carries the analytical take. Bullets are scannable, each one fact. Close is a question practitioners actually answer.\n` +
    `\n` +
    `BAD — full post (exactly what to avoid):\n` +
    `\n` +
    `🚨 New post: LockBit ransomware is back and the implications are huge. In this analysis I break down what we're seeing and what it means for defenders.\n` +
    `\n` +
    `The threat landscape is evolving. Adversaries are getting more sophisticated. In today's rapidly changing cybersecurity environment, organizations must stay vigilant.\n` +
    `\n` +
    `- Many victims were affected\n` +
    `- Several sectors were targeted\n` +
    `- A number of indicators were observed\n` +
    `- Some best practices apply\n` +
    `\n` +
    `What do you think? Let me know in the comments! #cyber #security #infosec\n` +
    `\n` +
    `↑ hype-nouns ("implications are huge"), throat-clearing ("in today's landscape"), decorative emoji, "many/several/a number of/some" bullets, link in body, generic hashtag stack, weak close. This is exactly the post the algorithm buries.\n` +
    `\n` +
    `CRITICAL: every number, victim, dwell time, and percentage in the GOOD example is there to show the SHAPE of a specific, scannable post — they are NOT facts to carry over. In your post, use only figures, names, and indicators present in the input data below. If the data does not support a bullet, drop the bullet. Inventing a precise-sounding number to match the example is the single fastest way to lose credibility.\n` +
    `</examples>\n\n` +
    `<input>\n` +
    `Title: ${src.title}\n\n` +
    `Details:\n${gist(src.body)}\n` +
    `</input>`
  );
}

// ── Instagram prompt ────────────────────────────────────────────────────

function buildInstagramPrompt(src: SocialSource): string {
  return (
    `Write an Instagram caption for this analysis. <= 2200 characters.\n` +
    `- Open with a 1-2 line hook that stops the scroll (the carousel carries the depth).\n` +
    `- 3-5 short lines of value, practitioner voice. No markdown, no links in the body (IG captions aren't clickable).\n` +
    `- End with 5-8 specific hashtags on the final line (campaign/CVE/sector specific — never a generic #cybersecurity stack).${
      src.hashtags?.length ? ` Start from these (add a few broader-reach IG tags): ${src.hashtags.join(' ')}` : ''
    }\n\n` +
    `TITLE: ${src.title}\n\nSOURCE:\n${src.body.slice(0, 4000)}\n`
  );
}

async function generateInstagramFromSource(
  src: SocialSource,
  post: Post,
  ai: Ai,
  groqKey?: string,
  googleKey?: string
): Promise<{ caption: string; quality?: SocialQuality; slides: Awaited<ReturnType<typeof buildCarouselSlides>> }> {
  const [captionRes, slides] = await Promise.all([
    generateWithValidation(
      ai,
      SOCIAL_SYSTEM,
      buildInstagramPrompt(src),
      'instagram',
      src.body,
      groqKey,
      googleKey,
      1200
    ).catch(() => ({ text: '', quality: undefined as SocialQuality | undefined })),
    buildCarouselSlides(post, { ai, groqKey, googleKey }).catch(() => [] as ContentSlide[]),
  ]);
  return { caption: captionRes.text.slice(0, 2200), quality: captionRes.quality, slides };
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
  return {
    slug: post.slug,
    title: post.title,
    body: post.body,
    hashtags: buildHashtags({ type: post.type, title: post.title, evidence: post.evidence ?? {} }),
  };
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
  groqKey?: string,
  googleKey?: string
): Promise<{ twitter: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  const factNote = extractVerifiedFacts(src.body);
  const { text, quality } = await generateWithValidation(
    ai,
    SOCIAL_SYSTEM,
    buildTwitterPrompt(src) + factNote,
    'twitter',
    src.body,
    groqKey,
    googleKey,
    1500
  );
  return { twitter: text, generatedAt: now.toISOString(), _validation: { quality } };
}

async function generateLinkedinFromSource(
  src: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<{ linkedin: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  const factNote = extractVerifiedFacts(src.body);
  const { text, quality } = await generateWithValidation(
    ai,
    SOCIAL_SYSTEM,
    buildLinkedinPrompt(src) + factNote,
    'linkedin',
    src.body,
    groqKey,
    googleKey,
    2000
  );
  return { linkedin: text, generatedAt: now.toISOString(), _validation: { quality } };
}

async function generateSocialFromSource(
  src: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string,
  post?: Post
): Promise<SocialContent> {
  const factNote = extractVerifiedFacts(src.body);

  const [twitterRes, linkedinRes, igRes, hooksRes] = await Promise.allSettled([
    generateWithValidation(
      ai,
      SOCIAL_SYSTEM,
      buildTwitterPrompt(src) + factNote,
      'twitter',
      src.body,
      groqKey,
      googleKey,
      1500
    ),
    generateWithValidation(
      ai,
      SOCIAL_SYSTEM,
      buildLinkedinPrompt(src) + factNote,
      'linkedin',
      src.body,
      groqKey,
      googleKey,
      2000
    ),
    post
      ? generateInstagramFromSource(src, post, ai, groqKey, googleKey)
      : Promise.resolve({
          caption: '',
          quality: undefined as SocialQuality | undefined,
          slides: [] as Awaited<ReturnType<typeof buildCarouselSlides>>,
        }),
    generateHookVariants(src, ai, groqKey, googleKey),
  ]);

  const ig = igRes.status === 'fulfilled' ? igRes.value : { caption: '', quality: undefined, slides: [] };
  const hooks = hooksRes.status === 'fulfilled' ? hooksRes.value : [];
  return {
    slug: src.slug,
    twitter: twitterRes.status === 'fulfilled' ? twitterRes.value.text : '',
    linkedin: linkedinRes.status === 'fulfilled' ? linkedinRes.value.text : '',
    instagram: ig.caption || undefined,
    carousel: ig.slides.length ? { format: 'instagram', slides: ig.slides } : undefined,
    hooks: hooks.length ? hooks : undefined,
    generatedAt: now.toISOString(),
    _validation: {
      twitter_quality: twitterRes.status === 'fulfilled' ? twitterRes.value.quality : undefined,
      linkedin_quality: linkedinRes.status === 'fulfilled' ? linkedinRes.value.quality : undefined,
      instagram_quality: ig.quality,
    },
  };
}

// ── Public API (backward compat — accept Post) ───────────────────────────

export async function generateSocialContent(
  post: Post,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<SocialContent> {
  return generateSocialFromSource(postToSource(post), ai, now, groqKey, googleKey, post);
}

export async function generateTwitterContent(
  post: Post,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<{ twitter: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  return generateTwitterFromSource(postToSource(post), ai, now, groqKey, googleKey);
}

export async function generateLinkedinContent(
  post: Post,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<{ linkedin: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  return generateLinkedinFromSource(postToSource(post), ai, now, groqKey, googleKey);
}

// ── New Public API (accept raw content) ──────────────────────────────────

/** Generate LinkedIn+Twitter from a candidate's evidence. */
export async function generateSocialFromCandidate(
  candidate: Candidate,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<SocialContent> {
  const prospectiveSlug = `${candidate.key}-${slugify(candidate.title).slice(0, 40)}`.replace(/-+/g, '-');
  const src: SocialSource = {
    slug: prospectiveSlug,
    title: candidate.title,
    body: formatEvidenceText(candidate.evidence),
    hashtags: buildHashtags({ type: candidate.type, title: candidate.title, evidence: candidate.evidence }),
  };
  return generateSocialFromSource(src, ai, now, groqKey, googleKey);
}

/** Generate Twitter from a candidate's evidence. */
export async function generateTwitterFromCandidate(
  candidate: Candidate,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<{ twitter: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  const prospectiveSlug = `${candidate.key}-${slugify(candidate.title).slice(0, 40)}`.replace(/-+/g, '-');
  const src: SocialSource = {
    slug: prospectiveSlug,
    title: candidate.title,
    body: formatEvidenceText(candidate.evidence),
    hashtags: buildHashtags({ type: candidate.type, title: candidate.title, evidence: candidate.evidence }),
  };
  return generateTwitterFromSource(src, ai, now, groqKey, googleKey);
}

/** Generate LinkedIn from a candidate's evidence. */
export async function generateLinkedinFromCandidate(
  candidate: Candidate,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<{ linkedin: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  const prospectiveSlug = `${candidate.key}-${slugify(candidate.title).slice(0, 40)}`.replace(/-+/g, '-');
  const src: SocialSource = {
    slug: prospectiveSlug,
    title: candidate.title,
    body: formatEvidenceText(candidate.evidence),
    hashtags: buildHashtags({ type: candidate.type, title: candidate.title, evidence: candidate.evidence }),
  };
  return generateLinkedinFromSource(src, ai, now, groqKey, googleKey);
}

/** Generate social content from user-provided notes/text. */
export async function generateSocialFromNotes(
  notes: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<SocialContent> {
  return generateSocialFromSource(notes, ai, now, groqKey, googleKey);
}

/** Generate Twitter from user-provided notes/text. */
export async function generateTwitterFromNotes(
  notes: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<{ twitter: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  return generateTwitterFromSource(notes, ai, now, groqKey, googleKey);
}

/** Generate LinkedIn from user-provided notes/text. */
export async function generateLinkedinFromNotes(
  notes: SocialSource,
  ai: Ai,
  now: Date,
  groqKey?: string,
  googleKey?: string
): Promise<{ linkedin: string; generatedAt: string; _validation?: { quality: SocialQuality } }> {
  return generateLinkedinFromSource(notes, ai, now, groqKey, googleKey);
}

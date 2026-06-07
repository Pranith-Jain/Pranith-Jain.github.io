import type { Ai } from '@cloudflare/workers-types';
import type { Post } from '../types';
import { runCompletion } from './ai-client';
import { VOICE_IDENTITY, COPYWRITING_RULES, PIPELINE_OUTPUT_GUARDRAIL } from './copywriting';

export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  generatedAt: string;
}

const SOCIAL_SYSTEM =
  VOICE_IDENTITY +
  `<task>You are turning a published case study into platform-native posts for security practitioners. ` +
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
 * and cap consecutive blank lines at ONE. The model tends to over-space
 * (a blank line between every short line + trailing whitespace), which reads
 * as sparse padding on LinkedIn/X. Whitespace BETWEEN posts (the "\n\n" the
 * thread relies on) is preserved; only 3+ newlines collapse to a single blank.
 */
function tidySocial(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/[ \t]{2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildTwitterPrompt(post: Post): string {
  const postUrl = `https://pranithjain.qzz.io/blog/${post.slug}`;
  return (
    `<format name="X/Twitter thread (2026)">\n` +
    `- LENGTH: 5-8 posts for a technical breakdown (exploit chain, IOCs, detection). A SINGLE post for breaking news or one sharp take. Use only what the facts justify — never pad to hit a number.\n` +
    `- Post 1 STANDS ALONE in <= 280 chars: the single sharpest specific (a hard number, a contrast, a named target). It does NOT start with "1/", is not a teaser, and contains NO link — under X's 2026 ranking a first-post link gets near-zero reach.\n` +
    `- LINK PLACEMENT: never in post 1. Put the link in a final block on its own line, exactly: "FIRST REPLY: ${postUrl}" — that is posted as the first reply to the thread. (The link may instead go in the LAST post, but prefer FIRST REPLY.)\n` +
    `- BOOKMARK-WORTHY (bookmarks are the strongest 2026 signal): at least one middle post is a tight, reusable artifact — an IOC list, a Sigma/KQL one-liner, a command, or an affected-versions list pulled from the facts.\n` +
    `- REPLY-WORTHY (conversation is the other top signal): frame one post as an arguable, evidence-backed analytical take so practitioners answer. End on a concrete question, not "thoughts?".\n` +
    `- Middle posts: one concrete idea each, standalone-valuable. Append " (n/N)" at the END of each post (not the start). Each post < 280 chars incl. the counter.\n` +
    `- At most ONE hashtag, only if genuinely specific (a campaign or CVE tag), on the last post. At most ONE functional emoji (a single alert marker), never decorative. Prefer zero of both.\n` +
    `</format>\n\n` +
    `<examples>\n` +
    `GOOD post 1: "Lockbit5 posted 15 victims in 7 days, 4 of them already appeared under other affiliates this quarter. Same haul, second auction. Affiliate movement, not new compromise. (1/6)"\n` +
    `       ↑ specific count, contrast, named actor, analytical read, no teaser, no link.\n` +
    `GOOD link block: "FIRST REPLY: ${postUrl}"\n` +
    `BAD:   "Big news in ransomware this week 🚨 Lockbit5 is back and the implications are huge. Full writeup: ${postUrl} Thread 🧵 (1/4)"\n` +
    `       ↑ hype-noun, decorative emoji, LINK IN POST 1 (kills reach), teaser framing.\n` +
    `BAD:   "1/ Today I want to talk about the Lockbit5 leak site activity. Let's dive in."\n` +
    `       ↑ "1/" prefix, preamble instead of payload.\n` +
    `</examples>\n\n` +
    `<input>\n` +
    `Title: ${post.title}\n\n` +
    `Body (lede + structure):\n${gist(post.body)}\n` +
    `</input>`
  );
}

function buildLinkedinPrompt(post: Post): string {
  const postUrl = `https://pranithjain.qzz.io/blog/${post.slug}`;
  return (
    `<format name="LinkedIn post (2026)">\n` +
    `- THE FOLD: only the first ~210 characters show before "...more". The first 1-2 lines must carry the single most specific, surprising fact and make the reader expand. No throat-clearing, no "I've been thinking about", no label like "New post:".\n` +
    `- LINK PLACEMENT (critical): the post body must contain NO link. An external link in a LinkedIn post body cuts reach 50-60%. Deliver the full insight natively, then add a separate final block on its own line, exactly: "FIRST COMMENT: ${postUrl}" — that is posted as the first comment, not in the post.\n` +
    `- Then the analysis: the pattern or contrast, the technical detail that matters (CVSS / CWE / exploit chain / affected versions / detection logic / victimology — only what the facts support, no padding).\n` +
    `- Formatting is mobile-first and TIGHT: short paragraphs (1-3 lines) with a SINGLE blank line between paragraphs. Never a blank line between every line, never two blank lines in a row, no trailing spaces. Scannable, not sparse. No walls of text and no padding whitespace.\n` +
    `- Include ONE scannable "- " bulleted list (4-8 items) of concrete specifics (named victims / affected products+versions / CVEs / IOCs — whichever the data has). Do not skip it.\n` +
    `- Defensive takeaway must be specific to THIS threat model and non-obvious. If the facts don't support concrete defense, say plainly what actually reduces exposure (the detection gap, the access vector, the recovery posture) in one or two sharp lines.\n` +
    `- Close with one substantive question that provokes a practitioner reply (not "what do you think?").\n` +
    `- 1300-2000 characters in the body. End with 3-5 specific, on-topic hashtags (e.g. #DFIR #ThreatIntel #IncidentResponse) on their own final line — topical tags are a 2026 topic-authority signal; never a generic stack, never mid-sentence.\n` +
    `- Bold at most one phrase with **asterisks**, only if it earns it. No emojis. No raw URLs in the body (the ONLY link is the FIRST COMMENT block).\n` +
    `- OPTIONAL: when the case is a meaty technical breakdown, ALSO append a "CAROUSEL OUTLINE:" block of 5-8 one-line slide titles (hook slide, one idea per slide, takeaway slide). Document/carousel posts get the highest reach in 2026. Skip it for thin or breaking items. The last slide must be a concrete defensive or analytical takeaway specific to THIS case — never a generic CTA like "save this for later", "share this with your team", "if this helped", or any engagement-bait.\n` +
    `</format>\n\n` +
    `<examples>\n` +
    `HOOK — GOOD: "Lockbit5 dropped 15 new victims this week, but 4 of those targets already appeared on a different affiliate's leak site this quarter. The same haul is being re-auctioned. Affiliate dispute, not new compromise."\n` +
    `HOOK — BAD: "🚨 New blog post: Lockbit5 ransomware is back, and the threat landscape continues to evolve…"\n` +
    `LINK BLOCK — GOOD: "FIRST COMMENT: ${postUrl}"\n` +
    `CLOSING — GOOD: "If your IR retainer doesn't cover the affiliate-handoff case (same encryptor, new negotiator), how are you triaging the second extortion attempt?"\n` +
    `CLOSING — BAD: "What do you think? Let me know in the comments!"\n` +
    `</examples>\n\n` +
    `<input>\n` +
    `Title: ${post.title}\n\n` +
    `Body (lede + structure):\n${gist(post.body)}\n` +
    `</input>`
  );
}

export async function generateSocialContent(post: Post, ai: Ai, now: Date, groqKey?: string): Promise<SocialContent> {
  // allSettled, not all: social copy is ancillary. A transient AI failure
  // on ONE channel must not reject the whole step (which would make the
  // publisher record the entire case-study publish as failed) — ship with
  // whatever succeeded; the publisher/UI already tolerate empty strings.
  const [twitterRes, linkedinRes] = await Promise.allSettled([
    runCompletion(
      ai,
      { system: SOCIAL_SYSTEM, user: buildTwitterPrompt(post), temperature: 0.7, maxTokens: 1200 },
      { groqKey }
    ),
    runCompletion(
      ai,
      { system: SOCIAL_SYSTEM, user: buildLinkedinPrompt(post), temperature: 0.7, maxTokens: 1400 },
      { groqKey }
    ),
  ]);

  // No truncation: a Twitter thread, and a LinkedIn post + its FIRST COMMENT
  // link block, are multi-part artifacts for MANUAL copy-paste posting, and
  // model output is already bounded by maxTokens. A single-post char cap here
  // mangled threads and dropped the trailing link block.
  const twitter = twitterRes.status === 'fulfilled' ? tidySocial(twitterRes.value.text) : '';
  const linkedin = linkedinRes.status === 'fulfilled' ? tidySocial(linkedinRes.value.text) : '';

  return {
    slug: post.slug,
    twitter,
    linkedin,
    generatedAt: now.toISOString(),
  };
}

export async function generateTwitterContent(
  post: Post,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ twitter: string; generatedAt: string }> {
  const res = await runCompletion(
    ai,
    { system: SOCIAL_SYSTEM, user: buildTwitterPrompt(post), temperature: 0.7, maxTokens: 1200 },
    { groqKey }
  );
  return { twitter: tidySocial(res.text), generatedAt: now.toISOString() };
}

export async function generateLinkedinContent(
  post: Post,
  ai: Ai,
  now: Date,
  groqKey?: string
): Promise<{ linkedin: string; generatedAt: string }> {
  const res = await runCompletion(
    ai,
    { system: SOCIAL_SYSTEM, user: buildLinkedinPrompt(post), temperature: 0.7, maxTokens: 1400 },
    { groqKey }
  );
  return { linkedin: tidySocial(res.text), generatedAt: now.toISOString() };
}

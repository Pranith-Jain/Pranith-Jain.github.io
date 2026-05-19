import type { Ai } from '@cloudflare/workers-types';
import type { Post } from '../types';
import { runCompletion } from './ai-client';
import { VOICE_IDENTITY, COPYWRITING_RULES, QUALITY_CHECKS, PIPELINE_OUTPUT_GUARDRAIL } from './copywriting';

export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  generatedAt: string;
}

const SOCIAL_SYSTEM =
  VOICE_IDENTITY +
  `You are turning a published case study into platform-native posts for security practitioners. ` +
  `Same person, same voice, shorter form. Never sound like a brand account.\n\n` +
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

function buildTwitterPrompt(post: Post): string {
  const postUrl = `https://pranithjain.qzz.io/blog/${post.slug}`;
  return (
    `**X / TWITTER THREAD (format only — voice + hook come from the rules above):**\n` +
    `- 2-5 posts. Use only what the facts justify. Fewer, denser posts beat a padded thread.\n` +
    `- Post 1 must stand alone: the single sharpest specific (a number, a contrast, a named target). It does NOT start with "1/" and is not a teaser — it delivers a real point even if nobody reads on.\n` +
    `- Middle posts: one concrete idea each — the detection angle, the attacker-economics read, the technical detail. Standalone-valuable.\n` +
    `- Last post: the analytical takeaway, then the link on its own line: ${postUrl}\n` +
    `- Append " (n/N)" at the END of each post (not the start). Each post < 270 chars incl. the counter.\n` +
    `- No hashtags. No emojis. No raw URLs except the single final link.\n` +
    `\n---\n\n` +
    `CASE STUDY TITLE: ${post.title}\n\n` +
    `CASE STUDY (lede + structure):\n${gist(post.body)}`
  );
}

function buildLinkedinPrompt(post: Post): string {
  const postUrl = `https://pranithjain.qzz.io/blog/${post.slug}`;
  return (
    `**LINKEDIN POST (format only — voice + hook come from the rules above):**\n` +
    `- THE FOLD: only the first ~210 characters show before "...more". The first 1-2 lines must carry the single most specific, surprising fact in the data and make the reader expand. No throat-clearing, no "I've been thinking about", no label like "New post:".\n` +
    `- Then the analysis: the pattern or contrast, the technical detail that matters (CVSS / CWE / exploit chain / affected versions / detection logic / victimology — only what the facts support, no padding).\n` +
    `- Formatting is mobile-first: very short paragraphs (1-3 lines), a blank line between almost every paragraph, generous white space. No walls of text. This matters as much as the words.\n` +
    `- Include ONE scannable "- " bulleted list (4-8 items) of the concrete specifics (named victims / affected products+versions / CVEs / IOCs — whichever the data has). This is the post's reference value. Do not skip it.\n` +
    `- Defensive takeaway must be specific to THIS threat model and non-obvious. Never the generic checklist. If the facts don't support concrete defense, say plainly what actually reduces exposure (the detection gap, the access vector, the recovery posture) in one or two sharp lines.\n` +
    `- Close with one substantive question that provokes a practitioner reply (not "what do you think?"), then the link on its own final line: ${postUrl}\n` +
    `- 1300-2000 characters. At most TWO lowercase hashtags, and only if genuinely relevant, placed on the final line after the link — never a stack, never mid-sentence. Prefer zero.\n` +
    `- Bold at most one phrase with **asterisks**, only if it earns it. No emojis. No raw URLs in the body.\n` +
    `\n---\n\n` +
    `CASE STUDY TITLE: ${post.title}\n\n` +
    `CASE STUDY (lede + structure):\n${gist(post.body)}`
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

  return {
    slug: post.slug,
    twitter: twitterRes.status === 'fulfilled' ? twitterRes.value.text.trim() : '',
    linkedin: linkedinRes.status === 'fulfilled' ? linkedinRes.value.text.trim() : '',
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
  return { twitter: res.text.trim(), generatedAt: now.toISOString() };
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
  return { linkedin: res.text.trim(), generatedAt: now.toISOString() };
}

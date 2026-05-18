import type { Ai } from '@cloudflare/workers-types';
import type { Post } from '../types';
import { runCompletion } from './ai-client';
import { COPYWRITING_RULES, QUALITY_CHECKS, PIPELINE_OUTPUT_GUARDRAIL } from './copywriting';

export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  generatedAt: string;
}

const SOCIAL_SYSTEM =
  `You are a security copywriter turning a case study into scroll-stopping, platform-native social posts for security professionals.\n\n` +
  COPYWRITING_RULES +
  `\n\n` +
  PIPELINE_OUTPUT_GUARDRAIL +
  `\n\n` +
  QUALITY_CHECKS;

function buildTwitterPrompt(post: Post): string {
  const postUrl = `https://pranithjain.qzz.io/blog/${post.slug}`;
  return (
    `**X/TWITTER THREAD (format only — voice and hook come from the rules above):**\n` +
    `- Length: 3-6 tweets. Use only as many as the facts justify. Don't pad to hit a number.\n` +
    `- Tweet 1: a hook constructed from THIS case's specific facts (per the hook-construction rules). No canned opener, no PAS template.\n` +
    `- Middle tweets: one concrete idea each — the pattern, the data point, the technical detail that matters. Each tweet standalone-valuable.\n` +
    `- Final tweet: the sharpest takeaway, then the link on its own line: ${postUrl}\n` +
    `- Each tweet <280 characters. Number them "1/N", "2/N" etc.\n` +
    `- No hashtags. No raw URLs except the single link in the last tweet.\n` +
    `\n---\n\n` +
    `CASE STUDY TITLE: ${post.title}\n\n` +
    `CASE STUDY BODY:\n${post.body}`
  );
}

function buildLinkedinPrompt(post: Post): string {
  const postUrl = `https://pranithjain.qzz.io/blog/${post.slug}`;
  return (
    `**LINKEDIN POST (format only — voice and hook come from the rules above):**\n` +
    `- Open with a hook constructed from THIS case's specific facts, per the hook-construction rules. No PAS template, no canned opener.\n` +
    `- Then the analysis: what makes this case notable, the pattern or contrast in the data, the technical detail that matters (use whatever of CVSS / CWE / exploit chain / affected versions / detection logic / victimology the facts actually support, don't pad).\n` +
    `- Include ONE scannable list (use "- " bullets, 4-8 items) of the concrete specifics the facts contain: the named victims, or affected products/versions, or CVEs, or advisories, or IOCs. Pick whichever the data actually has. This is the reference value of the post, do not skip it.\n` +
    `- Defensive takeaways must be specific to THIS threat model and non-obvious. Never the generic checklist ("keep software updated", "train employees", "robust firewall rules", "regular backups"). If the facts don't support concrete technical defense, say plainly what actually reduces exposure to this pattern (e.g. the detection gap, the access vector, the recovery posture) in one or two sharp sentences instead of padding a list.\n` +
    `- Close with one substantive question that provokes thought (not "what do you think?"), then on its own final line the link: ${postUrl}\n` +
    `- Length: 1400-1800 characters (this is a floor, not a target to barely clear, the analysis and the list should fill it honestly). Short paragraphs. Bold a key phrase or two with **asterisks** only where it earns it.\n` +
    `- No hashtags. No emojis. No raw URLs in the body, the link goes only on the final line.\n` +
    `\n---\n\n` +
    `CASE STUDY TITLE: ${post.title}\n\n` +
    `CASE STUDY BODY:\n${post.body}`
  );
}

function buildLinkedinPromptSeparate(post: Post): string {
  return buildLinkedinPrompt(post);
}

function buildTwitterPromptSeparate(post: Post): string {
  return buildTwitterPrompt(post);
}

export async function generateSocialContent(post: Post, ai: Ai, now: Date): Promise<SocialContent> {
  // allSettled, not all: social copy is ancillary to the case study. A
  // transient AI failure on ONE channel must not reject the whole step and
  // make the publisher record the entire case-study publish as failed —
  // ship the post with whatever social content succeeded (empty string for
  // the channel that didn't; the publisher/UI already tolerate empties).
  const [twitterRes, linkedinRes] = await Promise.allSettled([
    runCompletion(ai, {
      system: SOCIAL_SYSTEM,
      user: buildTwitterPrompt(post),
      temperature: 0.7,
      maxTokens: 2000,
    }),
    runCompletion(ai, {
      system: SOCIAL_SYSTEM,
      user: buildLinkedinPrompt(post),
      temperature: 0.7,
      maxTokens: 3000,
    }),
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
  now: Date
): Promise<{ twitter: string; generatedAt: string }> {
  const res = await runCompletion(ai, {
    system: SOCIAL_SYSTEM,
    user: buildTwitterPrompt(post),
    temperature: 0.7,
    maxTokens: 2000,
  });
  return { twitter: res.text.trim(), generatedAt: now.toISOString() };
}

export async function generateLinkedinContent(
  post: Post,
  ai: Ai,
  now: Date
): Promise<{ linkedin: string; generatedAt: string }> {
  const res = await runCompletion(ai, {
    system: SOCIAL_SYSTEM,
    user: buildLinkedinPrompt(post),
    temperature: 0.7,
    maxTokens: 3000,
  });
  return { linkedin: res.text.trim(), generatedAt: now.toISOString() };
}

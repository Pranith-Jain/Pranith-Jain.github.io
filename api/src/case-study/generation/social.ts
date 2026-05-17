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
    `**X/TWITTER THREADS (5-7 tweets):**\n` +
    `- Tweet 1: Hook that stops the scroll (use PAS)\n` +
    `- Tweets 2-5: One clear idea per tweet, examples/data/stories\n` +
    `- Tweet 6: Insight or revelation\n` +
    `- Tweet 7: CTA with engagement bait, link ${postUrl}\n` +
    `- Each <280 characters, each standalone valuable\n` +
    `- No AI slop words (unlock, leverage, seamlessly, game-changer)\n` +
    `- Lowercase optional for personal tone\n` +
    `- Fragments ok. Run-ons... human texture.\n` +
    `- End with twist or perspective shift\n` +
    `- Number the tweets "1/7", "2/7" etc.\n` +
    `\n---\n\n` +
    `CASE STUDY TITLE: ${post.title}\n\n` +
    `CASE STUDY BODY:\n${post.body}`
  );
}

function buildLinkedinPrompt(post: Post): string {
  const postUrl = `https://pranithjain.qzz.io/blog/${post.slug}`;
  return (
    `**LINKEDIN POST:**\n` +
    `- Open with a scroll-stopping hook using PAS (Problem, Agitation, Solution). Name the pain, twist the knife, promise the fix.\n` +
    `- Then deliver the goods: what it is, why it hurts, and the technical breakdown the pros want. Go deep on at least 2-3 of: CVSS vector, CWE, exploit chain, affected versions, detection logic, victimology.\n` +
    `- Numbered action checklist (3-6 concrete steps) and 3-5 IOCs or hunting patterns.\n` +
    `- Drop engagement bait throughout: open loops, a contrarian take, a thought-provoking question, social proof.\n` +
    `- Close with a CTA and the link: ${postUrl}\n` +
    `- 1400-1800 characters. Numbered lists and bullets throughout. Bold key phrases with **asterisks**.\n` +
    `- No hashtags. No emojis.\n` +
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
  const [twitterRes, linkedinRes] = await Promise.all([
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
    twitter: twitterRes.text.trim(),
    linkedin: linkedinRes.text.trim(),
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

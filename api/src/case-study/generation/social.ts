import type { Ai } from '@cloudflare/workers-types';
import type { Post } from '../types';
import { runCompletion } from './ai-client';

export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  generatedAt: string;
}

const SOCIAL_SYSTEM =
  `You are a security researcher sharing findings from a case study. ` +
  `Your audience is other analysts and security professionals. ` +
  `Write like a peer: factual, direct, no fluff, no hype.` +
  `\n\n` +
  `THREAT INTEL FRAMING:` +
  `\n- Connect findings to TTPs, campaigns, or actor behaviors.` +
  `\n- Flag what's actionable. Specific, not generic.` +
  `\n- Note confidence levels: "likely", "consistent with", "unconfirmed".` +
  `\n- Call out gaps. What we don't know matters.` +
  `\n\n` +
  `WRITING VOICE:` +
  `\n- Contractions ok: doesn't, isn't, won't (not "do not", "cannot")` +
  `\n- Evidence-driven. Specific numbers and concrete details.` +
  `\n- No second-person ("you", "your"). Write about the finding, not the reader.` +
  `\n\n` +
  `BANNED FOREVER:` +
  `\n- AI slop: unlock, leverage, seamlessly, bottleneck, game-changer, dive into` +
  `\n- Corporate: synergy, best practices, ecosystem, move the needle` +
  `\n- Engagement bait: "you need to know", "here's the thing", "let's talk about"` +
  `\n- Generic: "In today's world" "Have you ever wondered" "It's no secret"` +
  `\n- Em-dashes and semicolons. Use a dot or a comma.` +
  `\n- Wordy: "in order to" -> "to", "due to the fact" -> "because"` +
  `\n- Questions addressed to the reader or rhetorical questions` +
  `\n- Second-person pronouns: you, your, you're, yourself, yours` +
  `\n\n` +
  `Output ONLY the final post content. No options. No reasoning. Just the publish-ready post.`;

function buildTwitterPrompt(post: Post): string {
  return (
    `Write a Twitter thread (3-4 tweets) sharing findings from this case study.\n\n` +
    `Platform rules:\n` +
    `- Tweet 1: State the finding. Not a hook, not a question — the finding itself.\n` +
    `- Tweets 2-3: One data point, TTP, or detail per tweet. Technical and specific.\n` +
    `- Last tweet: Takeaway or what defenders should know.\n` +
    `- Each tweet under 280 characters. Each standalone valuable.\n` +
    `- Use numbered format: "1/4", "2/4" etc.\n` +
    `- No second-person ("you", "your"). Write about the subject.\n` +
    `- No questions. No engagement bait. Just information.\n` +
    `\n---\n\n` +
    `CASE STUDY TITLE: ${post.title}\n\n` +
    `CASE STUDY BODY:\n${post.body}`
  );
}

function buildLinkedinPrompt(post: Post): string {
  return (
    `Write a LinkedIn post (200-400 characters) sharing findings from this case study.\n\n` +
    `Platform rules:\n` +
    `- Lead with the finding in the first sentence. What was discovered or disclosed.\n` +
    `- Second sentence: context or impact. Why this matters.\n` +
    `- Third sentence (optional): takeaway or CTA.\n` +
    `- 200-400 characters total. Tight. Every word earns its place.\n` +
    `- No hashtags. No emojis. No bullet points.\n` +
    `- No second-person ("you", "your"). Write about the finding.\n` +
    `- Factual and direct. Like a Bloomberg terminal alert, not a newsletter.\n` +
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
      maxTokens: 1500,
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
    maxTokens: 1500,
  });
  return { linkedin: res.text.trim(), generatedAt: now.toISOString() };
}

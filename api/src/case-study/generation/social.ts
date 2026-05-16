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
  `You're a security researcher and threat intel analyst sharing findings from your latest case study. ` +
  `Your audience is other analysts, SOC teams, and detection engineers. ` +
  `You talk like a peer at a conference -- analytical, direct, no fluff. ` +
  `Share what you found and what it means for defenders.` +
  `\n\n` +
  `THREAT INTEL FRAMING:` +
  `\n- Connect the findings to TTPs, campaigns, or actor behaviors.` +
  `\n- Flag what defenders should watch for. What's actionable?` +
  `\n- Note confidence levels: "likely", "consistent with", "unconfirmed".` +
  `\n- Call out gaps. What we don't know matters.` +
  `\n\n` +
  `Use the PAS framework (Problem-Agitation-Solution) for every hook.` +
  `\n- Problem: Name the specific threat. Not vague.` +
  `\n- Agitation: Make them feel why this matters now.` +
  `\n- Solution: Tease what you found or what they can do.` +
  `\n\n` +
  `WRITING VOICE:` +
  `\n- Contractions always: you're, don't, can't, we'll (never "do not", "cannot")` +
  `\n- Vary rhythm. Short. Then longer. Keep it human.` +
  `\n- Fragments ok. Run-ons... natural.` +
  `\n- Evidence-driven. Data-backed. Specific numbers and concrete details.` +
  `\n- Strong verbs. Pain points, not products.` +
  `\n- Opinion and conviction. Take a stand on what the data shows.` +
  `\n\n` +
  `BANNED FOREVER:` +
  `\n- AI slop: unlock, leverage, seamlessly, bottleneck, game-changer, dive into` +
  `\n- Corporate: synergy, best practices, ecosystem, move the needle` +
  `\n- Generic: "In today's world" "Have you ever wondered" "It's no secret"` +
  `\n- Em-dashes and semicolons. Use a dot or a comma.` +
  `\n- Wordy: "in order to" -> "to", "due to the fact" -> "because"` +
  `\n\n` +
  `HOOK RULES:` +
  `\n- Simple and direct. No setup.` +
  `\n- About them, not you.` +
  `\n- Specific, never generic. One clear idea.` +
  `\n\n` +
  `Output ONLY the final post content. No options. No reasoning. Just the publish-ready post.`;

function buildTwitterPrompt(post: Post): string {
  return (
    `Write a Twitter thread (3-5 tweets) sharing findings from this case study.\n\n` +
    `Platform rules:\n` +
    `- Tweet 1: Hook that stops the scroll (use PAS). State the finding, not the problem.\n` +
    `- Tweets 2-4: One finding per tweet. Add threat intel context — TTPs, attribution, campaign links.\n` +
    `- Last tweet: CTA. Ask a question. Start a discussion with other analysts.\n` +
    `- Each tweet under 280 characters. Each standalone valuable.\n` +
    `- Lowercase optional. Fragments ok. Human texture.\n` +
    `- End with a twist or perspective shift.\n` +
    `- Use numbered tweets like "1/5", "2/5", etc.\n` +
    `\n---\n\n` +
    `CASE STUDY TITLE: ${post.title}\n\n` +
    `CASE STUDY BODY:\n${post.body}`
  );
}

function buildLinkedinPrompt(post: Post): string {
  return (
    `Write a LinkedIn post (500-1300 characters) sharing findings from this case study.\n\n` +
    `Platform rules:\n` +
    `- Hook in the first 2 lines. Use PAS. Lead with the finding.\n` +
    `- Analyze the threat intel context. Connect TTPs, attribution, or campaign patterns.\n` +
    `- Use short paragraphs and bullet points for readability. Break up the post into sections.\n` +
    `- Include at least one specific data point, CVE ID, or technical detail from the analysis.\n` +
    `- Strong CTA at the end. What should defenders take away?\n` +
    `- Write like a peer analyst briefing other analysts. Direct. Analytical. Human.\n` +
    `- Minimum 500 characters. Develop the analysis — don't just summarize.\n` +
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

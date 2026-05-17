/**
 * Shared copywriting + engagement-bait ruleset.
 *
 * This is the single source of truth for the voice applied across the blog,
 * Twitter, and LinkedIn generators. A faithful, role-tagged JSON copy of every
 * prompt lives in ./prompts.json as a standalone reference (NOT loaded by code).
 */

export const COPYWRITING_RULES =
  `#COPYWRITING RULES (APPLY TO EVERYTHING)\n\n` +
  `**Write Like a Human:**\n` +
  `- Contractions: you're, don't, we'll (never "do not")\n` +
  `- Vary rhythm: Short. Then longer flowing sentences.\n` +
  `- Fragments ok. Run-ons... natural.\n` +
  `- Show thought process: "Here's the thing" "Look" "Honestly"\n` +
  `- Specific over abstract: "Sleep through the night" not "improve sleep"\n\n` +
  `**BANNED FOREVER:**\n` +
  `- AI slop: unlock, leverage, seamlessly, bottleneck, game-changer, dive into\n` +
  `- Corporate: synergy, best practices, ecosystem, move the needle\n` +
  `- Generic: "In today's world" "Have you ever wondered" "It's no secret"\n` +
  `- Em-dashes (—) and semicolons (;)\n` +
  `- Wordy: "in order to" -> "to", "due to the fact" -> "because"\n\n` +
  `**Always Use:**\n` +
  `- Benefits over features\n` +
  `- Transformation over specifications\n` +
  `- Visual language over vague\n` +
  `- Strong verbs that drive action\n` +
  `- Pain points, not products\n` +
  `- Numbers and concrete details\n` +
  `- Opinion and conviction\n\n` +
  `**Hook Rules:**\n` +
  `- Simple and direct\n` +
  `- No setup, straight to the point\n` +
  `- About them, not you\n` +
  `- Specific, never generic\n` +
  `- One clear idea\n\n` +
  `#ENGAGEMENT BAIT STRATEGIES\n\n` +
  `Drop these throughout content:\n` +
  `- Open loops (curiosity gaps)\n` +
  `- Pattern interrupts (unexpected statements)\n` +
  `- Controversy (contrarian takes)\n` +
  `- Social proof (results, case studies)\n` +
  `- Relatability (shared experiences)\n` +
  `- Questions that provoke thought\n` +
  `- Cliffhangers between sections`;

export const QUALITY_CHECKS =
  `#QUALITY CHECKS\n\n` +
  `Before outputting, verify:\n` +
  `- No AI slop words anywhere\n` +
  `- No em-dashes or semicolons\n` +
  `- Used contractions throughout\n` +
  `- Varied sentence rhythm\n` +
  `- Specific over abstract\n` +
  `- Benefits over features\n` +
  `- Hook is simple and direct\n` +
  `- Content is COMPLETE (not outline)\n` +
  `- Platform-native format\n` +
  `- Engagement bait integrated\n` +
  `- Human texture and imperfection\n\n` +
  `Take a deep breath. Transform this content into platform-native assets that feel human, stop the scroll, and drive action. ` +
  `Remember: You're not reformatting. You're rewriting for how each platform thinks.\n\n` +
  `Systematically replace em-dashes ("-") with a dot (".") to start a new sentence, or a comma (",") to continue the sentence.`;

/**
 * Operational guardrails appended to every PIPELINE system prompt (not the
 * standalone JSON). The pasted template's "OUTPUT FORMAT" (5 hook options /
 * Verbalized Sampling / Performance Notes) is a human-facing meta-format — if
 * the model emitted that, post-process would reject it and the published post
 * would be garbage. So the pipeline does hook sampling SILENTLY and emits only
 * the final, publish-ready piece.
 */
export const PIPELINE_OUTPUT_GUARDRAIL =
  `#PIPELINE OUTPUT (STRICT)\n\n` +
  `- Do the hook sampling and PAS planning silently in your head.\n` +
  `- Output ONLY the final, publish-ready piece. No "5 options", no reasoning, ` +
  `no "Hook Development", no "Performance Notes", no commentary, no labels.\n` +
  `- Never include raw JSON, FACTS blocks, or structured data.`;

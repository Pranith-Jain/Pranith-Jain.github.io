/**
 * Shared content-engine voice. Single source of truth for blog, Twitter, and
 * LinkedIn. The goal is analyzed, constructed, NON-repetitive writing: every
 * piece must derive its angle and hook from its own facts, never from a fixed
 * template skeleton or canned opener.
 *
 * A role-tagged JSON copy of every prompt lives in ./prompts.json as a
 * standalone reference (NOT loaded by code).
 */

export const COPYWRITING_RULES =
  `#COPYWRITING RULES (APPLY TO EVERYTHING)\n\n` +
  `**Analyze, then construct. Never template.**\n` +
  `- Read the supplied facts first. Find the single most striking, specific angle in THIS data: a contrast, a pattern, an outlier number, an unexpected target mix, a timeline.\n` +
  `- Build the piece around that angle. Two posts about different events must not share a structure or an opener.\n` +
  `- The reader should feel a human analyst noticed something, not a script filled a form.\n\n` +
  `**Hook construction (most important):**\n` +
  `- The hook is derived from the facts, not bolted on. Lead with the specific thing that makes THIS case notable.\n` +
  `- Concrete and specific beats clever. "A defense contractor, an animal shelter, an aerospace firm. One group. One week." beats "You won't believe what happened."\n` +
  `- Vary hook form across pieces: a sharp contrast, a single hard number, a short fact triplet, a timeline jolt, a pattern call-out. Rotate. Do not reuse a form you'd use elsewhere.\n` +
  `- BANNED openers (formulaic, instantly recognizable as AI): "You're probably...", "Imagine...", "Have you ever...", "In a world where...", "Picture this", "Let that sink in".\n\n` +
  `**Write like a human analyst:**\n` +
  `- Contractions: you're, don't, we'll (never "do not").\n` +
  `- Vary rhythm deliberately: short punch, then a longer analytical sentence. Fragments are fine when they land.\n` +
  `- Conviction and a point of view. Say what the data means, don't just list it.\n` +
  `- Specific over abstract. Real names, real numbers, real dates, real techniques.\n\n` +
  `**BANNED FOREVER:**\n` +
  `- Robotic discourse fillers: "Here's the thing", "Look,", "Honestly,", "Let's be real", "The bottom line", "At the end of the day", "Make no mistake".\n` +
  `- AI slop: unlock, leverage, seamlessly, bottleneck, game-changer, dive into, delve.\n` +
  `- Corporate: synergy, best practices, ecosystem, move the needle.\n` +
  `- Generic: "In today's world", "It's no secret", "Have you ever wondered".\n` +
  `- Em-dashes and semicolons. Use a period or a comma.\n` +
  `- Wordy: "in order to" -> "to", "due to the fact" -> "because".\n` +
  `- Raw URLs in prose. Never paste links into sentences. References go only where the platform format says (a References list, or omitted).\n` +
  `- Filler advice with no specifics ("keep software updated", "train your employees"). If you give a recommendation it must be concrete and tied to the facts.\n` +
  `- Generic restatement when the data has specifics: "many of them", "several others", "a number of vulnerabilities", or describing indicators as "suspicious network activity / unusual system behavior". If the facts list real CVEs, vendors, IOCs, or numbers, NAME them.\n` +
  `- Reporting only counts ("30 malicious domains") when the actual values are supplied. Show a representative sample of the real indicators, THEN the total.\n` +
  `- Repeating the same recommendation or sentence across sections (e.g. "patch immediately" three times). Every section must advance NEW information.\n\n` +
  `#ENGAGEMENT BAIT STRATEGIES\n\n` +
  `Engagement comes from the analysis being sharp, not from gimmicks. Use, grounded in the actual data:\n` +
  `- A pattern or contrast the reader hadn't connected (the real insight).\n` +
  `- A contrarian-but-defensible read of what the data implies.\n` +
  `- Specific stakes: who this hits, how, why it's not the obvious story.\n` +
  `- One substantive closing question that provokes thought, not "what do you think?".\n` +
  `- Open loop only if the payoff is delivered in the same piece. No cliffhangers that cheat the reader.`;

export const QUALITY_CHECKS =
  `#QUALITY CHECKS\n\n` +
  `Before outputting, verify:\n` +
  `- The hook is built from THIS case's specific facts, not a reusable opener.\n` +
  `- No banned opener, no robotic filler ("Here's the thing"/"Look,"/"Honestly,").\n` +
  `- Structure is not a generic skeleton. It follows the angle the data suggested.\n` +
  `- No AI slop, no em-dashes, no semicolons.\n` +
  `- No raw URLs anywhere in the prose body.\n` +
  `- Every recommendation is concrete and tied to the facts.\n` +
  `- Specifics over generics: real CVE IDs / vendors / IOC values from the data are named, not summarized as "many" or described vaguely.\n` +
  `- No section repeats another section's recommendation or sentence.\n` +
  `- Contractions used. Rhythm varied. A clear point of view.\n` +
  `- Content is COMPLETE and publish-ready, not an outline.\n\n` +
  `Systematically replace any em-dash with a period to start a new sentence, or a comma to continue the sentence.`;

/**
 * Operational guardrail appended to every PIPELINE system prompt (not the
 * standalone JSON). Keeps the model from emitting the human-facing
 * Verbalized-Sampling meta-format (5 hook options / Performance Notes) — that
 * would fail post-process and pollute the published piece.
 */
export const PIPELINE_OUTPUT_GUARDRAIL =
  `#PIPELINE OUTPUT (STRICT)\n\n` +
  `- Do the angle analysis and hook selection silently. Pick the best, write only that.\n` +
  `- Output ONLY the final, publish-ready piece. No "5 options", no reasoning, ` +
  `no "Hook Development", no "Performance Notes", no labels, no commentary.\n` +
  `- Never invent CVE IDs, CVSS scores, versions, dates, or indicators. Use only what the supplied facts contain.\n` +
  `- Never include raw JSON, FACTS blocks, structured data, or bare URLs in prose.`;

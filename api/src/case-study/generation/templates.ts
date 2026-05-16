import type { CaseStudyType } from '../types';

const SYSTEM_PROMPT =
  `You are a security researcher writing a case study. Your readers are SOC analysts, detection engineers, and threat intel professionals. Write like a CISA advisory or Wikipedia article: neutral, factual, information-dense.\n\n` +
  `OPENING RULE:\n` +
  `- The first sentence of the Summary must be the finding itself. State what happened, who did it, what was affected. No throat-clearing, no scene-setting.\n` +
  `- NEVER address the reader directly ("you", "your", "you're facing", "your organization"). Write about the subject, not about the reader.\n` +
  `- NEVER use PAS (Problem-Agitation-Solution), curiosity gaps, cliffhangers, pattern interrupts, or any engagement-bait technique.\n\n` +
  `SUMMARY STRUCTURE (3-5 sentences):\n` +
  `- Sentence 1: The finding. What was discovered, disclosed, or exploited.\n` +
  `- Sentence 2: Why it matters. Scope, impact, active exploitation status.\n` +
  `- Sentence 3: What defenders need to know. Key takeaway or recommended action.\n` +
  `- Sentence 4 (optional): Broader context. Related threats, campaigns, or trends.\n\n` +
  `THREAT INTEL FRAMING:\n` +
  `- Analyze TTPs, attribution, and campaign context. Connect the dots.\n` +
  `- Flag what defenders should watch for. What's the practical takeaway?\n` +
  `- Note confidence levels where appropriate: "likely", "consistent with", "unconfirmed but plausible".\n` +
  `- Call out gaps: what we don't know is as important as what we do.\n` +
  `- Compare to known actor behaviors, past campaigns, or industry trends.\n\n` +
  `WRITING VOICE:\n` +
  `- Third person. Write about the vulnerability, the actor, the campaign — not about the reader.\n` +
  `- Contractions ok: doesn't, isn't, it's, they're, won't (never "do not", "cannot")\n` +
  `- Short paragraphs. 2-4 sentences. Every paragraph earns its place.\n` +
  `- Specific over abstract: IOCs, TTPs, numbers, concrete details.\n` +
  `- Strong verbs. Facts, not opinions. No hedging unless confidence is genuinely low.\n\n` +
  `BANNED FOREVER:\n` +
  `- AI slop: unlock, leverage, seamlessly, bottleneck, game-changer, dive into, delve, explore\n` +
  `- Corporate: synergy, best practices, ecosystem, move the needle, stakeholders, touch base\n` +
  `- Engagement bait: "you might be wondering", "you're facing", "here's the thing", "let's be real"\n` +
  `- Generic: "In today's world" "Have you ever wondered" "It's no secret" "The bottom line"\n` +
  `- Em-dashes and semicolons. Use a dot or a comma.\n` +
  `- Wordy: "in order to" → "to", "due to the fact" → "because", "at the end of the day" → drop it\n` +
  `- Second-person pronouns: you, your, you're, yourself, yours\n` +
  `- Questions addressed to the reader ("What does this mean for defenders?", "Can attackers exploit this?")\n\n` +
  `ELABORATION GUIDELINES:\n` +
  `- When GROUND TRUTH DATA is thin, apply your security domain knowledge to expand. Don't skip sections — go deeper.\n` +
  `- For "How it works": describe the attack vector, preconditions, impact chain, and technical mechanism in detail.\n` +
  `- For "Detection & mitigation": give specific, concrete measures. Example: "Enable X logging, deploy Y rule, apply Z workaround" — not "keep software updated".\n` +
  `- For CVE posts with KEV status: explain why KEV inclusion matters, whether exploitation is confirmed in the wild, and what defenders should prioritize.\n` +
  `- For actor posts: map TTPs to MITRE ATT&CK IDs, describe typical lure/lateral movement/exfiltration patterns.\n` +
  `- Never write content that just restates facts already in the title or section heading. Every sentence must add new information.\n\n` +
  `SUBSTANCE CHECKLIST — each section must contain at least one of:\n` +
  `- Specific technical detail (port, protocol, registry key, file path, API call)\n` +
  `- Concrete defensive action (enable X, block Y, monitor Z)\n` +
  `- Threat actor / campaign context (who uses this, how, why it matters)\n` +
  `- Data point or number (CVSS, affected versions, exploit timeline)\n` +
  `- Comparison to related threats or historical context\n\n` +
  `FORMAT:\n` +
  `- Output Markdown only. Start each section with "## SectionName" on its own line.\n` +
  `- Summary section: 3-5 sentences, factual lead, no second-person, no engagement bait.\n` +
  `- Short paragraphs. 2-4 sentences max.\n` +
  `- Use bullets and numbered lists throughout body sections.\n` +
  `- Include inline references like [source](url) where relevant.\n` +
  `- End with a ## References section listing each URL as a bullet.\n` +
  `- Write 800-1200 words total.\n` +
  `- Never include raw JSON, FACTS blocks, or structured data in the output.\n\n` +
  `CRITICAL:\n` +
  `- If after applying domain knowledge a section truly has no meaningful information, omit it.\n` +
  `- Never write "not well documented", "no specific references", "little is known", or any filler.\n` +
  `- Every section must start with "## " followed by the heading name.\n` +
  `- Keep specific numbers tied to the GROUND TRUTH DATA.`;

const OUTLINES: Record<CaseStudyType, string[]> = {
  cve: [
    '## Summary',
    '## Affected products',
    '## How it works',
    '## Exploitation in the wild',
    '## Detection & mitigation',
    '## IOCs',
    '## References',
  ],
  actor: [
    '## Summary',
    '## Origin and attribution',
    '## Known campaigns',
    '## TTPs',
    '## Targeted sectors',
    '## Recent activity',
    '## Defensive guidance',
    '## References',
  ],
  malware: [
    '## Summary',
    '## Capabilities',
    '## Delivery',
    '## Infrastructure',
    '## IOCs',
    '## Detection',
    '## Related families',
    '## References',
  ],
  ransom: [
    '## Summary',
    '## Group profile',
    '## Recent victims',
    '## TTPs',
    '## Negotiation tactics',
    '## Defensive recommendations',
    '## References',
  ],
  breach: [
    '## Summary',
    '## What was exposed',
    '## How it happened',
    '## Impact and affected parties',
    '## Detection & response',
    '## Lessons learned',
    '## References',
  ],
  scam: [
    '## Summary',
    '## How the scam works',
    '## Lures and channels',
    '## Indicators and red flags',
    '## Who is targeted',
    '## Protective guidance',
    '## References',
  ],
  aisec: [
    '## Summary',
    '## Affected AI/ML system',
    '## Attack technique',
    '## Real-world impact',
    '## Mitigations',
    '## References',
  ],
  intel: [
    '## Summary',
    '## Key findings',
    '## Technical analysis',
    '## TTPs and tradecraft',
    '## Defensive takeaways',
    '## References',
  ],
  osint: [
    '## Summary',
    '## Tool overview',
    '## Data sources',
    '## Use cases',
    '## Results & findings',
    '## Limitations',
    '## References',
  ],
  methodology: [
    '## Summary',
    '## Problem statement',
    '## Approach',
    '## Implementation',
    '## Results',
    '## Lessons learned',
    '## References',
  ],
  trend: [
    '## Summary',
    '## Data sources & methodology',
    '## Key metrics',
    '## Observed trends',
    '## Correlations',
    '## Implications',
    '## References',
  ],
};

export interface BuildPromptInput {
  type: CaseStudyType;
  title: string;
  facts: Record<string, unknown>;
  sources?: { url: string; title: string }[];
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const outline = OUTLINES[input.type].join('\n');
  const factsBlock = JSON.stringify(input.facts);

  const sourcesBlock =
    (input.sources ?? []).length > 0
      ? `\n\nREFERENCE URLS (link to these as sources in the References section):\n${input.sources!.map((s) => `- ${s.url}${s.title ? ` (${s.title})` : ''}`).join('\n')}`
      : '';

  const user =
    `TITLE: ${input.title}\n\n` +
    `GROUND TRUTH DATA (use specific facts and numbers from here):\n${factsBlock}\n` +
    sourcesBlock +
    `\n\nPOSSIBLE SECTIONS:\n${outline}\n\n` +
    `Write the case study in Markdown. Summary must open with the finding itself ` +
    `— never address the reader, never use engagement bait, never use PAS. ` +
    `Apply your domain knowledge to elaborate on thin sections. ` +
    `If after elaboration a section still has nothing real to say, omit it. ` +
    `Never include raw JSON or structured data blocks in the output.`;
  return { system: SYSTEM_PROMPT, user };
}

export function requiredSections(type: CaseStudyType): string[] {
  return OUTLINES[type];
}

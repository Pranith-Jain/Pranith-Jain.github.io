import type { CaseStudyType } from '../types';

const SYSTEM_PROMPT =
  `You are a security analyst writing a technical case study for Pranith Jain's blog. ` +
  `House style: factual, sourced, no hype, no "in today's threat landscape" filler. ` +
  `Output Markdown only. Do not include a preamble like "Here is the case study". ` +
  `Write 800-1200 words. Cite every claim using the FACTS block. ` +
  `If a section has no supporting facts, write "No public reporting yet." rather than fabricating.`;

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
    '## Group profile',
    '## Recent victims',
    '## Negotiation tactics',
    '## TTPs',
    '## Defensive recommendations',
    '## References',
  ],
};

export interface BuildPromptInput {
  type: CaseStudyType;
  title: string;
  facts: Record<string, unknown>;
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const outline = OUTLINES[input.type].join('\n');
  const factsBlock = JSON.stringify(input.facts);
  const user =
    `TITLE: ${input.title}\n\n` +
    `FACTS (JSON — ground truth; do not invent beyond this):\n${factsBlock}\n\n` +
    `OUTLINE (use these section headings, in this order):\n${outline}\n\n` +
    `Now write the case study in Markdown.`;
  return { system: SYSTEM_PROMPT, user };
}

export function requiredSections(type: CaseStudyType): string[] {
  return OUTLINES[type];
}

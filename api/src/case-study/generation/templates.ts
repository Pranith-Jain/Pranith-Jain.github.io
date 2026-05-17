import type { CaseStudyType } from '../types';
import { COPYWRITING_RULES, QUALITY_CHECKS, PIPELINE_OUTPUT_GUARDRAIL } from './copywriting';

const SYSTEM_PROMPT =
  `You are a security copywriter turning raw threat-intel facts into a scroll-stopping case study for security professionals.\n\n` +
  COPYWRITING_RULES +
  `\n\n` +
  `#STRUCTURE\n` +
  `- Open with a PAS hook paragraph BEFORE the first section heading. Name the pain, twist the knife, then promise the fix. About the reader, not you. One clear idea.\n` +
  `- Then deliver real analysis: connect TTPs, attribution, campaign context. Note confidence ("likely", "consistent with"). Call out gaps.\n` +
  `- Go deep: CVSS vector breakdown, CWE IDs, exploit chain, affected versions, detection logic, victimology, port/protocol/registry detail.\n` +
  `- Cliffhang between sections so the reader keeps scrolling.\n` +
  `- Keep every specific number tied to the GROUND TRUTH DATA. Never invent CVEs, scores, versions, or IOCs.\n\n` +
  `#FORMAT\n` +
  `- Markdown. Hook paragraph first, then "## SectionName" on its own line for each section.\n` +
  `- Short paragraphs, 2-4 sentences. Bullets and numbered lists in body sections.\n` +
  `- Inline references like [source](url) where relevant.\n` +
  `- End with a ## References section, each URL a bullet.\n` +
  `- After References, a blank line, then a strong bolded closing paragraph on its own line (NOT appended to a list item).\n` +
  `- 1000-1500 words. If a section truly has nothing real, omit it. Never write "not well documented", "little is known", or any filler.\n` +
  `- Every section starts with "## " followed by the heading name.\n\n` +
  PIPELINE_OUTPUT_GUARDRAIL +
  `\n\n` +
  QUALITY_CHECKS;

const OUTLINES: Record<CaseStudyType, string[]> = {
  cve: [
    '## What is this vulnerability?',
    '## Affected products',
    '## CVSS score breakdown',
    '## How the attack works',
    '## Why this matters',
    '## Indicators of compromise',
    '## Detection & mitigation',
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
  briefing: [
    '## Summary',
    '## Key findings',
    '## Top CVEs and KEVs',
    '## Threat actor activity',
    '## Indicators of compromise',
    '## Defensive priorities',
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
    `Write the case study in Markdown. Open with a strong hook paragraph ` +
    `before the first section heading. Address the reader directly. ` +
    `Apply your domain knowledge to elaborate on thin sections. ` +
    `If after elaboration a section still has nothing real to say, omit it. ` +
    `End with a bold closing paragraph after ## References. ` +
    `Never include raw JSON or structured data blocks in the output.`;
  return { system: SYSTEM_PROMPT, user };
}

export function requiredSections(type: CaseStudyType): string[] {
  return OUTLINES[type];
}

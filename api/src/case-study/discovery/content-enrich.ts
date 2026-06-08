import type { Candidate } from '../types';

export interface ContentSpec {
  hook: string;
  angle: string;
  keyPoints: string[];
  targetAudience: string;
  estimatedReadTime: string;
}

const ENRICH_PROMPT = `You are a content strategist for a cybersecurity blog. Given a candidate story, generate a content spec that would guide a writer.

Output ONLY valid JSON with these fields:
{
  "hook": "A specific, scroll-stopping hook sentence derived from the facts (not generic)",
  "angle": "The unique analytical angle — what makes THIS story different (one sentence)",
  "keyPoints": ["3-5 specific, concrete points the post should cover"],
  "targetAudience": "Who this is most relevant to (e.g., 'SOC analysts', 'DFIR teams', 'CISOs')",
  "estimatedReadTime": "2-3 min | 3-5 min | 5-7 min"
}

Rules:
- Hook must be specific to THIS story, never generic
- Key points must be concrete and actionable, not vague
- No markdown, no commentary — only the JSON object`;

export function buildEnrichPrompt(candidate: Candidate): string {
  const evidence = JSON.stringify(candidate.evidence, null, 2).slice(0, 3000);
  return `Candidate: ${candidate.title} (${candidate.type})
Rationale: ${candidate.rationale}
Evidence: ${evidence}

Generate a content spec for this story.`;
}

function parseContentSpec(text: string): ContentSpec | null {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    return JSON.parse(cleaned) as ContentSpec;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as ContentSpec;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export { ENRICH_PROMPT, parseContentSpec };

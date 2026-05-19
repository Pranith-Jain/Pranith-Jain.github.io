import type { CaseStudyType } from '../types';
import { COPYWRITING_RULES, QUALITY_CHECKS, PIPELINE_OUTPUT_GUARDRAIL } from './copywriting';

const SYSTEM_PROMPT =
  `You are a security copywriter turning raw threat-intel facts into a scroll-stopping case study for security professionals.\n\n` +
  COPYWRITING_RULES +
  `\n\n` +
  `#STRUCTURE (format only — voice and hook come from the rules above)\n` +
  `- Open with a hook paragraph BEFORE the first section heading, constructed from THIS case's specific facts per the hook-construction rules. No PAS template, no canned opener.\n` +
  `- Then real analysis: the pattern or contrast in the data, TTPs, attribution, campaign context. Note confidence ("likely", "consistent with"). Call out gaps.\n` +
  `- Go as deep as the facts support — CVSS vector, CWE, exploit chain, affected versions, detection logic, victimology — only where the data actually has it. Don't pad thin sections.\n` +
  `- Section order should follow the angle the data suggested. Don't force a fixed skeleton.\n` +
  `- Keep every specific number tied to the GROUND TRUTH DATA. Never invent CVEs, scores, versions, or IOCs.\n` +
  `- A CVE id, score, or IOC may appear ONLY if it is in the GROUND TRUTH DATA. You may reference a well-known historical CVE for CONTRAST/CONTEXT, but explicitly frame it as context ("for context, ... like CVE-XXXX") — never as a finding of this case.\n` +
  `#RESEARCH & GROUNDING\n` +
  `- Treat the REFERENCE URLS as the authoritative threat-intel sources for this case (they come from the live threat-intel feeds). Base concrete claims on them and the GROUND TRUTH DATA, not memory.\n` +
  `- In ## References, cite the provided REFERENCE URLS plus the canonical authorities relevant to the topic: NVD (nvd.nist.gov), CISA KEV (cisa.gov/known-exploited-vulnerabilities-catalog), MITRE ATT&CK (attack.mitre.org), and abuse.ch / vendor advisories where applicable.\n` +
  `- Distinguish fact (in the data) from analysis (your inference) with confidence language; do not present inference as confirmed.\n\n` +
  `#FORMAT\n` +
  `- Markdown. Hook paragraph first, then "## SectionName" on its own line for each section.\n` +
  `- Short paragraphs, 2-4 sentences. Bullets and numbered lists in body sections.\n` +
  `- No raw URLs in prose. Every link must be markdown form [label](url), and only in body where genuinely a citation.\n` +
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

/**
 * Evidence-size guard. Some candidate types (briefing/intel) embed full
 * article bodies in `evidence`; a raw JSON.stringify produced ~180K-token
 * prompts that blew the model context window (error 5021) → publish_failed.
 * Bound it well under even the smallest model window (Workers-AI ≈ 24K
 * tokens): ~12K chars ≈ ~3-4K tokens, leaving ample room for output.
 */
const FACTS_BUDGET = 12_000;
const STR_CAP = 600;
const ARR_CAP = 12;

function trimValue(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.length > STR_CAP ? `${v.slice(0, STR_CAP)}…[truncated]` : v;
  if (Array.isArray(v)) {
    const out: unknown[] = v.slice(0, ARR_CAP).map((x) => trimValue(x, depth + 1));
    if (v.length > ARR_CAP) out.push(`…+${v.length - ARR_CAP} more items (truncated)`);
    return out;
  }
  if (v && typeof v === 'object' && depth < 4) {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = trimValue(val, depth + 1);
    return o;
  }
  return v;
}

function clampFacts(facts: Record<string, unknown>, budget = FACTS_BUDGET): string {
  let s = JSON.stringify(facts) ?? '{}';
  if (s.length <= budget) return s;
  // Structural trim first (keeps breadth: caps arrays + long strings).
  s = JSON.stringify(trimValue(facts)) ?? '{}';
  if (s.length <= budget) return s;
  // Last resort: hard cut with an explicit marker.
  return `${s.slice(0, budget)}…[truncated]`;
}

/* ── Briefing digest ─────────────────────────────────────────────────────
 * A weekly briefing's evidence is hundreds of findings + IOC arrays. Feeding
 * truncated raw JSON made the model write vague filler ("many of them",
 * "suspicious network activity", IOC counts instead of indicators). Instead
 * we hand it a compact, high-signal digest: the strongest CVEs WITH
 * vendor/product/CVSS/CWE, the KEV entries, and a REAL sample of each IOC
 * type. Specific input → specific output.
 */
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function iocSample(arr: unknown, n = 10): { sample: string[]; total: number } {
  const a = asArr(arr).map((x) =>
    typeof x === 'string' ? x : x && typeof x === 'object' ? String((x as { value?: unknown }).value ?? '') : String(x)
  );
  const clean = a.filter(Boolean);
  return { sample: clean.slice(0, n), total: clean.length };
}

function briefingDigest(facts: Record<string, unknown>): string {
  const f = facts as {
    date_range?: string;
    executive_summary?: string;
    stats?: Record<string, number>;
    sections?: Array<{
      id?: string;
      title?: string;
      findings?: Array<{
        id?: string;
        title?: string;
        description?: string;
        severity?: string;
        cvss?: number;
        cwes?: string[];
        vendor?: string;
        product?: string;
      }>;
    }>;
    iocs?: Record<string, unknown>;
    mitre_techniques?: string[];
  };

  const findings = asArr(f.sections).flatMap((s) => asArr((s as { findings?: unknown }).findings)) as Array<
    Record<string, unknown>
  >;
  const fmtFinding = (x: Record<string, unknown>) => {
    const id = String(x.id ?? '').trim();
    const vp = [x.vendor, x.product].filter(Boolean).join(' ').trim();
    const cvss = typeof x.cvss === 'number' ? `CVSS ${x.cvss}` : '';
    const cwe = asArr(x.cwes).slice(0, 2).join('/');
    const sev = String(x.severity ?? '').trim();
    const desc = String(x.description ?? x.title ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
    return `- ${id} | ${vp || 'unspecified vendor'} | ${cvss} | ${cwe} | ${sev} — ${desc}`;
  };

  const ranked = [...findings].sort((a, b) => (Number(b.cvss) || 0) - (Number(a.cvss) || 0));
  const topCves = ranked.slice(0, 18).map(fmtFinding).join('\n');

  const kevFindings = asArr(f.sections)
    .filter((s) => /kev|exploited/i.test(`${(s as { id?: string }).id ?? ''} ${(s as { title?: string }).title ?? ''}`))
    .flatMap((s) => asArr((s as { findings?: unknown }).findings) as Array<Record<string, unknown>>)
    .slice(0, 12)
    .map(fmtFinding)
    .join('\n');

  const iocs = (f.iocs ?? {}) as Record<string, unknown>;
  const iocLines = (['domains', 'ipv4s', 'urls', 'hashes'] as const)
    .map((k) => {
      const { sample, total } = iocSample(iocs[k]);
      return total ? `${k} (${total} total) sample: ${sample.join(', ')}` : '';
    })
    .filter(Boolean)
    .join('\n');

  const stats = f.stats ?? {};
  const statLine = Object.entries(stats)
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');
  const mitre = asArr(f.mitre_techniques).slice(0, 14).join(', ');

  return [
    `WINDOW: ${f.date_range ?? 'n/a'}`,
    `STATS: ${statLine}`,
    f.executive_summary ? `EXECUTIVE SUMMARY: ${String(f.executive_summary).slice(0, 900)}` : '',
    topCves ? `TOP CVEs (by CVSS — name these specifically):\n${topCves}` : '',
    kevFindings ? `CISA KEV ENTRIES (actively exploited — call these out):\n${kevFindings}` : '',
    iocLines ? `IOC SAMPLES (use these REAL indicators, never invent or just give counts):\n${iocLines}` : '',
    mitre ? `MITRE ATT&CK techniques observed: ${mitre}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const BRIEFING_GUIDANCE =
  `\n\nBRIEFING-SPECIFIC REQUIREMENTS (this is a weekly threat briefing):\n` +
  `- Name specific CVEs with their vendor/product and CVSS — e.g. "CVE-2026-42607 in Grav (CVSS 9.1)". Never write "many of them" or "several others" when the data lists them.\n` +
  `- The IOC section MUST list a representative sample of the ACTUAL indicators from IOC SAMPLES above (real domains/IPs/hashes), then give totals. Never describe IOCs generically ("suspicious network activity", "unusual system behavior") and never give only counts.\n` +
  `- Call out the CISA KEV entries explicitly by ID and what they affect — those are the priority.\n` +
  `- Each section must add NEW information. Do not repeat "patch immediately" / the same recommendation across sections. Detection & defensive guidance must be concrete (specific products, KEV due-date framing, what to hunt for).\n` +
  `- Lead the hook with the single sharpest number or pattern in the data, not "You're facing a critical threat landscape".`;

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const outline = OUTLINES[input.type].join('\n');
  const factsBlock = input.type === 'briefing' ? briefingDigest(input.facts) : clampFacts(input.facts);
  const typeGuidance = input.type === 'briefing' ? BRIEFING_GUIDANCE : '';

  const sources = (input.sources ?? []).slice(0, 25);
  const sourcesBlock =
    sources.length > 0
      ? `\n\nREFERENCE URLS (link to these as sources in the References section):\n${sources.map((s) => `- ${s.url}${s.title ? ` (${s.title})` : ''}`).join('\n')}`
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
    `Never include raw JSON or structured data blocks in the output.` +
    typeGuidance;
  return { system: SYSTEM_PROMPT, user };
}

export function requiredSections(type: CaseStudyType): string[] {
  return OUTLINES[type];
}

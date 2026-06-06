/**
 * Markdown frontmatter parser — reads a .md file with YAML-like
 * frontmatter and extracts a ContentSpec. Slides are parsed from
 * the markdown body using `---` delimiters.
 *
 * Frontmatter keys map 1:1 to ContentSpec fields. Slides are delimited
 * by `---` on their own line. Each slide's first line is the headline,
 * subsequent lines are body/bullets.
 *
 * Example:
 * ```
 * ---
 * slug: tofu-01-mfa-myth
 * title: 5 MFA Myths That Will Blow Your Mind
 * funnel: tofu
 * platform: linkedin
 * format: carousel
 * hook: contrarian
 * persona: Junior SOC Analyst
 * hashtags: cybersecurity, MFA, security
 * cta: Follow for more myth-busting
 * ---
 * MFA Won't Save You.
 * Here's why most implementations are broken.
 * ---
 * Myth 1: MFA = Security
 * - MFA stops 99% of automated attacks
 * - But targeted attacks bypass MFA in minutes
 * - SIM swapping, prompt bombing, real-time phishing
 * ---
 * ...
 * ```
 */

import type { ContentSpec, ContentSlide, FunnelStage, Platform, ContentFormat, HookType } from './content-spec';

function parseFrontmatter(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.split('\n');
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

function parseSlide(raw: string, index: number): ContentSlide {
  const lines = raw
    .trim()
    .split('\n')
    .filter((l) => l.trim().length > 0);
  const headline = lines[0]?.replace(/^#+\s*/, '').trim() ?? `Slide ${index}`;
  const rest = lines.slice(1);

  const bullets: string[] = [];
  let body: string | undefined;
  let stat: ContentSlide['stat'];

  for (const line of rest) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('→ ')) {
      bullets.push(trimmed.replace(/^[-*→]\s*/, '').trim());
    } else if (trimmed.startsWith('STAT:')) {
      // STAT: 80%|of breaches use valid credentials
      const parts = trimmed
        .slice(5)
        .split('|')
        .map((p) => p.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        stat = { value: parts[0], label: parts[1] };
      }
    } else if (trimmed.startsWith('CTA:')) {
      // handled via isCTA flag below
    } else if (!body) {
      body = trimmed;
    }
  }

  const isCTA =
    raw.trim().toUpperCase().startsWith('CTA:') || raw.trim().includes('\nCTA:') || raw.trim().includes('\ncta:');

  return {
    index,
    headline: isCTA ? headline.replace(/^CTA:\s*/i, '') : headline,
    body: body || undefined,
    bullets: bullets.length > 0 ? bullets : undefined,
    stat,
    isCTA: isCTA || undefined,
  };
}

export function parseContentSpec(filePath: string, raw: string): ContentSpec {
  // Split frontmatter from body
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error(`No frontmatter found in ${filePath}`);

  const fm = parseFrontmatter(fmMatch[1]!);
  const body = fmMatch[2]!;

  // Split slides by `---`
  const slideChunks = body.split(/\n---\n/).filter((s) => s.trim().length > 0);

  const slides = slideChunks.map((chunk, i) => parseSlide(chunk, i + 1));

  // Parse hashtags
  const hashtags = (fm.hashtags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const spec: ContentSpec = {
    slug: fm.slug ?? filePath.replace(/\.md$/, '').split('/').pop() ?? 'untitled',
    title: fm.title ?? 'Untitled',
    funnel: (fm.funnel ?? 'tofu') as FunnelStage,
    platform: (fm.platform ?? 'linkedin') as Platform,
    format: (fm.format ?? 'carousel') as ContentFormat,
    hook: (fm.hook ?? 'curiosity-gap') as HookType,
    persona: fm.persona ?? 'Junior SOC Analyst',
    hashtags,
    slides,
    cta: fm.cta ?? 'Follow for more cybersecurity insights',
    notes: fm.notes,
  };

  return spec;
}

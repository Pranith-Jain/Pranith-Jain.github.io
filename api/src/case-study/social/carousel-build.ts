import type { Ai } from '@cloudflare/workers-types';
import type { Post } from '../types';
import { runCompletion } from '../generation/ai-client';
import { clampSlides, type ContentSlide } from './slide-spec';

const MIN = 3;
const MAX = 8;

interface RawSlide {
  headline?: string;
  body?: string;
  bullets?: string[];
}

/** Pull "## " section headings + their first sentence from a post body. */
function sections(body: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  const re = /^##\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  const idxs: { title: string; start: number }[] = [];
  while ((m = re.exec(body))) idxs.push({ title: m[1]!.trim(), start: m.index + m[0].length });
  for (let i = 0; i < idxs.length; i++) {
    const end = i + 1 < idxs.length ? body.indexOf('\n## ', idxs[i]!.start) : body.length;
    const slice = body.slice(idxs[i]!.start, end < 0 ? body.length : end).trim();
    const firstSentence = slice.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0] ?? '';
    if (idxs[i]!.title.toLowerCase() !== 'references') {
      out.push({ heading: idxs[i]!.title, text: firstSentence.slice(0, 180) });
    }
  }
  return out;
}

/** Deterministic carousel from a post: hook → up to 5 sections → cta. Always valid. */
export function deterministicSlides(post: Post): ContentSlide[] {
  const secs = sections(post.body).slice(0, 5);
  const slides: ContentSlide[] = [];
  slides.push({ index: 0, kind: 'hook', headline: post.title.replace(/\s+—\s+/g, ' — ') });
  secs.forEach((s) => slides.push({ index: slides.length, kind: 'content', headline: s.heading, body: s.text }));
  slides.push({ index: slides.length, kind: 'cta', headline: 'Read the full analysis' });
  return clampSlides(slides, MIN, MAX).length ? slides.slice(0, MAX).map((s, i) => ({ ...s, index: i })) : slides;
}

/** Parse a (possibly fenced) JSON array of {headline,body,bullets} into slides. */
export function parseSlidesJson(text: string): ContentSlide[] | null {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as RawSlide[];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const slides = raw
      .filter((r) => typeof r.headline === 'string' && r.headline.trim())
      .map((r, i) => ({
        index: i,
        headline: r.headline!.trim().slice(0, 120),
        body: typeof r.body === 'string' ? r.body.trim().slice(0, 220) : undefined,
        bullets: Array.isArray(r.bullets) ? r.bullets.filter((b) => typeof b === 'string').slice(0, 5) : undefined,
      }));
    return slides.length ? slides : null;
  } catch {
    return null;
  }
}

const SLIDE_SYSTEM =
  'You turn a cybersecurity blog post into a punchy Instagram carousel. ' +
  'Output ONLY a JSON array of 5-7 slide objects {headline, body?, bullets?}. ' +
  'Slide 1 is a scroll-stopping hook (no body). Middle slides are scannable (short headline + 1-2 sentence body OR 3 bullets). ' +
  'Last slide is a call to action. Headlines <= 70 chars. Ground every claim in the post — invent nothing. No hashtags, no emoji.';

/** Build carousel slides via AI, falling back to deterministic extraction. */
export async function buildCarouselSlides(
  post: Post,
  deps: { ai: Ai; groqKey?: string; googleKey?: string }
): Promise<ContentSlide[]> {
  try {
    const res = await runCompletion(
      deps.ai,
      {
        system: SLIDE_SYSTEM,
        user: `Title: ${post.title}\n\nBody:\n${post.body.slice(0, 6000)}`,
        temperature: 0.6,
        maxTokens: 1200,
      },
      { groqKey: deps.groqKey, googleKey: deps.googleKey, quality: true }
    );
    const parsed = parseSlidesJson(res.text);
    if (parsed) {
      const withKinds = parsed.map((s, i) => ({
        ...s,
        kind:
          i === 0
            ? ('hook' as const)
            : i === parsed.length - 1
              ? ('cta' as const)
              : s.bullets?.length
                ? ('list' as const)
                : ('content' as const),
      }));
      const clamped = clampSlides(withKinds, MIN, MAX);
      if (clamped.length) return clamped;
    }
  } catch {
    // fall through to deterministic
  }
  return deterministicSlides(post);
}

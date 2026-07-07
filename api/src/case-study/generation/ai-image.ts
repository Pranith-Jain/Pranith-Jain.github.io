import type { Ai } from '@cloudflare/workers-types';

/**
 * AI illustration generation for blog posts (Workers AI text-to-image).
 *
 * Each published post gets a unique, on-brand hero illustration plus one
 * in-body image. Prompts are derived from the post topic and locked to an
 * abstract, text-free, face-free style so the output stays on-brand and never
 * tries (and fails) to render real text or people — the two things diffusion
 * models reliably botch. Everything here is best-effort: a failure returns
 * null and the caller falls back to the typographic SVG hero.
 */

/** Flux schnell: fast, GA on Workers AI, returns { image: <base64 jpeg> }. */
const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

// Locked style suffix — keeps every post's art cohesive and safe. The
// negative cues ("no text", "no faces") matter: diffusion text/faces are the
// classic tells of low-effort AI art.
const STYLE =
  'dark cinematic abstract digital-security concept art, deep indigo and electric blue palette, ' +
  'volumetric light, intricate geometric detail, premium editorial illustration, ' +
  'no text, no words, no letters, no logos, no human faces, no people';

/** Map a content type to an abstract visual subject. */
function subjectFor(type: string): string {
  switch (type) {
    case 'cve':
      return 'a fractured glowing digital shield over an exposed circuit lattice';
    case 'ransom':
      return 'an encrypted vault wrapped in chains of luminous data streams';
    case 'breach':
      return 'a shattered firewall leaking rivers of glowing data packets';
    case 'actor':
      return 'a shadowy networked silhouette assembled from flowing code fragments';
    case 'malware':
      return 'a crystalline malicious payload branching through a neural circuit';
    case 'aisec':
      return 'an abstract AI core entangled with adversarial signal threads';
    case 'intel':
    case 'osint':
      return 'a constellation of interconnected intelligence nodes over a dark grid';
    case 'trend':
    case 'analysis':
      return 'an abstract data horizon of rising threat-signal waveforms';
    case 'agentic':
      return 'an autonomous AI agent node branching through interconnected tool pipelines';
    case 'hunting':
      return 'a focused searchlight beam scanning across layered data grids and log streams';
    case 'report':
      return 'an open research document with glowing data visualizations and annotated findings';
    default:
      return 'an abstract cyber-threat landscape of interlocking secure networks';
  }
}

/** A short, safe topic cue distilled from the title (no risky literal terms). */
function topicCue(title: string): string {
  const cleaned = title
    .replace(/CVE-\d{4}-\d+/gi, '')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 6)
    .join(' ');
  return cleaned ? `, evoking ${cleaned}` : '';
}

export interface ImagePromptInput {
  title: string;
  type: string;
}

/** Hero illustration prompt — the post's marquee image. */
export function buildHeroImagePrompt(post: ImagePromptInput): string {
  return `${subjectFor(post.type)}${topicCue(post.title)}, wide cinematic hero composition. ${STYLE}`;
}

/** In-body illustration prompt — a complementary mid-article visual. */
export function buildBodyImagePrompt(post: ImagePromptInput): string {
  return `Close-up macro detail of ${subjectFor(post.type)}${topicCue(post.title)}, shallow depth of field. ${STYLE}`;
}

/**
 * Insert an image into the post body as markdown. Placed just before the
 * SECOND `## ` heading (i.e. after the first section) so it sits mid-article,
 * not above the fold or stranded at the end. Falls back to appending before a
 * `## References` block, or to the end. Pure.
 */
export function injectBodyImage(body: string, url: string, title: string): string {
  const alt = title
    .replace(/[[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  const md = `![${alt} — illustration](${url})`;
  const headings = [...body.matchAll(/^##\s+.+$/gm)];
  if (headings.length >= 2 && headings[1]!.index !== undefined) {
    const idx = headings[1]!.index!;
    return `${body.slice(0, idx)}${md}\n\n${body.slice(idx)}`;
  }
  const refsIdx = body.search(/^##\s+references\b/im);
  if (refsIdx >= 0) return `${body.slice(0, refsIdx)}${md}\n\n${body.slice(refsIdx)}`;
  return `${body.replace(/\s*$/, '')}\n\n${md}\n`;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Generate one image from a prompt. Returns PNG/JPEG bytes, or null on any
 * failure (never throws — image gen must not break the publish path).
 * Handles both the `{ image: base64 }` shape (Flux) and a raw binary shape.
 */
export async function generateAiImage(ai: Ai, prompt: string): Promise<Uint8Array | null> {
  try {
    const res: unknown = await ai.run(IMAGE_MODEL as never, { prompt, steps: 4 } as never);
    if (res instanceof Uint8Array) return res;
    if (res instanceof ArrayBuffer) return new Uint8Array(res);
    if (res && typeof res === 'object' && 'image' in res) {
      const img = (res as { image?: unknown }).image;
      if (typeof img === 'string' && img.length > 0) return base64ToBytes(img);
      if (img instanceof Uint8Array) return img;
    }
    return null;
  } catch (err) {
    console.warn('generateAiImage failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

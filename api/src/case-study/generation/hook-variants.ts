import type { Ai } from '@cloudflare/workers-types';
import { runCompletion } from './ai-client';

/**
 * Hook variants: generate a few distinct scroll-stopping opening lines for a
 * post, each a different angle (data-shock / contrarian / curiosity-gap), so
 * the operator can A/B the lead or pick the strongest when posting manually.
 * Stored on SocialContent; the primary platform copy still leads with its own
 * hook — these are alternatives, not a replacement.
 */

export interface HookSource {
  title: string;
  body: string;
}

/** Parse model output into clean hook lines (strip numbering/bullets/quotes,
 *  drop commentary + too-short lines, cap at 3). Pure. */
export function parseHooks(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^[-*•]\s*/, '')
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .trim();
    if (line.length < 10) continue;
    if (/^(here are|hooks?:)/i.test(line) || line.endsWith(':')) continue;
    out.push(line);
    if (out.length >= 3) break;
  }
  return out;
}

const HOOK_SYSTEM =
  'You write scroll-stopping opening hooks for cybersecurity content. ' +
  'Output ONLY the hooks, one per line — no numbering, no quotes, no commentary, no hashtags, no emoji.';

/**
 * Generate up to 3 distinct opening hooks for a story. Best-effort: returns []
 * on any failure (hook variants are a nice-to-have, never block generation).
 * Optionally accepts a performanceNote from the analytics feedback loop.
 */
export async function generateHookVariants(
  src: HookSource,
  ai: Ai,
  groqKey?: string,
  googleKey?: string,
  nvidiaKey?: string,
  performanceNote?: string
): Promise<string[]> {
  try {
    const res = await runCompletion(
      ai,
      {
        system: HOOK_SYSTEM,
        user:
          `Write 3 DISTINCT opening hooks for this story — each a different angle: ` +
          `(1) a hard-number data shock, (2) a contrarian read, (3) a curiosity gap. ` +
          `Each <= 200 chars, grounded in the facts below, no hashtags or emoji.\n\n` +
          `Title: ${src.title}\n\nFacts:\n${src.body.slice(0, 3000)}` +
          (performanceNote ?? ''),
        temperature: 0.9,
        maxTokens: 400,
      },
      { groqKey, googleKey, nvidiaKey, quality: true, preferGroq: true }
    );
    return parseHooks(res.text);
  } catch {
    return [];
  }
}

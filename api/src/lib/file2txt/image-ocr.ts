import type { Env } from '../../env';
import { MAX_TEXT_LENGTH, type ExtractResult } from './types';
import { bridgeConfigured, extractViaBridge } from './bridge';

const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const OCR_PROMPT = 'Transcribe all text visible in this image verbatim. Output only the transcribed text.';

/** In-Worker vision OCR is bounded well below the 10 MB file cap: every image
 *  here triggers a Workers AI vision inference (daily neuron budget) AND gets
 *  expanded to a per-byte JS array before the call, so we cap the in-Worker
 *  path tightly. Larger images must go through the bridge. */
const MAX_IMAGE_OCR_BYTES = 4 * 1024 * 1024; // 4 MB

/** Thrown when an image exceeds the in-Worker OCR size cap and no bridge is
 *  configured to offload it. The handler maps this to 413. */
export class ImageTooLarge extends Error {
  constructor() {
    super('image exceeds in-Worker OCR size cap');
    this.name = 'ImageTooLarge';
  }
}

/** OCR an image. Prefers the bridge (higher fidelity, no neuron cost, no size
 *  cap) when configured, else Workers AI vision. Vision inference is I/O-bound
 *  (does not count against the 10 ms CPU cap) but consumes the daily neuron
 *  budget, so the in-Worker path is size-capped to limit abuse + the
 *  `Array.from` expansion cost. */
export async function extractImage(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
  env: Env
): Promise<ExtractResult> {
  if (bridgeConfigured(env)) {
    return extractViaBridge(bytes, contentType, filename, env, 'image');
  }

  if (bytes.length > MAX_IMAGE_OCR_BYTES) throw new ImageTooLarge();

  const out = (await env.AI.run(
    VISION_MODEL as Parameters<typeof env.AI.run>[0],
    {
      image: Array.from(bytes),
      prompt: OCR_PROMPT,
    } as Parameters<typeof env.AI.run>[1]
  )) as { description?: string; response?: string };

  const raw = (out.description ?? out.response ?? '').trim();
  const text = raw.slice(0, MAX_TEXT_LENGTH);
  return { text, meta: { kind: 'image', method: 'ai-vision', truncated: raw.length > MAX_TEXT_LENGTH } };
}

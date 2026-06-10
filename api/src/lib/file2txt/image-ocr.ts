import type { Env } from '../../env';
import { MAX_TEXT_LENGTH, type ExtractResult } from './types';
import { bridgeConfigured, extractViaBridge } from './bridge';

const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const OCR_PROMPT = 'Transcribe all text visible in this image verbatim. Output only the transcribed text.';

/** OCR an image. Prefers the bridge (higher fidelity) when configured, else
 *  Workers AI vision. Vision inference is I/O-bound (does not count against the
 *  10 ms CPU cap) but consumes the daily neuron budget. */
export async function extractImage(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
  env: Env
): Promise<ExtractResult> {
  if (bridgeConfigured(env)) {
    return extractViaBridge(bytes, contentType, filename, env, 'image');
  }

  const out = (await env.AI.run(
    VISION_MODEL as never,
    {
      image: Array.from(bytes),
      prompt: OCR_PROMPT,
    } as never
  )) as { description?: string; response?: string };

  const raw = (out.description ?? out.response ?? '').trim();
  const text = raw.slice(0, MAX_TEXT_LENGTH);
  return { text, meta: { kind: 'image', method: 'ai-vision', truncated: raw.length > MAX_TEXT_LENGTH } };
}

import { MAX_TEXT_LENGTH, type ExtractResult } from './types';

const DECODE: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => DECODE[m.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cap(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_LENGTH) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_LENGTH), truncated: true };
}

/** In-Worker extraction for the CPU-cheap formats. */
export function extractTextOrHtml(bytes: Uint8Array, kind: 'text' | 'html'): ExtractResult {
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const text = kind === 'html' ? htmlToText(raw) : raw.trim();
  const { text: capped, truncated } = cap(text);
  return { text: capped, meta: { kind, method: 'inline', truncated } };
}

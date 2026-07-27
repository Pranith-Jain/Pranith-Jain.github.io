/**
 * Tiny HTML entity decoder for upstream-encoded text strings.
 *
 * Used by snapshot panels rendering commit titles + RSS items where the
 * upstream API double-encodes apostrophes / quotes / ampersands. We only
 * decode the five common entities - anything more exotic stays as-is
 * rather than risk over-decoding inside content that's already plain text.
 */
export function decodeHtml(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

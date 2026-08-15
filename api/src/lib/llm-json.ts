/**
 * Robust JSON extraction from LLM output. Handles:
 *   - Markdown-fenced JSON (```json ... ```)
 *   - Surrounding prose before/after the JSON
 *   - Trailing commas (models love `[1, 2,]`)
 *   - LITERAL control characters inside string values — models frequently
 *     emit pretty-printed JSON with a REAL newline/tab inside a string
 *     (e.g. `"summary": "line one\nline two"` written as two physical
 *     lines). JSON.parse rejects those with "Expected ',' or '}' after
 *     property value ... at line N" — this escapes them, string-aware, so
 *     the value parses as `\n`/`\t` like the model intended.
 *   - Single-quoted strings (some models produce these)
 *
 * Returns parsed object/array or null on failure.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;

  // Strip markdown code fences
  const s = raw
    .replace(/```(?:json|JSON)?\s*\n?/g, '')
    .replace(/```\s*$/gm, '')
    .trim();

  // Outermost JSON container — an object `{...}` or an array `[...]`.
  const i = s.search(/[\[{]/);
  if (i < 0) return null;
  const close = s[i] === '[' ? ']' : '}';
  const j = s.lastIndexOf(close);
  if (j <= i) return null;

  let jsonStr = s.slice(i, j + 1);

  // String-aware escape of raw control characters inside string literals.
  jsonStr = escapeControlCharsInStrings(jsonStr);

  // Remove trailing commas before } or ] (common LLM mistake)
  jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Last resort: try to fix common issues
    // Replace single quotes with double quotes (only if no double quotes inside)
    if (!jsonStr.includes('"')) {
      try {
        return JSON.parse(jsonStr.replace(/'/g, '"')) as T;
      } catch {
        // give up
      }
    }
    return null;
  }
}

/**
 * Escape raw control characters (real newlines, tabs, CR, other U+0000–U+001F)
 * that appear INSIDE JSON string literals. Structural whitespace between tokens
 * is untouched. Respects `\"` and `\\` escapes so escaped quotes aren't treated
 * as string terminators.
 */
function escapeControlCharsInStrings(json: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i] ?? '';
    if (inString) {
      if (ch === '\\') {
        // Copy the escape pair verbatim (e.g. \" \\ \n already-escaped)
        out += ch;
        if (i + 1 < json.length) {
          out += json[i + 1] ?? '';
          i++;
        }
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        const esc =
          ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : `\\u${code.toString(16).padStart(4, '0')}`;
        out += esc;
        continue;
      }
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

/**
 * Robust JSON extraction from LLM output. Handles:
 *   - Markdown-fenced JSON (```json ... ```)
 *   - Surrounding prose before/after the JSON
 *   - Trailing commas
 *   - Single-quoted strings (some models produce these)
 *
 * Returns parsed object or null on failure.
 */
export function extractJson<T = Record<string, unknown>>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;

  // Strip markdown code fences
  let s = raw.replace(/```(?:json|JSON)?\s*\n?/g, '').replace(/```\s*$/gm, '').trim();

  // Find the outermost JSON object
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;

  let jsonStr = s.slice(i, j + 1);

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

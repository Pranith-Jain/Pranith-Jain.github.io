/**
 * Prose-style contract for model-generated prose.
 *
 * ## The rule
 *
 * PRODUCT.md bans em dashes as **sentence connectors** in running prose. It is
 * an AI-slop tell: "Aggregates results in one pass — a single query can
 * surface 900+ hits." That is the thing to remove.
 *
 * The ban is deliberately narrow. An em dash doing structural work is NOT a
 * tell and must survive:
 *
 *   - Null-value placeholder in a table: `| dwell time | — |`
 *   - Term–definition pairs: `Label — definition`, `0: 'Not started.'`
 *   - A headline quoted verbatim from an upstream feed
 *   - Numeric ranges: `70—80`, `1,200—1,500`
 *
 * A blanket `—` → `, ` codemod corrupts all four, which is why
 * `scripts/find-em-dashes.mjs` classifies instead of rewriting.
 *
 * ## Why prevention first
 *
 * The model is the source. If a prompt's own prose and examples use em dashes
 * as connectors, the model imitates them, and no post-processing gets the
 * output genuinely right — it can only approximate. So:
 *
 *   1. {@link NO_EM_DASH_RULE} goes into the system prompt of every surface
 *      that emits prose.
 *   2. {@link stripConnectorEmDashes} cleans up whatever slips through, and is
 *      deliberately conservative: it only rewrites the unambiguous
 *      connector shape and leaves every structural use intact.
 *
 * {@link countConnectorEmDashes} exists so the residual debt stays measurable,
 * the same way `npm run check:em-dashes` does for hand-written copy.
 */

/**
 * Prompt fragment. Append to the system prompt of any surface whose output is
 * read as prose (summaries, digests, briefings, long-form posts).
 *
 * Do not add it to prompts that emit structured data — JSON, detection rules,
 * IOC lists — where punctuation is not the concern.
 */
export const NO_EM_DASH_RULE = `

## Punctuation
Do not use em dashes (—) or en dashes as sentence connectors in prose. They read as a generated-text tell. To set up an aside, break the sentence, use a colon, use parentheses, or restructure it.

A dash is still correct as a data glyph or a delimiter. Keep it in a table cell standing in for a missing value, in a "Label — definition" pair, in a numeric range like 70—80, and inside any headline you are quoting verbatim from a source.`;

const EM = /[\u2014\u2013]/;

/**
 * Connector shape: a spaced dash sitting between two word characters on the
 * same line.
 *
 * Requiring a non-space on BOTH sides is what separates this from the cases
 * we must preserve:
 *
 *   - `| — |`       bare glyph, no adjacent char    -> untouched
 *   - `70—80`       digit before and after          -> untouched (digit guard)
 *   - `a—b` inside a URL                             -> untouched (URL guard)
 *
 * The dash is replaced with a comma. A comma is the safest deterministic
 * substitute: unlike a period it cannot split a sentence in a way that leaves
 * a fragment, and unlike a colon it cannot turn an aside into a definition.
 */
const SPACED_CONNECTOR = /(\S)[ \t]*[\u2014\u2013][ \t]*(\S)/g;

/**
 * True when either side of a matched dash is a digit, i.e. the dash is a range
 * separator (`70—80`, `9.0–10.0`) rather than punctuation.
 */
function isRange(before: string, after: string): boolean {
  return /\d/.test(before) || /\d/.test(after);
}

/** `—` or `–` standing alone on a line: a missing-value glyph. */
const BARE_GLYPH = /^[ \t]*[\u2014\u2013][ \t]*$/;

/**
 * Markdown table row. A dash inside a table is always a delimiter or a null
 * glyph, never a sentence connector.
 */
const TABLE_ROW = /^[ \t]*\|/;

/**
 * Blockquote or fenced code. Punctuation inside is part of the quoted or
 * generated artifact, not the surrounding prose.
 */
const FENCE_OR_QUOTE = /^[ \t]*(?:>|```|~~~)/;

/**
 * Heading or list item that opens with a short label followed by a dash.
 * `### Scoping — what to collect first` is a definition the reader parses
 * structurally, so it is left alone.
 *
 * The markdown marker is REQUIRED. An earlier version made the marker optional
 * and matched bare prose too, so the guard protected everything and the
 * stripper never fired.
 *
 * Colons ARE allowed before the dash, because the citation-format specifiers
 * that must survive look like `- Each citation: \`- [Source](url) — desc\``.`
 * Only `!` and `?` are excluded: they signal sentence-ending prose rather than
 * a label.
 *
 * Trade-off: a list item carrying a genuine connector dash is left alone
 * rather than risk mangling the definition cases PRODUCT.md calls out. That
 * residue is exactly what {@link countConnectorEmDashes} reports.
 */
const DEFINITION_LINE = /^[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)\S[^!?]{0,60}?[\u2014\u2013]/;

/** Any line containing a URL. `…/a—b` in a path must not become `…/a, b`. */
const HAS_URL = /\w:\/\//;

/**
 * JSX attribute value or template literal that STARTS with a quote. These
 * are structured tool/IOC labels, STIX identifiers, or curated feed titles,
 * not surrounding prose. Rewriting `title: 'AI Vulns — LLM Threat Atlas'`
 * would turn a deliberate product label into `'AI Vulns, LLM Threat Atlas'`,
 * which is a silent content change, not a style fix.
 *
 * The stripper's output contract is about *generated prose*; it degrades to
 * "leave it alone" for anything that is not clearly that.
 */
const PROSE_STRING_LINE = /^\s*(?:[a-zA-Z_$][\w$]*\s*:\s*)?[`'"]/;

/**
 * A `?? '—'` / `|| '—'` fallback that uses the dash as a missing-value glyph
 * in the middle of a code expression. Same reasoning: glyph, not connector.
 */
const INLINE_NULL_GLYPH = /(?:\?\?|\|\||return|\?)\s*['"`][\u2014\u2013]['"`]/;

/**
 * Rewrite em dashes that are unambiguously acting as sentence connectors.
 *
 * Deliberately conservative, and it degrades to "leave it alone" rather than
 * guessing. Preserved, by design:
 *
 *   - bare glyphs used as a missing-value placeholder
 *   - numeric ranges on either side of a digit
 *   - dashes inside markdown tables, blockquotes, and fenced code
 *   - definition-style lines (`Label — definition`)
 *
 * Rewritten: a spaced dash between two word characters in ordinary prose,
 * which becomes a comma. A comma is the safest deterministic substitute: it
 * cannot produce a sentence fragment or change clause structure the way a
 * period would. Where the rewrite produces ", ," or a dangling comma before
 * punctuation, that is cleaned up in the same pass.
 *
 * Idempotent: running it twice produces the same output as running it once.
 */
export function stripConnectorEmDashes(input: string): string {
  if (!input || !EM.test(input)) return input;

  const out: string[] = [];
  let inFence = false;

  for (const line of input.split('\n')) {
    const fenceOpen = /^[ \t]*(?:```|~~~)/.test(line);
    if (fenceOpen) inFence = !inFence;

    // Inside a fence, and for any line that is structural, pass through
    // BYTE-FOR-BYTE. Running the whitespace tidy below over these would
    // silently reflow quoted headlines and code, which is the corruption
    // this module exists to avoid.
    if (
      inFence ||
      BARE_GLYPH.test(line) ||
      TABLE_ROW.test(line) ||
      FENCE_OR_QUOTE.test(line) ||
      DEFINITION_LINE.test(line) ||
      HAS_URL.test(line) ||
      INLINE_NULL_GLYPH.test(line) ||
      (PROSE_STRING_LINE.test(line) && !/[<>{}]|=>/.test(line))
    ) {
      out.push(line);
      continue;
    }

    // Only rewrite lines we actually change, then tidy just those.
    const rewritten = line.replace(SPACED_CONNECTOR, (match: string, before: string, after: string) => {
      // A numeric range keeps its dash AND its character, byte for byte.
      // Normalising `9.0–10.0` to `9.0-10.0` would be an unrequested edit to
      // content the reader parses, and the pre-existing post-processor left
      // ranges entirely alone.
      if (isRange(before, after)) return match;
      // A run of dashes ("Value — — more") collapses to one comma.
      if (/[\u2014\u2013]/.test(after)) return `${before}, `;
      return `${before}, ${after}`;
    });

    out.push(
      rewritten === line
        ? line
        : rewritten
            .replace(/,\s*[\u2014\u2013]\s*/g, ', ')
            .replace(/,\s*,\s*/g, ', ')
            .replace(/[ \t]+([,.;:!?])/g, '$1')
            .replace(/,[ \t]*([.;:!?])/g, '$1')
            .replace(/[ \t]{2,}/g, ' ')
    );
  }

  return out.join('\n');
}

/**
 * Count em dashes that {@link stripConnectorEmDashes} would rewrite.
 *
 * The residual after stripping is the honest measure of how well the prompt
 * rule is landing; it should trend toward zero, not be driven to zero by the
 * post-processor alone.
 */
export function countConnectorEmDashes(input: string): number {
  if (!input || !EM.test(input)) return 0;

  let n = 0;
  let inFence = false;

  for (const line of input.split('\n')) {
    const fenceOpen = /^[ \t]*(?:```|~~~)/.test(line);
    if (fenceOpen) {
      inFence = !inFence;
      continue;
    }
    if (
      inFence ||
      BARE_GLYPH.test(line) ||
      TABLE_ROW.test(line) ||
      FENCE_OR_QUOTE.test(line) ||
      DEFINITION_LINE.test(line) ||
      HAS_URL.test(line) ||
      INLINE_NULL_GLYPH.test(line) ||
      (PROSE_STRING_LINE.test(line) && !/[<>{}]|=>/.test(line))
    ) {
      continue;
    }
    const matches = line.match(SPACED_CONNECTOR);
    if (!matches) continue;
    for (const m of matches) {
      const digits = /\d/.test(m.replace(/[\u2014\u2013]/g, ''));
      if (!digits) n += 1;
    }
  }
  return n;
}

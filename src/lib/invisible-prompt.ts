/**
 * Invisible prompt-injection scanner (Unicode tag characters, U+E0000 block).
 *
 * Why this exists
 * ---------------
 * Unicode reserves U+E0000–U+E007F as "tag" characters. They have no glyph, so
 * text containing them renders as blank to a human — but a tokenizer still
 * decodes them back to ordinary ASCII (each tag char is its ASCII counterpart
 * + 0xE0000). An attacker can therefore hide a full instruction inside a code
 * comment, a markdown file, a chat message or a clipboard paste. It survives
 * copy-paste through most editors, terminals and chat apps. Any pipeline that
 * feeds untrusted text to an LLM reads it as a command the operator never saw.
 *
 * This is the DEFENSIVE direction: detect, count, decode and locate hidden tag
 * runs in text you did not write, so you can strip them before the text reaches
 * a model, a diff, a log pipeline, or a reviewer's eyes. Encoding a payload for
 * an attack is the author's capability, not ours — `encodeForTransport` below
 * exists only so round-trip tests can prove decode(encode(x)) === x.
 *
 * Scope note: this covers the U+E0000 tag block, the dominant invisible-
 * injection vector. It does NOT cover zero-width spaces (U+200B–U+200D),
 * bidi overrides (U+202A–U+202E), soft hyphen, or homoglyph substitution —
 * those change rendering but do not smuggle a readable instruction. Those are
 * flagged at a coarse level by `scanInvisibleText` under `otherInvisible` so a
 * reviewer is told they exist rather than given false assurance.
 */

/** First tag character (TAG SPACE, U+E0000). */
export const TAG_BLOCK_START = 0xe0000;
/** Last tag character (CANCEL TAG, U+E007F). */
export const TAG_BLOCK_END = 0xe007f;
/** Number of code points in the block. */
export const TAG_BLOCK_SIZE = TAG_BLOCK_END - TAG_BLOCK_START + 1;

/**
 * Non-tag invisible / direction-changing code points we still report, because
 * they are a common co-conspirator with tag-character injection even though
 * they cannot themselves carry a full instruction.
 */
const OTHER_INVISIBLE = new Set<number>([
  0x200b, // ZERO WIDTH SPACE
  0x200c, // ZERO WIDTH NON-JOINER
  0x200d, // ZERO WIDTH JOINER
  0x200e, // LEFT-TO-RIGHT MARK
  0x200f, // RIGHT-TO-LEFT MARK
  0x00ad, // SOFT HYPHEN
  0x2060, // WORD JOINER
  0xfeff, // ZERO WIDTH NO-BREAK SPACE (BOM)
  0x202a, // LEFT-TO-RIGHT EMBEDDING
  0x202b, // RIGHT-TO-LEFT EMBEDDING
  0x202c, // POP DIRECTIONAL FORMATTING
  0x202d, // LEFT-TO-RIGHT OVERRIDE
  0x202e, // RIGHT-TO-LEFT OVERRIDE
]);

/** Names for the non-tag invisibles, so a finding explains itself. */
const OTHER_INVISIBLE_NAMES: Record<number, string> = {
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x00ad: 'SOFT HYPHEN',
  0x2060: 'WORD JOINER',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
};

/** Bidi-override code points — these specifically reorder what a human reads. */
const BIDI_OVERRIDES = new Set([0x202a, 0x202b, 0x202c, 0x202d, 0x202e]);

export type InvisibleSeverity = 'critical' | 'high' | 'medium' | 'low' | 'none';

export interface TagRun {
  /** Zero-based index into the ORIGINAL string. */
  start: number;
  /** Exclusive end index into the ORIGINAL string. */
  end: number;
  /** Number of tag characters in this run. */
  length: number;
  /** The hidden payload, decoded back to ASCII. */
  decoded: string;
}

export interface OtherInvisible {
  codePoint: number;
  name: string;
  count: number;
  firstIndex: number;
  /** True for U+202A–U+202E, which visually reorder surrounding text. */
  bidiOverride: boolean;
}

export interface InvisibleScan {
  /** True if any tag character (U+E0000–U+E007F) was found. */
  hasTagCharacters: boolean;
  /** Total tag characters found. */
  tagCharCount: number;
  /** Contiguous runs of tag characters, with decoded payloads. */
  tagRuns: TagRun[];
  /** Everything the tag runs decode to, concatenated. */
  decodedPayload: string;
  /** Zero-width / bidi / soft-hyphen characters found. */
  otherInvisible: OtherInvisible[];
  /** True if a bidi override is present (display-order tampering). */
  hasBidiOverride: boolean;
  /**
   * Human-readable length of the decoded payload, in code points. Measured on
   * the DECODED text, because the raw tag run is visually zero-width — "you
   * have 3 hidden characters" is meaningless to the person reviewing it.
   */
  decodedCharCount: number;
  severity: InvisibleSeverity;
  /**
   * Why this severity, in one sentence. Always populated when severity != 'none'
   * so a UI never has to invent its own wording.
   */
  reason: string;
  /** Input length in UTF-16 code units, for the "how much of this file" ratio. */
  inputLength: number;
}

/** True if `codePoint` is in the Unicode tag block. */
export function isTagChar(codePoint: number): boolean {
  return codePoint >= TAG_BLOCK_START && codePoint <= TAG_BLOCK_END;
}

/** Decode a single tag code point back to its ASCII counterpart. */
export function decodeTagChar(codePoint: number): string {
  if (!isTagChar(codePoint)) return '';
  // U+E0001 is the canonical start (U+E0000 is TAG SPACE, kept for literal use).
  // Both map by subtraction, which is what makes the transform reversible.
  return String.fromCharCode(codePoint - TAG_BLOCK_START);
}

/** True if `char` is a tag character. */
export function isTagCharacter(char: string): boolean {
  if (!char) return false;
  return isTagChar(char.codePointAt(0) ?? -1);
}

/**
 * Encode ASCII into tag characters. For round-trip verification only — this is
 * the attack transform. `decodeInvisibleTags(encodeForTransport(x)) === x`.
 */
export function encodeForTransport(text: string): string {
  let out = '';
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    // Only the ASCII range round-trips through the tag block.
    if (cp > 0 && cp < TAG_BLOCK_SIZE) {
      out += String.fromCodePoint(TAG_BLOCK_START + cp);
    } else {
      out += char;
    }
  }
  return out;
}

/** Decode every tag character in `text`, leaving all other characters alone. */
export function decodeInvisibleTags(text: string): string {
  let out = '';
  for (const char of text) {
    const cp = char.codePointAt(0) ?? -1;
    out += isTagChar(cp) ? decodeTagChar(cp) : char;
  }
  return out;
}

/** Remove every tag character. Use before sending untrusted text to a model. */
export function stripInvisibleTags(text: string): string {
  let out = '';
  for (const char of text) {
    if (!isTagChar(char.codePointAt(0) ?? -1)) out += char;
  }
  return out;
}

/** Collapse the invisibles we do not decode, so they cannot hide payloads. */
function sanitizeNonTag(text: string): string {
  let out = '';
  for (const char of text) {
    const cp = char.codePointAt(0) ?? -1;
    out += OTHER_INVISIBLE.has(cp) ? (BIDI_OVERRIDES.has(cp) ? ' ' : '') : char;
  }
  return out;
}

/**
 * Strip every invisible character we know how to detect, tag block included.
 * The safe form to hand to a model or a reviewer.
 */
export function sanitizeInvisibleText(text: string): string {
  return sanitizeNonTag(stripInvisibleTags(text));
}

function severityFor(
  tagRuns: TagRun[],
  decodedCharCount: number,
  otherInvisible: OtherInvisible[],
  hasBidiOverride: boolean
): { severity: InvisibleSeverity; reason: string } {
  if (tagRuns.length === 0) {
    if (hasBidiOverride) {
      return {
        severity: 'high',
        reason: 'Bidi override present — text reorders visually, so what you read is not what is stored.',
      };
    }
    if (otherInvisible.length > 0) {
      const names = [...new Set(otherInvisible.map((c) => c.name))].join(', ');
      return {
        severity: 'medium',
        reason: `Zero-width or invisible characters present (${names}). They carry no instruction but can hide one or break parsing.`,
      };
    }
    return { severity: 'none', reason: 'No invisible characters detected.' };
  }

  const total = tagRuns.reduce((n, r) => n + r.length, 0);
  const plural = tagRuns.length === 1 ? 'run' : 'runs';
  if (decodedCharCount >= 40) {
    return {
      severity: 'critical',
      reason: `${tagRuns.length} invisible tag run${tagRuns.length === 1 ? '' : 's'} hiding ${decodedCharCount} characters of text. Invisible to a human, fully readable by a model — treat the decoded payload as untrusted instructions.`,
    };
  }
  if (decodedCharCount >= 12) {
    return {
      severity: 'high',
      reason: `${total} tag character${total === 1 ? '' : 's'} in ${tagRuns.length} ${plural} hiding ${decodedCharCount} characters. Long enough to be an instruction.`,
    };
  }
  if (decodedCharCount >= 1) {
    return {
      severity: 'medium',
      reason: `${total} tag character${total === 1 ? '' : 's'} in ${tagRuns.length} ${plural} hiding ${decodedCharCount} character${decodedCharCount === 1 ? '' : 's'}. Too short to be a full instruction, but invisible content should not be in source text.`,
    };
  }
  return { severity: 'low', reason: `${tagRuns.length} ${plural} of tag characters with no decodable content.` };
}

/**
 * Scan text for invisible prompt injection.
 *
 * Returns the decoded payload plus the exact offsets of every hidden run, so a
 * reviewer can highlight the hidden region in the original document instead of
 * guessing where it was.
 */
export function scanInvisibleText(input: string): InvisibleScan {
  const text = input ?? '';
  const tagRuns: TagRun[] = [];
  const otherCounts = new Map<number, { count: number; firstIndex: number }>();

  let runStart = -1;
  let runDecoded = '';

  const flushRun = (end: number) => {
    if (runStart === -1) return;
    tagRuns.push({ start: runStart, end, length: end - runStart, decoded: runDecoded });
    runStart = -1;
    runDecoded = '';
  };

  // Iterate by code point so astral characters do not desync the offsets.
  let index = 0;
  for (const char of text) {
    const cp = char.codePointAt(0) ?? -1;
    if (isTagChar(cp)) {
      if (runStart === -1) runStart = index;
      runDecoded += decodeTagChar(cp);
    } else {
      flushRun(index);
      if (OTHER_INVISIBLE.has(cp)) {
        const seen = otherCounts.get(cp);
        if (seen) seen.count += 1;
        else otherCounts.set(cp, { count: 1, firstIndex: index });
      }
    }
    index += char.length;
  }
  flushRun(index);

  const otherInvisible: OtherInvisible[] = [...otherCounts.entries()]
    .map(([codePoint, v]) => ({
      codePoint,
      name: OTHER_INVISIBLE_NAMES[codePoint] ?? `U+${codePoint.toString(16).toUpperCase()}`,
      count: v.count,
      firstIndex: v.firstIndex,
      bidiOverride: BIDI_OVERRIDES.has(codePoint),
    }))
    .sort((a, b) => a.firstIndex - b.firstIndex);

  const decodedPayload = tagRuns.map((r) => r.decoded).join('');
  // Count code points, not UTF-16 units: the payload may be non-ASCII.
  const decodedCharCount = [...decodedPayload].length;
  const tagCharCount = tagRuns.reduce((n, r) => n + r.length, 0);
  const hasBidiOverride = otherInvisible.some((c) => c.bidiOverride);
  const { severity, reason } = severityFor(tagRuns, decodedCharCount, otherInvisible, hasBidiOverride);

  return {
    hasTagCharacters: tagRuns.length > 0,
    tagCharCount,
    tagRuns,
    decodedPayload,
    otherInvisible,
    hasBidiOverride,
    decodedCharCount,
    severity,
    reason,
    inputLength: text.length,
  };
}

/**
 * Wrap `fn` so that any invisible characters in its input are stripped first.
 * For use on untrusted text before it reaches a model or a diff.
 */
export function withInvisibleStripped<T extends (...args: never[]) => unknown>(
  fn: T
): (...args: never[]) => ReturnType<T> {
  return ((...args: never[]) => {
    const cleaned = args.map((a) => (typeof a === 'string' ? sanitizeInvisibleText(a) : a));
    return fn(...(cleaned as never[]));
  }) as (...args: never[]) => ReturnType<T>;
}

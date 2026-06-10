// api/src/lib/file2txt/types.ts

/** The file kinds SP2 understands. */
export type SupportedKind = 'text' | 'html' | 'image' | 'pdf' | 'docx';

/** How the text was obtained, for provenance. */
export type ExtractMethod = 'inline' | 'ai-vision' | 'bridge';

/** Uniform return shape from every parser + the dispatcher. */
export interface ExtractResult {
  text: string;
  meta: {
    kind: SupportedKind;
    method: ExtractMethod;
    pages?: number;
    truncated: boolean;
  };
}

/** Cap extracted text to keep the downstream extractor bounded (matches
 *  report-parser's MAX_TEXT_LENGTH). */
export const MAX_TEXT_LENGTH = 100_000;

// api/src/lib/file2txt/index.ts
import type { Env } from '../../env';
import type { ExtractResult } from './types';
import { sniffKind } from './mime';
import { extractTextOrHtml } from './text-html';
import { extractImage } from './image-ocr';
import { extractViaBridge } from './bridge';

export * from './types';
export { BridgeUnavailable } from './bridge';

/** Thrown when the uploaded file is outside the allow-list. Handler → 415. */
export class UnsupportedFile extends Error {
  constructor() {
    super('unsupported file type');
    this.name = 'UnsupportedFile';
  }
}

/** Lowercase hex SHA-256 of the given bytes (for deterministic itemRef). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Convert uploaded bytes to text, dispatching by sniffed kind. */
export async function extractText(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
  env: Env
): Promise<ExtractResult> {
  const kind = sniffKind(bytes, contentType, filename);
  if (kind === null) throw new UnsupportedFile();

  switch (kind) {
    case 'text':
    case 'html':
      return extractTextOrHtml(bytes, kind);
    case 'image':
      return extractImage(bytes, contentType, filename, env);
    case 'pdf':
    case 'docx':
      // CPU-bound parsing is infeasible on the free 10ms CPU cap → bridge only.
      return extractViaBridge(bytes, contentType, filename, env, kind);
  }
}

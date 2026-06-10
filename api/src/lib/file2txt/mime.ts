import type { SupportedKind } from './types';

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

/**
 * Decide the file kind from magic bytes first, then content-type / filename.
 * Returns null for anything outside the SP2 allow-list.
 */
export function sniffKind(bytes: Uint8Array, contentType: string, filename: string): SupportedKind | null {
  const ct = (contentType || '').toLowerCase();
  const name = (filename || '').toLowerCase();

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image'; // PNG
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image'; // JPEG

  // .docx is a ZIP (PK\x03\x04). Only treat ZIPs as docx when the name/type says so.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (name.endsWith('.docx') || ct.includes('officedocument.wordprocessingml')) return 'docx';
    return null; // some other zip — unsupported
  }

  if (ct.includes('text/html') || name.endsWith('.html') || name.endsWith('.htm')) return 'html';
  if (ct.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) return 'text';

  // PDFs/images sometimes arrive without recognizable leading bytes but with a clear type.
  if (ct === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (ct.startsWith('image/')) return 'image';

  return null;
}

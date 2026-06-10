import { describe, it, expect } from 'vitest';
import { sniffKind } from '../../../src/lib/file2txt/mime';

function bytes(...b: number[]): Uint8Array {
  return new Uint8Array(b);
}

describe('sniffKind', () => {
  it('detects PDF from %PDF- magic', () => {
    expect(sniffKind(bytes(0x25, 0x50, 0x44, 0x46, 0x2d), 'application/pdf', 'r.pdf')).toBe('pdf');
  });
  it('detects PNG from magic', () => {
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47), 'image/png', 'a.png')).toBe('image');
  });
  it('detects JPEG from magic', () => {
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg', 'a.jpg')).toBe('image');
  });
  it('detects docx from PK zip magic + .docx name', () => {
    expect(sniffKind(bytes(0x50, 0x4b, 0x03, 0x04), '', 'report.docx')).toBe('docx');
  });
  it('detects html by content-type', () => {
    expect(sniffKind(bytes(0x3c, 0x21), 'text/html', 'p.html')).toBe('html');
  });
  it('falls back to text for plain content', () => {
    expect(sniffKind(bytes(0x68, 0x69), 'text/plain', 'n.txt')).toBe('text');
  });
  it('returns null for unsupported (e.g. zip that is not docx)', () => {
    expect(sniffKind(bytes(0x50, 0x4b, 0x03, 0x04), 'application/zip', 'a.zip')).toBeNull();
  });
});

// api/test/lib/file2txt/index.test.ts
import { describe, it, expect } from 'vitest';
import { extractText, sha256Hex, UnsupportedFile } from '../../../src/lib/file2txt';
import { BridgeUnavailable } from '../../../src/lib/file2txt/bridge';

const enc = new TextEncoder();

describe('extractText dispatcher', () => {
  it('handles plain text in-Worker', async () => {
    const r = await extractText(enc.encode('hello 1.2.3.4'), 'text/plain', 'n.txt', {} as never);
    expect(r.text).toContain('1.2.3.4');
    expect(r.meta.method).toBe('inline');
  });

  it('routes PDF to the bridge → BridgeUnavailable when unset', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expect(extractText(pdf, 'application/pdf', 'r.pdf', {} as never)).rejects.toBeInstanceOf(BridgeUnavailable);
  });

  it('throws UnsupportedFile for an unknown type', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    await expect(extractText(zip, 'application/zip', 'a.zip', {} as never)).rejects.toBeInstanceOf(UnsupportedFile);
  });
});

describe('sha256Hex', () => {
  it('hashes deterministically', async () => {
    const a = await sha256Hex(enc.encode('abc'));
    expect(a).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

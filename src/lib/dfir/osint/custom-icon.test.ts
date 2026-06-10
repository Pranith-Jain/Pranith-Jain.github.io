// src/lib/dfir/osint/custom-icon.test.ts
import { describe, it, expect } from 'vitest';
import { validateIconFile, ICON_MAX_BYTES, ICON_ALLOWED_TYPES } from './custom-icon';

function fakeFile(type: string, size: number): File {
  return { type, size, name: 'icon' } as File;
}

describe('validateIconFile', () => {
  it('accepts png/jpeg/webp under the size cap', () => {
    for (const t of ICON_ALLOWED_TYPES) {
      expect(validateIconFile(fakeFile(t, 1000)).ok).toBe(true);
    }
  });
  it('rejects svg explicitly', () => {
    const r = validateIconFile(fakeFile('image/svg+xml', 100));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/svg/i);
  });
  it('rejects non-image types', () => {
    expect(validateIconFile(fakeFile('application/pdf', 100)).ok).toBe(false);
  });
  it('rejects files over the size cap', () => {
    expect(validateIconFile(fakeFile('image/png', ICON_MAX_BYTES + 1)).ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  courseIdFromPath,
  courseUrl,
  normalizeCourseId,
  parseLibraryImport,
  serializeLibrary,
} from './anarchy-library';

describe('anarchy-library helpers', () => {
  it('normalizes course ids to 4 digits', () => {
    expect(normalizeCourseId('1')).toBe('0001');
    expect(normalizeCourseId('0001')).toBe('0001');
    expect(normalizeCourseId(' 42 ')).toBe('0042');
    expect(normalizeCourseId(null)).toBeNull();
    expect(normalizeCourseId('abc')).toBeNull();
  });

  it('builds shareable deep links', () => {
    expect(courseUrl('1', 'https://example.com')).toBe('https://example.com/anarchy/c/0001');
    expect(courseUrl('0042', 'https://example.com/')).toBe('https://example.com/anarchy/c/0042');
  });

  it('extracts course ids from deep-link paths', () => {
    expect(courseIdFromPath('/anarchy/c/0001')).toBe('0001');
    expect(courseIdFromPath('/anarchy/c/7')).toBe('0007');
    expect(courseIdFromPath('/anarchy')).toBeNull();
    expect(courseIdFromPath('/anarchy/c/')).toBeNull();
  });

  it('round-trips export/import and drops invalid entries', () => {
    const text = serializeLibrary(['0001', '0042'], { '0001': 'done' });
    expect(parseLibraryImport(text)).toEqual({ bookmarks: ['0001', '0042'], progress: { '0001': 'done' } });
    expect(parseLibraryImport('{"bookmarks":["1","xx"],"progress":{"2":"doing","3":"bogus"}}')).toEqual({
      bookmarks: ['0001'],
      progress: { '0002': 'doing' },
    });
  });

  it('rejects non-library payloads', () => {
    expect(() => parseLibraryImport('not json')).toThrow();
    expect(() => parseLibraryImport('42')).toThrow();
  });
});

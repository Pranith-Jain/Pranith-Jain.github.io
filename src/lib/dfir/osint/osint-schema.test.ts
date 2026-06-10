// src/lib/dfir/osint/osint-schema.test.ts
import { describe, it, expect } from 'vitest';
import { isOsintProject, emptyProject, type OsintProject } from './osint-schema';

describe('emptyProject', () => {
  it('creates a valid v1 project', () => {
    const p = emptyProject('Case 1');
    expect(p.schemaVersion).toBe(1);
    expect(p.name).toBe('Case 1');
    expect(p.identifiers).toEqual([]);
    expect(p.pins).toEqual([]);
    expect(p.links).toEqual([]);
    expect(isOsintProject(p)).toBe(true);
  });
});

describe('isOsintProject', () => {
  it('accepts a well-formed project', () => {
    expect(isOsintProject(emptyProject('x'))).toBe(true);
  });
  it('rejects wrong schemaVersion', () => {
    expect(isOsintProject({ ...emptyProject('x'), schemaVersion: 2 })).toBe(false);
  });
  it('rejects non-objects and missing arrays', () => {
    expect(isOsintProject(null)).toBe(false);
    expect(isOsintProject('nope')).toBe(false);
    expect(isOsintProject({ schemaVersion: 1, name: 'x' })).toBe(false);
  });
  it('rejects a pin with non-numeric coords', () => {
    const p = emptyProject('x');
    (p.pins as unknown[]).push({ id: '1', lat: 'a', lng: 0, label: 'l', iconKey: 'k', color: '#fff' });
    expect(isOsintProject(p)).toBe(false);
  });
});

// src/lib/dfir/osint/osint-schema.test.ts
import { describe, it, expect } from 'vitest';
import { isOsintProject, emptyProject } from './osint-schema';

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
  it('generates a non-empty, unique id per project', () => {
    const a = emptyProject('x');
    const b = emptyProject('x');
    expect(typeof a.id).toBe('string');
    expect(a.id.length).toBeGreaterThan(0);
    expect(a.id).not.toBe(b.id);
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
  it('rejects a pin with an XSS color string', () => {
    const p = emptyProject('x');
    (p.pins as unknown[]).push({
      id: '1',
      lat: 0,
      lng: 0,
      label: 'l',
      iconKey: 'k',
      color: 'red</span><img src=x onerror=alert(1)>',
    });
    expect(isOsintProject(p)).toBe(false);
  });
  it('accepts a pin with a valid hex color', () => {
    const p = emptyProject('x');
    (p.pins as unknown[]).push({ id: '1', lat: 0, lng: 0, label: 'l', iconKey: 'k', color: '#2c3ee5' });
    expect(isOsintProject(p)).toBe(true);
  });
  it('rejects a project missing its id', () => {
    const { id: _omit, ...noId } = emptyProject('x');
    void _omit;
    expect(isOsintProject(noId)).toBe(false);
  });
  it('rejects an identifier whose field value is not a string', () => {
    const p = emptyProject('x');
    (p.identifiers as unknown[]).push({ id: '1', type: 'phone', fields: { number: 123 } });
    expect(isOsintProject(p)).toBe(false);
  });
  it('rejects an identifier whose fields is an array', () => {
    const p = emptyProject('x');
    (p.identifiers as unknown[]).push({ id: '1', type: 'phone', fields: [] });
    expect(isOsintProject(p)).toBe(false);
  });
});

// src/lib/dfir/osint/identifier-types.test.ts
import { describe, it, expect } from 'vitest';
import { IDENTIFIER_TYPES, getIdentifierType, IDENTIFIER_CATEGORIES } from './identifier-types';

describe('IDENTIFIER_TYPES registry', () => {
  it('ships at least 20 types', () => {
    expect(IDENTIFIER_TYPES.length).toBeGreaterThanOrEqual(20);
  });
  it('every type is complete and uses a known category', () => {
    for (const t of IDENTIFIER_TYPES) {
      expect(t.type).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(IDENTIFIER_CATEGORIES).toContain(t.category);
      expect(t.fields.length).toBeGreaterThan(0);
      for (const f of t.fields) {
        expect(f.key).toBeTruthy();
        expect(f.label).toBeTruthy();
      }
    }
  });
  it('has no duplicate type keys', () => {
    const keys = IDENTIFIER_TYPES.map((t) => t.type);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('getIdentifierType resolves and falls back to "other"', () => {
    expect(getIdentifierType('instagram')?.type).toBe('instagram');
    expect(getIdentifierType('does-not-exist').type).toBe('other');
  });
});

// src/lib/dfir/osint/osint-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadState, saveProject, parseImport, serializeProject, buildExport, STORE_KEY } from './osint-store';
import { emptyProject } from './osint-schema';

// The global setup mocks localStorage with non-functional vi.fn() stubs.
// Replace it with a real in-memory implementation for these store tests.
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
});

beforeEach(() => localStorage.clear());

describe('saveProject / loadState', () => {
  it('round-trips the current project and stamps updatedAt', () => {
    const p = emptyProject('Case A');
    saveProject(p, 1000);
    const state = loadState();
    expect(state.current?.name).toBe('Case A');
    expect(state.current?.updatedAt).toBe(1000);
  });

  it('returns empty state when nothing stored', () => {
    expect(loadState()).toEqual({ current: null, recents: [] });
  });

  it('returns empty state on corrupt JSON', () => {
    localStorage.setItem(STORE_KEY, '{not json');
    expect(loadState()).toEqual({ current: null, recents: [] });
  });

  it('caps recents at 5, most-recent first', () => {
    for (let i = 1; i <= 7; i++) saveProject(emptyProject('C' + i), i);
    const { recents } = loadState();
    expect(recents).toHaveLength(5);
    expect(recents[0].name).toBe('C7');
  });

  it('keeps two same-name projects with distinct ids as separate recents', () => {
    const a = emptyProject('Untitled case');
    const b = emptyProject('Untitled case');
    expect(a.id).not.toBe(b.id);
    saveProject(a, 1);
    saveProject(b, 2);
    const { recents } = loadState();
    expect(recents).toHaveLength(2);
    expect(new Set(recents.map((r) => r.project.id)).size).toBe(2);
  });
});

describe('parseImport', () => {
  it('parses a valid exported project (legacy file with no icons → icons {})', () => {
    const json = serializeProject(emptyProject('Imp'));
    const out = parseImport(json);
    expect(out?.project.name).toBe('Imp');
    expect(out?.icons).toEqual({});
  });
  it('returns null for malformed or wrong-version JSON', () => {
    expect(parseImport('{"schemaVersion":2}')).toBeNull();
    expect(parseImport('garbage')).toBeNull();
  });
  it('round-trips embedded custom icons and strips the envelope key from the project', () => {
    const p = emptyProject('WithIcon');
    p.identifiers = [{ id: 'i1', type: 'instagram', fields: { handle: 'a' }, customIconId: 'ic1' }];
    const json = buildExport(p, { ic1: 'data:image/png;base64,AAAA', unused: 'data:image/png;base64,ZZZZ' });
    const out = parseImport(json);
    expect(out?.project.name).toBe('WithIcon');
    expect(out?.icons).toEqual({ ic1: 'data:image/png;base64,AAAA' }); // only referenced icon
    expect((out?.project as Record<string, unknown>).icons).toBeUndefined(); // envelope key stripped
  });
});

describe('buildExport', () => {
  it('includes only the icons referenced by the project identifiers', () => {
    const p = emptyProject('X');
    p.identifiers = [
      { id: 'i1', type: 'instagram', fields: {}, customIconId: 'ic1' },
      { id: 'i2', type: 'phone', fields: {} },
    ];
    const json = buildExport(p, { ic1: 'A', ic2: 'B' });
    const parsed = JSON.parse(json);
    expect(parsed.icons).toEqual({ ic1: 'A' });
  });
  it('emits an empty icons map when no identifier has a custom icon', () => {
    const json = buildExport(emptyProject('X'), { ic1: 'A' });
    expect(JSON.parse(json).icons).toEqual({});
  });
});

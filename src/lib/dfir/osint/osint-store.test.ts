// src/lib/dfir/osint/osint-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadState, saveProject, parseImport, serializeProject, STORE_KEY } from './osint-store';
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

  it('keeps two same-name projects with different ids as separate recents', () => {
    // emptyProject always generates a new uuid, so two 'Untitled case' calls have different ids
    saveProject(emptyProject('Untitled case'), 1);
    saveProject(emptyProject('Untitled case'), 2);
    const { recents } = loadState();
    expect(recents).toHaveLength(2);
    expect(recents[0].project.id).not.toBe(recents[1].project.id);
  });
});

describe('parseImport', () => {
  it('parses a valid exported project', () => {
    const json = serializeProject(emptyProject('Imp'));
    expect(parseImport(json)?.name).toBe('Imp');
  });
  it('returns null for malformed or wrong-version JSON', () => {
    expect(parseImport('{"schemaVersion":2}')).toBeNull();
    expect(parseImport('garbage')).toBeNull();
  });
});

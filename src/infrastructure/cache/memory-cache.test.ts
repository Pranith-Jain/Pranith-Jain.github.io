import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// setup.ts replaces window.sessionStorage with bare vi.fn()s (property
// non-configurable on window), so back those functions with a real Map
// for this file — the module under test talks to the same object.
const backing = new Map<string, string>();
const ss = window.sessionStorage as unknown as Record<string, (k?: string, v?: string) => unknown>;
ss.getItem = (k?: string) => (k !== undefined && backing.has(k) ? backing.get(k) : null);
ss.setItem = (k?: string, v?: string) => {
  if (k !== undefined) backing.set(k, String(v));
};
ss.removeItem = (k?: string) => {
  if (k !== undefined) backing.delete(k);
};
ss.clear = () => backing.clear();

async function freshCache() {
  vi.resetModules();
  return (await import('./memory-cache')).memoryCache;
}

interface PersistedEntry {
  data: unknown;
  fetchedAt: number;
  ttl: number;
  jsonBytes?: number;
}

function snapshot(): Array<[string, PersistedEntry]> {
  const raw = backing.get('mc:v1');
  expect(raw).toBeDefined();
  return JSON.parse(raw as string) as Array<[string, PersistedEntry]>;
}

beforeEach(() => {
  vi.useFakeTimers();
  backing.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('memory-cache persistence', () => {
  it('debounces the snapshot write and memoizes jsonBytes at set time', async () => {
    const cache = await freshCache();
    const setItem = vi.spyOn(window.sessionStorage, 'setItem');

    cache.set('a', { n: 1 }, 60_000);
    expect(setItem).not.toHaveBeenCalled(); // still inside the debounce window

    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledTimes(1);

    const entries = snapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.[0]).toBe('a');
    expect(entries[0]?.[1].jsonBytes).toBe(JSON.stringify({ n: 1 }).length);
  });

  it('excludes non-serializable payloads without poisoning the snapshot', async () => {
    const cache = await freshCache();
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    cache.set('circ', circular, 60_000);
    cache.set('ok', { b: 2 }, 60_000);
    vi.advanceTimersByTime(500);

    const keys = snapshot().map(([k]) => k);
    expect(keys).toContain('ok');
    expect(keys).not.toContain('circ');
  });

  it('hydrates a fresh snapshot on import and backfills jsonBytes', async () => {
    backing.set('mc:v1', JSON.stringify([['k', { data: { x: 1 }, fetchedAt: Date.now(), ttl: 60_000 }]]));

    const cache = await freshCache();
    expect(cache.get('k')).toEqual({ data: { x: 1 }, fresh: true });

    // A later persist re-writes the hydrated entry with the memoized size.
    cache.set('other', { y: 2 }, 60_000);
    vi.advanceTimersByTime(500);
    const hydrated = snapshot().find(([k]) => k === 'k');
    expect(hydrated?.[1].jsonBytes).toBe(JSON.stringify({ x: 1 }).length);
  });

  it('never hydrates an expired snapshot entry', async () => {
    backing.set('mc:v1', JSON.stringify([['stale', { data: 1, fetchedAt: Date.now() - 100_000, ttl: 60_000 }]]));

    const cache = await freshCache();
    expect(cache.get('stale')).toBeNull();
  });

  it('clear() empties both the store and sessionStorage', async () => {
    const cache = await freshCache();
    cache.set('a', 1, 60_000);
    vi.advanceTimersByTime(500);
    expect(backing.has('mc:v1')).toBe(true);

    cache.clear();
    expect(cache.get('a')).toBeNull();
    vi.advanceTimersByTime(500);
    expect(backing.get('mc:v1')).toBe('[]');
  });
});

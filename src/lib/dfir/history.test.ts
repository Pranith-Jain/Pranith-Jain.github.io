import { describe, it, expect, beforeEach } from 'vitest';
import { recordHistory, readHistory, clearHistory } from './history';

// Use a real in-memory localStorage implementation so history read/write works in tests
const store: Record<string, string> = {};
const realLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
};
Object.defineProperty(window, 'localStorage', { value: realLocalStorage, writable: true, configurable: true });

beforeEach(() => clearHistory());

describe('history', () => {
  it('starts empty', () => {
    expect(readHistory()).toEqual([]);
  });

  it('records and reads', () => {
    recordHistory({ tool: 'ioc', indicator: '8.8.8.8', verdict: 'clean', score: 0 });
    expect(readHistory()).toHaveLength(1);
    expect(readHistory()[0].tool).toBe('ioc');
  });

  it('caps at 20 entries (FIFO)', () => {
    for (let i = 0; i < 30; i++) recordHistory({ tool: 'ioc', indicator: `ip-${i}`, verdict: 'clean', score: 0 });
    const h = readHistory();
    expect(h).toHaveLength(20);
    // Most recent first
    expect(h[0].indicator).toBe('ip-29');
    expect(h[19].indicator).toBe('ip-10');
  });

  it('clearHistory empties the store', () => {
    recordHistory({ tool: 'ioc', indicator: 'a', verdict: 'clean', score: 0 });
    clearHistory();
    expect(readHistory()).toEqual([]);
  });
});

// src/lib/dfir/multi-search/platforms.test.ts

import { describe, it, expect } from 'vitest';
import { detectInputKind, fillTemplate, PLATFORMS } from './platforms';

describe('detectInputKind', () => {
  it.each([
    ['user@example.com', 'email'],
    ['8.8.8.8', 'ip'],
    ['example.com', 'domain'],
    ['https://example.com/x', 'url'],
    ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'hash'],
    ['CVE-2024-12345', 'cve'],
    ['bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'btc'],
    ['octocat', 'username'],
    ['osint blog', 'q'],
    ['', 'q'],
  ])('detects %s as %s', (input, expected) => {
    expect(detectInputKind(input)).toBe(expected);
  });

  it('hashes are 32/40/64 chars hex', () => {
    expect(detectInputKind('a'.repeat(32))).toBe('hash');
    expect(detectInputKind('a'.repeat(40))).toBe('hash');
    expect(detectInputKind('a'.repeat(64))).toBe('hash');
    expect(detectInputKind('a'.repeat(33))).toBe('q');
  });
});

describe('fillTemplate', () => {
  it('substitutes placeholders', () => {
    expect(fillTemplate('https://x.com/?q={q}&u={username}', { q: 'hello world', username: 'octo' }))
      .toBe('https://x.com/?q=hello%20world&u=octo');
  });
  it('leaves unfilled placeholders intact', () => {
    expect(fillTemplate('https://x.com/?q={q}&u={username}', { q: 'hi' }))
      .toBe('https://x.com/?q=hi&u={username}');
  });
});

describe('PLATFORMS registry', () => {
  it('has 60+ platforms', () => {
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(60);
  });
  it('every platform has a unique id', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every required placeholder exists in the URL template', () => {
    for (const p of PLATFORMS) {
      for (const r of p.required) {
        expect(p.url).toContain(`{${r}}`);
      }
    }
  });
});

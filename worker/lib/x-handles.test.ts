import { describe, it, expect } from 'vitest';
import {
  CTI_CLAIM_HANDLES,
  X_DIRECT_ACCOUNTS,
  X_ACCOUNTS,
  CLAIM_HANDLES_LOWER,
} from '../../api/src/lib/x-handles';

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

describe('x-handles canonical registry', () => {
  it('every handle is a valid X screen name (1-15 chars, A-Za-z0-9_)', () => {
    for (const h of X_ACCOUNTS) expect(h, h).toMatch(HANDLE_RE);
  });

  it('contains no corrupted/placeholder handles', () => {
    const lower = X_ACCOUNTS.map((h) => h.toLowerCase());
    for (const bad of ['darkleaks', 'dnaborhacks', 'paborhack']) {
      expect(lower, bad).not.toContain(bad);
    }
  });

  it('X_ACCOUNTS is exactly claim handles followed by direct accounts', () => {
    expect(X_ACCOUNTS).toEqual([...CTI_CLAIM_HANDLES, ...X_DIRECT_ACCOUNTS]);
  });

  it('has no duplicate handles (case-insensitive)', () => {
    const lower = X_ACCOUNTS.map((h) => h.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it('claim handles and direct accounts are disjoint', () => {
    const direct = new Set(X_DIRECT_ACCOUNTS.map((h) => h.toLowerCase()));
    for (const h of CTI_CLAIM_HANDLES) expect(direct.has(h.toLowerCase()), h).toBe(false);
  });

  it('CLAIM_HANDLES_LOWER mirrors the claim handles lowercased', () => {
    expect(CLAIM_HANDLES_LOWER.size).toBe(CTI_CLAIM_HANDLES.length);
    for (const h of CTI_CLAIM_HANDLES) expect(CLAIM_HANDLES_LOWER.has(h.toLowerCase())).toBe(true);
  });

  it('includes the core CTI/breach feeds', () => {
    const lower = X_ACCOUNTS.map((h) => h.toLowerCase());
    for (const h of ['falconfeedsio', 'dailydarkweb', 'darkwebinformer']) {
      expect(lower, h).toContain(h);
    }
  });
});

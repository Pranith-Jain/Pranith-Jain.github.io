import { useEffect, useState } from 'react';

/**
 * Shared analyst watchlist hook. The localStorage key originates on the
 * /threatintel/darkweb feed (DarkWeb.tsx) — that page is the canonical place to
 * add/remove terms. Every snapshot panel READS the list and highlights
 * items mentioning any of those terms, but doesn't modify it.
 *
 * Cross-tab `storage` events keep the list in sync. Same-tab writes don't
 * fire `storage`, so we also re-poll once after mount with a 1 s delay —
 * covers the case where the user edits the watchlist on /threatintel/darkweb in
 * one route, navigates here, and the change should reflect on next render.
 */

export const WATCHLIST_KEY = 'dfir.darkweb.watchlist';

export function loadWatchlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
  } catch {
    return [];
  }
}

/** Returns the list of watchlist terms (case-insensitive) found in the haystack. */
export function watchHits(haystack: string, watchlist: string[]): string[] {
  if (watchlist.length === 0) return [];
  const lc = haystack.toLowerCase();
  return watchlist.filter((term) => lc.includes(term.toLowerCase()));
}

export function useWatchlist(): string[] {
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === WATCHLIST_KEY) setWatchlist(loadWatchlist());
    };
    window.addEventListener('storage', onStorage);
    const t = setTimeout(() => setWatchlist(loadWatchlist()), 1000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearTimeout(t);
    };
  }, []);

  return watchlist;
}

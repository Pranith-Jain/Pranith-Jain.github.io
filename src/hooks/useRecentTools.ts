import { useCallback, useEffect, useState } from 'react';
import { clearVisits, recordVisit, type RecentEntry } from '../lib/recentTools';

/**
 * React hook around the localStorage-backed "recently visited" list.
 * The list is read once on mount and re-read on every `pathname`
 * change so the home page reflects navigation that happened in
 * another tab. Returns up to `limit` entries plus a `clear()` helper
 * and an `isHydrated` flag to keep SSR-safe callers quiet.
 */
export function useRecentTools(
  section: 'dfir' | 'threatintel',
  pathname: string,
  limit = 4
): {
  entries: RecentEntry[];
  isHydrated: boolean;
  clear: () => void;
} {
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setEntries(readSlice(section, limit));
    setIsHydrated(true);
  }, [section, limit, pathname]);

  const clear = useCallback(() => {
    clearVisits(section);
    setEntries([]);
  }, [section]);

  return { entries, isHydrated, clear };
}

export { recordVisit };

function readSlice(section: 'dfir' | 'threatintel', limit: number): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`pj.recent.${section}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentEntry =>
          e &&
          typeof e === 'object' &&
          typeof e.path === 'string' &&
          typeof e.label === 'string' &&
          typeof e.at === 'number'
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}

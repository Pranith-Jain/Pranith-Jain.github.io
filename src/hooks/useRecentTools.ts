import { useCallback, useEffect, useState } from 'react';
import { clearVisits, readVisits, recordVisit, type RecentEntry } from '../lib/recentTools';

/**
 * React hook around the localStorage-backed "recently visited" list.
 * The list is read once on mount and re-read on every `pathname`
 * change so the home page reflects navigation that happened in
 * another tab. Returns up to `limit` entries plus a `clear()` helper
 * and an `isHydrated` flag to keep SSR-safe callers quiet.
 */
export function useRecentTools(
  section: 'dfir' | 'threatintel' | 'radar',
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
    setEntries(readVisits(section, limit));
    setIsHydrated(true);
  }, [section, limit, pathname]);

  const clear = useCallback(() => {
    clearVisits(section);
    setEntries([]);
  }, [section]);

  return { entries, isHydrated, clear };
}

export { recordVisit };

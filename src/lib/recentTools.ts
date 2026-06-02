/**
 * Local "recently visited" tool tracker.
 *
 * On every route change the AppShell calls `record(pathname, label)`. A
 * small list of the most-recently-visited unique paths (default cap 8)
 * is persisted to localStorage and exposed via `useRecentTools(...)` so
 * the home pages can surface a "Recently used" QuickActions row above
 * the curated default.
 *
 * Privacy note: the entire app is "no tracking, no analytics" — this
 * stays on-device, never leaves the browser, and the data is wiped if
 * the user clears site storage. The localStorage key is namespaced
 * `pj.recent.<section>` so a DFIR visitor doesn't see Threat Intel
 * visits in their DFIR "Recently used" row.
 */

const STORAGE_PREFIX = 'pj.recent.';
const MAX_ENTRIES = 12;
const RECENT_LIMIT = 4;

export interface RecentEntry {
  path: string;
  label: string;
  /** epoch ms — used to dedupe and to render "2 min ago" hints. */
  at: number;
}

function key(section: 'dfir' | 'threatintel'): string {
  return `${STORAGE_PREFIX}${section}`;
}

function safeParse(raw: string | null): RecentEntry[] {
  if (!raw) return [];
  try {
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
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function read(section: 'dfir' | 'threatintel'): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return safeParse(window.localStorage.getItem(key(section)));
  } catch {
    return [];
  }
}

function write(section: 'dfir' | 'threatintel', entries: RecentEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(section), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* quota / disabled — silent. */
  }
}

/**
 * Record a page visit. Bumps duplicates to the front of the list
 * rather than appending, so `/dfir/ioc-check` re-visited moves to slot 1
 * and the original entry is removed. Section-prefixed keys keep the
 * two home pages independent.
 */
export function recordVisit(section: 'dfir' | 'threatintel', path: string, label: string): void {
  if (typeof window === 'undefined') return;
  if (!path || !label) return;
  if (path === '/' || path === '/dfir' || path === '/threatintel') return;
  const current = read(section);
  const filtered = current.filter((e) => e.path !== path);
  const next: RecentEntry[] = [{ path, label, at: Date.now() }, ...filtered].slice(0, MAX_ENTRIES);
  write(section, next);
}

export function clearVisits(section: 'dfir' | 'threatintel'): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key(section));
  } catch {
    /* silent */
  }
}

export const RECENT_LIMIT_DEFAULT = RECENT_LIMIT;

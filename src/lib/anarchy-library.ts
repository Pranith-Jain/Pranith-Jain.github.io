/**
 * Anarchy personal library — pure helpers for the Phase 3 client-side
 * bookmarks + progress layer (localStorage, no backend).
 *
 * Kept in its own module so the logic is unit-testable without mounting
 * the Anarchy page (see anarchy-library.test.ts).
 */

export type AnarchyProgress = 'doing' | 'done';

export const ANARCHY_BOOKMARKS_KEY = 'anarchy:bookmarks:v1';
export const ANARCHY_PROGRESS_KEY = 'anarchy:progress:v1';

/** Normalize a course id from URL or manifest to the 4-digit form ("1" → "0001"). */
export function normalizeCourseId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).trim().replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(4, '0');
}

/** Shareable deep link for a course. Origin-aware so previews share the same host. */
export function courseUrl(id: string, origin?: string): string {
  const base = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  return `${base}/anarchy/c/${normalizeCourseId(id) ?? id}`;
}

/** Extract a course id from an /anarchy/c/:id pathname (null when not a deep link). */
export function courseIdFromPath(pathname: string): string | null {
  const m = /^\/anarchy\/c\/([^/?#]+)/i.exec(pathname);
  return m ? normalizeCourseId(m[1]) : null;
}

function readStorage(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* private-mode / quota — library simply doesn't persist */
  }
}

export function loadBookmarks(): string[] {
  const raw = readStorage(ANARCHY_BOOKMARKS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const v of parsed) {
      const id = normalizeCourseId(typeof v === 'string' ? v : null);
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveBookmarks(ids: string[]): void {
  writeStorage(ANARCHY_BOOKMARKS_KEY, JSON.stringify(ids));
}

export function loadProgress(): Record<string, AnarchyProgress> {
  const raw = readStorage(ANARCHY_PROGRESS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, AnarchyProgress> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const id = normalizeCourseId(k);
      if (id && (v === 'doing' || v === 'done')) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveProgress(progress: Record<string, AnarchyProgress>): void {
  writeStorage(ANARCHY_PROGRESS_KEY, JSON.stringify(progress));
}

export interface AnarchyLibraryExport {
  app: 'anarchy-library';
  version: 1;
  exportedAt: string;
  bookmarks: string[];
  progress: Record<string, AnarchyProgress>;
}

export function serializeLibrary(bookmarks: string[], progress: Record<string, AnarchyProgress>): string {
  const payload: AnarchyLibraryExport = {
    app: 'anarchy-library',
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks,
    progress,
  };
  return JSON.stringify(payload, null, 2);
}

/** Validate + normalize an imported library file. Throws on bad shape. */
export function parseLibraryImport(text: string): { bookmarks: string[]; progress: Record<string, AnarchyProgress> } {
  const parsed = JSON.parse(text) as Partial<AnarchyLibraryExport>;
  if (!parsed || typeof parsed !== 'object') throw new Error('not an anarchy library file');
  const bookmarks = Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
  const progress = parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {};
  const cleanBookmarks: string[] = [];
  for (const v of bookmarks) {
    const id = normalizeCourseId(typeof v === 'string' ? v : null);
    if (id && !cleanBookmarks.includes(id)) cleanBookmarks.push(id);
  }
  const cleanProgress: Record<string, AnarchyProgress> = {};
  for (const [k, v] of Object.entries(progress as Record<string, unknown>)) {
    const id = normalizeCourseId(k);
    if (id && (v === 'doing' || v === 'done')) cleanProgress[id] = v;
  }
  return { bookmarks: cleanBookmarks, progress: cleanProgress };
}

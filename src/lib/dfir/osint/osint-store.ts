// src/lib/dfir/osint/osint-store.ts
import { isOsintProject, type OsintProject } from './osint-schema';

export const STORE_KEY = 'dfir-osint-mapper:v1';
const MAX_RECENTS = 5;

export interface RecentEntry {
  name: string;
  updatedAt: number;
  project: OsintProject;
}
export interface StoreState {
  current: OsintProject | null;
  recents: RecentEntry[];
}

export function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { current: null, recents: [] };
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    const current = parsed.current && isOsintProject(parsed.current) ? parsed.current : null;
    const recents = Array.isArray(parsed.recents)
      ? parsed.recents.filter((r): r is RecentEntry => !!r && isOsintProject((r as RecentEntry).project))
      : [];
    return { current, recents };
  } catch {
    return { current: null, recents: [] };
  }
}

export function saveProject(project: OsintProject, now: number): void {
  const stamped: OsintProject = { ...project, updatedAt: now };
  const { recents } = loadState();
  const next = [
    { name: stamped.name, updatedAt: now, project: stamped },
    ...recents.filter((r) => r.project.id !== stamped.id),
  ].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ current: stamped, recents: next }));
  } catch {
    // quota / private-mode: silently skip persistence, keep in-memory state authoritative
  }
}

export function serializeProject(project: OsintProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseImport(text: string): OsintProject | null {
  try {
    const parsed = JSON.parse(text);
    return isOsintProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

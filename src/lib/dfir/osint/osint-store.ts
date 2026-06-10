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

/**
 * Build a portable .osint.json: the project plus the subset of the custom-icon
 * library actually referenced by its identifiers, so a case opened on another
 * machine keeps its icons. The `icons` envelope key is ignored by isOsintProject.
 */
export function buildExport(project: OsintProject, allIcons: Record<string, string>): string {
  const icons: Record<string, string> = {};
  for (const i of project.identifiers) {
    if (i.customIconId && allIcons[i.customIconId]) icons[i.customIconId] = allIcons[i.customIconId];
  }
  return JSON.stringify({ ...project, icons }, null, 2);
}

/**
 * Parse an imported file into the project and any embedded custom icons.
 * Legacy files without an `icons` key return `icons: {}`. The `icons` envelope
 * key is stripped from the returned project so it isn't persisted back into it.
 */
export function parseImport(text: string): { project: OsintProject; icons: Record<string, string> } | null {
  try {
    const parsed = JSON.parse(text);
    if (!isOsintProject(parsed)) return null;
    const envelope = parsed as OsintProject & { icons?: unknown };
    const icons: Record<string, string> = {};
    if (envelope.icons && typeof envelope.icons === 'object') {
      for (const [k, v] of Object.entries(envelope.icons as Record<string, unknown>)) {
        if (typeof v === 'string') icons[k] = v;
      }
    }
    const project = { ...envelope };
    delete (project as { icons?: unknown }).icons;
    return { project, icons };
  } catch {
    return null;
  }
}

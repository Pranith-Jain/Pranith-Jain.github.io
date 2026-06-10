// Pure, immutable edits to an OsintProject. The page's autosave stamps
// updatedAt and persists; these functions only reshape the data.
import type { OsintProject } from './osint-schema';

/** Remove an identifier and cascade-delete every link that references it. */
export function deleteIdentifier(project: OsintProject, identifierId: string): OsintProject {
  return {
    ...project,
    identifiers: project.identifiers.filter((i) => i.id !== identifierId),
    links: project.links.filter((l) => l.identifierId !== identifierId),
  };
}

/** Remove a pin and cascade-delete every link that references it. */
export function deletePin(project: OsintProject, pinId: string): OsintProject {
  return {
    ...project,
    pins: project.pins.filter((p) => p.id !== pinId),
    links: project.links.filter((l) => l.pinId !== pinId),
  };
}

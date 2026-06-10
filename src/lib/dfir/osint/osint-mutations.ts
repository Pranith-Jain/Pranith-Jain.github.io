// Pure, immutable edits to an OsintProject. The page's autosave stamps
// updatedAt and persists; these functions only reshape the data.
import type { OsintProject, Pin } from './osint-schema';

/** Remove an identifier and cascade-delete every link + saved position for it. */
export function deleteIdentifier(project: OsintProject, identifierId: string): OsintProject {
  let positions = project.positions;
  if (positions && identifierId in positions) {
    positions = { ...positions };
    delete positions[identifierId];
  }
  return {
    ...project,
    identifiers: project.identifiers.filter((i) => i.id !== identifierId),
    links: project.links.filter((l) => l.identifierId !== identifierId),
    positions,
  };
}

/** Replace an identifier's type + fields (preserving id and customIconId). No-op if absent. */
export function updateIdentifier(
  project: OsintProject,
  identifierId: string,
  next: { type: string; fields: Record<string, string> }
): OsintProject {
  return {
    ...project,
    identifiers: project.identifiers.map((i) =>
      i.id === identifierId ? { ...i, type: next.type, fields: next.fields } : i
    ),
  };
}

/** Replace a pin (matched by next.id) wholesale. No-op if absent. */
export function updatePin(project: OsintProject, next: Pin): OsintProject {
  return {
    ...project,
    pins: project.pins.map((p) => (p.id === next.id ? next : p)),
  };
}

/** Store a graph node position for an identifier (immutable merge). */
export function setPosition(project: OsintProject, identifierId: string, pos: { x: number; y: number }): OsintProject {
  return { ...project, positions: { ...project.positions, [identifierId]: pos } };
}

/** Remove a pin and cascade-delete every link that references it. */
export function deletePin(project: OsintProject, pinId: string): OsintProject {
  return {
    ...project,
    pins: project.pins.filter((p) => p.id !== pinId),
    links: project.links.filter((l) => l.pinId !== pinId),
  };
}

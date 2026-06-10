# OSINT Mapper — Delete identifiers & pins (design)

**Date:** 2026-06-11
**Scope:** Add delete for identifiers and pins in `/dfir/osint-mapper`. No edit, no
unlink (both recoverable via delete + re-add — YAGNI). Follow-up to the shipped
OSINT Mapper.

## Problem

Today there is no way to remove or change an identifier or pin without "New",
which wipes the whole case. A single mis-added entry forces a restart.

## Data layer (pure, unit-tested) — new `src/lib/dfir/osint/osint-mutations.ts`

```ts
deleteIdentifier(project: OsintProject, identifierId: string): OsintProject
deletePin(project: OsintProject, pinId: string): OsintProject
```

- `deleteIdentifier` removes the identifier **and every link referencing it**
  (cascade). Siblings untouched. No-op (returns an equivalent project) if the id
  is absent.
- `deletePin` removes the pin **and every link referencing it**. Same no-op rule.
- Both return a new `OsintProject` (immutable update); they do not stamp
  `updatedAt` — the page's autosave does that.
- Custom icons live in the separate per-browser icon library
  (`dfir-osint-icons:v1`, keyed by `customIconId`) and are shared across cases;
  deletion deliberately leaves them alone (reusable, harmless).

## UI (per-entity, minimal new surface)

- **Identifier:** a small `×` delete button in the top-right of `IdentifierNode`,
  rendered only when the node is selected (`data.selected`). Click calls
  `onDelete(id)`; the handler stops event propagation so it doesn't merely
  re-select. Two-step select → × guards against accidental deletes.
- **Pin:** a "Delete pin" button inside the marker's existing `Popup` in
  `MapPane`, calling `onDeletePin(pinId)`.
- No confirmation dialog — data is local and re-addable, and both paths already
  require a deliberate two-step interaction.

## Wiring — `OsintMapper.tsx`

Pass `onDelete` / `onDeletePin` down to `IdentifierGraph` / `MapPane`. Each
handler applies the matching pure mutation to `project` state (autosave persists)
and clears `selection` if the deleted entity was the selected one.

## Files

- New: `src/lib/dfir/osint/osint-mutations.ts` + `osint-mutations.test.ts`
- Edit: `IdentifierNode.tsx` (× when selected), `IdentifierGraph.tsx` (thread
  `onDelete`), `MapPane.tsx` (popup delete button + `onDeletePin`),
  `OsintMapper.tsx` (wire handlers, clear selection).

## Testing

- Unit (`osint-mutations.test.ts`): deleting an identifier removes it + its links
  and leaves other identifiers/pins/links intact; deleting a pin removes it + its
  links; deleting a missing id is a no-op; a link is only dropped when one of its
  endpoints is deleted.
- Live verification (Playwright, same harness as the feature): select a node →
  `×` → node + count drop; marker popup → "Delete pin" → marker + count drop;
  export reflects the removals.
- Gates: 3× tsc, eslint, build with Leaflet still lazy-split.

## Out of scope

Edit identifier fields / pin attributes; unlink a single relationship;
bulk/multi-select delete; undo. All deferred.

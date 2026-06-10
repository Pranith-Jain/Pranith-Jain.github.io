# OSINT Mapper — edit, portable icons, persisted layout (design)

**Date:** 2026-06-11
**Scope:** Three cohesive follow-ups to the OSINT Mapper, shipped as one increment:
(1) edit identifier/pin attributes, (2) embed custom icons in `.osint.json` export
so cases are portable across machines, (3) persist graph node positions.

## 1. Edit identifier / pin attributes

Reuse the existing forms in an "edit" mode rather than building new UI.

- `IdentifierForm` / `PinForm` gain an optional `initial` prop. When present, the
  form prefills from it and its submit **updates** the existing entity (same `id`)
  instead of adding a new one.
- **Triggers:** identifier — a pencil button beside the `×` on a selected graph
  node; pin — an "Edit" button in the marker popup (beside "Delete pin").
- **Editable:** identifier — field values and type (changing type resets fields,
  same behaviour as add); pin — label, note, color. **Lat/lng are fixed** (moving
  a pin is drag, out of scope). Links are untouched by an edit.
- New pure mutations:
  - `updateIdentifier(project, id, next: { type: string; fields: Record<string,string> }): OsintProject`
  - `updatePin(project, next: Pin): OsintProject` (matches by `next.id`)
  - Both immutable, no-op when `id` is absent.

## 2. Embed custom icons in export (portable)

Custom icons live only in per-browser localStorage (`dfir-osint-icons:v1`), so an
exported `.osint.json` loses them on another machine.

- **Export envelope:** `{ ...project, icons: <subset> }` where `<subset>` contains
  only the `customIconId`s referenced by this project's identifiers. Superset of
  `OsintProject`; `isOsintProject` ignores extra keys, so it stays valid.
- **Import:** read `icons` back, merge into the local icon library (localStorage),
  then load the project. Files without `icons` (older exports) import unchanged.
- `osint-store.ts`:
  - `buildExport(project, allIcons): string` — JSON of project + referenced icon
    subset (pretty-printed).
  - `parseImport(text): { project: OsintProject; icons: Record<string,string> } | null`
    — returns `icons: {}` when the file has none. (Return shape changes from
    `OsintProject | null`; the only caller is `OsintMapper`, updated in lockstep.)

## 3. Persist graph node positions

- Add optional `positions?: Record<string, { x: number; y: number }>` to
  `OsintProject` (identifierId → coordinate). Optional → backward-compatible;
  `isOsintProject` does **not** require it and does not reject when present.
- `IdentifierGraph` uses `positions[id]` when set, else the existing index-based
  default layout. Wire `onNodeDragStop(_, node)` → `onMove(node.id, node.position)`
  up to `OsintMapper`, which writes it into `project.positions` (autosave persists).
- `deleteIdentifier` also prunes the identifier's `positions` entry.
- New pure mutation `setPosition(project, id, pos): OsintProject` (immutable).

## Files

- `osint-schema.ts` — add optional `positions`; validator stays lenient.
- `osint-mutations.ts` — add `updateIdentifier`, `updatePin`, `setPosition`;
  extend `deleteIdentifier` to prune `positions`. (+ tests)
- `osint-store.ts` — `buildExport`; change `parseImport` to return `{project, icons}`. (+ tests)
- `IdentifierForm.tsx` / `PinForm.tsx` — `initial` edit mode.
- `IdentifierNode.tsx` — pencil (edit) button when selected; `onEdit` via node data.
- `IdentifierGraph.tsx` — apply saved positions, `onNodeDragStop`, thread `onEdit`/`onMove`.
- `MapPane.tsx` — "Edit" button in popup, `onEditPin`.
- `OsintMapper.tsx` — wire edit handlers (open form in edit mode), export-with-icons,
  import-with-icons, and position persistence.

## Testing

- Unit: `updateIdentifier`/`updatePin`/`setPosition` (correct entity changed,
  others intact, no-op on missing id, immutability); `deleteIdentifier` prunes
  positions; `buildExport` includes only referenced icons; `parseImport`
  round-trips icons and still parses an icon-less (legacy) file.
- Live (Playwright): edit an identifier's field + a pin's label; export then
  re-import on fresh state and confirm a custom icon survives; drag a node →
  reload → position persists.
- Gates: 3× tsc, eslint, build with Leaflet still lazy-split.

## Out of scope

Drag-to-move pins; unlink a single relationship; multi-select; undo.

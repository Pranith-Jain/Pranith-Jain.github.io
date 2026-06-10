# OSINT Mapper — Design Spec

**Date:** 2026-06-10
**Route:** `/dfir/osint-mapper`
**Status:** Approved design, pending implementation plan
**Origin:** Re-implementation of the concept in
[anonymousRAID/OSINT-Mapping-Tool](https://github.com/anonymousRAID/OSINT-Mapping-Tool)
(GPL-3.0) on this platform's stack. This is a clean re-implementation on our own
infrastructure, **not** a code port — no upstream code is copied, so no GPL
obligations attach.

## Goal

A self-contained, client-only investigator workspace: catalog identifiers
(social handles, phones, license plates, people, vehicles) as a node graph, pin
locations on an interactive street map, and cross-link identifiers to pins with
contextual notes. All data is local (localStorage + importable/exportable
`.osint.json`). No backend, no API key required (OpenStreetMap default).

## Locked decisions

| Decision             | Choice                                                                              |
| -------------------- | ----------------------------------------------------------------------------------- |
| Map                  | Leaflet + OpenStreetMap raster tiles + Nominatim geocoding (street-level, pannable) |
| Platform integration | Self-contained — no coupling to observable-db / relationship-graph / ioc-detect     |
| Identifier catalog   | Full 20+ built-in types + custom icon upload (hardened)                             |
| Route / nav          | `/dfir/osint-mapper`, DFIR "Reference" nav group                                    |

## Non-goals (YAGNI)

- No backend or server-side persistence.
- No coupling to `observable-db`, `relationship-graph`, or `ioc-detect` (can be
  wired later if desired).
- No Google Maps mode (OSM only).
- No real-time collaboration / multi-user.

## Architecture

Three independent units communicating through a typed project object. The store
knows nothing about rendering; the graph and map read/write exclusively through
the store.

```
src/pages/dfir/OsintMapper.tsx          — page shell, tab routing (Graph | Map), project lifecycle
src/components/dfir/osint/
  IdentifierGraph.tsx                    — @xyflow/react canvas (reuse RelationshipGraphCanvas patterns)
  IdentifierNode.tsx                     — custom node renderer (icon + fields)
  MapPane.tsx                            — react-leaflet MapContainer + click-to-pin + markers + search
  IdentifierForm.tsx                     — add/edit identifier modal (type-driven fields)
  PinForm.tsx                            — add/edit pin, link to identifiers + note
  CustomIconUpload.tsx                   — icon upload -> sanitized data-URL
src/lib/dfir/osint/
  identifier-types.ts                    — full catalog: type registry + field schemas + brand icons
  osint-store.ts                         — localStorage load/save + JSON import/export + schema versioning
  osint-schema.ts                        — TS types + .osint.json v1 schema + validators
```

## Data model (`osint-schema.ts`)

```ts
type IdentifierCategory = 'social' | 'contact' | 'personal' | 'vehicle' | 'other';

type Identifier = {
  id: string;
  type: string; // key into the identifier-types registry
  fields: Record<string, string>;
  customIconId?: string; // -> custom icon library entry
};

type Pin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  address?: string; // populated via reverse-geocode when available
  iconKey: string; // built-in place-icon key
  color: string; // from pin color palette
  note?: string;
};

type Link = {
  id: string;
  identifierId: string;
  pinId: string;
  note?: string; // contextual note on the relationship
};

type OsintProject = {
  schemaVersion: 1;
  name: string;
  identifiers: Identifier[];
  pins: Pin[];
  links: Link[];
  updatedAt: number;
};
```

Links are bidirectional in the UI (an identifier shows its pins; a pin shows its
identifiers) but stored once.

## Persistence & I/O (`osint-store.ts`)

- **Current project + recents:** `dfir-osint-mapper:v1` (current `OsintProject`
  plus a "recent projects" list, max 5 — mirrors upstream "Continue recent").
- **Custom icon library:** `dfir-osint-icons:v1` (separate key, per-browser,
  reused across projects).
- **Autosave** on change, debounced, wrapped in try/catch for quota / private-mode
  failures (platform convention from `YaraManager` / `Diamond`).
- **Export** `.osint.json` via the existing Blob-download pattern (`URL.createObjectURL`).
- **Import** validates `schemaVersion === 1` and the object shape before loading;
  rejects malformed files with a user-visible error rather than throwing.

## Map (react-leaflet + OSM)

- Dependencies: `react-leaflet@4` (React 18 compatible; v5 requires React 19 — **pin v4**),
  `leaflet`, `@types/leaflet` (dev).
- `TileLayer` with OSM raster tiles. Tiles load as `<img>`, already permitted by
  the existing `img-src 'self' data: https:` directive — **no img-src change**.
- **CSP change (one line):** add `https://nominatim.openstreetmap.org` to
  `connect-src` in `worker/csp.ts` (currently line 28) for forward search +
  reverse-geocode. No nonce/hash interaction.
- Leaflet CSS imported inside `MapPane.tsx` so it ships only with this route. The
  whole page is `lazy()`-imported in `App.tsx`, keeping Leaflet (~140KB) off every
  other route — respects the documented bundle/Lighthouse sensitivity.
- **Nominatim usage policy:** debounce search input and cap at <= 1 request/second;
  reverse-geocode only on explicit pin placement. No bulk/automated querying.
- **Click-to-pin:** clicking the map opens `PinForm` pre-filled with lat/lng and
  (when geocoding succeeds) address + a suggested place icon.

## Identifiers (`identifier-types.ts`)

- Full 20+ built-in catalog across Social / Contact / Personal / Vehicle / Other,
  each with a branded icon and a field schema (which form fields appear for that
  type). Registry is data-driven so adding a type is a single entry.
- **Custom icon upload — hardened:**
  - Accept raster only (`png` / `jpg` / `webp`); read as data-URL; render
    **exclusively** via `<img src={dataUrl}>`.
  - SVG uploads are either rejected or sanitized with DOMPurify before storage;
    never injected as inline DOM. This avoids the SVG-upload XSS surface the
    platform's security posture cares about.
  - Enforce a max file size (e.g. 256KB) to bound localStorage growth.

## UI / conventions

- `DataPageLayout` wrapper (back link, icon, title, description) for header
  consistency.
- Tabbed body: **Graph** (`@xyflow/react`) and **Map** (`react-leaflet`) with
  shared selection state — selecting a node highlights its linked pins and
  vice-versa; a "jump to map / jump to graph" affordance preserves selection.
- Colors/icons via `tone.ts`; add an `OSINT_KIND` palette for identifier
  categories.
- Nav: add `{ label: 'OSINT Mapper', href: '/dfir/osint-mapper', icon: Map }` to
  the DFIR "Reference" group in `src/data/sidebar-nav.ts` (`Map` icon already
  imported).

## Integration points (verified)

| Concern         | File:line                                         | Change                                                                |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| CSP connect-src | `worker/csp.ts:28`                                | append `https://nominatim.openstreetmap.org`                          |
| Lazy import     | `src/App.tsx` (~143)                              | `const OsintMapper = lazy(() => import('./pages/dfir/OsintMapper'));` |
| Route entry     | `src/App.tsx` ROUTES (~477)                       | `{ path: '/dfir/osint-mapper', Component: OsintMapper },`             |
| Nav             | `src/data/sidebar-nav.ts` (Reference group, ~157) | add OSINT Mapper item                                                 |
| Deps            | `package.json`                                    | add `leaflet`, `react-leaflet@4`, `-D @types/leaflet`                 |

## Testing

- **Unit (`osint-store`):** round-trip save/load; reject wrong/absent
  `schemaVersion`; import validation rejects malformed JSON; recents capped at 5.
- **Unit (`identifier-types`):** every registered type resolves an icon and a
  field schema.
- **Unit (custom icon):** SVG rejected/sanitized; oversize file rejected; raster
  accepted as data-URL.
- **Component:** creating an identifier-pin link produces a bidirectional edge;
  clicking a pin selects its linked identifiers; clicking a node selects its pins.
- **Build gate:** all three `tsc` projects stay green
  (`tsconfig.json`, `api/tsconfig.json`, `api/tsconfig.worker.json`) — per repo
  footgun (esbuild deploys past `tsc`).

## Security notes

- Custom icon upload is the only untrusted-input surface; mitigated by
  raster-only + `<img>`-render + DOMPurify-on-SVG (see above).
- Nominatim is the only outbound host added; rate-limited per policy.
- No secrets, no API keys, no D1, no MCP surface touched.

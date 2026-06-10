# OSINT Mapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained, client-only OSINT mapper at `/dfir/osint-mapper` — an identifier node graph (@xyflow/react) + a Leaflet/OpenStreetMap street map, cross-linked, persisted to localStorage and importable/exportable as `.osint.json`.

**Architecture:** Pure-logic core (schema, store, identifier registry, icon sanitizer) under `src/lib/dfir/osint/`, fully unit-tested. UI (page shell, graph, map, forms) under `src/components/dfir/osint/` + `src/pages/dfir/OsintMapper.tsx`, reading/writing exclusively through the store. No backend, OSM-only.

**Tech Stack:** React 18 + TypeScript (strict), Vite 6, @xyflow/react 12 (already installed), Leaflet + react-leaflet@4 (new), Nominatim geocoding, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-osint-mapper-design.md`

---

## ⚠️ Two platform footguns this plan must respect

1. **COEP `require-corp`.** HTML responses set `cross-origin-embedder-policy: require-corp` (`worker/csp.ts:50`). Cross-origin OSM tiles are **blocked** unless requested in CORS mode. Fix: pass `crossOrigin="anonymous"` to react-leaflet's `<TileLayer>` (OSM sends `Access-Control-Allow-Origin: *`, so CORS succeeds and satisfies COEP). Nominatim is a normal `fetch` in CORS mode — fine, only needs `connect-src`. Same-origin bundled marker icons are unaffected.
2. **Three tsc projects + esbuild deploys past tsc.** After every code change keep all three green: `tsc -p tsconfig.json`, `tsc -p api/tsconfig.json`, `tsc -p api/tsconfig.worker.json`. The frontend one (`tsconfig.json`) is the relevant gate for this feature; the worker one matters for the `csp.ts` edit.

---

## File Structure

| File                                             | Responsibility                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `src/lib/dfir/osint/osint-schema.ts`             | TS types (`Identifier`, `Pin`, `Link`, `OsintProject`) + `isOsintProject()` validator + `emptyProject()` |
| `src/lib/dfir/osint/osint-schema.test.ts`        | validator unit tests                                                                                     |
| `src/lib/dfir/osint/osint-store.ts`              | localStorage load/save, recents (max 5), JSON import/export helpers                                      |
| `src/lib/dfir/osint/osint-store.test.ts`         | store unit tests                                                                                         |
| `src/lib/dfir/osint/identifier-types.ts`         | identifier type registry: category, label, lucide icon, field schema                                     |
| `src/lib/dfir/osint/identifier-types.test.ts`    | registry integrity tests                                                                                 |
| `src/lib/dfir/osint/custom-icon.ts`              | raster-only upload validation → data-URL                                                                 |
| `src/lib/dfir/osint/custom-icon.test.ts`         | icon validation tests                                                                                    |
| `src/components/dfir/osint/IdentifierNode.tsx`   | custom @xyflow node renderer                                                                             |
| `src/components/dfir/osint/IdentifierGraph.tsx`  | @xyflow canvas                                                                                           |
| `src/components/dfir/osint/MapPane.tsx`          | react-leaflet map, click-to-pin, geocode                                                                 |
| `src/components/dfir/osint/IdentifierForm.tsx`   | add/edit identifier modal                                                                                |
| `src/components/dfir/osint/PinForm.tsx`          | add/edit pin + link-to-identifiers                                                                       |
| `src/components/dfir/osint/CustomIconUpload.tsx` | icon upload widget                                                                                       |
| `src/pages/dfir/OsintMapper.tsx`                 | page shell, tabs, shared selection, project lifecycle                                                    |
| `worker/csp.ts`                                  | add Nominatim to `connect-src`                                                                           |
| `src/App.tsx`                                    | lazy import + route entry                                                                                |
| `src/data/sidebar-nav.ts`                        | DFIR "Reference" nav item                                                                                |

---

## Task 1: Project schema + validator

**Files:**

- Create: `src/lib/dfir/osint/osint-schema.ts`
- Test: `src/lib/dfir/osint/osint-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dfir/osint/osint-schema.test.ts
import { describe, it, expect } from 'vitest';
import { isOsintProject, emptyProject, type OsintProject } from './osint-schema';

describe('emptyProject', () => {
  it('creates a valid v1 project', () => {
    const p = emptyProject('Case 1');
    expect(p.schemaVersion).toBe(1);
    expect(p.name).toBe('Case 1');
    expect(p.identifiers).toEqual([]);
    expect(p.pins).toEqual([]);
    expect(p.links).toEqual([]);
    expect(isOsintProject(p)).toBe(true);
  });
});

describe('isOsintProject', () => {
  it('accepts a well-formed project', () => {
    expect(isOsintProject(emptyProject('x'))).toBe(true);
  });
  it('rejects wrong schemaVersion', () => {
    expect(isOsintProject({ ...emptyProject('x'), schemaVersion: 2 })).toBe(false);
  });
  it('rejects non-objects and missing arrays', () => {
    expect(isOsintProject(null)).toBe(false);
    expect(isOsintProject('nope')).toBe(false);
    expect(isOsintProject({ schemaVersion: 1, name: 'x' })).toBe(false);
  });
  it('rejects a pin with non-numeric coords', () => {
    const p = emptyProject('x');
    (p.pins as unknown[]).push({ id: '1', lat: 'a', lng: 0, label: 'l', iconKey: 'k', color: '#fff' });
    expect(isOsintProject(p)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dfir/osint/osint-schema.test.ts`
Expected: FAIL — `Cannot find module './osint-schema'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dfir/osint/osint-schema.ts
export type IdentifierCategory = 'social' | 'contact' | 'personal' | 'vehicle' | 'other';

export interface Identifier {
  id: string;
  type: string; // key into the identifier-types registry
  fields: Record<string, string>;
  customIconId?: string;
}

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  address?: string;
  iconKey: string;
  color: string;
  note?: string;
}

export interface Link {
  id: string;
  identifierId: string;
  pinId: string;
  note?: string;
}

export interface OsintProject {
  schemaVersion: 1;
  name: string;
  identifiers: Identifier[];
  pins: Pin[];
  links: Link[];
  updatedAt: number;
}

export function emptyProject(name: string): OsintProject {
  return { schemaVersion: 1, name, identifiers: [], pins: [], links: [], updatedAt: 0 };
}

function isPin(v: unknown): v is Pin {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    typeof p.label === 'string' &&
    typeof p.iconKey === 'string' &&
    typeof p.color === 'string'
  );
}

function isIdentifier(v: unknown): v is Identifier {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Record<string, unknown>;
  return typeof i.id === 'string' && typeof i.type === 'string' && typeof i.fields === 'object' && i.fields !== null;
}

function isLink(v: unknown): v is Link {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return typeof l.id === 'string' && typeof l.identifierId === 'string' && typeof l.pinId === 'string';
}

export function isOsintProject(v: unknown): v is OsintProject {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    p.schemaVersion === 1 &&
    typeof p.name === 'string' &&
    Array.isArray(p.identifiers) &&
    p.identifiers.every(isIdentifier) &&
    Array.isArray(p.pins) &&
    p.pins.every(isPin) &&
    Array.isArray(p.links) &&
    p.links.every(isLink)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dfir/osint/osint-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dfir/osint/osint-schema.ts src/lib/dfir/osint/osint-schema.test.ts
git commit -m "feat(osint): project schema + validator"
```

---

## Task 2: Store (localStorage + recents + import/export)

**Files:**

- Create: `src/lib/dfir/osint/osint-store.ts`
- Test: `src/lib/dfir/osint/osint-store.test.ts`

Keys: `dfir-osint-mapper:v1` (`{ current: OsintProject | null; recents: RecentEntry[] }`), recents capped at 5.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dfir/osint/osint-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadState, saveProject, parseImport, serializeProject, STORE_KEY } from './osint-store';
import { emptyProject } from './osint-schema';

beforeEach(() => localStorage.clear());

describe('saveProject / loadState', () => {
  it('round-trips the current project and stamps updatedAt', () => {
    const p = emptyProject('Case A');
    saveProject(p, 1000);
    const state = loadState();
    expect(state.current?.name).toBe('Case A');
    expect(state.current?.updatedAt).toBe(1000);
  });

  it('returns empty state when nothing stored', () => {
    expect(loadState()).toEqual({ current: null, recents: [] });
  });

  it('returns empty state on corrupt JSON', () => {
    localStorage.setItem(STORE_KEY, '{not json');
    expect(loadState()).toEqual({ current: null, recents: [] });
  });

  it('caps recents at 5, most-recent first', () => {
    for (let i = 1; i <= 7; i++) saveProject(emptyProject('C' + i), i);
    const { recents } = loadState();
    expect(recents).toHaveLength(5);
    expect(recents[0].name).toBe('C7');
  });
});

describe('parseImport', () => {
  it('parses a valid exported project', () => {
    const json = serializeProject(emptyProject('Imp'));
    expect(parseImport(json)?.name).toBe('Imp');
  });
  it('returns null for malformed or wrong-version JSON', () => {
    expect(parseImport('{"schemaVersion":2}')).toBeNull();
    expect(parseImport('garbage')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dfir/osint/osint-store.test.ts`
Expected: FAIL — `Cannot find module './osint-store'`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
    ...recents.filter((r) => r.name !== stamped.name),
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dfir/osint/osint-store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dfir/osint/osint-store.ts src/lib/dfir/osint/osint-store.test.ts
git commit -m "feat(osint): localStorage store with recents + import/export"
```

---

## Task 3: Identifier type registry

**Files:**

- Create: `src/lib/dfir/osint/identifier-types.ts`
- Test: `src/lib/dfir/osint/identifier-types.test.ts`

Each entry: `{ type, category, label, icon (lucide component), fields: FieldDef[] }`. Use lucide-react icons (already a dependency) keyed per type — no external brand-logo assets needed (keeps it CSP/same-origin clean). Ship the full catalog across all 5 categories.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dfir/osint/identifier-types.test.ts
import { describe, it, expect } from 'vitest';
import { IDENTIFIER_TYPES, getIdentifierType, IDENTIFIER_CATEGORIES } from './identifier-types';

describe('IDENTIFIER_TYPES registry', () => {
  it('ships at least 20 types', () => {
    expect(IDENTIFIER_TYPES.length).toBeGreaterThanOrEqual(20);
  });
  it('every type is complete and uses a known category', () => {
    for (const t of IDENTIFIER_TYPES) {
      expect(t.type).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(IDENTIFIER_CATEGORIES).toContain(t.category);
      expect(t.fields.length).toBeGreaterThan(0);
      for (const f of t.fields) {
        expect(f.key).toBeTruthy();
        expect(f.label).toBeTruthy();
      }
    }
  });
  it('has no duplicate type keys', () => {
    const keys = IDENTIFIER_TYPES.map((t) => t.type);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('getIdentifierType resolves and falls back to "other"', () => {
    expect(getIdentifierType('instagram')?.type).toBe('instagram');
    expect(getIdentifierType('does-not-exist').type).toBe('other');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dfir/osint/identifier-types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dfir/osint/identifier-types.ts
import type { LucideIcon } from 'lucide-react';
import {
  Instagram,
  Twitter,
  Facebook,
  Linkedin,
  Youtube,
  Github,
  Send,
  MessageCircle,
  Phone,
  Mail,
  Globe,
  User,
  Calendar,
  MapPin,
  Car,
  CreditCard,
  IdCard,
  AtSign,
  Hash,
  FileText,
  Camera,
  Building2,
} from 'lucide-react';
import type { IdentifierCategory } from './osint-schema';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
}
export interface IdentifierTypeDef {
  type: string;
  category: IdentifierCategory;
  label: string;
  icon: LucideIcon;
  fields: FieldDef[];
}

export const IDENTIFIER_CATEGORIES: IdentifierCategory[] = ['social', 'contact', 'personal', 'vehicle', 'other'];

const handle: FieldDef[] = [
  { key: 'handle', label: 'Handle / username', placeholder: '@example' },
  { key: 'url', label: 'Profile URL', placeholder: 'https://…' },
  { key: 'notes', label: 'Notes' },
];

export const IDENTIFIER_TYPES: IdentifierTypeDef[] = [
  // Social
  { type: 'instagram', category: 'social', label: 'Instagram', icon: Instagram, fields: handle },
  { type: 'twitter', category: 'social', label: 'X / Twitter', icon: Twitter, fields: handle },
  { type: 'facebook', category: 'social', label: 'Facebook', icon: Facebook, fields: handle },
  { type: 'linkedin', category: 'social', label: 'LinkedIn', icon: Linkedin, fields: handle },
  { type: 'youtube', category: 'social', label: 'YouTube', icon: Youtube, fields: handle },
  { type: 'github', category: 'social', label: 'GitHub', icon: Github, fields: handle },
  { type: 'telegram', category: 'social', label: 'Telegram', icon: Send, fields: handle },
  { type: 'discord', category: 'social', label: 'Discord', icon: MessageCircle, fields: handle },
  { type: 'username', category: 'social', label: 'Generic username', icon: AtSign, fields: handle },
  // Contact
  {
    type: 'phone',
    category: 'contact',
    label: 'Phone number',
    icon: Phone,
    fields: [
      { key: 'number', label: 'Number', placeholder: '+1 555 …' },
      { key: 'carrier', label: 'Carrier' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'email',
    category: 'contact',
    label: 'Email address',
    icon: Mail,
    fields: [
      { key: 'address', label: 'Email', placeholder: 'name@example.com' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'website',
    category: 'contact',
    label: 'Website',
    icon: Globe,
    fields: [
      { key: 'url', label: 'URL', placeholder: 'https://…' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  // Personal
  {
    type: 'person',
    category: 'personal',
    label: 'Person / name',
    icon: User,
    fields: [
      { key: 'fullName', label: 'Full name' },
      { key: 'aliases', label: 'Aliases' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'dob',
    category: 'personal',
    label: 'Date of birth',
    icon: Calendar,
    fields: [
      { key: 'date', label: 'Date' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'address',
    category: 'personal',
    label: 'Address',
    icon: MapPin,
    fields: [
      { key: 'address', label: 'Street address' },
      { key: 'city', label: 'City' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'photo',
    category: 'personal',
    label: 'Photo / image',
    icon: Camera,
    fields: [
      { key: 'url', label: 'Image URL' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'employer',
    category: 'personal',
    label: 'Employer / org',
    icon: Building2,
    fields: [
      { key: 'name', label: 'Organisation' },
      { key: 'role', label: 'Role' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  // Vehicle
  {
    type: 'license-plate',
    category: 'vehicle',
    label: 'License plate',
    icon: CreditCard,
    fields: [
      { key: 'plate', label: 'Plate' },
      { key: 'region', label: 'Region / state' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'vehicle',
    category: 'vehicle',
    label: 'Vehicle',
    icon: Car,
    fields: [
      { key: 'makeModel', label: 'Make / model' },
      { key: 'color', label: 'Color' },
      { key: 'vin', label: 'VIN' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  // Other
  {
    type: 'document',
    category: 'other',
    label: 'Document / ID',
    icon: IdCard,
    fields: [
      { key: 'kind', label: 'Document kind' },
      { key: 'number', label: 'Number' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'crypto',
    category: 'other',
    label: 'Crypto address',
    icon: Hash,
    fields: [
      { key: 'address', label: 'Address' },
      { key: 'chain', label: 'Chain' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'other',
    category: 'other',
    label: 'Other / note',
    icon: FileText,
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'value', label: 'Value' },
      { key: 'notes', label: 'Notes' },
    ],
  },
];

const BY_TYPE = new Map(IDENTIFIER_TYPES.map((t) => [t.type, t]));
const FALLBACK = BY_TYPE.get('other')!;

export function getIdentifierType(type: string): IdentifierTypeDef {
  return BY_TYPE.get(type) ?? FALLBACK;
}
```

> Note: the test calls `getIdentifierType('instagram')?.type` and also relies on the fallback returning a defined object. Both hold — `getIdentifierType` always returns a definition (never `undefined`); the optional-chaining in the test is harmless.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dfir/osint/identifier-types.test.ts`
Expected: PASS (4 tests). Confirm 23 types ≥ 20.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dfir/osint/identifier-types.ts src/lib/dfir/osint/identifier-types.test.ts
git commit -m "feat(osint): identifier type registry (23 types, 5 categories)"
```

---

## Task 4: Custom icon validation (raster-only, hardened)

**Files:**

- Create: `src/lib/dfir/osint/custom-icon.ts`
- Test: `src/lib/dfir/osint/custom-icon.test.ts`

Decision (from spec, made concrete): **reject SVG, raster-only.** Removes the SVG-XSS surface entirely — no DOMPurify needed for uploads. Returns either `{ ok: true, dataUrl }` or `{ ok: false, error }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dfir/osint/custom-icon.test.ts
import { describe, it, expect } from 'vitest';
import { validateIconFile, ICON_MAX_BYTES, ICON_ALLOWED_TYPES } from './custom-icon';

function fakeFile(type: string, size: number): File {
  return { type, size, name: 'icon' } as File;
}

describe('validateIconFile', () => {
  it('accepts png/jpeg/webp under the size cap', () => {
    for (const t of ICON_ALLOWED_TYPES) {
      expect(validateIconFile(fakeFile(t, 1000)).ok).toBe(true);
    }
  });
  it('rejects svg explicitly', () => {
    const r = validateIconFile(fakeFile('image/svg+xml', 100));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/svg/i);
  });
  it('rejects non-image types', () => {
    expect(validateIconFile(fakeFile('application/pdf', 100)).ok).toBe(false);
  });
  it('rejects files over the size cap', () => {
    expect(validateIconFile(fakeFile('image/png', ICON_MAX_BYTES + 1)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dfir/osint/custom-icon.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dfir/osint/custom-icon.ts
export const ICON_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ICON_MAX_BYTES = 256 * 1024; // 256KB, bounds localStorage growth

export type IconValidation = { ok: true } | { ok: false; error: string };

export function validateIconFile(file: File): IconValidation {
  if (file.type === 'image/svg+xml') {
    return { ok: false, error: 'SVG icons are not allowed. Use PNG, JPEG, or WebP.' };
  }
  if (!(ICON_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Unsupported file type. Use PNG, JPEG, or WebP.' };
  }
  if (file.size > ICON_MAX_BYTES) {
    return { ok: false, error: 'Icon must be 256KB or smaller.' };
  }
  return { ok: true };
}

/** Read a validated raster file as a data-URL. Caller MUST validateIconFile first. */
export function readIconAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read icon file.'));
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dfir/osint/custom-icon.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dfir/osint/custom-icon.ts src/lib/dfir/osint/custom-icon.test.ts
git commit -m "feat(osint): raster-only custom icon validation"
```

---

## Task 5: CSP — allow Nominatim

**Files:**

- Modify: `worker/csp.ts:19` (CSP_API string) and `worker/csp.ts:28` (cspHeader array)

`img-src 'self' data: https:` already covers OSM tiles — **do not touch img-src.** Only add Nominatim to both `connect-src` occurrences.

- [ ] **Step 1: Edit `CSP_API` (line 19)** — append ` https://nominatim.openstreetmap.org` to the `connect-src` segment, immediately after `https://unpkg.com`.

Resulting `connect-src` segment:

```
connect-src 'self' https://api.cloudflare.com https://cloudflare-dns.com https://cloudflareinsights.com https://*.cloudflareinsights.com https://unpkg.com https://nominatim.openstreetmap.org;
```

- [ ] **Step 2: Edit the array form (line 28)** — change the `connect-src` line to:

```ts
    "connect-src 'self' https://api.cloudflare.com https://cloudflare-dns.com https://cloudflareinsights.com https://*.cloudflareinsights.com https://unpkg.com https://nominatim.openstreetmap.org",
```

- [ ] **Step 3: Verify worker typecheck + the existing csp test (if present)**

Run: `tsc -p api/tsconfig.worker.json --noEmit && npx vitest run worker 2>/dev/null || true`
Expected: typecheck clean. If a `csp.test.ts` exists, update its expected string to include the new host and re-run until green.

- [ ] **Step 4: Commit**

```bash
git add worker/csp.ts
git commit -m "feat(osint): allow Nominatim in connect-src CSP"
```

---

## Task 6: Install Leaflet deps

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install leaflet@^1.9.4 react-leaflet@^4.2.1 && npm install -D @types/leaflet`
(react-leaflet **4.x** — v5 requires React 19; this repo is React 18.3.)

- [ ] **Step 2: Verify**

Run: `node -e "const p=require('./package.json');console.log(p.dependencies['react-leaflet'],p.dependencies['leaflet'])"`
Expected: prints `^4.2.1 ^1.9.4`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(osint): add leaflet + react-leaflet@4"
```

---

## Task 7: Geocoding client

**Files:**

- Create: `src/lib/dfir/osint/geocode.ts`
- Test: `src/lib/dfir/osint/geocode.test.ts`

Thin Nominatim wrapper: forward search + reverse. Debouncing/rate-limiting lives in the UI; this module is pure fetch + parse, so it's unit-testable with a mocked `fetch`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dfir/osint/geocode.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchPlace, reverseGeocode } from './geocode';

afterEach(() => vi.restoreAllMocks());

describe('searchPlace', () => {
  it('maps Nominatim results to {label,lat,lng}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify([{ display_name: 'Berlin, Germany', lat: '52.52', lon: '13.405' }]))
      )
    );
    const out = await searchPlace('berlin');
    expect(out[0]).toEqual({ label: 'Berlin, Germany', lat: 52.52, lng: 13.405 });
  });
  it('returns [] on network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net');
      })
    );
    expect(await searchPlace('x')).toEqual([]);
  });
});

describe('reverseGeocode', () => {
  it('returns display_name for coords', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ display_name: '1 Main St' })))
    );
    expect(await reverseGeocode(1, 2)).toBe('1 Main St');
  });
  it('returns null on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net');
      })
    );
    expect(await reverseGeocode(1, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dfir/osint/geocode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dfir/osint/geocode.ts
const BASE = 'https://nominatim.openstreetmap.org';

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
}

export async function searchPlace(query: string): Promise<PlaceResult[]> {
  if (!query.trim()) return [];
  try {
    const url = `${BASE}/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    return rows.map((r) => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${BASE}/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dfir/osint/geocode.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dfir/osint/geocode.ts src/lib/dfir/osint/geocode.test.ts
git commit -m "feat(osint): Nominatim geocode client"
```

---

## Task 8: IdentifierNode + IdentifierGraph (@xyflow)

**Files:**

- Create: `src/components/dfir/osint/IdentifierNode.tsx`
- Create: `src/components/dfir/osint/IdentifierGraph.tsx`

Reuse the @xyflow/react patterns from `src/pages/threatintel/RelationshipGraphCanvas.tsx` (read it first for the import style + provider usage). Nodes are identifiers; edges represent identifier↔pin links (rendered as labelled edges). The graph is controlled — it takes `identifiers`, `links`, `selectedId`, and emits selection/position callbacks.

- [ ] **Step 1: Write `IdentifierNode.tsx`**

```tsx
// src/components/dfir/osint/IdentifierNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getIdentifierType } from '../../../lib/dfir/osint/identifier-types';

export interface IdentifierNodeData {
  type: string;
  primary: string; // primary field value to show as title
  selected?: boolean;
  customIconUrl?: string;
}

export function IdentifierNode({ data }: NodeProps & { data: IdentifierNodeData }) {
  const def = getIdentifierType(data.type);
  const Icon = def.icon;
  return (
    <div
      className={`rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 shadow-sm min-w-[140px] ${
        data.selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-300 dark:border-slate-700'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center gap-2">
        {data.customIconUrl ? (
          <img src={data.customIconUrl} alt="" className="w-4 h-4 rounded object-cover" />
        ) : (
          <Icon size={16} className="text-brand-600 dark:text-brand-400" />
        )}
        <div className="text-xs font-mono text-slate-500">{def.label}</div>
      </div>
      <div className="mt-1 text-sm font-medium truncate max-w-[180px]">{data.primary || '—'}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}
```

- [ ] **Step 2: Write `IdentifierGraph.tsx`**

```tsx
// src/components/dfir/osint/IdentifierGraph.tsx
import { useMemo } from 'react';
import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IdentifierNode } from './IdentifierNode';
import type { Identifier, Link, Pin } from '../../../lib/dfir/osint/osint-schema';
import { getIdentifierType } from '../../../lib/dfir/osint/identifier-types';

const nodeTypes = { identifier: IdentifierNode };

function primaryValue(id: Identifier): string {
  const def = getIdentifierType(id.type);
  const first = def.fields[0]?.key;
  return (first && id.fields[first]) || id.fields.handle || id.fields.fullName || '';
}

export interface IdentifierGraphProps {
  identifiers: Identifier[];
  pins: Pin[];
  links: Link[];
  selectedId: string | null;
  customIcons: Record<string, string>; // customIconId -> dataUrl
  onSelect: (identifierId: string | null) => void;
}

export function IdentifierGraph({ identifiers, pins, links, selectedId, customIcons, onSelect }: IdentifierGraphProps) {
  const nodes = useMemo<Node[]>(
    () =>
      identifiers.map((id, i) => ({
        id: id.id,
        type: 'identifier',
        position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 140 },
        data: {
          type: id.type,
          primary: primaryValue(id),
          selected: id.id === selectedId,
          customIconUrl: id.customIconId ? customIcons[id.customIconId] : undefined,
        },
      })),
    [identifiers, selectedId, customIcons]
  );

  // Edges connect identifiers that share a pin (co-location), labelled with the pin name.
  const edges = useMemo<Edge[]>(() => {
    const byPin = new Map<string, string[]>();
    for (const l of links) {
      const arr = byPin.get(l.pinId) ?? [];
      arr.push(l.identifierId);
      byPin.set(l.pinId, arr);
    }
    const out: Edge[] = [];
    for (const [pinId, ids] of byPin) {
      const label = pins.find((p) => p.id === pinId)?.label ?? '';
      for (let i = 1; i < ids.length; i++) {
        out.push({ id: `${pinId}-${i}`, source: ids[0], target: ids[i], label, animated: false });
      }
    }
    return out;
  }, [links, pins]);

  return (
    <div className="h-[600px] rounded-xl border border-slate-200 dark:border-slate-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: no errors in the two new files. (If `NodeProps` generics differ in 12.x, match the exact signature used in `RelationshipGraphCanvas.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/dfir/osint/IdentifierNode.tsx src/components/dfir/osint/IdentifierGraph.tsx
git commit -m "feat(osint): identifier node graph (@xyflow)"
```

---

## Task 9: MapPane (react-leaflet, COEP-safe tiles, click-to-pin)

**Files:**

- Create: `src/components/dfir/osint/MapPane.tsx`

Two COEP/bundler footguns handled here: (a) `crossOrigin="anonymous"` on `<TileLayer>` so OSM tiles satisfy `require-corp`; (b) Leaflet's default marker icon URLs break under Vite — build markers with `L.divIcon` (pure HTML/CSS, same-origin, no asset-path resolution) instead of the default `L.Icon`.

- [ ] **Step 1: Write `MapPane.tsx`**

```tsx
// src/components/dfir/osint/MapPane.tsx
import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Pin } from '../../../lib/dfir/osint/osint-schema';

function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'osint-pin',
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function ClickCapture({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export interface MapPaneProps {
  pins: Pin[];
  selectedPinId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  onSelectPin: (pinId: string) => void;
}

export function MapPane({ pins, selectedPinId, onMapClick, onSelectPin }: MapPaneProps) {
  const center = useMemo<[number, number]>(() => (pins[0] ? [pins[0].lat, pins[0].lng] : [20, 0]), [pins]);
  return (
    <div className="h-[600px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
      <MapContainer center={center} zoom={pins[0] ? 12 : 2} className="h-full w-full">
        <TileLayer
          crossOrigin="anonymous"
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCapture onMapClick={onMapClick} />
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={pinIcon(p.id === selectedPinId ? '#2c3ee5' : p.color)}
            eventHandlers={{ click: () => onSelectPin(p.id) }}
          >
            <Popup>
              <strong>{p.label}</strong>
              {p.address && <div className="text-xs">{p.address}</div>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/dfir/osint/MapPane.tsx
git commit -m "feat(osint): Leaflet map pane (COEP-safe tiles, divIcon markers)"
```

---

## Task 10: Forms — IdentifierForm, PinForm, CustomIconUpload

**Files:**

- Create: `src/components/dfir/osint/CustomIconUpload.tsx`
- Create: `src/components/dfir/osint/IdentifierForm.tsx`
- Create: `src/components/dfir/osint/PinForm.tsx`

Use the existing `Modal` primitive (`src/components/ui/`) — check its exact prop names before wiring. Forms are controlled and call back with the built object; they do not touch the store directly.

- [ ] **Step 1: `CustomIconUpload.tsx`**

```tsx
// src/components/dfir/osint/CustomIconUpload.tsx
import { useState } from 'react';
import { validateIconFile, readIconAsDataUrl } from '../../../lib/dfir/osint/custom-icon';

export function CustomIconUpload({ onIcon }: { onIcon: (dataUrl: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="text-xs">
      <span className="block mb-1 text-slate-500">Custom icon (PNG/JPEG/WebP, ≤256KB)</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const v = validateIconFile(file);
          if (!v.ok) {
            setError(v.error);
            return;
          }
          setError(null);
          onIcon(await readIconAsDataUrl(file));
        }}
      />
      {error && <span className="block mt-1 text-rose-500">{error}</span>}
    </label>
  );
}
```

- [ ] **Step 2: `IdentifierForm.tsx`** — type picker (grouped by `IDENTIFIER_CATEGORIES`) + dynamic fields from the selected type's `fields` + optional `CustomIconUpload`. On submit, build an `Identifier` (generate `id` with `crypto.randomUUID()`) and call `onSubmit(identifier, iconDataUrl?)`.

```tsx
// src/components/dfir/osint/IdentifierForm.tsx
import { useState } from 'react';
import { IDENTIFIER_TYPES, getIdentifierType } from '../../../lib/dfir/osint/identifier-types';
import type { Identifier } from '../../../lib/dfir/osint/osint-schema';
import { CustomIconUpload } from './CustomIconUpload';

export function IdentifierForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (id: Identifier, iconDataUrl?: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState(IDENTIFIER_TYPES[0].type);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [iconUrl, setIconUrl] = useState<string | undefined>();
  const def = getIdentifierType(type);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ id: crypto.randomUUID(), type, fields }, iconUrl);
      }}
    >
      <select
        value={type}
        onChange={(e) => {
          setType(e.target.value);
          setFields({});
        }}
        className="w-full rounded border px-2 py-1 bg-white dark:bg-slate-900"
      >
        {IDENTIFIER_TYPES.map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </select>
      {def.fields.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="text-slate-500 text-xs">{f.label}</span>
          <input
            className="w-full rounded border px-2 py-1 bg-white dark:bg-slate-900"
            placeholder={f.placeholder}
            value={fields[f.key] ?? ''}
            onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
          />
        </label>
      ))}
      <CustomIconUpload onIcon={setIconUrl} />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm">
          Cancel
        </button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-brand-600 text-white">
          Add
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: `PinForm.tsx`** — fields: label, note, color, place-icon key, plus a multi-select of existing identifiers to link. Pre-filled lat/lng/address come in as props. On submit emits `{ pin: Pin, linkedIdentifierIds: string[] }`.

```tsx
// src/components/dfir/osint/PinForm.tsx
import { useState } from 'react';
import type { Identifier, Pin } from '../../../lib/dfir/osint/osint-schema';

const PIN_COLORS = ['#2c3ee5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

export function PinForm({
  lat,
  lng,
  address,
  identifiers,
  onSubmit,
  onCancel,
}: {
  lat: number;
  lng: number;
  address?: string;
  identifiers: Identifier[];
  onSubmit: (pin: Pin, linkedIds: string[]) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(address ?? '');
  const [note, setNote] = useState('');
  const [color, setColor] = useState(PIN_COLORS[0]);
  const [linked, setLinked] = useState<string[]>([]);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          { id: crypto.randomUUID(), lat, lng, label: label || 'Pin', address, iconKey: 'default', color, note },
          linked
        );
      }}
    >
      <div className="text-xs text-slate-500 font-mono">
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </div>
      <input
        className="w-full rounded border px-2 py-1 bg-white dark:bg-slate-900"
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <textarea
        className="w-full rounded border px-2 py-1 bg-white dark:bg-slate-900"
        placeholder="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-1">
        {PIN_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => setColor(c)}
            aria-label={`color ${c}`}
            className={`w-6 h-6 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
            style={{ background: c }}
          />
        ))}
      </div>
      {identifiers.length > 0 && (
        <fieldset className="text-sm">
          <legend className="text-xs text-slate-500">Link identifiers</legend>
          {identifiers.map((id) => (
            <label key={id.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={linked.includes(id.id)}
                onChange={(e) => setLinked((p) => (e.target.checked ? [...p, id.id] : p.filter((x) => x !== id.id)))}
              />
              {Object.values(id.fields)[0] || id.type}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm">
          Cancel
        </button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-brand-600 text-white">
          Add pin
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/dfir/osint/CustomIconUpload.tsx src/components/dfir/osint/IdentifierForm.tsx src/components/dfir/osint/PinForm.tsx
git commit -m "feat(osint): identifier/pin/icon forms"
```

---

## Task 11: Page shell + project lifecycle + shared selection

**Files:**

- Create: `src/pages/dfir/OsintMapper.tsx`

Owns all state: current `OsintProject`, custom-icon library, active tab (`graph` | `map`), and a single `selection` (`{ kind: 'identifier'|'pin', id } | null`) shared across both tabs. Autosaves to the store (debounced) on project change. Provides New / Import / Export.

- [ ] **Step 1: Write the page**

```tsx
// src/pages/dfir/OsintMapper.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, Download, Upload, Plus, FilePlus2 } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { IdentifierGraph } from '../../components/dfir/osint/IdentifierGraph';
import { MapPane } from '../../components/dfir/osint/MapPane';
import { IdentifierForm } from '../../components/dfir/osint/IdentifierForm';
import { PinForm } from '../../components/dfir/osint/PinForm';
import {
  emptyProject,
  type Identifier,
  type Link,
  type OsintProject,
  type Pin,
} from '../../lib/dfir/osint/osint-schema';
import { loadState, saveProject, serializeProject, parseImport } from '../../lib/dfir/osint/osint-store';
import { reverseGeocode } from '../../lib/dfir/osint/geocode';

const ICONS_KEY = 'dfir-osint-icons:v1';

function loadIcons(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ICONS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export default function OsintMapper(): JSX.Element {
  const [project, setProject] = useState<OsintProject>(() => loadState().current ?? emptyProject('Untitled case'));
  const [icons, setIcons] = useState<Record<string, string>>(loadIcons);
  const [tab, setTab] = useState<'graph' | 'map'>('graph');
  const [pending, setPending] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [addingId, setAddingId] = useState(false);
  const [selection, setSelection] = useState<{ kind: 'identifier' | 'pin'; id: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounced autosave. Date.now() is fine in the browser (not a workflow script).
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProject(project, Date.now()), 400);
    return () => clearTimeout(saveTimer.current);
  }, [project]);

  const linkedPinIds = useMemo(() => {
    if (selection?.kind !== 'identifier') return new Set<string>();
    return new Set(project.links.filter((l) => l.identifierId === selection.id).map((l) => l.pinId));
  }, [selection, project.links]);

  function addIdentifier(id: Identifier, iconDataUrl?: string) {
    let withIcon = id;
    if (iconDataUrl) {
      const iconId = crypto.randomUUID();
      const nextIcons = { ...icons, [iconId]: iconDataUrl };
      setIcons(nextIcons);
      try {
        localStorage.setItem(ICONS_KEY, JSON.stringify(nextIcons));
      } catch {
        /* quota */
      }
      withIcon = { ...id, customIconId: iconId };
    }
    setProject((p) => ({ ...p, identifiers: [...p.identifiers, withIcon] }));
    setAddingId(false);
  }

  function addPin(pin: Pin, linkedIds: string[]) {
    const links: Link[] = linkedIds.map((identifierId) => ({ id: crypto.randomUUID(), identifierId, pinId: pin.id }));
    setProject((p) => ({ ...p, pins: [...p.pins, pin], links: [...p.links, ...links] }));
    setPending(null);
  }

  async function handleMapClick(lat: number, lng: number) {
    const address = (await reverseGeocode(lat, lng)) ?? undefined;
    setPending({ lat, lng, address });
  }

  function doExport() {
    const blob = new Blob([serializeProject(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '-') || 'case'}.osint.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((t) => {
      const imported = parseImport(t);
      if (imported) {
        setProject(imported);
        setSelection(null);
      } else alert('Invalid .osint.json file.');
    });
  }

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<MapIcon size={28} />}
      title="OSINT Mapper"
      description="Catalog identifiers, pin locations, and cross-link them. All data stays in your browser."
      maxWidthClass="max-w-7xl"
      headerExtra={
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setProject(emptyProject('Untitled case'))}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border"
          >
            <FilePlus2 size={14} /> New
          </button>
          <button
            onClick={() => setAddingId(true)}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border"
          >
            <Plus size={14} /> Add identifier
          </button>
          <button onClick={doExport} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border">
            <Download size={14} /> Export
          </button>
          <label className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border cursor-pointer">
            <Upload size={14} /> Import
            <input type="file" accept="application/json,.json" className="hidden" onChange={doImport} />
          </label>
        </div>
      }
    >
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('graph')}
          className={`px-3 py-1.5 text-sm rounded ${tab === 'graph' ? 'bg-brand-600 text-white' : 'border'}`}
        >
          Graph
        </button>
        <button
          onClick={() => setTab('map')}
          className={`px-3 py-1.5 text-sm rounded ${tab === 'map' ? 'bg-brand-600 text-white' : 'border'}`}
        >
          Map ({project.pins.length})
        </button>
      </div>

      {tab === 'graph' ? (
        <IdentifierGraph
          identifiers={project.identifiers}
          pins={project.pins}
          links={project.links}
          customIcons={icons}
          selectedId={selection?.kind === 'identifier' ? selection.id : null}
          onSelect={(id) => setSelection(id ? { kind: 'identifier', id } : null)}
        />
      ) : (
        <MapPane
          pins={project.pins}
          selectedPinId={selection?.kind === 'pin' ? selection.id : linkedPinIds.size ? [...linkedPinIds][0] : null}
          onMapClick={handleMapClick}
          onSelectPin={(id) => setSelection({ kind: 'pin', id })}
        />
      )}

      {addingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 w-full max-w-md">
            <h2 className="font-medium mb-3">Add identifier</h2>
            <IdentifierForm onSubmit={addIdentifier} onCancel={() => setAddingId(false)} />
          </div>
        </div>
      )}
      {pending && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 w-full max-w-md">
            <h2 className="font-medium mb-3">Add pin</h2>
            <PinForm
              lat={pending.lat}
              lng={pending.lng}
              address={pending.address}
              identifiers={project.identifiers}
              onSubmit={addPin}
              onCancel={() => setPending(null)}
            />
          </div>
        </div>
      )}
    </DataPageLayout>
  );
}
```

> If `src/components/ui/Modal.tsx` exists with a compatible API, replace the two inline `fixed inset-0` overlays with it for consistency (check its props first). The inline version is a correct fallback.

- [ ] **Step 2: Verify typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dfir/OsintMapper.tsx
git commit -m "feat(osint): page shell, project lifecycle, shared selection"
```

---

## Task 12: Wire the route + nav

**Files:**

- Modify: `src/App.tsx` (lazy import near line 143; route entry in ROUTES array near the other `/dfir/*` entries, e.g. by `/dfir/diamond`)
- Modify: `src/data/sidebar-nav.ts` (DFIR "Reference" group, after the Diamond item at line 156)

- [ ] **Step 1: Add the lazy import** in `src/App.tsx` (after line 143, near `OsintFramework`):

```ts
const OsintMapper = lazy(() => import('./pages/dfir/OsintMapper'));
```

- [ ] **Step 2: Add the route** to the ROUTES array (near the other `/dfir/*` entries):

```ts
{ path: '/dfir/osint-mapper', Component: OsintMapper },
```

- [ ] **Step 3: Add the nav item** in `src/data/sidebar-nav.ts`, inside the DFIR "Reference" group `items` array (after the `Diamond` entry, line 156). `Map` is already imported (used by Kill Chain):

```ts
{ label: 'OSINT Mapper', href: '/dfir/osint-mapper', icon: Map },
```

- [ ] **Step 4: Verify typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/data/sidebar-nav.ts
git commit -m "feat(osint): register /dfir/osint-mapper route + nav"
```

---

## Task 13: Full verification

- [ ] **Step 1: All unit tests**

Run: `npx vitest run src/lib/dfir/osint/`
Expected: all suites PASS (schema, store, identifier-types, custom-icon, geocode).

- [ ] **Step 2: All three typecheck projects** (per repo footgun)

Run: `tsc -p tsconfig.json --noEmit && tsc -p api/tsconfig.json --noEmit && tsc -p api/tsconfig.worker.json --noEmit`
Expected: all clean.

- [ ] **Step 3: Production build** (confirms Leaflet/xyflow bundle correctly + lazy-split)

Run: `npm run build`
Expected: build succeeds; the OSM mapper chunk is separate (Leaflet not in the main chunk).

- [ ] **Step 4: Manual verification** (Leaflet/xyflow can't be meaningfully unit-tested in jsdom)

Run: `npm run dev`, open `/dfir/osint-mapper`, and confirm:

1. Map tab renders OSM tiles (no console CSP/COEP errors — this validates the `crossOrigin` fix and the CSP change).
2. Clicking the map reverse-geocodes and opens the pin form; saving drops a colored marker.
3. Add identifier (incl. a custom PNG icon) → appears as a node in the Graph tab.
4. Link an identifier to a pin in the pin form → selecting that identifier in Graph, switching to Map, highlights its pin.
5. Export → reload → Import the file → state restored. Reload without import → autosaved current project restored.
6. Upload an SVG as a custom icon → rejected with the error message.

- [ ] **Step 5: Final commit** (only if Step 4 surfaced fixes)

```bash
git add -A
git commit -m "fix(osint): manual-verification fixes"
```

---

## Self-Review notes (author)

- **Spec coverage:** map (T6/T9), self-contained store (T2), full catalog + custom icon (T3/T4/T10), route+nav (T12), CSP (T5), testing (T1-T4,T7,T13), security/raster-only (T4) — all covered. COEP footgun (not in spec, discovered during planning) handled in T9.
- **Type consistency:** `OsintProject/Identifier/Pin/Link` defined in T1 used verbatim throughout; `getIdentifierType` always returns a def (T3); store fns (`loadState/saveProject/serializeProject/parseImport`) consistent T2→T11.
- **Placeholders:** none — every code step is complete.
- **Open verification points flagged for the implementer:** exact `NodeProps` generic shape in @xyflow 12 (T8 — match RelationshipGraphCanvas), and whether to swap inline overlays for the `Modal` primitive (T10/T11).

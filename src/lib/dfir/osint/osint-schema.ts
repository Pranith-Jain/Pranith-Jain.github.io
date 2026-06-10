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

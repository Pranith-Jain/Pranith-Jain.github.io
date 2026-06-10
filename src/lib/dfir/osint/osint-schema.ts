// src/lib/dfir/osint/osint-schema.ts
export type IdentifierCategory = 'social' | 'contact' | 'personal' | 'vehicle' | 'other';

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

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
  id: string;
  schemaVersion: 1;
  name: string;
  identifiers: Identifier[];
  pins: Pin[];
  links: Link[];
  updatedAt: number;
}

export function emptyProject(name: string): OsintProject {
  return { id: crypto.randomUUID(), schemaVersion: 1, name, identifiers: [], pins: [], links: [], updatedAt: 0 };
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
    typeof p.color === 'string' &&
    HEX_COLOR.test(p.color)
  );
}

function isIdentifier(v: unknown): v is Identifier {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Record<string, unknown>;
  if (typeof i.id !== 'string' || typeof i.type !== 'string') return false;
  if (typeof i.fields !== 'object' || i.fields === null || Array.isArray(i.fields)) return false;
  return Object.values(i.fields as Record<string, unknown>).every((val) => typeof val === 'string');
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
    typeof p.id === 'string' &&
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

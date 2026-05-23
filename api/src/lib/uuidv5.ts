/**
 * RFC 4122 Section 4.3 — name-based UUID v5 (SHA-1).
 *
 * `uuidv5(name, namespace) → "xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx"`
 *
 * Returns the same UUID for the same (name, namespace) on every machine,
 * forever — this is what gives STIX object IDs across the platform their
 * stable, queryable identity. Two reports referencing the same indicator
 * (by value) emit the same `indicator--<uuid>`; two reports naming the
 * same actor (by canonical slug) emit the same `threat-actor--<uuid>`.
 *
 * Uses `crypto.subtle.digest('SHA-1', ...)` which is available in both
 * Cloudflare Workers (always) and the modern Node runtime (with nodejs_compat).
 * No third-party dependency.
 *
 * Namespace UUIDs are arbitrary but FIXED for the lifetime of the platform.
 * Changing one re-keys every derived ID — explicitly do not.
 */

const TEXT_ENCODER = new TextEncoder();

/** Fixed namespace for everything emitted by the intel-bundle pipeline. */
export const NS_INTEL_BUNDLE = '8c6c8b6c-2f5b-5e0e-9c4d-7e1d3a9b4f01';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/-/g, '');
  if (clean.length !== 32) throw new Error(`uuidv5: invalid namespace UUID '${hex}'`);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToUuid(b: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    // Non-null assertion: i is in bounds. Without it noUncheckedIndexedAccess
    // returns `number | undefined` from a Uint8Array indexed read.
    hex.push(b[i]!.toString(16).padStart(2, '0'));
  }
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

/**
 * Compute UUIDv5 for `name` within `namespace`. `namespace` must be a valid
 * UUID string (with or without dashes). Returns the canonical 8-4-4-4-12 form.
 */
export async function uuidv5(name: string, namespace: string = NS_INTEL_BUNDLE): Promise<string> {
  const nsBytes = hexToBytes(namespace);
  const nameBytes = TEXT_ENCODER.encode(name);

  // RFC 4122: SHA-1(namespace || name) → take first 16 bytes → set version & variant.
  const buf = new Uint8Array(nsBytes.length + nameBytes.length);
  buf.set(nsBytes, 0);
  buf.set(nameBytes, nsBytes.length);

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', buf));
  const out = digest.slice(0, 16);

  // Version 5 (name-based, SHA-1) — high nibble of byte 6 = 0x5.
  out[6] = (out[6]! & 0x0f) | 0x50;
  // RFC 4122 variant — high two bits of byte 8 = 0b10.
  out[8] = (out[8]! & 0x3f) | 0x80;

  return bytesToUuid(out);
}

/**
 * Convenience: derive a full STIX object ID for a given object type +
 * deterministic name input. Returns e.g. `indicator--<uuid>`.
 */
export async function stixId(type: string, name: string, namespace: string = NS_INTEL_BUNDLE): Promise<string> {
  return `${type}--${await uuidv5(name, namespace)}`;
}

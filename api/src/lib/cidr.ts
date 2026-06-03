/**
 * IPv4 CIDR helpers for blocklist membership checks.
 *
 * Several providers ship their feeds as CIDR ranges (e.g. `2.56.16.0/22`),
 * not bare IPs. Testing `set.has(ip)` against CIDR strings never matches — the
 * adapter must expand each CIDR to an integer range and test containment.
 */

/** Convert a dotted-quad IPv4 to a 32-bit unsigned int, or null if malformed. */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = parseInt(p, 10);
    if (isNaN(x) || x < 0 || x > 255 || !/^\d+$/.test(p)) return null;
    n = n * 256 + x;
  }
  return n >>> 0;
}

/** Expand `a.b.c.d/nn` to an inclusive [start, end] integer range, or null. */
export function cidrRange(cidr: string): [number, number] | null {
  const [ip, bitsStr] = cidr.split('/');
  if (!ip || bitsStr === undefined) {
    // A bare IP is a /32.
    const single = ipv4ToInt(cidr);
    return single === null ? null : [single, single];
  }
  const bits = parseInt(bitsStr, 10);
  const start = ipv4ToInt(ip);
  if (start === null || isNaN(bits) || bits < 0 || bits > 32) return null;
  const size = 2 ** (32 - bits);
  return [start, start + size - 1];
}

/**
 * Parse blocklist lines (CIDR or bare IP, one per line, `#` comments allowed)
 * into a sorted list of [start, end] ranges for fast containment checks.
 */
export function parseCidrRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith(';')) continue;
    const r = cidrRange(t);
    if (r) ranges.push(r);
  }
  return ranges;
}

/** True if `ip` (dotted-quad) falls inside any of the given ranges. */
export function ipv4InRanges(ip: string, ranges: Array<[number, number]>): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return ranges.some(([start, end]) => n >= start && n <= end);
}
